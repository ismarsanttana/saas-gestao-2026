package middleware

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RateLimiter mantém limiters por chave com expiração simples.
type RateLimiter struct {
	limit  rate.Limit
	burst  int
	mu     sync.Mutex
	store  map[string]*limiterEntry
	maxAge time.Duration
}

type limiterEntry struct {
	limiter *rate.Limiter
	updated time.Time
}

// NewRateLimiter cria instância compatível com múltiplas chaves.
func NewRateLimiter(reqPerSec float64, burst int) *RateLimiter {
	return &RateLimiter{
		limit:  rate.Limit(reqPerSec),
		burst:  burst,
		store:  make(map[string]*limiterEntry),
		maxAge: 10 * time.Minute,
	}
}

func (r *RateLimiter) get(key string) *rate.Limiter {
	r.mu.Lock()
	defer r.mu.Unlock()

	if entry, ok := r.store[key]; ok {
		entry.updated = time.Now()
		return entry.limiter
	}

	lim := rate.NewLimiter(r.limit, r.burst)
	r.store[key] = &limiterEntry{limiter: lim, updated: time.Now()}

	for k, entry := range r.store {
		if time.Since(entry.updated) > r.maxAge {
			delete(r.store, k)
		}
	}

	return lim
}

// LimitByKey aplica rate limit por chave arbitrária.
func (r *RateLimiter) LimitByKey(next http.Handler, keyFunc func(*http.Request) (string, bool)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		key, ok := keyFunc(req)
		if !ok || key == "" {
			next.ServeHTTP(w, req)
			return
		}

		lim := r.get(key)
		if !lim.Allow() {
			w.Header().Set("Retry-After", "1")
			writeRateLimitError(w)
			return
		}

		next.ServeHTTP(w, req)
	})
}

// IPRateLimit utiliza IP remoto como chave.
func IPRateLimit(limiter *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return limiter.LimitByKey(next, func(r *http.Request) (string, bool) {
			ip := realIPFromRequest(r)
			return ip, true
		})
	}
}

// UserRateLimit utiliza subject autenticado como chave.
func UserRateLimit(limiter *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return limiter.LimitByKey(next, func(r *http.Request) (string, bool) {
			subject := GetSubject(r.Context())
			if subject == "" {
				return "", false
			}
			return subject, true
		})
	}
}

func realIPFromRequest(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
		return ip
	}
	if ip := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); ip != "" {
		parts := strings.Split(ip, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func writeRateLimitError(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": nil,
		"error": map[string]any{
			"code":    "RATE_LIMIT",
			"message": "Limite de requisições excedido",
		},
	})
}
