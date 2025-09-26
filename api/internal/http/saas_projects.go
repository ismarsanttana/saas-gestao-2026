package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type projectPayload struct {
	Name        string   `json:"name"`
	Description *string  `json:"description"`
	Status      *string  `json:"status"`
	Progress    *float64 `json:"progress"`
	LeadID      *string  `json:"lead_id"`
	OwnerID     *string  `json:"owner_id"`
	StartedAt   *string  `json:"started_at"`
	TargetDate  *string  `json:"target_date"`
}

type taskPayload struct {
	Title    string  `json:"title"`
	Owner    *string `json:"owner"`
	Status   *string `json:"status"`
	DueDate  *string `json:"due_date"`
	Notes    *string `json:"notes"`
	Position *int    `json:"position"`
}

// ListProjects devolve todos os projetos registrados com suas tarefas.
func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := h.loadProjects(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível listar projetos", nil)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"projects": projects})
}

// CreateProject insere um novo projeto estratégico.
func (h *Handler) CreateProject(w http.ResponseWriter, r *http.Request) {
	var payload projectPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "nome é obrigatório", nil)
		return
	}

	creatorID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	status := "planning"
	if payload.Status != nil && strings.TrimSpace(*payload.Status) != "" {
		status = strings.TrimSpace(strings.ToLower(*payload.Status))
	}

	progress := 0.0
	if payload.Progress != nil {
		progress = minMaxFloat(*payload.Progress, 0, 100)
	}

	var leadID sql.NullString
	if payload.LeadID != nil && strings.TrimSpace(*payload.LeadID) != "" {
		leadID = sql.NullString{String: strings.TrimSpace(*payload.LeadID), Valid: true}
	}

	var ownerID sql.NullString
	if payload.OwnerID != nil && strings.TrimSpace(*payload.OwnerID) != "" {
		ownerID = sql.NullString{String: strings.TrimSpace(*payload.OwnerID), Valid: true}
	}

	var started sql.NullTime
	if payload.StartedAt != nil && strings.TrimSpace(*payload.StartedAt) != "" {
		if ts, err := parseISODate(*payload.StartedAt); err == nil {
			started = sql.NullTime{Time: ts, Valid: true}
		}
	}

	var target sql.NullTime
	if payload.TargetDate != nil && strings.TrimSpace(*payload.TargetDate) != "" {
		if ts, err := parseISODate(*payload.TargetDate); err == nil {
			target = sql.NullTime{Time: ts, Valid: true}
		}
	}

	var description sql.NullString
	if payload.Description != nil {
		description = sql.NullString{String: strings.TrimSpace(*payload.Description), Valid: true}
	}

	const insertProject = `
        INSERT INTO saas_projects (name, description, status, progress, lead_id, owner_id, started_at, target_date, created_by, updated_by)
        VALUES ($1,$2,$3,$4, NULLIF($5,''), NULLIF($6,''), $7, $8, $9, $9)
        RETURNING id
    `

	var projectID uuid.UUID
	if err := h.pool.QueryRow(r.Context(), insertProject,
		name,
		description,
		status,
		progress,
		leadID.String,
		ownerID.String,
		nullableTime(started),
		nullableTime(target),
		creatorID,
	).Scan(&projectID); err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível criar projeto", nil)
		return
	}

	project, err := h.getProjectWithTasks(r.Context(), projectID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "projeto não encontrado", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar projeto", nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"project": project})
}

// UpdateProject altera dados básicos do projeto.
func (h *Handler) UpdateProject(w http.ResponseWriter, r *http.Request) {
	projectID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	var payload projectPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	updaterID, err := h.subjectUUID(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "AUTH", "identificação inválida", nil)
		return
	}

	setParts := make([]string, 0, 8)
	args := make([]any, 0, 8)
	idx := 1

	if payload.Name != "" {
		name := strings.TrimSpace(payload.Name)
		if name == "" {
			WriteError(w, http.StatusBadRequest, "VALIDATION", "nome inválido", nil)
			return
		}
		setParts = append(setParts, fmt.Sprintf("name = $%d", idx))
		args = append(args, name)
		idx++
	}

	if payload.Description != nil {
		desc := strings.TrimSpace(*payload.Description)
		setParts = append(setParts, fmt.Sprintf("description = $%d", idx))
		if desc == "" {
			args = append(args, nil)
		} else {
			args = append(args, desc)
		}
		idx++
	}

	if payload.Status != nil && strings.TrimSpace(*payload.Status) != "" {
		status := strings.ToLower(strings.TrimSpace(*payload.Status))
		setParts = append(setParts, fmt.Sprintf("status = $%d", idx))
		args = append(args, status)
		idx++
	}

	if payload.Progress != nil {
		setParts = append(setParts, fmt.Sprintf("progress = $%d", idx))
		args = append(args, minMaxFloat(*payload.Progress, 0, 100))
		idx++
	}

	if payload.LeadID != nil {
		lead := strings.TrimSpace(*payload.LeadID)
		setParts = append(setParts, fmt.Sprintf("lead_id = NULLIF($%d,'')", idx))
		args = append(args, lead)
		idx++
	}

	if payload.OwnerID != nil {
		owner := strings.TrimSpace(*payload.OwnerID)
		setParts = append(setParts, fmt.Sprintf("owner_id = NULLIF($%d,'')", idx))
		args = append(args, owner)
		idx++
	}

	if payload.StartedAt != nil {
		var t any
		if ts, err := parseISODate(*payload.StartedAt); err == nil {
			t = ts
		}
		setParts = append(setParts, fmt.Sprintf("started_at = $%d", idx))
		args = append(args, t)
		idx++
	}

	if payload.TargetDate != nil {
		var t any
		if ts, err := parseISODate(*payload.TargetDate); err == nil {
			t = ts
		}
		setParts = append(setParts, fmt.Sprintf("target_date = $%d", idx))
		args = append(args, t)
		idx++
	}

	if len(setParts) == 0 {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "nenhum campo para atualizar", nil)
		return
	}

	setParts = append(setParts, fmt.Sprintf("updated_by = $%d", idx))
	args = append(args, updaterID)
	idx++

	args = append(args, projectID)

	query := fmt.Sprintf("UPDATE saas_projects SET %s, updated_at = now() WHERE id = $%d", strings.Join(setParts, ", "), idx)

	tag, err := h.pool.Exec(r.Context(), query, args...)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível atualizar projeto", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "projeto não encontrado", nil)
		return
	}

	project, err := h.getProjectWithTasks(r.Context(), projectID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar projeto", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"project": project})
}

// DeleteProject remove um projeto e suas tarefas.
func (h *Handler) DeleteProject(w http.ResponseWriter, r *http.Request) {
	projectID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	tag, err := h.pool.Exec(r.Context(), "DELETE FROM saas_projects WHERE id = $1", projectID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível remover projeto", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "projeto não encontrado", nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// CreateProjectTask adiciona uma tarefa no projeto informado.
func (h *Handler) CreateProjectTask(w http.ResponseWriter, r *http.Request) {
	projectID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}

	var payload taskPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	title := strings.TrimSpace(payload.Title)
	if title == "" {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "título é obrigatório", nil)
		return
	}

	status := "pending"
	if payload.Status != nil && strings.TrimSpace(*payload.Status) != "" {
		status = strings.TrimSpace(strings.ToLower(*payload.Status))
	}

	var owner sql.NullString
	if payload.Owner != nil && strings.TrimSpace(*payload.Owner) != "" {
		owner = sql.NullString{String: strings.TrimSpace(*payload.Owner), Valid: true}
	}

	var due sql.NullTime
	if payload.DueDate != nil && strings.TrimSpace(*payload.DueDate) != "" {
		if ts, err := parseISODate(*payload.DueDate); err == nil {
			due = sql.NullTime{Time: ts, Valid: true}
		}
	}

	var notes sql.NullString
	if payload.Notes != nil && strings.TrimSpace(*payload.Notes) != "" {
		notes = sql.NullString{String: strings.TrimSpace(*payload.Notes), Valid: true}
	}

	position := 0
	if payload.Position != nil {
		position = *payload.Position
	}

	const insertTask = `
        INSERT INTO saas_project_tasks (project_id, title, owner, status, due_date, notes, position)
        VALUES ($1, $2, NULLIF($3,''), $4, $5, $6, $7)
        RETURNING id
    `

	var taskID uuid.UUID
	if err := h.pool.QueryRow(r.Context(), insertTask, projectID, title, owner.String, status, nullableTime(due), nullableString(notes), position).Scan(&taskID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "projeto não encontrado", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível criar tarefa", nil)
		return
	}

	task, err := h.getTaskByID(r.Context(), projectID, taskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "tarefa não encontrada", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar tarefa", nil)
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"task": task})
}

// UpdateProjectTask altera status ou campos adicionais.
func (h *Handler) UpdateProjectTask(w http.ResponseWriter, r *http.Request) {
	projectID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}
	taskID, err := parseUUIDParam(r, "taskID")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id da tarefa inválido", nil)
		return
	}

	var payload taskPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "JSON inválido", nil)
		return
	}

	setParts := make([]string, 0, 6)
	args := make([]any, 0, 6)
	idx := 1

	if payload.Title != "" {
		title := strings.TrimSpace(payload.Title)
		if title == "" {
			WriteError(w, http.StatusBadRequest, "VALIDATION", "título inválido", nil)
			return
		}
		setParts = append(setParts, fmt.Sprintf("title = $%d", idx))
		args = append(args, title)
		idx++
	}

	if payload.Owner != nil {
		owner := strings.TrimSpace(*payload.Owner)
		setParts = append(setParts, fmt.Sprintf("owner = NULLIF($%d,'')", idx))
		args = append(args, owner)
		idx++
	}

	if payload.Status != nil {
		status := strings.ToLower(strings.TrimSpace(*payload.Status))
		if status == "" {
			status = "pending"
		}
		setParts = append(setParts, fmt.Sprintf("status = $%d", idx))
		args = append(args, status)
		idx++
		if status == "done" {
			setParts = append(setParts, "completed_at = now()")
		} else {
			setParts = append(setParts, "completed_at = NULL")
		}
	}

	if payload.DueDate != nil {
		var t any
		if ts, err := parseISODate(*payload.DueDate); err == nil {
			t = ts
		}
		setParts = append(setParts, fmt.Sprintf("due_date = $%d", idx))
		args = append(args, t)
		idx++
	}

	if payload.Notes != nil {
		note := strings.TrimSpace(*payload.Notes)
		setParts = append(setParts, fmt.Sprintf("notes = $%d", idx))
		if note == "" {
			args = append(args, nil)
		} else {
			args = append(args, note)
		}
		idx++
	}

	if payload.Position != nil {
		setParts = append(setParts, fmt.Sprintf("position = $%d", idx))
		args = append(args, *payload.Position)
		idx++
	}

	if len(setParts) == 0 {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "nenhum campo para atualizar", nil)
		return
	}

	args = append(args, projectID)
	args = append(args, taskID)

	query := fmt.Sprintf("UPDATE saas_project_tasks SET %s, updated_at = now() WHERE project_id = $%d AND id = $%d", strings.Join(setParts, ", "), idx, idx+1)

	tag, err := h.pool.Exec(r.Context(), query, args...)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível atualizar tarefa", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "tarefa não encontrada", nil)
		return
	}

	task, err := h.getTaskByID(r.Context(), projectID, taskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "tarefa não encontrada", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "falha ao carregar tarefa", nil)
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"task": task})
}

// DeleteProjectTask remove uma tarefa específica.
func (h *Handler) DeleteProjectTask(w http.ResponseWriter, r *http.Request) {
	projectID, err := parseUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id inválido", nil)
		return
	}
	taskID, err := parseUUIDParam(r, "taskID")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "VALIDATION", "id da tarefa inválido", nil)
		return
	}

	tag, err := h.pool.Exec(r.Context(), "DELETE FROM saas_project_tasks WHERE project_id = $1 AND id = $2", projectID, taskID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível remover tarefa", nil)
		return
	}
	if tag.RowsAffected() == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "tarefa não encontrada", nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) getProjectWithTasks(ctx context.Context, projectID uuid.UUID) (projectOverview, error) {
	const query = `
        SELECT id, name, description, status, progress, lead_id, owner_id, started_at, target_date, updated_at
        FROM saas_projects
        WHERE id = $1
    `

	var (
		project projectOverview
		lead    uuid.NullUUID
		owner   uuid.NullUUID
		started sql.NullTime
		target  sql.NullTime
	)

	err := h.pool.QueryRow(ctx, query, projectID).Scan(&project.ID, &project.Name, &project.Description, &project.Status, &project.Progress, &lead, &owner, &started, &target, &project.UpdatedAt)
	if err != nil {
		return projectOverview{}, err
	}

	if lead.Valid {
		id := lead.UUID
		project.Lead = &id
	}
	if owner.Valid {
		id := owner.UUID
		project.Owner = &id
	}
	if started.Valid {
		ts := started.Time
		project.StartedAt = &ts
	}
	if target.Valid {
		ts := target.Time
		project.TargetDate = &ts
	}

	tasks, err := h.loadProjectTasks(ctx, project.ID)
	if err != nil {
		return projectOverview{}, err
	}
	project.Tasks = tasks

	return project, nil
}

func (h *Handler) getTaskByID(ctx context.Context, projectID, taskID uuid.UUID) (projectTaskView, error) {
	const query = `
        SELECT id, title, owner, status, due_date, notes, position, created_at, updated_at, completed_at
        FROM saas_project_tasks
        WHERE project_id = $1 AND id = $2
    `

	var (
		task      projectTaskView
		owner     sql.NullString
		due       sql.NullTime
		notes     sql.NullString
		completed sql.NullTime
	)

	if err := h.pool.QueryRow(ctx, query, projectID, taskID).Scan(&task.ID, &task.Title, &owner, &task.Status, &due, &notes, &task.Position, &task.CreatedAt, &task.UpdatedAt, &completed); err != nil {
		return projectTaskView{}, err
	}
	if owner.Valid {
		val := owner.String
		task.Owner = &val
	}
	if due.Valid {
		ts := due.Time
		task.DueDate = &ts
	}
	if notes.Valid {
		note := notes.String
		task.Notes = &note
	}
	if completed.Valid {
		ts := completed.Time
		task.CompletedAt = &ts
	}
	return task, nil
}

func parseUUIDParam(r *http.Request, name string) (uuid.UUID, error) {
	value := strings.TrimSpace(chi.URLParam(r, name))
	if value == "" {
		return uuid.Nil, errors.New("empty")
	}
	return uuid.Parse(value)
}

func parseISODate(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, fmt.Errorf("empty")
	}
	if ts, err := time.Parse(time.RFC3339, value); err == nil {
		return ts, nil
	}
	if ts, err := time.Parse("2006-01-02", value); err == nil {
		return ts, nil
	}
	return time.Time{}, fmt.Errorf("invalid date")
}

func nullableTime(t sql.NullTime) any {
	if t.Valid {
		return t.Time
	}
	return nil
}

func nullableString(s sql.NullString) any {
	if s.Valid {
		return strings.TrimSpace(s.String)
	}
	return nil
}

func minMaxFloat(value float64, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
