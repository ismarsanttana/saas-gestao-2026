package middleware

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog/log"
)

// Logging escreve logs estruturados por requisição.
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()

		next.ServeHTTP(ww, r)

		dur := time.Since(start)
		event := log.Info().Str("method", r.Method).Str("path", r.URL.Path).
			Int("status", ww.Status()).Dur("duration", dur)

		if reqID := middleware.GetReqID(r.Context()); reqID != "" {
			event = event.Str("request_id", reqID)
		}

		if ip := r.Header.Get("X-Real-IP"); ip != "" {
			event = event.Str("ip", ip)
		} else {
			event = event.Str("ip", r.RemoteAddr)
		}

		if ua := r.Header.Get("User-Agent"); ua != "" {
			event = event.Str("user_agent", ua)
		}

		event.Msg("http_request")
	})
}
