-- name: GetUsuarioByEmail :one
SELECT id, nome, email, senha_hash, ativo, criado_em
FROM usuarios
WHERE email = $1;

-- name: GetUsuarioByID :one
SELECT id, nome, email, senha_hash, ativo, criado_em
FROM usuarios
WHERE id = $1;

-- name: ListSecretariasByUsuario :many
SELECT us.secretaria_id,
       s.nome AS secretaria,
       s.slug,
       us.papel
FROM usuarios_secretarias us
JOIN secretarias s ON s.id = us.secretaria_id
WHERE us.usuario_id = $1
ORDER BY s.nome;
