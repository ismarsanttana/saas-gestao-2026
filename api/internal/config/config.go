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

	cfg.DBDSN = getEnv("DB_DSN", "")
	if cfg.DBDSN == "" {
		return nil, errors.New("DB_DSN obrigatório")
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
	cfg.WebAuthnRPName = strings.TrimSpace(getEnv("WEBAUTHN_RP_NAME", "Gestão Zabelê"))
	if cfg.WebAuthnRPName == "" {
		cfg.WebAuthnRPName = "Gestão Zabelê"
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
