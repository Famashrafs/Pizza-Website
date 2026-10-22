// Application internationalization (i18n).
//
// Languages: English (default + fallback), Arabic (RTL), Italian.
//
// - The active language is persisted in localStorage under `pizza-language`
//   (the same preference mechanism the theme already uses) so a refresh keeps
//   the choice.
// - The language is resolved and applied BEFORE the first render (the module
//   is imported by src/index.js before ReactDOM.createRoot(...).render), so the
//   interface never flashes the wrong language.
// - `<html lang>` and `<html dir>` are kept in sync with the active language
//   so assistive technology and CSS logical properties behave correctly.
//
// Resources are plain JSON files under ./locales/<language>/<feature>.json,
// grouped by feature so a translation file stays reviewable.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en';
import ar from './locales/ar';
import it from './locales/it';

export const LANGUAGE_STORAGE_KEY = 'pizza-language';

export const DEFAULT_LANGUAGE = 'en';

// The language names are shown in their own language (the standard way to
// present a language switcher) and are therefore never translated.
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'it', label: 'Italiano' },
];

export const RTL_LANGUAGES = ['ar'];

export function isSupportedLanguage(code) {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code);
}

export function isRtlLanguage(code) {
  return RTL_LANGUAGES.includes(code);
}

export function getDirection(code) {
  return isRtlLanguage(code) ? 'rtl' : 'ltr';
}

// Reads the persisted preference. Falls back to English when the stored value
// is missing or unknown (e.g. a language removed in a later release).
export function readStoredLanguage() {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && isSupportedLanguage(stored)) return stored;
  } catch (_) {
    /* storage unavailable (private mode, SSR, tests without DOM) */
  }
  return DEFAULT_LANGUAGE;
}

export function storeLanguage(code) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch (_) {
    /* storage unavailable */
  }
}

// Keeps the document language/direction in sync with the active language.
// `dir` drives the whole RTL layout through CSS logical properties and the
// [dir="rtl"] overrides in src/rtl.css.
export function applyDocumentLanguage(code) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.setAttribute('lang', code);
  document.documentElement.setAttribute('dir', getDirection(code));
}

i18n.use(initReactI18next).init({
  resources: { en, ar, it },
  lng: readStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: ['en', 'ar', 'it'],
  load: 'languageOnly',
  // Namespaces are addressed with a dot: t('menu.title') -> namespace "menu",
  // key "title". The namespace list has to contain every feature namespace,
  // otherwise the first segment is treated as part of the key.
  ns: ['common', 'nav', 'home', 'menu', 'cart', 'checkout', 'auth', 'account', 'orders', 'admin'],
  defaultNS: 'common',
  nsSeparator: '.',
  keySeparator: '.',
  // React escapes interpolated values by itself.
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

i18n.on('languageChanged', (code) => {
  applyDocumentLanguage(code);
  storeLanguage(code);
});

applyDocumentLanguage(i18n.language);

export default i18n;
