package game

import (
	"context"
	"fmt"

	"github.com/mdemare/contract_to_cure/src/observe"
	"github.com/mdemare/contract_to_cure/src/store"
)

// The defaults from config/application.rb for a game started when there is
// no saved one.
const (
	DefaultPlayers    = 4
	DefaultDifficulty = Heroic
)

// Load returns the saved game (load_from_redis and load_game_state). When
// there is no save, or it cannot be decoded, it deals a new game with
// playersCount and difficulty and saves it, like GameState.new. Inside an
// atomic update that save is written at commit, so a request that only reads
// still stores the new game. Redis errors are returned.
//
// Loading never writes by itself: an older save gets its defaults (Q13-cc)
// in memory, and they reach Redis with the next save.
func Load(ctx context.Context, st *store.Store, m *Map, playersCount int, difficulty Difficulty, rng Shuffler) (*GameState, error) {
	save, err := st.Load(ctx)
	if err != nil {
		return nil, err
	}
	if save != nil {
		return FromSave(save)
	}
	observe.LogNewGame(ctx, string(difficulty))
	g, err := New(m, playersCount, difficulty, rng)
	if err != nil {
		return nil, err
	}
	if err := st.Save(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

// FromSave builds the game from a decoded save (load_state_from_hash). The
// values Rails derives on load, players_count and current_player, are
// methods here (PlayersCount, CurrentPlayer), so they always follow Players
// and CurrentPlayerIdx. Like Rails, enum values are taken as saved; only a
// city's cube count and the current player index are checked.
func FromSave(s *store.Save) (*GameState, error) {
	st := s.Status
	g := &GameState{
		ActionsRemaining:         st.ActionsRemaining,
		Phase:                    Phase(st.Phase),
		Turn:                     st.Turn,
		GameOver:                 st.GameOver,
		GameOverReason:           GameOverReason(st.GameOverReason),
		Outbreaks:                st.Outbreaks,
		InfectionRate:            st.InfectionRate,
		InfectionRatePosition:    st.InfectionRatePosition,
		CurrentPlayerIdx:         st.CurrentPlayerIdx,
		QuietNight:               st.QuietNight,
		ForecastActive:           st.ForecastActive,
		ForecastCards:            st.ForecastCards,
		OperationsExpertMoveUsed: st.OperationsExpertMoveUsed,
		DifficultyLevel:          Difficulty(st.DifficultyLevel),
		ResearchStations:         s.ResearchStations,
		Decks: Decks{
			PlayerDeck:       cardsFromSave(s.Decks.PlayerDeck),
			PlayerDiscard:    cardsFromSave(s.Decks.PlayerDiscard),
			InfectionDeck:    cardsFromSave(s.Decks.InfectionDeck),
			InfectionDiscard: cardsFromSave(s.Decks.InfectionDiscard),
		},
	}
	if p := st.PendingHandLimit; p != nil {
		g.PendingHandLimit = &PendingHandLimit{
			PlayerIndex: p.PlayerIndex, DiscardCount: p.DiscardCount, ReturnPhase: Phase(p.ReturnPhase),
		}
	}
	for _, d := range s.DiseaseCubes {
		g.DiseaseCubes = append(g.DiseaseCubes, DiseaseCubes{Color: Color(d.Color), Cured: d.Cured, InSupply: d.InSupply})
	}
	for _, c := range s.Cities {
		city := City{Key: c.Key, Name: c.Name, Color: Color(c.Color), Connections: c.Connections,
			HasResearchStation: c.HasResearchStation}
		if err := city.SetDiseaseCubes(c.DiseaseCubes); err != nil {
			return nil, err
		}
		g.Cities = append(g.Cities, city)
	}
	for _, p := range s.Players {
		g.Players = append(g.Players, Player{Role: Role(p.Role), Index: p.Index, Location: p.Location,
			Hand: cardsFromSave(p.Hand)})
	}
	// CurrentPlayer indexes Players directly (cc-439).
	if g.CurrentPlayerIdx < 0 || g.CurrentPlayerIdx >= len(g.Players) {
		return nil, fmt.Errorf("current_player_idx %d is not one of %d players", g.CurrentPlayerIdx, len(g.Players))
	}
	return g, nil
}

func cardsFromSave(cards []store.Card) []Card {
	out := make([]Card, len(cards))
	for i, c := range cards {
		out[i] = Card{Type: CardType(c.Type), Name: c.Name, Color: Color(c.Color), Retrieved: c.Retrieved}
	}
	return out
}

// ToSave is the inverse of FromSave (serialized_state).
func (g *GameState) ToSave() *store.Save {
	s := &store.Save{
		Status: store.Status{
			ActionsRemaining:         g.ActionsRemaining,
			Phase:                    string(g.Phase),
			Turn:                     g.Turn,
			GameOver:                 g.GameOver,
			GameOverReason:           string(g.GameOverReason),
			Outbreaks:                g.Outbreaks,
			InfectionRate:            g.InfectionRate,
			InfectionRatePosition:    g.InfectionRatePosition,
			CurrentPlayerIdx:         g.CurrentPlayerIdx,
			QuietNight:               g.QuietNight,
			ForecastActive:           g.ForecastActive,
			ForecastCards:            g.ForecastCards,
			OperationsExpertMoveUsed: g.OperationsExpertMoveUsed,
			DifficultyLevel:          string(g.DifficultyLevel),
		},
		ResearchStations: g.ResearchStations,
		Decks: store.Decks{
			PlayerDeck:       cardsToSave(g.Decks.PlayerDeck),
			PlayerDiscard:    cardsToSave(g.Decks.PlayerDiscard),
			InfectionDeck:    cardsToSave(g.Decks.InfectionDeck),
			InfectionDiscard: cardsToSave(g.Decks.InfectionDiscard),
		},
	}
	if p := g.PendingHandLimit; p != nil {
		s.Status.PendingHandLimit = &store.PendingHandLimit{
			PlayerIndex: p.PlayerIndex, DiscardCount: p.DiscardCount, ReturnPhase: string(p.ReturnPhase),
		}
	}
	for _, d := range g.DiseaseCubes {
		s.DiseaseCubes = append(s.DiseaseCubes, store.DiseaseCubes{Color: string(d.Color), Cured: d.Cured, InSupply: d.InSupply})
	}
	for i := range g.Cities {
		c := &g.Cities[i]
		s.Cities = append(s.Cities, store.City{Key: c.Key, Name: c.Name, Color: string(c.Color),
			Connections: c.Connections, DiseaseCubes: c.DiseaseCubes(), HasResearchStation: c.HasResearchStation})
	}
	for _, p := range g.Players {
		s.Players = append(s.Players, store.Player{Role: string(p.Role), Index: p.Index, Location: p.Location,
			Hand: cardsToSave(p.Hand)})
	}
	return s
}

func cardsToSave(cards []Card) []store.Card {
	out := make([]store.Card, len(cards))
	for i, c := range cards {
		out[i] = store.Card{Type: string(c.Type), Name: c.Name, Color: string(c.Color), Retrieved: c.Retrieved}
	}
	return out
}

var _ store.Persistable = (*GameState)(nil)

// EncodeSave makes GameState a store.Persistable: Store.Save inside an
// update encodes it at commit, so later changes are saved too, as in Rails.
func (g *GameState) EncodeSave() ([]byte, error) {
	return g.ToSave().EncodeSave()
}
