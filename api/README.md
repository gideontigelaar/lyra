# Lyra API
Takes the sensor broadcasts the boards relay, decodes them, stores the readings in MariaDB and serves the website. It runs under `/lyra/` on a domain of its own, like `https://api.example.com/lyra/`.

## Requirements
- PHP 8.4 with `pdo_mysql`, `openssl`, `sodium` and `mbstring`
- MariaDB 11.8
- Composer, on the computer you deploy from
- Apache 2.4 with PHP-FPM, sending requests under `/lyra/` that aren't a file to `index.php`, like `FallbackResource /lyra/index.php` does

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

   `metrics` fills itself: a value is added the first time a sensor sends it, with the unit and interval its decoder declares.

## Credentials
Copy the template to the server, from the root of the repository. `SERVER` is how you reach the server over SSH and `API_FOLDER` the folder the API runs from, like `/var/www/api.example.com/lyra`:
```bash
scp api/creds.json.template SERVER:API_FOLDER/creds.json
```

Then on the server, fill in the database password and lock the file down, so only you and the group PHP runs the API as, `PHP_GROUP`, can read it:
```bash
nano API_FOLDER/creds.json
sudo chown YOUR_USER:PHP_GROUP API_FOLDER/creds.json
sudo chmod 640 API_FOLDER/creds.json
```

## First sign-in
The website only signs in with passkeys. Create the owner, in `sudo mariadb lyra`:
```sql
INSERT INTO users (handle, name) VALUES (RANDOM_BYTES(32), 'USER_NAME');
```

The first passkey needs a one-time setup code. Make one:
```bash
openssl rand -hex 16
```

Store it for an hour, in `sudo mariadb lyra`:
```sql
INSERT INTO setup_codes (code_hash, user_id, expires_at) VALUES (SHA2('SETUP_CODE', 256), (SELECT user_id FROM users WHERE name = 'USER_NAME'), CURRENT_TIMESTAMP + INTERVAL 1 HOUR);
```

Then open `/setup` on the website, like `https://lyra.example.com/setup`, and create the passkey with it. More passkeys can be added in the website's settings, so you only need a new code when every passkey is gone.

## Deploying
From the root of the repository:
```bash
composer install --working-dir=api --no-dev --classmap-authoritative
rsync -av --delete --exclude README.md --exclude creds.json.template --exclude creds.json --exclude composer.json --exclude composer.lock --exclude .DS_Store api/ SERVER:API_FOLDER/
```

Add `--dry-run` first to see what would change. Files deleted locally are deleted on the server too, except `creds.json`.

## Endpoints
- `GET /lyra/`: health check
- `GET /lyra/device/sensors`: the source's sensors and how often to relay each
- `POST /lyra/device/adverts`: relay sensor broadcasts
- `POST /lyra/device/telemetry`: the source's own health
- `GET /lyra/auth/setup`: whether a setup code is waiting
- `POST /lyra/auth/options`: a challenge to sign in with
- `POST /lyra/auth/login`: sign in with a passkey
- `POST /lyra/auth/logout`: sign out
- `GET /lyra/passkeys`: the user's passkeys
- `POST /lyra/passkeys/options`: a challenge to register a passkey with
- `POST /lyra/passkeys`: register a passkey
- `DELETE /lyra/passkeys/{id}`: remove a passkey
- `GET /lyra/sessions`: the user's sessions, with browser and last use
- `DELETE /lyra/sessions/{id}`: sign a session out
- `GET /lyra/sensors`: every sensor with its values, latest readings and sinks. `hour_before` is the reading from 1 to 2 hours before the latest, for trends, or `null`. `battery_days_left` is how many days the battery has left at the rate it dropped, or `null` while that can't be told yet
- `POST /lyra/sensors`: add a sensor
- `PATCH /lyra/sensors/{id}`: change a sensor's name, source, values or sinks
- `DELETE /lyra/sensors/{id}`: remove a sensor and all its readings
- `GET /lyra/devices`: every source, when it was last seen, its latest telemetry, its restarts, reconnects and dropped broadcasts of the last 7 days, and its sensors
- `POST /lyra/devices`: add a source, returns its key once
- `PATCH /lyra/devices/{id}`: rename a source or turn it on or off
- `POST /lyra/devices/{id}/key`: replace a source's key
- `DELETE /lyra/devices/{id}`: remove a source, keeping its sensors
- `GET /lyra/decoders`, `GET /lyra/sinks`: the sensor types and destinations there are
- `GET /lyra/readings?sensor=ID&metric=NAME&from=TIME&to=TIME&tz=ZONE&bucket=BUCKET`: one value of one sensor over time
- `DELETE /lyra/readings`: delete readings in time ranges
- `GET /lyra/readings/export?sensor=ID`: every reading of a sensor as CSV, for a backup
- `POST /lyra/readings/import`: add readings from a backup
- `GET /lyra/dashboard`: the summary cards, `null` until customised
- `PUT /lyra/dashboard`: save the summary cards
- `DELETE /lyra/dashboard`: go back to the default summary
- `GET /lyra/settings`: `temperature_unit` and `time_zone`
- `PATCH /lyra/settings`: change either, `time_zone` is an IANA name or `null` to follow the browser

Device endpoints need the header `Authorization: Bearer KEY`. The rest use the session cookie set when signing in, and changes only accept the website's origin. Registering a passkey without a session needs `setup_code` in the body.

Response of `GET /lyra/device/sensors`:
```json
{"sensors": [{"address": "A4:C1:38:2A:EF:13", "interval": 60, "offline_interval": 900}]}
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
{"unit": "°C", "bucket": "day", "readings": [{"time": "2026-11-04T23:00:00Z", "avg": 21.42, "min": 20.9, "max": 22.1}], "before": {"time": "2026-11-03T23:00:00Z", "avg": 21.1, "min": 20.6, "max": 21.8}, "after": null}
```

Body of `DELETE /lyra/readings`:
```json
{"sensor": 1, "metric": "temperature", "ranges": [{"from": "2026-11-07T23:00:00Z", "to": "2026-11-08T23:00:00Z"}]}
```

Body of `POST /lyra/readings/import`, each reading as `[metric, time, value]` with the unit as an optional fourth item:
```json
{"sensor": 1, "readings": [["temperature", "2026-11-12T10:00:00Z", 21.43, "°C"], ["humidity", "2026-11-12T10:00:00Z", 55]]}
```

Response:
```json
{"added": 2, "skipped": 0, "invalid": 0}
```

## Good to know
- Every response carries the security headers from `send_security_headers()` in `lib/http.php`.
- Each file in `modules/` has its handlers and returns its routes. A new module goes in `MODULES` in `index.php`, shared helpers in `lib/`.
- Broadcasts are decoded here, not on the boards. A new sensor type is a file in `plugins/decoders/` plus its name in `DECODERS` in `lib/pipeline.php`, a new destination a file in `plugins/sinks/` plus its name in `SINKS`. Neither needs a firmware update or a database change.
- `bthome` reads unencrypted BTHome v2, like the pvvx firmware sends. `lyra` stores the readings here.
- Sources and sensors are managed on the website. A new source's key is shown once, for `firmware/include/credentials.h`, and only its hash is stored. A new sensor reaches its source within 5 minutes, and each value is recorded at its metric's `default_interval` until you change it.
- A source only relays its own sensors. A decoder declares each value it reads with its unit and default interval, see `bthome`. A value that isn't in `metrics` yet is added the first time a sensor sends it, values a decoder doesn't declare are ignored.
- A source relays each sensor once a minute, see `RELAY_SECONDS` in `lib/pipeline.php`, as some sensors send values in broadcasts of their own. While it can't reach the API, it keeps one of each kind of broadcast per `offline_interval`, the sensor's shortest recording interval, for up to 7 days. A value is stored once its interval has passed since the last one, less half a relay, so on average at its interval. `age` is how many seconds ago the source heard the broadcast, up to 7 days, so late broadcasts still get the right time.
- Only a source's latest telemetry is kept, and unknown fields are ignored, so newer firmware keeps working. Its restarts, from `boots`, and its `wifi_reconnects` and `dropped`, which count from its last restart, are also added up per day in `device_counts` for the last 7 days, see `count_changes()`. Memory is in bytes, `uptime` in seconds, `temperature` is the chip's in °C, and `pending` and `dropped` count broadcasts waiting in or dropped from the queue.
- `bucket` is `raw` (single readings, up to 31 days), `hour` (up to 31 days), `day` (up to 400 days), `week` (from Monday, up to 1100 days) or `month` (up to 3700 days). Buckets follow the local time of `tz`, which defaults to UTC. `before` and `after` are the bucket of the nearest reading before and after the range, however far away, or `null`, so a chart's line can carry on to its edges and across gaps.
- A backup has the columns `time`, `metric`, `value` and `unit`, in the units readings are stored in, with a byte order mark so Excel reads it as UTF-8. Importing skips readings that are stored already, or that are within a minute of a stored reading of the same value, so a backup that overlaps what's there only adds what's missing. A value the sensor didn't have yet is added to it, also one that's new to `metrics` if the sensor's decoder declares it. Readings with an unknown value, another unit or a time in the future count as invalid. A request takes up to 5000 readings, the website sends a backup in parts.
- Summary cards are stored as the website sends them. The API only checks that there are at most 100 and that each has a `type`, so new card types need no API change.
- Temperatures are stored in °C, `temperature_unit` only changes what the website shows.
- Passkeys must use one of `PASSKEY_ALGORITHMS` in `lib/webauthn.php`. The last one can't be removed, and removing one ends its sessions.
- Sessions last 30 days. Their browser and last use are updated at most every 5 minutes.
- Session tokens, setup codes, source keys and challenges are only stored as SHA-256 hashes.
- All timestamps are in UTC.