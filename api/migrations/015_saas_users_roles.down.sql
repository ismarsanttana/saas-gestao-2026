ALTER TABLE saas_users
    DROP CONSTRAINT IF EXISTS saas_users_created_by_fkey;
ALTER TABLE saas_users
    DROP CONSTRAINT IF EXISTS saas_users_role_check;
ALTER TABLE saas_users
    DROP COLUMN IF EXISTS created_by;
ALTER TABLE saas_users
    DROP COLUMN IF EXISTS invited_at;
ALTER TABLE saas_users
    DROP COLUMN IF EXISTS last_login_at;
ALTER TABLE saas_users
    DROP COLUMN IF EXISTS role;
