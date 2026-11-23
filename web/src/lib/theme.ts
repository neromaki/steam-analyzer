// Light/dark theme: follows the system until the user picks one; the choice is remembered
// in this browser only. index.html applies the saved choice before first paint.
import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'theme';

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(c: ThemeChoice) {
  if (c === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = c;
}

function systemDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(read);
  const [sysDark, setSysDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = () => setSysDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => apply(choice), [choice]);

  const dark = choice === 'system' ? sysDark : choice === 'dark';
  const toggle = useCallback(() => {
    const next: ThemeChoice = dark ? 'light' : 'dark';
    setChoice(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
  }, [dark]);

  return { dark, toggle };
}
