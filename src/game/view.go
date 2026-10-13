package game

import (
	"bytes"
	"encoding/json"
)

// View is the client-facing JSON view of the game (JsonGenerator#to_json_state).
// Fields are declared in Rails' hash key order. It hides what the client may
// not see: QuietNight, the deck order and the infection deck.
type View struct {
	GameStatus       StatusView       `json:"gameStatus"`
	DiseaseCubes     DiseaseCubesView `json:"diseaseCubes"`
	ResearchStations StationsView     `json:"researchStations"`
	Players          []PlayerView     `json:"players"`
	Decks            DecksView        `json:"decks"`
}

// StatusView is gameStatus, with Rails' mix of camelCase and snake_case keys.
type StatusView struct {
	ActionsRemaining         int               `json:"actions_remaining"`
	Phase                    Phase             `json:"phase"`
	PendingHandLimit         *PendingHandLimit `json:"pending_hand_limit"`
	Turn                     int               `json:"turn"`
	GameOver                 bool              `json:"gameOver"`
	GameOverReason           *GameOverReason   `json:"gameOverReason"`
	Outbreaks                int               `json:"outbreaks"`
	InfectionRate            int               `json:"infectionRate"`
	InfectionRatePosition    int               `json:"infectionRatePosition"`
	CurrentPlayerIndex       int               `json:"currentPlayerIndex"`
	ForecastActive           bool              `json:"forecast_active"`
	ForecastCards            []string          `json:"forecast_cards"`
	OperationsExpertMoveUsed bool              `json:"operations_expert_move_used"`
}

// DiseaseCubesView is diseaseCubes: an object keyed by color, in Colors order.
type DiseaseCubesView []DiseaseView

// DiseaseView is one color of diseaseCubes. OnBoard lists only the cities
// of this color that have cubes, in map order.
type DiseaseView struct {
	Color      Color
	Cured      bool
	Eradicated bool
	InSupply   int
	OnBoard    []CityCubes
}

// CityCubes is one entry of onBoard: a city key and its cube count.
type CityCubes struct {
	City  string
	Cubes int
}

// StationsView is researchStations.
type StationsView struct {
	Available int      `json:"available"`
	Locations []string `json:"locations"`
}

// PlayerView is one player, with the hand sorted (Player#sorted_hand) and
// numbered.
type PlayerView struct {
	Role     Role       `json:"role"`
	Index    int        `json:"index"`
	Location string     `json:"location"`
	Hand     []HandCard `json:"hand"`
}

// HandCard is a card in a hand: its description and its index in the
// sorted hand.
type HandCard struct {
	CardDescription
	Index int `json:"index"`
}

// DecksView is decks. The player deck shows only its size.
type DecksView struct {
	PlayerDeck           int               `json:"playerDeck"`
	DiscardPile          []CardDescription `json:"discardPile"`
	InfectionDiscardPile []CardDescription `json:"infectionDiscardPile"`
}

// View builds the client-facing JSON view.
func (g *GameState) View() View {
	return View{
		GameStatus:   g.statusView(),
		DiseaseCubes: g.diseaseCubesView(),
		ResearchStations: StationsView{
			Available: MaxResearchStations - len(g.ResearchStations),
			Locations: nonNil(g.ResearchStations),
		},
		Players: g.playersView(),
		Decks: DecksView{
			PlayerDeck:           len(g.Decks.PlayerDeck),
			DiscardPile:          describeAll(g.Decks.PlayerDiscard),
			InfectionDiscardPile: describeAll(g.Decks.InfectionDiscard),
		},
	}
}

// MarshalJSON renders the game as its client-facing view, so results that
// carry a *GameState render like Rails' to_json_state.
func (g *GameState) MarshalJSON() ([]byte, error) { return json.Marshal(g.View()) }

func (g *GameState) statusView() StatusView {
	var reason *GameOverReason
	if g.GameOverReason != "" {
		r := g.GameOverReason
		reason = &r
	}
	return StatusView{
		ActionsRemaining:         g.ActionsRemaining,
		Phase:                    g.Phase,
		PendingHandLimit:         g.PendingHandLimit,
		Turn:                     g.Turn,
		GameOver:                 g.GameOver,
		GameOverReason:           reason,
		Outbreaks:                g.Outbreaks,
		InfectionRate:            g.InfectionRate,
		InfectionRatePosition:    g.InfectionRatePosition,
		CurrentPlayerIndex:       g.CurrentPlayerIdx,
		ForecastActive:           g.ForecastActive,
		ForecastCards:            g.ForecastCards,
		OperationsExpertMoveUsed: g.OperationsExpertMoveUsed,
	}
}

func (g *GameState) diseaseCubesView() DiseaseCubesView {
	view := make(DiseaseCubesView, 0, len(Colors))
	for _, color := range Colors {
		d := DiseaseView{Color: color, OnBoard: []CityCubes{}}
		if disease := g.Disease(color); disease != nil {
			d.Cured, d.Eradicated, d.InSupply = disease.Cured, disease.Eradicated(), disease.InSupply
		}
		for i := range g.Cities {
			c := &g.Cities[i]
			if c.Color == color && c.DiseaseCubes() > 0 {
				d.OnBoard = append(d.OnBoard, CityCubes{City: c.Key, Cubes: c.DiseaseCubes()})
			}
		}
		view = append(view, d)
	}
	return view
}

func (g *GameState) playersView() []PlayerView {
	players := make([]PlayerView, 0, len(g.Players))
	for _, p := range g.Players {
		sorted := Player{Hand: append([]Card(nil), p.Hand...)}
		sorted.SortHand()
		hand := make([]HandCard, 0, len(sorted.Hand))
		for i, c := range sorted.Hand {
			hand = append(hand, HandCard{CardDescription: describe(c), Index: i})
		}
		players = append(players, PlayerView{Role: p.Role, Index: p.Index, Location: p.Location, Hand: hand})
	}
	return players
}

func describeAll(cards []Card) []CardDescription {
	descs := make([]CardDescription, 0, len(cards))
	for _, c := range cards {
		descs = append(descs, describe(c))
	}
	return descs
}

// nonNil returns s, or an empty slice for nil, so that it marshals as [].
func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

// MarshalJSON writes the colors as object keys, in order.
func (v DiseaseCubesView) MarshalJSON() ([]byte, error) {
	return marshalObject(len(v), func(i int) (string, any) {
		d := v[i]
		return string(d.Color), struct {
			Cured      bool    `json:"cured"`
			Eradicated bool    `json:"eradicated"`
			InSupply   int     `json:"inSupply"`
			OnBoard    onBoard `json:"onBoard"`
		}{d.Cured, d.Eradicated, d.InSupply, d.OnBoard}
	})
}

// onBoard writes city keys as object keys, in order.
type onBoard []CityCubes

func (o onBoard) MarshalJSON() ([]byte, error) {
	return marshalObject(len(o), func(i int) (string, any) { return o[i].City, o[i].Cubes })
}

// marshalObject writes a JSON object of n entries, keeping their order.
func marshalObject(n int, entry func(i int) (string, any)) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i := range n {
		key, val := entry(i)
		k, err := json.Marshal(key)
		if err != nil {
			return nil, err
		}
		v, err := json.Marshal(val)
		if err != nil {
			return nil, err
		}
		if i > 0 {
			buf.WriteByte(',')
		}
		buf.Write(k)
		buf.WriteByte(':')
		buf.Write(v)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}
