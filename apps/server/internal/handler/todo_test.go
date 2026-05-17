package handler_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oklog/ulid/v2"
	_ "modernc.org/sqlite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/bus"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/handler"
)

// newTodoFixture returns a TodoService backed by a fresh temp sqlite + a
// context pre-loaded with a freshly created owner user.
func newTodoFixture(t *testing.T) (*handler.Todo, *queries.Queries, context.Context) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	q := queries.New(conn)
	user := seedUser(t, q, "alice", caller.RoleOwner)
	ctx := caller.With(context.Background(), caller.Caller{
		UserID: user.ID, UserName: user.Name, Role: user.Role,
	})
	return handler.NewTodo(conn, q, testBus()), q, ctx
}

// testBus wires up the same default subscriber set as production. Tests assert
// on the activity feed via ListEvents, so they need the recorder attached.
func testBus() *bus.Bus {
	return bus.New(bus.NewActivityRecorder())
}

func seedUser(t *testing.T, q *queries.Queries, name, role string) queries.User {
	t.Helper()
	u, err := q.CreateUser(context.Background(), queries.CreateUserParams{
		ID: ulid.Make().String(), Name: name, PasswordHash: "stub", Role: role, CreatedAt: 1,
	})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	return u
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
			s, _, ctx := newTodoFixture(t)
			got, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: tt.title})
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
			if got.CreatedBy == "" {
				t.Error("want non-empty created_by")
			}
			if got.CreatedAt != got.UpdatedAt {
				t.Errorf("createdAt %d != updatedAt %d", got.CreatedAt, got.UpdatedAt)
			}
		})
	}
}

func TestGetTodo(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
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

	// silence unused-import warning if helper isn't used later
	_ = sql.NullString{}
}

func TestUpdateTodo(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	created, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "old"})
	if err != nil {
		t.Fatal(err)
	}

	t.Run("title only", func(t *testing.T) {
		newTitle := "new title"
		got, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{Id: created.Id, Title: &newTitle})
		if err != nil {
			t.Fatal(err)
		}
		if got.Title != newTitle {
			t.Errorf("title = %q, want %q", got.Title, newTitle)
		}
	})

	t.Run("done only", func(t *testing.T) {
		done := true
		got, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{Id: created.Id, Done: &done})
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
			t.Errorf("want NotFound, got %v", err)
		}
	})

	t.Run("empty title rejected", func(t *testing.T) {
		empty := "   "
		_, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{Id: created.Id, Title: &empty})
		if status.Code(err) != codes.InvalidArgument {
			t.Errorf("want InvalidArgument, got %v", err)
		}
	})
}

func TestDeleteTodo(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	created, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "doomed"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DeleteTodo(ctx, &doxv1.DeleteTodoRequest{Id: created.Id}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: created.Id}); status.Code(err) != codes.NotFound {
		t.Errorf("expected NotFound after delete, got %v", err)
	}
}

func TestIDPrefixResolution(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	a, _ := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "alpha"})
	b, _ := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "beta"})

	t.Run("full id works", func(t *testing.T) {
		got, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: a.Id})
		if err != nil || got.Id != a.Id {
			t.Fatalf("want %q, got %q (err=%v)", a.Id, got.GetId(), err)
		}
	})

	t.Run("lowercase normalizes", func(t *testing.T) {
		got, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: strings.ToLower(a.Id)})
		if err != nil || got.Id != a.Id {
			t.Fatalf("want %q, got %q (err=%v)", a.Id, got.GetId(), err)
		}
	})

	t.Run("unique prefix resolves", func(t *testing.T) {
		prefix := uniquePrefix(t, a.Id, b.Id)
		got, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: prefix})
		if err != nil {
			t.Fatalf("unique prefix should resolve: %v", err)
		}
		if got.Id != a.Id {
			t.Errorf("want %q, got %q", a.Id, got.Id)
		}
	})

	t.Run("ambiguous prefix rejected", func(t *testing.T) {
		shared := commonPrefix(a.Id, b.Id)
		if len(shared) < 3 {
			t.Skip("ULIDs diverge too early")
		}
		ambiguous := shared[:max(1, len(shared)-1)]
		_, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: ambiguous})
		if status.Code(err) != codes.FailedPrecondition {
			t.Errorf("want FailedPrecondition, got %v", err)
		}
	})

	t.Run("no match", func(t *testing.T) {
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
