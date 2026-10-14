// Package store keeps the one shared game in Redis (cc-376), in the YAML
// format Rails writes (it also reads versioned JSON saves, cc-487), and runs
// each request's read-modify-write of it as an atomic update (see atomic.go
// and Q14-cc).
package store

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/redis/go-redis/v9"
)

// Store reads and writes the game under one Redis key.
type Store struct {
	client            redis.UniversalClient
	key               string
	defaultDifficulty string
}

// New connects to Redis with the configured pool. Close releases it.
func New(cfg Config) (*Store, error) {
	opts, err := redis.ParseURL(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("REDIS_URL: %w", err)
	}
	opts.PoolSize = cfg.PoolSize
	opts.PoolTimeout = cfg.PoolTimeout
	return NewWithClient(redis.NewClient(opts), cfg.Key, cfg.DefaultDifficulty), nil
}

// NewWithClient uses an existing client, for example one per test with its
// own key.
func NewWithClient(client redis.UniversalClient, key, defaultDifficulty string) *Store {
	return &Store{client: client, key: key, defaultDifficulty: defaultDifficulty}
}

func (s *Store) Client() redis.UniversalClient { return s.client }
func (s *Store) Key() string                   { return s.key }
func (s *Store) Close() error                  { return s.client.Close() }

// Persistable is a game that can be written to Redis. Inside an update it is
// encoded at commit time, so changes made after Save are still committed, as
// in Rails.
type Persistable interface {
	EncodeSave() ([]byte, error)
}

// Load returns the saved game, or nil when there is none or it cannot be
// decoded; the caller then starts a new game. A corrupt save is logged, not
// returned as an error. Inside an update, the first read becomes the baseline
// the commit compares against.
func (s *Store) Load(ctx context.Context) (*Save, error) {
	raw, err := s.LoadRaw(ctx)
	if err != nil || raw == nil {
		return nil, err
	}
	save, err := DecodeSave(raw, s.defaultDifficulty)
	if err != nil {
		slog.ErrorContext(ctx, "cannot decode saved game; starting a new one", "key", s.key, "error", err)
		return nil, nil
	}
	return save, nil
}

// LoadRaw returns the stored bytes, or nil when the key does not exist.
func (s *Store) LoadRaw(ctx context.Context) ([]byte, error) {
	raw, err := s.client.Get(ctx, s.key).Bytes()
	if errors.Is(err, redis.Nil) {
		raw, err = nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("loading game: %w", err)
	}
	if u := s.update(ctx); u != nil {
		u.recordSnapshot(raw)
	}
	return raw, nil
}

// Save writes the game. Inside an update it only marks the game dirty; the
// update writes it once when it commits.
func (s *Store) Save(ctx context.Context, game Persistable) error {
	if u := s.update(ctx); u != nil {
		u.deferSave(game)
		return nil
	}
	payload, err := game.EncodeSave()
	if err != nil {
		return err
	}
	if err := s.client.Set(ctx, s.key, payload, 0).Err(); err != nil {
		return fmt.Errorf("saving game: %w", err)
	}
	return nil
}
