const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|OPiOS\//, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Macintosh/, 'Mac'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

const find = (list: [RegExp, string][], agent: string) => list.find(([pattern]) => pattern.test(agent))?.[1];

export const browserName = (agent: string | null) => {
  const browser = agent ? find(BROWSERS, agent) : undefined;
  const system = agent ? find(SYSTEMS, agent) : undefined;
  return browser && system ? `${browser} on ${system}` : browser || system || 'Unknown browser';
};