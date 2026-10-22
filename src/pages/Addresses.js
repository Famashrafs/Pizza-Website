import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getSavedAddresses,
  saveSavedAddresses,
} from '../services/storage';

function Addresses() {
  const { t } = useTranslation();
  const { currentUser, userProfile, updateProfileData } = useAuth();
  const { showToast } = useToast();
  const uid = currentUser.uid;

  const [list, setList] = useState(() => getSavedAddresses(uid));
  const [form, setForm] = useState({ label: '', street: '', city: '', zip: '' });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAdd = (e) => {
    e.preventDefault();
    const address = `${form.street}, ${form.city}${form.zip ? ` ${form.zip}` : ''}`;
    const newAddress = {
      id: `addr-${Date.now()}`,
      label: form.label || 'Other',
      address,
      isDefault: list.length === 0,
    };
    const next = [...list, newAddress];
    setList(next);
    saveSavedAddresses(uid, next);
    setForm({ label: '', street: '', city: '', zip: '' });
    showToast(t('account.toastAddressAdded'));
  };

  const handleSetDefault = (id) => {
    const next = list.map((addr) => ({
      ...addr,
      isDefault: addr.id === id,
    }));
    setList(next);
    saveSavedAddresses(uid, next);
    const chosen = next.find((addr) => addr.id === id);
    updateProfileData({ address: chosen.address });
    showToast(t('account.toastDefaultAddressUpdated'));
  };

  const handleRemove = (id) => {
    const next = list.filter((addr) => addr.id !== id);
    setList(next);
    saveSavedAddresses(uid, next);
    if (next.length > 0 && !next.some((addr) => addr.isDefault)) {
      next[0].isDefault = true;
      saveSavedAddresses(uid, next);
      updateProfileData({ address: next[0].address });
    }
    showToast(t('account.toastAddressRemoved'));
  };

  const defaultAddress = userProfile?.address;

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">{t('account.savedAddressesPageTitle')}</h1>
      </div>
      <div className="cart-container">
        <div className="address-form-card">
          <h2>{t('account.addNewAddress')}</h2>
          <form className="auth-form" onSubmit={handleAdd}>
            <input
              type="text"
              name="label"
              placeholder={t('account.labelPlaceholder')}
              value={form.label}
              onChange={handleChange}
            />
            <input
              type="text"
              name="street"
              placeholder={t('account.streetAddress')}
              value={form.street}
              onChange={handleChange}
              required
            />
            <input
              type="text"
              name="city"
              placeholder={t('account.city')}
              value={form.city}
              onChange={handleChange}
              required
            />
            <input
              type="text"
              name="zip"
              placeholder={t('account.zipCodeOptional')}
              value={form.zip}
              onChange={handleChange}
            />
            <button type="submit" className="contact-btn">
              {t('account.addAddress')}
            </button>
          </form>
        </div>

        <div className="address-list">
          {list.length === 0 ? (
            <div className="auth-card empty-cart">
              <h2>{t('account.noSavedAddressesTitle')}</h2>
              <p className="auth-subtitle">
                {t('account.noSavedAddressesText')}
              </p>
            </div>
          ) : (
            list.map((addr) => (
              <div className="order-card" key={addr.id}>
                <div className="order-head">
                  <h4>
                    {addr.label}
                    {addr.isDefault && (
                      <span className="address-badge">
                        {t('account.defaultBadge')}
                      </span>
                    )}
                  </h4>
                  <p>{addr.address}</p>
                </div>
                <div className="profile-actions">
                  {!addr.isDefault &&
                    addr.address !== defaultAddress && (
                      <button
                        type="button"
                        className="menu-btn"
                        onClick={() => handleSetDefault(addr.id)}
                      >
                        {t('account.setAsDefault')}
                      </button>
                    )}
                  <button
                    type="button"
                    className="cart-remove"
                    onClick={() => handleRemove(addr.id)}
                  >
                    {t('common.actions.remove')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default Addresses;
