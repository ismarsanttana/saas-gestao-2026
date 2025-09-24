package storage

import (
	"context"
	"errors"
)

// NoopUploader devolve erro indicando que não há backend configurado.
type NoopUploader struct{}

// Upload sempre retorna erro, sinalizando que o recurso não está disponível.
func (NoopUploader) Upload(ctx context.Context, input UploadInput) (*UploadResult, error) {
	return nil, errors.New("storage: uploader não configurado")
}
