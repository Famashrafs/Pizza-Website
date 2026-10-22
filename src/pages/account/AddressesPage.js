import React, { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLocationDot,
  faPlus,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import SectionTitle from '../../components/account/SectionTitle';
import AddressCard from '../../components/account/AddressCard';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  getAddresses,
  makeAddressEntry,
  writeAddresses,
  setDefaultAddress,
  removeAddress,
} from '../../services/accountService';

export const EMPTY_ADDRESS_FIELDS = {
  street: '',
  building: '',
  apartment: '',
  floor: '',
  landmark: '',
  city: '',
  phone: '',
};

function AddressFields({ fields, onChange }) {
  const { t } = useTranslation();

  return (
    <>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-street">{t('account.streetAddressRequired')}</label>
        <input
          id="addr-street"
          type="text"
          value={fields.street}
          onChange={(event) => onChange('street', event.target.value)}
          required
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-city">{t('account.cityRequired')}</label>
        <input
          id="addr-city"
          type="text"
          value={fields.city}
          onChange={(event) => onChange('city', event.target.value)}
          required
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-area">{t('account.area')}</label>
        <input
          id="addr-area"
          type="text"
          value={fields.area || ''}
          onChange={(event) => onChange('area', event.target.value)}
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-building">{t('account.building')}</label>
        <input
          id="addr-building"
          type="text"
          value={fields.building}
          onChange={(event) => onChange('building', event.target.value)}
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-apartment">{t('account.apartment')}</label>
        <input
          id="addr-apartment"
          type="text"
          value={fields.apartment}
          onChange={(event) => onChange('apartment', event.target.value)}
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-floor">{t('account.floor')}</label>
        <input
          id="addr-floor"
          type="text"
          value={fields.floor}
          onChange={(event) => onChange('floor', event.target.value)}
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-landmark">{t('account.landmark')}</label>
        <input
          id="addr-landmark"
          type="text"
          value={fields.landmark}
          onChange={(event) => onChange('landmark', event.target.value)}
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-phone">{t('account.phoneNumber')}</label>
        <input
          id="addr-phone"
          type="tel"
          value={fields.phone}
          onChange={(event) => onChange('phone', event.target.value)}
        />
      </div>
    </>
  );
}

function AddressFormModal({ initial, onClose, onSave }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(initial?.label || 'Home');
  const [fields, setFields] = useState(initial?.fields || EMPTY_ADDRESS_FIELDS);
  const [isDefault, setIsDefault] = useState(initial?.isDefault || false);
  const [busy, setBusy] = useState(false);

  const handleFieldChange = (key, value) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!fields.street.trim() || !fields.city.trim()) return;
    setBusy(true);
    onSave(
      makeAddressEntry(fields, { label, isDefault, id: initial?.id }),
      { wasEditing: Boolean(initial) }
    );
    setBusy(false);
  };

  return (
    <div className="modal-overlay confirm-overlay">
      <div
        className="dash-address-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-form-title"
      >
        <h2 id="address-form-title">
          {initial ? t('account.editAddress') : t('account.addNewAddress')}
        </h2>
        <form onSubmit={handleSubmit} className="dash-form">
          <div className="dash-field">
            <label htmlFor="addr-label">{t('account.addressLabel')}</label>
            <input
              id="addr-label"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t('account.addressLabelPlaceholder')}
            />
          </div>
          <div className="dash-field-grid">
            <AddressFields fields={fields} onChange={handleFieldChange} />
          </div>
          <label className="dash-check-field">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            {t('account.setAsDefaultAddress')}
          </label>
          <div className="confirm-actions">
            <button type="button" className="confirm-cancel" onClick={onClose}>
              {t('common.actions.cancel')}
            </button>
            <button type="submit" className="confirm-confirm" disabled={busy}>
              {busy ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> {t('account.saving')}
                </>
              ) : initial ? (
                t('account.saveChanges')
              ) : (
                t('account.addAddress')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddressesPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const uid = currentUser?.uid;

  const [list, setList] = useState(() => (uid ? getAddresses(uid) : []));
  const [editing, setEditing] = useState(null); // null | false | address object
  const [pendingRemoval, setPendingRemoval] = useState(null);

  const hasDefault = useMemo(() => list.some((addr) => addr.isDefault), [list]);

  const handleSave = (entry, { wasEditing }) => {
    const newList = wasEditing
      ? list.map((addr) => {
          if (addr.id !== entry.id) return addr;
          return {
            ...entry,
            isDefault:
              entry.isDefault || (addr.isDefault && !hasDefault),
          };
        })
      : [...list, entry];

    const normalized = newList.map((addr, idx) => ({
      ...addr,
      isDefault: addr.isDefault || (idx === 0 && !hasDefault),
    }));
    const withDefault = normalized.some((addr) => addr.isDefault)
      ? normalized
      : normalized.map((addr, idx) => ({
          ...addr,
          isDefault: idx === 0,
        }));

    writeAddresses(uid, withDefault);
    setList(withDefault);
    setEditing(null);
    showToast(
      wasEditing
        ? t('account.toastAddressUpdated')
        : t('account.toastAddressAdded')
    );
  };

  const handleSetDefault = (id) => {
    const next = setDefaultAddress(uid, id);
    setList(next);
    showToast(t('account.toastDefaultAddressUpdated'));
  };

  const handleRemove = async (address) => {
    setPendingRemoval(null);
    const next = removeAddress(uid, address.id);
    setList(next);
    showToast(t('account.toastAddressRemoved'));
  };

  return (
    <div className="dash-section">
      <SectionTitle
        title={t('account.navAddresses')}
        subtitle={t('account.addressesSubtitle')}
      />
      <div className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faLocationDot} /> {t('account.savedAddresses')}
          </h3>
          <button
            type="button"
            className="menu-btn dash-btn-sm"
            onClick={() => setEditing(false)}
          >
            <FontAwesomeIcon icon={faPlus} /> {t('account.addNewAddress')}
          </button>
        </div>

        {list.length === 0 ? (
          <div className="dash-empty">
            <FontAwesomeIcon icon={faLocationDot} className="dash-empty-icon" />
            <p>{t('account.noSavedAddresses')}</p>
            <button
              type="button"
              className="menu-btn dash-btn-sm"
              onClick={() => setEditing(false)}
            >
              {t('account.addNewAddress')}
            </button>
          </div>
        ) : (
          <div className="dash-address-list">
            {list.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                onEdit={(addr) => setEditing(addr)}
                onSetDefault={handleSetDefault}
                onRemove={(addr) => setPendingRemoval(addr)}
              />
            ))}
          </div>
        )}
      </div>

      {editing !== null && (
        <AddressFormModal
          initial={editing || null}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title={t('account.deleteAddressTitle')}
          message={
            pendingRemoval.isDefault
              ? t('account.deleteDefaultAddressWarning')
              : t('account.deleteAddressWarning')
          }
          confirmLabel={t('common.actions.delete')}
          danger
          onConfirm={() => handleRemove(pendingRemoval)}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
    </div>
  );
}

export default AddressesPage;
