package contract

import (
	"bytes"
	"os"
	"regexp"
	"testing"
)

const root = "../../testdata/contract"

func TestLoadScenario(t *testing.T) {
	s, err := LoadScenario(root, "move_conflict")
	if err != nil {
		t.Fatal(err)
	}
	if s.Request.Method != "POST" || s.Request.Path != "/move" {
		t.Errorf("request = %s %s, want POST /move", s.Request.Method, s.Request.Path)
	}
	if s.Response.Status != 409 {
		t.Errorf("status = %d, want 409", s.Response.Status)
	}
	if s.Response.ContentType != "application/json; charset=utf-8" {
		t.Errorf("content type = %q", s.Response.ContentType)
	}

	save, err := ReadSave(root, s.ConcurrentSave)
	if err != nil {
		t.Fatal(err)
	}
	// Saves keep Ruby's symbol keys byte for byte.
	if !bytes.Contains(save, []byte(":game_status:")) {
		t.Errorf("%s has no :game_status: key", s.ConcurrentSave)
	}
}

func TestEveryScenarioLoads(t *testing.T) {
	names, err := ScenarioNames(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) == 0 {
		t.Fatal("no scenarios found")
	}
	for _, name := range names {
		s, err := LoadScenario(root, name)
		if err != nil {
			t.Errorf("%s: %v", name, err)
			continue
		}
		if s.Name != name {
			t.Errorf("%s: name = %q", name, s.Name)
		}
		saves := []string{s.SaveBefore}
		if s.ConcurrentSave != "" {
			saves = append(saves, s.ConcurrentSave)
		}
		if s.SaveAfter != Unchanged {
			saves = append(saves, s.SaveAfter)
		}
		for _, path := range saves {
			if _, err := ReadSave(root, path); err != nil {
				t.Errorf("%s: %v", name, err)
			}
		}
	}
}

func TestReadmeHasNoTestRunnerOutput(t *testing.T) {
	readme, err := os.ReadFile(root + "/README.md")
	if err != nil {
		t.Fatal(err)
	}
	runnerOutput := regexp.MustCompile(`(?m)^(Run options: --seed|# Running:|Finished in .* runs/s|\d+ runs, \d+ assertions)`)
	if runnerOutput.Match(readme) {
		t.Error("testdata/contract/README.md contains Minitest output")
	}
}
