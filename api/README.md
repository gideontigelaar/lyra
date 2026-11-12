# Lyra API
API that decodes the sensor broadcasts the firmware relays, stores them in the MariaDB database and serves the website.

Runs on [api.gideontigelaar.com/lyra](https://api.gideontigelaar.com/lyra).

## Requirements
- PHP 8.4 with `pdo_mysql`, `openssl`, `sodium` and `mbstring`
- MariaDB 11.8
- Composer, on the computer you deploy from
- Apache 2.4 with the `lyra` API project, see "Add API project" in `SERVER.md`

## Database
1. Create the database and its user, in `sudo mariadb`:
   ```sql
   CREATE DATABASE lyra CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
   CREATE USER 'lyra_admin'@'localhost' IDENTIFIED BY 'db_password';
   GRANT ALL PRIVILEGES ON lyra.* TO 'lyra_admin'@'localhost';
   ```

2. Create the tables, in `sudo mariadb lyra`:
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
       FOREIGN KEY (sensor_id) REFERENCES sensors (sensor_id) ON DELETE CASCADE,
       FOREIGN KEY (metric_id) REFERENCES metrics (metric_id)
   );

   CREATE TABLE users (
       user_id          SMALLINT UNSIGNED             NOT NULL AUTO_INCREMENT,
       handle           BINARY(32)                    NOT NULL,
       name             VARCHAR(50)                   NOT NULL,
       dashboard        JSON                          NULL DEFAULT NULL,
       temperature_unit ENUM('celsius', 'fahrenheit') NOT NULL DEFAULT 'celsius',
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
       token_hash CHAR(64)          NOT NULL,
       passkey_id SMALLINT UNSIGNED NOT NULL,
       expires_at TIMESTAMP         NOT NULL,
       created_at TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (token_hash),
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

   INSERT INTO metrics (name, unit, default_interval) VALUES
       ('temperature', '°C', 900),
       ('humidity', '%', 900),
       ('battery', '%', 3600),
       ('voltage', 'V', 3600),
       ('pressure', 'hPa', 900),
       ('illuminance', 'lx', 900),
       ('dew_point', '°C', 900),
       ('co2', 'ppm', 900);
   ```

## Credentials
Copy the template to the server, run from the root of the repository:
```bash
scp api/creds.json.template debian-server:/var/www/api.gideontigelaar.com/lyra/creds.json
```

Then on the server, set the database password and permissions:
```bash
nano /var/www/api.gideontigelaar.com/lyra/creds.json
sudo chown gideon:lyra /var/www/api.gideontigelaar.com/lyra/creds.json
sudo chmod 640 /var/www/api.gideontigelaar.com/lyra/creds.json
```

## Sources and sensors
Sources (the ESP32 boards) and sensors are managed on the website. Adding a source shows its key once: it goes in `firmware/include/credentials.h`, and only its hash is stored.

A sensor needs its MAC address, its type and the source that relays it. The source picks it up within 5 minutes, and each value is then recorded at its type's `default_interval` until you change it.

## Users and passkeys
Signing in to the website only works with passkeys. Create the owner, in `sudo mariadb lyra`:
```sql
INSERT INTO users (handle, name) VALUES (RANDOM_BYTES(32), 'USER_NAME');
```

The first passkey needs a one-time setup code. Create one:
```bash
openssl rand -hex 16
```

Store it for an hour, in `sudo mariadb lyra`:
```sql
INSERT INTO setup_codes (code_hash, user_id, expires_at) VALUES (SHA2('SETUP_CODE', 256), (SELECT user_id FROM users WHERE name = 'USER_NAME'), CURRENT_TIMESTAMP + INTERVAL 1 HOUR);
```

Then open [lyra.gideontigelaar.com/setup](https://lyra.gideontigelaar.com/setup) and create the passkey with it. More passkeys can be added in the website's settings, so a new setup code is only needed when every passkey is lost.

## Deploying
Run from the root of the repository:
```bash
composer install --working-dir=api --no-dev --classmap-authoritative
rsync -av --delete --exclude README.md --exclude creds.json.template --exclude creds.json --exclude composer.json --exclude composer.lock --exclude .DS_Store api/ debian-server:/var/www/api.gideontigelaar.com/lyra/
```

Add `--dry-run` to see what would change first. Files deleted locally are also deleted on the server, except `creds.json`.

## Endpoints
- `GET /lyra/`: health check
- `GET /lyra/device/sensors`: the source's sensors and how often to relay each
- `POST /lyra/device/adverts`: relay sensor broadcasts
- `POST /lyra/device/telemetry`: the source's own health, for troubleshooting
- `GET /lyra/auth/setup`: whether an unused setup code is waiting, so the sign-in page can offer it
- `POST /lyra/auth/options`: a challenge to sign in with
- `POST /lyra/auth/login`: sign in with a passkey
- `POST /lyra/auth/logout`: sign out
- `GET /lyra/passkeys`: the user's passkeys
- `POST /lyra/passkeys/options`: a challenge to register a passkey with
- `POST /lyra/passkeys`: register a passkey
- `DELETE /lyra/passkeys/{id}`: remove a passkey
- `GET /lyra/sensors`: every sensor with its values, latest readings and sinks
- `POST /lyra/sensors`: add a sensor
- `PATCH /lyra/sensors/{id}`: change a sensor's name, source, values or sinks
- `DELETE /lyra/sensors/{id}`: remove a sensor and all its readings
- `GET /lyra/devices`: every source, when it was last seen, its latest telemetry and its sensors
- `POST /lyra/devices`: add a source, returns its key once
- `PATCH /lyra/devices/{id}`: rename a source or turn it on or off
- `POST /lyra/devices/{id}/key`: replace a source's key
- `DELETE /lyra/devices/{id}`: remove a source, its sensors are kept
- `GET /lyra/decoders`, `GET /lyra/sinks`: the sensor types and destinations there are
- `GET /lyra/readings?sensor=ID&metric=NAME&from=TIME&to=TIME&tz=ZONE&bucket=BUCKET`: one value of one sensor over time
- `DELETE /lyra/readings`: delete readings in time ranges
- `GET /lyra/dashboard`: the user's summary cards, `null` until customised
- `PUT /lyra/dashboard`: save the summary cards
- `DELETE /lyra/dashboard`: go back to the default summary
- `GET /lyra/settings`: the user's settings
- `PATCH /lyra/settings`: change `temperature_unit` to `celsius` or `fahrenheit`

Device endpoints need the header `Authorization: Bearer KEY`. The other endpoints use the session cookie set when signing in, and changes only accept the website's origin. Registering a passkey without a session needs `setup_code` in the body.

Response of `GET /lyra/device/sensors`:
```json
{"sensors": [{"address": "A4:C1:38:2A:EF:13", "interval": 900}]}
```

Body of `POST /lyra/device/adverts`, with the raw broadcast as hex:
```json
{"adverts": [{"address": "a4:c1:38:2a:ef:13", "data": "0201060e16d2fc4000120157025a0803bf13", "rssi": -61, "age": 0}]}
```

Body of `POST /lyra/device/telemetry`, every field optional:
```json
{"uptime": 86400, "boots": 12, "reset_reason": "power_on", "rssi": -61, "wifi_reconnects": 0, "free_heap": 182000, "min_free_heap": 151000, "largest_block": 110000, "temperature": 41.5, "pending": 0, "dropped": 0, "build": "Nov 12 2026 10:00:00"}
```

Response of `GET /lyra/readings?sensor=1&metric=temperature&from=2026-11-04T23:00:00Z&to=2026-11-11T23:00:00Z&tz=Europe/Amsterdam&bucket=day`:
```json
{"unit": "°C", "bucket": "day", "readings": [{"time": "2026-11-04T23:00:00Z", "avg": 21.42, "min": 20.9, "max": 22.1}]}
```

Body of `DELETE /lyra/readings`:
```json
{"sensor": 1, "metric": "temperature", "ranges": [{"from": "2026-11-07T23:00:00Z", "to": "2026-11-08T23:00:00Z"}]}
```

## Notes
- Every response carries the security headers of `send_security_headers()` in `lib/http.php`.
- Each file in `modules/` defines its handlers and returns its routes. New modules are added to `MODULES` in `index.php`, shared helpers live in `lib/`.
- Broadcasts are decoded here, so a new sensor type is a file in `decoders/` plus its name in `DECODERS` in `lib/pipeline.php`. A new destination is a file in `sinks/` plus its name in `SINKS`. Neither needs a firmware update.
- `bthome` reads BTHome v2 without encryption, like the pvvx firmware. `lyra` stores the readings here.
- A source only relays its own sensors. Values that aren't in the `metrics` table are ignored, so a new kind of value only needs a row there.
- Only the latest telemetry of a source is kept. Unknown telemetry fields are ignored, so newer firmware works with this API. Memory is in bytes, `uptime` in seconds, `temperature` is the chip's in °C, `pending` and `dropped` count broadcasts waiting in or dropped from the source's queue.
- A value is stored when its interval has passed since the last one, with 10% leeway. `age` is how many seconds ago the source heard the broadcast, up to 7 days, so broadcasts sent late still get the right time.
- `bucket` is `raw` (single readings, up to 31 days), `hour` (up to 31 days), `day` (up to 400 days), `week` (from Monday, up to 1100 days) or `month` (up to 3700 days). Buckets follow the local time of `tz`, an IANA time zone that defaults to UTC.
- Summary cards are stored as the website sends them. The API only checks that there are at most 100 and that each has a `type`, so new card types need no API change.
- Temperatures are stored in °C. `temperature_unit` only changes how the website shows them.
- Passkeys must use one of `PASSKEY_ALGORITHMS` in `lib/webauthn.php`.
- Sessions last 30 days. Session tokens, setup codes, source keys and challenges are only stored as SHA-256 hashes.
- Removing a passkey ends its sessions. The last passkey can't be removed.
- All timestamps are in UTC.