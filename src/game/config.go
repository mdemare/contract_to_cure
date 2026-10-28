// Package game is the Go port of the Rails game model (cc-416): the state
// held by GameState, its value types, and the setup of a new game. The
// model's fields match store.Save one for one, so loading and saving is a
// plain mapping (save.go, cc-421). HTTP lives elsewhere.
package game

import "github.com/mdemare/contract_to_cure/src/disease"

// Constants of the former Rails GameStateConfig.
const (
	MaxOutbreaks            = 8
	MaxDiseaseCubesPerColor = disease.MaxCubesPerColor
	InitialResearchStations = 1
	MaxResearchStations     = 6
	HandLimit               = 7
	StartingCity            = "Wuhan"
	StartingActions         = 4
	EpidemicCardName        = "Event:Epidemic"
)

// InfectionRateTrack is the infection rate at each marker position.
var InfectionRateTrack = []int{2, 2, 2, 3, 3, 4, 4}

// CardsPerPlayer is the starting hand size by player count.
var CardsPerPlayer = map[int]int{2: 4, 3: 3, 4: 2}

// EpidemicCards is the number of epidemics added to the player deck.
var EpidemicCards = map[Difficulty]int{Introductory: 4, Normal: 5, Heroic: 6}

// CardsNeededForCure is 5 city cards of one color, or 4 for the Scientist.
func CardsNeededForCure(r Role) int {
	if r == Scientist {
		return 4
	}
	return 5
}

// ActionCardNames are the event cards in the player deck, in the order Rails
// adds them before shuffling.
var ActionCardNames = []string{"Airlift", "Forecast", "Government Grant",
	"One Quiet Night", "Resilient Population"}

// initialInfections is the cubes per city for each of the three rounds of
// three initial infection draws.
var initialInfections = []int{3, 2, 1}

const initialInfectionsPerRound = 3
