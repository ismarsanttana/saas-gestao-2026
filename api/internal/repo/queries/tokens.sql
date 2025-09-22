-- name: InsertRefreshToken :one
INSERT INTO tokens_refresh (
    id,
    subject,
    audience,
    token_hash,
    expiracao,
    criado_em,
    revogado
) VALUES (
    $1, $2, $3, $4, $5, $6, FALSE
) RETURNING id, subject, audience, token_hash, expiracao, criado_em, revogado;

-- name: GetRefreshTokenByHash :one
SELECT id, subject, audience, token_hash, expiracao, criado_em, revogado
FROM tokens_refresh
WHERE token_hash = $1;

-- name: RevokeRefreshToken :exec
UPDATE tokens_refresh
SET revogado = TRUE
WHERE token_hash = $1;

-- name: InvalidateOtherRefreshTokens :exec
UPDATE tokens_refresh
SET revogado = TRUE
WHERE subject = $1
  AND audience = $2
  AND token_hash <> $3;
