# Urbanbyte SaaS Control Center

Painel administrativo para gestão de clientes (prefeituras) da plataforma Urbanbyte.

## Scripts

```bash
npm install
npm run dev     # http://localhost:5176
npm run build
npm run preview
```

Crie um `.env.local` (ou configure no Vercel):

```
VITE_API_URL=https://api.urbanbyte.com.br
```

## Fluxo

- `POST /auth/saas/login` — autenticação (usa cookies de refresh + access token JWT).
- `GET /saas/tenants` — lista prefeituras cadastradas.
- `POST /saas/tenants` — cria nova prefeitura.

As credenciais iniciais são provisionadas pela migration `012_saas_users.up.sql`:

- E-mail: `admin@urbanbyte.com.br`
- Senha: `Urbanbyte#2025`

Altere a senha em produção assim que possível.
