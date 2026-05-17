package handler

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/authz"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const (
	maxProjectName = 128
	maxProjectDesc = 1024
	maxColor       = 32
)

type Project struct {
	doxv1.UnimplementedProjectServiceServer
	q   *queries.Queries
	now func() int64
}

func NewProject(q *queries.Queries) *Project {
	return &Project{
		q:   q,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

func (s *Project) ListProjects(ctx context.Context, _ *doxv1.ListProjectsRequest) (*doxv1.ListProjectsResponse, error) {
	c := caller.MustFrom(ctx)
	rows, err := s.q.ListProjectsVisibleTo(ctx, c.UserID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list projects: %v", err)
	}
	out := make([]*doxv1.Project, 0, len(rows))
	for _, p := range rows {
		out = append(out, projectToProto(p))
	}
	return &doxv1.ListProjectsResponse{Projects: out}, nil
}

func (s *Project) GetProject(ctx context.Context, req *doxv1.GetProjectRequest) (*doxv1.Project, error) {
	c := caller.MustFrom(ctx)
	id := req.GetId()
	if id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if err := authz.CanReadProject(ctx, s.q, c.UserID, id); err != nil {
		return nil, err
	}
	p, err := s.q.GetProject(ctx, id)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get project: %v", err)
	}
	return projectToProto(p), nil
}

func (s *Project) CreateProject(ctx context.Context, req *doxv1.CreateProjectRequest) (*doxv1.Project, error) {
	c := caller.MustFrom(ctx)
	name := strings.TrimSpace(req.GetName())
	if name == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}
	if len(name) > maxProjectName {
		return nil, status.Errorf(codes.InvalidArgument, "name exceeds %d bytes", maxProjectName)
	}
	desc := optionalText(req.Description, maxProjectDesc)
	color := optionalText(req.Color, maxColor)
	if desc.invalid {
		return nil, status.Errorf(codes.InvalidArgument, "description exceeds %d bytes", maxProjectDesc)
	}
	if color.invalid {
		return nil, status.Errorf(codes.InvalidArgument, "color exceeds %d bytes", maxColor)
	}

	id := ulid.Make().String()
	now := s.now()
	row, err := s.q.CreateProject(ctx, queries.CreateProjectParams{
		ID:          id,
		OwnerID:     c.UserID,
		Name:        name,
		Description: desc.value,
		Color:       color.value,
		SortOrder:   0,
		CreatedAt:   now,
		UpdatedAt:   now,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create project: %v", err)
	}
	return projectToProto(row), nil
}

func (s *Project) UpdateProject(ctx context.Context, req *doxv1.UpdateProjectRequest) (*doxv1.Project, error) {
	c := caller.MustFrom(ctx)
	id := req.GetId()
	if id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if err := authz.CanAdminProject(ctx, s.q, c.UserID, id); err != nil {
		return nil, err
	}
	existing, err := s.q.GetProject(ctx, id)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get project: %v", err)
	}

	name := existing.Name
	if req.Name != nil {
		n := strings.TrimSpace(*req.Name)
		if n == "" {
			return nil, status.Error(codes.InvalidArgument, "name cannot be empty")
		}
		if len(n) > maxProjectName {
			return nil, status.Errorf(codes.InvalidArgument, "name exceeds %d bytes", maxProjectName)
		}
		name = n
	}
	desc := existing.Description
	if req.Description != nil {
		if len(*req.Description) > maxProjectDesc {
			return nil, status.Errorf(codes.InvalidArgument, "description exceeds %d bytes", maxProjectDesc)
		}
		desc = sql.NullString{String: *req.Description, Valid: *req.Description != ""}
	}
	color := existing.Color
	if req.Color != nil {
		if len(*req.Color) > maxColor {
			return nil, status.Errorf(codes.InvalidArgument, "color exceeds %d bytes", maxColor)
		}
		color = sql.NullString{String: *req.Color, Valid: *req.Color != ""}
	}
	archived := existing.Archived
	if req.Archived != nil {
		archived = *req.Archived
	}
	sortOrder := existing.SortOrder
	if req.SortOrder != nil {
		sortOrder = int64(*req.SortOrder)
	}

	row, err := s.q.UpdateProject(ctx, queries.UpdateProjectParams{
		Name:        name,
		Description: desc,
		Color:       color,
		Archived:    archived,
		SortOrder:   sortOrder,
		UpdatedAt:   s.now(),
		ID:          id,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "update project: %v", err)
	}
	return projectToProto(row), nil
}

func (s *Project) DeleteProject(ctx context.Context, req *doxv1.DeleteProjectRequest) (*doxv1.DeleteProjectResponse, error) {
	c := caller.MustFrom(ctx)
	id := req.GetId()
	if id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if err := authz.CanAdminProject(ctx, s.q, c.UserID, id); err != nil {
		return nil, err
	}
	if _, err := s.q.DeleteProject(ctx, id); err != nil {
		return nil, status.Errorf(codes.Internal, "delete project: %v", err)
	}
	return &doxv1.DeleteProjectResponse{}, nil
}

func (s *Project) ListProjectMembers(ctx context.Context, req *doxv1.ListProjectMembersRequest) (*doxv1.ListProjectMembersResponse, error) {
	c := caller.MustFrom(ctx)
	pid := req.GetProjectId()
	if pid == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}
	if err := authz.CanReadProject(ctx, s.q, c.UserID, pid); err != nil {
		return nil, err
	}
	rows, err := s.q.ListProjectMembers(ctx, pid)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list members: %v", err)
	}
	out := make([]*doxv1.ProjectMember, 0, len(rows))
	for _, m := range rows {
		out = append(out, &doxv1.ProjectMember{
			UserId:  m.UserID,
			Role:    m.Role,
			AddedAt: m.AddedAt,
		})
	}
	return &doxv1.ListProjectMembersResponse{Members: out}, nil
}

func (s *Project) RemoveProjectMember(ctx context.Context, req *doxv1.RemoveProjectMemberRequest) (*doxv1.RemoveProjectMemberResponse, error) {
	c := caller.MustFrom(ctx)
	pid := req.GetProjectId()
	uid := req.GetUserId()
	if pid == "" || uid == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id and user_id are required")
	}
	if err := authz.CanAdminProject(ctx, s.q, c.UserID, pid); err != nil {
		return nil, err
	}
	n, err := s.q.RemoveProjectMember(ctx, queries.RemoveProjectMemberParams{
		ProjectID: pid,
		UserID:    uid,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "remove member: %v", err)
	}
	if n == 0 {
		return nil, status.Errorf(codes.NotFound, "user %q is not a member of project %q", uid, pid)
	}
	return &doxv1.RemoveProjectMemberResponse{}, nil
}

func projectToProto(p queries.Project) *doxv1.Project {
	return &doxv1.Project{
		Id:          p.ID,
		OwnerId:     p.OwnerID,
		Name:        p.Name,
		Description: p.Description.String,
		Color:       p.Color.String,
		Archived:    p.Archived,
		SortOrder:   int32(p.SortOrder),
		CreatedAt:   p.CreatedAt,
		UpdatedAt:   p.UpdatedAt,
	}
}

type optString struct {
	value   sql.NullString
	invalid bool
}

func optionalText(p *string, max int) optString {
	if p == nil {
		return optString{}
	}
	if len(*p) > max {
		return optString{invalid: true}
	}
	if *p == "" {
		return optString{}
	}
	return optString{value: sql.NullString{String: *p, Valid: true}}
}
