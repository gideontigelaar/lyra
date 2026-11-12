import { api } from './api';

export const passkeysSupported = () => typeof PublicKeyCredential !== 'undefined' && 'parseRequestOptionsFromJSON' in PublicKeyCredential;

export const signIn = async () => {
  const options = await api<PublicKeyCredentialRequestOptionsJSON>('/auth/options', 'POST');
  const credential = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options) });
  await api('/auth/login', 'POST', (credential as PublicKeyCredential).toJSON());
};

export const signOut = () => api('/auth/logout', 'POST');

export const registerPasskey = async (name: string, setupCode?: string) => {
  const auth = setupCode ? { setup_code: setupCode } : {};
  const options = await api<PublicKeyCredentialCreationOptionsJSON>('/passkeys/options', 'POST', auth);
  const credential = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options) });
  await api('/passkeys', 'POST', { ...auth, name, credential: (credential as PublicKeyCredential).toJSON() });
};

export const passkeyError = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'The passkey prompt was closed or timed out.';
  }

  if (error instanceof DOMException && error.name === 'InvalidStateError') {
    return 'This device already has a passkey here.';
  }

  return error instanceof Error ? `Something went wrong: ${error.message}.` : 'Something went wrong.';
};