package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gestaozabele/municipio/internal/auth"
)

type contextKey string

const (
	ContextKeySubject    contextKey = "subject"
	ContextKeyAudience   contextKey = "audience"
	ContextKeyRoles      contextKey = "roles"
	ContextKeySecretaria contextKey = "secretaria"
)

// Auth valida JWT de acesso e injeta claims no contexto.
func Auth(jwtManager *auth.JWTManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				writeError(w, http.StatusUnauthorized, "AUTH", "token ausente")
				return
			}

			claims, err := jwtManager.ParseAndValidate(parts[1])
			if err != nil {
				writeError(w, http.StatusUnauthorized, "AUTH", "token inválido")
				return
			}

			if len(claims.Audience) == 0 {
				writeError(w, http.StatusUnauthorized, "AUTH", "audience inválida")
				return
			}

			ctx := context.WithValue(r.Context(), ContextKeySubject, claims.Subject)
			ctx = context.WithValue(ctx, ContextKeyAudience, claims.Audience[0])
			ctx = context.WithValue(ctx, ContextKeyRoles, claims.Roles)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetSubject recupera subject do contexto.
func GetSubject(ctx context.Context) string {
	val, _ := ctx.Value(ContextKeySubject).(string)
	return val
}

// GetAudience recupera audience do contexto.
func GetAudience(ctx context.Context) string {
	val, _ := ctx.Value(ContextKeyAudience).(string)
	return val
}

// GetRoles recupera roles do contexto.
func GetRoles(ctx context.Context) []string {
	val, _ := ctx.Value(ContextKeyRoles).([]string)
	return val
}

// RequireProfessor garante papel de professor.
func RequireProfessor(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		roles := GetRoles(r.Context())
		for _, role := range roles {
			if strings.EqualFold(role, "PROFESSOR") {
				next.ServeHTTP(w, r)
				return
			}
		}

		writeError(w, http.StatusForbidden, "FORBIDDEN", "acesso restrito a professores")
	})
}

// RequireSaaSAdmin garante que o usuário é administrador SaaS.
func RequireSaaSAdmin(next http.Handler) http.Handler {
	return RequireSaaSRoles("SAAS_ADMIN", "SAAS_OWNER")(next)
}

// RequireSaaSRoles garante que o usuário SaaS possua pelo menos um dos papéis informados.
func RequireSaaSRoles(requiredRoles ...string) func(http.Handler) http.Handler {
	normalized := make([]string, 0, len(requiredRoles))
	for _, role := range requiredRoles {
		role = strings.ToUpper(strings.TrimSpace(role))
		if role != "" {
			normalized = append(normalized, role)
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.EqualFold(GetAudience(r.Context()), "saas") {
				writeError(w, http.StatusForbidden, "FORBIDDEN", "acesso restrito ao SaaS")
				return
			}

			roles := GetRoles(r.Context())
			for _, role := range roles {
				roleUpper := strings.ToUpper(strings.TrimSpace(role))
				for _, required := range normalized {
					if roleUpper == required {
						next.ServeHTTP(w, r)
						return
					}
				}
			}

			writeError(w, http.StatusForbidden, "FORBIDDEN", "acesso restrito ao SaaS")
		})
	}
}

// SetSecretaria injeta secretaria ativa no contexto.
func SetSecretaria(ctx context.Context, secretariaID string) context.Context {
	return context.WithValue(ctx, ContextKeySecretaria, secretariaID)
}

// GetSecretaria retorna secretaria ativa do contexto.
func GetSecretaria(ctx context.Context) string {
	val, _ := ctx.Value(ContextKeySecretaria).(string)
	return val
}

func writeError(w http.ResponseWriter, status int, code, message string) {
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
