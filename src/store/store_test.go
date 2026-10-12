package store

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

const testKey = "contract-to-cure/test-game"

// newTestStore returns a store on a fresh miniredis holding base.yaml.
func newTestStore(t *testing.T) (*Store, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { client.Close() })
	if err := mr.Set(testKey, string(readFixture(t, "states/base.yaml"))); err != nil {
		t.Fatal(err)
	}
	return NewWithClient(client, testKey, "heroic"), mr
}

func stored(t *testing.T, mr *miniredis.Miniredis) string {
	t.Helper()
	v, err := mr.Get(testKey)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func load(t *testing.T, s *Store) *Save {
	t.Helper()
	save, err := s.Load(context.Background())
	if err != nil || save == nil {
		t.Fatalf("load: %v %v", save, err)
	}
	return save
}

// Port of test/test_game_redis_pool.rb. Go builds one client per Store, so
// the memoization tests have no counterpart; the env parsing does.
func TestConfigFromEnv(t *testing.T) {
	env := func(vars map[string]string) func(string) string {
		return func(k string) string { return vars[k] }
	}

	cfg := ConfigFromEnv(env(nil))
	want := Config{URL: DefaultURL, PoolSize: 5, PoolTimeout: 5 * time.Second, Key: DefaultKey, DefaultDifficulty: "heroic"}
	if cfg != want {
		t.Fatalf("defaults: got %+v", cfg)
	}

	for _, bad := range []string{"invalid", "", "  ", "0", "-3", "2.5"} {
		cfg = ConfigFromEnv(env(map[string]string{"REDIS_POOL_SIZE": bad, "REDIS_POOL_TIMEOUT": bad}))
		if cfg.PoolSize != DefaultPoolSize || cfg.PoolTimeout != DefaultPoolTimeout {
			t.Errorf("%q: got size %d timeout %s, want the defaults", bad, cfg.PoolSize, cfg.PoolTimeout)
		}
	}

	cfg = ConfigFromEnv(env(map[string]string{
		"REDIS_URL": "redis://cache:6380/2", "REDIS_POOL_SIZE": " 12 ", "REDIS_POOL_TIMEOUT": "0x10",
	}))
	if cfg.URL != "redis://cache:6380/2" || cfg.PoolSize != 12 || cfg.PoolTimeout != 16*time.Second {
		t.Fatalf("parsed: got %+v", cfg)
	}
}

func TestNewAppliesPoolConfig(t *testing.T) {
	s, err := New(Config{URL: "redis://localhost:6390/3", PoolSize: 7, PoolTimeout: 9 * time.Second, Key: testKey})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	opts := s.Client().(*redis.Client).Options()
	if opts.PoolSize != 7 || opts.PoolTimeout != 9*time.Second || opts.DB != 3 || opts.Addr != "localhost:6390" {
		t.Fatalf("options: %+v", opts)
	}
	if s.Key() != testKey {
		t.Fatalf("key = %q", s.Key())
	}

	if _, err := New(Config{URL: "not a url"}); err == nil {
		t.Fatal("expected an invalid REDIS_URL to fail")
	}
}

func TestLoadMissingGameReturnsNil(t *testing.T) {
	s, mr := newTestStore(t)
	mr.Del(testKey)
	save, err := s.Load(context.Background())
	if save != nil || err != nil {
		t.Fatalf("got %v, %v", save, err)
	}
}

// A corrupt save gives a new game, not a crash, and is logged.
func TestLoadCorruptSaveIsLoggedAndReturnsNil(t *testing.T) {
	var logs bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	defer slog.SetDefault(old)

	s, mr := newTestStore(t)
	mr.Set(testKey, "\x04\bo:\x0eGameState\x00")
	save, err := s.Load(context.Background())
	if save != nil || err != nil {
		t.Fatalf("got %v, %v", save, err)
	}
	if !strings.Contains(logs.String(), "cannot decode saved game") {
		t.Fatalf("not logged: %q", logs.String())
	}
}

func TestLoadReportsRedisErrors(t *testing.T) {
	s, mr := newTestStore(t)
	mr.Close()
	if _, err := s.Load(context.Background()); err == nil {
		t.Fatal("expected an error when Redis is down")
	}
}

func TestSaveOutsideAnUpdateWritesImmediately(t *testing.T) {
	s, mr := newTestStore(t)
	game := load(t, s)
	move(game, "Paris")
	if err := s.Save(context.Background(), game); err != nil {
		t.Fatal(err)
	}
	if got := load(t, s).Players[0].Location; got != "Paris" {
		t.Fatalf("location = %s", got)
	}
	if !strings.Contains(stored(t, mr), ":location: Paris") {
		t.Fatal("save not written")
	}
}

// state_legacy_save / move_legacy_save: reading an older save writes nothing;
// the next write stores the defaults.
func TestLegacySaveIsOnlyRewrittenByAWrite(t *testing.T) {
	s, mr := newTestStore(t)
	legacy := string(readFixture(t, "states/legacy_save.yaml"))
	mr.Set(testKey, legacy)

	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		_, err := s.Load(ctx)
		return err
	})
	if err != nil || stored(t, mr) != legacy {
		t.Fatalf("read-only request changed the legacy save (err %v)", err)
	}

	err = s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		game, err := s.Load(ctx)
		if err != nil {
			return err
		}
		return s.Save(ctx, game)
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := stored(t, mr); !strings.Contains(got, ":forecast_active: false\n") || !strings.Contains(got, ":difficulty_level: heroic\n") {
		t.Fatalf("defaults not written:\n%s", got[:400])
	}
}
