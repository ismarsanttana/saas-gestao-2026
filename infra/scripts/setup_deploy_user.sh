#!/usr/bin/env bash
# Script auxiliar para preparar usuário de deploy na VPS.
# Execute como root apenas uma vez.
set -euo pipefail

USER_NAME="deploy"
APP_DIR="/var/www/urbanbyte"
SERVICE_NAME="urbanbyte-api"
GO_BIN="/usr/local/go/bin/go"

if ! id -u "$USER_NAME" >/dev/null 2>&1; then
  adduser "$USER_NAME" --disabled-password
fi

mkdir -p "/home/$USER_NAME/.ssh"
chmod 700 "/home/$USER_NAME/.ssh"
chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.ssh"

touch "/home/$USER_NAME/.ssh/authorized_keys"
chmod 600 "/home/$USER_NAME/.ssh/authorized_keys"
chown "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.ssh/authorized_keys"

echo "Cole a chave pública do GitHub Actions em /home/$USER_NAME/.ssh/authorized_keys" >&2

mkdir -p "$APP_DIR"
chown "$USER_NAME:$USER_NAME" "$APP_DIR"

cat <<UNIT | tee /etc/systemd/system/${SERVICE_NAME}.service >/dev/null
[Unit]
Description=Urbanbyte API
After=network.target

[Service]
WorkingDirectory=${APP_DIR}/api
ExecStart=${GO_BIN} run ./cmd/api
User=${USER_NAME}
Restart=on-failure
EnvironmentFile=${APP_DIR}/.env

[Install]
WantedBy=multi-user.target
UNIT

cat <<SUDO | tee /etc/sudoers.d/${USER_NAME}-systemctl >/dev/null
${USER_NAME} ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart ${SERVICE_NAME}.service
SUDO
chmod 440 /etc/sudoers.d/${USER_NAME}-systemctl

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}.service

cat <<'NEXT'
---
Ajustes pendentes:
- Adicione a chave pública do GitHub Actions em /home/${USER_NAME}/.ssh/authorized_keys.
- Instale o Go (>=1.24) no caminho ${GO_BIN}.
- Crie o arquivo ${APP_DIR}/.env com as variáveis de produção.
- Faça um clone inicial do repositório e rode `make migrate`.
- Reinicie o serviço com `sudo systemctl restart ${SERVICE_NAME}.service`.
NEXT
