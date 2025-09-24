package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/gestaozabele/municipio/internal/db"
	"github.com/gestaozabele/municipio/internal/tenant"
)

func main() {
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339})

	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	_ = godotenv.Load()

	ctx := context.Background()

	dsn := strings.TrimSpace(os.Getenv("DB_DSN"))
	if dsn == "" {
		dsn = strings.TrimSpace(os.Getenv("DATABASE_URL"))
	}
	if dsn == "" {
		log.Fatal().Msg("defina DB_DSN ou DATABASE_URL")
	}

	pool, err := db.NewPool(ctx, dsn)
	if err != nil {
		log.Fatal().Err(err).Msg("não foi possível conectar ao banco")
	}
	defer pool.Close()

	repo := tenant.NewRepository(pool)
	service := tenant.NewService(repo)

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "create":
		if err := runCreate(ctx, service, args); err != nil {
			log.Fatal().Err(err).Msg("falha ao criar tenant")
		}
	case "list":
		if err := runList(ctx, service); err != nil {
			log.Fatal().Err(err).Msg("falha ao listar tenants")
		}
	default:
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "tenant CLI")
	fmt.Fprintln(os.Stderr, "uso:")
	fmt.Fprintln(os.Stderr, "  tenant create --slug cidade --name \"Prefeitura\" --domain cidade.urbanbyte.com.br [--settings-file settings.json]")
	fmt.Fprintln(os.Stderr, "  tenant create --slug cidade --name \"Prefeitura\" --domain cidade.urbanbyte.com.br --settings '{\\\"corPrimaria\\\":\\\"#123456\\\"}'")
	fmt.Fprintln(os.Stderr, "  tenant list")
}

func runCreate(ctx context.Context, service *tenant.Service, args []string) error {
	fs := flag.NewFlagSet("create", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	var (
		slug         = fs.String("slug", "", "slug do tenant (ex.: cabaceiras)")
		name         = fs.String("name", "", "nome exibido")
		domain       = fs.String("domain", "", "domínio completo (ex.: cidade.urbanbyte.com.br)")
		settingsFile = fs.String("settings-file", "", "arquivo JSON com configurações visuais")
		settingsJSON = fs.String("settings", "", "JSON literal com configurações visuais")
	)

	if err := fs.Parse(args); err != nil {
		return err
	}

	if *slug == "" || *name == "" || *domain == "" {
		return errors.New("slug, name e domain são obrigatórios")
	}

	settings := map[string]any{}
	if *settingsFile != "" {
		raw, err := os.ReadFile(*settingsFile)
		if err != nil {
			return fmt.Errorf("ler settings-file: %w", err)
		}
		if err := json.Unmarshal(raw, &settings); err != nil {
			return fmt.Errorf("parse settings-file: %w", err)
		}
	} else if *settingsJSON != "" {
		if err := json.Unmarshal([]byte(*settingsJSON), &settings); err != nil {
			return fmt.Errorf("parse settings: %w", err)
		}
	}

	tenantCreated, err := service.Create(ctx, tenant.CreateTenantInput{
		Slug:        *slug,
		DisplayName: *name,
		Domain:      *domain,
		Settings:    settings,
	})
	if err != nil {
		return err
	}

	output, _ := json.MarshalIndent(tenantCreated, "", "  ")
	fmt.Println(string(output))
	return nil
}

func runList(ctx context.Context, service *tenant.Service) error {
	tenants, err := service.List(ctx)
	if err != nil {
		return err
	}

	if len(tenants) == 0 {
		fmt.Println("nenhum tenant cadastrado")
		return nil
	}

	encoded, _ := json.MarshalIndent(tenants, "", "  ")
	fmt.Println(string(encoded))
	return nil
}
