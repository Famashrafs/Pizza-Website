import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons';
import { updateRestaurant } from '../../services/restaurantService';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';
import SectionTitle from '../../components/account/SectionTitle';
import AdminErrorState from '../../components/admin/AdminErrorState';
import ImagePicker from '../../components/admin/ImagePicker';

const emptyForm = {
  name: '',
  tagline: '',
  description: '',
  phone: '',
  email: '',
  address: '',
  openingHours: '',
  currency: '$',
  taxRate: '0',
  minOrder: '0',
  deliveryEnabled: true,
  deliveryFee: '0',
  freeDeliveryThreshold: '0',
  logo: '',
  coverImage: '',
};

function toForm(restaurant) {
  if (!restaurant) return { ...emptyForm };
  const taxRate =
    restaurant.taxRate != null ? (Number(restaurant.taxRate) * 100).toString() : '0';
  return {
    name: restaurant.name || '',
    tagline: restaurant.tagline || '',
    description: restaurant.description || '',
    phone: restaurant.phone || '',
    email: restaurant.email || '',
    address: restaurant.address || '',
    openingHours: restaurant.openingHours || '',
    currency: restaurant.currency || '$',
    taxRate,
    minOrder: restaurant.minOrder != null ? String(restaurant.minOrder) : '0',
    deliveryEnabled: restaurant.deliveryEnabled !== false,
    deliveryFee:
      restaurant.deliveryFee != null ? String(restaurant.deliveryFee) : '0',
    freeDeliveryThreshold:
      restaurant.freeDeliveryThreshold != null
        ? String(restaurant.freeDeliveryThreshold)
        : '0',
    logo: restaurant.logo || '',
    coverImage: restaurant.coverImage || '',
  };
}

function SettingsSkeleton() {
  return (
    <div className="admin-panel">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="admin-skeleton-chip"
          style={{ height: 46, width: i % 2 === 0 ? '100%' : '70%', marginBottom: 14 }}
        />
      ))}
    </div>
  );
}

function AdminSettings() {
  const { t } = useTranslation();
  const { restaurant, restaurantLoading, restaurantError, reloadRestaurant } =
    useOutletContext();
  const { showToast } = useToast();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toForm(restaurant));
  }, [restaurant]);

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = t('admin.errorRestaurantNameRequired');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = t('admin.errorInvalidEmail');
    }
    ['taxRate', 'minOrder', 'deliveryFee', 'freeDeliveryThreshold'].forEach((key) => {
      const value = Number(form[key]);
      if (Number.isNaN(value) || value < 0) next[key] = t('admin.errorNumberMinZero');
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving || !restaurant) return;
    if (!validate()) return;

    setSaving(true);
    try {
      const updated = await updateRestaurant(restaurant.id, {
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        description: form.description.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        openingHours: form.openingHours.trim(),
        currency: form.currency.trim() || '$',
        taxRate: Number(form.taxRate) / 100,
        minOrder: Number(form.minOrder),
        deliveryEnabled: form.deliveryEnabled,
        deliveryFee: Number(form.deliveryFee),
        freeDeliveryThreshold: Number(form.freeDeliveryThreshold),
        logo: form.logo,
        coverImage: form.coverImage,
      });
      if (updated) {
        showToast(t('admin.toastSettingsSaved'));
        reloadRestaurant();
      } else {
        showToast(t('admin.errorSaveSettings'), 'error');
      }
    } catch (err) {
      showToast(t('admin.errorSaveSettings'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-overview">
      <SectionTitle
        title={t('admin.restaurantSettings')}
        subtitle={t('admin.settingsSubtitle')}
      />

      {restaurantLoading && !restaurant && <SettingsSkeleton />}

      {restaurantError && !restaurant && (
        <div className="admin-panel">
          <AdminErrorState message={restaurantError} onRetry={reloadRestaurant} />
        </div>
      )}

      {restaurant && (
        <form className="admin-form" onSubmit={handleSubmit} noValidate>
          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>{t('admin.settingsIdentity')}</h3>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{t('admin.fieldRestaurantName')}</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => update({ name: event.target.value })}
                  maxLength={80}
                />
                {errors.name && <small className="admin-field-error">{errors.name}</small>}
              </label>
              <label className="admin-field">
                <span>{t('admin.fieldTagline')}</span>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(event) => update({ tagline: event.target.value })}
                  maxLength={120}
                />
              </label>
              <label className="admin-field admin-field--full">
                <span>{t('admin.fieldDescription')}</span>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) => update({ description: event.target.value })}
                  maxLength={400}
                />
              </label>

              <div className="admin-field">
                <ImagePicker
                  label={t('admin.fieldLogo')}
                  value={form.logo}
                  onChange={(url) => update({ logo: url })}
                  path="branding/logo"
                  aspect="square"
                />
              </div>
              <div className="admin-field">
                <ImagePicker
                  label={t('admin.fieldCoverImage')}
                  value={form.coverImage}
                  onChange={(url) => update({ coverImage: url })}
                  path="branding/cover"
                  aspect="wide"
                />
              </div>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>{t('admin.settingsContact')}</h3>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{t('admin.colPhone')}</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => update({ phone: event.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>{t('admin.colEmail')}</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => update({ email: event.target.value })}
                />
                {errors.email && <small className="admin-field-error">{errors.email}</small>}
              </label>
              <label className="admin-field admin-field--full">
                <span>{t('admin.colAddress')}</span>
                <input
                  type="text"
                  value={form.address}
                  onChange={(event) => update({ address: event.target.value })}
                />
              </label>
              <label className="admin-field admin-field--full">
                <span>{t('admin.fieldOpeningHours')}</span>
                <input
                  type="text"
                  value={form.openingHours}
                  onChange={(event) => update({ openingHours: event.target.value })}
                  placeholder={t('admin.phOpeningHours')}
                />
              </label>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>{t('admin.settingsOrdering')}</h3>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{t('admin.fieldCurrencySymbol')}</span>
                <input
                  type="text"
                  value={form.currency}
                  onChange={(event) => update({ currency: event.target.value })}
                  maxLength={4}
                />
              </label>
              <label className="admin-field">
                <span>{t('admin.fieldTaxRate')}</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.taxRate}
                  onChange={(event) => update({ taxRate: event.target.value })}
                />
                {errors.taxRate && <small className="admin-field-error">{errors.taxRate}</small>}
              </label>
              <label className="admin-field">
                <span>{t('admin.fieldMinOrder')}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minOrder}
                  onChange={(event) => update({ minOrder: event.target.value })}
                />
                {errors.minOrder && <small className="admin-field-error">{errors.minOrder}</small>}
              </label>
              <label className="admin-field">
                <span>{t('admin.fieldDeliveryFee')}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.deliveryFee}
                  onChange={(event) => update({ deliveryFee: event.target.value })}
                />
                {errors.deliveryFee && (
                  <small className="admin-field-error">{errors.deliveryFee}</small>
                )}
              </label>
              <label className="admin-field">
                <span>{t('admin.fieldFreeDeliveryOver')}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.freeDeliveryThreshold}
                  onChange={(event) => update({ freeDeliveryThreshold: event.target.value })}
                />
                {errors.freeDeliveryThreshold && (
                  <small className="admin-field-error">{errors.freeDeliveryThreshold}</small>
                )}
              </label>
              <div className="admin-field admin-field--full">
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={form.deliveryEnabled}
                    onChange={(event) => update({ deliveryEnabled: event.target.checked })}
                  />
                  <span>{t('admin.fieldOfferDelivery')}</span>
                </label>
              </div>
            </div>
          </section>

          <div className="admin-form-actions">
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={saving}
            >
              <FontAwesomeIcon icon={faFloppyDisk} />
              {saving ? t('admin.saving') : t('admin.saveSettings')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default AdminSettings;
