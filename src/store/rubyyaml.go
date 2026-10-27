package store

import (
	"fmt"
	"strconv"
	"strings"

	"go.yaml.in/yaml/v3"
)

// Saves before cc-490 were Ruby/Psych YAML (Hash#to_yaml), with Ruby
// symbols for keys and some values: ":game_status:" and ":city". This file
// decodes that subset of YAML into a small tree that keeps symbols apart from
// strings, so those saves still load (cc-376). Saves are now written as
// versioned JSON (jsonsave.go), which is parsed into the same tree. The
// parser can go once no YAML save needs reading.

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
