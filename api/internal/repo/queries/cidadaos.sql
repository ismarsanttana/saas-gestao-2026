-- name: GetCidadaoByEmail :one
SELECT id, nome, email, senha_hash, ativo, criado_em
FROM cidadaos
WHERE email = $1;

-- name: GetCidadaoByID :one
SELECT id, nome, email, senha_hash, ativo, criado_em
FROM cidadaos
WHERE id = $1;
