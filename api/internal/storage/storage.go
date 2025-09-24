package storage

import "context"

// UploadInput representa uma operação de upload simples.
type UploadInput struct {
    Key          string
    Body         []byte
    ContentType  string
    CacheControl string
}

// UploadResult descreve o artefato persistido.
type UploadResult struct {
    URL string
    ETag string
}

// Uploader define comportamento básico para armazenar blobs.
type Uploader interface {
    Upload(ctx context.Context, input UploadInput) (*UploadResult, error)
}
