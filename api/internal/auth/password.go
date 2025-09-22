package auth

import (
	"github.com/alexedwards/argon2id"
)

var params = &argon2id.Params{
	Memory:      64 * 1024, // 64 MB
	Iterations:  3,
	Parallelism: 1,
	SaltLength:  16,
	KeyLength:   32,
}

// Hash gera um hash Argon2id (inclui os parâmetros dentro do próprio hash).
func Hash(password string) (string, error) {
	return argon2id.CreateHash(password, params)
}

// Verify compara a senha com o hash Argon2id (lendo parâmetros do próprio hash).
func Verify(password, encodedHash string) (bool, error) {
	return argon2id.ComparePasswordAndHash(password, encodedHash)
}
