package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/gestaozabele/municipio/internal/auth"
	"github.com/gestaozabele/municipio/internal/config"
	"github.com/gestaozabele/municipio/internal/db"
	internalhttp "github.com/gestaozabele/municipio/internal/http"
	"github.com/gestaozabele/municipio/internal/repo"
	"github.com/gestaozabele/municipio/internal/saas"
	"github.com/gestaozabele/municipio/internal/service"
)

func main() {
	if err := run(); err != nil {
		log.Fatal().Err(err).Msg("api encerrada com erro")
	}
}

func run() error {
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339})

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	ctx := context.Background()

	pool, err := db.NewPool(ctx, cfg.DBDSN)
	if err != nil {
		return fmt.Errorf("db: %w", err)
	}
	defer pool.Close()

	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return fmt.Errorf("redis parse: %w", err)
	}
	redisClient := redis.NewClient(redisOpts)
	defer redisClient.Close()

	repository := repo.New(pool)
	saasRepo := saas.NewRepository(pool)
	jwtManager := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTAccessTTL)
	authService := service.NewAuthService(repository, saasRepo, pool, redisClient, jwtManager, cfg.JWTRefreshTTL)

	handler, err := internalhttp.NewRouter(cfg, pool, redisClient, authService)
	if err != nil {
		return fmt.Errorf("router: %w", err)
	}

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Port),
		Handler: handler,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info().Msgf("API ouvindo em :%d", cfg.Port)
		errCh <- srv.ListenAndServe()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		log.Info().Str("signal", sig.String()).Msg("encerrando...")
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			return err
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
