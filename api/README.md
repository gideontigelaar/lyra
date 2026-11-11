# Lyra API
API that decodes the sensor broadcasts the firmware relays and stores them in the MariaDB database.

Runs on [api.gideontigelaar.com/lyra](https://api.gideontigelaar.com/lyra).

## Requirements
- PHP 8.4 with `pdo_mysql`
- MariaDB 11.8
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
       created_at   TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (device_id),
       UNIQUE KEY (name),
       UNIQUE KEY (api_key_hash)
   );

   CREATE TABLE sensors (
       sensor_id  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
       device_id  SMALLINT UNSIGNED NOT NULL,
       address    VARCHAR(32)       NOT NULL,
       name       VARCHAR(50)       NOT NULL,
       decoder    VARCHAR(30)       NOT NULL,
       created_at TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (sensor_id),
       UNIQUE KEY (address),
       UNIQUE KEY (name),
       FOREIGN KEY (device_id) REFERENCES devices (device_id)
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
       FOREIGN KEY (sensor_id) REFERENCES sensors (sensor_id),
       FOREIGN KEY (metric_id) REFERENCES metrics (metric_id)
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

## Devices and sensors
Each device has its own API key. Create one:
```bash
openssl rand -hex 32
```

Register the device, in `sudo mariadb lyra`:
```sql
INSERT INTO devices (name, api_key_hash) VALUES ('DEVICE_NAME', SHA2('API_KEY', 256));
```

The same key goes in `firmware/include/credentials.h`. Only its hash is stored, so keep the key somewhere safe.

Register each sensor the device relays, with its type and where its values go. The address is in capitals, like `A4:C1:38:2A:EF:13`:
```sql
INSERT INTO sensors (device_id, address, name, decoder) VALUES ((SELECT device_id FROM devices WHERE name = 'DEVICE_NAME'), 'SENSOR_ADDRESS', 'SENSOR_NAME', 'bthome');
INSERT INTO sensor_sinks (sensor_id, sink) SELECT sensor_id, 'lyra' FROM sensors WHERE name = 'SENSOR_NAME';
```

Its values appear on their own once the device hears it, each recorded at its `default_interval` in `metrics`. To record one at another interval, in seconds:
```sql
UPDATE sensor_metrics SET report_interval = SECONDS WHERE sensor_id = (SELECT sensor_id FROM sensors WHERE name = 'SENSOR_NAME') AND metric_id = (SELECT metric_id FROM metrics WHERE name = 'METRIC_NAME');
```

The device reloads its sensors every 5 minutes, so adding one needs no firmware change.

## Deploying
Run from the root of the repository:
```bash
rsync -av --delete --exclude README.md --exclude creds.json.template --exclude creds.json --exclude .DS_Store api/ debian-server:/var/www/api.gideontigelaar.com/lyra/
```

Add `--dry-run` to see what would change first. Files deleted locally are also deleted on the server, except `creds.json`.

## Endpoints
- `GET /lyra/`: health check
- `GET /lyra/device/sensors`: the device's sensors and how often to relay each
- `POST /lyra/device/adverts`: relay sensor broadcasts

Device endpoints need the header `Authorization: Bearer API_KEY`.

Response of `GET /lyra/device/sensors`:
```json
{"sensors": [{"address": "A4:C1:38:2A:EF:13", "interval": 900}]}
```

Body of `POST /lyra/device/adverts`, with the raw broadcast as hex:
```json
{"adverts": [{"address": "a4:c1:38:2a:ef:13", "data": "0201060e16d2fc4000120157025a0803bf13", "rssi": -61, "age": 0}]}
```

## Notes
- Each file in `modules/` defines its handlers and returns its routes. New modules are added to `MODULES` in `index.php`, shared helpers live in `lib/`.
- Broadcasts are decoded here, so a new sensor type is a file in `decoders/` plus its name in `DECODERS` in `lib/pipeline.php`. A new destination is a file in `sinks/` plus its name in `SINKS`. Neither needs a firmware update.
- `bthome` reads BTHome v2 without encryption, like the pvvx firmware. `lyra` stores the readings here.
- A device only relays its own sensors. Values that aren't in the `metrics` table are ignored, so a new kind of value only needs a row there.
- A value is stored when its interval has passed since the last one, with 10% leeway. `age` is how many seconds ago the device heard the broadcast, up to 7 days, so broadcasts sent late still get the right time.
- All timestamps are in UTC.