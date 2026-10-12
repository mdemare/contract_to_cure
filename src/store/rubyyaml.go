package store

import (
	"bytes"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"go.yaml.in/yaml/v3"
)

// The saves are written by Ruby's Psych (Hash#to_yaml), so they use Ruby
// symbols for keys and some values: ":game_status:" and ":city". This file
// decodes that subset of YAML into a small tree that keeps symbols apart from
// strings, and emits a tree the way Psych does, so Rails and Go can read each
// other's saves byte for byte (cc-376).

type kind int

const (
	kindNil kind = iota
	kindBool
	kindInt
	kindString
	kindSymbol
	kindMap
	kindSeq
)

// value is one node of a decoded Ruby YAML document.
type value struct {
	kind  kind
	b     bool
	i     int
	s     string // string contents, or the symbol name without the colon
	pairs []pair // kindMap, in document order
	items []value
}

type pair struct {
	key value
	val value
}

func nilValue() value              { return value{kind: kindNil} }
func boolValue(b bool) value       { return value{kind: kindBool, b: b} }
func intValue(i int) value         { return value{kind: kindInt, i: i} }
func stringValue(s string) value   { return value{kind: kindString, s: s} }
func symbolValue(s string) value   { return value{kind: kindSymbol, s: s} }
func mapValue(p ...pair) value     { return value{kind: kindMap, pairs: p} }
func seqValue(items []value) value { return value{kind: kindSeq, items: items} }

// symPair is a pair with a symbol key, the common case in saves.
func symPair(key string, val value) pair { return pair{key: symbolValue(key), val: val} }

// get returns the value for a symbol key and whether it was present.
func (v value) get(key string) (value, bool) {
	for _, p := range v.pairs {
		if p.key.kind == kindSymbol && p.key.s == key {
			return p.val, true
		}
	}
	return value{}, false
}

func parseRubyYAML(data []byte) (value, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return value{}, err
	}
	if doc.Kind != yaml.DocumentNode || len(doc.Content) != 1 {
		return value{}, fmt.Errorf("expected one YAML document")
	}
	return convertNode(doc.Content[0], 0)
}

func convertNode(n *yaml.Node, depth int) (value, error) {
	if depth > 64 {
		return value{}, fmt.Errorf("YAML nested too deeply")
	}
	switch n.Kind {
	case yaml.AliasNode:
		return convertNode(n.Alias, depth+1)
	case yaml.MappingNode:
		v := value{kind: kindMap}
		for i := 0; i+1 < len(n.Content); i += 2 {
			k, err := convertNode(n.Content[i], depth+1)
			if err != nil {
				return value{}, err
			}
			val, err := convertNode(n.Content[i+1], depth+1)
			if err != nil {
				return value{}, err
			}
			v.pairs = append(v.pairs, pair{key: k, val: val})
		}
		return v, nil
	case yaml.SequenceNode:
		v := value{kind: kindSeq, items: []value{}}
		for _, c := range n.Content {
			item, err := convertNode(c, depth+1)
			if err != nil {
				return value{}, err
			}
			v.items = append(v.items, item)
		}
		return v, nil
	case yaml.ScalarNode:
		return convertScalar(n)
	}
	return value{}, fmt.Errorf("unsupported YAML node at line %d", n.Line)
}

func convertScalar(n *yaml.Node) (value, error) {
	switch n.Tag {
	case "!ruby/symbol", "!ruby/sym":
		return symbolValue(n.Value), nil
	case "!!str", "!":
		if n.Style == 0 && n.Tag == "!!str" && len(n.Value) > 1 && n.Value[0] == ':' {
			return symbolValue(n.Value[1:]), nil
		}
		return stringValue(n.Value), nil
	case "!!null":
		return nilValue(), nil
	case "!!bool":
		return boolValue(n.Value == "true"), nil
	case "!!int":
		i, err := strconv.ParseInt(strings.ReplaceAll(n.Value, "_", ""), 0, 0)
		if err != nil {
			return value{}, fmt.Errorf("line %d: %w", n.Line, err)
		}
		return intValue(int(i)), nil
	}
	return value{}, fmt.Errorf("line %d: unsupported YAML tag %s", n.Line, n.Tag)
}

// emitRubyYAML writes v the way Psych's Hash#to_yaml does: a "---" header,
// two-space indentation, sequences at the same indentation as their key, and
// empty values left blank.
func emitRubyYAML(v value) []byte {
	var buf bytes.Buffer
	buf.WriteString("---")
	switch {
	case v.kind == kindMap && len(v.pairs) > 0, v.kind == kindSeq && len(v.items) > 0:
		buf.WriteByte('\n')
		emitBlock(&buf, v, 0, false)
	default:
		buf.WriteByte(' ')
		buf.WriteString(scalarText(v))
		buf.WriteByte('\n')
	}
	return buf.Bytes()
}

// emitBlock writes a non-empty mapping or sequence at indent. With inline set,
// the first line continues the current one (a mapping right after "- ").
func emitBlock(buf *bytes.Buffer, v value, indent int, inline bool) {
	pad := strings.Repeat(" ", indent)
	if v.kind == kindMap {
		for i, p := range v.pairs {
			if i > 0 || !inline {
				buf.WriteString(pad)
			}
			buf.WriteString(scalarText(p.key))
			buf.WriteByte(':')
			emitValue(buf, p.val, indent, true)
		}
		return
	}
	for _, item := range v.items {
		buf.WriteString(pad)
		buf.WriteByte('-')
		emitValue(buf, item, indent, false)
	}
}

// emitValue writes what follows "key:" or "-". Mapping values nest two spaces
// deeper, except sequences, which Psych keeps at the key's indentation.
// Sequence items that are mappings start on the dash's line. Nil is blank.
func emitValue(buf *bytes.Buffer, v value, indent int, inMap bool) {
	switch {
	case v.kind == kindNil:
		buf.WriteByte('\n')
	case v.kind == kindMap && len(v.pairs) > 0 && inMap:
		buf.WriteByte('\n')
		emitBlock(buf, v, indent+2, false)
	case v.kind == kindMap && len(v.pairs) > 0:
		buf.WriteByte(' ')
		emitBlock(buf, v, indent+2, true)
	case v.kind == kindSeq && len(v.items) > 0 && inMap:
		buf.WriteByte('\n')
		emitBlock(buf, v, indent, false)
	case v.kind == kindSeq && len(v.items) > 0:
		buf.WriteByte('\n')
		emitBlock(buf, v, indent+2, false)
	default:
		buf.WriteByte(' ')
		buf.WriteString(scalarText(v))
		buf.WriteByte('\n')
	}
}

func scalarText(v value) string {
	switch v.kind {
	case kindNil:
		return ""
	case kindBool:
		return strconv.FormatBool(v.b)
	case kindInt:
		return strconv.Itoa(v.i)
	case kindSymbol:
		if plainSymbol.MatchString(v.s) {
			return ":" + v.s
		}
		// A quoted ":name" would read back as a string, so use the explicit tag.
		return "!ruby/symbol " + quoteString(v.s, false)
	case kindString:
		return stringText(v.s)
	case kindMap:
		return "{}"
	case kindSeq:
		return "[]"
	}
	return ""
}

var (
	plainSymbol = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*[?!]?$`)
	// Plain scalars that YAML 1.1 (Psych) would read as something other than a
	// string: booleans, null, numbers, times and symbols.
	nonStringScalar = regexp.MustCompile(`^(?i:y|n|yes|no|true|false|on|off|null|~)$|` +
		`^[-+]?[0-9][0-9_,.:eE+-]*$|^[-+]?\.(?i:inf|nan)$|^\.(?i:nan)$|^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|^:`)
)

// stringText follows Psych's choice of style (Psych::Visitors::YAMLTree
// #visit_String): "y" and "n", and strings that start with a non-word
// character, are double-quoted; strings that would read back as another type
// are single-quoted; anything libyaml cannot write plain is quoted too.
// Multi-line strings are double-quoted where Psych writes a literal block;
// both read back the same.
func stringText(s string) string {
	switch {
	case strings.Contains(strings.TrimSuffix(s, "\n"), "\n"):
		return quoteString(s, true)
	case s == "y" || s == "Y" || s == "n" || s == "N":
		return quoteString(s, true)
	case startsWithNonWord.MatchString(s) && !strings.Contains(s, `"`):
		return quoteString(s, true)
	case s == "" || nonStringScalar.MatchString(s) || !plainSafe(s):
		return quoteString(s, false)
	}
	return s
}

var startsWithNonWord = regexp.MustCompile(`^[^\p{L}\p{M}\p{Nd}\p{Pc}]`)

// plainSafe reports whether libyaml can write s as a plain scalar.
func plainSafe(s string) bool {
	if strings.TrimSpace(s) != s || strings.ContainsAny(s[:1], "-?:,[]{}#&*!|>'\"%@`") {
		return false
	}
	if strings.Contains(s, ": ") || strings.Contains(s, " #") || strings.HasSuffix(s, ":") {
		return false
	}
	for _, r := range s {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}

func quoteString(s string, double bool) string {
	if double || strings.ContainsFunc(s, func(r rune) bool { return r < 0x20 || r == 0x7f }) {
		return strconv.Quote(s)
	}
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
