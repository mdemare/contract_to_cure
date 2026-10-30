// Package repocheck holds tests for the repository's build, CI, deployment
// and README files (ported from the Ruby suite in cc-428).
package repocheck

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"
)

const root = "../.."

func read(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(root, path))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func goVersion(t *testing.T) string {
	t.Helper()
	m := regexp.MustCompile(`(?m)^go (\S+)$`).FindStringSubmatch(read(t, "go.mod"))
	if m == nil {
		t.Fatal("go.mod has no go line")
	}
	return m[1]
}

// CI must validate through make check, which needs Node.js 22+ and Go
// (cc-288, cc-370).

type step struct {
	Uses string            `yaml:"uses"`
	Run  string            `yaml:"run"`
	With map[string]string `yaml:"with"`
}

func ciSteps(t *testing.T) []step {
	t.Helper()
	var workflow struct {
		Jobs map[string]struct {
			Steps []step `yaml:"steps"`
		} `yaml:"jobs"`
	}
	if err := yaml.Unmarshal([]byte(read(t, ".github/workflows/test.yml")), &workflow); err != nil {
		t.Fatal(err)
	}
	var steps []step
	for _, job := range workflow.Jobs {
		steps = append(steps, job.Steps...)
	}
	return steps
}

func runsLine(s step, line string) bool {
	for _, l := range strings.Split(s.Run, "\n") {
		if strings.TrimSpace(l) == line {
			return true
		}
	}
	return false
}

func TestCIRunsMakeCheckAfterSettingUpNodeAndGo(t *testing.T) {
	steps := ciSteps(t)
	check := slices.IndexFunc(steps, func(s step) bool { return runsLine(s, "make check") })
	if check < 0 {
		t.Fatal("CI must run make check")
	}

	node := slices.IndexFunc(steps, func(s step) bool { return strings.HasPrefix(s.Uses, "actions/setup-node@") })
	if node < 0 || node > check {
		t.Error("CI must set up Node.js before make check")
	} else {
		major, _ := strconv.Atoi(regexp.MustCompile(`^\d+`).FindString(steps[node].With["node-version"]))
		if major < 22 {
			t.Errorf("node-version %q, want 22 or newer", steps[node].With["node-version"])
		}
	}

	goStep := slices.IndexFunc(steps, func(s step) bool { return strings.HasPrefix(s.Uses, "actions/setup-go@") })
	if goStep < 0 || goStep > check {
		t.Error("CI must set up Go before make check")
	} else if v := steps[goStep].With["go-version"]; v != goVersion(t) {
		t.Errorf("go-version %q, want go.mod's %q", v, goVersion(t))
	}
}

// The image runs the Go binary (cc-425): `make` builds ./main on the host
// and docker compose copies it into an Alpine image (Q6-xx).

func TestDefaultMakeTargetBuildsTheBinaryThenTheImage(t *testing.T) {
	makefile := read(t, "Makefile")
	for _, pattern := range []string{
		`(?m)^all: build docker$`,
		`(?m)^build:\n\tCGO_ENABLED=0 go build .*-o main \./src$`,
		`(?m)^docker:\n(?:\t.*\n)*\tdocker compose -f \$\(COMPOSE_FILE\) build$`,
	} {
		if !regexp.MustCompile(pattern).MatchString(makefile) {
			t.Errorf("Makefile does not match %s", pattern)
		}
	}
}

// cc-457: the drawer shows body[data-git-hash], the short commit SHA.
func TestBuildStampsTheShortCommitSHAAsGitHash(t *testing.T) {
	sha, err := exec.Command("git", "-C", root, "rev-parse", "--short=6", "HEAD").Output()
	if err != nil || len(strings.TrimSpace(string(sha))) == 0 {
		t.Skipf("no git checkout: %v", err)
	}
	commands, err := exec.Command("make", "-s", "-n", "-C", root, "build").CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %s", err, commands)
	}
	want := `-ldflags "-X main.gitHash=` + strings.TrimSpace(string(sha)) + `"`
	if !strings.Contains(string(commands), want) {
		t.Errorf("make build runs %s, want %s", commands, want)
	}
}

func TestDockerfileRunsTheBinaryAsNonRootOnPort2583(t *testing.T) {
	dockerfile := read(t, "Dockerfile")
	for _, pattern := range []string{
		`(?m)^FROM alpine:`,
		`(?m)^COPY main `,
		`(?m)^COPY public `,
		`(?m)^USER app$`,
		`(?m)^EXPOSE 2583$`,
		`(?m)^CMD \["\./main"\]$`,
	} {
		if !regexp.MustCompile(pattern).MatchString(dockerfile) {
			t.Errorf("Dockerfile does not match %s", pattern)
		}
	}
}

func TestDockerignoreKeepsSecretsAndGitOut(t *testing.T) {
	var entries []string
	for _, line := range strings.Split(read(t, ".dockerignore"), "\n") {
		if line = strings.TrimSpace(line); line != "" && !strings.HasPrefix(line, "#") {
			entries = append(entries, line)
		}
	}
	if len(entries) == 0 || entries[0] != "*" {
		t.Errorf("first entry is not *: %v", entries)
	}
	for _, e := range []string{"!.env", "!.git"} {
		if slices.Contains(entries, e) {
			t.Errorf(".dockerignore has %s", e)
		}
	}
	for _, e := range []string{"!main", "!.version", "!public"} {
		if !slices.Contains(entries, e) {
			t.Errorf(".dockerignore lacks %s", e)
		}
	}
}

type webapp struct {
	Command     []string          `yaml:"command"`
	Environment map[string]string `yaml:"environment"`
	EnvFile     []map[string]any  `yaml:"env_file"`
	Healthcheck struct {
		Test []string `yaml:"test"`
	} `yaml:"healthcheck"`
	Ports []string `yaml:"ports"`
}

func composeWebapp(t *testing.T, file string) webapp {
	t.Helper()
	var compose struct {
		Services struct {
			Webapp webapp `yaml:"webapp"`
		} `yaml:"services"`
	}
	if err := yaml.Unmarshal([]byte(read(t, file)), &compose); err != nil {
		t.Fatal(err)
	}
	return compose.Services.Webapp
}

func TestComposeFilesRunTheBinaryWithAWgetHealthcheck(t *testing.T) {
	ports := map[string][]string{
		"docker-compose.production.yml": {"${EXPOSED_PORT:-3100}:2583"},
		"docker-compose.staging.yml":    {"1${EXPOSED_PORT:-3100}:2583"},
	}
	for file, wantPorts := range ports {
		w := composeWebapp(t, file)
		if !slices.Equal(w.Command, []string{"./main"}) {
			t.Errorf("%s: command %v", file, w.Command)
		}
		if !reflect.DeepEqual(w.Environment, map[string]string{"PORT": "2583"}) {
			t.Errorf("%s: environment %v", file, w.Environment)
		}
		if !reflect.DeepEqual(w.EnvFile, []map[string]any{{"path": ".env", "required": false}}) {
			t.Errorf("%s: env_file %v", file, w.EnvFile)
		}
		if want := []string{"CMD", "wget", "-q", "-O", "/dev/null", "http://localhost:2583/up"}; !slices.Equal(w.Healthcheck.Test, want) {
			t.Errorf("%s: healthcheck %v", file, w.Healthcheck.Test)
		}
		if !slices.Equal(w.Ports, wantPorts) {
			t.Errorf("%s: ports %v, want %v", file, w.Ports, wantPorts)
		}
	}
}

// make check must fail when a stage fails. Each probe copies the Makefile
// into a temporary directory and stubs the other stage's command.

func runCheck(t *testing.T, target, stub string, files map[string]string) (string, error) {
	t.Helper()
	dir := t.TempDir()
	files["Makefile"] = read(t, "Makefile")
	files["bin/"+stub] = "#!/bin/sh\nexit 0\n"
	// Files named after targets must not stop make from running them.
	for _, name := range []string{"check", "full-check", "js-test", "go-test", "go-full-test", "go-vet"} {
		files[name] = ""
	}
	for name, content := range files {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	cmd := exec.Command("make", target)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "PATH="+filepath.Join(dir, "bin")+string(os.PathListSeparator)+os.Getenv("PATH"))
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func jsProbe(assertion string) map[string]string {
	return map[string]string{"test/js/probe.mjs": `import test from 'node:test';
import assert from 'node:assert/strict';
test('JavaScript check probe', () => { ` + assertion + ` });
`}
}

func TestCheckRunsJavaScript(t *testing.T) {
	if testing.Short() {
		t.Skip("slow integration test; run make full-check")
	}

	for _, target := range []string{"check", "full-check"} {
		t.Run(target, func(t *testing.T) {
			out, err := runCheck(t, target, "go", jsProbe("assert.ok(true)"))
			if err != nil || !strings.Contains(out, "JavaScript check probe") {
				t.Errorf("make %s: %v\n%s", target, err, out)
			}
		})
	}
}

func TestCheckPropagatesJavaScriptFailures(t *testing.T) {
	if testing.Short() {
		t.Skip("slow integration test; run make full-check")
	}

	for _, target := range []string{"check", "full-check"} {
		t.Run(target, func(t *testing.T) {
			out, err := runCheck(t, target, "go", jsProbe(`assert.fail("JavaScript failure sentinel")`))
			if err == nil || !strings.Contains(out, "JavaScript failure sentinel") {
				t.Errorf("make %s: %v\n%s", target, err, out)
			}
		})
	}
}

func TestCheckPropagatesGoFailures(t *testing.T) {
	if testing.Short() {
		t.Skip("slow integration test; run make full-check")
	}

	for _, target := range []string{"check", "full-check"} {
		t.Run(target, func(t *testing.T) {
			out, err := runCheck(t, target, "node", map[string]string{
				"go.mod": read(t, "go.mod"),
				"src/probe_test.go": `package probe

import "testing"

func TestProbe(t *testing.T) { t.Fatal("Go failure sentinel") }
`,
			})
			if err == nil || !strings.Contains(out, "Go failure sentinel") {
				t.Errorf("make %s: %v\n%s", target, err, out)
			}
		})
	}
}

func TestFullCheckIncludesSlowTests(t *testing.T) {
	if testing.Short() {
		t.Skip("slow integration test; run make full-check")
	}
	for _, target := range []string{"check", "full-check"} {
		t.Run(target, func(t *testing.T) {
			out, err := runCheck(t, target, "node", map[string]string{
				"go.mod": read(t, "go.mod"),
				"src/probe_test.go": `package probe

import "testing"

func TestSlowProbe(t *testing.T) {
	if testing.Short() { t.Skip("slow probe") }
	t.Fatal("slow failure sentinel")
}
`,
			})
			if target == "check" {
				if err != nil || strings.Contains(out, "slow failure sentinel") {
					t.Fatalf("short check ran slow test: %v\n%s", err, out)
				}
			} else if err == nil || !strings.Contains(out, "slow failure sentinel") {
				t.Fatalf("full check did not propagate slow failure: %v\n%s", err, out)
			}
		})
	}
}

// Verify stage selection and every failure path without compiling nested Go
// suites. runCheck also creates files named after targets to verify .PHONY.
func TestCheckTargetsSelectStagesAndPropagateFailures(t *testing.T) {
	for _, target := range []string{"check", "full-check"} {
		for _, failing := range []string{"", "node", "vet", "test"} {
			t.Run(target+"/fail="+failing, func(t *testing.T) {
				goArgs := "test -short ./..."
				if target == "full-check" {
					goArgs = "test -count=1 -timeout=0 ./..."
				}
				out, err := runCheck(t, target, "unused", map[string]string{
					"bin/node": "#!/bin/sh\necho NODE_STAGE\n" +
						"[ '" + failing + "' != node ]\n",
					"bin/go": "#!/bin/sh\necho GO_STAGE \"$@\"\n" +
						"[ \"$1\" != '" + failing + "' ]\n",
				})
				if (err != nil) != (failing != "") {
					t.Fatalf("make %s (failure %q): %v\n%s", target, failing, err, out)
				}
				if failing == "" {
					for _, stage := range []string{"NODE_STAGE", "GO_STAGE vet ./...", "GO_STAGE " + goArgs} {
						if !strings.Contains(out, stage) {
							t.Errorf("make %s missing %q:\n%s", target, stage, out)
						}
					}
				}
			})
		}
	}
}

// README.md only points to the noca knowledge base (cc-478). Keep the
// pointers well formed and the quoted setup facts in line with the repo.

func TestReadmeNocaViewCommandsUseQuestionKeys(t *testing.T) {
	readme := read(t, "README.md")
	commands := regexp.MustCompile("`noca view ([^`]+)`").FindAllStringSubmatch(readme, -1)
	if len(commands) == 0 {
		t.Fatal("README has no noca view commands")
	}
	key := regexp.MustCompile(`^Q\d+-cc$`)
	for _, c := range commands {
		for _, k := range strings.Split(c[1], ",") {
			if k != "<key>" && !key.MatchString(k) {
				t.Errorf("malformed reference in `noca view %s`", c[1])
			}
		}
	}
	if !strings.Contains(readme, "`noca list question --all`") {
		t.Error("README does not explain how to list all questions")
	}
}

func TestReadmeQuotesQuestionsWithKeys(t *testing.T) {
	var quoted []string
	for _, m := range regexp.MustCompile(`(?m)^> \*\*(Q\d+-cc):`).FindAllStringSubmatch(read(t, "README.md"), -1) {
		quoted = append(quoted, m[1])
	}
	if want := []string{"Q44-cc", "Q8-cc", "Q37-cc"}; !slices.Equal(quoted, want) {
		t.Errorf("quoted %v, want %v", quoted, want)
	}
}

func TestReadmeDropsStaleInstructions(t *testing.T) {
	readme := strings.ToLower(read(t, "README.md"))
	for _, stale := range []string{"sinatra", "current_game.yaml", "new_game", "public/index.html", "rails", "ruby", "puma"} {
		if strings.Contains(readme, stale) {
			t.Errorf("README mentions %s", stale)
		}
	}
}

func TestReadmeQuotedSetupMatchesTheRepo(t *testing.T) {
	readme := read(t, "README.md")
	if !strings.Contains(read(t, "src/main.go"), `port = "2583"`) {
		t.Error("src/main.go no longer defaults to port 2583")
	}
	for _, want := range []string{
		"http://localhost:2583",
		"`make build && DEPLOYMENT_ENV=development ./main`",
		"`make check`",
	} {
		if !strings.Contains(readme, want) {
			t.Errorf("README lacks %s", want)
		}
	}
	makefile := read(t, "Makefile")
	for _, target := range []string{"build", "check"} {
		if !regexp.MustCompile(`(?m)^` + target + `:`).MatchString(makefile) {
			t.Errorf("Makefile has no %s target", target)
		}
	}
}

// The app keeps its state in Redis and has no database. Ticket worktrees get
// a throwaway PostgreSQL database in .env's TEST_DATABASE_* block, alongside
// libpq's PG* variables (cc-491). Nothing may read production DATABASE_* or
// PG* settings; tests that ever need a database must use TEST_DATABASE_* and
// skip or fail without it.

var databaseSetting = regexp.MustCompile(`\b(DATABASE_[A-Z]+|PG(HOST|PORT|DATABASE|USER|PASSWORD))\b`)

func readsDatabaseSetting(text string) []string {
	var found []string
	for _, m := range databaseSetting.FindAllStringIndex(text, -1) {
		if !strings.HasSuffix(text[:m[0]], "TEST_") {
			found = append(found, text[m[0]:m[1]])
		}
	}
	return found
}

func TestReadsDatabaseSettingIgnoresTestDatabaseVariables(t *testing.T) {
	for text, want := range map[string][]string{
		`os.Getenv("DATABASE_URL")`:                 {"DATABASE_URL"},
		"DATABASE_HOST=db\nPGPASSWORD=x":            {"DATABASE_HOST", "PGPASSWORD"},
		`os.Getenv("TEST_DATABASE_NAME")`:           nil,
		"TEST_DATABASE_USER=u TEST_DATABASE_PORT=1": nil,
		"MY_DATABASE_URL PGHOSTNAME database_url":   nil,
		"TEST_DATABASE_HOST DATABASE_PORT":          {"DATABASE_PORT"},
	} {
		if got := readsDatabaseSetting(text); !slices.Equal(got, want) {
			t.Errorf("readsDatabaseSetting(%q) = %v, want %v", text, got, want)
		}
	}
}

func TestNoTrackedFileReadsProductionDatabaseSettings(t *testing.T) {
	out, err := exec.Command("git", "-C", root, "ls-files", "-z").Output()
	if err != nil {
		t.Skipf("git ls-files: %v", err)
	}
	for _, path := range strings.Split(strings.TrimRight(string(out), "\x00"), "\x00") {
		if path == "src/repocheck/repo_test.go" {
			continue
		}
		b, err := os.ReadFile(filepath.Join(root, path))
		if err != nil {
			t.Fatal(err)
		}
		if found := readsDatabaseSetting(string(b)); found != nil {
			t.Errorf("%s mentions %v; tests must use TEST_DATABASE_* (cc-491)", path, found)
		}
	}
}
