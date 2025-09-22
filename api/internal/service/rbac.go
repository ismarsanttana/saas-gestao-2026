package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/gestaozabele/municipio/internal/repo"
)

var (
	// ErrForbidden indica ausência de permissão.
	ErrForbidden = errors.New("acesso negado")
)

// RBACService opera regras de escopo e papéis.
type RBACService struct {
	repo *repo.Queries
}

// NewRBACService cria nova instância.
func NewRBACService(r *repo.Queries) *RBACService {
	return &RBACService{repo: r}
}

// ValidateSecretariaAccess garante que usuário possua vínculo com secretaria solicitada.
func (s *RBACService) ValidateSecretariaAccess(ctx context.Context, usuarioID uuid.UUID, secretariaID uuid.UUID) (repo.SecretariaWithRole, error) {
	secretarias, err := s.repo.ListSecretariasByUsuario(ctx, usuarioID)
	if err != nil {
		return repo.SecretariaWithRole{}, err
	}
	for _, sec := range secretarias {
		if sec.SecretariaID == secretariaID {
			return sec, nil
		}
	}
	return repo.SecretariaWithRole{}, ErrForbidden
}
