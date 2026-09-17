import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faBell, faLanguage } from '@fortawesome/free-solid-svg-icons';
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
    showToast('Preferences saved.');
  };

  return (
    <div className="dash-section">
      <SectionTitle
        title="Settings"
        subtitle="Notification and in-app preferences"
      />

      <div className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faBell} /> Notifications
          </h3>
        </div>
        <p className="dash-card-sub">
          Choose what you want to be notified about. These preferences reflect
          what this app can deliver today.
        </p>
        <div className="dash-toggle-list">
          <Toggle
            label="Order updates"
            description="Delivery and pickup status changes"
            checked={prefs.notifications.orderUpdates}
            onChange={(v) => handleChange('notifications', { orderUpdates: v })}
          />
          <Toggle
            label="Email receipts and summaries"
            description="Sent to your account email"
            checked={prefs.notifications.email}
            onChange={(v) => handleChange('notifications', { email: v })}
          />
          <Toggle
            label="Promotional offers"
            description="Special deals and discounts"
            checked={prefs.notifications.promotions}
            onChange={(v) => handleChange('notifications', { promotions: v })}
          />
          {account.emailVerified && (
            <Toggle
              label="Weekly offers digest"
              description="A weekly roundup of new offers"
              checked={prefs.notifications.offers}
              onChange={(v) => handleChange('notifications', { offers: v })}
            />
          )}
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faGear} /> Privacy
          </h3>
        </div>
        <div className="dash-toggle-list">
          <Toggle
            label="Share usage data"
            description="Help us improve by sharing anonymous usage data"
            checked={prefs.privacy.shareUsageData}
            onChange={(v) => handleChange('privacy', { shareUsageData: v })}
          />
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faLanguage} /> Language
          </h3>
        </div>
        <p className="dash-card-sub">
          The storefront currently ships in English only.
        </p>
        <div className="dash-field">
          <select
            value={prefs.language}
            onChange={(event) => handleChange('language', event.target.value)}
            aria-label="Preferred language"
          >
            <option value="en">English</option>
            <option value="ar" disabled>
              العربية (coming soon)
            </option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;