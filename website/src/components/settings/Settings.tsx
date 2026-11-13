import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { browserName } from '../../lib/browsers';
import { formatDate, timeAgo } from '../../lib/format';
import { failure, useLoad } from '../../lib/load';
import { passkeyError, passkeysSupported, registerPasskey, signOut } from '../../lib/passkeys';
import { endDemo, forgetSignIn } from '../../lib/session';
import { type UserSettings, loadSettings, saveSettings } from '../../lib/settings';
import type { Passkey, Session } from '../../lib/types';
import { inlineSelect, rowDangerButton } from '../../lib/ui';
import { showNotice } from '../../lib/toast';
import { TEMPERATURE_UNITS } from '../../lib/units';
import { browserZone } from '../../lib/zone';
import { ZONES, offsetOf, placeOf } from '../../lib/zones';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Row, Section } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';
import Segmented from '../ui/Segmented';
import TextDialog from '../ui/TextDialog';

const THEMES = ['auto', 'light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

const storedTheme = (): Theme => {
  try {
    const theme = localStorage.getItem('theme');
    return theme === 'light' || theme === 'dark' ? theme : 'auto';
  } catch {
    return 'auto';
  }
};

// The short list of time zones with their current offset. A saved zone that isn't on it stays pickable.
const zoneGroups = (saved: string | null, now: number) => {
  const groups = ZONES.map(([region, list]) => [region, list.map(([zone, place]) => ({ zone, label: `${place} (${offsetOf(zone, now)})` }))] as const);
  const listed = ZONES.some(([, list]) => list.some(([zone]) => zone === saved));
  return saved && !listed ? [...groups, ['Saved', [{ zone: saved, label: `${placeOf(saved)} (${offsetOf(saved, now)})` }]] as const] : groups;
};

export default function Settings() {
  const { data, error, reload } = useLoad(() => Promise.all([api<{ passkeys: Passkey[] }>('/passkeys'), loadSettings(), api<{ sessions: Session[] }>('/sessions')]));
  const [theme, setTheme] = useState(storedTheme);
  const [changes, setChanges] = useState<Partial<UserSettings>>({});
  const [ending, setEnding] = useState<Session | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Passkey | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const now = Date.now();

  const changeTheme = (next: Theme) => {
    setTheme(next);

    try {
      next === 'auto' ? localStorage.removeItem('theme') : localStorage.setItem('theme', next);
    } catch {}

    window.dispatchEvent(new Event('themechange'));
  };

  const change = async (next: Partial<UserSettings>) => {
    const before = { ...data![1], ...changes };
    setChanges((current) => ({ ...current, ...next }));
    setActionError(null);

    try {
      await saveSettings(next);
    } catch (e) {
      setChanges((current) => ({ ...current, ...Object.fromEntries(Object.keys(next).map((key) => [key, before[key as keyof UserSettings]])) }));
      setActionError(failure(e));
    }
  };

  const add = async (name: string) => {
    setActionError(null);

    try {
      await registerPasskey(name);
      showNotice(`Added ${name}`);
      reload();
    } catch (e) {
      failure(e);
      setActionError(passkeyError(e));
    }

    setAdding(false);
  };

  const remove = async (passkey: Passkey) => {
    setBusy(true);

    try {
      await api(`/passkeys/${passkey.id}`, 'DELETE');

      if (passkey.current) {
        forgetSignIn();
        location.assign('/login/');
        return;
      }

      setRemoving(null);
      showNotice(`Removed ${passkey.name}`);
      reload();
    } catch (e) {
      setActionError(failure(e));
    }

    setBusy(false);
  };

  const endSession = async (session: Session) => {
    setBusy(true);
    setActionError(null);

    try {
      await api(`/sessions/${session.id}`, 'DELETE');
      setEnding(null);
      showNotice(`Signed out ${browserName(session.user_agent)}`);
      reload();
    } catch (e) {
      setActionError(failure(e));
    }

    setBusy(false);
  };

  const settings = data && { ...data[1], ...changes };
  const savedZone = settings?.time_zone ?? null;
  const zones = useMemo(() => zoneGroups(savedZone, Date.now()), [savedZone]);

  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Display" footer={`Automatic follows this device's time zone, ${placeOf(browserZone())}.`}>
        <Row
          label="Appearance"
          trailing={<Segmented compact label="Appearance" options={THEMES} value={theme} onChange={changeTheme} text={(value) => ({ auto: 'Automatic', light: 'Light', dark: 'Dark' })[value]} />}
        />
        <Row
          label="Temperature"
          trailing={
            settings && (
              <Segmented
                compact
                label="Temperature unit"
                options={TEMPERATURE_UNITS}
                value={settings.temperature_unit}
                onChange={(temperature_unit) => change({ temperature_unit })}
                text={(value) => ({ celsius: '°C', fahrenheit: '°F' })[value]}
              />
            )
          }
        />
        <Row
          label="Time Zone"
          trailing={
            settings && (
              <select aria-label="Time zone" className={inlineSelect} value={settings.time_zone ?? ''} onChange={(event) => change({ time_zone: event.target.value || null })}>
                <option value="">Automatic</option>
                {zones.map(([area, list]) => (
                  <optgroup key={area} label={area}>
                    {list.map(({ zone, label }) => (
                      <option key={zone} value={zone}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )
          }
        />
      </Section>
      <div className="mt-8">
        <Message error={error ?? actionError} loading={!data} />
      </div>
      {data && (
        <Section title="Passkeys">
          {data[0].passkeys.map((passkey) => (
            <Row
              key={passkey.id}
              label={
                <>
                  <span className="block truncate">{passkey.name}</span>
                  <span className="block truncate text-footnote text-muted">
                    {passkey.current ? 'Used to sign in here' : passkey.last_used_at ? `Used ${timeAgo(passkey.last_used_at, now)}` : 'Never used'} · added{' '}
                    {formatDate(Date.parse(passkey.created_at), 'date')}
                  </span>
                </>
              }
              trailing={
                <span title={data[0].passkeys.length === 1 ? "The last passkey can't be removed" : undefined}>
                  <button type="button" className={rowDangerButton} disabled={data[0].passkeys.length === 1} onClick={() => setRemoving(passkey)}>
                    Remove
                  </button>
                </span>
              }
            />
          ))}
          <Row label={<span className="text-accent">Add Passkey…</span>} onClick={() => setAdding(true)} disabled={!passkeysSupported()} />
        </Section>
      )}
      {data && (
        <Section title="Sessions">
          {data[2].sessions.map((session) => (
            <Row
              key={session.id}
              label={
                <>
                  <span className="block truncate">{browserName(session.user_agent)}</span>
                  <span className="block truncate text-footnote text-muted">
                    {session.current ? 'This browser' : `Active ${timeAgo(session.last_used_at, now)}`} · {session.passkey} passkey · since {formatDate(Date.parse(session.created_at), 'day')}
                  </span>
                </>
              }
              trailing={
                !session.current && (
                  <button type="button" aria-label={`Sign out ${browserName(session.user_agent)}`} className={rowDangerButton} onClick={() => setEnding(session)}>
                    Sign Out
                  </button>
                )
              }
            />
          ))}
        </Section>
      )}
      <Section>
        <Row label="Sign Out" danger onClick={() => signOut().finally(() => (forgetSignIn(), endDemo(), location.assign('/login/')))} />
      </Section>
      <TextDialog open={adding} title="Add Passkey" label="Name" value="" onClose={() => setAdding(false)} onSave={add} />
      <ConfirmDialog open={removing !== null} title={`Remove ${removing?.name}?`} confirm="Remove" busy={busy} onClose={() => setRemoving(null)} onConfirm={() => removing && remove(removing)}>
        {removing?.current ? "You signed in here with this passkey, so you're signed out here too." : "It can't be used to sign in anymore."}
      </ConfirmDialog>
      <ConfirmDialog
        open={ending !== null}
        title={`Sign out ${ending ? browserName(ending.user_agent) : ''}?`}
        confirm="Sign Out"
        busy={busy}
        onClose={() => setEnding(null)}
        onConfirm={() => ending && endSession(ending)}
      >
        It's signed out on that device straight away. Signing in there again takes a passkey.
      </ConfirmDialog>
    </>
  );
}