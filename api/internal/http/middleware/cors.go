package middleware

import (
	"net/http"
	"net/url"
	"strings"
)

// CORS aplica política restrita baseada em ALLOW_ORIGINS.
// Suporta:
// - correspondência exata do Origin (ex.: https://painel.urbanbyte.com.br)
// - wildcard de subdomínio quando a entrada começar com *. (ex.: *.urbanbyte.com.br)
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowExact := make(map[string]struct{}, len(allowedOrigins))
	var allowSuffix []string // apenas host suffix (sem esquema), começando com .

	for _, entry := range allowedOrigins {
		e := strings.TrimSpace(entry)
		if e == "" {
			continue
		}
		if strings.HasPrefix(e, "*.") {
			allowSuffix = append(allowSuffix, strings.TrimPrefix(e, "*")) // preserva ".dominio"
			continue
		}
		allowExact[e] = struct{}{}
	}

	isAllowed := func(origin string) bool {
		if origin == "" {
			return false
		}
		if _, ok := allowExact[origin]; ok {
			return true
		}

		// Avalia wildcard contra o host do Origin
		u, err := url.Parse(origin)
		if err != nil {
			return false
		}
		host := strings.ToLower(u.Hostname())
		for _, suf := range allowSuffix {
			// suf já começa com '.' (ex.: ".urbanbyte.com.br")
			if strings.HasSuffix(host, strings.ToLower(suf)) {
				// exige subdomínio: host != raiz do sufixo
				base := strings.TrimPrefix(strings.ToLower(suf), ".")
				if host == base {
					continue
				}
				return true
			}
		}
		return false
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if isAllowed(origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Secretaria, X-Requested-With")
				w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
