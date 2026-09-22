import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons';
import { updateRestaurant } from '../../services/restaurantService';
import { useToast } from '../../context/ToastContext';
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
    if (!form.name.trim()) next.name = 'Restaurant name is required.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    ['taxRate', 'minOrder', 'deliveryFee', 'freeDeliveryThreshold'].forEach((key) => {
      const value = Number(form[key]);
      if (Number.isNaN(value) || value < 0) next[key] = 'Enter a number of 0 or more.';
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (saving || !restaurant) return;
    if (!validate()) return;

    setSaving(true);
    try {
      const updated = updateRestaurant(restaurant.id, {
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
        showToast('Restaurant settings saved.');
        reloadRestaurant();
      } else {
        showToast('Could not save settings.', 'error');
      }
    } catch (err) {
      showToast('Could not save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-overview">
      <SectionTitle
        title="Restaurant Settings"
        subtitle="How your restaurant appears to customers and how orders are priced."
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
              <h3>Identity</h3>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>Restaurant name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => update({ name: event.target.value })}
                  maxLength={80}
                />
                {errors.name && <small className="admin-field-error">{errors.name}</small>}
              </label>
              <label className="admin-field">
                <span>Tagline</span>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(event) => update({ tagline: event.target.value })}
                  maxLength={120}
                />
              </label>
              <label className="admin-field admin-field--full">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) => update({ description: event.target.value })}
                  maxLength={400}
                />
              </label>

              <div className="admin-field">
                <ImagePicker
                  label="Logo"
                  value={form.logo}
                  onChange={(url) => update({ logo: url })}
                  path="branding/logo"
                  aspect="square"
                />
              </div>
              <div className="admin-field">
                <ImagePicker
                  label="Cover image"
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
              <h3>Contact & Location</h3>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>Phone</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => update({ phone: event.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => update({ email: event.target.value })}
                />
                {errors.email && <small className="admin-field-error">{errors.email}</small>}
              </label>
              <label className="admin-field admin-field--full">
                <span>Address</span>
                <input
                  type="text"
                  value={form.address}
                  onChange={(event) => update({ address: event.target.value })}
                />
              </label>
              <label className="admin-field admin-field--full">
                <span>Opening hours</span>
                <input
                  type="text"
                  value={form.openingHours}
                  onChange={(event) => update({ openingHours: event.target.value })}
                  placeholder="Daily · 11:00 – 23:00"
                />
              </label>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>Ordering & Delivery</h3>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>Currency symbol</span>
                <input
                  type="text"
                  value={form.currency}
                  onChange={(event) => update({ currency: event.target.value })}
                  maxLength={4}
                />
              </label>
              <label className="admin-field">
                <span>Tax rate (%)</span>
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
                <span>Minimum order</span>
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
                <span>Delivery fee</span>
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
                <span>Free delivery over</span>
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
                  <span>Offer delivery (customers can still choose pickup)</span>
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
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default AdminSettings;
