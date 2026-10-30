package game_test

import (
	"bytes"
	"context"
	"log/slog"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"github.com/mdemare/contract_to_cure/src/game"
	"github.com/mdemare/contract_to_cure/src/store"
)

const testKey = "contract-to-cure/test-game"

func encode(t *testing.T, g *game.GameState) []byte {
	t.Helper()
	data, err := g.EncodeSave()
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// newTestStore returns a store on a fresh miniredis whose key holds save, or
// no key when save is nil.
func newTestStore(t *testing.T, save []byte) (*store.Store, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { client.Close() })
	if save != nil {
		if err := mr.Set(testKey, string(save)); err != nil {
			t.Fatal(err)
		}
	}
	return store.NewWithClient(client, testKey, string(game.DefaultDifficulty)), mr
}

func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

func loadGame(ctx context.Context, t *testing.T, st *store.Store) *game.GameState {
	t.Helper()
	g, err := game.Load(ctx, st, loadMap(t), game.DefaultPlayers, game.DefaultDifficulty, seeded(1))
	if err != nil {
		t.Fatal(err)
	}
	return g
}

// Every JSON fixture save, the starting states and each scenario's
// after.json, survives decode -> GameState -> encode byte for byte. This
// extends store's TestFixtureSavesRoundTripByteForByte through the model; it
// lives here because store cannot import game.
func TestFixtureSavesRoundTripThroughGameState(t *testing.T) {
	if testing.Short() {
		t.Skip("slow integration test; run make full-check")
	}

	after, err := filepath.Glob(filepath.Join(fixtureRoot, "scenarios", "*", "after.json"))
	if err != nil {
		t.Fatal(err)
	}
	names := fixtureStates(t)
	for _, p := range after {
		rel, _ := filepath.Rel(fixtureRoot, p)
		names = append(names, rel)
	}
	if len(names) < 40 {
		t.Fatalf("found only %d fixture saves", len(names))
	}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			data := readFixture(t, name)
			if got := encode(t, decodeFixture(t, data)); !bytes.Equal(got, data) {
				t.Errorf("round trip differs:\n%s", got)
			}
		})
	}
}

// Saves from before forecast and difficulty were stored load with false/nil
// defaults and difficulty heroic. Loading does not write them; the next
// mutating request does, as JSON.
func TestLegacySaveLoadsWithDefaults(t *testing.T) {
	legacy := readFixture(t, "states/legacy_save.yaml")
	st, mr := newTestStore(t, legacy)
	ctx := context.Background()

	err := st.AtomicUpdate(ctx, func(ctx context.Context) error {
		g := loadGame(ctx, t, st)
		if g.ForecastActive || g.ForecastCards != nil || g.OperationsExpertMoveUsed || g.DifficultyLevel != game.Heroic {
			t.Errorf("legacy defaults not applied: %+v", g)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := mr.Get(testKey); got != string(legacy) {
		t.Fatal("a read-only request rewrote the legacy save")
	}

	err = st.AtomicUpdate(ctx, func(ctx context.Context) error {
		return st.Save(ctx, loadGame(ctx, t, st))
	})
	if err != nil {
		t.Fatal(err)
	}
	want := strings.Replace(string(readFixture(t, "states/base.json")),
		`"difficulty_level": "normal"`, `"difficulty_level": "heroic"`, 1)
	if got, _ := mr.Get(testKey); got != want {
		t.Fatalf("saved legacy game:\n%s", got)
	}
}

func TestFromSaveRecomputesDerivedValues(t *testing.T) {
	g := decodeFixture(t, readFixture(t, "states/base.json"))
	if g.PlayersCount() != len(g.Players) || g.CurrentPlayer() != &g.Players[g.CurrentPlayerIdx] {
		t.Fatal("players count or current player does not follow the players")
	}
}

func TestFromSaveRejectsIllegalCubes(t *testing.T) {
	save, err := store.DecodeSave(readFixture(t, "states/base.json"), "heroic")
	if err != nil {
		t.Fatal(err)
	}
	save.Cities[0].DiseaseCubes = 4
	if _, err := game.FromSave(save); err == nil {
		t.Fatal("a city with 4 cubes must not load")
	}
}

// FromSave also guards saves built in code, since CurrentPlayer indexes
// Players directly (cc-439).
func TestFromSaveRejectsOutOfRangeCurrentPlayer(t *testing.T) {
	for _, idx := range []int{-1, 4} {
		save, err := store.DecodeSave(readFixture(t, "states/base.json"), "heroic")
		if err != nil {
			t.Fatal(err)
		}
		save.Status.CurrentPlayerIdx = idx
		if _, err := game.FromSave(save); err == nil {
			t.Errorf("current_player_idx %d of 4 players must not load", idx)
		}
	}
}

// The pending discard's player is indexed the same way (cc-444).
func TestFromSaveRejectsOutOfRangePendingHandLimitPlayer(t *testing.T) {
	for _, idx := range []int{-1, 4} {
		save, err := store.DecodeSave(readFixture(t, "states/pending_discard.json"), "heroic")
		if err != nil {
			t.Fatal(err)
		}
		save.Status.PendingHandLimit.PlayerIndex = idx
		if _, err := game.FromSave(save); err == nil {
			t.Errorf("pending_hand_limit player_index %d of 4 players must not load", idx)
		}
	}
}

// With no save, or one that cannot be decoded, Load deals a new game with the
// configured players and difficulty, logs it and saves it at commit.
func TestLoadStartsNewGame(t *testing.T) {
	badPlayer := strings.Replace(string(readFixture(t, "states/base.json")),
		`"current_player_idx": 0`, `"current_player_idx": 4`, 1)
	badPending := strings.Replace(string(readFixture(t, "states/pending_discard.json")),
		`"player_index": 1`, `"player_index": 4`, 1)
	for name, save := range map[string][]byte{
		"no save":                     nil,
		"corrupt save":                []byte("--- [\n"),
		"current player out of range": []byte(badPlayer),  // cc-439
		"pending player out of range": []byte(badPending), // cc-444
	} {
		t.Run(name, func(t *testing.T) {
			st, mr := newTestStore(t, save)
			logs := captureLogs(t)
			var g *game.GameState
			err := st.AtomicUpdate(context.Background(), func(ctx context.Context) error {
				g = loadGame(ctx, t, st)
				return nil
			})
			if err != nil {
				t.Fatal(err)
			}

			want, err := game.New(loadMap(t), game.DefaultPlayers, game.DefaultDifficulty, seeded(1))
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(g, want) {
				t.Error("not a new game with the default players and difficulty")
			}
			if !strings.Contains(logs.String(), "No saved game found in Redis, starting new game") ||
				!strings.Contains(logs.String(), "difficulty=heroic") {
				t.Errorf("new game not logged:\n%s", logs)
			}
			if got, _ := mr.Get(testKey); got != string(encode(t, g)) {
				t.Error("the new game was not saved")
			}
		})
	}
}

func TestLoadReturnsSavedGame(t *testing.T) {
	data := readFixture(t, "states/draw_phase.json")
	st, _ := newTestStore(t, data)
	logs := captureLogs(t)
	g := loadGame(context.Background(), t, st)
	if got := encode(t, g); !bytes.Equal(got, data) {
		t.Errorf("loaded game differs:\n%s", got)
	}
	if logs.Len() != 0 {
		t.Errorf("unexpected logs:\n%s", logs)
	}
}
