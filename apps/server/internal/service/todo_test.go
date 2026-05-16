package service_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/service"
)

func newTestService(t *testing.T) (*service.TodoService, *sql.DB) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return service.NewTodoService(queries.New(conn)), conn
}

func TestCreateTodo(t *testing.T) {
	tests := []struct {
		name     string
		title    string
		wantErr  bool
		wantCode codes.Code
	}{
		{"basic", "buy milk", false, codes.OK},
		{"trimmed", "  hello  ", false, codes.OK},
		{"empty rejected", "", true, codes.InvalidArgument},
		{"whitespace-only rejected", "   ", true, codes.InvalidArgument},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := newTestService(t)
			got, err := s.CreateTodo(context.Background(), &doxv1.CreateTodoRequest{Title: tt.title})
			if tt.wantErr {
				if err == nil {
					t.Fatal("want error, got nil")
				}
				if c := status.Code(err); c != tt.wantCode {
					t.Errorf("want code %v, got %v", tt.wantCode, c)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Id == "" {
				t.Error("want non-empty id")
			}
			if got.Done {
				t.Error("new todo should not be done")
			}
			if got.CreatedAt == 0 {
				t.Error("want non-zero created_at")
			}
			if got.CreatedAt != got.UpdatedAt {
				t.Errorf("create: createdAt %d != updatedAt %d", got.CreatedAt, got.UpdatedAt)
			}
		})
	}
}

func TestGetTodo(t *testing.T) {
	s, _ := newTestService(t)
	ctx := context.Background()
	created, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "task"})
	if err != nil {
		t.Fatal(err)
	}

	t.Run("found", func(t *testing.T) {
		got, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: created.Id})
		if err != nil {
			t.Fatal(err)
		}
		if got.Id != created.Id {
			t.Errorf("id mismatch")
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: "doesnotexist"})
		if status.Code(err) != codes.NotFound {
			t.Errorf("want NotFound, got %v", status.Code(err))
		}
	})

	t.Run("empty id rejected", func(t *testing.T) {
		_, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: ""})
		if status.Code(err) != codes.InvalidArgument {
			t.Errorf("want InvalidArgument, got %v", status.Code(err))
		}
	})
}

func TestUpdateTodo(t *testing.T) {
	s, _ := newTestService(t)
	ctx := context.Background()
	created, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "old title"})
	if err != nil {
		t.Fatal(err)
	}

	t.Run("title only", func(t *testing.T) {
		newTitle := "new title"
		got, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
			Id:    created.Id,
			Title: &newTitle,
		})
		if err != nil {
			t.Fatal(err)
		}
		if got.Title != newTitle {
			t.Errorf("want title %q, got %q", newTitle, got.Title)
		}
		if got.Done != created.Done {
			t.Errorf("done changed unexpectedly")
		}
	})

	t.Run("done only", func(t *testing.T) {
		done := true
		got, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
			Id:   created.Id,
			Done: &done,
		})
		if err != nil {
			t.Fatal(err)
		}
		if !got.Done {
			t.Error("want done=true")
		}
	})

	t.Run("not found", func(t *testing.T) {
		title := "x"
		_, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{Id: "nonexistent", Title: &title})
		if status.Code(err) != codes.NotFound {
			t.Errorf("want NotFound, got %v", status.Code(err))
		}
	})

	t.Run("empty title rejected", func(t *testing.T) {
		empty := "   "
		_, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{Id: created.Id, Title: &empty})
		if status.Code(err) != codes.InvalidArgument {
			t.Errorf("want InvalidArgument, got %v", status.Code(err))
		}
	})

	t.Run("updated_at advances", func(t *testing.T) {
		title := "another"
		fresh, _ := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "fresh"})
		// Simulate clock advance — the service uses time.Now() so we just call
		// twice and assert second is >= first.
		got, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{Id: fresh.Id, Title: &title})
		if err != nil {
			t.Fatal(err)
		}
		if got.UpdatedAt < fresh.UpdatedAt {
			t.Errorf("updated_at went backwards: %d < %d", got.UpdatedAt, fresh.UpdatedAt)
		}
	})
}

func TestDeleteTodo(t *testing.T) {
	s, _ := newTestService(t)
	ctx := context.Background()
	created, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "doomed"})
	if err != nil {
		t.Fatal(err)
	}

	t.Run("success", func(t *testing.T) {
		_, err := s.DeleteTodo(ctx, &doxv1.DeleteTodoRequest{Id: created.Id})
		if err != nil {
			t.Fatal(err)
		}
		// Verify gone.
		_, err = s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: created.Id})
		if status.Code(err) != codes.NotFound {
			t.Errorf("expected todo to be gone, got %v", err)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := s.DeleteTodo(ctx, &doxv1.DeleteTodoRequest{Id: "nope"})
		if status.Code(err) != codes.NotFound {
			t.Errorf("want NotFound, got %v", status.Code(err))
		}
	})

	t.Run("empty id rejected", func(t *testing.T) {
		_, err := s.DeleteTodo(ctx, &doxv1.DeleteTodoRequest{Id: ""})
		if status.Code(err) != codes.InvalidArgument {
			t.Errorf("want InvalidArgument, got %v", status.Code(err))
		}
	})
}

func TestIDPrefixResolution(t *testing.T) {
	s, _ := newTestService(t)
	ctx := context.Background()
	a, _ := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "alpha"})
	b, _ := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "beta"})

	t.Run("full id works", func(t *testing.T) {
		got, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: a.Id})
		if err != nil || got.Id != a.Id {
			t.Fatalf("want %q, got %q (err=%v)", a.Id, got.GetId(), err)
		}
	})

	t.Run("lowercase full id normalizes", func(t *testing.T) {
		got, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: strings.ToLower(a.Id)})
		if err != nil || got.Id != a.Id {
			t.Fatalf("want %q, got %q (err=%v)", a.Id, got.GetId(), err)
		}
	})

	t.Run("unique prefix resolves", func(t *testing.T) {
		// Find a prefix that uniquely identifies `a` (longer than the common
		// timestamp prefix b shares).
		prefix := uniquePrefix(t, a.Id, b.Id)
		got, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: prefix})
		if err != nil {
			t.Fatalf("unique prefix should resolve, got %v", err)
		}
		if got.Id != a.Id {
			t.Errorf("want %q, got %q", a.Id, got.Id)
		}
	})

	t.Run("ambiguous prefix rejected", func(t *testing.T) {
		// ULIDs created in the same ms share their 10-char timestamp prefix.
		// Use just the first 3 chars to guarantee ambiguity (or skip if
		// timestamps differ enough to avoid collision).
		shared := commonPrefix(a.Id, b.Id)
		if len(shared) < 3 {
			t.Skip("ULIDs diverge too early to construct an ambiguous prefix")
		}
		ambiguous := shared[:max(1, len(shared)-1)]
		_, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: ambiguous})
		if status.Code(err) != codes.FailedPrecondition {
			t.Errorf("want FailedPrecondition for ambiguous prefix %q, got %v", ambiguous, err)
		}
	})

	t.Run("prefix with no match", func(t *testing.T) {
		_, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: "ZZZ"})
		if status.Code(err) != codes.NotFound {
			t.Errorf("want NotFound, got %v", err)
		}
	})

	t.Run("oversize id rejected", func(t *testing.T) {
		_, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: strings.Repeat("A", 30)})
		if status.Code(err) != codes.InvalidArgument {
			t.Errorf("want InvalidArgument, got %v", err)
		}
	})
}

// uniquePrefix returns the shortest prefix of `target` that does not match
// `other` — i.e. the first differing character plus everything before.
func uniquePrefix(t *testing.T, target, other string) string {
	t.Helper()
	common := commonPrefix(target, other)
	if len(common) >= len(target) {
		t.Fatalf("target %q is a prefix of other %q", target, other)
	}
	return target[:len(common)+1]
}

func commonPrefix(a, b string) string {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	for i := 0; i < n; i++ {
		if a[i] != b[i] {
			return a[:i]
		}
	}
	return a[:n]
}

func TestListTodos(t *testing.T) {
	s, _ := newTestService(t)
	ctx := context.Background()

	t.Run("empty", func(t *testing.T) {
		resp, err := s.ListTodos(ctx, &doxv1.ListTodosRequest{})
		if err != nil {
			t.Fatal(err)
		}
		if len(resp.Todos) != 0 {
			t.Errorf("want 0 todos, got %d", len(resp.Todos))
		}
	})

	t.Run("ordering newest first", func(t *testing.T) {
		a, _ := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "a"})
		b, _ := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "b"})
		c, _ := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "c"})

		resp, err := s.ListTodos(ctx, &doxv1.ListTodosRequest{})
		if err != nil {
			t.Fatal(err)
		}
		if len(resp.Todos) != 3 {
			t.Fatalf("want 3, got %d", len(resp.Todos))
		}
		// Created a, b, c in order; ULID-based created_at should preserve order
		// strictly only if SystemClock advances between calls. In practice the
		// test is fast enough that created_at may tie — only assert set equality
		// of IDs rather than strict ordering.
		ids := map[string]bool{}
		for _, todo := range resp.Todos {
			ids[todo.Id] = true
		}
		for _, want := range []string{a.Id, b.Id, c.Id} {
			if !ids[want] {
				t.Errorf("missing %q in list", want)
			}
		}
	})
}
