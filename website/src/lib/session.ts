// The session cookie belongs to the API and is HttpOnly, so pages keep a hint to skip straight to sign-in when it's missing.
const SIGNED_IN = 'signed-in';

export const rememberSignIn = () => {
  try {
    localStorage.setItem(SIGNED_IN, '1');
  } catch {}
};

export const forgetSignIn = () => {
  try {
    localStorage.removeItem(SIGNED_IN);
  } catch {}
};