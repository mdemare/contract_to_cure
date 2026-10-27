package web

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/mdemare/contract_to_cure/src/game"
)

// Validation messages (validation_error_message). Field details are not
// exposed.
const (
	msgMissingParameters = "Missing required parameters"
	msgInvalidParameters = "Invalid parameters"
)

// maxBodyBytes limits a request body. The largest valid game request is a
// few hundred bytes; a larger body is answered with 413 (cc-483).
const maxBodyBytes = 64 << 10

// errInvalidJSON is a JSON request body that does not parse. Like Rails,
// which parses the body only when an action reads its params, endpoints
// without parameters never see it.
var errInvalidJSON = errors.New("Invalid JSON")

// errBadRequest is a form or query string that does not parse. Rails answers
// 400 with its (missing) public/400.html, so the body is empty.
var errBadRequest = errors.New("bad request")

// fieldType is the dry-schema type of a parameter.
type fieldType int

const (
	integerType fieldType = iota // :integer, coerced from strings and floats
	stringType                   // :string, never coerced
	stringsType                  // :array of :string
)

// field is one key of a GameRequestSchemas schema.
type field struct {
	name string
	typ  fieldType
	// required is required(...) rather than optional(...).
	required bool
	// maybe is .maybe(...), where nil and "" mean no value; otherwise it is
	// .filled(...).
	maybe bool
	// oneOf is included_in?.
	oneOf []string
}

// schema is a dry-schema Params schema. Only its keys are read from the
// request (validate_request slices them out of params).
type schema []field

// The request schemas, as the former Rails GameRequestSchemas defined them.
var (
	moveSchema = schema{
		{name: "player_index", typ: integerType, required: true},
		{name: "destination", typ: stringType, required: true},
		{name: "card_name", typ: stringType, maybe: true},
	}
	cureDiseaseSchema = schema{
		{name: "color", typ: stringType, required: true},
		{name: "card_names", typ: stringsType, required: true},
	}
	retrieveSchema = schema{
		{name: "action_card_name", typ: stringType, required: true},
	}
	shareKnowledgeSchema = schema{
		{name: "giving_player_index", typ: integerType, required: true},
		{name: "receiving_player_index", typ: integerType, required: true},
		{name: "city_name", typ: stringType, required: true},
	}
	discardCardsSchema = schema{
		{name: "player_index", typ: integerType, required: true},
		{name: "card_names", typ: stringsType, required: true},
	}
	actionCardSchema = schema{
		{name: "card", typ: stringType, required: true},
		{name: "city", typ: stringType, maybe: true},
		{name: "player_index", typ: integerType, maybe: true},
		{name: "card_order", typ: stringsType},
	}
	restartGameSchema = schema{
		{name: "difficulty_level", typ: stringType, maybe: true, oneOf: difficultyNames()},
	}
)

func difficultyNames() []string {
	names := make([]string, len(game.DifficultyLevels))
	for i, d := range game.DifficultyLevels {
		names[i] = string(d)
	}
	return names
}

// values are validated parameters (result.to_h). A key is absent when an
// optional parameter was not given or, for maybe fields, was nil or "".
type values map[string]any

func (v values) int(name string) int { n, _ := v[name].(int); return n }

// intPtr is a maybe integer: nil when not given.
func (v values) intPtr(name string) *int {
	if n, ok := v[name].(int); ok {
		return &n
	}
	return nil
}

// string is "" when not given, as the domain methods expect for nil.
func (v values) string(name string) string { s, _ := v[name].(string); return s }

// strings is nil when not given.
func (v values) strings(name string) []string { ss, _ := v[name].([]string); return ss }

// validate checks params against the schema. It returns the validated values,
// or the 422 message: "Missing required parameters" when any required key is
// missing, otherwise "Invalid parameters".
func (sc schema) validate(params map[string]any) (values, string) {
	out := values{}
	missing, invalid := false, false
	for _, f := range sc {
		raw, ok := params[f.name]
		if !ok {
			missing = missing || f.required
			continue
		}
		v, ok := f.coerce(raw)
		switch {
		case !ok:
			invalid = true
		case v != nil:
			out[f.name] = v
		}
	}
	switch {
	case missing:
		return nil, msgMissingParameters
	case invalid:
		return nil, msgInvalidParameters
	}
	return out, ""
}

// coerce applies the field's type, returning nil for an empty maybe value
// and false when the value is invalid.
func (f field) coerce(raw any) (any, bool) {
	if f.maybe && (raw == nil || raw == "") {
		return nil, true
	}
	switch f.typ {
	case integerType:
		n, ok := toInt(raw)
		return n, ok
	case stringType:
		s, ok := raw.(string)
		if !ok || (!f.maybe && s == "") {
			return nil, false
		}
		if f.oneOf != nil && !contains(f.oneOf, s) {
			return nil, false
		}
		return s, true
	case stringsType:
		items, ok := raw.([]any)
		if !ok || len(items) == 0 {
			return nil, false
		}
		ss := make([]string, len(items))
		for i, item := range items {
			if ss[i], ok = item.(string); !ok {
				return nil, false
			}
		}
		return ss, true
	}
	return nil, false
}

func contains(list []string, s string) bool {
	for _, item := range list {
		if item == s {
			return true
		}
	}
	return false
}

// toInt is dry-types' Params to_int: Integer(s, 10) for a string, which
// allows surrounding whitespace, a sign, a 0d prefix and single underscores
// between digits, and Integer(f) for a number, which truncates a float.
// Values outside int are invalid, where Ruby would use a Bignum.
func toInt(raw any) (int, bool) {
	switch v := raw.(type) {
	case json.Number:
		if n, err := strconv.ParseInt(string(v), 10, 0); err == nil {
			return int(n), true
		}
		f, err := v.Float64()
		if err != nil || math.IsNaN(f) || f >= math.MaxInt64 || f < math.MinInt64 {
			return 0, false
		}
		return int(f), true
	case string:
		return rubyInteger(v)
	}
	return 0, false
}

func rubyInteger(s string) (int, bool) {
	s = strings.Trim(s, " \t\n\v\f\r")
	sign := ""
	if s != "" && (s[0] == '+' || s[0] == '-') {
		sign, s = s[:1], s[1:]
	}
	if len(s) > 2 && s[0] == '0' && (s[1] == 'd' || s[1] == 'D') {
		s = s[2:]
	}
	if s == "" || s[0] == '_' || s[len(s)-1] == '_' || strings.Contains(s, "__") {
		return 0, false
	}
	digits := strings.ReplaceAll(s, "_", "")
	for _, c := range digits {
		if c < '0' || c > '9' {
			return 0, false
		}
	}
	n, err := strconv.ParseInt(sign+digits, 10, 0)
	return int(n), err == nil
}

// readParams returns the request's params the way Rails builds them: the
// body (JSON, or a form), overridden by the query string. In a form or query
// string, key[] collects an array; other bracketed keys are nested and never
// valid for these schemas. JSON nulls inside arrays are dropped (deep_munge),
// and a JSON body that is not an object adds no params. A body over
// maxBodyBytes is an *http.MaxBytesError.
func readParams(w http.ResponseWriter, r *http.Request) (map[string]any, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	params := map[string]any{}
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	switch mediaType {
	case "application/json", "text/x-json", "application/jsonrequest":
		if err := readJSONBody(r, params); err != nil {
			return nil, err
		}
	case "application/x-www-form-urlencoded", "":
		// Rack reads a POST without a content type as a form.
		if mediaType == "" && r.Method != http.MethodPost {
			break
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			return nil, err
		}
		form, err := url.ParseQuery(string(body))
		if err != nil {
			return nil, errBadRequest
		}
		mergeForm(params, form)
	case "multipart/form-data":
		if err := r.ParseMultipartForm(maxBodyBytes); err != nil {
			if tooLarge := new(http.MaxBytesError); errors.As(err, &tooLarge) {
				return nil, err
			}
			return nil, errBadRequest
		}
		mergeForm(params, r.MultipartForm.Value)
	}
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		return nil, errBadRequest
	}
	mergeForm(params, query)
	return params, nil
}

func readJSONBody(r *http.Request, params map[string]any) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	if len(bytes.TrimSpace(body)) == 0 {
		return nil
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return errInvalidJSON
	}
	if _, err := dec.Token(); err != io.EOF {
		return errInvalidJSON
	}
	if obj, ok := v.(map[string]any); ok {
		for k, val := range obj {
			params[k] = withoutNils(val)
		}
	}
	return nil
}

// withoutNils removes nulls from arrays, recursively, as Rails' deep_munge
// does with JSON params.
func withoutNils(v any) any {
	switch v := v.(type) {
	case []any:
		out := make([]any, 0, len(v))
		for _, item := range v {
			if item != nil {
				out = append(out, withoutNils(item))
			}
		}
		return out
	case map[string]any:
		for k, item := range v {
			v[k] = withoutNils(item)
		}
	}
	return v
}

func mergeForm(params map[string]any, form url.Values) {
	for key, vals := range form {
		switch {
		case strings.HasSuffix(key, "[]") && !strings.Contains(strings.TrimSuffix(key, "[]"), "["):
			items := make([]any, len(vals))
			for i, s := range vals {
				items[i] = s
			}
			params[strings.TrimSuffix(key, "[]")] = items
		case strings.Contains(key, "["):
			params[key[:strings.Index(key, "[")]] = map[string]any{}
		default:
			params[key] = vals[len(vals)-1]
		}
	}
}
