package store

import (
	"bytes"
	"context"
	"flag"
	"os"
	"reflect"
	"strings"
	"testing"
)

var updateGolden = flag.Bool("update", false, "rewrite testdata/base.v2.json")

const jsonGolden = "testdata/base.v2.json"

// yamlToJSON converts a YAML save to a JSON save node by node, without going
// through Save, so tests can feed DecodeSave JSON that EncodeJSONSave would
// never write (missing fields, bad values).
func yamlToJSON(t *testing.T, yaml string) []byte {
	t.Helper()
	root, err := parseRubyYAML([]byte(yaml))
	if err != nil {
		t.Fatal(err)
	}
	root.pairs = append([]pair{symPair("version", intValue(JSONSaveVersion))}, root.pairs...)
	var buf bytes.Buffer
	if err := emitJSON(&buf, root); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// Every fixture save survives YAML -> JSON -> YAML unchanged.
func TestFixtureSavesRoundTripThroughJSON(t *testing.T) {
	for name, data := range fixtureSaves(t) {
		t.Run(name, func(t *testing.T) {
			fromYAML, err := DecodeSave(data, "heroic")
			if err != nil {
				t.Fatal(err)
			}
			encoded, err := fromYAML.EncodeJSONSave()
			if err != nil {
				t.Fatal(err)
			}
			fromJSON, err := DecodeSave(encoded, "introductory")
			if err != nil {
				t.Fatalf("%v\n%s", err, encoded)
			}
			if !reflect.DeepEqual(fromJSON, fromYAML) {
				t.Fatalf("JSON decodes differently:\n%+v\n%+v", fromJSON, fromYAML)
			}
			want, _ := fromYAML.EncodeSave()
			got, _ := fromJSON.EncodeSave()
			if !bytes.Equal(got, want) {
				t.Fatalf("YAML after JSON differs:\n%s", firstDiff(string(want), string(got)))
			}
		})
	}
}

// The JSON format is pinned before anything writes it, so the release that
// starts writing it writes what this release reads. Run with -update to
// regenerate after an intended change.
func TestJSONSaveFormat(t *testing.T) {
	save, err := DecodeSave(readFixture(t, "states/base.yaml"), "heroic")
	if err != nil {
		t.Fatal(err)
	}
	got, err := save.EncodeJSONSave()
	if err != nil {
		t.Fatal(err)
	}
	if *updateGolden {
		if err := os.WriteFile(jsonGolden, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(jsonGolden)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("JSON save differs from %s:\n%s", jsonGolden, firstDiff(string(want), string(got)))
	}
	if !bytes.HasPrefix(want, []byte("{\n  \"version\": 2,\n  \"game_status\": {\n")) {
		t.Fatalf("JSON save should start with its version:\n%.80s", want)
	}
}

// A JSON save without forecast_active, forecast_cards,
// operations_expert_move_used and difficulty_level gets the same defaults as
// a legacy YAML save.
func TestLegacyJSONSaveGetsDefaults(t *testing.T) {
	legacy := readFixture(t, "states/legacy_save.yaml")
	want, err := DecodeSave(legacy, "introductory")
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeSave(yamlToJSON(t, string(legacy)), "introductory")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("legacy JSON:\n%+v\nwant\n%+v", got, want)
	}
}

func TestUndecodableJSONSavesAreErrors(t *testing.T) {
	base := string(readFixture(t, "states/base.yaml"))
	pending := string(readFixture(t, "states/pending_discard.yaml"))
	valid := string(yamlToJSON(t, base))
	cases := map[string]string{
		"not json":         `{"version": 2, "game_status": [`,
		"trailing data":    valid + "{}",
		"no version":       strings.Replace(valid, `"version":2,`, ``, 1),
		"version 1":        strings.Replace(valid, `"version":2`, `"version":1`, 1),
		"version 3":        strings.Replace(valid, `"version":2`, `"version":3`, 1),
		"string version":   strings.Replace(valid, `"version":2`, `"version":"2"`, 1),
		"fractional turn":  strings.Replace(valid, `"turn":1`, `"turn":1.5`, 1),
		"missing decks":    string(yamlToJSON(t, base[:strings.Index(base, ":decks:")])),
		"too many cubes":   string(yamlToJSON(t, strings.Replace(base, ":disease_cubes: 3", ":disease_cubes: 4", 1))),
		"turn not integer": string(yamlToJSON(t, strings.Replace(base, ":turn: 1", ":turn: one", 1))),
		"current player past the end": string(yamlToJSON(t,
			strings.Replace(base, ":current_player_idx: 0", ":current_player_idx: 4", 1))),
		"pending discard player past the end": string(yamlToJSON(t,
			strings.Replace(pending, ":player_index: 1", ":player_index: 4", 1))),
	}
	if _, err := DecodeSave([]byte(valid), "heroic"); err != nil {
		t.Fatalf("the valid JSON save does not decode: %v", err)
	}
	for name, data := range cases {
		if data == valid {
			t.Errorf("%s: the case does not change the save", name)
		}
		if _, err := DecodeSave([]byte(data), "heroic"); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

// Until the release that writes JSON, a JSON save is read and the next write
// turns it back into YAML.
func TestStoreLoadsJSONSaveAndWritesYAML(t *testing.T) {
	s, mr := newTestStore(t)
	base := readFixture(t, "states/base.yaml")
	mr.Set(testKey, string(yamlToJSON(t, string(base))))

	game := load(t, s)
	if err := s.Save(context.Background(), game); err != nil {
		t.Fatal(err)
	}
	if got := stored(t, mr); got != string(base) {
		t.Fatalf("stored save is not the YAML:\n%s", firstDiff(string(base), got))
	}
}
