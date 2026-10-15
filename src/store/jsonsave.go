package store

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
)

// The save is moving from Ruby/Psych YAML (version 1, no stamp) to versioned
// JSON (cc-487): {"version": 2, "game_status": {...}, ...}, with the same
// fields and layout as the YAML, in the same order. The move is expand, then
// contract: this release reads both formats but still writes YAML, so a
// rollback to the previous release keeps the live game. Writing JSON comes in
// a later release, once every running release can read it.
//
// A JSON save is parsed into the same value tree as the YAML and decoded by
// the same decoder, so both formats get the same defaults and checks. JSON has
// no symbols: object keys stand in for Ruby's symbol keys, and symbol values
// (roles, colors, card types) are plain strings, which the decoder accepts.

// JSONSaveVersion is the "version" stamp of a JSON save.
const JSONSaveVersion = 2

// isJSONSave reports whether data looks like a JSON save rather than YAML,
// which Psych always starts with "---".
func isJSONSave(data []byte) bool {
	trimmed := bytes.TrimLeft(data, " \t\r\n")
	return len(trimmed) > 0 && trimmed[0] == '{'
}

// parseJSONSave parses a JSON save and checks its version stamp.
func parseJSONSave(data []byte) (value, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	root, err := convertJSON(dec, 0)
	if err != nil {
		return value{}, fmt.Errorf("JSON save: %w", err)
	}
	if _, err := dec.Token(); err != io.EOF {
		return value{}, errors.New("JSON save: unexpected data after the save")
	}
	v, ok := root.get("version")
	if !ok || v.kind != kindInt {
		return value{}, errors.New("JSON save: missing version")
	}
	if v.i != JSONSaveVersion {
		return value{}, fmt.Errorf("JSON save: unsupported version %d", v.i)
	}
	return root, nil
}

// convertJSON reads the next JSON value from dec, keeping object keys in
// document order. Keys become symbols, like the keys of a Rails save.
func convertJSON(dec *json.Decoder, depth int) (value, error) {
	if depth > 64 {
		return value{}, errors.New("nested too deeply")
	}
	tok, err := dec.Token()
	if err != nil {
		return value{}, err
	}
	switch t := tok.(type) {
	case nil:
		return nilValue(), nil
	case bool:
		return boolValue(t), nil
	case string:
		return stringValue(t), nil
	case json.Number:
		i, err := strconv.ParseInt(string(t), 10, 0)
		if err != nil {
			return value{}, fmt.Errorf("%s is not an integer", t)
		}
		return intValue(int(i)), nil
	case json.Delim:
		if t == '[' {
			v := seqValue([]value{})
			for dec.More() {
				item, err := convertJSON(dec, depth+1)
				if err != nil {
					return value{}, err
				}
				v.items = append(v.items, item)
			}
			_, err := dec.Token() // ']'
			return v, err
		}
		v := mapValue()
		for dec.More() {
			key, err := dec.Token()
			if err != nil {
				return value{}, err
			}
			val, err := convertJSON(dec, depth+1)
			if err != nil {
				return value{}, err
			}
			v.pairs = append(v.pairs, symPair(key.(string), val))
		}
		_, err := dec.Token() // '}'
		return v, err
	}
	return value{}, fmt.Errorf("unexpected JSON token %v", tok)
}

// EncodeJSONSave writes the save as versioned JSON, indented by two spaces.
// Nothing writes it to Redis yet (see the top of this file).
func (s *Save) EncodeJSONSave() ([]byte, error) {
	if len(s.DiseaseCubes) != len(Colors) {
		return nil, fmt.Errorf("save has %d disease colors, want %d", len(s.DiseaseCubes), len(Colors))
	}
	v := s.value()
	v.pairs = append([]pair{symPair("version", intValue(JSONSaveVersion))}, v.pairs...)
	var compact bytes.Buffer
	if err := emitJSON(&compact, v); err != nil {
		return nil, err
	}
	var out bytes.Buffer
	if err := json.Indent(&out, compact.Bytes(), "", "  "); err != nil {
		return nil, err
	}
	out.WriteByte('\n')
	return out.Bytes(), nil
}

// emitJSON writes v as compact JSON, keeping map pairs in order. Symbols are
// written as strings.
func emitJSON(buf *bytes.Buffer, v value) error {
	switch v.kind {
	case kindNil:
		buf.WriteString("null")
	case kindBool:
		buf.WriteString(strconv.FormatBool(v.b))
	case kindInt:
		buf.WriteString(strconv.Itoa(v.i))
	case kindString, kindSymbol:
		return emitJSONString(buf, v.s)
	case kindSeq:
		buf.WriteByte('[')
		for i, item := range v.items {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := emitJSON(buf, item); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
	case kindMap:
		buf.WriteByte('{')
		for i, p := range v.pairs {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := emitJSONString(buf, p.key.s); err != nil {
				return err
			}
			buf.WriteByte(':')
			if err := emitJSON(buf, p.val); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
	}
	return nil
}

func emitJSONString(buf *bytes.Buffer, s string) error {
	enc := json.NewEncoder(buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(s); err != nil {
		return err
	}
	buf.Truncate(buf.Len() - 1) // Encode's trailing newline
	return nil
}
