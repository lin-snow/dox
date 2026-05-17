// Package caller carries the authenticated caller through request contexts.
// Middleware writes a Caller; service handlers read it.
package caller

import "context"

const (
	RoleOwner  = "owner"
	RoleMember = "member"
)

// Caller is the subject of an authenticated request.
type Caller struct {
	UserID   string
	UserName string
	Role     string
	DeviceID string
}

type ctxKey struct{}

func With(ctx context.Context, c Caller) context.Context {
	return context.WithValue(ctx, ctxKey{}, c)
}

func From(ctx context.Context) (Caller, bool) {
	c, ok := ctx.Value(ctxKey{}).(Caller)
	return c, ok
}

// MustFrom panics if the context has no caller. Use only inside service
// handlers that the middleware guarantees to have populated.
func MustFrom(ctx context.Context) Caller {
	c, ok := From(ctx)
	if !ok {
		panic("caller: missing — middleware misconfigured or test fixture forgot to seed it")
	}
	return c
}
