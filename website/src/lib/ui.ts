export const card = 'rounded-2xl border border-line/70 bg-surface';

export const group = 'overflow-hidden rounded-2xl border border-line/70 bg-surface';

export const row = 'flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left';

export const pressable = 'transition duration-200 ease-out hover:bg-fill/60 active:bg-fill focus-visible:bg-fill/60 focus-visible:outline-none';

// Buttons sit side by side at the end of a dialog, or wide ones span a sheet or form. Each class is complete, so nothing overrides it.
const button = 'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-opacity disabled:pointer-events-none disabled:opacity-50';
const small = 'px-4 py-2 text-sm';
const wide = 'w-full px-4 py-3 text-body';
const primary = 'bg-accent text-white hover:opacity-90 dark:text-navy-950';
const secondary = 'bg-fill hover:opacity-80';
const danger = 'bg-danger text-white hover:opacity-90 dark:text-navy-950';

export const primaryButton = `${button} ${small} ${primary}`;

export const secondaryButton = `${button} ${small} ${secondary}`;

export const dangerButton = `${button} ${small} ${danger}`;

export const widePrimaryButton = `${button} ${wide} ${primary}`;

export const wideSecondaryButton = `${button} ${wide} ${secondary}`;

const text = 'rounded-full px-2 py-1 font-semibold transition-opacity hover:opacity-70 disabled:pointer-events-none disabled:opacity-40';

export const textButton = `${text} text-body text-accent`;

export const dangerTextButton = `${text} text-body text-danger`;

// A smaller one at the end of a row, like Remove next to a passkey.
export const rowDangerButton = `${text} text-subheadline text-danger`;

export const iconButton =
  'inline-flex items-center justify-center rounded-full p-2 text-muted transition-colors hover:bg-fill hover:text-navy-950 disabled:pointer-events-none disabled:opacity-40 dark:hover:text-navy-50';

export const input = 'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-body outline-none transition-colors placeholder:text-muted focus:border-accent';

export const sectionTitle = 'text-xs font-semibold tracking-wider text-muted uppercase';

export const appear = 'transition duration-300 ease-out starting:translate-y-1 starting:opacity-0';

export const inlineSelect = 'max-w-40 truncate rounded-lg bg-transparent py-1 text-right text-body text-muted outline-none focus-visible:ring-2 focus-visible:ring-accent';

export const label = 'mb-1.5 block text-sm font-semibold text-muted';

// Text in place of content that isn't there, like an empty list.
export const placeholder = 'px-1 text-subheadline text-muted';