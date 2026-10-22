import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faBell, faLanguage } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import SectionTitle from '../../components/account/SectionTitle';
import {
  getPreferences,
  updatePreferences,
  DEFAULT_PREFERENCES,
} from '../../services/accountService';

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="dash-toggle-row">
      <span className="dash-toggle-text">
        <span className="dash-toggle-label">{label}</span>
        {description && (
          <span className="dash-toggle-desc">{description}</span>
        )}
      </span>
      <input
        type="checkbox"
        className="dash-switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="dash-switch-slider" aria-hidden="true" />
    </label>
  );
}

function SettingsPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { account } = useOutletContext();
  const uid = currentUser?.uid;

  const [prefs, setPrefs] = useState(() =>
    uid ? getPreferences(uid) : { ...DEFAULT_PREFERENCES }
  );

  const handleChange = (field, value) => {
    setPrefs((prev) => {
      const next =
        field === 'notifications' || field === 'privacy'
          ? { ...prev, [field]: { ...prev[field], ...value } }
          : { ...prev, [field]: value };
      if (uid) updatePreferences(uid, next);
      return next;
    });
    showToast(t('account.toastPreferencesSaved'));
  };

  return (
    <div className="dash-section">
      <SectionTitle
        title={t('account.navSettings')}
        subtitle={t('account.settingsSubtitle')}
      />

      <div className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faBell} /> {t('account.notificationsTitle')}
          </h3>
        </div>
        <p className="dash-card-sub">{t('account.notificationsInfo')}</p>
        <div className="dash-toggle-list">
          <Toggle
            label={t('account.prefOrderUpdates')}
            description={t('account.prefOrderUpdatesDesc')}
            checked={prefs.notifications.orderUpdates}
            onChange={(v) => handleChange('notifications', { orderUpdates: v })}
          />
          <Toggle
            label={t('account.prefEmail')}
            description={t('account.prefEmailDesc')}
            checked={prefs.notifications.email}
            onChange={(v) => handleChange('notifications', { email: v })}
          />
          <Toggle
            label={t('account.prefPromotions')}
            description={t('account.prefPromotionsDesc')}
            checked={prefs.notifications.promotions}
            onChange={(v) => handleChange('notifications', { promotions: v })}
          />
          {account.emailVerified && (
            <Toggle
              label={t('account.prefOffers')}
              description={t('account.prefOffersDesc')}
              checked={prefs.notifications.offers}
              onChange={(v) => handleChange('notifications', { offers: v })}
            />
          )}
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faGear} /> {t('account.privacyTitle')}
          </h3>
        </div>
        <div className="dash-toggle-list">
          <Toggle
            label={t('account.prefShareUsage')}
            description={t('account.prefShareUsageDesc')}
            checked={prefs.privacy.shareUsageData}
            onChange={(v) => handleChange('privacy', { shareUsageData: v })}
          />
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faLanguage} /> {t('account.languageTitle')}
          </h3>
        </div>
        <p className="dash-card-sub">{t('account.languageNote')}</p>
        <div className="dash-field">
          <select
            value={prefs.language}
            onChange={(event) => handleChange('language', event.target.value)}
            aria-label={t('account.preferredLanguageAria')}
          >
            <option value="en">{t('account.languageEnglish')}</option>
            <option value="ar" disabled>
              {t('account.languageArabicComingSoon')}
            </option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
