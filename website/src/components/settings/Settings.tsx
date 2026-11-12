import { useState } from 'react';
import { api } from '../../lib/api';
import { browserName } from '../../lib/browsers';
import { formatDate, timeAgo } from '../../lib/format';
import { failure, useLoad } from '../../lib/load';
import { passkeyError, passkeysSupported, registerPasskey, signOut } from '../../lib/passkeys';
import { endDemo, forgetSignIn } from '../../lib/session';
import { type UserSettings, loadSettings, saveSettings } from '../../lib/settings';
import type { Passkey, Session } from '../../lib/types';
import { inlineSelect, textButton } from '../../lib/ui';
import { TEMPERATURE_UNITS } from '../../lib/units';
import { browserZone } from '../../lib/zone';
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

const zoneName = (zone: string) => zone.replaceAll('_', ' ');

const zoneList = (saved: string | null) => [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone'), ...(saved ? [saved] : [])])].sort();

export default function Settings() {
  const { data, error, reload } = useLoad(() => Promise.all([api<{ passkeys: Passkey[] }>('/passkeys'), loadSettings(), api<{ sessions: Session[] }>('/sessions')]));
  const [theme, setTheme] = useState(storedTheme);
  const [changes, setChanges] = useState<Partial<UserSettings>>({});
  const [ending, setEnding] = useState<number | null>(null);
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
      reload();
    } catch (e) {
      setActionError(failure(e));
    }

    setBusy(false);
  };

  const endSession = async (session: Session) => {
    setEnding(session.id);
    setActionError(null);

    try {
      await api(`/sessions/${session.id}`, 'DELETE');
      reload();
    } catch (e) {
      setActionError(failure(e));
    }

    setEnding(null);
  };

  const settings = data && { ...data[1], ...changes };

  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Display" footer={`Automatic follows this device's time zone, ${zoneName(browserZone())}.`}>
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
                {zoneList(settings.time_zone).map((zone) => (
                  <option key={zone} value={zone}>
                    {zoneName(zone)}
                  </option>
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
                  <span className="block truncate text-[13px] text-muted">
                    {passkey.current ? 'This device' : passkey.last_used_at ? `Used ${timeAgo(passkey.last_used_at, now)}` : 'Never used'} · added {formatDate(Date.parse(passkey.created_at), 'date')}
                  </span>
                </>
              }
              trailing={
                <span title={data[0].passkeys.length === 1 ? "The last passkey can't be removed" : undefined}>
                  <button type="button" className={`${textButton} text-[15px] text-danger`} disabled={data[0].passkeys.length === 1} onClick={() => setRemoving(passkey)}>
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
        <Section title="Sessions" footer="Signing out a session ends it on that device straight away.">
          {data[2].sessions.map((session) => (
            <Row
              key={session.id}
              label={
                <>
                  <span className="block truncate">{browserName(session.user_agent)}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {session.current ? 'This browser' : `Active ${timeAgo(session.last_used_at, now)}`} · {session.passkey} passkey · since {formatDate(Date.parse(session.created_at), 'day')}
                  </span>
                </>
              }
              trailing={
                !session.current && (
                  <button type="button" className={`${textButton} text-[15px] text-danger`} disabled={ending !== null} onClick={() => endSession(session)}>
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
        {removing?.current ? 'You signed in with this passkey, so this device is signed out.' : "It can't be used to sign in anymore."}
      </ConfirmDialog>
    </>
  );
}