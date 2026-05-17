package authn

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/lin-snow/dox/apps/server/internal/caller"
)

// DefaultTokenTTL is the lifetime baked into tokens we issue. Long-ish so CLI
// users don't re-login every week, but bounded so a leaked token expires on
// its own — there is no server-side revocation.
const DefaultTokenTTL = 30 * 24 * time.Hour

// Claims is the JWT payload dox issues. UserID/Name/Role are carried in the
// claim so the middleware materializes a Caller without touching the DB.
//
// Role staleness: when a user's role changes, existing tokens keep the old
// role until they expire (≤ DefaultTokenTTL). The full guarantee returns on
// next Login. This is the accepted tradeoff for statelessness.
type Claims struct {
	UserName string `json:"name"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// IssueToken signs a JWT with the given secret. The user id goes into the
// standard "sub" claim; name/role are custom string claims.
func IssueToken(secret []byte, userID, name, role string, ttl time.Duration) (string, error) {
	if len(secret) == 0 {
		return "", errors.New("authn: empty signing secret")
	}
	if ttl <= 0 {
		ttl = DefaultTokenTTL
	}
	now := time.Now().UTC()
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UserName: name,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	})
	return t.SignedString(secret)
}

// ParseToken verifies a token's signature and expiry, returning the claims.
// Caller fields (UserID, UserName, Role) are read from Claims.Subject and
// custom fields.
func ParseToken(secret []byte, raw string) (Claims, error) {
	if len(secret) == 0 {
		return Claims{}, errors.New("authn: empty signing secret")
	}
	var c Claims
	_, err := jwt.ParseWithClaims(raw, &c, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Method.Alg())
		}
		return secret, nil
	})
	if err != nil {
		return Claims{}, err
	}
	return c, nil
}

// JWTVerifier is the production TokenVerifier — it parses a Bearer JWT and
// materializes a Caller from its claims. Stateless: no DB hit on the hot path.
type JWTVerifier struct {
	secret []byte
}

func NewJWTVerifier(secret []byte) *JWTVerifier {
	return &JWTVerifier{secret: secret}
}

func (v *JWTVerifier) Verify(raw string) (caller.Caller, bool) {
	c, err := ParseToken(v.secret, raw)
	if err != nil || c.Subject == "" {
		return caller.Caller{}, false
	}
	return caller.Caller{
		UserID:   c.Subject,
		UserName: c.UserName,
		Role:     c.Role,
	}, true
}
