package web_test

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"
)

// TestParamsLikeRails pins how request params are read, coerced and
// validated. Every row was recorded from the Rails app (GameRequestSchemas
// with dry-schema Params) on states/base.json for cc-422.
func TestParamsLikeRails(t *testing.T) {
	const (
		jsonCT  = "application/json"
		formCT  = "application/x-www-form-urlencoded"
		missing = "Missing required parameters"
		invalid = "Invalid parameters"
		moved   = "Successfully moved scientist from Wuhan to Bangkok via drive / ferry"
		need4   = "Need 4 cards of the same color to discover a cure"
	)
	for _, tc := range []struct {
		name, path, contentType, body string
		status                        int
		message                       string
	}{
		// The body is parsed only when an action reads params.
		{"treat ignores invalid JSON", "/treat", jsonCT, "invalid json", 200, "Treated red disease in Wuhan"},
		{"move rejects invalid JSON", "/move", jsonCT, "invalid json", 400, "Invalid JSON"},
		{"invalid JSON after a valid value", "/move", jsonCT, `{"player_index":0,"destination":"Bangkok"} x`, 400, "Invalid JSON"},
		{"charset in content type", "/treat", "application/json; charset=utf-8", `{"x":1}`, 200, "Treated red disease in Wuhan"},

		// Integers: Integer(s, 10) for strings, Integer(f) for numbers.
		{"integer string", "/move", jsonCT, `{"player_index":"0","destination":"Bangkok"}`, 200, moved},
		{"integer string with spaces", "/move", jsonCT, `{"player_index":" 0 ","destination":"Bangkok"}`, 200, moved},
		{"float truncates", "/move", jsonCT, `{"player_index":0.7,"destination":"Bangkok"}`, 200, moved},
		{"float string", "/move", jsonCT, `{"player_index":"0.0","destination":"Bangkok"}`, 422, invalid},
		{"boolean integer", "/move", jsonCT, `{"player_index":true,"destination":"Bangkok"}`, 422, invalid},
		{"null integer", "/move", jsonCT, `{"player_index":null,"destination":"Bangkok"}`, 422, invalid},
		{"empty integer", "/move", jsonCT, `{"player_index":"","destination":"Bangkok"}`, 422, invalid},
		{"underscore and plus sign", "/share_knowledge", jsonCT, `{"giving_player_index":"1_0","receiving_player_index":"+1","city_name":"X"}`, 422, "Unknown player 10"},
		{"exponent and negative zero", "/share_knowledge", jsonCT, `{"giving_player_index":1e2,"receiving_player_index":-0,"city_name":"X"}`, 422, "Unknown player 100"},

		// Strings are not coerced; filled rejects "", maybe turns it into nil.
		{"empty required string", "/move", jsonCT, `{"player_index":0,"destination":""}`, 422, invalid},
		{"number as string", "/move", jsonCT, `{"player_index":0,"destination":5}`, 422, invalid},
		{"empty maybe string", "/move", jsonCT, `{"player_index":0,"destination":"Bangkok","card_name":""}`, 200, moved},
		{"number as maybe string", "/move", jsonCT, `{"player_index":0,"destination":"Bangkok","card_name":5}`, 422, invalid},
		{"empty maybe integer and string", "/action_card", jsonCT, `{"card":"Airlift","player_index":"","city":""}`, 422, "No player has the Airlift card"},
		{"bad maybe integer", "/action_card", jsonCT, `{"card":"Airlift","player_index":"1x"}`, 422, invalid},
		{"difficulty is case sensitive", "/restart_game", jsonCT, `{"difficulty_level":"Heroic"}`, 422, invalid},
		{"empty difficulty keeps the current one", "/restart_game", jsonCT, `{"difficulty_level":""}`, 200, "Game restarted successfully"},
		{"number as difficulty", "/restart_game", jsonCT, `{"difficulty_level":5}`, 422, invalid},

		// Any missing required key makes the message "Missing".
		{"array body", "/move", jsonCT, `[1,2]`, 422, missing},
		{"empty body", "/move", jsonCT, ``, 422, missing},
		{"null body", "/move", jsonCT, `null`, 422, missing},
		{"one key missing", "/move", jsonCT, `{"player_index":0}`, 422, missing},
		{"missing beats invalid", "/move", jsonCT, `{"player_index":"x"}`, 422, missing},
		{"text body is not read", "/move", "text/plain", `{"player_index":0,"destination":"Bangkok"}`, 422, missing},
		{"no content type reads a form", "/move", "", `{"player_index":0,"destination":"London"}`, 422, missing},

		// Arrays: nulls are dropped, then filled and each(:string) apply.
		{"null in array dropped", "/cure_disease", jsonCT, `{"color":"blue","card_names":["A",null]}`, 422, need4},
		{"only null in array", "/cure_disease", jsonCT, `{"color":"blue","card_names":[null]}`, 422, invalid},
		{"empty array", "/cure_disease", jsonCT, `{"color":"blue","card_names":[]}`, 422, invalid},
		{"empty string as array", "/cure_disease", jsonCT, `{"color":"blue","card_names":""}`, 422, invalid},
		{"string as array", "/cure_disease", jsonCT, `{"color":"blue","card_names":"A"}`, 422, invalid},
		{"number in array", "/cure_disease", jsonCT, `{"color":"blue","card_names":[1]}`, 422, invalid},
		{"object as array", "/cure_disease", jsonCT, `{"color":"blue","card_names":{"a":"b"}}`, 422, invalid},
		{"unknown color reaches the action", "/cure_disease", jsonCT, `{"color":"purple","card_names":["A"]}`, 422, need4},
		{"null optional array", "/action_card", jsonCT, `{"card":"Forecast","card_order":null}`, 422, invalid},

		// Forms and query strings.
		{"form", "/move", formCT, "player_index=0&destination=Bangkok", 200, moved},
		{"form array", "/cure_disease", formCT, "color=blue&card_names[]=A&card_names[]=B", 422, need4},
		{"query string", "/move?player_index=0&destination=Bangkok", "", "", 200, moved},
		{"query string wins over the body", "/move?player_index=0&destination=Bangkok", jsonCT, `{"destination":"Kyoto"}`, 200, moved},
		{"unexpected keys are ignored", "/move", jsonCT, `{"player_index":0,"destination":"Bangkok","extra":[1]}`, 200, moved},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ts := newTestServer(t, readFixture(t, "states/base.json"))
			rec := ts.do(http.MethodPost, tc.path, tc.contentType, tc.body)
			if rec.Code != tc.status {
				t.Errorf("status %d, want %d: %s", rec.Code, tc.status, rec.Body)
			}
			if ct := rec.Header().Get("Content-Type"); ct != jsonType {
				t.Errorf("content type %q", ct)
			}
			if msg := decodeBody(t, rec)["message"]; msg != tc.message {
				t.Errorf("message %q, want %q", msg, tc.message)
			}
		})
	}
}

// A form or query string that does not parse is a 400 with no body.
func TestUnparsableQueryIsBadRequest(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.json"))
	rec := ts.do(http.MethodPost, "/move?player_index=%zz", "", "")
	if rec.Code != http.StatusBadRequest || rec.Body.Len() != 0 {
		t.Errorf("%d %q", rec.Code, rec.Body)
	}
}

// A body over 64 KB is a 413 with the usual error JSON, and the action does
// not run (cc-483).
func TestOversizedBodyIs413(t *testing.T) {
	const limit = 64 << 10
	padding := strings.Repeat("x", limit)
	multipartBody := func(value string) (string, string) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		mw.WriteField("player_index", "0")
		mw.WriteField("destination", value)
		mw.Close()
		return mw.FormDataContentType(), buf.String()
	}
	bigMultipartCT, bigMultipart := multipartBody("Bangkok" + padding)
	smallMultipartCT, smallMultipart := multipartBody("Bangkok")
	jsonWithPad := func(pad string) string {
		return `{"player_index":0,"destination":"Bangkok","pad":"` + pad + `"}`
	}
	atLimit := jsonWithPad(padding[:limit-len(jsonWithPad(""))])
	for _, tc := range []struct {
		name, contentType, body string
		status                  int
	}{
		{"JSON", "application/json", jsonWithPad(padding), 413},
		{"JSON one byte over the limit", "application/json", atLimit + " ", 413},
		{"form", "application/x-www-form-urlencoded", "player_index=0&destination=Bangkok&pad=" + padding, 413},
		{"no content type", "", "player_index=0&destination=Bangkok&pad=" + padding, 413},
		{"multipart", bigMultipartCT, bigMultipart, 413},
		{"JSON at the limit", "application/json", atLimit, 200},
		{"multipart under the limit", smallMultipartCT, smallMultipart, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ts := newTestServer(t, readFixture(t, "states/base.yaml"))
			before := ts.saved()
			rec := ts.do(http.MethodPost, "/move", tc.contentType, tc.body)
			if rec.Code != tc.status {
				t.Fatalf("status %d, want %d: %.200s", rec.Code, tc.status, rec.Body)
			}
			if tc.status == 200 {
				if bytes.Equal(ts.saved(), before) {
					t.Error("the move was not saved")
				}
				return
			}
			body := decodeBody(t, rec)
			if body["status"] != "error" || body["message"] != "Request body too large" {
				t.Errorf("body %v", body)
			}
			if !bytes.Equal(ts.saved(), before) {
				t.Error("the game was saved")
			}
		})
	}
}
