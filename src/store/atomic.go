package store

import (
	"bytes"
	"context"
	"errors"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// ErrConflict means another request committed after this one loaded the game.
// Nothing was written; the HTTP layer answers 409 with the current game.
var ErrConflict = errors.New("game state was changed by another request")

// ErrNestedUpdate is returned when an update is started inside another one.
var ErrNestedUpdate = errors.New("nested game state updates are not supported")

type updateKey struct{}

// update is the port of GameStateAtomicUpdate: the baseline from the first
// read, and the game to write once at commit. It travels in the request's
// context and is used by one goroutine at a time.
type update struct {
	store          *Store
	snapshot       []byte
	snapshotLoaded bool
	game           Persistable
}

func (s *Store) update(ctx context.Context) *update {
	u, _ := ctx.Value(updateKey{}).(*update)
	if u == nil || u.store.key != s.key {
		return nil
	}
	return u
}

// AtomicUpdate runs fn as one read-modify-write of the game. Loads in fn share
// one baseline, saves are deferred, and after fn the game is written once if
// Redis still holds the baseline. Otherwise it returns ErrConflict and writes
// nothing. When fn fails or panics nothing is written. A read-only fn never
// writes and never conflicts.
func (s *Store) AtomicUpdate(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, nested := ctx.Value(updateKey{}).(*update); nested {
		return ErrNestedUpdate
	}
	ctx = context.WithValue(ctx, updateKey{}, &update{store: s})
	if err := fn(ctx); err != nil {
		return err
	}
	return Commit(ctx)
}

// Commit writes the update's pending save now. Handlers call it before writing
// a response, so success is only reported for a write that was stored (Rails
// does this in its render override). Committing again is a no-op unless
// there was another save. Outside an update it does nothing.
func Commit(ctx context.Context) error {
	u, _ := ctx.Value(updateKey{}).(*update)
	if u == nil || u.game == nil {
		return nil
	}
	if !u.snapshotLoaded {
		return fmt.Errorf("%w: game update has no loaded baseline", ErrConflict)
	}
	payload, err := u.game.EncodeSave()
	if err != nil {
		return err
	}
	if err := u.store.compareAndSet(ctx, u.snapshot, payload); err != nil {
		return err
	}
	u.snapshot = payload
	u.game = nil
	return nil
}

func (u *update) recordSnapshot(raw []byte) {
	if u.snapshotLoaded {
		return
	}
	u.snapshot = raw
	u.snapshotLoaded = true
}

func (u *update) deferSave(game Persistable) { u.game = game }

// compareAndSet writes payload if the key still holds snapshot (nil meaning
// no key), using WATCH/GET, then MULTI/SET/EXEC.
func (s *Store) compareAndSet(ctx context.Context, snapshot, payload []byte) error {
	err := s.client.Watch(ctx, func(tx *redis.Tx) error {
		current, err := tx.Get(ctx, s.key).Bytes()
		switch {
		case errors.Is(err, redis.Nil):
			current = nil
		case err != nil:
			return err
		}
		if (current == nil) != (snapshot == nil) || !bytes.Equal(current, snapshot) {
			return ErrConflict
		}
		_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
			pipe.Set(ctx, s.key, payload, 0)
			return nil
		})
		return err
	}, s.key)
	// EXEC aborts when another client changed the key after WATCH.
	if errors.Is(err, redis.TxFailedErr) {
		return ErrConflict
	}
	if err != nil && !errors.Is(err, ErrConflict) {
		return fmt.Errorf("committing game: %w", err)
	}
	return err
}
