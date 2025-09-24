package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config centraliza a configuração carregada do ambiente.
type Config struct {
	Port             int
	DBDSN            string
	RedisURL         string
	JWTAccessTTL     time.Duration
	JWTRefreshTTL    time.Duration
	JWTSecret        string
	AllowOrigins     []string
	RateLimitPublic  RateLimitConfig
	RateLimitAuth    RateLimitConfig
	WebAuthnRPID     string
	WebAuthnRPOrigin string
	WebAuthnRPName   string
	Storage          StorageConfig
	Cloudflare       CloudflareConfig
	SaaSInviteTTL    time.Duration
	Monitoring       MonitoringConfig
}

// StorageConfig descreve provedor padrão de blobs.
type StorageConfig struct {
	Provider    string
	S3Endpoint  string
	S3Region    string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3PublicURL string
}

// CloudflareConfig concentra integração com API da Cloudflare.
type CloudflareConfig struct {
	Enabled         bool
	APIToken        string
	AccountID       string
	ZoneID          string
	BaseDomain      string
	TargetHostname  string
	PropagationWait time.Duration
}

// MonitoringConfig configura coleta operacional.
type MonitoringConfig struct {
	Enabled         bool
	Interval        time.Duration
	RequestTimeout  time.Duration
	SlackWebhookURL string
	LatencyWarning  time.Duration
	ErrorRateWarn   float64
	LatencyCritical time.Duration
	ErrorRateCrit   float64
}

// RateLimitConfig representa limites simples para throttling.
type RateLimitConfig struct {
	RequestsPerSecond float64
	Burst             int
}

// Load carrega variáveis de ambiente e aplica defaults seguros.
func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{}

	portStr := getEnv("PORT", "8080")
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 {
		return nil, errors.New("PORT inválida")
	}
	cfg.Port = port

	cfg.DBDSN = strings.TrimSpace(getEnv("DB_DSN", ""))
	if cfg.DBDSN == "" {
		cfg.DBDSN = strings.TrimSpace(getEnv("DATABASE_URL", ""))
	}
	if cfg.DBDSN == "" {
		return nil, errors.New("DB_DSN ou DATABASE_URL obrigatório")
	}

	cfg.RedisURL = getEnv("REDIS_URL", "")
	if cfg.RedisURL == "" {
		return nil, errors.New("REDIS_URL obrigatório")
	}

	cfg.JWTSecret = strings.TrimSpace(getEnv("JWT_SECRET", ""))
	if len(cfg.JWTSecret) < 32 {
		return nil, errors.New("JWT_SECRET deve ter pelo menos 32 caracteres")
	}

	accessTTL, err := parseDurationEnv("JWT_ACCESS_TTL", 15*time.Minute)
	if err != nil {
		return nil, err
	}
	cfg.JWTAccessTTL = accessTTL

	refreshTTL, err := parseDurationEnv("JWT_REFRESH_TTL", 30*24*time.Hour)
	if err != nil {
		return nil, err
	}
	cfg.JWTRefreshTTL = refreshTTL

	inviteTTL, err := parseDurationEnv("SAAS_INVITE_TTL", 7*24*time.Hour)
	if err != nil {
		return nil, err
	}
	cfg.SaaSInviteTTL = inviteTTL

	allowOrigins := strings.Split(getEnv("ALLOW_ORIGINS", ""), ",")
	cfg.AllowOrigins = nil
	for _, origin := range allowOrigins {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			cfg.AllowOrigins = append(cfg.AllowOrigins, origin)
		}
	}

	cfg.RateLimitPublic = RateLimitConfig{RequestsPerSecond: 10, Burst: 20}
	cfg.RateLimitAuth = RateLimitConfig{RequestsPerSecond: 10, Burst: 40}

	cfg.WebAuthnRPID = strings.TrimSpace(getEnv("WEBAUTHN_RP_ID", "localhost"))
	if cfg.WebAuthnRPID == "" {
		cfg.WebAuthnRPID = "localhost"
	}
	cfg.WebAuthnRPOrigin = strings.TrimSpace(getEnv("WEBAUTHN_RP_ORIGIN", "http://localhost:5173"))
	if cfg.WebAuthnRPOrigin == "" {
		cfg.WebAuthnRPOrigin = "http://localhost:5173"
	}
	cfg.Cloudflare = CloudflareConfig{
		APIToken:       strings.TrimSpace(getEnv("CLOUDFLARE_API_TOKEN", "")),
		AccountID:      strings.TrimSpace(getEnv("CLOUDFLARE_ACCOUNT_ID", "")),
		ZoneID:         strings.TrimSpace(getEnv("CLOUDFLARE_ZONE_ID", "")),
		BaseDomain:     strings.TrimSpace(getEnv("CLOUDFLARE_BASE_DOMAIN", "")),
		TargetHostname: strings.TrimSpace(getEnv("CLOUDFLARE_TARGET_HOSTNAME", "")),
	}
	if wait, err := parseDurationEnv("CLOUDFLARE_PROPAGATION_WAIT", 2*time.Minute); err == nil {
		cfg.Cloudflare.PropagationWait = wait
	} else {
		return nil, err
	}
	if cfg.Cloudflare.APIToken != "" && cfg.Cloudflare.ZoneID != "" && cfg.Cloudflare.BaseDomain != "" {
		cfg.Cloudflare.Enabled = true
	}

	monitorInterval, err := parseDurationEnv("MONITORING_INTERVAL", 5*time.Minute)
	if err != nil {
		return nil, err
	}
	requestTimeout, err := parseDurationEnv("MONITORING_REQUEST_TIMEOUT", 10*time.Second)
	if err != nil {
		return nil, err
	}
	latencyWarn, err := parseDurationEnv("MONITORING_LATENCY_WARN", 2*time.Second)
	if err != nil {
		return nil, err
	}
	latencyCrit, err := parseDurationEnv("MONITORING_LATENCY_CRIT", 5*time.Second)
	if err != nil {
		return nil, err
	}

	errorRateWarn := parseFloatEnv("MONITORING_ERROR_RATE_WARN", 0.1)
	errorRateCrit := parseFloatEnv("MONITORING_ERROR_RATE_CRIT", 0.3)

	cfg.Monitoring = MonitoringConfig{
		Enabled:         strings.EqualFold(getEnv("MONITORING_ENABLED", "false"), "true"),
		Interval:        monitorInterval,
		RequestTimeout:  requestTimeout,
		SlackWebhookURL: strings.TrimSpace(getEnv("MONITORING_SLACK_WEBHOOK", "")),
		LatencyWarning:  latencyWarn,
		ErrorRateWarn:   errorRateWarn,
		LatencyCritical: latencyCrit,
		ErrorRateCrit:   errorRateCrit,
	}

	cfg.WebAuthnRPName = strings.TrimSpace(getEnv("WEBAUTHN_RP_NAME", "Gestão Zabelê"))
	if cfg.WebAuthnRPName == "" {
		cfg.WebAuthnRPName = "Gestão Zabelê"
	}

	cfg.Storage = StorageConfig{
		Provider:    strings.TrimSpace(strings.ToLower(getEnv("STORAGE_PROVIDER", "noop"))),
		S3Endpoint:  strings.TrimSpace(getEnv("STORAGE_S3_ENDPOINT", "")),
		S3Region:    strings.TrimSpace(getEnv("STORAGE_S3_REGION", "")),
		S3Bucket:    strings.TrimSpace(getEnv("STORAGE_S3_BUCKET", "")),
		S3AccessKey: strings.TrimSpace(getEnv("STORAGE_S3_ACCESS_KEY", "")),
		S3SecretKey: strings.TrimSpace(getEnv("STORAGE_S3_SECRET_KEY", "")),
		S3PublicURL: strings.TrimSpace(getEnv("STORAGE_S3_PUBLIC_BASE_URL", "")),
	}

	return cfg, nil
}

func getEnv(key, def string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return def
}

func parseDurationEnv(key string, def time.Duration) (time.Duration, error) {
	val := getEnv(key, "")
	if val == "" {
		return def, nil
	}
	dur, err := time.ParseDuration(val)
	if err != nil {
		return 0, errors.New(key + " inválido")
	}
	return dur, nil
}

func parseFloatEnv(key string, def float64) float64 {
	val := strings.TrimSpace(getEnv(key, ""))
	if val == "" {
		return def
	}
	parsed, err := strconv.ParseFloat(val, 64)
	if err != nil {
		return def
	}
	return parsed
}
