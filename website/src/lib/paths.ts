// The app's addresses. Each one is a real page on reload, see public/sensors/.htaccess and public/sources/.htaccess.
export const sensorPath = (id: number, metric?: string) => `/sensors/${id}/${metric ? `${encodeURIComponent(metric)}/` : ''}`;

export const dataPath = (id: number, metric: string, date?: string) => `${sensorPath(id, metric)}data/${date ? `${date}/` : ''}`;

export const sourcePath = (id: number) => `/sources/${id}/`;