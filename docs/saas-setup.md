# SaaS rollout plan

Este documento resume como estruturar o SaaS da Urbanbyte com base no código atual.

## 1. Mapa de domínios

| Host | Responsável | Observações |
| ---- | ----------- | ----------- |
| `https://dash.urbanbyte.com.br/` | **Dashboard interna (gestão SaaS)** | Projeto `web-dash` (nesta repo). Aponte via CNAME para o projeto no Vercel e configure `VITE_API_URL=https://api.urbanbyte.com.br`. |
| `https://painel.urbanbyte.com.br/` | **Backoffice das prefeituras** | Já conectado ao Vercel. Mantém autenticação multi-tenant; o host deve ser enviado para a API para resolver o tenant. |
| `https://{cidade}.urbanbyte.com.br/` | **App do cidadão** | Configure um wildcard `*.urbanbyte.com.br` como CNAME para o projeto `web-cidadao` no Vercel. Registros específicos (api/dash/painel) continuam prevalecendo sobre o wildcard. |
| `https://api.urbanbyte.com.br/` | **API Go hospedada na Hetzner** | Record A para 178.156.199.198 atrás do Cloudflare. O Nginx deve encaminhar para o serviço Go (porta 8081). |

Cloudflare → **Página de DNS**:

1. Registre `dash` como CNAME do domínio gerado pelo Vercel.
2. Mantenha `painel` como já configurado.
3. Crie um wildcard `*.urbanbyte.com.br` → CNAME do projeto cidadão no Vercel (proxy ativo).
4. Mantenha `api` como A-record para a VPS.
5. (Opcional) defina `api` com proxy `OFF` durante depurações para evitar cache do Cloudflare.

## 2. Multi-tenant no backend

### 2.1. Tabela de tenants

Crie uma tabela `tenants` e armazene:

- `id` (UUID)
- `slug` (ex.: `cabaceiras`)
- `display_name`
- `domain` (subdomínio completo)
- `settings` (JSONB com cores, brasão, textos)
- `created_at` / `updated_at`

Todas as entidades (usuários, escolas, etc.) devem referenciar `tenant_id`. Para rotas públicas (login, dados do cidadão), a API identifica o tenant pelo cabeçalho `Host`. Sugestão:

1. Middleware que captura `r.Host`, normaliza (`strings.ToLower`, remove porta) e faz lookup em cache (Redis) da configuração do tenant.
2. Injete `tenantID` no contexto (`context.WithValue`) para uso nas camadas de serviço/repos.

### 2.2. Parametrização visual

- Endpoint público: `GET /public/tenant` → devolve JSON com logo, cores e textos baseados no domínio. O front `web-cidadao` usa esse endpoint no carregamento.
- Assets (brasão, ícones) podem ficar em bucket S3/Backblaze; salve apenas a URL na configuração.
- Para dashboards `painel` e `dash`, use o mesmo esquema de host para configurar temas (cores, logos no header, etc.).

### 2.3. Onboarding de municípios

1. Inserir tenant via CLI/admin (pode criar comando `go run ./api/cmd/tenant create --slug ...`).
2. Gerar usuários iniciais (prefeito/gestor) usando o `tenant_id`.
3. Subir assets (logo/bandeira) e salvar referências no JSON de configuração.
4. Garantir migrações (`make migrate`) antes do launch.

## 3. Front-end

### 3.1. `web-backoffice` → Vercel (`painel`)

- Configure variáveis `VITE_API_URL=https://api.urbanbyte.com.br` e `VITE_MULTI_TENANT=1`.
- No Vercel, habilite **Environments → Production** com as chaves necessárias (JWT audience, etc.).
- Use `getTenant` no carregamento inicial para ajustar nome/logo conforme host.

### 3.2. `dash` (novo)

- Pode começar copiando `web-backoffice` para um projeto `web-dash` e simplificando fluxos.
- Adicionar o domínio personalizado `dash.urbanbyte.com.br` no Vercel.
- Compartilhe componentes/design system para evitar duplicações.
- Default de credenciais (ambiente de testes): `admin@urbanbyte.com.br` / `Urbanbyte#2025`. Altere a senha após o primeiro acesso usando uma migration/CLI dedicada.

### 3.3. `web-cidadao`

- Adapte para ler tema via `Host`.
- Configure webhook `Revalidate` (Vercel) quando alterar tema no painel para limpar cache do Cloudflare.
- Para performance, use `Cache-Control: public, max-age=60` na API de tema.

Observação (CORS): o backend agora aceita origem exata (ex.: `https://painel.urbanbyte.com.br`) e também wildcard de subdomínio quando o `ALLOW_ORIGINS` contiver entradas no formato `*.dominio.tld`. Ex.: `ALLOW_ORIGINS=...,*.urbanbyte.com.br` libera qualquer `https://{cidade}.urbanbyte.com.br` (mas não o domínio raiz).

## 4. Deploy automático da API

### 4.1. Workflow GitHub Actions

O arquivo `.github/workflows/deploy-api.yml` adiciona CI/CD:

1. Baixa dependências.
2. Usa `gotip` para compilar/testar (compatível com `go 1.24` definido no `go.mod`).
3. Conecta via SSH na VPS e roda `git pull`, `make migrate` e reinicia `systemd`.

### 4.2. Segredos necessários

Crie no repositório (Settings → Secrets → Actions):

- `PROD_SSH_HOST`: IP ou hostname da VPS (ex.: `178.156.199.198`).
- `PROD_SSH_USER`: usuário SSH com permissão para deploy (recomendado `deploy`).
- `PROD_SSH_KEY`: chave privada (formato OpenSSH) correspondente ao usuário.
- `PROD_SSH_PORT`: porta (ex.: `22`).
- `PROD_APP_DIR`: diretório onde o código fica na VPS (ex.: `/var/www/urbanbyte`).

Opcional: se `sudo systemctl restart urbanbyte-api.service` exigir senha, configure `NOPASSWD` no `/etc/sudoers.d/deploy`.

### 4.3. Preparação da VPS

1. Criar usuário `deploy`:

   ```bash
   sudo adduser deploy --disabled-password
   sudo mkdir -p /home/deploy/.ssh
   sudo chown deploy:deploy /home/deploy/.ssh
   ```

2. Adicionar chave pública em `/home/deploy/.ssh/authorized_keys`.
3. Criar diretório do app: `sudo mkdir -p /var/www/urbanbyte && sudo chown deploy:deploy /var/www/urbanbyte`.
4. Instalar Go (>=1.24) e Postgres client.
5. Criar arquivo `/etc/systemd/system/urbanbyte-api.service`:

   ```ini
   [Unit]
   Description=Urbanbyte API
   After=network.target

   [Service]
   WorkingDirectory=/var/www/urbanbyte/api
   ExecStart=/usr/local/go/bin/go run ./cmd/api
   Restart=on-failure
   User=deploy
   EnvironmentFile=/var/www/urbanbyte/.env

   [Install]
   WantedBy=multi-user.target
   ```

6. `sudo systemctl daemon-reload && sudo systemctl enable --now urbanbyte-api`.
7. Configure Nginx para proxy (`server_name api.urbanbyte.com.br; proxy_pass http://127.0.0.1:8081;`).

### 4.4. Deploy manual inicial

Na VPS (como `deploy`):

```bash
cd /var/www/urbanbyte
git clone git@github.com:gestaozabele/municipio.git .
cp .env.example .env  # ajuste com DATABASE_URL do Neon etc.
make migrate
sudo systemctl restart urbanbyte-api
```

Após configurar os segredos, qualquer push na branch `main` disparará o deploy.

### 4.5. CLI para cadastro de tenants

O comando `go run ./api/cmd/tenant` auxilia na criação/listagem de municípios direto do terminal (usando `DB_DSN`/`DATABASE_URL`). Exemplos:

```bash
go run ./api/cmd/tenant create   --slug cabaceiras   --name "Prefeitura de Cabaceiras"   --domain cabaceiras.urbanbyte.com.br   --settings '{"cores":{"primaria":"#0F172A"}}'

go run ./api/cmd/tenant list
```

O endpoint público `GET /tenant` já devolve os dados do município com base no host, permitindo que os front-ends ajustem cores/logos dinamicamente.


## 5. Provisionamento de novos municípios

Processo recomendado:

1. Criar tenant via painel interno (dash) ou script CLI.
2. Criar subdomínio no Cloudflare (se usar wildcard, apenas garantir inexistência de conflitos).
3. Configurar temas/imagens.
4. Popular dados-base com `make seed` (ajuste comando para ler `TENANT_ID`).
5. Notificar Vercel (webhook) para rebuild do `web-cidadao` se houver conteúdo estático.

## 6. Checklist geral

- [ ] Wildcard `*.urbanbyte.com.br` → Vercel (cidadao).
- [ ] `dash.urbanbyte.com.br` → Vercel (admin SaaS).
- [ ] Secrets do GitHub Actions cadastrados.
- [ ] Usuário `deploy` com `sudo` sem senha para o serviço.
- [ ] `.env` na VPS com `DATABASE_URL` do Neon e demais variáveis.
- [ ] Migrações rodadas (`make migrate`).
- [ ] Monitoramento: configure logs (`journalctl -u urbanbyte-api`) + alertas (Grafana/Healthcheck).

Com isso a plataforma torna-se multicliente, com deploys automatizados e um fluxo claro de lançamento de novas prefeituras.

## 7. Painel SaaS rápido

- Projeto frontend: `web-dash` (Vite + React). Variáveis: `VITE_API_URL` apontando para a API.
- Login padrão (migrations criadas):
  - Usuário: `admin@urbanbyte.com.br`
  - Senha: `Urbanbyte#2025`
- Endpoints relevantes da API:
  - `POST /auth/saas/login`
  - `GET /saas/tenants`
  - `POST /saas/tenants`
  - `GET /auth/me` (com token SaaS) devolve perfil e roles.
- Cookies de sessão: `saas` (refresh token), similar aos existentes de backoffice/cidadão.
