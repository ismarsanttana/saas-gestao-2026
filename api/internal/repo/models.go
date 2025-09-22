package repo

import (
	"time"

	"github.com/google/uuid"
)

// Usuario representa colaborador do backoffice.
type Usuario struct {
	ID        uuid.UUID
	Nome      string
	Email     string
	SenhaHash string
	Ativo     bool
	CriadoEm  time.Time
}

// Cidadao representa usuário do app cidadão.
type Cidadao struct {
	ID        uuid.UUID
	Nome      string
	Email     *string
	SenhaHash *string
	Ativo     bool
	CriadoEm  time.Time
}

// Secretaria representa secretaria municipal.
type Secretaria struct {
	ID       uuid.UUID
	Nome     string
	Slug     string
	Ativa    bool
	CriadoEm time.Time
}

// UsuarioSecretaria vincula usuário às secretarias com papel.
type UsuarioSecretaria struct {
	UsuarioID    uuid.UUID
	SecretariaID uuid.UUID
	Papel        string
}

// TokenRefresh modela tabela de refresh tokens.
type TokenRefresh struct {
	ID        uuid.UUID
	Subject   uuid.UUID
	Audience  string
	TokenHash string
	Expiracao time.Time
	CriadoEm  time.Time
	Revogado  bool
}

// SecretariaWithRole agrega secretaria com papel do usuário.
type SecretariaWithRole struct {
	SecretariaID uuid.UUID
	Secretaria   string
	Slug         string
	Papel        string
}
