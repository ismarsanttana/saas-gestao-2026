package edu

import (
	"github.com/go-chi/chi/v5"
)

// Mount adiciona rotas do professor no router.
func Mount(r chi.Router, handler *Handler) {
	handler.RegisterRoutes(r)
}
