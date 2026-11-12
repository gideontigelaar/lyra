// The app's addresses. Each one is a real page on reload, see the .htaccess files in public/.
// Summary is a tab of its own: pages opened from it stay in it, so their addresses start with /summary.
export const SUMMARY = '/summary';

// The Summary prefix while in Summary's tab, so links there stay in it.
const tabPrefix = () => (location.pathname === '/' || location.pathname.startsWith(`${SUMMARY}/`) ? SUMMARY : '');

// The page a page opened from Summary goes back to, when there's no page it was opened from.
export const summaryHome = () => (tabPrefix() ? { href: '/', label: 'Summary' } : null);

export const sensorPath = (id: number, metric?: string, prefix = tabPrefix()) => `${prefix}/sensors/${id}/${metric ? `${encodeURIComponent(metric)}/` : ''}`;

export const dataPath = (id: number, metric: string, date?: string) => `${sensorPath(id, metric)}data/${date ? `${date}/` : ''}`;

export const sourcePath = (id: number) => `${tabPrefix()}/sources/${id}/`;

export const averagePath = (metric: string, sensors: number[]) => `${SUMMARY}/average/${encodeURIComponent(metric)}/${sensors.join('-')}/`;

export const batteriesPath = (sensors: number[]) => `${SUMMARY}/batteries/${sensors.join('-')}/`;