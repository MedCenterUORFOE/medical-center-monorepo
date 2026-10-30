'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

const THEME_STORAGE_KEY = 'medical-center-theme';

export default function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const shouldUseLightTheme = savedTheme === 'light';
    setIsLight(shouldUseLightTheme);
    document.documentElement.classList.toggle('light-mode', shouldUseLightTheme);
  }, []);

  const toggleTheme = () => {
    const nextIsLight = !isLight;
    setIsLight(nextIsLight);
    document.documentElement.classList.toggle('light-mode', nextIsLight);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextIsLight ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className="theme-toggle fixed bottom-5 right-5 z-[100] flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/90 text-amber-300 shadow-lg backdrop-blur transition duration-200 hover:scale-105 hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
    >
      {isLight ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
}
