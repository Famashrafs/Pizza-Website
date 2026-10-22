// Locale-aware formatting helpers.
//
// Rules that this module enforces:
// - The CURRENCY is the restaurant's configured symbol (config/restaurant.js),
//   never one derived from the UI language: Arabic does not imply a different
//   currency, and switching the language must not change any monetary value.
// - Only the DISPLAY of a number/date is localized. The values sent to the API
//   (checkout payloads, totals, order records) stay plain numbers.
//
// Number digits: Arabic is rendered with Latin digits (`ar-u-nu-latn`). That is
// deliberate: prices, quantities and order ids appear next to Latin-only data
// (ids, codes) and mixed digit sets are hard to read inside an RTL line.

import { RESTAURANT_SETTINGS } from '../config/restaurant.js';

// Intl locale per UI language.
const NUMBER_LOCALES = {
  en: 'en',
  it: 'it',
  ar: 'ar-u-nu-latn',
};

const DATE_LOCALES = {
  en: 'en-GB',
  it: 'it-IT',
  ar: 'ar',
};

export function getNumberLocale(language = 'en') {
  return NUMBER_LOCALES[language] || NUMBER_LOCALES.en;
}

export function getDateLocale(language = 'en') {
  return DATE_LOCALES[language] || DATE_LOCALES.en;
}

// A plain number with the locale's grouping/decimal separators.
export function formatNumber(value, language = 'en') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat(getNumberLocale(language)).format(amount);
}

// Money for display only: the restaurant's currency symbol plus a
// locale-formatted amount with two decimals. The numeric value itself is
// never altered.
export function formatMoney(value, language = 'en', currency = RESTAURANT_SETTINGS.currency) {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat(getNumberLocale(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
  return `${currency || ''}${formatted}`;
}

// A date/time for display only. Accepts ISO strings, Date objects and epoch
// numbers; invalid input renders as an empty string.
export function formatDate(value, language = 'en', options = {}) {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(
    getDateLocale(language),
    options.dateStyle ? options : { dateStyle: 'medium', ...options }
  ).format(date);
}

export function formatDateTime(value, language = 'en', options = {}) {
  return formatDate(value, language, {
    dateStyle: 'short',
    timeStyle: 'short',
    ...options,
  });
}

export function formatTime(value, language = 'en', options = {}) {
  return formatDate(value, language, { timeStyle: 'short', ...options });
}
