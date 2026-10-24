package game_test

import (
	"fmt"
	"math/rand/v2"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/mdemare/contract_to_cure/src/game"
	"github.com/mdemare/contract_to_cure/src/store"
)

const citiesPath = "../../public/cities.json"

func loadMap(t *testing.T) *game.Map {
	t.Helper()
	m, err := game.LoadMapFile(citiesPath)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func seeded(seed uint64) *rand.Rand { return rand.New(rand.NewPCG(seed, seed)) }

func newGame(t *testing.T, players int, d game.Difficulty, seed uint64) *game.GameState {
	t.Helper()
	g, err := game.New(loadMap(t), players, d, seeded(seed))
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func countType(cards []game.Card, typ game.CardType) int {
	n := 0
	for _, c := range cards {
		if c.Type == typ {
			n++
		}
	}
	return n
}

func TestLoadMap(t *testing.T) {
	m := loadMap(t)
	if len(m.Cities) != 48 {
		t.Fatalf("got %d cities", len(m.Cities))
	}
	// File order is kept: Houston is the first city in cities.json.
	if m.Cities[0].Name != "Houston" || m.Cities[0].Color != game.Blue {
		t.Errorf("first city = %+v", m.Cities[0])
	}
}

// board is a 48-city cities.json without connections, starting with first.
func board(first string) string {
	cities := []string{first}
	for i := 1; i < 48; i++ {
		cities = append(cities, fmt.Sprintf(`"C%d": {"color": "red", "connections": []}`, i))
	}
	return "{" + strings.Join(cities, ",") + "}"
}

func TestLoadMapRejectsBadBoards(t *testing.T) {
	tests := []struct {
		name, json, wantErr string
	}{
		{"not an object", `[]`, "expected a JSON object"},
		{"too few cities", `{"A": {"color": "blue", "connections": []}}`, "got 1 cities"},
		{"unknown color", `{"A": {"color": "green", "connections": []}}`, "unknown"},
		{"asymmetric", board(`"C0": {"color": "blue", "connections": ["C1"]}`), "asymmetric connection between C0 and C1"},
		{"duplicate", `{"A": {"color": "blue", "connections": []}, "A": {"color": "blue", "connections": []}}`, "twice"},
	}
	if _, err := game.LoadMap(strings.NewReader(board(`"C0": {"color": "blue", "connections": []}`))); err != nil {
		t.Fatalf("valid board: %v", err)
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := game.LoadMap(strings.NewReader(tt.json))
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("err = %v, want it to contain %q", err, tt.wantErr)
			}
		})
	}
}

// Ported from the former Rails test_game_state.rb (fixture creation,
// difficulty levels) and test_restart_game.rb (initial status values, epidemic counts), plus the
// setup rules in Q19-cc.
func TestNewGame(t *testing.T) {
	tests := []struct {
		players    int
		difficulty game.Difficulty
		handSize   int
		epidemics  int
	}{
		{2, game.Introductory, 4, 4},
		{2, game.Normal, 4, 5},
		{2, game.Heroic, 4, 6},
		{3, game.Normal, 3, 5},
		{4, game.Heroic, 2, 6},
		{4, game.Introductory, 2, 4},
	}
	for _, tt := range tests {
		t.Run(string(tt.difficulty)+"/"+string(rune('0'+tt.players)), func(t *testing.T) {
			g := newGame(t, tt.players, tt.difficulty, 1)

			if g.PlayersCount() != tt.players || g.DifficultyLevel != tt.difficulty {
				t.Errorf("players %d, difficulty %s", g.PlayersCount(), g.DifficultyLevel)
			}
			checkInitialStatus(t, g)

			roles := map[game.Role]bool{}
			for i, p := range g.Players {
				if p.Index != i || p.Location != "Wuhan" || !slices.Contains(game.Roles, p.Role) || roles[p.Role] {
					t.Errorf("player %d = %+v", i, p)
				}
				roles[p.Role] = true
				if len(p.Hand) != tt.handSize {
					t.Errorf("player %d has %d cards, want %d", i, len(p.Hand), tt.handSize)
				}
				if countType(p.Hand, game.EpidemicCard) != 0 {
					t.Errorf("player %d was dealt an epidemic", i)
				}
				if !handSorted(p.Hand) {
					t.Errorf("player %d hand is not sorted: %+v", i, p.Hand)
				}
			}
			if g.CurrentPlayer() != &g.Players[0] {
				t.Error("current player is not the first player")
			}

			d := g.Decks
			if got := countType(d.PlayerDeck, game.EpidemicCard); got != tt.epidemics {
				t.Errorf("player deck has %d epidemics, want %d", got, tt.epidemics)
			}
			if want := 53 - tt.players*tt.handSize + tt.epidemics; len(d.PlayerDeck) != want {
				t.Errorf("player deck has %d cards, want %d", len(d.PlayerDeck), want)
			}
			if len(d.PlayerDiscard) != 0 || d.PlayerDiscard == nil {
				t.Errorf("player discard = %#v, want empty", d.PlayerDiscard)
			}
			if len(d.InfectionDeck) != 39 || len(d.InfectionDiscard) != 9 {
				t.Errorf("infection deck %d, discard %d", len(d.InfectionDeck), len(d.InfectionDiscard))
			}
			checkEveryCardOnce(t, g)
		})
	}
}

func checkInitialStatus(t *testing.T, g *game.GameState) {
	t.Helper()
	if g.Turn != 1 || g.ActionsRemaining != 4 || g.Phase != game.PlayerActions ||
		g.CurrentPlayerIdx != 0 || g.Outbreaks != 0 || g.InfectionRatePosition != 0 ||
		g.InfectionRate != 2 || g.GameOver || g.GameOverReason != "" || g.PendingHandLimit != nil ||
		g.ForecastActive || g.ForecastCards != nil || g.OperationsExpertMoveUsed {
		t.Errorf("initial status = %+v", g)
	}
	if !reflect.DeepEqual(g.ResearchStations, []string{"Wuhan"}) {
		t.Errorf("research stations = %v", g.ResearchStations)
	}
	for _, c := range g.Cities {
		if c.HasResearchStation != (c.Name == "Wuhan") {
			t.Errorf("%s has research station %v", c.Name, c.HasResearchStation)
		}
	}
	for i, d := range g.DiseaseCubes {
		if d.Color != game.Colors[i] || d.Cured {
			t.Errorf("disease %d = %+v", i, d)
		}
	}
}

func handSorted(hand []game.Card) bool {
	return slices.IsSortedFunc(hand, func(a, b game.Card) int {
		if a.Type != b.Type {
			return strings.Compare(string(a.Type), string(b.Type))
		}
		return strings.Compare(string(a.Color), string(b.Color))
	})
}

// checkEveryCardOnce checks that the 48 city and 5 event cards are each in
// exactly one hand or deck, and that every city has one infection card.
func checkEveryCardOnce(t *testing.T, g *game.GameState) {
	t.Helper()
	seen := map[string]int{}
	for _, p := range g.Players {
		for _, c := range p.Hand {
			seen[c.Name]++
		}
	}
	for _, c := range g.Decks.PlayerDeck {
		if c.Type != game.EpidemicCard {
			seen[c.Name]++
		}
	}
	if len(seen) != 53 {
		t.Errorf("%d distinct player cards, want 53", len(seen))
	}
	for name, n := range seen {
		if n != 1 {
			t.Errorf("%s is dealt %d times", name, n)
		}
	}
	infection := map[string]bool{}
	for _, c := range append(slices.Clone(g.Decks.InfectionDeck), g.Decks.InfectionDiscard...) {
		if city := g.City(c.Name); city == nil || city.Color != c.Color || c.Type != game.CityCard {
			t.Errorf("bad infection card %+v", c)
		}
		infection[c.Name] = true
	}
	if len(infection) != 48 {
		t.Errorf("%d distinct infection cards, want 48", len(infection))
	}
}

func TestInitialInfections(t *testing.T) {
	for seed := range uint64(5) {
		g := newGame(t, 4, game.Heroic, seed)
		var cubes []int
		onBoard := map[game.Color]int{}
		for _, card := range g.Decks.InfectionDiscard {
			c := g.City(card.Name)
			cubes = append(cubes, c.DiseaseCubes())
			onBoard[c.Color] += c.DiseaseCubes()
		}
		if want := []int{3, 3, 3, 2, 2, 2, 1, 1, 1}; !slices.Equal(cubes, want) {
			t.Errorf("seed %d: cubes in discard order = %v, want %v", seed, cubes, want)
		}
		total := 0
		for _, c := range g.Cities {
			total += c.DiseaseCubes()
		}
		if total != 18 {
			t.Errorf("seed %d: %d cubes on the board, want 18", seed, total)
		}
		for _, d := range g.DiseaseCubes {
			if d.InSupply+onBoard[d.Color] != 24 {
				t.Errorf("seed %d: %s supply %d with %d on board", seed, d.Color, d.InSupply, onBoard[d.Color])
			}
		}
	}
}

// Each epidemic is in its own pile: with 4 players on heroic, 45 cards are
// split into piles of 7 plus a last pile of 10, each with one epidemic.
func TestEpidemicPiles(t *testing.T) {
	for seed := range uint64(5) {
		deck := newGame(t, 4, game.Heroic, seed).Decks.PlayerDeck
		sizes := []int{8, 8, 8, 8, 8, 11}
		start := 0
		for i, size := range sizes {
			pile := deck[start : start+size]
			if n := countType(pile, game.EpidemicCard); n != 1 {
				t.Errorf("seed %d: pile %d has %d epidemics", seed, i, n)
			}
			start += size
		}
		for _, c := range deck {
			if c.Type == game.EpidemicCard && (c.Name != "Event:Epidemic" || c.Color != "") {
				t.Errorf("epidemic card = %+v", c)
			}
		}
	}
}

func TestSetupIsDeterministicForASeed(t *testing.T) {
	a := newGame(t, 4, game.Normal, 42)
	b := newGame(t, 4, game.Normal, 42)
	if !reflect.DeepEqual(a, b) {
		t.Error("same seed dealt different games")
	}
	if c := newGame(t, 4, game.Normal, 43); reflect.DeepEqual(a.Decks, c.Decks) {
		t.Error("different seeds dealt the same decks")
	}
}

func TestNewRejectsBadSetup(t *testing.T) {
	m := loadMap(t)
	tests := []struct {
		players    int
		difficulty game.Difficulty
	}{
		{1, game.Normal},
		{5, game.Normal},
		{4, "nightmare"},
		{4, ""},
	}
	for _, tt := range tests {
		if _, err := game.New(m, tt.players, tt.difficulty, seeded(1)); err == nil {
			t.Errorf("New(%d, %q) succeeded", tt.players, tt.difficulty)
		}
	}
}

// Ported from the former Rails test_restart_game.rb: a restart deals a fresh game with the
// same player count, keeps the difficulty unless one is given, and leaves
// the game alone when the difficulty is unknown.
func TestReset(t *testing.T) {
	tests := []struct {
		name      string
		start     game.Difficulty
		restart   game.Difficulty
		want      game.Difficulty
		epidemics int
	}{
		{"keeps heroic", game.Heroic, "", game.Heroic, 6},
		{"keeps introductory", game.Introductory, "", game.Introductory, 4},
		{"keeps normal", game.Normal, "", game.Normal, 5},
		{"sets introductory", game.Heroic, game.Introductory, game.Introductory, 4},
		{"sets normal", game.Heroic, game.Normal, game.Normal, 5},
		{"sets heroic", game.Normal, game.Heroic, game.Heroic, 6},
	}
	m := loadMap(t)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := newGame(t, 2, tt.start, 1)
			played(g)

			if err := g.Reset(m, tt.restart, seeded(2)); err != nil {
				t.Fatal(err)
			}
			if g.DifficultyLevel != tt.want || g.PlayersCount() != 2 {
				t.Errorf("difficulty %s, players %d", g.DifficultyLevel, g.PlayersCount())
			}
			if n := countType(g.Decks.PlayerDeck, game.EpidemicCard); n != tt.epidemics {
				t.Errorf("%d epidemics, want %d", n, tt.epidemics)
			}
			checkInitialStatus(t, g)
			checkEveryCardOnce(t, g)
		})
	}
}

// played changes the game as a few turns would.
func played(g *game.GameState) {
	g.Turn = 7
	g.ActionsRemaining = 1
	g.Phase = game.InfectCities
	g.CurrentPlayerIdx = 1
	g.Outbreaks = 5
	g.InfectionRatePosition = 3
	g.InfectionRate = 3
	g.GameOver = true
	g.GameOverReason = game.TooManyOutbreaks
	g.PendingHandLimit = &game.PendingHandLimit{PlayerIndex: 1, DiscardCount: 1, ReturnPhase: game.InfectCities}
	g.ForecastActive = true
	g.ForecastCards = []string{"Paris"}
	g.OperationsExpertMoveUsed = true
	g.DiseaseCubes[0].Cured = true
	g.ResearchStations = append(g.ResearchStations, "Paris")
}

func TestResetErrorLeavesGameUnchanged(t *testing.T) {
	g := newGame(t, 2, game.Normal, 1)
	before := newGame(t, 2, game.Normal, 1)
	if err := g.Reset(loadMap(t), "nightmare", seeded(2)); err == nil {
		t.Fatal("Reset with an unknown difficulty succeeded")
	}
	if !reflect.DeepEqual(g, before) {
		t.Error("failed Reset changed the game")
	}
}

// reset_game does not clear @quiet_night, so a pending One Quiet Night
// survives a restart (Q19-cc).
func TestResetKeepsQuietNight(t *testing.T) {
	g := newGame(t, 2, game.Normal, 1)
	if g.QuietNight != nil {
		t.Fatalf("new game quiet night = %v, want nil", *g.QuietNight)
	}
	on := true
	g.QuietNight = &on
	if err := g.Reset(loadMap(t), "", seeded(2)); err != nil {
		t.Fatal(err)
	}
	if g.QuietNight == nil || !*g.QuietNight {
		t.Errorf("quiet night = %v, want true", g.QuietNight)
	}
}

// The model's fields correspond to store.Save one for one, so the store
// wiring (cc-421) is a plain mapping. Save.Status is flattened into GameState.
func TestModelMatchesSave(t *testing.T) {
	pairs := []struct {
		save    reflect.Type
		model   reflect.Type
		flatten string
	}{
		{reflect.TypeFor[store.Save](), reflect.TypeFor[game.GameState](), "Status"},
		{reflect.TypeFor[store.Status](), reflect.TypeFor[game.GameState](), ""},
		{reflect.TypeFor[store.PendingHandLimit](), reflect.TypeFor[game.PendingHandLimit](), ""},
		{reflect.TypeFor[store.DiseaseCubes](), reflect.TypeFor[game.DiseaseCubes](), ""},
		{reflect.TypeFor[store.City](), reflect.TypeFor[game.City](), ""},
		{reflect.TypeFor[store.Player](), reflect.TypeFor[game.Player](), ""},
		{reflect.TypeFor[store.Card](), reflect.TypeFor[game.Card](), ""},
		{reflect.TypeFor[store.Decks](), reflect.TypeFor[game.Decks](), ""},
	}
	for _, p := range pairs {
		for f := range p.save.Fields() {
			if f.Name == p.flatten {
				continue
			}
			_, isField := p.model.FieldByName(f.Name)
			_, isMethod := reflect.PointerTo(p.model).MethodByName(f.Name)
			if !isField && !isMethod {
				t.Errorf("%s.%s has no counterpart in %s", p.save, f.Name, p.model)
			}
		}
	}
}

func TestCitySetDiseaseCubes(t *testing.T) {
	c := game.City{Name: "Paris"}
	for _, n := range []int{0, 1, 2, 3} {
		if err := c.SetDiseaseCubes(n); err != nil || c.DiseaseCubes() != n {
			t.Errorf("SetDiseaseCubes(%d): %v, got %d", n, err, c.DiseaseCubes())
		}
	}
	for _, n := range []int{-1, 4} {
		if err := c.SetDiseaseCubes(n); err == nil || c.DiseaseCubes() != 3 {
			t.Errorf("SetDiseaseCubes(%d) was accepted", n)
		}
	}
}

// Hands sort by [type, color] and keep the order of equal cards (Q41-cc).
func TestSortHandIsStable(t *testing.T) {
	p := game.Player{Hand: []game.Card{
		{Type: game.CityCard, Name: "Paris", Color: game.Blue},
		{Type: game.ActionCard, Name: "Forecast"},
		{Type: game.CityCard, Name: "Atlanta", Color: game.Blue},
		{Type: game.CityCard, Name: "Tokyo", Color: game.Red},
		{Type: game.CityCard, Name: "Cairo", Color: game.Black},
		{Type: game.ActionCard, Name: "Airlift"},
	}}
	p.SortHand()
	var names []string
	for _, c := range p.Hand {
		names = append(names, c.Name)
	}
	want := []string{"Forecast", "Airlift", "Cairo", "Paris", "Atlanta", "Tokyo"}
	if !slices.Equal(names, want) {
		t.Errorf("sorted hand = %v, want %v", names, want)
	}
}

func TestParse(t *testing.T) {
	if c, err := game.Parse("yellow", game.Colors); err != nil || c != game.Yellow {
		t.Errorf("Parse(yellow) = %q, %v", c, err)
	}
	if _, err := game.Parse("green", game.Colors); err == nil {
		t.Error("Parse(green) succeeded")
	}
	if r, err := game.Parse("operations_expert", game.Roles); err != nil || r.Name() != "Operations Expert" {
		t.Errorf("Parse(operations_expert) = %q, %v", r, err)
	}
	if _, err := game.Parse("", game.Phases); err == nil {
		t.Error("Parse of an empty phase succeeded")
	}
}

// From the former Rails test_role_styles.rb.
func TestRoleNames(t *testing.T) {
	if got := game.QuarantineSpecialist.Name(); got != "Quarantine Specialist" {
		t.Errorf("QuarantineSpecialist.Name() = %q", got)
	}
	for _, r := range game.Roles {
		if r.Name() == "" {
			t.Errorf("role %s has no name", r)
		}
	}
}

func TestEradicated(t *testing.T) {
	tests := []struct {
		d    game.DiseaseCubes
		want bool
	}{
		{game.DiseaseCubes{Cured: true, InSupply: 24}, true},
		{game.DiseaseCubes{Cured: true, InSupply: 23}, false},
		{game.DiseaseCubes{Cured: false, InSupply: 24}, false},
	}
	for _, tt := range tests {
		if got := tt.d.Eradicated(); got != tt.want {
			t.Errorf("%+v.Eradicated() = %v", tt.d, got)
		}
	}
}
