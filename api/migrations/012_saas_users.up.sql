CREATE TABLE saas_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER saas_users_set_timestamp
    BEFORE UPDATE ON saas_users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

INSERT INTO saas_users (name, email, password_hash)
VALUES (
    'Urbanbyte Admin',
    'admin@urbanbyte.com.br',
    '$argon2id$v=19$m=65536,t=3,p=1$nfM3kOKBmwm1wF+eusJ7bA$p8Xhx/Kmx/8ExUUv90ejNpaWUXeHVWGcQ71a41F5YZA'
)
ON CONFLICT (email) DO NOTHING;
