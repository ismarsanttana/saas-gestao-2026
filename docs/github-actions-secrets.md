# Guia para cadastrar segredos do deploy

No repositório GitHub (`Settings → Secrets and variables → Actions → New repository secret`) cadastre:

| Nome | Descrição | Exemplo |
| ---- | --------- | ------- |
| `PROD_SSH_HOST` | IP ou hostname público da VPS | `178.156.199.198` |
| `PROD_SSH_PORT` | Porta SSH (padrão 22) | `22` |
| `PROD_SSH_USER` | Usuário criado para deploy | `deploy` |
| `PROD_APP_DIR` | Diretório do app na VPS | `/var/www/urbanbyte` |
| `PROD_SSH_KEY` | Chave privada no formato OpenSSH usada pelo GitHub Actions | `-----BEGIN OPENSSH PRIVATE KEY-----` |

> Dica: use `ssh-keygen -t ed25519 -f github-actions` para gerar o par de chaves. Publique o conteúdo do arquivo `.pub` no `/home/deploy/.ssh/authorized_keys` da VPS.

Após salvar os segredos, acione o workflow manualmente em `Actions → Deploy API to Hetzner → Run workflow`.
