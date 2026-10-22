import React from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n';

// Accessible language switcher. A native <select> keeps it keyboard and screen
// reader friendly, and the language names are shown in their own language
// (English / العربية / Italiano) so they stay recognizable.
function LanguageSelector({ className = '' }) {
  const { t, i18n } = useTranslation();
  const label = t('nav.language.label');

  return (
    <div className={`language-selector${className ? ` ${className}` : ''}`}>
      <label className="visually-hidden" htmlFor="language-selector">
        {label}
      </label>
      <select
        id="language-selector"
        className="language-select"
        value={i18n.language}
        onChange={(event) => i18n.changeLanguage(event.target.value)}
        aria-label={label}
        title={label}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default LanguageSelector;
