// Package contract loads the Rails API contract fixtures in testdata/contract
// (cc-369), the parity spec for the Go port.
package contract

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Request is the HTTP request a scenario sends. Body is kept raw so key order
// and null are preserved; a JSON null means the request has no body.
type Request struct {
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Headers map[string]string `json:"headers"`
	Body    json.RawMessage   `json:"body"`
}

// Response is the response Rails gives. Body is kept raw because key order
// matters when comparing.
type Response struct {
	Status      int             `json:"status"`
	ContentType string          `json:"content_type"`
	Body        json.RawMessage `json:"body"`
}

// Scenario is one scenarios/<name>/scenario.json. Save paths are relative to
// the fixture root; SaveAfter is "unchanged" when Redis keeps SaveBefore.
type Scenario struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	SaveBefore     string   `json:"save_before"`
	ConcurrentSave string   `json:"concurrent_save,omitempty"`
	Request        Request  `json:"request"`
	Response       Response `json:"response"`
	SaveAfter      string   `json:"save_after"`
}

// Unchanged is the SaveAfter value for scenarios that leave Redis untouched.
const Unchanged = "unchanged"

// LoadScenario reads scenarios/<name>/scenario.json under root.
func LoadScenario(root, name string) (*Scenario, error) {
	data, err := os.ReadFile(filepath.Join(root, "scenarios", name, "scenario.json"))
	if err != nil {
		return nil, err
	}
	var s Scenario
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// ScenarioNames lists the scenario directories under root.
func ScenarioNames(root string) ([]string, error) {
	entries, err := os.ReadDir(filepath.Join(root, "scenarios"))
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names, nil
}

// ReadSave returns a save exactly as it is stored in Redis.
func ReadSave(root, path string) ([]byte, error) {
	return os.ReadFile(filepath.Join(root, path))
}
