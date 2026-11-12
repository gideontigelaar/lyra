import { BroadcastIcon, GearSixIcon, type Icon, SquaresFourIcon, ThermometerSimpleIcon } from '@phosphor-icons/react';
import { type ComponentType, useEffect } from 'react';
import { useLoad } from '../lib/load';
import { type Params, navigate, useLocation } from '../lib/router';
import { endDemo, isDemo } from '../lib/session';
import { loadSettings } from '../lib/settings';
import { appear, iconButton } from '../lib/ui';
import DataPage from './sensors/DataPage';
import SensorList from './sensors/SensorList';
import SensorPage from './sensors/SensorPage';
import Settings from './settings/Settings';
import SourceList from './sources/SourceList';
import SourcePage from './sources/SourcePage';
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
  View: ComponentType<{ params: Params }>;
  // Changing only the chosen value of a sensor keeps its page.
  page?: (params: Params) => string;
}

const ROUTES: Route[] = [
  { path: /^\/$/, title: 'Summary', tab: 'summary', wide: true, View: Summary },
  { path: /^\/sensors\/$/, title: 'Sensors', tab: 'sensors', View: SensorList },
  { path: /^\/sensors\/(?<id>\d+)\/(?:(?<metric>[\w-]+)\/)?$/, title: 'Sensor', tab: 'sensors', View: SensorPage, page: ({ id }) => `sensor:${id}` },
  { path: /^\/sensors\/(?<id>\d+)\/(?<metric>[\w-]+)\/data\/(?:(?<date>\d{4}-\d{2}-\d{2})\/)?$/, title: 'All Recorded Data', tab: 'sensors', View: DataPage },
  { path: /^\/sources\/$/, title: 'Sources', tab: 'sources', View: SourceList },
  { path: /^\/sources\/(?<id>\d+)\/$/, title: 'Source', tab: 'sources', View: SourcePage },
  { path: /^\/settings\/$/, title: 'Settings', View: Settings },
];

const withSlash = (pathname: string) => (pathname.endsWith('/') ? pathname : `${pathname}/`);

const findRoute = (pathname: string) => {
  for (const route of ROUTES) {
    const match = withSlash(pathname).match(route.path);

    if (match) {
      return { route, params: { ...match.groups } as Params };
    }
  }

  return null;
};

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
          href={href}
          aria-current={id === current ? 'page' : undefined}
          className={`flex items-center rounded-full font-semibold transition duration-200 ease-out aria-[current=page]:bg-fill aria-[current=page]:text-accent ${
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
  const params = found?.params ?? {};
  // Dates follow the account's time zone, so pages wait for the settings.
  const settings = useLoad(loadSettings);

  useEffect(() => {
    document.title = `${route?.title ?? 'Not found'} · Lyra`;
  }, [route]);

  useEffect(() => {
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;

      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) {
        return;
      }

      const url = new URL(link.href);

      if (url.origin === location.origin && findRoute(url.pathname)) {
        event.preventDefault();

        if (url.pathname + url.search !== location.pathname + location.search) {
          navigate(url.pathname + url.search);
        }
      }
    };

    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, []);

  return (
    <>
      {isDemo() && (
        <div className="bg-accent px-4 py-1.5 text-center text-[13px] font-semibold text-white dark:text-navy-950">
          Demo with sample data. Changes reset upon reload.{' '}
          <a href="/login/" onClick={endDemo} className="underline underline-offset-2">
            Exit demo
          </a>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" className="rounded-md" aria-label="Summary">
            <Wordmark className="h-5 w-auto" />
          </a>
          <Tabs current={route?.tab} />
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
      <main key={route?.page?.(params) ?? path} className={`mx-auto w-full px-4 pt-4 pb-32 sm:px-6 sm:pt-6 md:pb-16 ${appear} ${route?.wide ? 'max-w-4xl' : 'max-w-3xl'}`}>
        {!route ? <NotFound /> : settings.data ? <route.View params={params} /> : <Message error={settings.error} loading />}
      </main>
      <Tabs current={route?.tab} bottom />
    </>
  );
}