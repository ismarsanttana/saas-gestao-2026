package middleware

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog/log"
)

// Recover garante resposta sanitizada em caso de panic.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Error().Interface("panic", rec).Msg("panic recuperado")
				writeRecoverError(w)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func writeRecoverError(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusInternalServerError)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": nil,
		"error": map[string]any{
			"code":    "INTERNAL",
			"message": "erro interno",
		},
	})
}
