-- name: ListWebauthnCredentialsByUser :many
SELECT id, usuario_id, credential_id, public_key, sign_count, transports, aaguid, nickname, cloned, created_at, updated_at
FROM webauthn_credentials
WHERE usuario_id = $1
ORDER BY created_at DESC;

-- name: GetWebauthnCredentialByCredentialID :one
SELECT id, usuario_id, credential_id, public_key, sign_count, transports, aaguid, nickname, cloned, created_at, updated_at
FROM webauthn_credentials
WHERE credential_id = $1;

-- name: InsertWebauthnCredential :one
INSERT INTO webauthn_credentials (usuario_id, credential_id, public_key, sign_count, transports, aaguid, nickname, cloned)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, usuario_id, credential_id, public_key, sign_count, transports, aaguid, nickname, cloned, created_at, updated_at;

-- name: UpdateWebauthnCredential :exec
UPDATE webauthn_credentials
SET sign_count = $2, cloned = $3, updated_at = now()
WHERE id = $1;

-- name: DeleteWebauthnCredential :exec
DELETE FROM webauthn_credentials
WHERE id = $1 AND usuario_id = $2;
