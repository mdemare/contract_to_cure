package game

import (
	"cmp"
	"fmt"
	"slices"
)

// GameState is the whole game. The status fields, DiseaseCubes, Cities,
// ResearchStations, Players and Decks correspond one for one to store.Save
// (Status's fields are flattened here).
type GameState struct {
	ActionsRemaining         int
	Phase                    Phase
	PendingHandLimit         *PendingHandLimit
	Turn                     int
	GameOver                 bool
	GameOverReason           GameOverReason
	Outbreaks                int
	InfectionRate            int
	InfectionRatePosition    int
	CurrentPlayerIdx         int
	QuietNight               *bool // nil until One Quiet Night is played
	ForecastActive           bool
	ForecastCards            []string // nil when no Forecast is pending
	OperationsExpertMoveUsed bool
	DifficultyLevel          Difficulty

	DiseaseCubes     []DiseaseCubes // one per color, in Colors order
	Cities           []City         // in map order
	ResearchStations []string
	Players          []Player
	Decks            Decks
}

// PendingHandLimit is set while a player must discard down to the hand limit.
type PendingHandLimit struct {
	PlayerIndex  int
	DiscardCount int
	ReturnPhase  Phase
}

// DiseaseCubes is one color's supply and cure.
type DiseaseCubes struct {
	Color    Color
	Cured    bool
	InSupply int
}

// Eradicated is cured with every cube of the color back in the supply.
func (d DiseaseCubes) Eradicated() bool {
	return d.Cured && d.InSupply == MaxDiseaseCubesPerColor
}

// Decks are ordered bottom to top: draws pop from the end, and an epidemic
// takes the first card.
type Decks struct {
	PlayerDeck       []Card
	PlayerDiscard    []Card
	InfectionDeck    []Card
	InfectionDiscard []Card
}

// Card is a player or infection card. Color is empty for non-city cards.
type Card struct {
	Type      CardType
	Name      string
	Color     Color
	Retrieved bool // a Contingency Planner took it from the discard
}

// City is a city on the board. Key is the name it is stored under, which
// Rails keeps separately from the city's own Name.
type City struct {
	Key                string
	Name               string
	Color              Color
	Connections        []string
	diseaseCubes       int
	HasResearchStation bool
}

// DiseaseCubes is the number of cubes of the city's color on it (0-3).
func (c *City) DiseaseCubes() int { return c.diseaseCubes }

// SetDiseaseCubes rejects anything outside 0-3, like City#disease_cubes=.
func (c *City) SetDiseaseCubes(n int) error {
	if n < 0 || n > 3 {
		return fmt.Errorf("illegal disease cube count %d for %s", n, c.Name)
	}
	c.diseaseCubes = n
	return nil
}

// Player is one player's role, position and hand.
type Player struct {
	Role     Role
	Index    int
	Location string
	Hand     []Card
}

// SortHand sorts the hand by card type, then color. The sort is stable, so
// cards of the same type and color keep their order.
func (p *Player) SortHand() {
	slices.SortStableFunc(p.Hand, func(a, b Card) int {
		return cmp.Or(cmp.Compare(a.Type, b.Type), cmp.Compare(a.Color, b.Color))
	})
}

// CityCards returns the city cards in the hand.
func (p *Player) CityCards() []Card {
	var cards []Card
	for _, c := range p.Hand {
		if c.Type == CityCard {
			cards = append(cards, c)
		}
	}
	return cards
}

// PlayersCount is the number of players.
func (g *GameState) PlayersCount() int { return len(g.Players) }

// CurrentPlayer is the player whose turn it is.
func (g *GameState) CurrentPlayer() *Player { return &g.Players[g.CurrentPlayerIdx] }

// City returns the city stored under key, or nil.
func (g *GameState) City(key string) *City {
	for i := range g.Cities {
		if g.Cities[i].Key == key {
			return &g.Cities[i]
		}
	}
	return nil
}

// Disease returns the supply and cure of a color, or nil.
func (g *GameState) Disease(c Color) *DiseaseCubes {
	for i := range g.DiseaseCubes {
		if g.DiseaseCubes[i].Color == c {
			return &g.DiseaseCubes[i]
		}
	}
	return nil
}
