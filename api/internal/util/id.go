package util

import "github.com/google/uuid"

// NewULID gera um UUID v4 (placeholder para ULID futuramente).
func NewULID() string {
	return uuid.NewString()
}
