import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

const SHOWN_MS = 2000;

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Without clipboard access the text stays on screen to copy by hand.
      return;
    }

    setCopied(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), SHOWN_MS);
  };

  return { copied, copy };
}

const LAYER = 'col-start-1 row-start-1 transition duration-200 ease-out';

// The text, with "Copied" fading in over it for a moment after copying.
export function CopyText({ text, copied, accent = true, className = '' }: { text: string; copied: boolean; accent?: boolean; className?: string }) {
  return (
    <span className={`grid ${className}`}>
      <span className={`${LAYER} ${copied ? 'opacity-0' : ''}`}>{text}</span>
      <span aria-hidden="true" className={`${LAYER} place-self-center font-sans font-semibold ${accent ? 'text-accent' : ''} ${copied ? '' : 'opacity-0'}`}>
        Copied
      </span>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </span>
  );
}

// A copy icon that turns into a check after copying.
export function CopyMark({ copied }: { copied: boolean }) {
  return (
    <span className="grid size-4 shrink-0" aria-hidden="true">
      <CopyIcon weight="bold" className={`${LAYER} size-4 ${copied ? 'scale-50 opacity-0' : ''}`} />
      <CheckIcon weight="bold" className={`${LAYER} size-4 text-(--status-good) ${copied ? '' : 'scale-50 opacity-0'}`} />
    </span>
  );
}