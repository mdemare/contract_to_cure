package store

import (
	"fmt"
	"slices"
)

// Colors is the order in which Rails writes :disease_cubes (GameStateConfig::COLORS).
var Colors = []string{"blue", "yellow", "black", "red"}

// DifficultyLevels are the valid difficulty levels (GameStateConfig::DIFFICULTY_LEVELS).
var DifficultyLevels = []string{"introductory", "normal", "heroic"}

const (
	maxDiseaseCubesPerColor = 24
	maxResearchStations     = 6
	fallbackDifficulty      = "heroic"
)

// Save is the persisted game, field for field as GameState#serialized_state
// writes it. Symbol values (roles, colors, card types, the game-over reason)
// are stored without their leading colon; an empty string means nil.
//
// The save's "eradicated" and "available" fields are derived. Like Rails,
// decoding ignores them and encoding recomputes them.
type Save struct {
	Status           Status
	DiseaseCubes     []DiseaseCubes // one per color, in Colors order
	Cities           []City         // in saved order
	ResearchStations []string
	Players          []Player
	Decks            Decks
}

type Status struct {
	ActionsRemaining         int
	Phase                    string
	PendingHandLimit         *PendingHandLimit
	Turn                     int
	GameOver                 bool
	GameOverReason           string // symbol
	Outbreaks                int
	InfectionRate            int
	InfectionRatePosition    int
	CurrentPlayerIdx         int
	QuietNight               *bool
	ForecastActive           bool
	ForecastCards            []string // nil is written as nil, empty as []
	OperationsExpertMoveUsed bool
	DifficultyLevel          string
}

type PendingHandLimit struct {
	PlayerIndex  int
	DiscardCount int
	ReturnPhase  string
}

type DiseaseCubes struct {
	Color    string
	Cured    bool
	InSupply int
}

// Eradicated is cured with every cube of the color back in the supply.
func (d DiseaseCubes) Eradicated() bool {
	return d.Cured && d.InSupply == maxDiseaseCubesPerColor
}

// City is one entry of :cities. Key is the hash key, which Rails keeps
// separately from the city's own name.
type City struct {
	Key                string
	Name               string
	Color              string // symbol
	Connections        []string
	DiseaseCubes       int
	HasResearchStation bool
}

type Player struct {
	Role     string // symbol
	Index    int
	Location string
	Hand     []Card
}

// Card is a player or infection card. Retrieved is written only when true.
type Card struct {
	Type      string // symbol: city, action, epidemic or infection
	Name      string
	Color     string // symbol, empty for non-city cards
	Retrieved bool
}

type Decks struct {
	PlayerDeck       []Card
	PlayerDiscard    []Card
	InfectionDeck    []Card
	InfectionDiscard []Card
}

// DecodeSave reads a save written by Rails or by EncodeSave. Older saves get
// the defaults Rails' load_state_from_hash applies (Q13-cc): forecast_active
// and operations_expert_move_used default to false, cards without :retrieved
// are not retrieved, and a missing or invalid difficulty becomes
// defaultDifficulty (or heroic if that is invalid too).
func DecodeSave(data []byte, defaultDifficulty string) (*Save, error) {
	root, err := parseRubyYAML(data)
	if err != nil {
		return nil, err
	}
	d := decoder{}
	s := d.save(root, defaultDifficulty)
	if d.err != nil {
		return nil, d.err
	}
	return s, nil
}

// EncodeSave writes the save as Rails' serialized_state does, so Rails can
// keep loading games that Go saved until Rails is removed.
func (s *Save) EncodeSave() ([]byte, error) {
	if len(s.DiseaseCubes) != len(Colors) {
		return nil, fmt.Errorf("save has %d disease colors, want %d", len(s.DiseaseCubes), len(Colors))
	}
	return emitRubyYAML(s.value()), nil
}

func (s *Save) value() value {
	st := s.Status
	pending := nilValue()
	if p := st.PendingHandLimit; p != nil {
		pending = mapValue(
			symPair("player_index", intValue(p.PlayerIndex)),
			symPair("discard_count", intValue(p.DiscardCount)),
			symPair("return_phase", stringValue(p.ReturnPhase)),
		)
	}
	quietNight := nilValue()
	if st.QuietNight != nil {
		quietNight = boolValue(*st.QuietNight)
	}
	forecastCards := nilValue()
	if st.ForecastCards != nil {
		forecastCards = stringsValue(st.ForecastCards)
	}

	status := mapValue(
		symPair("actions_remaining", intValue(st.ActionsRemaining)),
		symPair("phase", stringValue(st.Phase)),
		symPair("pending_hand_limit", pending),
		symPair("turn", intValue(st.Turn)),
		symPair("game_over", boolValue(st.GameOver)),
		symPair("game_over_reason", optionalSymbol(st.GameOverReason)),
		symPair("outbreaks", intValue(st.Outbreaks)),
		symPair("infection_rate", intValue(st.InfectionRate)),
		symPair("infection_rate_position", intValue(st.InfectionRatePosition)),
		symPair("current_player_idx", intValue(st.CurrentPlayerIdx)),
		symPair("quiet_night", quietNight),
		symPair("forecast_active", boolValue(st.ForecastActive)),
		symPair("forecast_cards", forecastCards),
		symPair("operations_expert_move_used", boolValue(st.OperationsExpertMoveUsed)),
		symPair("difficulty_level", stringValue(st.DifficultyLevel)),
	)

	cubes := mapValue()
	for _, d := range s.DiseaseCubes {
		cubes.pairs = append(cubes.pairs, symPair(d.Color, mapValue(
			symPair("cured", boolValue(d.Cured)),
			symPair("eradicated", boolValue(d.Eradicated())),
			symPair("in_supply", intValue(d.InSupply)),
		)))
	}

	cities := mapValue()
	for _, c := range s.Cities {
		cities.pairs = append(cities.pairs, pair{key: stringValue(c.Key), val: mapValue(
			symPair("name", stringValue(c.Name)),
			symPair("color", optionalSymbol(c.Color)),
			symPair("connections", stringsValue(c.Connections)),
			symPair("disease_cubes", intValue(c.DiseaseCubes)),
			symPair("has_research_station", boolValue(c.HasResearchStation)),
		)})
	}

	players := seqValue([]value{})
	for _, p := range s.Players {
		players.items = append(players.items, mapValue(
			symPair("role", optionalSymbol(p.Role)),
			symPair("index", intValue(p.Index)),
			symPair("location", stringValue(p.Location)),
			symPair("hand", cardsValue(p.Hand)),
		))
	}

	return mapValue(
		symPair("game_status", status),
		symPair("disease_cubes", cubes),
		symPair("cities", cities),
		symPair("research_stations", mapValue(
			symPair("available", intValue(maxResearchStations-len(s.ResearchStations))),
			symPair("locations", stringsValue(s.ResearchStations)),
		)),
		symPair("players", players),
		symPair("decks", mapValue(
			symPair("player_deck", cardsValue(s.Decks.PlayerDeck)),
			symPair("player_discard", cardsValue(s.Decks.PlayerDiscard)),
			symPair("infection_deck", cardsValue(s.Decks.InfectionDeck)),
			symPair("infection_discard", cardsValue(s.Decks.InfectionDiscard)),
		)),
	)
}

func optionalSymbol(s string) value {
	if s == "" {
		return nilValue()
	}
	return symbolValue(s)
}

func stringsValue(ss []string) value {
	items := make([]value, len(ss))
	for i, s := range ss {
		items[i] = stringValue(s)
	}
	return seqValue(items)
}

func cardsValue(cards []Card) value {
	items := make([]value, len(cards))
	for i, c := range cards {
		v := mapValue(
			symPair("type", optionalSymbol(c.Type)),
			symPair("name", stringValue(c.Name)),
			symPair("color", optionalSymbol(c.Color)),
		)
		if c.Retrieved {
			v.pairs = append(v.pairs, symPair("retrieved", boolValue(true)))
		}
		items[i] = v
	}
	return seqValue(items)
}

// decoder records the first error and its path; later calls become no-ops
// that return zero values, so the field-by-field code stays linear.
type decoder struct {
	err error
}

func (d *decoder) fail(path, format string, args ...any) {
	if d.err == nil {
		d.err = fmt.Errorf("%s: %s", path, fmt.Sprintf(format, args...))
	}
}

func (d *decoder) field(m value, path, key string) (value, bool) {
	if d.err != nil {
		return value{}, false
	}
	if m.kind != kindMap {
		d.fail(path, "is not a hash")
		return value{}, false
	}
	v, ok := m.get(key)
	if !ok {
		d.fail(path, "missing :%s", key)
	}
	return v, ok
}

func (d *decoder) intField(m value, path, key string) int {
	v, ok := d.field(m, path, key)
	if ok && v.kind != kindInt {
		d.fail(path+"."+key, "is not an integer")
	}
	return v.i
}

func (d *decoder) boolField(m value, path, key string) bool {
	v, ok := d.field(m, path, key)
	if ok && v.kind != kindBool {
		d.fail(path+"."+key, "is not true or false")
	}
	return v.b
}

// textField reads a string or symbol. Rails would load either, so Go does too
// rather than discarding the game; it writes back the type Rails would write.
func (d *decoder) textField(m value, path, key string, nilable bool) string {
	v, ok := d.field(m, path, key)
	switch {
	case !ok:
	case v.kind == kindString || v.kind == kindSymbol:
		return v.s
	case v.kind == kindNil && nilable:
	default:
		d.fail(path+"."+key, "is not a string or symbol")
	}
	return ""
}

func (d *decoder) strings(v value, path string) []string {
	if d.err != nil {
		return nil
	}
	if v.kind != kindSeq {
		d.fail(path, "is not an array")
		return nil
	}
	out := make([]string, 0, len(v.items))
	for i, item := range v.items {
		if item.kind != kindString && item.kind != kindSymbol {
			d.fail(fmt.Sprintf("%s[%d]", path, i), "is not a string")
			return nil
		}
		out = append(out, item.s)
	}
	return out
}

func (d *decoder) save(root value, defaultDifficulty string) *Save {
	s := &Save{}
	gs, _ := d.field(root, "save", "game_status")
	s.Status = d.status(gs, defaultDifficulty)

	cubes, _ := d.field(root, "save", "disease_cubes")
	for _, color := range Colors {
		c, _ := d.field(cubes, "disease_cubes", color)
		s.DiseaseCubes = append(s.DiseaseCubes, DiseaseCubes{
			Color:    color,
			Cured:    d.boolField(c, "disease_cubes."+color, "cured"),
			InSupply: d.intField(c, "disease_cubes."+color, "in_supply"),
		})
	}

	cities, _ := d.field(root, "save", "cities")
	if d.err == nil && cities.kind != kindMap {
		d.fail("cities", "is not a hash")
	}
	for _, p := range cities.pairs {
		path := "cities." + p.key.s
		if p.key.kind != kindString {
			d.fail(path, "key is not a string")
		}
		conns, _ := d.field(p.val, path, "connections")
		city := City{
			Key:                p.key.s,
			Name:               d.textField(p.val, path, "name", false),
			Color:              d.textField(p.val, path, "color", true),
			Connections:        d.strings(conns, path+".connections"),
			DiseaseCubes:       d.intField(p.val, path, "disease_cubes"),
			HasResearchStation: d.boolField(p.val, path, "has_research_station"),
		}
		// City#disease_cubes= rejects anything outside 0-3.
		if city.DiseaseCubes < 0 || city.DiseaseCubes > 3 {
			d.fail(path+".disease_cubes", "must be 0-3, got %d", city.DiseaseCubes)
		}
		s.Cities = append(s.Cities, city)
	}

	stations, _ := d.field(root, "save", "research_stations")
	locations, _ := d.field(stations, "research_stations", "locations")
	s.ResearchStations = d.strings(locations, "research_stations.locations")

	players, _ := d.field(root, "save", "players")
	if d.err == nil && players.kind != kindSeq {
		d.fail("players", "is not an array")
	}
	for i, p := range players.items {
		path := fmt.Sprintf("players[%d]", i)
		hand, _ := d.field(p, path, "hand")
		s.Players = append(s.Players, Player{
			Role:     d.textField(p, path, "role", true),
			Index:    d.intField(p, path, "index"),
			Location: d.textField(p, path, "location", true),
			Hand:     d.cards(hand, path+".hand"),
		})
	}

	decks, _ := d.field(root, "save", "decks")
	for _, deck := range []struct {
		key  string
		dest *[]Card
	}{
		{"player_deck", &s.Decks.PlayerDeck},
		{"player_discard", &s.Decks.PlayerDiscard},
		{"infection_deck", &s.Decks.InfectionDeck},
		{"infection_discard", &s.Decks.InfectionDiscard},
	} {
		v, _ := d.field(decks, "decks", deck.key)
		*deck.dest = d.cards(v, "decks."+deck.key)
	}
	return s
}

func (d *decoder) status(gs value, defaultDifficulty string) Status {
	const path = "game_status"
	st := Status{
		ActionsRemaining:      d.intField(gs, path, "actions_remaining"),
		Phase:                 d.textField(gs, path, "phase", false),
		Turn:                  d.intField(gs, path, "turn"),
		GameOver:              d.boolField(gs, path, "game_over"),
		GameOverReason:        d.textField(gs, path, "game_over_reason", true),
		Outbreaks:             d.intField(gs, path, "outbreaks"),
		InfectionRate:         d.intField(gs, path, "infection_rate"),
		InfectionRatePosition: d.intField(gs, path, "infection_rate_position"),
		CurrentPlayerIdx:      d.intField(gs, path, "current_player_idx"),
	}
	if d.err != nil {
		return st
	}

	if v, _ := gs.get("pending_hand_limit"); v.kind != kindNil {
		st.PendingHandLimit = &PendingHandLimit{
			PlayerIndex:  d.intField(v, path+".pending_hand_limit", "player_index"),
			DiscardCount: d.intField(v, path+".pending_hand_limit", "discard_count"),
			ReturnPhase:  d.textField(v, path+".pending_hand_limit", "return_phase", false),
		}
	}
	switch v, _ := gs.get("quiet_night"); v.kind {
	case kindNil:
	case kindBool:
		st.QuietNight = &v.b
	default:
		d.fail(path+".quiet_night", "is not true, false or nil")
	}
	if v, ok := gs.get("forecast_cards"); ok && v.kind != kindNil {
		st.ForecastCards = d.strings(v, path+".forecast_cards")
	}

	// Fields added after the first saves: Rails uses "|| false" for these.
	st.ForecastActive = optionalBool(gs, "forecast_active")
	st.OperationsExpertMoveUsed = optionalBool(gs, "operations_expert_move_used")

	st.DifficultyLevel = defaultDifficulty
	if !slices.Contains(DifficultyLevels, st.DifficultyLevel) {
		st.DifficultyLevel = fallbackDifficulty
	}
	if v, _ := gs.get("difficulty_level"); v.kind == kindString || v.kind == kindSymbol {
		if slices.Contains(DifficultyLevels, v.s) {
			st.DifficultyLevel = v.s
		}
	}
	return st
}

// optionalBool mirrors Ruby's "value || false": nil and false are false,
// anything else is true.
func optionalBool(m value, key string) bool {
	v, _ := m.get(key)
	return !(v.kind == kindNil || v.kind == kindBool && !v.b)
}

func (d *decoder) cards(v value, path string) []Card {
	if d.err != nil {
		return nil
	}
	if v.kind != kindSeq {
		d.fail(path, "is not an array")
		return nil
	}
	cards := make([]Card, 0, len(v.items))
	for i, item := range v.items {
		p := fmt.Sprintf("%s[%d]", path, i)
		c := Card{
			Type:  d.textField(item, p, "type", true),
			Name:  d.textField(item, p, "name", true),
			Color: d.textField(item, p, "color", true),
		}
		// Card#retrieved= accepts only true or false; older cards lack the key.
		if r, ok := item.get("retrieved"); ok {
			if r.kind != kindBool {
				d.fail(p+".retrieved", "must be true or false")
			}
			c.Retrieved = r.b
		}
		cards = append(cards, c)
	}
	return cards
}
