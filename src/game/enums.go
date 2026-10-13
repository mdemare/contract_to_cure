package game

import (
	"fmt"
	"slices"
)

// The typed enums below hold their wire strings: the Ruby symbols (without
// the colon) or phase strings that Rails writes to the save and the JSON
// view. An empty value means nil.

// Color is a disease color.
type Color string

const (
	Blue   Color = "blue"
	Yellow Color = "yellow"
	Black  Color = "black"
	Red    Color = "red"
)

// Colors is GameStateConfig::COLORS, in the order Rails writes :disease_cubes.
var Colors = []Color{Blue, Yellow, Black, Red}

// Role is a player role.
type Role string

const (
	Medic                Role = "medic"
	Scientist            Role = "scientist"
	Researcher           Role = "researcher"
	OperationsExpert     Role = "operations_expert"
	Dispatcher           Role = "dispatcher"
	ContingencyPlanner   Role = "contingency_planner"
	QuarantineSpecialist Role = "quarantine_specialist"
)

// Roles is GameStateConfig::ROLES; setup shuffles it to assign roles.
var Roles = []Role{Medic, Scientist, Researcher, OperationsExpert, Dispatcher,
	ContingencyPlanner, QuarantineSpecialist}

var roleNames = map[Role]string{
	Medic:                "Medic",
	Scientist:            "Scientist",
	Researcher:           "Researcher",
	OperationsExpert:     "Operations Expert",
	Dispatcher:           "Dispatcher",
	ContingencyPlanner:   "Contingency Planner",
	QuarantineSpecialist: "Quarantine Specialist",
}

// Name is the display name (Player::ROLE_NAMES), or "" for an unknown role.
func (r Role) Name() string { return roleNames[r] }

// CardType is the type of a player or infection card.
type CardType string

const (
	CityCard     CardType = "city"
	ActionCard   CardType = "action"
	EpidemicCard CardType = "epidemic"
	// InfectionCard is only found in saves from before cc-384, where Forecast
	// wrote reordered infection cards with this type. They load like city cards.
	InfectionCard CardType = "infection"
)

var CardTypes = []CardType{CityCard, ActionCard, EpidemicCard, InfectionCard}

// Phase is the turn phase (GameState#phase).
type Phase string

const (
	PlayerActions  Phase = "player_actions"
	DrawCards      Phase = "draw_cards"
	InfectCities   Phase = "infect_cities"
	PendingDiscard Phase = "pending_discard"
)

var Phases = []Phase{PlayerActions, DrawCards, InfectCities, PendingDiscard}

// Difficulty is the difficulty level, which sets the number of epidemics.
type Difficulty string

const (
	Introductory Difficulty = "introductory"
	Normal       Difficulty = "normal"
	Heroic       Difficulty = "heroic"
)

// DifficultyLevels is GameStateConfig::DIFFICULTY_LEVELS.
var DifficultyLevels = []Difficulty{Introductory, Normal, Heroic}

// GameOverReason says why the game ended.
type GameOverReason string

const (
	Victory          GameOverReason = "victory"
	NoPlayerCards    GameOverReason = "no_player_cards"
	TooManyOutbreaks GameOverReason = "too_many_outbreaks"
	NoCubes          GameOverReason = "no_cubes"
)

var GameOverReasons = []GameOverReason{Victory, NoPlayerCards, TooManyOutbreaks, NoCubes}

// Parse returns s as a T if it is one of valid, so wire strings from a save
// or a request can be checked against the enum.
func Parse[T ~string](s string, valid []T) (T, error) {
	if v := T(s); slices.Contains(valid, v) {
		return v, nil
	}
	var zero T
	return zero, fmt.Errorf("unknown %T %q", zero, s)
}
