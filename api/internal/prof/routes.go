package prof

import "github.com/go-chi/chi/v5"

// Mount registra rotas do módulo professor.
func Mount(r chi.Router, handler *Handler) {
	handler.RegisterRoutes(r)
}
