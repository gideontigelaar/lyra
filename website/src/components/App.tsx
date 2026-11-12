import { BroadcastIcon, GearSixIcon, type Icon, SquaresFourIcon, ThermometerSimpleIcon } from '@phosphor-icons/react';
import { type ComponentType, useEffect } from 'react';
import { useLoad } from '../lib/load';
import { SUMMARY } from '../lib/paths';
import { type Params, type Trail, navigate, pageState, useLocation } from '../lib/router';
import { endDemo, isDemo } from '../lib/session';
import { loadSettings } from '../lib/settings';
import { appear, iconButton } from '../lib/ui';
import DataPage from './sensors/DataPage';
import SensorList from './sensors/SensorList';
import SensorPage from './sensors/SensorPage';
import Settings from './settings/Settings';
import SourceList from './sources/SourceList';
import SourcePage from './sources/SourcePage';
import AveragePage from './summary/AveragePage';
import BatteriesPage from './summary/BatteriesPage';
import Summary from './summary/Summary';
import Message from './ui/Message';
import PageHeader from './ui/PageHeader';
import Wordmark from './Wordmark';

type Tab = 'summary' | 'sensors' | 'sources';

interface Route {
  path: RegExp;
  title: string;
  tab?: Tab;
  wide?: boolean;
  // Shared pages also open in Summary, under /summary. Summary's own pages only open there.
  shared?: boolean;
  summary?: boolean;
  View: ComponentType<{ params: Params }>;
  // Changing only the chosen value of a sensor keeps its page.
  page?: (params: Params) => string;
}

const ROUTES: Route[] = [
  { path: /^\/$/, title: 'Summary', tab: 'summary', wide: true, shared: true, View: Summary },
  { path: /^\/average\/(?<metric>[\w-]+)\/(?<sensors>\d+(?:-\d+)*)\/$/, title: 'Average', summary: true, View: AveragePage },
  { path: /^\/batteries\/(?<sensors>\d+(?:-\d+)*)\/$/, title: 'Batteries', summary: true, View: BatteriesPage },
  { path: /^\/sensors\/$/, title: 'Sensors', tab: 'sensors', View: SensorList },
  { path: /^\/sensors\/(?<id>\d+)\/(?:(?<metric>[\w-]+)\/)?$/, title: 'Sensor', tab: 'sensors', shared: true, View: SensorPage, page: ({ id }) => `sensor:${id}` },
  { path: /^\/sensors\/(?<id>\d+)\/(?<metric>[\w-]+)\/data\/(?:(?<date>\d{4}-\d{2}-\d{2})\/)?$/, title: 'All Recorded Data', tab: 'sensors', shared: true, View: DataPage },
  { path: /^\/sources\/$/, title: 'Sources', tab: 'sources', View: SourceList },
  { path: /^\/sources\/(?<id>\d+)\/$/, title: 'Source', tab: 'sources', shared: true, View: SourcePage },
  { path: /^\/settings\/$/, title: 'Settings', View: Settings },
];

const withSlash = (pathname: string) => (pathname.endsWith('/') ? pathname : `${pathname}/`);

const findRoute = (pathname: string) => {
  const inSummary = pathname.startsWith(`${SUMMARY}/`);
  const rest = inSummary ? pathname.slice(SUMMARY.length) : pathname;

  for (const route of ROUTES) {
    const match = (inSummary ? route.shared || route.summary : !route.summary) && withSlash(rest).match(route.path);

    if (match) {
      return { route, params: { ...match.groups } as Params, tab: inSummary ? ('summary' as const) : route.tab };
    }
  }

  return null;
};

// Each tab opens on the page it was left on. It's only kept in memory, so loading the page again starts every tab afresh. Popups don't count, only pages.
const memory: Partial<Record<Tab, { href: string; trail: Trail[] }>> = {};

function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <p className="text-[17px] text-muted">This page doesn't exist.</p>
    </>
  );
}

const TABS: { id: Tab; label: string; href: string; Icon: Icon }[] = [
  { id: 'summary', label: 'Summary', href: '/', Icon: SquaresFourIcon },
  { id: 'sensors', label: 'Sensors', href: '/sensors/', Icon: ThermometerSimpleIcon },
  { id: 'sources', label: 'Sources', href: '/sources/', Icon: BroadcastIcon },
];

const ROOTS = new Set(['/', '/sensors/', '/sources/']);

// A tab goes where it was left, or to its first page when it's the tab you're in.
const tabHref = (tab: Tab, href: string, current?: Tab) => {
  const saved = memory[tab]?.href;
  return tab !== current && saved ? saved : href;
};

function Tabs({ current, bottom = false }: { current?: Tab; bottom?: boolean }) {
  return (
    <nav
      aria-label="Main"
      className={`rounded-full border border-line/70 bg-surface/80 p-1 shadow-lg shadow-navy-950/5 backdrop-blur-xl ${
        bottom ? 'fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mx-auto flex w-fit md:hidden' : 'hidden md:flex'
      }`}
    >
      {TABS.map(({ id, label, href, Icon }) => (
        <a
          key={id}
          href={tabHref(id, href, current)}
          data-tab={id}
          aria-current={id === current ? 'page' : undefined}
          className={`flex items-center rounded-full font-semibold transition duration-200 ease-out aria-[current=page]:bg-accent/10 aria-[current=page]:text-accent ${
            bottom ? 'min-w-20 flex-col gap-0.5 px-4 py-1.5 text-[11px]' : 'gap-2 px-4 py-1.5 text-sm'
          }`}
        >
          <Icon weight="fill" className={bottom ? 'size-6' : 'size-5'} aria-hidden="true" />
          {label}
        </a>
      ))}
    </nav>
  );
}

export default function App() {
  const path = useLocation();
  const { pathname } = new URL(path, location.origin);
  const found = findRoute(pathname);
  const route = found?.route;
  const tab = found?.tab;
  const params = found?.params ?? {};
  // Dates follow the account's time zone, so pages wait for the settings.
  const settings = useLoad(loadSettings);

  useEffect(() => {
    document.title = `${route?.title ?? 'Not found'} · Lyra`;
  }, [route]);

  useEffect(() => {
    if (pathname === `${SUMMARY}/`) {
      navigate('/', pageState(), true);
    } else if (tab) {
      memory[tab] = { href: path, trail: pageState().trail };
    }
  }, [path]);

  useEffect(() => {
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;

      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) {
        return;
      }

      const url = new URL(link.href);
      const target = url.origin === location.origin ? findRoute(url.pathname) : null;

      if (!target) {
        return;
      }

      event.preventDefault();
      const href = url.pathname + url.search;
      const here = findRoute(location.pathname);

      if (link.dataset.tab) {
        const saved = memory[target.tab!];
        href !== location.pathname + location.search && navigate(href, { trail: href === saved?.href ? saved.trail : [] });
        return;
      }

      if (href === location.pathname + location.search) {
        return;
      }

      // Within a tab, the page you're on goes on the trail, so Back returns to it. A link to a page on the trail goes back up to it.
      const { trail } = pageState();
      const above = trail.findIndex((item) => item.href === href);

      if (!here?.tab || target.tab !== here.tab || ROOTS.has(href)) {
        navigate(href);
      } else if (above >= 0) {
        navigate(href, { trail: trail.slice(0, above) });
      } else {
        const title = document.querySelector('main h1')?.textContent?.trim() || here.route.title;
        navigate(href, { trail: [...trail, { href: location.pathname + location.search, title }], pushed: true });
      }
    };

    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, []);

  return (
    <>
      {/* The demo banner stays in view with the header. */}
      <div className="sticky top-0 z-20">
        {isDemo() && (
          <aside aria-label="Demo" className="bg-accent px-4 py-1.5 text-center text-[13px] font-semibold text-white dark:text-navy-950">
            Demo with sample data. Changes reset upon reload.{' '}
            <a href="/login/" onClick={endDemo} className="underline underline-offset-2">
              Exit demo
            </a>
          </aside>
        )}
        <header className="border-b border-line/60 bg-bg/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
            <a href="/" className="rounded-md" aria-label="Summary">
              <Wordmark className="h-5 w-auto" />
            </a>
            <Tabs current={tab} />
            <a
              href="/settings/"
              className={`${iconButton} aria-[current=page]:bg-fill aria-[current=page]:text-accent`}
              aria-label="Settings"
              aria-current={pathname === '/settings/' ? 'page' : undefined}
            >
              <GearSixIcon weight="fill" className="size-6" aria-hidden="true" />
            </a>
          </div>
        </header>
      </div>
      <main key={`${tab}:${route?.page?.(params) ?? path}`} className={`mx-auto w-full px-4 pt-4 pb-32 sm:px-6 sm:pt-6 md:pb-16 ${appear} ${route?.wide ? 'max-w-4xl' : 'max-w-3xl'}`}>
        {!route ? <NotFound /> : settings.data ? <route.View params={params} /> : <Message error={settings.error} loading />}
      </main>
      <Tabs current={tab} bottom />
    </>
  );
}