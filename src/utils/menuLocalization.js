import { supportedLngs } from '../i18n';

const DEFAULT_LOCALE = 'en';
const SUPPORTED = new Set(['en', 'ar', 'it']);

function normalizeLocale(locale) {
  if (!locale) return DEFAULT_LOCALE;
  const base = String(locale).split('-')[0].toLowerCase();
  if (SUPPORTED.has(base)) return base;
  if (supportedLngs && supportedLngs.includes(base)) return base;
  return DEFAULT_LOCALE;
}

function getTranslations(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) return null;
  if (typeof obj !== 'object') return null;
  if (obj.translations && typeof obj.translations === 'object') {
    return obj.translations;
  }
  return null;
}

function readTranslation(translations, locale, field) {
  if (!translations || !field) return null;
  const key = field;
  if (translations[locale] && typeof translations[locale] === 'object') {
    const val = translations[locale][key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  // Also support nested shapes like { name: { en: '...', ar: '...' } }
  if (translations[key] && typeof translations[key] === 'object') {
    const val = translations[key][locale];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}

export function getLocalizedProductName(product, locale) {
  const loc = normalizeLocale(locale);
  const translations = getTranslations(product);
  const t = readTranslation(translations, loc, 'name');
  if (t) return t;
  if (loc !== DEFAULT_LOCALE) {
    const tEn = readTranslation(translations, DEFAULT_LOCALE, 'name');
    if (tEn) return tEn;
  }
  return String(product?.name || '').trim();
}

export function getLocalizedProductDescription(product, locale) {
  const loc = normalizeLocale(locale);
  const translations = getTranslations(product);
  const t = readTranslation(translations, loc, 'description');
  if (t) return t;
  if (loc !== DEFAULT_LOCALE) {
    const tEn = readTranslation(translations, DEFAULT_LOCALE, 'description');
    if (tEn) return tEn;
  }
  return String(product?.description || '').trim();
}

export function getLocalizedCategoryName(category, locale) {
  const loc = normalizeLocale(locale);
  const translations = getTranslations(category);
  const t = readTranslation(translations, loc, 'name');
  if (t) return t;
  if (loc !== DEFAULT_LOCALE) {
    const tEn = readTranslation(translations, DEFAULT_LOCALE, 'name');
    if (tEn) return tEn;
  }
  return String(category?.name || '').trim();
}

export function getLocalizedOptionName(option, locale) {
  const loc = normalizeLocale(locale);
  const translations = getTranslations(option);
  const t = readTranslation(translations, loc, 'name');
  if (t) return t;
  if (loc !== DEFAULT_LOCALE) {
    const tEn = readTranslation(translations, DEFAULT_LOCALE, 'name');
    if (tEn) return tEn;
  }
  return String(option?.name || option?.label || '').trim();
}

export function getLocalizedOptionDescription(option, locale) {
  const loc = normalizeLocale(locale);
  const translations = getTranslations(option);
  const t = readTranslation(translations, loc, 'description');
  if (t) return t;
  if (loc !== DEFAULT_LOCALE) {
    const tEn = readTranslation(translations, DEFAULT_LOCALE, 'description');
    if (tEn) return tEn;
  }
  return String(option?.description || '').trim();
}

export function normalizeTranslations(input) {
  const out = {};
  const locales = ['en', 'ar', 'it'];
  for (const loc of locales) {
    const src = input && typeof input === 'object' ? input[loc] : null;
    const name = typeof src?.name === 'string' ? src.name.trim() : '';
    const description = typeof src?.description === 'string' ? src.description.trim() : '';
    if (name || description) {
      out[loc] = {};
      if (name) out[loc].name = name;
      if (description) out[loc].description = description;
    }
  }
  return Object.keys(out).length ? out : null;
}

export function normalizeCategoryTranslations(input) {
  const out = {};
  const locales = ['en', 'ar', 'it'];
  for (const loc of locales) {
    const src = input && typeof input === 'object' ? input[loc] : null;
    const name = typeof src?.name === 'string' ? src.name.trim() : '';
    if (name) {
      out[loc] = { name };
    }
  }
  return Object.keys(out).length ? out : null;
}

export function normalizeOptionTranslations(input) {
  const out = {};
  const locales = ['en', 'ar', 'it'];
  for (const loc of locales) {
    const src = input && typeof input === 'object' ? input[loc] : null;
    const name = typeof src?.name === 'string' ? src.name.trim() : '';
    const description = typeof src?.description === 'string' ? src.description.trim() : '';
    if (name || description) {
      out[loc] = {};
      if (name) out[loc].name = name;
      if (description) out[loc].description = description;
    }
  }
  return Object.keys(out).length ? out : null;
}

export function stripEmptyTranslations(translations) {
  if (!translations || typeof translations !== 'object') return null;
  const cleaned = normalizeTranslations(translations);
  return cleaned;
}

export default {
  getLocalizedProductName,
  getLocalizedProductDescription,
  getLocalizedCategoryName,
  getLocalizedOptionName,
  getLocalizedOptionDescription,
  normalizeTranslations,
  normalizeCategoryTranslations,
  normalizeOptionTranslations,
};
