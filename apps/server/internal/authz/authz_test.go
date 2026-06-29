package authz_test

import (
	"context"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/oklog/ulid/v2"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/lin-snow/dox/apps/server/internal/authz"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// fixture builds a fresh temp sqlite with one project owned by `owner`, an
// `editor` member, a `viewer` member, and an unrelated `outsider`. The returned
// ids let each test pick a caller without re-seeding.
type fixture struct {
	q         *queries.Queries
	projectID string
	owner     string
	editor    string
	viewer    string
	outsider  string
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	q := queries.New(conn)

	owner := seedUser(t, q, "owner")
	editor := seedUser(t, q, "editor")
	viewer := seedUser(t, q, "viewer")
	outsider := seedUser(t, q, "outsider")

	projectID := ulid.Make().String()
	if _, err := q.CreateProject(context.Background(), queries.CreateProjectParams{
		ID: projectID, OwnerID: owner, Name: "proj", CreatedAt: 1, UpdatedAt: 1,
	}); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	addMember(t, q, projectID, editor, authz.RoleEditor)
	addMember(t, q, projectID, viewer, authz.RoleViewer)

	return fixture{q, projectID, owner, editor, viewer, outsider}
}

func seedUser(t *testing.T, q *queries.Queries, name string) string {
	t.Helper()
	id := ulid.Make().String()
	if _, err := q.CreateUser(context.Background(), queries.CreateUserParams{
		ID: id, Name: name, PasswordHash: "stub", Role: "member", CreatedAt: 1,
	}); err != nil {
		t.Fatalf("CreateUser(%s): %v", name, err)
	}
	return id
}

func addMember(t *testing.T, q *queries.Queries, projectID, userID, role string) {
	t.Helper()
	if err := q.AddProjectMember(context.Background(), queries.AddProjectMemberParams{
		ProjectID: projectID, UserID: userID, Role: role, AddedAt: 1,
	}); err != nil {
		t.Fatalf("AddProjectMember(%s): %v", role, err)
	}
}

// missingProject is a syntactically valid ULID that was never inserted, so the
// predicates must treat it as not-found rather than leaking that it's absent.
const missingProject = "01ARZ3NDEKTSV4RRFFQ69G5FAV"

func TestCanReadProject(t *testing.T) {
	f := newFixture(t)
	cases := []struct {
		name    string
		userID  func() string
		project string
		want    codes.Code
	}{
		{"owner reads", func() string { return f.owner }, f.projectID, codes.OK},
		{"editor reads", func() string { return f.editor }, f.projectID, codes.OK},
		{"viewer reads", func() string { return f.viewer }, f.projectID, codes.OK},
		{"outsider hidden", func() string { return f.outsider }, f.projectID, codes.NotFound},
		{"missing project", func() string { return f.owner }, missingProject, codes.NotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := authz.CanReadProject(context.Background(), f.q, tc.userID(), tc.project)
			assertCode(t, err, tc.want)
		})
	}
}

func TestCanWriteProjectTodos(t *testing.T) {
	f := newFixture(t)
	cases := []struct {
		name    string
		userID  func() string
		project string
		want    codes.Code
	}{
		{"owner writes", func() string { return f.owner }, f.projectID, codes.OK},
		{"editor writes", func() string { return f.editor }, f.projectID, codes.OK},
		{"viewer denied", func() string { return f.viewer }, f.projectID, codes.PermissionDenied},
		{"outsider hidden", func() string { return f.outsider }, f.projectID, codes.NotFound},
		{"missing project", func() string { return f.owner }, missingProject, codes.NotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := authz.CanWriteProjectTodos(context.Background(), f.q, tc.userID(), tc.project)
			assertCode(t, err, tc.want)
		})
	}
}

func TestCanAdminProject(t *testing.T) {
	f := newFixture(t)
	cases := []struct {
		name    string
		userID  func() string
		project string
		want    codes.Code
	}{
		{"owner admins", func() string { return f.owner }, f.projectID, codes.OK},
		{"editor denied", func() string { return f.editor }, f.projectID, codes.PermissionDenied},
		{"viewer denied", func() string { return f.viewer }, f.projectID, codes.PermissionDenied},
		{"outsider hidden", func() string { return f.outsider }, f.projectID, codes.NotFound},
		{"missing project", func() string { return f.owner }, missingProject, codes.NotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := authz.CanAdminProject(context.Background(), f.q, tc.userID(), tc.project)
			assertCode(t, err, tc.want)
		})
	}
}

func assertCode(t *testing.T, err error, want codes.Code) {
	t.Helper()
	if want == codes.OK {
		if err != nil {
			t.Fatalf("want nil error, got %v", err)
		}
		return
	}
	if got := status.Code(err); got != want {
		t.Fatalf("want code %v, got %v (err=%v)", want, got, err)
	}
}
