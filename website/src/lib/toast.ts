// Errors and confirmations float above the page as alerts instead of sitting in it. Plain DOM, so the sign-in pages can use it too.
// The holder is a manual popover in the top layer. A modal dialog makes everything outside it inert, so while one is open the holder moves into it.
const FADE_MS = 200;
// At most 2 alerts show, newest on top. Another one pushes out the oldest.
const MAX_ALERTS = 2;

const KINDS = {
  error: {
    role: 'alert',
    ms: 6000,
    color: 'text-danger',
    icon: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm-8,56a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm8,104a12,12,0,1,1,12-12A12,12,0,0,1,128,184Z',
  },
  notice: {
    role: 'status',
    ms: 3000,
    color: 'text-good',
    icon: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z',
  },
};

let holder: HTMLDivElement | null = null;
// How each alert that's still showing goes away.
const dismissals = new Map<Element, () => void>();

// Moving the holder closes it, so it opens again where it lands. An open holder stays as it is, so its alerts don't appear a second time.
const place = (box: HTMLDivElement, parent: Element) => {
  if (box.parentElement !== parent) {
    parent.append(box);
  }

  if (!box.matches(':popover-open')) {
    box.showPopover();
  }
};

const holderElement = () => {
  if (!holder) {
    holder = document.createElement('div');
    holder.popover = 'manual';
    holder.className =
      'pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] bottom-auto m-0 flex w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-4';
  }

  place(holder, [...document.querySelectorAll('dialog')].filter((dialog) => dialog.matches(':modal')).at(-1) ?? document.body);
  return holder;
};

// Alerts shown inside a dialog stay up when it closes.
export const releaseAlerts = (dialog: HTMLDialogElement) => {
  if (holder && dialog.contains(holder)) {
    if (holder.children.length) {
      place(holder, document.body);
    } else {
      document.body.append(holder);
    }
  }
};

const sentence = (text: string) => {
  const trimmed = text.trim();
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

const show = (kind: keyof typeof KINDS, message: string) => {
  const { role, ms, color, icon } = KINDS[kind];
  const text = sentence(message);

  const box = holderElement();
  const item = document.createElement('div');
  item.setAttribute('role', role);
  item.className =
    'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl bg-surface py-3 pr-2 pl-3.5 text-subheadline/6 shadow-xl ring-1 ring-line transition duration-200 ease-out starting:-translate-y-2 starting:opacity-0 dark:bg-navy-800 dark:ring-navy-700';

  // The icon box is as tall as the first line of text, so the icon sits in its middle.
  const mark = document.createElement('span');
  mark.className = `flex h-7 shrink-0 items-center ${color}`;
  mark.innerHTML = `<svg viewBox="0 0 256 256" fill="currentColor" class="size-5" aria-hidden="true"><path d="${icon}"/></svg>`;
  const body = document.createElement('span');
  body.className = 'min-w-0 flex-1 py-0.5';
  body.textContent = text;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'shrink-0 rounded-full px-2 py-0.5 font-semibold text-accent transition-opacity hover:opacity-70';
  close.textContent = 'OK';

  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    dismissals.delete(item);
    item.classList.add('-translate-y-2', 'opacity-0');
    setTimeout(() => {
      item.remove();

      if (!box.children.length) {
        box.hidePopover();
      }
    }, FADE_MS);
  };

  close.addEventListener('click', dismiss);
  item.append(mark, body, close);
  // The same message again replaces the one showing, and the oldest go once there are too many.
  [...dismissals.keys()].filter((other) => other.textContent?.startsWith(text)).forEach((other) => dismissals.get(other)?.());
  const showing = [...dismissals.keys()];
  showing.slice(0, Math.max(0, showing.length - MAX_ALERTS + 1)).forEach((other) => dismissals.get(other)?.());
  dismissals.set(item, dismiss);
  box.prepend(item);
  // Once in, an alert doesn't slide in again when the holder moves into or out of a dialog.
  setTimeout(() => item.classList.remove('starting:-translate-y-2', 'starting:opacity-0'), FADE_MS);
  timer = window.setTimeout(dismiss, ms);
};

export const showError = (message: string) => show('error', message);

// A short confirmation of something that's done, like a copy or a removal.
export const showNotice = (message: string) => show('notice', message);