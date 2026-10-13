package game

// Exported for the external tests only.

// AddDiseaseCubes is addDiseaseCubes.
func (g *GameState) AddDiseaseCubes(cityKey string, color Color, count int, events *[]Event) *GameOverEvent {
	return g.addDiseaseCubes(cityKey, color, count, events)
}

// TriggerOutbreak is triggerOutbreak with a new chain, which it returns.
func (g *GameState) TriggerOutbreak(cityKey string, events *[]Event) (*GameOverEvent, []string) {
	chain := []string{}
	over := g.triggerOutbreak(cityKey, events, &chain)
	return over, chain
}
