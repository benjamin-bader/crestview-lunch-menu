CREATE TABLE users (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    access_token TEXT NOT NULL,
    plugin_setting_id INTEGER
);

CREATE UNIQUE INDEX ix_users_on_uuid_unique ON users (uuid);

CREATE INDEX ix_users_on_access_token ON users (access_token);
