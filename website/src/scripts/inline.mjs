// Scripts that must run before the first paint. They're inlined into pages, and astro.config.mjs adds their hashes to the CSP.
export const themeScript = `(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    let theme = null;
    try {
      theme = localStorage.getItem('theme');
    } catch {}
    const dark = theme === 'dark' || (theme !== 'light' && media.matches);
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#060c1d' : '#eef1f8');
  };
  apply();
  media.addEventListener('change', apply);
  window.addEventListener('themechange', apply);
})();`;

export const signInScript = `(() => {
  let signedIn = false;
  try {
    signedIn = localStorage.getItem('signed-in') === '1';
  } catch {}
  if (!signedIn) location.replace('/login/');
})();`;