// Package authz holds the small set of project-scoped permission checks used
// by service handlers. It deliberately exposes three concrete predicates
// rather than a policy engine; one helper per call site keeps reasoning local.
//
// Status code policy:
//   - Reads on objects the caller cannot see return NotFound (no existence leak).
//   - Writes on objects the caller can see but cannot mutate return PermissionDenied.
package authz

import (
	"context"
	"database/sql"
	"errors"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const (
	RoleEditor = "editor"
	RoleViewer = "viewer"
)

// CanReadProject returns nil if the user is the project owner or a member of
// any role. Otherwise it returns NotFound — including when the project does
// not exist — so non-members cannot probe for existence.
func CanReadProject(ctx context.Context, q *queries.Queries, userID, projectID string) error {
	p, err := q.GetProject(ctx, projectID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return status.Errorf(codes.NotFound, "project %q not found", projectID)
		}
		return status.Errorf(codes.Internal, "get project: %v", err)
	}
	if p.OwnerID == userID {
		return nil
	}
	if _, err := q.GetProjectMembership(ctx, queries.GetProjectMembershipParams{
		ProjectID: projectID,
		UserID:    userID,
	}); err == nil {
		return nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return status.Errorf(codes.Internal, "get membership: %v", err)
	}
	return status.Errorf(codes.NotFound, "project %q not found", projectID)
}

// CanWriteProjectTodos returns nil if the user can create/update/delete todos
// in the project (owner or editor). Returns NotFound for non-visible projects
// and PermissionDenied for viewers.
func CanWriteProjectTodos(ctx context.Context, q *queries.Queries, userID, projectID string) error {
	p, err := q.GetProject(ctx, projectID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return status.Errorf(codes.NotFound, "project %q not found", projectID)
		}
		return status.Errorf(codes.Internal, "get project: %v", err)
	}
	if p.OwnerID == userID {
		return nil
	}
	role, err := q.GetProjectMembership(ctx, queries.GetProjectMembershipParams{
		ProjectID: projectID,
		UserID:    userID,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return status.Errorf(codes.NotFound, "project %q not found", projectID)
	}
	if err != nil {
		return status.Errorf(codes.Internal, "get membership: %v", err)
	}
	if role != RoleEditor {
		return status.Errorf(codes.PermissionDenied, "viewers cannot modify todos in this project")
	}
	return nil
}

// CanAdminProject returns nil if the user is the project owner. Returns
// NotFound for non-visible projects and PermissionDenied for non-owner members.
func CanAdminProject(ctx context.Context, q *queries.Queries, userID, projectID string) error {
	p, err := q.GetProject(ctx, projectID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return status.Errorf(codes.NotFound, "project %q not found", projectID)
		}
		return status.Errorf(codes.Internal, "get project: %v", err)
	}
	if p.OwnerID == userID {
		return nil
	}
	if _, err := q.GetProjectMembership(ctx, queries.GetProjectMembershipParams{
		ProjectID: projectID,
		UserID:    userID,
	}); err == nil {
		return status.Errorf(codes.PermissionDenied, "only the project owner can perform this action")
	} else if !errors.Is(err, sql.ErrNoRows) {
		return status.Errorf(codes.Internal, "get membership: %v", err)
	}
	return status.Errorf(codes.NotFound, "project %q not found", projectID)
}
