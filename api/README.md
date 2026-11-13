# Lyra API
Stores the sensor readings and serves the website.

## Requirements
- PHP 8.4 with `pdo_mysql`, `openssl`, `sodium` and `mbstring`
- MariaDB 11.8
- Apache 2.4 with PHP-FPM, sending every request under `/lyra/` that isn't a file to `index.php`, for example with `FallbackResource /lyra/index.php`
- Composer on your computer

In the steps below, `SERVER` is how you reach the server over SSH and `API_FOLDER` is the API's folder on it, like `/var/www/api.example.com/lyra`.

## 1. Database
In `sudo mariadb`:
```sql
CREATE DATABASE lyra CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
CREATE USER 'lyra_admin'@'localhost' IDENTIFIED BY 'db_password';
GRANT ALL PRIVILEGES ON lyra.* TO 'lyra_admin'@'localhost';
```

Then create the tables, in `sudo mariadb lyra`:
```sql
CREATE TABLE devices (
    device_id    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name         VARCHAR(50)       NOT NULL,
    api_key_hash CHAR(64)          NOT NULL,
    is_active    TINYINT(1)        NOT NULL DEFAULT 1,
    last_seen_at TIMESTAMP         NULL DEFAULT NULL,
    telemetry    JSON              NULL DEFAULT NULL,
    telemetry_at TIMESTAMP         NULL DEFAULT NULL,
    created_at   TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id),
    UNIQUE KEY (name),
    UNIQUE KEY (api_key_hash)
);

CREATE TABLE device_counts (
    device_id       SMALLINT UNSIGNED NOT NULL,
    day             DATE              NOT NULL,
    restarts        INT UNSIGNED      NOT NULL DEFAULT 0,
    wifi_reconnects INT UNSIGNED      NOT NULL DEFAULT 0,
    dropped         INT UNSIGNED      NOT NULL DEFAULT 0,
    PRIMARY KEY (device_id, day),
    FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE CASCADE
);

CREATE TABLE sensors (
    sensor_id  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    device_id  SMALLINT UNSIGNED NULL DEFAULT NULL,
    address    VARCHAR(32)       NOT NULL,
    name       VARCHAR(50)       NOT NULL,
    decoder    VARCHAR(30)       NOT NULL,
    created_at TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sensor_id),
    UNIQUE KEY (address),
    UNIQUE KEY (name),
    FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE SET NULL
);

CREATE TABLE metrics (
    metric_id        TINYINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    name             VARCHAR(30)        NOT NULL,
    unit             VARCHAR(10)        NOT NULL,
    default_interval MEDIUMINT UNSIGNED NOT NULL DEFAULT 900,
    PRIMARY KEY (metric_id),
    UNIQUE KEY (name)
);

CREATE TABLE sensor_metrics (
    sensor_id       SMALLINT UNSIGNED  NOT NULL,
    metric_id       TINYINT UNSIGNED   NOT NULL,
    report_interval MEDIUMINT UNSIGNED NOT NULL,
    is_active       TINYINT(1)         NOT NULL DEFAULT 1,
    PRIMARY KEY (sensor_id, metric_id),
    FOREIGN KEY (sensor_id) REFERENCES sensors (sensor_id) ON DELETE CASCADE,
    FOREIGN KEY (metric_id) REFERENCES metrics (metric_id)
);

CREATE TABLE sensor_sinks (
    sensor_id SMALLINT UNSIGNED NOT NULL,
    sink      VARCHAR(30)       NOT NULL,
    PRIMARY KEY (sensor_id, sink),
    FOREIGN KEY (sensor_id) REFERENCES sensors (sensor_id) ON DELETE CASCADE
);

CREATE TABLE readings (
    sensor_id   SMALLINT UNSIGNED NOT NULL,
    metric_id   TINYINT UNSIGNED  NOT NULL,
    value       DOUBLE            NOT NULL,
    measured_at TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sensor_id, metric_id, measured_at),
    FOREIGN KEY (sensor_id, metric_id) REFERENCES sensor_metrics (sensor_id, metric_id) ON DELETE CASCADE
);

CREATE TABLE users (
    user_id          SMALLINT UNSIGNED             NOT NULL AUTO_INCREMENT,
    handle           BINARY(32)                    NOT NULL,
    name             VARCHAR(50)                   NOT NULL,
    dashboard        JSON                          NULL DEFAULT NULL,
    temperature_unit ENUM('celsius', 'fahrenheit') NOT NULL DEFAULT 'celsius',
    time_zone        VARCHAR(64)                   NULL DEFAULT NULL,
    created_at       TIMESTAMP                     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY (handle),
    UNIQUE KEY (name)
);

CREATE TABLE passkeys (
    passkey_id    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id       SMALLINT UNSIGNED NOT NULL,
    credential_id VARBINARY(1023)   NOT NULL,
    name          VARCHAR(50)       NOT NULL,
    record        JSON              NOT NULL,
    last_used_at  TIMESTAMP         NULL DEFAULT NULL,
    created_at    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (passkey_id),
    UNIQUE KEY (credential_id),
    FOREIGN KEY (user_id) REFERENCES users (user_id)
);

CREATE TABLE sessions (
    session_id   INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    token_hash   CHAR(64)          NOT NULL,
    passkey_id   SMALLINT UNSIGNED NOT NULL,
    user_agent   VARCHAR(255)      NULL DEFAULT NULL,
    last_used_at TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at   TIMESTAMP         NOT NULL,
    created_at   TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id),
    UNIQUE KEY (token_hash),
    FOREIGN KEY (passkey_id) REFERENCES passkeys (passkey_id)
);

CREATE TABLE challenges (
    challenge_hash CHAR(64)          NOT NULL,
    user_id        SMALLINT UNSIGNED NULL DEFAULT NULL,
    expires_at     TIMESTAMP         NOT NULL,
    PRIMARY KEY (challenge_hash),
    FOREIGN KEY (user_id) REFERENCES users (user_id)
);

CREATE TABLE setup_codes (
    code_hash  CHAR(64)          NOT NULL,
    user_id    SMALLINT UNSIGNED NOT NULL,
    expires_at TIMESTAMP         NOT NULL,
    PRIMARY KEY (code_hash),
    FOREIGN KEY (user_id) REFERENCES users (user_id)
);
```

## 2. Credentials
From the root of the repository:
```bash
scp api/creds.json.template SERVER:API_FOLDER/creds.json
```

On the server, fill in the database password and make the file readable only for you and the group PHP runs as:
```bash
nano API_FOLDER/creds.json
sudo chown YOUR_USER:PHP_GROUP API_FOLDER/creds.json
sudo chmod 640 API_FOLDER/creds.json
```

## 3. Deploy
From the root of the repository, also for every update:
```bash
composer install --working-dir=api --no-dev --classmap-authoritative
rsync -av --delete --exclude README.md --exclude creds.json.template --exclude creds.json --exclude composer.json --exclude composer.lock --exclude .DS_Store api/ SERVER:API_FOLDER/
```

## 4. First passkey
Once the website is up, create your user, in `sudo mariadb lyra`:
```sql
INSERT INTO users (handle, name) VALUES (RANDOM_BYTES(32), 'USER_NAME');
```

Make a setup code:
```bash
openssl rand -hex 16
```

Store it for an hour, in `sudo mariadb lyra`:
```sql
INSERT INTO setup_codes (code_hash, user_id, expires_at) VALUES (SHA2('SETUP_CODE', 256), (SELECT user_id FROM users WHERE name = 'USER_NAME'), CURRENT_TIMESTAMP + INTERVAL 1 HOUR);
```

Open `/setup` on the website and create your passkey with the code. You can add more passkeys in Settings.