// Scripts that must run before the first paint. They're inlined into pages, and astro.config.mjs adds their hashes to the CSP.
export const themeScript = `(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const apply = () => {
    let theme = null;
    try {
      theme = localStorage.getItem('theme');
    } catch {}
    const dark = theme === 'dark' || (theme !== 'light' && media.matches);
    root.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#060c1d' : '#eef1f8');
  };
  // A later change crossfades the whole page at once, with the colour transitions of single elements paused so nothing changes on its own.
  const change = () => {
    if (!document.startViewTransition) {
      apply();
      return;
    }
    root.classList.add('[&_*]:transition-none!');
    document.startViewTransition(apply).finished.finally(() => root.classList.remove('[&_*]:transition-none!'));
  };
  apply();
  media.addEventListener('change', change);
  window.addEventListener('themechange', change);
})();`;

export const signInScript = `(() => {
  let signedIn = false;
  try {
    signedIn = localStorage.getItem('signed-in') === '1' || sessionStorage.getItem('demo') === '1';
  } catch {}
  if (!signedIn) location.replace('/login/');
})();`;