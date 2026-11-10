# Lyra API
API that receives data from the firmware and stores it in the MariaDB database.

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
       created_at TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (sensor_id),
       UNIQUE KEY (address),
       UNIQUE KEY (name),
       FOREIGN KEY (device_id) REFERENCES devices (device_id)
   );

   CREATE TABLE metrics (
       metric_id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
       name      VARCHAR(30)      NOT NULL,
       unit      VARCHAR(10)      NOT NULL,
       PRIMARY KEY (metric_id),
       UNIQUE KEY (name)
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

   INSERT INTO metrics (name, unit) VALUES
       ('temperature', '°C'),
       ('humidity', '%'),
       ('battery', '%'),
       ('voltage', 'V');
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

Only its hash is stored, so keep the key somewhere safe.

Register each sensor the device forwards:
```sql
INSERT INTO sensors (device_id, address, name) VALUES ((SELECT device_id FROM devices WHERE name = 'DEVICE_NAME'), 'SENSOR_ADDRESS', 'SENSOR_NAME');
```

## Deploying
Run from the root of the repository:
```bash
rsync -av --delete --exclude README.md --exclude creds.json.template --exclude creds.json --exclude .DS_Store api/ debian-server:/var/www/api.gideontigelaar.com/lyra/
```

Add `--dry-run` to see what would change first. Files deleted locally are also deleted on the server, except `creds.json`.

## Endpoints
- `GET /lyra/`: health check
- `POST /lyra/readings`: store the values of one measurement

Device endpoints need the header `Authorization: Bearer API_KEY`.

Body of `POST /lyra/readings`:
```json
{"sensor": "A4:C1:38:2A:EF:13", "readings": {"temperature": 21.37, "humidity": 45.1, "battery": 87}}
```

## Notes
- A device can only send readings for its own sensors, and only for metrics in the `metrics` table.
- New kinds of values only need a row in `metrics`, no schema change.
- All timestamps are in UTC.