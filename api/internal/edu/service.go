package edu

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

var (
	ErrForbidden = errors.New("forbidden")
)

// ProfessorService contém as regras do módulo educação.
type EducationRepository interface {
	ListTurmas(context.Context, uuid.UUID) ([]Turma, error)
	ListAulasByDate(context.Context, uuid.UUID, time.Time) ([]Aula, error)
	GetAulaChamada(context.Context, uuid.UUID, uuid.UUID) (Aula, []ChamadaAluno, error)
	FindRepeatSource(context.Context, uuid.UUID, uuid.UUID) (*uuid.UUID, error)
	RepeatPresencas(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, bool) error
	UpsertPresencas(context.Context, uuid.UUID, []PresencaItem) error
	ListNotas(context.Context, uuid.UUID, uuid.UUID, string, int) ([]Nota, error)
	UpsertNotas(context.Context, uuid.UUID, string, int, []NotaItem) error
	ListAvaliacoes(context.Context, uuid.UUID, *uuid.UUID, string) ([]Avaliacao, error)
	SaveAvaliacao(context.Context, Avaliacao, []AvaliacaoQuestao) (uuid.UUID, error)
	UpdateAvaliacaoStatus(context.Context, uuid.UUID, string) error
	ListQuestoes(context.Context, uuid.UUID) ([]AvaliacaoQuestao, error)
	ListRespostas(context.Context, uuid.UUID) ([]Resposta, error)
	UpsertNotaFromAvaliacao(context.Context, uuid.UUID, string, int, uuid.UUID, float64) error
	GetAvaliacao(context.Context, uuid.UUID) (Avaliacao, error)
	EnsureProfessorTurma(context.Context, uuid.UUID, uuid.UUID) error
	AulaOwner(context.Context, uuid.UUID) (uuid.UUID, error)
}

type ProfessorService struct {
	repo  EducationRepository
	cache *redis.Client
}

func NewProfessorService(repo EducationRepository, cache *redis.Client) *ProfessorService {
	return &ProfessorService{repo: repo, cache: cache}
}

func (s *ProfessorService) ensureTurmaOwnership(ctx context.Context, professorID, turmaID uuid.UUID) error {
	if err := s.repo.EnsureProfessorTurma(ctx, professorID, turmaID); err != nil {
		if errors.Is(err, errNotFound) {
			return ErrForbidden
		}
		return err
	}
	return nil
}

func (s *ProfessorService) ListTurmas(ctx context.Context, professorID uuid.UUID) ([]Turma, error) {
	return s.repo.ListTurmas(ctx, professorID)
}

func (s *ProfessorService) ListAulas(ctx context.Context, professorID uuid.UUID, day time.Time) ([]Aula, error) {
	key := fmt.Sprintf("prof:aulas:%s:%s", professorID.String(), day.Format("2006-01-02"))
	if s.cache != nil {
		if data, err := s.cache.Get(ctx, key).Bytes(); err == nil {
			var aulas []Aula
			if json.Unmarshal(data, &aulas) == nil {
				return aulas, nil
			}
		}
	}

	aulas, err := s.repo.ListAulasByDate(ctx, professorID, day)
	if err != nil {
		return nil, err
	}

	if s.cache != nil {
		if payload, err := json.Marshal(aulas); err == nil {
			_ = s.cache.Set(ctx, key, payload, 60*time.Second).Err()
		}
	}

	return aulas, nil
}

func (s *ProfessorService) GetChamada(ctx context.Context, professorID, aulaID uuid.UUID) (Aula, []ChamadaAluno, error) {
	return s.repo.GetAulaChamada(ctx, professorID, aulaID)
}

func (s *ProfessorService) GetUltimaChamada(ctx context.Context, professorID, aulaID uuid.UUID) (*uuid.UUID, error) {
	return s.repo.FindRepeatSource(ctx, professorID, aulaID)
}

func (s *ProfessorService) RepetirChamada(ctx context.Context, professorID, aulaID uuid.UUID, merge bool) error {
	turmaID, err := s.repo.AulaOwner(ctx, aulaID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return ErrForbidden
		}
		return err
	}

	if err := s.ensureTurmaOwnership(ctx, professorID, turmaID); err != nil {
		return err
	}

	sourceID, err := s.repo.FindRepeatSource(ctx, professorID, aulaID)
	if err != nil {
		return err
	}

	return s.repo.RepeatPresencas(ctx, aulaID, *sourceID, professorID, merge)
}

func (s *ProfessorService) ConfirmarChamada(ctx context.Context, professorID, aulaID uuid.UUID, itens []PresencaItem) error {
	turmaID, err := s.repo.AulaOwner(ctx, aulaID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return ErrForbidden
		}
		return err
	}

	if err := s.ensureTurmaOwnership(ctx, professorID, turmaID); err != nil {
		return err
	}

	for _, item := range itens {
		switch strings.ToUpper(item.Status) {
		case "PRESENTE", "FALTA", "ATRASO", "JUSTIFICADA":
		default:
			return fmt.Errorf("status inválido: %s", item.Status)
		}
	}

	return s.repo.UpsertPresencas(ctx, aulaID, itens)
}

func (s *ProfessorService) ListNotas(ctx context.Context, professorID, turmaID uuid.UUID, disciplina string, bimestre int) ([]Nota, error) {
	if err := s.ensureTurmaOwnership(ctx, professorID, turmaID); err != nil {
		return nil, err
	}

	return s.repo.ListNotas(ctx, professorID, turmaID, disciplina, bimestre)
}

func (s *ProfessorService) UpsertNotas(ctx context.Context, professorID, turmaID uuid.UUID, disciplina string, bimestre int, itens []NotaItem) error {
	if err := s.ensureTurmaOwnership(ctx, professorID, turmaID); err != nil {
		return err
	}
	for _, item := range itens {
		if item.Nota < 0 || item.Nota > 100 {
			return fmt.Errorf("nota inválida: %.2f", item.Nota)
		}
	}
	return s.repo.UpsertNotas(ctx, turmaID, disciplina, bimestre, itens)
}

func (s *ProfessorService) ListAvaliacoes(ctx context.Context, professorID uuid.UUID, turmaID *uuid.UUID, disciplina string) ([]Avaliacao, error) {
	if turmaID != nil && *turmaID != uuid.Nil {
		if err := s.ensureTurmaOwnership(ctx, professorID, *turmaID); err != nil {
			return nil, err
		}
	}
	return s.repo.ListAvaliacoes(ctx, professorID, turmaID, disciplina)
}

func (s *ProfessorService) SaveAvaliacao(ctx context.Context, professorID uuid.UUID, avaliacao Avaliacao, questoes []AvaliacaoQuestao) (uuid.UUID, error) {
	if err := s.ensureTurmaOwnership(ctx, professorID, avaliacao.TurmaID); err != nil {
		return uuid.Nil, err
	}
	if len(questoes) == 0 {
		return uuid.Nil, errors.New("é necessário informar ao menos uma questão")
	}
	for _, q := range questoes {
		if len(q.Alternativas) < 2 {
			return uuid.Nil, errors.New("cada questão precisa de pelo menos duas alternativas")
		}
		if q.Correta < 0 || int(q.Correta) >= len(q.Alternativas) {
			return uuid.Nil, errors.New("índice da alternativa correta inválido")
		}
	}
	avaliacao.CreatedBy = professorID
	if avaliacao.Status == "" {
		avaliacao.Status = "RASCUNHO"
	}
	return s.repo.SaveAvaliacao(ctx, avaliacao, questoes)
}

func (s *ProfessorService) PublicarAvaliacao(ctx context.Context, professorID, avaliacaoID uuid.UUID) error {
	a, err := s.repo.GetAvaliacao(ctx, avaliacaoID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return ErrForbidden
		}
		return err
	}
	if err := s.ensureTurmaOwnership(ctx, professorID, a.TurmaID); err != nil {
		return err
	}
	return s.repo.UpdateAvaliacaoStatus(ctx, avaliacaoID, "PUBLICADA")
}

func (s *ProfessorService) EncerrarAvaliacao(ctx context.Context, professorID, avaliacaoID uuid.UUID) error {
	a, err := s.repo.GetAvaliacao(ctx, avaliacaoID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return ErrForbidden
		}
		return err
	}
	if err := s.ensureTurmaOwnership(ctx, professorID, a.TurmaID); err != nil {
		return err
	}

	questoes, err := s.repo.ListQuestoes(ctx, avaliacaoID)
	if err != nil {
		return err
	}
	if len(questoes) == 0 {
		return errors.New("avaliação sem questões")
	}

	respostas, err := s.repo.ListRespostas(ctx, avaliacaoID)
	if err != nil {
		return err
	}

	totalQuest := len(questoes)
	acertosPorMatricula := make(map[uuid.UUID]int)

	questaoCorreta := make(map[uuid.UUID]int16)
	for _, q := range questoes {
		questaoCorreta[q.ID] = q.Correta
	}

	for _, resp := range respostas {
		if resp.Alternativa == nil {
			continue
		}
		if questaoCorreta[resp.QuestaoID] == *resp.Alternativa {
			acertosPorMatricula[resp.MatriculaID]++
		}
	}

	bimestre := deriveBimestre(a.Inicio)
	for matricula, acertos := range acertosPorMatricula {
		percent := float64(acertos) / float64(totalQuest) * 100
		if err := s.repo.UpsertNotaFromAvaliacao(ctx, a.TurmaID, a.Disciplina, bimestre, matricula, percent); err != nil {
			return err
		}
	}

	return s.repo.UpdateAvaliacaoStatus(ctx, avaliacaoID, "ENCERRADA")
}

func deriveBimestre(data *time.Time) int {
	if data == nil {
		return 1
	}
	month := int(data.Month())
	switch {
	case month <= 3:
		return 1
	case month <= 6:
		return 2
	case month <= 9:
		return 3
	default:
		return 4
	}
}
