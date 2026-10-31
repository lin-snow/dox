package authn

import (
	"math"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	// authRefillPerSecond is one successful attempt per five seconds once the
	// burst is spent. A human retrying a typo never notices; an online
	// password or invite-code search is reduced to 12 attempts/minute/IP.
	authRefillPerSecond = 0.2
	authBurst           = 5.0

	rateLimitIdleTTL = 10 * time.Minute
	rateLimitSweep   = time.Minute
	rateLimitMaxKeys = 10_000
)

// limitedAuthPaths are the unauthenticated endpoints that trigger expensive
// work (argon2 hashing, invite lookups). Everything else bypasses the limiter.
var limitedAuthPaths = map[string]bool{
	"/v1/auth/login":    true,
	"/v1/auth/register": true,
}

type rateBucket struct {
	tokens float64
	last   time.Time
}

// RateLimiter is an in-process token bucket keyed by client address + path.
// In-process is deliberate: one dox server owns one SQLite file, so there is
// nothing to share and no external dependency to run.
type RateLimiter struct {
	mu         sync.Mutex
	buckets    map[string]*rateBucket
	refill     float64
	burst      float64
	trustProxy bool
	now        func() time.Time
	lastSweep  time.Time
}

// NewRateLimiter returns the production limiter. trustProxy controls whether
// X-Forwarded-For is believed; only enable it when a reverse proxy you
// control overwrites that header.
func NewRateLimiter(trustProxy bool) *RateLimiter {
	return newRateLimiter(authRefillPerSecond, authBurst, trustProxy)
}

func newRateLimiter(refill, burst float64, trustProxy bool) *RateLimiter {
	return &RateLimiter{
		buckets:    make(map[string]*rateBucket),
		refill:     refill,
		burst:      burst,
		trustProxy: trustProxy,
		now:        time.Now,
	}
}

// Allow reports whether one attempt may proceed for key. The bucket is
// created full, so a fresh client gets a burst before refill kicks in.
func (l *RateLimiter) Allow(key string) bool {
	if key == "" {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.sweepLocked(now)

	b := l.buckets[key]
	if b == nil {
		// Fail closed for new keys once the table is full: growing without
		// bound would let a spoofed-source flood exhaust memory.
		if len(l.buckets) >= rateLimitMaxKeys {
			return false
		}
		b = &rateBucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}

	if elapsed := now.Sub(b.last).Seconds(); elapsed > 0 {
		b.tokens = math.Min(l.burst, b.tokens+elapsed*l.refill)
		b.last = now
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (l *RateLimiter) sweepLocked(now time.Time) {
	if now.Sub(l.lastSweep) < rateLimitSweep {
		return
	}
	l.lastSweep = now
	for key, b := range l.buckets {
		if now.Sub(b.last) > rateLimitIdleTTL {
			delete(l.buckets, key)
		}
	}
}

// Middleware limits the public auth endpoints. It sits in front of the authn
// middleware so rejected requests never reach argon2.
func (l *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !limitedAuthPaths[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}
		if !l.Allow(l.clientKey(r) + "|" + r.URL.Path) {
			w.Header().Set("Retry-After", "5")
			http.Error(w, "too many attempts; retry shortly", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (l *RateLimiter) clientKey(r *http.Request) string {
	if l.trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			if i := strings.IndexByte(xff, ','); i >= 0 {
				xff = xff[:i]
			}
			if ip := strings.TrimSpace(xff); ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
