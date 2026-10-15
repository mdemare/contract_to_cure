package store

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/redis/go-redis/v9"
)

// Port of the former Rails test_atomic_game_updates.rb at the store level. The
// store knows nothing of the game model, so a "move" here edits the save
// directly: it moves player 0 and spends an action.

func move(game *Save, to string) {
	game.Players[0].Location = to
	game.Status.ActionsRemaining--
}

// moveUpdate loads, moves and saves inside fn, the way a /move handler will.
func moveUpdate(s *Store, to string) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		game, err := s.Load(ctx)
		if err != nil {
			return err
		}
		move(game, to)
		return s.Save(ctx, game)
	}
}

// interleave runs stale in a goroutine that pauses right after its first
// load, runs fresh to completion, then lets stale finish.
func interleave(s *Store, stale, fresh func(ctx context.Context) error) (staleErr, freshErr error) {
	loaded := make(chan struct{})
	resume := make(chan struct{})
	done := make(chan error)
	go func() {
		done <- s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
			if _, err := s.LoadRaw(ctx); err != nil {
				return err
			}
			close(loaded)
			<-resume
			return stale(ctx)
		})
	}()
	<-loaded
	freshErr = s.AtomicUpdate(context.Background(), fresh)
	close(resume)
	return <-done, freshErr
}

func TestInterleavedMovesNeverLoseAnAcknowledgedUpdate(t *testing.T) {
	s, _ := newTestStore(t)

	staleErr, freshErr := interleave(s, moveUpdate(s, "Paris"), moveUpdate(s, "Stockholm"))
	if freshErr != nil {
		t.Fatal(freshErr)
	}
	if !errors.Is(staleErr, ErrConflict) {
		t.Fatalf("stale update: got %v, want ErrConflict", staleErr)
	}
	saved := load(t, s)
	if saved.Players[0].Location != "Stockholm" || saved.Status.ActionsRemaining != 3 {
		t.Fatalf("saved %s with %d actions", saved.Players[0].Location, saved.Status.ActionsRemaining)
	}

	// The rejected client retries against the current state; both moves count.
	if err := s.AtomicUpdate(context.Background(), moveUpdate(s, "London")); err != nil {
		t.Fatal(err)
	}
	saved = load(t, s)
	if saved.Players[0].Location != "London" || saved.Status.ActionsRemaining != 2 {
		t.Fatalf("saved %s with %d actions", saved.Players[0].Location, saved.Status.ActionsRemaining)
	}
}

func TestStaleRestartIsRejectedWithoutWriting(t *testing.T) {
	s, _ := newTestStore(t)
	restart := func(ctx context.Context) error {
		fresh, err := DecodeSave(readFixture(t, "states/event_cards.yaml"), "heroic")
		if err != nil {
			return err
		}
		return s.Save(ctx, fresh)
	}

	staleErr, freshErr := interleave(s, restart, moveUpdate(s, "Paris"))
	if freshErr != nil || !errors.Is(staleErr, ErrConflict) {
		t.Fatalf("fresh %v, stale %v", freshErr, staleErr)
	}
	saved := load(t, s)
	if saved.Players[0].Location != "Paris" || saved.Status.ActionsRemaining != 3 {
		t.Fatalf("saved %s with %d actions", saved.Players[0].Location, saved.Status.ActionsRemaining)
	}
}

// Real goroutines racing on one key: every acknowledged update is kept, and
// with retries on conflict every update eventually lands exactly once.
func TestConcurrentUpdatesApplyExactlyOnce(t *testing.T) {
	s, _ := newTestStore(t)
	const workers = 20
	startTurn := load(t, s).Status.Turn

	var acknowledged, conflicts atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
				game, err := s.Load(ctx)
				if err != nil {
					return err
				}
				game.Status.Turn++
				return s.Save(ctx, game)
			})
			switch {
			case err == nil:
				acknowledged.Add(1)
			case errors.Is(err, ErrConflict):
				conflicts.Add(1)
			default:
				t.Error(err)
			}
		}()
	}
	close(start)
	wg.Wait()

	if got := load(t, s).Status.Turn - startTurn; got != int(acknowledged.Load()) {
		t.Fatalf("turn advanced %d times but %d updates were acknowledged (%d conflicts)",
			got, acknowledged.Load(), conflicts.Load())
	}
	t.Logf("%d acknowledged, %d conflicts", acknowledged.Load(), conflicts.Load())
	if acknowledged.Load()+conflicts.Load() != workers {
		t.Fatalf("%d acknowledged + %d conflicts != %d", acknowledged.Load(), conflicts.Load(), workers)
	}

	// Now with retries: everyone gets through, once.
	startTurn = load(t, s).Status.Turn
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
					game, err := s.Load(ctx)
					if err != nil {
						return err
					}
					game.Status.Turn++
					return s.Save(ctx, game)
				})
				if !errors.Is(err, ErrConflict) {
					if err != nil {
						t.Error(err)
					}
					return
				}
			}
		}()
	}
	wg.Wait()
	if got := load(t, s).Status.Turn - startTurn; got != workers {
		t.Fatalf("turn advanced %d times, want %d", got, workers)
	}
}

func TestReadOnlyUpdateDoesNotConflictWithConcurrentUpdate(t *testing.T) {
	s, mr := newTestStore(t)
	readOnly := func(ctx context.Context) error {
		_, err := s.Load(ctx)
		return err
	}

	staleErr, freshErr := interleave(s, readOnly, moveUpdate(s, "Paris"))
	if staleErr != nil || freshErr != nil {
		t.Fatalf("stale %v, fresh %v", staleErr, freshErr)
	}
	if load(t, s).Players[0].Location != "Paris" {
		t.Fatalf("move lost:\n%s", stored(t, mr)[:200])
	}
}

func TestSavesAreDeferredUntilTheUpdateCommits(t *testing.T) {
	s, mr := newTestStore(t)
	before := stored(t, mr)

	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		game, err := s.Load(ctx)
		if err != nil {
			return err
		}
		move(game, "Paris")
		s.Save(ctx, game)
		move(game, "London")
		s.Save(ctx, game)
		if stored(t, mr) != before {
			t.Error("save written before commit")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	saved := load(t, s)
	if saved.Players[0].Location != "London" || saved.Status.ActionsRemaining != 2 {
		t.Fatalf("saved %s with %d actions", saved.Players[0].Location, saved.Status.ActionsRemaining)
	}
}

// Like Rails, the game is encoded at commit, so changes after Save count.
func TestChangesAfterSaveAreCommitted(t *testing.T) {
	s, _ := newTestStore(t)
	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		game, _ := s.Load(ctx)
		s.Save(ctx, game)
		move(game, "Paris")
		return nil
	})
	if err != nil || load(t, s).Players[0].Location != "Paris" {
		t.Fatalf("change after Save lost (err %v)", err)
	}
}

func TestErrorInsideUpdateDiscardsPendingSaves(t *testing.T) {
	s, mr := newTestStore(t)
	before := stored(t, mr)
	boom := errors.New("boom")

	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		if err := moveUpdate(s, "Paris")(ctx); err != nil {
			return err
		}
		return boom
	})
	if !errors.Is(err, boom) || stored(t, mr) != before {
		t.Fatalf("err %v; save changed: %v", err, stored(t, mr) != before)
	}

	func() {
		defer func() { recover() }()
		s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
			moveUpdate(s, "Paris")(ctx)
			panic("boom")
		})
	}()
	if stored(t, mr) != before {
		t.Fatal("a panicking update wrote its save")
	}
}

func TestStaleUpdateConflictsAndWritesNothing(t *testing.T) {
	s, _ := newTestStore(t)
	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		if err := moveUpdate(s, "Paris")(ctx); err != nil {
			return err
		}
		// Another request, with its own context, commits first.
		done := make(chan error)
		go func() { done <- s.AtomicUpdate(context.Background(), moveUpdate(s, "Stockholm")) }()
		return <-done
	})
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("got %v, want ErrConflict", err)
	}
	saved := load(t, s)
	if saved.Players[0].Location != "Stockholm" || saved.Status.ActionsRemaining != 3 {
		t.Fatalf("saved %s with %d actions", saved.Players[0].Location, saved.Status.ActionsRemaining)
	}
}

func TestNewGameIsNotCommittedOverAGameCreatedConcurrently(t *testing.T) {
	s, mr := newTestStore(t)
	mr.Del(testKey)

	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		game, err := s.Load(ctx)
		if game != nil || err != nil {
			t.Fatalf("expected no game, got %v %v", game, err)
		}
		fresh, _ := DecodeSave(readFixture(t, "states/base.yaml"), "heroic")
		s.Save(ctx, fresh)
		mr.Set(testKey, "created elsewhere")
		return nil
	})
	if !errors.Is(err, ErrConflict) || stored(t, mr) != "created elsewhere" {
		t.Fatalf("err %v, stored %q", err, stored(t, mr))
	}
}

// With no saved game, the first request starts one and commits it.
func TestNewGameIsCommittedWhenThereIsNoGame(t *testing.T) {
	s, mr := newTestStore(t)
	mr.Del(testKey)
	base := string(readFixture(t, "states/base.yaml"))

	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		if game, err := s.Load(ctx); game != nil || err != nil {
			t.Fatalf("expected no game, got %v %v", game, err)
		}
		fresh, _ := DecodeSave([]byte(base), "heroic")
		return s.Save(ctx, fresh)
	})
	if err != nil || stored(t, mr) != base {
		t.Fatalf("new game not committed (err %v)", err)
	}
}

func TestSaveWithoutLoadedBaselineIsRejected(t *testing.T) {
	s, mr := newTestStore(t)
	before := stored(t, mr)
	fresh, _ := DecodeSave(readFixture(t, "states/event_cards.yaml"), "heroic")

	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		return s.Save(ctx, fresh)
	})
	if !errors.Is(err, ErrConflict) || stored(t, mr) != before {
		t.Fatalf("err %v; save changed: %v", err, stored(t, mr) != before)
	}
}

// changeAfterGet makes another client write the key right after the next GET,
// i.e. between WATCH/GET and EXEC.
type changeAfterGet struct {
	armed atomic.Bool
	other *redis.Client
}

func (h *changeAfterGet) DialHook(next redis.DialHook) redis.DialHook { return next }
func (h *changeAfterGet) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}
func (h *changeAfterGet) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		err := next(ctx, cmd)
		if cmd.Name() == "get" && h.armed.CompareAndSwap(true, false) {
			h.other.Set(ctx, testKey, "changed after WATCH", 0)
		}
		return err
	}
}

func TestWatchAbortIsReportedAsConflict(t *testing.T) {
	s, mr := newTestStore(t)
	other := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer other.Close()
	hook := &changeAfterGet{other: other}
	s.Client().AddHook(hook)

	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		if err := moveUpdate(s, "Paris")(ctx); err != nil {
			return err
		}
		hook.armed.Store(true)
		err := Commit(ctx)
		if !errors.Is(err, ErrConflict) {
			t.Fatalf("commit: got %v, want ErrConflict", err)
		}
		if s.update(ctx).game == nil {
			t.Fatal("a failed commit should keep the update dirty")
		}
		return err
	})
	if !errors.Is(err, ErrConflict) || stored(t, mr) != "changed after WATCH" {
		t.Fatalf("err %v, stored %q", err, stored(t, mr))
	}
}

func TestNestedUpdatesAreRejected(t *testing.T) {
	s, _ := newTestStore(t)
	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		return s.AtomicUpdate(ctx, func(context.Context) error { return nil })
	})
	if !errors.Is(err, ErrNestedUpdate) {
		t.Fatalf("got %v, want ErrNestedUpdate", err)
	}
}

// Handlers commit before writing the response; later saves commit again
// against the new baseline.
func TestCommitBeforeResponseThenSaveAgain(t *testing.T) {
	s, mr := newTestStore(t)
	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		if err := moveUpdate(s, "Paris")(ctx); err != nil {
			return err
		}
		if err := Commit(ctx); err != nil {
			return err
		}
		if load(t, s).Players[0].Location != "Paris" {
			t.Fatal("Commit did not write")
		}
		if err := Commit(ctx); err != nil {
			t.Fatalf("second commit without changes: %v", err)
		}
		return moveUpdate(s, "London")(ctx)
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved := load(t, s); saved.Players[0].Location != "London" || saved.Status.ActionsRemaining != 2 {
		t.Fatalf("saved %s with %d actions:\n%s", saved.Players[0].Location, saved.Status.ActionsRemaining, stored(t, mr)[:100])
	}
}

// An update only covers its own key; another store's saves write through.
func TestUpdateCoversOnlyItsKey(t *testing.T) {
	s, mr := newTestStore(t)
	otherStore := NewWithClient(s.Client(), "contract-to-cure/other", "heroic")
	game := load(t, s)

	err := s.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		if err := otherStore.Save(ctx, game); err != nil {
			return err
		}
		if !mr.Exists("contract-to-cure/other") {
			t.Fatal("save to another key was deferred")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
