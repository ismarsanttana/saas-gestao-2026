package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
)

var (
	// ErrInvalidRefresh é retornado quando o token de refresh é inválido ou expirado.
	ErrInvalidRefresh = errors.New("refresh token inválido")
)

// GenerateRefreshToken cria token aleatório seguro e seu hash persistível.
func GenerateRefreshToken() (raw string, hashed string, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", err
	}

	raw = base64.RawURLEncoding.EncodeToString(buf)
	hashed = HashRefreshToken(raw)
	return raw, hashed, nil
}

// HashRefreshToken produz hash SHA-256 base64.
func HashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// RefreshRedisKey monta chave única para guardar estado do refresh.
func RefreshRedisKey(audience, hash string) string {
	return fmt.Sprintf("refresh:%s:%s", audience, hash)
}
