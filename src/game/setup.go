package game

import (
	"fmt"
	"slices"
)

// Shuffler is the source of randomness for setup. *rand.Rand from
// math/rand/v2 implements it; tests pass a seeded one.
type Shuffler interface {
	Shuffle(n int, swap func(i, j int))
}

func shuffle[T any](rng Shuffler, s []T) {
	rng.Shuffle(len(s), func(i, j int) { s[i], s[j] = s[j], s[i] })
}

// New deals a new game for 2-4 players (GameState.new).
func New(m *Map, playersCount int, difficulty Difficulty, rng Shuffler) (*GameState, error) {
	return deal(m, playersCount, difficulty, nil, rng)
}

// Reset deals a new game with the same number of players (reset_game, used
// by restart). An empty difficulty keeps the current one. On error the game
// is unchanged. Like Rails, a pending One Quiet Night survives the reset.
func (g *GameState) Reset(m *Map, difficulty Difficulty, rng Shuffler) error {
	if difficulty == "" {
		difficulty = g.DifficultyLevel
	}
	fresh, err := deal(m, g.PlayersCount(), difficulty, g.QuietNight, rng)
	if err != nil {
		return err
	}
	*g = *fresh
	return nil
}

func deal(m *Map, playersCount int, difficulty Difficulty, quietNight *bool, rng Shuffler) (*GameState, error) {
	if _, ok := CardsPerPlayer[playersCount]; !ok {
		return nil, fmt.Errorf("player count must be 2-4, got %d", playersCount)
	}
	if !slices.Contains(DifficultyLevels, difficulty) {
		return nil, fmt.Errorf("difficulty must be introductory, normal or heroic, got %q", difficulty)
	}

	g := &GameState{
		ActionsRemaining:      StartingActions,
		Phase:                 PlayerActions,
		Turn:                  1,
		InfectionRate:         InfectionRateTrack[0],
		InfectionRatePosition: 0,
		QuietNight:            quietNight,
		DifficultyLevel:       difficulty,
	}
	g.DiseaseCubes = make([]DiseaseCubes, len(Colors))
	for i, c := range Colors {
		g.DiseaseCubes[i] = DiseaseCubes{Color: c, InSupply: MaxDiseaseCubesPerColor}
	}

	g.Cities = initCities(m)
	g.Players = initPlayers(playersCount, rng)
	g.Decks = Decks{
		InfectionDeck:    initInfectionDeck(m, rng),
		InfectionDiscard: []Card{},
		PlayerDiscard:    []Card{},
	}
	g.Decks.PlayerDeck = g.initPlayerDeck(m, rng)
	g.ResearchStations = []string{StartingCity}
	if err := g.setupInitialInfections(); err != nil {
		return nil, err
	}
	return g, nil
}

func initCities(m *Map) []City {
	cities := make([]City, len(m.Cities))
	for i, mc := range m.Cities {
		cities[i] = City{
			Key:                mc.Name,
			Name:               mc.Name,
			Color:              mc.Color,
			Connections:        slices.Clone(mc.Connections),
			HasResearchStation: mc.Name == StartingCity,
		}
	}
	return cities
}

// initPlayers gives each player a distinct random role, starting in Wuhan.
func initPlayers(count int, rng Shuffler) []Player {
	roles := slices.Clone(Roles)
	shuffle(rng, roles)
	players := make([]Player, count)
	for i := range players {
		players[i] = Player{Role: roles[i], Index: i, Location: StartingCity, Hand: []Card{}}
	}
	return players
}

func cityCards(m *Map) []Card {
	cards := make([]Card, len(m.Cities))
	for i, c := range m.Cities {
		cards[i] = Card{Type: CityCard, Name: c.Name, Color: c.Color}
	}
	return cards
}

func initInfectionDeck(m *Map, rng Shuffler) []Card {
	deck := cityCards(m)
	shuffle(rng, deck)
	return deck
}

// initPlayerDeck shuffles the city and event cards, deals the starting hands
// from the top, then splits the rest into one pile per epidemic, adds an
// epidemic to each pile and shuffles it. The last pile takes the remainder.
func (g *GameState) initPlayerDeck(m *Map, rng Shuffler) []Card {
	deck := cityCards(m)
	for _, name := range ActionCardNames {
		deck = append(deck, Card{Type: ActionCard, Name: name})
	}
	shuffle(rng, deck)

	for i := range g.Players {
		p := &g.Players[i]
		for range CardsPerPlayer[len(g.Players)] {
			p.Hand = append(p.Hand, deck[len(deck)-1])
			deck = deck[:len(deck)-1]
		}
		p.SortHand()
	}

	epidemics := EpidemicCards[g.DifficultyLevel]
	pileSize := len(deck) / epidemics
	result := make([]Card, 0, len(deck)+epidemics)
	for i := range epidemics {
		end := (i + 1) * pileSize
		if i == epidemics-1 {
			end = len(deck)
		}
		pile := append(slices.Clone(deck[i*pileSize:end]), Card{Type: EpidemicCard, Name: EpidemicCardName})
		shuffle(rng, pile)
		result = append(result, pile...)
	}
	return result
}

// setupInitialInfections draws nine infection cards from the top: three
// cities get three cubes, three get two and three get one.
func (g *GameState) setupInitialInfections() error {
	for _, cubes := range initialInfections {
		for range initialInfectionsPerRound {
			deck := g.Decks.InfectionDeck
			card := deck[len(deck)-1]
			g.Decks.InfectionDeck = deck[:len(deck)-1]
			g.Decks.InfectionDiscard = append(g.Decks.InfectionDiscard, card)
			city := g.City(card.Name)
			if err := city.SetDiseaseCubes(city.DiseaseCubes() + cubes); err != nil {
				return err
			}
			g.Disease(city.Color).InSupply -= cubes
		}
	}
	return nil
}
