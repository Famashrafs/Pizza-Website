// Multilingual menu-content helpers (Phase 4).
//
// Firestore keeps the default (English) content in the existing fields:
//   product.name / product.description / product.category
//   sizes[].label / crusts[].label / toppings[].name
//   category.name
//
// Per-locale overrides live in additive maps so documents written before this
// feature keep working unchanged:
//   product.translations.ar = {
//     name, description,
//     sizes: { 'size-small': 'صغير' },
//     crusts: { 'crust-thin': 'رقيق' },
//     toppings: { 'topping-cheese': 'جبنة إضافية' },
//   }
//   product.categoryTranslations.ar = { name }
//   category.translations.ar = { name }
//
// The storefront reads these helpers and falls back to the default content when
// a translation is missing. Nothing here changes ids, prices, option identity
// or the denormalized `category` value used for filtering.

export const DEFAULT_CONTENT_LANGUAGE = 'en';
export const TRANSLATED_CONTENT_LANGUAGES = ['ar', 'it'];

const OPTION_SECTIONS = ['sizes', 'crusts', 'toppings'];

const clean = (value) => String(value ?? '').trim();

const isObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Resolves "ar-EG" -> "ar" so callers can pass the raw i18n language.
export function contentLocale(language) {
  return String(language || DEFAULT_CONTENT_LANGUAGE).split('-')[0];
}

const optionField = (section) => (section === 'toppings' ? 'name' : 'label');

function normalizeOptionMap(value) {
  const out = {};
  if (!isObject(value)) return out;
  Object.entries(value).forEach(([id, label]) => {
    const key = clean(id);
    const text = clean(label);
    if (key && text) out[key] = text;
  });
  return out;
}

function hasOptionSections(entry) {
  return OPTION_SECTIONS.some(
    (section) => isObject(entry[section]) && Object.keys(entry[section]).length > 0
  );
}

// Sanitizes a stored/submitted product translation map. Empty values are
// dropped: a missing translation is the signal to fall back to English.
export function normalizeTranslations(raw) {
  const out = {};
  if (!isObject(raw)) return out;
  TRANSLATED_CONTENT_LANGUAGES.forEach((locale) => {
    const entry = raw[locale];
    if (!isObject(entry)) return;
    const next = {};
    const name = clean(entry.name);
    const description = clean(entry.description);
    if (name) next.name = name;
    if (description) next.description = description;
    OPTION_SECTIONS.forEach((section) => {
      const map = normalizeOptionMap(entry[section]);
      if (Object.keys(map).length) next[section] = map;
    });
    if (next.name || next.description || hasOptionSections(next)) {
      out[locale] = next;
    }
  });
  return out;
}

export function normalizeCategoryTranslations(raw) {
  const out = {};
  if (!isObject(raw)) return out;
  TRANSLATED_CONTENT_LANGUAGES.forEach((locale) => {
    const name = clean(raw[locale]?.name);
    if (name) out[locale] = { name };
  });
  return out;
}

// Deep-merges a submitted translation map into the stored one, so saving one
// language never discards another. An explicitly empty value removes that
// translation (which makes the storefront fall back to English again).
export function mergeTranslations(existing, patch) {
  const base = normalizeTranslations(existing);
  if (!isObject(patch)) return base;

  TRANSLATED_CONTENT_LANGUAGES.forEach((locale) => {
    if (patch[locale] === undefined) return;
    if (!isObject(patch[locale])) {
      delete base[locale];
      return;
    }
    const incoming = patch[locale];
    const target = { ...(base[locale] || {}) };

    if (incoming.name !== undefined) target.name = clean(incoming.name);
    if (incoming.description !== undefined) {
      target.description = clean(incoming.description);
    }

    OPTION_SECTIONS.forEach((section) => {
      if (incoming[section] === undefined) return;
      const merged = { ...(target[section] || {}) };
      Object.entries(isObject(incoming[section]) ? incoming[section] : {}).forEach(
        ([id, label]) => {
          const key = clean(id);
          const text = clean(label);
          if (!key) return;
          if (text) merged[key] = text;
          else delete merged[key];
        }
      );
      if (Object.keys(merged).length) target[section] = merged;
      else delete target[section];
    });

    if (target.name || target.description || hasOptionSections(target)) {
      base[locale] = target;
    } else {
      delete base[locale];
    }
  });

  return normalizeTranslations(base);
}

export function mergeCategoryTranslations(existing, patch) {
  const base = normalizeCategoryTranslations(existing);
  if (!isObject(patch)) return base;
  TRANSLATED_CONTENT_LANGUAGES.forEach((locale) => {
    if (patch[locale] === undefined) return;
    if (!isObject(patch[locale])) {
      delete base[locale];
      return;
    }
    const name = clean(patch[locale].name);
    if (name) base[locale] = { name };
    else delete base[locale];
  });
  return base;
}

// --- Storefront display helpers ---------------------------------------------

export function localizedField(translations, language, field) {
  const locale = contentLocale(language);
  if (locale === DEFAULT_CONTENT_LANGUAGE) return '';
  const entry = isObject(translations) ? translations[locale] : null;
  return isObject(entry) ? clean(entry[field]) : '';
}

export function localizedProductName(product, language) {
  return (
    localizedField(product?.translations, language, 'name') || clean(product?.name)
  );
}

export function localizedProductDescription(product, language) {
  return (
    localizedField(product?.translations, language, 'description') ||
    clean(product?.description)
  );
}

// Category label for a product card/tab. The returned text is display-only;
// never use it as the filter value (that stays `product.category`).
export function localizedProductCategory(product, language) {
  return (
    localizedField(product?.categoryTranslations, language, 'name') ||
    clean(product?.category)
  );
}

export function localizedCategoryName(category, language) {
  return (
    localizedField(category?.translations, language, 'name') ||
    clean(category?.name)
  );
}

// Sizes/crusts store their text in `label`, toppings in `name`, so option
// translations are keyed by option id and read through this helper.
export function localizedOptionLabel(product, section, option, language) {
  if (!option) return '';
  const locale = contentLocale(language);
  const entry =
    locale !== DEFAULT_CONTENT_LANGUAGE && isObject(product?.translations?.[locale])
      ? product.translations[locale]
      : null;
  const map = entry && isObject(entry[section]) ? entry[section] : null;
  const translated = option.id && map ? clean(map[option.id]) : '';
  return translated || clean(option[optionField(section)]);
}

export function hasOptionTranslation(translations, section, id) {
  if (!id) return false;
  return TRANSLATED_CONTENT_LANGUAGES.some((locale) =>
    clean(translations?.[locale]?.[section]?.[id])
  );
}

// Maps the denormalized category name (`Pizza`) to its localized display label
// for the current language. A category is translated as soon as at least one
// product beneath it carries `categoryTranslations`.
export function getCategoryLabels(products, language) {
  const labels = new Map();
  (products || []).forEach((product) => {
    const value = clean(product?.category);
    if (!value) return;
    const translated = localizedField(
      product?.categoryTranslations,
      language,
      'name'
    );
    if (translated) labels.set(value, translated);
    else if (!labels.has(value)) labels.set(value, value);
  });
  return labels;
}
