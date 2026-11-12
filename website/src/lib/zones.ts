// Commonly used time zones to pick from, by region. Any other IANA zone still works when it's saved.
export const ZONES: [string, [string, string][]][] = [
  ['Universal', [['UTC', 'UTC']]],
  [
    'Europe',
    [
      ['Atlantic/Reykjavik', 'Reykjavik'],
      ['Europe/Lisbon', 'Lisbon'],
      ['Europe/London', 'London'],
      ['Europe/Dublin', 'Dublin'],
      ['Europe/Amsterdam', 'Amsterdam'],
      ['Europe/Berlin', 'Berlin'],
      ['Europe/Brussels', 'Brussels'],
      ['Europe/Copenhagen', 'Copenhagen'],
      ['Europe/Madrid', 'Madrid'],
      ['Europe/Oslo', 'Oslo'],
      ['Europe/Paris', 'Paris'],
      ['Europe/Prague', 'Prague'],
      ['Europe/Rome', 'Rome'],
      ['Europe/Stockholm', 'Stockholm'],
      ['Europe/Vienna', 'Vienna'],
      ['Europe/Warsaw', 'Warsaw'],
      ['Europe/Zurich', 'Zurich'],
      ['Europe/Athens', 'Athens'],
      ['Europe/Bucharest', 'Bucharest'],
      ['Europe/Helsinki', 'Helsinki'],
      ['Europe/Kyiv', 'Kyiv'],
      ['Europe/Istanbul', 'Istanbul'],
      ['Europe/Moscow', 'Moscow'],
    ],
  ],
  [
    'Americas',
    [
      ['Pacific/Honolulu', 'Honolulu'],
      ['America/Anchorage', 'Anchorage'],
      ['America/Los_Angeles', 'Los Angeles'],
      ['America/Vancouver', 'Vancouver'],
      ['America/Denver', 'Denver'],
      ['America/Phoenix', 'Phoenix'],
      ['America/Chicago', 'Chicago'],
      ['America/Mexico_City', 'Mexico City'],
      ['America/Bogota', 'Bogotá'],
      ['America/Lima', 'Lima'],
      ['America/New_York', 'New York'],
      ['America/Toronto', 'Toronto'],
      ['America/Halifax', 'Halifax'],
      ['America/Santiago', 'Santiago'],
      ['America/Argentina/Buenos_Aires', 'Buenos Aires'],
      ['America/Sao_Paulo', 'São Paulo'],
    ],
  ],
  [
    'Africa',
    [
      ['Africa/Casablanca', 'Casablanca'],
      ['Africa/Lagos', 'Lagos'],
      ['Africa/Cairo', 'Cairo'],
      ['Africa/Johannesburg', 'Johannesburg'],
      ['Africa/Nairobi', 'Nairobi'],
    ],
  ],
  [
    'Asia',
    [
      ['Asia/Jerusalem', 'Jerusalem'],
      ['Asia/Riyadh', 'Riyadh'],
      ['Asia/Dubai', 'Dubai'],
      ['Asia/Karachi', 'Karachi'],
      ['Asia/Kolkata', 'India'],
      ['Asia/Dhaka', 'Dhaka'],
      ['Asia/Bangkok', 'Bangkok'],
      ['Asia/Jakarta', 'Jakarta'],
      ['Asia/Shanghai', 'China'],
      ['Asia/Hong_Kong', 'Hong Kong'],
      ['Asia/Manila', 'Manila'],
      ['Asia/Singapore', 'Singapore'],
      ['Asia/Taipei', 'Taipei'],
      ['Asia/Seoul', 'Seoul'],
      ['Asia/Tokyo', 'Tokyo'],
    ],
  ],
  [
    'Oceania',
    [
      ['Australia/Perth', 'Perth'],
      ['Australia/Brisbane', 'Brisbane'],
      ['Australia/Adelaide', 'Adelaide'],
      ['Australia/Melbourne', 'Melbourne'],
      ['Australia/Sydney', 'Sydney'],
      ['Pacific/Auckland', 'Auckland'],
    ],
  ],
];

// "America/Argentina/Buenos_Aires" reads as "Buenos Aires, Argentina".
export const placeOf = (zone: string) => ZONES.flatMap(([, list]) => list).find(([name]) => name === zone)?.[1] ?? (zone.split('/').slice(1).reverse().join(', ').replaceAll('_', ' ') || zone);

// The zone's offset from UTC right now, like "UTC+1" or "UTC+5:30".
export const offsetOf = (zone: string, now: number) => {
  try {
    const offset = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value;
    return offset ? offset.replace('GMT', 'UTC') : '';
  } catch {
    return '';
  }
};