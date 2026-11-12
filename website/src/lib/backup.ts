import { api, apiText } from './api';
import { formatNumber } from './format';
import type { Sensor } from './types';

// A backup is a CSV file of every reading of a sensor: the time in UTC, the value's name, the value and its unit, in the units they're stored in.
type Row = [metric: string, time: string, value: number, unit?: string];

// Readings go to the API in parts that fit its request size.
const PART = 5000;

const iso = (time: number) => new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');

const count = (n: number, one: string, more: string) => `${formatNumber(n, 0)} ${n === 1 ? one : more}`;

export const exportReadings = async (sensor: Sensor) => {
  const csv = (await apiText(`/readings/export?sensor=${sensor.id}`)).replace(/^\uFEFF/, '');
  // Reading the response drops its byte order mark, which Excel needs to read °C right.
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv' }));
  const name = `${sensor.name.replace(/[\\/:*?"<>|]/g, '')} ${new Date().toLocaleDateString('sv')}.csv`;
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return `Exported ${count(csv.split('\n').filter(Boolean).length - 1, 'reading', 'readings')}`;
};

// Reads a backup, also after Excel saved it again with semicolons, decimal commas and times without a time zone, which are taken as UTC.
const parse = (text: string) => {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const delimiter = (lines[0] ?? '').includes(';') ? ';' : ',';
  const cells = (line: string) => line.split(delimiter).map((cell) => cell.trim().replace(/^"(.*)"$/, '$1'));
  const header = cells(lines[0] ?? '').map((cell) => cell.toLowerCase());
  const [time, metric, value, unit] = ['time', 'metric', 'value', 'unit'].map((name) => header.indexOf(name));

  if (time < 0 || metric < 0 || value < 0) {
    throw new Error("This file isn't a backup of readings. It needs the columns time, metric and value.");
  }

  const rows: Row[] = [];
  let invalid = 0;

  for (const line of lines.slice(1)) {
    const row = cells(line);
    const number = Number((row[value] ?? '').replace(',', '.'));
    const stamp = (row[time] ?? '').replace(' ', 'T');
    const at = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(stamp) ? stamp : `${stamp}Z`);

    if (!row[metric] || !row[value] || !Number.isFinite(number) || Number.isNaN(at)) {
      invalid++;
    } else {
      rows.push(unit >= 0 && row[unit] ? [row[metric], iso(at), number, row[unit]] : [row[metric], iso(at), number]);
    }
  }

  return { rows, invalid };
};

// Adds the readings of a backup that aren't here yet. The API skips what's already stored, also when the times differ by under a minute.
export const importReadings = async (sensor: Sensor, file: File, onProgress: (share: number) => void) => {
  const { rows, invalid } = parse(await file.text());
  const total = { added: 0, skipped: 0, invalid };

  if (!rows.length) {
    throw new Error(invalid ? 'None of the rows in this file could be read.' : 'This file has no readings.');
  }

  // In order per value, so each part covers a short stretch of time.
  rows.sort(([a, at], [b, bt]) => a.localeCompare(b) || at.localeCompare(bt));

  for (let i = 0; i < rows.length; i += PART) {
    const result = await api<typeof total>('/readings/import', 'POST', { sensor: sensor.id, readings: rows.slice(i, i + PART) });
    total.added += result.added;
    total.skipped += result.skipped;
    total.invalid += result.invalid;
    onProgress(Math.min(1, (i + PART) / rows.length));
  }

  const added = total.added
    ? `Added ${count(total.added, 'reading', 'readings')}${total.skipped ? `, ${count(total.skipped, 'was', 'were')} already here` : ''}`
    : `Nothing new, ${count(total.skipped, 'reading was', 'readings were')} already here`;
  return `${added}${total.invalid ? `. ${count(total.invalid, "row couldn't", "rows couldn't")} be read` : ''}`;
};