package game_test

import (
	"testing"

	"github.com/mdemare/contract_to_cure/src/game"
	"github.com/mdemare/contract_to_cure/src/store"
)

// fromSave and toSave map between store.Save and game.GameState so tests can
// start from the contract fixture saves and compare with their after.yaml.
// The real mapping belongs to the store wiring (cc-421).

func fromSave(t *testing.T, s *store.Save) *game.GameState {
	t.Helper()
	st := s.Status
	g := &game.GameState{
		ActionsRemaining:         st.ActionsRemaining,
		Phase:                    game.Phase(st.Phase),
		Turn:                     st.Turn,
		GameOver:                 st.GameOver,
		GameOverReason:           game.GameOverReason(st.GameOverReason),
		Outbreaks:                st.Outbreaks,
		InfectionRate:            st.InfectionRate,
		InfectionRatePosition:    st.InfectionRatePosition,
		CurrentPlayerIdx:         st.CurrentPlayerIdx,
		QuietNight:               st.QuietNight,
		ForecastActive:           st.ForecastActive,
		ForecastCards:            st.ForecastCards,
		OperationsExpertMoveUsed: st.OperationsExpertMoveUsed,
		DifficultyLevel:          game.Difficulty(st.DifficultyLevel),
		ResearchStations:         s.ResearchStations,
		Decks: game.Decks{
			PlayerDeck:       cardsFromSave(s.Decks.PlayerDeck),
			PlayerDiscard:    cardsFromSave(s.Decks.PlayerDiscard),
			InfectionDeck:    cardsFromSave(s.Decks.InfectionDeck),
			InfectionDiscard: cardsFromSave(s.Decks.InfectionDiscard),
		},
	}
	if p := st.PendingHandLimit; p != nil {
		g.PendingHandLimit = &game.PendingHandLimit{
			PlayerIndex: p.PlayerIndex, DiscardCount: p.DiscardCount, ReturnPhase: game.Phase(p.ReturnPhase),
		}
	}
	for _, d := range s.DiseaseCubes {
		g.DiseaseCubes = append(g.DiseaseCubes, game.DiseaseCubes{Color: game.Color(d.Color), Cured: d.Cured, InSupply: d.InSupply})
	}
	for _, c := range s.Cities {
		city := game.City{Key: c.Key, Name: c.Name, Color: game.Color(c.Color), Connections: c.Connections,
			HasResearchStation: c.HasResearchStation}
		if err := city.SetDiseaseCubes(c.DiseaseCubes); err != nil {
			t.Fatal(err)
		}
		g.Cities = append(g.Cities, city)
	}
	for _, p := range s.Players {
		g.Players = append(g.Players, game.Player{Role: game.Role(p.Role), Index: p.Index, Location: p.Location,
			Hand: cardsFromSave(p.Hand)})
	}
	return g
}

func cardsFromSave(cards []store.Card) []game.Card {
	out := make([]game.Card, len(cards))
	for i, c := range cards {
		out[i] = game.Card{Type: game.CardType(c.Type), Name: c.Name, Color: game.Color(c.Color), Retrieved: c.Retrieved}
	}
	return out
}

func toSave(g *game.GameState) *store.Save {
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

func cardsToSave(cards []game.Card) []store.Card {
	out := make([]store.Card, len(cards))
	for i, c := range cards {
		out[i] = store.Card{Type: string(c.Type), Name: c.Name, Color: string(c.Color), Retrieved: c.Retrieved}
	}
	return out
}

func encode(t *testing.T, g *game.GameState) []byte {
	t.Helper()
	data, err := toSave(g).EncodeSave()
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// TestSaveMappingRoundTrips checks the test mapping itself: every fixture
// state survives save -> GameState -> save byte for byte.
func TestSaveMappingRoundTrips(t *testing.T) {
	for _, name := range fixtureStates(t) {
		data := readFixture(t, name)
		if name == "states/legacy_save.yaml" {
			continue // gains the defaulted fields when written
		}
		if got := encode(t, decodeFixture(t, data)); string(got) != string(data) {
			t.Errorf("%s does not round-trip", name)
		}
	}
}
