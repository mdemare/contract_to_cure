package game_test

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/mdemare/contract_to_cure/src/contract"
)

// fixtureView returns the JSON view in a scenario's response, compacted: the
// value of game_state, the whole body (the end of a Forecast), or the body
// of GET /game_state.json without current_user. ok is false when the
// response has no view.
func fixtureView(t *testing.T, sc *contract.Scenario) (view string, ok bool) {
	t.Helper()
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(sc.Response.Body, &fields); err != nil {
		return "", false
	}
	raw, ok := fields["game_state"]
	if !ok {
		if _, isView := fields["gameStatus"]; !isView {
			return "", false
		}
		raw = withoutKey(t, sc.Response.Body, "current_user")
	}
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		t.Fatal(err)
	}
	return buf.String(), true
}

// withoutKey re-encodes a JSON object without one key, keeping the order.
func withoutKey(t *testing.T, raw []byte, drop string) []byte {
	t.Helper()
	dec := json.NewDecoder(bytes.NewReader(raw))
	if tok, err := dec.Token(); err != nil || tok != json.Delim('{') {
		t.Fatalf("not a JSON object: %s", raw)
	}
	var buf bytes.Buffer
	buf.WriteByte('{')
	for dec.More() {
		key, err := dec.Token()
		if err != nil {
			t.Fatal(err)
		}
		var val json.RawMessage
		if err := dec.Decode(&val); err != nil {
			t.Fatal(err)
		}
		if key == drop {
			continue
		}
		if buf.Len() > 1 {
			buf.WriteByte(',')
		}
		buf.Write(marshal(t, key))
		buf.WriteByte(':')
		buf.Write(val)
	}
	buf.WriteByte('}')
	return buf.Bytes()
}

// viewSave is the save a scenario's view shows: the concurrent save of a
// conflict, else save_after, or save_before when nothing was saved.
func viewSave(sc *contract.Scenario) string {
	switch {
	case sc.ConcurrentSave != "":
		return sc.ConcurrentSave
	case sc.SaveAfter != contract.Unchanged:
		return sc.SaveAfter
	default:
		return sc.SaveBefore
	}
}

// TestViewScenarios builds the JSON view from the save of every contract
// scenario whose response contains one and compares it with the fixture
// byte for byte, so key order and null vs missing keys count.
func TestViewScenarios(t *testing.T) {
	scenarios := loadScenarios(t, func(*contract.Scenario) bool { return true })
	ran := 0
	for name, sc := range scenarios {
		want, ok := fixtureView(t, sc)
		if !ok {
			continue
		}
		ran++
		t.Run(name, func(t *testing.T) {
			g := decodeFixture(t, readFixture(t, viewSave(sc)))
			if got := string(marshal(t, g)); got != want {
				t.Errorf("view of %s:\n got %s\nwant %s", viewSave(sc), got, want)
			}
		})
	}
	if ran < 34 {
		t.Fatalf("only %d scenarios with a view", ran)
	}
}
