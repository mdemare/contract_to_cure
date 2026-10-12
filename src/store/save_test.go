package store

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mdemare/contract_to_cure/src/contract"
)

const fixtureRoot = "../../testdata/contract"

// fixtureSaves returns every save in the contract fixtures: the starting
// states and each scenario's after.yaml.
func fixtureSaves(t *testing.T) map[string][]byte {
	t.Helper()
	paths, err := filepath.Glob(filepath.Join(fixtureRoot, "states", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	after, err := filepath.Glob(filepath.Join(fixtureRoot, "scenarios", "*", "after.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	saves := map[string][]byte{}
	for _, p := range append(paths, after...) {
		rel, _ := filepath.Rel(fixtureRoot, p)
		data, err := contract.ReadSave(fixtureRoot, rel)
		if err != nil {
			t.Fatal(err)
		}
		saves[rel] = data
	}
	if len(saves) < 40 {
		t.Fatalf("found only %d fixture saves", len(saves))
	}
	return saves
}

func TestFixtureSavesRoundTripByteForByte(t *testing.T) {
	for name, data := range fixtureSaves(t) {
		if name == "states/legacy_save.yaml" {
			continue // gains defaults; see TestLegacySave
		}
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

// legacy_save.yaml is base.yaml without forecast_active, forecast_cards,
// operations_expert_move_used and difficulty_level. Saving it again adds them,
// with the configured default difficulty (move_legacy_save).
func TestLegacySaveGetsDefaults(t *testing.T) {
	legacy := readFixture(t, "states/legacy_save.yaml")
	base := readFixture(t, "states/base.yaml")

	save, err := DecodeSave(legacy, "heroic")
	if err != nil {
		t.Fatal(err)
	}
	if save.Status.ForecastActive || save.Status.ForecastCards != nil || save.Status.OperationsExpertMoveUsed {
		t.Fatalf("legacy defaults not applied: %+v", save.Status)
	}
	got, _ := save.EncodeSave()
	want := strings.Replace(string(base), ":difficulty_level: normal", ":difficulty_level: heroic", 1)
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
	data := strings.Replace(string(readFixture(t, "states/base.yaml")),
		":difficulty_level: normal", ":difficulty_level: nightmare", 1)
	save, err := DecodeSave([]byte(data), "introductory")
	if err != nil {
		t.Fatal(err)
	}
	if save.Status.DifficultyLevel != "introductory" {
		t.Fatalf("difficulty = %q, want introductory", save.Status.DifficultyLevel)
	}
}

func TestRetrievedFlag(t *testing.T) {
	data := readFixture(t, "states/contingency_planner_retrieved.yaml")
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

	bad := strings.Replace(string(data), ":retrieved: true", ":retrieved: yes please", 1)
	if _, err := DecodeSave([]byte(bad), "heroic"); err == nil {
		t.Fatal("a retrieved value other than true/false must not load")
	}
}

// Rails ignores the saved "eradicated" and "available" values and recomputes them.
func TestDerivedValuesAreRecomputed(t *testing.T) {
	base := readFixture(t, "states/base.yaml")
	tampered := strings.Replace(string(base), ":available: 5", ":available: 1", 1)
	tampered = strings.Replace(tampered, ":eradicated: false", ":eradicated: true", 1)
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
	if !strings.Contains(string(got), ":blue:\n    :cured: true\n    :eradicated: true\n") {
		t.Fatal("a cured color with all cubes in supply should be eradicated")
	}
}

func TestUndecodableSavesAreErrors(t *testing.T) {
	base := string(readFixture(t, "states/base.yaml"))
	cases := map[string]string{
		"not yaml":         "---\n:game_status: [\n",
		"marshal":          "\x04\bo:\x0eGameState\x00",
		"not a hash":       "--- just a string\n",
		"missing decks":    base[:strings.Index(base, ":decks:")],
		"too many cubes":   strings.Replace(base, ":disease_cubes: 3", ":disease_cubes: 4", 1),
		"turn not integer": strings.Replace(base, ":turn: 1", ":turn: one", 1),
	}
	for name, data := range cases {
		if _, err := DecodeSave([]byte(data), "heroic"); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestStringQuoting(t *testing.T) {
	// Expected values are what Ruby's Psych writes, except the multi-line
	// string, which Psych writes as a literal block.
	cases := map[string]string{
		"Paris":          "Paris",
		"St. Petersburg": "St. Petersburg",
		"":               "''",
		"true":           "'true'",
		"no":             "'no'",
		"y":              `"y"`,
		"123":            "'123'",
		"1_000":          "'1_000'",
		"2026-10-13":     "'2026-10-13'",
		":red":           `":red"`,
		"a: b":           "'a: b'",
		"a #b":           "'a #b'",
		"x:":             "'x:'",
		"it's":           "it's",
		"- x":            `"- x"`,
		" padded":        `" padded"`,
		"line\nbreak":    `"line\nbreak"`,
	}
	for in, want := range cases {
		if got := scalarText(stringValue(in)); got != want {
			t.Errorf("%q: got %s, want %s", in, got, want)
		}
		// Whatever is emitted must read back as the same string.
		v, err := parseRubyYAML([]byte("--- " + scalarText(stringValue(in)) + "\n"))
		if err != nil || v.kind != kindString || v.s != in {
			t.Errorf("%q does not read back as a string: %+v %v", in, v, err)
		}
	}
	for _, sym := range []string{"no_player_cards", "two words"} {
		v, err := parseRubyYAML([]byte("--- " + scalarText(symbolValue(sym)) + "\n"))
		if err != nil || v.kind != kindSymbol || v.s != sym {
			t.Errorf("symbol %q does not read back as a symbol: %+v %v", sym, v, err)
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
