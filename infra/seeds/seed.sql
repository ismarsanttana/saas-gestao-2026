INSERT INTO secretarias (id, nome, slug)
VALUES 
    ('943f25d2-e2ee-4104-962d-3f3b98e98e69', 'Saude', 'saude'),
    ('01166e11-68c3-42ad-abe0-f05722b4caca', 'Educacao', 'educacao'),
    ('4ceceb4d-bd4c-4924-93c5-40d327397dfa', 'Esportes', 'esportes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO usuarios (id, nome, email, senha_hash)
VALUES
    ('918b3a2b-d262-452f-8e25-20e8a17d6aa3', 'Admin Técnico', 'admin@prefeitura.local', '$argon2id$v=19$m=65536,t=1,p=4$NtLZVV/dX4PCKzsk+1Kx5A$xgwAfwOdqo6EfcplxipvKjJlVhAKb5/HG3qsMsr7aIo'),
    ('cab17c1f-e129-48fe-a4e5-70cf1bbd13f7', 'Secretario Saude', 'secretario.saude@prefeitura.local', '$argon2id$v=19$m=65536,t=1,p=4$5d3A06icfn7vCjsvch+Z1g$g4JY6IZ1CBQInhLGJTGes28w3teSt/7wHGrwASKDGbU')
ON CONFLICT (id) DO NOTHING;

INSERT INTO usuarios_secretarias (usuario_id, secretaria_id, papel)
VALUES
    ('918b3a2b-d262-452f-8e25-20e8a17d6aa3', '943f25d2-e2ee-4104-962d-3f3b98e98e69', 'ADMIN_TEC'),
    ('918b3a2b-d262-452f-8e25-20e8a17d6aa3', '01166e11-68c3-42ad-abe0-f05722b4caca', 'ADMIN_TEC'),
    ('918b3a2b-d262-452f-8e25-20e8a17d6aa3', '4ceceb4d-bd4c-4924-93c5-40d327397dfa', 'ADMIN_TEC'),
    ('cab17c1f-e129-48fe-a4e5-70cf1bbd13f7', '943f25d2-e2ee-4104-962d-3f3b98e98e69', 'SECRETARIO')
ON CONFLICT (usuario_id, secretaria_id) DO NOTHING;
