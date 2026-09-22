import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'pizza-theme';

const ThemeContext = createContext(null);

function resolveSystemTheme() {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  ) {
    return 'light';
  }
  return 'dark';
}

function applyDocumentTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#f6f1ea' : '#0d0b0a');
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // The <head> script already chose and set data-theme before paint; honour
    // it so the provider never causes a theme flip on first mount.
    if (typeof document !== 'undefined') {
      const current = document.documentElement.getAttribute('data-theme');
      if (current === 'light' || current === 'dark') return current;
    }
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      /* storage unavailable */
    }
    if (saved === 'light' || saved === 'dark') return saved;
    return resolveSystemTheme();
  });

  useEffect(() => {
    applyDocumentTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {
      /* storage unavailable */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  // Safe default so components that render outside the provider (tests, etc.)
  // never crash — they simply get a static dark theme value.
  if (!context) return { theme: 'dark', toggleTheme: () => {} };
  return context;
}