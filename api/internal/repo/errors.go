package repo

import "errors"

var (
	// ErrNotFound é retornado quando nenhum registro é encontrado.
	ErrNotFound = errors.New("registro não encontrado")
)
