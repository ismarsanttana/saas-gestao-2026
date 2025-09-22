package middleware

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/gestaozabele/municipio/internal/service"
)

// Scope valida secretaria ativa para rotas protegidas do backoffice.
func Scope(rbac *service.RBACService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.ToLower(GetAudience(r.Context())) != "backoffice" {
				next.ServeHTTP(w, r)
				return
			}

			secretariaID := r.Header.Get("X-Secretaria")
			if secretariaID == "" {
				secretariaID = r.URL.Query().Get("secretaria_id")
			}
			if secretariaID == "" {
				writeScopeError(w, http.StatusBadRequest, "VALIDATION", "Secretaria não informada")
				return
			}

			uid, err := uuid.Parse(secretariaID)
			if err != nil {
				writeScopeError(w, http.StatusBadRequest, "VALIDATION", "Secretaria inválida")
				return
			}

			subject := GetSubject(r.Context())
			subUUID, err := uuid.Parse(subject)
			if err != nil {
				writeScopeError(w, http.StatusUnauthorized, "AUTH", "subject inválido")
				return
			}

			_, err = rbac.ValidateSecretariaAccess(r.Context(), subUUID, uid)
			if err != nil {
				status := http.StatusForbidden
				code := "FORBIDDEN"
				if err != service.ErrForbidden {
					status = http.StatusInternalServerError
					code = "INTERNAL"
				}
				writeScopeError(w, status, code, err.Error())
				return
			}

			ctx := SetSecretaria(r.Context(), uid.String())
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func writeScopeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": nil,
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}
