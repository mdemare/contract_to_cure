package store

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/mdemare/contract_to_cure/src/contract"
)

const fixtureRoot = "../../testdata/contract"

// fixtureSaves returns every JSON save in the contract fixtures: the starting
// states and each scenario's after.json.
func fixtureSaves(t *testing.T) map[string][]byte {
	t.Helper()
	saves := globFixtures(t, "states/*.json", "scenarios/*/after.json")
	if len(saves) < 40 {
		t.Fatalf("found only %d fixture saves", len(saves))
	}
	return saves
}

// legacyFixtureSaves returns the YAML saves (version 1) that are kept to pin
// that saves written before cc-490 still load. Each but legacy_save.yaml has
// a JSON twin.
func legacyFixtureSaves(t *testing.T) map[string][]byte {
	t.Helper()
	saves := globFixtures(t, "states/*.yaml")
	if _, ok := saves["states/legacy_save.yaml"]; !ok || len(saves) < 2 {
		t.Fatalf("legacy fixture saves missing: %d found", len(saves))
	}
	return saves
}

func globFixtures(t *testing.T, patterns ...string) map[string][]byte {
	t.Helper()
	saves := map[string][]byte{}
	for _, pattern := range patterns {
		paths, err := filepath.Glob(filepath.Join(fixtureRoot, pattern))
		if err != nil {
			t.Fatal(err)
		}
		for _, p := range paths {
			rel, _ := filepath.Rel(fixtureRoot, p)
			data, err := contract.ReadSave(fixtureRoot, rel)
			if err != nil {
				t.Fatal(err)
			}
			saves[rel] = data
		}
	}
	return saves
}

// game's TestFixtureSavesRoundTripThroughGameState repeats this through the
// game model (cc-421).
func TestFixtureSavesRoundTripByteForByte(t *testing.T) {
	for name, data := range fixtureSaves(t) {
		t.Run(name, func(t *testing.T) {
			save, err := DecodeSave(data, "heroic")
			if err != nil {
				t.Fatal(err)
			}
			got, err := save.EncodeSave()
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(got, data) {
				t.Fatalf("round trip differs:\n%s", firstDiff(string(data), string(got)))
			}
		})
	}
}

// A YAML save decodes to the same values as its JSON twin, so saving it again
// writes the twin.
func TestLegacyYAMLFixturesDecodeLikeTheirJSONTwins(t *testing.T) {
	for name, data := range legacyFixtureSaves(t) {
		if name == "states/legacy_save.yaml" {
			continue // gains defaults; see TestLegacySaveGetsDefaults
		}
		t.Run(name, func(t *testing.T) {
			twin := readFixture(t, strings.TrimSuffix(name, ".yaml")+".json")
			fromYAML, err := DecodeSave(data, "heroic")
			if err != nil {
				t.Fatal(err)
			}
			fromJSON, err := DecodeSave(twin, "heroic")
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(fromYAML, fromJSON) {
				t.Fatalf("YAML decodes differently:\n%+v\n%+v", fromYAML, fromJSON)
			}
			if got, _ := fromYAML.EncodeSave(); !bytes.Equal(got, twin) {
				t.Fatalf("re-encoded YAML save differs from its twin:\n%s", firstDiff(string(twin), string(got)))
			}
		})
	}
}

// legacy_save.yaml is base.yaml without forecast_active, forecast_cards,
// operations_expert_move_used and difficulty_level. Saving it again adds them,
// with the configured default difficulty, and writes JSON (move_legacy_save).
func TestLegacySaveGetsDefaults(t *testing.T) {
	legacy := readFixture(t, "states/legacy_save.yaml")
	base := readFixture(t, "states/base.json")

	save, err := DecodeSave(legacy, "heroic")
	if err != nil {
		t.Fatal(err)
	}
	if save.Status.ForecastActive || save.Status.ForecastCards != nil || save.Status.OperationsExpertMoveUsed {
		t.Fatalf("legacy defaults not applied: %+v", save.Status)
	}
	got, _ := save.EncodeSave()
	want := strings.Replace(string(base), `"difficulty_level": "normal"`, `"difficulty_level": "heroic"`, 1)
	if string(got) != want {
		t.Fatalf("legacy save re-encoded:\n%s", firstDiff(want, string(got)))
	}

	save, _ = DecodeSave(legacy, "introductory")
	if save.Status.DifficultyLevel != "introductory" {
		t.Errorf("configured default not used: %q", save.Status.DifficultyLevel)
	}
	save, _ = DecodeSave(legacy, "impossible")
	if save.Status.DifficultyLevel != "heroic" {
		t.Errorf("invalid configured default should fall back to heroic, got %q", save.Status.DifficultyLevel)
	}
}

func TestInvalidDifficultyFallsBackToDefault(t *testing.T) {
	data := strings.Replace(string(readFixture(t, "states/base.json")),
		`"difficulty_level": "normal"`, `"difficulty_level": "nightmare"`, 1)
	save, err := DecodeSave([]byte(data), "introductory")
	if err != nil {
		t.Fatal(err)
	}
	if save.Status.DifficultyLevel != "introductory" {
		t.Fatalf("difficulty = %q, want introductory", save.Status.DifficultyLevel)
	}
}

func TestRetrievedFlag(t *testing.T) {
	data := readFixture(t, "states/contingency_planner_retrieved.json")
	save, err := DecodeSave(data, "heroic")
	if err != nil {
		t.Fatal(err)
	}
	retrieved := 0
	for _, p := range save.Players {
		for _, c := range p.Hand {
			if c.Retrieved {
				retrieved++
			}
		}
	}
	if retrieved != 1 {
		t.Fatalf("retrieved cards = %d, want 1", retrieved)
	}

	bad := strings.Replace(string(data), `"retrieved": true`, `"retrieved": "yes please"`, 1)
	if _, err := DecodeSave([]byte(bad), "heroic"); err == nil {
		t.Fatal("a retrieved value other than true/false must not load")
	}
}

// Rails ignores the saved "eradicated" and "available" values and recomputes them.
func TestDerivedValuesAreRecomputed(t *testing.T) {
	base := readFixture(t, "states/base.json")
	tampered := strings.Replace(string(base), `"available": 5`, `"available": 1`, 1)
	tampered = strings.Replace(tampered, `"eradicated": false`, `"eradicated": true`, 1)
	save, err := DecodeSave([]byte(tampered), "heroic")
	if err != nil {
		t.Fatal(err)
	}
	got, _ := save.EncodeSave()
	if !bytes.Equal(got, base) {
		t.Fatalf("derived values not recomputed:\n%s", firstDiff(string(base), string(got)))
	}

	save.DiseaseCubes[0] = DiseaseCubes{Color: "blue", Cured: true, InSupply: 24}
	got, _ = save.EncodeSave()
	if !strings.Contains(string(got), `"blue": {
      "cured": true,
      "eradicated": true,`) {
		t.Fatal("a cured color with all cubes in supply should be eradicated")
	}
}

// YAML saves are still read, so they are checked like JSON ones
// (TestUndecodableJSONSavesAreErrors).
func TestUndecodableYAMLSavesAreErrors(t *testing.T) {
	base := string(readFixture(t, "states/base.yaml"))
	pending := string(readFixture(t, "states/pending_discard.yaml"))
	cases := map[string]string{
		"not yaml":         "---\n:game_status: [\n",
		"marshal":          "\x04\bo:\x0eGameState\x00",
		"not a hash":       "--- just a string\n",
		"missing decks":    base[:strings.Index(base, ":decks:")],
		"too many cubes":   strings.Replace(base, ":disease_cubes: 3", ":disease_cubes: 4", 1),
		"turn not integer": strings.Replace(base, ":turn: 1", ":turn: one", 1),
		// Rails left current_player nil or wrapped it (cc-439).
		"current player past the end": strings.Replace(base, ":current_player_idx: 0", ":current_player_idx: 4", 1),
		"negative current player":     strings.Replace(base, ":current_player_idx: 0", ":current_player_idx: -1", 1),
		// Rails indexed @players with it and failed later (cc-444).
		"pending discard player past the end": strings.Replace(pending, ":player_index: 1", ":player_index: 4", 1),
		"negative pending discard player":     strings.Replace(pending, ":player_index: 1", ":player_index: -1", 1),
	}
	for name, data := range cases {
		if _, err := DecodeSave([]byte(data), "heroic"); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func readFixture(t *testing.T, rel string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(fixtureRoot, rel))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func firstDiff(want, got string) string {
	w, g := strings.Split(want, "\n"), strings.Split(got, "\n")
	for i := 0; i < len(w) || i < len(g); i++ {
		var wl, gl string
		if i < len(w) {
			wl = w[i]
		}
		if i < len(g) {
			gl = g[i]
		}
		if wl != gl {
			return fmt.Sprintf("line %d:\n  want %q\n  got  %q", i+1, wl, gl)
		}
	}
	return "(no line differs)"
}
