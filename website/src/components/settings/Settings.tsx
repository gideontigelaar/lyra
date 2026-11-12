import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDate, timeAgo } from '../../lib/format';
import { failure, useLoad } from '../../lib/load';
import { passkeyError, passkeysSupported, registerPasskey, signOut } from '../../lib/passkeys';
import type { Passkey } from '../../lib/types';
import { endDemo, forgetSignIn } from '../../lib/session';
import { textButton } from '../../lib/ui';
import { TEMPERATURE_UNITS, type TemperatureUnit, loadSettings } from '../../lib/units';
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

export default function Settings() {
  const { data, error, reload } = useLoad(() => Promise.all([api<{ passkeys: Passkey[] }>('/passkeys'), loadSettings()]));
  const [theme, setTheme] = useState(storedTheme);
  const [temperature, setTemperature] = useState<TemperatureUnit | null>(null);
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

  const changeTemperature = async (next: TemperatureUnit) => {
    const previous = temperature;
    setTemperature(next);
    setActionError(null);

    try {
      await api('/settings', 'PATCH', { temperature_unit: next });
    } catch (e) {
      setTemperature(previous);
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

  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Display">
        <Row
          label="Appearance"
          trailing={<Segmented compact label="Appearance" options={THEMES} value={theme} onChange={changeTheme} text={(value) => ({ auto: 'Automatic', light: 'Light', dark: 'Dark' })[value]} />}
        />
        <Row
          label="Temperature"
          trailing={
            data && (
              <Segmented
                compact
                label="Temperature unit"
                options={TEMPERATURE_UNITS}
                value={temperature ?? data[1].temperature_unit}
                onChange={changeTemperature}
                text={(value) => ({ celsius: '°C', fahrenheit: '°F' })[value]}
              />
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