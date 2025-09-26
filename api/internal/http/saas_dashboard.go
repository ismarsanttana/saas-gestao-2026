package http

import (
	"context"
	"database/sql"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type overviewMetrics struct {
	CitizensTotal    int64   `json:"citizens_total"`
	ManagersTotal    int64   `json:"managers_total"`
	SecretariesTotal int64   `json:"secretaries_total"`
	RequestsTotal    int64   `json:"requests_total"`
	RequestsResolved int64   `json:"requests_resolved"`
	RequestsPending  int64   `json:"requests_pending"`
	TenantsActive    int64   `json:"tenants_active"`
	TenantsTotal     int64   `json:"tenants_total"`
	TrafficGB        float64 `json:"traffic_gb"`
	MRR              float64 `json:"mrr"`
	ExpensesForecast float64 `json:"expenses_forecast"`
	RevenueForecast  float64 `json:"revenue_forecast"`
	StaffTotal       int64   `json:"staff_total"`
	UsersOnline      int64   `json:"users_online"`
	TotalAccesses    int64   `json:"total_accesses"`
}

type projectOverview struct {
	ID          uuid.UUID         `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Status      string            `json:"status"`
	Progress    float64           `json:"progress"`
	Owner       *uuid.UUID        `json:"owner,omitempty"`
	Lead        *uuid.UUID        `json:"lead,omitempty"`
	StartedAt   *time.Time        `json:"started_at,omitempty"`
	TargetDate  *time.Time        `json:"target_date,omitempty"`
	UpdatedAt   time.Time         `json:"updated_at"`
	Tasks       []projectTaskView `json:"tasks"`
}

type projectTaskView struct {
	ID          uuid.UUID  `json:"id"`
	Title       string     `json:"title"`
	Owner       *string    `json:"owner,omitempty"`
	Status      string     `json:"status"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Notes       *string    `json:"notes,omitempty"`
	Position    int        `json:"position"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

type retentionSummary struct {
	Cohorts       []retentionCohort `json:"cohorts"`
	ChurnRate     float64           `json:"churn_rate"`
	ExpansionRate float64           `json:"expansion_rate"`
	NPSGlobal     float64           `json:"nps_global"`
	ActiveTenants int64             `json:"active_tenants"`
}

type retentionCohort struct {
	Month      time.Time `json:"month"`
	Tenants    int64     `json:"tenants"`
	Churn      int64     `json:"churn"`
	Expansion  int64     `json:"expansion"`
	NPS        int64     `json:"nps"`
	Engagement int64     `json:"engagement"`
}

type usageAnalytics struct {
	Heatmap        []moduleHeatmap      `json:"heatmap"`
	CitizenFunnel  []funnelStage        `json:"citizen_funnel"`
	TopSecretariat []secretariatRanking `json:"top_secretariats"`
}

type moduleHeatmap struct {
	Module string   `json:"module"`
	Labels []string `json:"labels"`
	Usage  []int64  `json:"usage"`
}

type funnelStage struct {
	Stage      string  `json:"stage"`
	Value      int64   `json:"value"`
	Conversion float64 `json:"conversion"`
}

type secretariatRanking struct {
	Name         string `json:"name"`
	Interactions int64  `json:"interactions"`
}

type complianceRecord struct {
	TenantID   uuid.UUID          `json:"tenant_id"`
	TenantName string             `json:"tenant_name"`
	Audits     []complianceAudit  `json:"audits"`
	Reports    []complianceReport `json:"reports"`
}

type complianceAudit struct {
	ID        uuid.UUID `json:"id"`
	Actor     string    `json:"actor"`
	Action    string    `json:"action"`
	Performed time.Time `json:"performed_at"`
	Channel   string    `json:"channel"`
	SLABreach bool      `json:"sla_breach"`
}

type complianceReport struct {
	ID     uuid.UUID `json:"id"`
	Title  string    `json:"title"`
	Period string    `json:"period"`
	Status string    `json:"status"`
	URL    *string   `json:"url,omitempty"`
}

type communicationCenter struct {
	Announcements []announcementView `json:"announcements"`
	PushQueue     []pushNotification `json:"push_queue"`
	History       []pushNotification `json:"history"`
}

type announcementView struct {
	ID          uuid.UUID `json:"id"`
	Title       string    `json:"title"`
	Audience    string    `json:"audience"`
	Status      string    `json:"status"`
	PublishedAt time.Time `json:"published_at"`
	Author      string    `json:"author"`
}

type pushNotification struct {
	ID           uuid.UUID  `json:"id"`
	TenantName   string     `json:"tenant_name"`
	CreatedAt    time.Time  `json:"created_at"`
	Type         string     `json:"type"`
	Channel      string     `json:"channel"`
	Status       string     `json:"status"`
	Subject      string     `json:"subject"`
	Summary      *string    `json:"summary,omitempty"`
	ScheduledFor *time.Time `json:"scheduled_for,omitempty"`
}

type cityInsightView struct {
	ID            uuid.UUID `json:"id"`
	TenantID      uuid.UUID `json:"tenant_id"`
	Name          string    `json:"name"`
	Population    int64     `json:"population"`
	ActiveUsers   int64     `json:"active_users"`
	RequestsTotal int64     `json:"requests_total"`
	Satisfaction  float64   `json:"satisfaction"`
	LastSync      time.Time `json:"last_sync"`
	Highlights    []string  `json:"highlights"`
}

type accessLogView struct {
	ID        uuid.UUID `json:"id"`
	User      string    `json:"user"`
	Role      string    `json:"role"`
	Tenant    *string   `json:"tenant,omitempty"`
	LoggedAt  time.Time `json:"logged_at"`
	IP        string    `json:"ip"`
	Location  string    `json:"location"`
	UserAgent string    `json:"user_agent"`
	Status    string    `json:"status"`
}

type dashboardResponse struct {
	Metrics       overviewMetrics     `json:"metrics"`
	Projects      []projectOverview   `json:"projects"`
	Retention     retentionSummary    `json:"retention"`
	Usage         usageAnalytics      `json:"usage"`
	Compliance    []complianceRecord  `json:"compliance"`
	Communication communicationCenter `json:"communication"`
	CityInsights  []cityInsightView   `json:"city_insights"`
	AccessLogs    []accessLogView     `json:"access_logs"`
}

// DashboardOverview agrega os dados necessários para a visão principal do painel.
func (h *Handler) DashboardOverview(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	metrics, err := h.loadOverviewMetrics(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar métricas", nil)
		return
	}

	projects, err := h.loadProjects(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar projetos", nil)
		return
	}

	retention, err := h.loadRetention(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar retenção", nil)
		return
	}

	usage, err := h.loadUsageAnalytics(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar analytics", nil)
		return
	}

	compliance, err := h.loadCompliance(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar compliance", nil)
		return
	}

	communication, err := h.loadCommunication(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar comunicações", nil)
		return
	}

	insights, err := h.loadCityInsights(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar insights", nil)
		return
	}

	accessLogs, err := h.loadAccessLogs(ctx)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "INTERNAL", "não foi possível carregar acessos", nil)
		return
	}

	response := dashboardResponse{
		Metrics:       metrics,
		Projects:      projects,
		Retention:     retention,
		Usage:         usage,
		Compliance:    compliance,
		Communication: communication,
		CityInsights:  insights,
		AccessLogs:    accessLogs,
	}

	WriteJSON(w, http.StatusOK, response)
}

func (h *Handler) loadOverviewMetrics(ctx context.Context) (overviewMetrics, error) {
	var metrics overviewMetrics

	const query = `
        SELECT
            (SELECT COUNT(*) FROM cidadaos) AS citizens_total,
            (SELECT COUNT(*) FROM usuarios) AS managers_total,
            (SELECT COUNT(DISTINCT usuario_id) FROM usuarios_secretarias WHERE papel IN ('SECRETARIO','PREFEITO')) AS secretaries_total,
            (SELECT COUNT(*) FROM support_tickets) AS requests_total,
            (SELECT COUNT(*) FROM support_tickets WHERE status IN ('resolved','closed')) AS requests_resolved,
            (SELECT COUNT(*) FROM support_tickets WHERE status NOT IN ('resolved','closed')) AS requests_pending,
            (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS tenants_active,
            (SELECT COUNT(*) FROM tenants) AS tenants_total,
            COALESCE((SELECT SUM(usage_count) FROM saas_usage_heatmap), 0) AS traffic_gb,
            COALESCE((SELECT SUM(amount) FROM saas_finance_entries WHERE entry_type IN ('revenue','subscription') AND paid = TRUE), 0) AS mrr,
            COALESCE((SELECT SUM(amount) FROM saas_finance_entries WHERE entry_type IN ('expense','investment','payroll') AND paid = FALSE), 0) AS expenses_forecast,
            COALESCE((SELECT SUM(amount) FROM saas_finance_entries WHERE entry_type IN ('revenue','subscription') AND paid = FALSE), 0) AS revenue_forecast,
            (SELECT COUNT(*) FROM saas_users) AS staff_total,
            COALESCE((SELECT COUNT(DISTINCT user_name) FROM saas_access_logs WHERE logged_at >= now() - interval '10 minutes' AND lower(coalesce(status, '')) IN ('success','sucesso')), 0) AS users_online,
            COALESCE((SELECT COUNT(*) FROM saas_access_logs), 0) AS total_accesses
    `

	row := h.pool.QueryRow(ctx, query)
	if err := row.Scan(
		&metrics.CitizensTotal,
		&metrics.ManagersTotal,
		&metrics.SecretariesTotal,
		&metrics.RequestsTotal,
		&metrics.RequestsResolved,
		&metrics.RequestsPending,
		&metrics.TenantsActive,
		&metrics.TenantsTotal,
		&metrics.TrafficGB,
		&metrics.MRR,
		&metrics.ExpensesForecast,
		&metrics.RevenueForecast,
		&metrics.StaffTotal,
		&metrics.UsersOnline,
		&metrics.TotalAccesses,
	); err != nil {
		return overviewMetrics{}, err
	}

	// Ensure no negatives for pending requests due to conflicting data.
	if metrics.RequestsPending < 0 {
		metrics.RequestsPending = 0
	}

	return metrics, nil
}

func (h *Handler) loadProjects(ctx context.Context) ([]projectOverview, error) {
	const projectQuery = `
        SELECT id, name, description, status, progress, lead_id, owner_id, started_at, target_date, updated_at
        FROM saas_projects
        ORDER BY created_at DESC
    `

	rows, err := h.pool.Query(ctx, projectQuery)
	if err != nil {
		if err == pgx.ErrNoRows {
			return []projectOverview{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	var projects []projectOverview
	for rows.Next() {
		var (
			p               projectOverview
			started, target sql.NullTime
			lead, owner     uuid.NullUUID
		)
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Status, &p.Progress, &lead, &owner, &started, &target, &p.UpdatedAt); err != nil {
			return nil, err
		}

		if lead.Valid {
			val := lead.UUID
			p.Lead = &val
		}
		if owner.Valid {
			val := owner.UUID
			p.Owner = &val
		}
		if started.Valid {
			ts := started.Time
			p.StartedAt = &ts
		}
		if target.Valid {
			ts := target.Time
			p.TargetDate = &ts
		}

		tasks, err := h.loadProjectTasks(ctx, p.ID)
		if err != nil {
			return nil, err
		}
		p.Tasks = tasks
		projects = append(projects, p)
	}

	return projects, rows.Err()
}

func (h *Handler) loadProjectTasks(ctx context.Context, projectID uuid.UUID) ([]projectTaskView, error) {
	const taskQuery = `
        SELECT id, title, owner, status, due_date, notes, position, created_at, updated_at, completed_at
        FROM saas_project_tasks
        WHERE project_id = $1
        ORDER BY position ASC, created_at ASC
    `

	rows, err := h.pool.Query(ctx, taskQuery, projectID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return []projectTaskView{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	var tasks []projectTaskView
	for rows.Next() {
		var (
			t         projectTaskView
			owner     sql.NullString
			due       sql.NullTime
			notes     sql.NullString
			completed sql.NullTime
		)
		if err := rows.Scan(&t.ID, &t.Title, &owner, &t.Status, &due, &notes, &t.Position, &t.CreatedAt, &t.UpdatedAt, &completed); err != nil {
			return nil, err
		}
		if owner.Valid {
			val := owner.String
			t.Owner = &val
		}
		if due.Valid {
			ts := due.Time
			t.DueDate = &ts
		}
		if notes.Valid {
			note := notes.String
			t.Notes = &note
		}
		if completed.Valid {
			ts := completed.Time
			t.CompletedAt = &ts
		}
		tasks = append(tasks, t)
	}

	return tasks, rows.Err()
}

func (h *Handler) loadRetention(ctx context.Context) (retentionSummary, error) {
	const query = `
        SELECT cohort_month, tenants_count, churn_count, expansion_count, nps, engagement_score
        FROM saas_retention_cohorts
        ORDER BY cohort_month ASC
    `

	rows, err := h.pool.Query(ctx, query)
	if err != nil {
		if err == pgx.ErrNoRows {
			return retentionSummary{}, nil
		}
		return retentionSummary{}, err
	}
	defer rows.Close()

	var (
		cohorts        []retentionCohort
		totalTenants   int64
		totalChurn     int64
		totalExpansion int64
		totalNPS       int64
	)

	for rows.Next() {
		var month time.Time
		var tenantsCount, churn, expansion, nps, engagement int64
		if err := rows.Scan(&month, &tenantsCount, &churn, &expansion, &nps, &engagement); err != nil {
			return retentionSummary{}, err
		}
		cohorts = append(cohorts, retentionCohort{
			Month:      month,
			Tenants:    tenantsCount,
			Churn:      churn,
			Expansion:  expansion,
			NPS:        nps,
			Engagement: engagement,
		})
		totalTenants += tenantsCount
		totalChurn += churn
		totalExpansion += expansion
		totalNPS += nps
	}

	summary := retentionSummary{Cohorts: cohorts}
	if totalTenants > 0 {
		summary.ChurnRate = float64(totalChurn) / float64(totalTenants) * 100
		summary.ExpansionRate = float64(totalExpansion) / float64(totalTenants) * 100
	}
	if len(cohorts) > 0 {
		summary.NPSGlobal = float64(totalNPS) / float64(len(cohorts))
	}

	if err := h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM tenants WHERE status = 'active'`).Scan(&summary.ActiveTenants); err != nil {
		if err != pgx.ErrNoRows {
			return retentionSummary{}, err
		}
	}

	return summary, nil
}

func (h *Handler) loadUsageAnalytics(ctx context.Context) (usageAnalytics, error) {
	var analytics usageAnalytics

	heatRows, err := h.pool.Query(ctx, `SELECT module_name, day_of_week, usage_count FROM saas_usage_heatmap`)
	if err != nil && err != pgx.ErrNoRows {
		return usageAnalytics{}, err
	}
	if heatRows != nil {
		defer heatRows.Close()

		moduleMap := make(map[string][]int64)
		for heatRows.Next() {
			var module string
			var dow int32
			var usage int64
			if err := heatRows.Scan(&module, &dow, &usage); err != nil {
				return usageAnalytics{}, err
			}
			if moduleMap[module] == nil {
				moduleMap[module] = make([]int64, 7)
			}
			if dow >= 0 && dow < 7 {
				moduleMap[module][dow] = usage
			}
		}

		labels := []string{"Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"}
		for module, values := range moduleMap {
			ordered := make([]int64, len(labels))
			// Reorder so that Monday (1) is first, Sunday (0) last
			for idx, label := range []int{1, 2, 3, 4, 5, 6, 0} {
				ordered[idx] = values[label]
			}
			analytics.Heatmap = append(analytics.Heatmap, moduleHeatmap{
				Module: module,
				Labels: labels,
				Usage:  ordered,
			})
		}
		sort.Slice(analytics.Heatmap, func(i, j int) bool {
			return strings.ToLower(analytics.Heatmap[i].Module) < strings.ToLower(analytics.Heatmap[j].Module)
		})
	}

	funnelRows, err := h.pool.Query(ctx, `SELECT stage, position, value, conversion FROM saas_usage_funnel ORDER BY position ASC`)
	if err != nil && err != pgx.ErrNoRows {
		return usageAnalytics{}, err
	}
	if funnelRows != nil {
		defer funnelRows.Close()
		for funnelRows.Next() {
			var (
				stage      string
				position   int16
				value      int64
				conversion float64
			)
			if err := funnelRows.Scan(&stage, &position, &value, &conversion); err != nil {
				return usageAnalytics{}, err
			}
			analytics.CitizenFunnel = append(analytics.CitizenFunnel, funnelStage{
				Stage:      stage,
				Value:      value,
				Conversion: conversion,
			})
		}
	}

	rankRows, err := h.pool.Query(ctx, `SELECT name, interactions FROM saas_usage_secretariat_rankings ORDER BY interactions DESC LIMIT 10`)
	if err != nil && err != pgx.ErrNoRows {
		return usageAnalytics{}, err
	}
	if rankRows != nil {
		defer rankRows.Close()
		for rankRows.Next() {
			var r secretariatRanking
			if err := rankRows.Scan(&r.Name, &r.Interactions); err != nil {
				return usageAnalytics{}, err
			}
			analytics.TopSecretariat = append(analytics.TopSecretariat, r)
		}
	}

	return analytics, nil
}

func (h *Handler) loadCompliance(ctx context.Context) ([]complianceRecord, error) {
	type tempAudit struct {
		TenantID uuid.UUID
		Audit    complianceAudit
	}

	auditRows, err := h.pool.Query(ctx, `
        SELECT id, tenant_id, actor, action, performed_at, channel, sla_breach
        FROM saas_compliance_audits
        ORDER BY performed_at DESC
    `)
	if err != nil && err != pgx.ErrNoRows {
		return nil, err
	}

	auditsByTenant := make(map[uuid.UUID][]complianceAudit)
	if auditRows != nil {
		defer auditRows.Close()
		for auditRows.Next() {
			var (
				id        uuid.UUID
				tenantID  uuid.UUID
				actor     sql.NullString
				action    string
				performed time.Time
				channel   sql.NullString
				breach    bool
			)
			if err := auditRows.Scan(&id, &tenantID, &actor, &action, &performed, &channel, &breach); err != nil {
				return nil, err
			}
			actorName := ""
			if actor.Valid {
				actorName = strings.TrimSpace(actor.String)
			}
			channelName := ""
			if channel.Valid {
				channelName = strings.TrimSpace(channel.String)
			}
			auditsByTenant[tenantID] = append(auditsByTenant[tenantID], complianceAudit{
				ID:        id,
				Actor:     actorName,
				Action:    action,
				Performed: performed,
				Channel:   channelName,
				SLABreach: breach,
			})
		}
	}

	reportRows, err := h.pool.Query(ctx, `
        SELECT id, tenant_id, title, period, status, url
        FROM saas_compliance_reports
        ORDER BY created_at DESC
    `)
	if err != nil && err != pgx.ErrNoRows {
		return nil, err
	}

	reportsByTenant := make(map[uuid.UUID][]complianceReport)
	if reportRows != nil {
		defer reportRows.Close()
		for reportRows.Next() {
			var (
				id       uuid.UUID
				tenantID uuid.UUID
				title    string
				period   string
				status   string
				url      sql.NullString
			)
			if err := reportRows.Scan(&id, &tenantID, &title, &period, &status, &url); err != nil {
				return nil, err
			}
			var urlPtr *string
			if url.Valid {
				str := strings.TrimSpace(url.String)
				if str != "" {
					urlPtr = &str
				}
			}
			reportsByTenant[tenantID] = append(reportsByTenant[tenantID], complianceReport{
				ID:     id,
				Title:  title,
				Period: period,
				Status: status,
				URL:    urlPtr,
			})
		}
	}

	tenantsMap, err := h.lookupTenantNames(ctx)
	if err != nil {
		return nil, err
	}

	var records []complianceRecord
	for tenantID, tenantName := range tenantsMap {
		rec := complianceRecord{
			TenantID:   tenantID,
			TenantName: tenantName,
			Audits:     auditsByTenant[tenantID],
			Reports:    reportsByTenant[tenantID],
		}
		if len(rec.Audits) == 0 && len(rec.Reports) == 0 {
			continue
		}
		records = append(records, rec)
	}

	sort.Slice(records, func(i, j int) bool {
		return strings.ToLower(records[i].TenantName) < strings.ToLower(records[j].TenantName)
	})

	return records, nil
}

func (h *Handler) loadCommunication(ctx context.Context) (communicationCenter, error) {
	var center communicationCenter

	annRows, err := h.pool.Query(ctx, `
        SELECT a.id, a.title, a.audience, a.status, a.published_at, COALESCE(su.name, 'Equipe Urbanbyte') AS author
        FROM saas_announcements a
        LEFT JOIN saas_users su ON su.id = a.author_id
        ORDER BY a.published_at DESC NULLS LAST
        LIMIT 10
    `)
	if err != nil && err != pgx.ErrNoRows {
		return communicationCenter{}, err
	}
	if annRows != nil {
		defer annRows.Close()
		for annRows.Next() {
			var (
				item      announcementView
				published sql.NullTime
			)
			if err := annRows.Scan(&item.ID, &item.Title, &item.Audience, &item.Status, &published, &item.Author); err != nil {
				return communicationCenter{}, err
			}
			if published.Valid {
				item.PublishedAt = published.Time
			} else {
				item.PublishedAt = time.Now()
			}
			center.Announcements = append(center.Announcements, item)
		}
	}

	pushRows, err := h.pool.Query(ctx, `
        SELECT p.id, COALESCE(t.display_name, 'Plataforma'), p.created_at, p.type, p.channel, p.status, p.subject, p.body, p.scheduled_for
        FROM saas_push_notifications p
        LEFT JOIN tenants t ON t.id = p.tenant_id
        ORDER BY p.created_at DESC
        LIMIT 50
    `)
	if err != nil && err != pgx.ErrNoRows {
		return communicationCenter{}, err
	}
	if pushRows != nil {
		defer pushRows.Close()
		for pushRows.Next() {
			var (
				item      pushNotification
				body      sql.NullString
				scheduled sql.NullTime
			)
			if err := pushRows.Scan(&item.ID, &item.TenantName, &item.CreatedAt, &item.Type, &item.Channel, &item.Status, &item.Subject, &body, &scheduled); err != nil {
				return communicationCenter{}, err
			}
			if body.Valid {
				summary := summarizeText(body.String)
				item.Summary = &summary
			}
			if scheduled.Valid {
				ts := scheduled.Time
				item.ScheduledFor = &ts
			}

			if strings.EqualFold(item.Status, "pending") {
				center.PushQueue = append(center.PushQueue, item)
			} else {
				center.History = append(center.History, item)
			}
		}
	}

	return center, nil
}

func (h *Handler) loadCityInsights(ctx context.Context) ([]cityInsightView, error) {
	const query = `
        SELECT ci.id, ci.tenant_id, t.display_name, ci.population, ci.active_users, ci.requests_total, ci.satisfaction, ci.last_sync, ci.highlights
        FROM saas_city_insights ci
        JOIN tenants t ON t.id = ci.tenant_id
        ORDER BY t.display_name ASC
    `

	rows, err := h.pool.Query(ctx, query)
	if err != nil {
		if err == pgx.ErrNoRows {
			return []cityInsightView{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	var insights []cityInsightView
	for rows.Next() {
		var (
			view       cityInsightView
			lastSync   sql.NullTime
			highlights []string
		)
		if err := rows.Scan(&view.ID, &view.TenantID, &view.Name, &view.Population, &view.ActiveUsers, &view.RequestsTotal, &view.Satisfaction, &lastSync, &highlights); err != nil {
			return nil, err
		}
		if lastSync.Valid {
			view.LastSync = lastSync.Time
		} else {
			view.LastSync = time.Time{}
		}
		view.Highlights = highlights
		insights = append(insights, view)
	}

	return insights, rows.Err()
}

func (h *Handler) loadAccessLogs(ctx context.Context) ([]accessLogView, error) {
	const query = `
        SELECT l.id, l.user_name, COALESCE(l.role, ''), COALESCE(t.display_name, '') AS tenant_name, l.logged_at, COALESCE(l.ip_address, ''), COALESCE(l.location, ''), COALESCE(l.user_agent, ''), COALESCE(l.status, '')
        FROM saas_access_logs l
        LEFT JOIN tenants t ON t.id = l.tenant_id
        ORDER BY l.logged_at DESC
        LIMIT 50
    `

	rows, err := h.pool.Query(ctx, query)
	if err != nil {
		if err == pgx.ErrNoRows {
			return []accessLogView{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	var logs []accessLogView
	for rows.Next() {
		var (
			log        accessLogView
			tenantName string
		)
		if err := rows.Scan(&log.ID, &log.User, &log.Role, &tenantName, &log.LoggedAt, &log.IP, &log.Location, &log.UserAgent, &log.Status); err != nil {
			return nil, err
		}
		if strings.TrimSpace(tenantName) != "" {
			copy := tenantName
			log.Tenant = &copy
		}
		logs = append(logs, log)
	}

	return logs, rows.Err()
}

func (h *Handler) lookupTenantNames(ctx context.Context) (map[uuid.UUID]string, error) {
	rows, err := h.pool.Query(ctx, `SELECT id, display_name FROM tenants`)
	if err != nil {
		if err == pgx.ErrNoRows {
			return map[uuid.UUID]string{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	tenantsMap := make(map[uuid.UUID]string)
	for rows.Next() {
		var id uuid.UUID
		var displayName string
		if err := rows.Scan(&id, &displayName); err != nil {
			return nil, err
		}
		tenantsMap[id] = displayName
	}
	return tenantsMap, rows.Err()
}

func summarizeText(text string) string {
	trimmed := strings.TrimSpace(text)
	if len([]rune(trimmed)) <= 140 {
		return trimmed
	}
	runes := []rune(trimmed)
	return string(runes[:137]) + "..."
}
