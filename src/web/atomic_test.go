package web_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// The HTTP half of the former Rails test_atomic_game_updates.rb. Request A (stale) reads the
// game; request B (fresh) then runs to completion before A goes on, so both
// start from the same snapshot.

func interleave(ts *testServer, stale, fresh func() *httptest.ResponseRecorder) (staleRec, freshRec *httptest.ResponseRecorder) {
	ts.afterFirstGet(func() { freshRec = fresh() })
	staleRec = stale()
	if freshRec == nil {
		ts.t.Fatal("the fresh request did not run")
	}
	return staleRec, freshRec
}

func TestInterleavedMovesNeverLoseAnAcknowledgedUpdate(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.yaml"))
	stale, fresh := interleave(ts,
		func() *httptest.ResponseRecorder {
			return ts.postJSON("/move", `{"player_index":0,"destination":"Bangkok"}`)
		},
		func() *httptest.ResponseRecorder {
			return ts.postJSON("/move", `{"player_index":0,"destination":"Shanghai"}`)
		},
	)

	if fresh.Code != http.StatusOK {
		t.Fatalf("fresh move: %d %s", fresh.Code, fresh.Body)
	}
	if stale.Code != http.StatusConflict {
		t.Fatalf("stale move: %d %s", stale.Code, stale.Body)
	}
	body := decodeBody(t, stale)
	if body["status"] != "conflict" || body["success"] != false {
		t.Errorf("conflict body %s", stale.Body)
	}
	location := body["game_state"].(map[string]any)["players"].([]any)[0].(map[string]any)["location"]
	if location != "Shanghai" {
		t.Errorf("conflict game_state has player 0 in %v, want the fresh move's Shanghai", location)
	}
	if g := ts.savedGame(); g.Players[0].Location != "Shanghai" || g.ActionsRemaining != 3 {
		t.Errorf("saved %s with %d actions", g.Players[0].Location, g.ActionsRemaining)
	}

	// The rejected client retries against the current state; both moves count.
	if rec := ts.postJSON("/move", `{"player_index":0,"destination":"Wuhan"}`); rec.Code != http.StatusOK {
		t.Fatalf("retry: %d %s", rec.Code, rec.Body)
	}
	if g := ts.savedGame(); g.Players[0].Location != "Wuhan" || g.ActionsRemaining != 2 {
		t.Errorf("saved %s with %d actions after the retry", g.Players[0].Location, g.ActionsRemaining)
	}
}

func TestStaleRestartIsRejectedWithoutWriting(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.yaml"))
	stale, fresh := interleave(ts,
		func() *httptest.ResponseRecorder { return ts.postJSON("/restart_game", `{}`) },
		func() *httptest.ResponseRecorder {
			return ts.postJSON("/move", `{"player_index":0,"destination":"Bangkok"}`)
		},
	)

	if fresh.Code != http.StatusOK || stale.Code != http.StatusConflict {
		t.Fatalf("fresh %d, stale %d: %s", fresh.Code, stale.Code, stale.Body)
	}
	if g := ts.savedGame(); g.Players[0].Location != "Bangkok" || g.ActionsRemaining != 3 {
		t.Errorf("saved %s with %d actions", g.Players[0].Location, g.ActionsRemaining)
	}
}

func TestConcurrentDrawCardsProgressesTheTurnOnlyOnce(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/draw_phase.yaml"))
	deck := len(ts.savedGame().Decks.PlayerDeck)
	stale, fresh := interleave(ts,
		func() *httptest.ResponseRecorder { return ts.postJSON("/draw_cards", `{}`) },
		func() *httptest.ResponseRecorder { return ts.postJSON("/draw_cards", `{}`) },
	)

	if fresh.Code != http.StatusOK || stale.Code != http.StatusConflict {
		t.Fatalf("fresh %d, stale %d: %s", fresh.Code, stale.Code, stale.Body)
	}
	g := ts.savedGame()
	if len(g.Decks.PlayerDeck) != deck-2 {
		t.Errorf("player deck has %d cards, want %d", len(g.Decks.PlayerDeck), deck-2)
	}
	if g.Phase != "infect_cities" && g.Phase != "pending_discard" {
		t.Errorf("phase %s", g.Phase)
	}
}

func TestReadOnlyRequestDoesNotConflictWithConcurrentUpdate(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.yaml"))
	stale, fresh := interleave(ts,
		func() *httptest.ResponseRecorder { return ts.do(http.MethodGet, "/game_state.json", "", "") },
		func() *httptest.ResponseRecorder {
			return ts.postJSON("/move", `{"player_index":0,"destination":"Bangkok"}`)
		},
	)

	if fresh.Code != http.StatusOK || stale.Code != http.StatusOK {
		t.Fatalf("fresh %d, stale %d: %s", fresh.Code, stale.Code, stale.Body)
	}
	if g := ts.savedGame(); g.Players[0].Location != "Bangkok" {
		t.Errorf("saved %s", g.Players[0].Location)
	}
}

// A new game dealt for a request is not written over one another request
// created meanwhile; the client gets 409 with that game.
func TestNewGameIsNotCommittedOverAConcurrentlyCreatedGame(t *testing.T) {
	ts := newTestServer(t, nil)
	concurrent := readFixture(t, "states/base.yaml")
	ts.afterFirstGet(func() {
		if err := ts.mr.Set(testKey, string(concurrent)); err != nil {
			t.Error(err)
		}
	})

	rec := ts.do(http.MethodGet, "/game_state.json", "", "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if _, ok := decodeBody(t, rec)["game_state"]; !ok {
		t.Error("conflict without the concurrent game_state")
	}
	if string(ts.saved()) != string(concurrent) {
		t.Error("the concurrent game was overwritten")
	}
}

// When the game that won is not readable, the 409 has no game_state.
func TestConflictWithoutReadableGameLeavesOutGameState(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.yaml"))
	ts.afterFirstGet(func() { ts.mr.Del(testKey) })

	rec := ts.postJSON("/move", `{"player_index":0,"destination":"Bangkok"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	want := `{"success":false,"status":"conflict","message":"The game was changed by another request. No changes were made; please retry."}`
	if rec.Body.String() != want {
		t.Errorf("body %s", rec.Body)
	}
}
