// Errors float above the page as alerts instead of sitting in it. Plain DOM, so the sign-in pages can use it too.
// The holder is a manual popover in the top layer. A modal dialog makes everything outside it inert, so while one is open the holder moves into it.
const SHOW_MS = 6000;
const FADE_MS = 200;

let holder: HTMLDivElement | null = null;

const show = (box: HTMLDivElement) => {
  // Showing it again puts it above a dialog opened since.
  if (box.matches(':popover-open')) {
    box.hidePopover();
  }

  box.showPopover();
};

const holderElement = () => {
  if (!holder) {
    holder = document.createElement('div');
    holder.popover = 'manual';
    holder.className =
      'pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] bottom-auto m-0 flex w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-4';
  }

  const parent = [...document.querySelectorAll('dialog')].filter((dialog) => dialog.matches(':modal')).at(-1) ?? document.body;

  if (holder.parentElement !== parent) {
    parent.append(holder);
  }

  show(holder);
  return holder;
};

// Alerts shown inside a dialog stay up when it closes.
export const releaseAlerts = (dialog: HTMLDialogElement) => {
  if (holder && dialog.contains(holder)) {
    document.body.append(holder);

    if (holder.children.length) {
      show(holder);
    }
  }
};

const sentence = (text: string) => {
  const trimmed = text.trim();
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

export const showError = (message: string) => {
  const box = holderElement();
  const text = sentence(message);

  // The same error twice stays one alert.
  if ([...box.children].some((item) => item.textContent?.startsWith(text))) {
    return;
  }

  const item = document.createElement('div');
  item.setAttribute('role', 'alert');
  item.className =
    'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl bg-surface py-3 pr-2 pl-4 text-[15px] shadow-xl ring-1 ring-line transition duration-200 ease-out starting:-translate-y-2 starting:opacity-0 dark:bg-navy-800 dark:ring-navy-700';

  const dot = document.createElement('span');
  dot.className = 'mt-1.5 size-2.5 shrink-0 rounded-full bg-danger';
  const body = document.createElement('span');
  body.className = 'min-w-0 flex-1 py-0.5';
  body.textContent = text;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'shrink-0 rounded-full px-2 py-0.5 text-[15px] font-semibold text-accent transition-opacity hover:opacity-70';
  close.textContent = 'OK';

  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    item.classList.add('-translate-y-2', 'opacity-0');
    setTimeout(() => {
      item.remove();

      if (!box.children.length) {
        box.hidePopover();
      }
    }, FADE_MS);
  };

  close.addEventListener('click', dismiss);
  item.append(dot, body, close);
  box.append(item);
  timer = window.setTimeout(dismiss, SHOW_MS);
};