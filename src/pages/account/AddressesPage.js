import React, { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLocationDot,
  faPlus,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';
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
  return (
    <>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-street">Street address *</label>
        <input
          id="addr-street"
          type="text"
          value={fields.street}
          onChange={(event) => onChange('street', event.target.value)}
          required
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-city">City *</label>
        <input
          id="addr-city"
          type="text"
          value={fields.city}
          onChange={(event) => onChange('city', event.target.value)}
          required
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-area">Area</label>
        <input
          id="addr-area"
          type="text"
          value={fields.area || ''}
          onChange={(event) => onChange('area', event.target.value)}
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-building">Building</label>
        <input
          id="addr-building"
          type="text"
          value={fields.building}
          onChange={(event) => onChange('building', event.target.value)}
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-apartment">Apartment</label>
        <input
          id="addr-apartment"
          type="text"
          value={fields.apartment}
          onChange={(event) => onChange('apartment', event.target.value)}
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-floor">Floor</label>
        <input
          id="addr-floor"
          type="text"
          value={fields.floor}
          onChange={(event) => onChange('floor', event.target.value)}
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-landmark">Landmark</label>
        <input
          id="addr-landmark"
          type="text"
          value={fields.landmark}
          onChange={(event) => onChange('landmark', event.target.value)}
        />
      </div>
      <div className="dash-field dash-field-half">
        <label htmlFor="addr-phone">Phone number</label>
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
          {initial ? 'Edit Address' : 'Add New Address'}
        </h2>
        <form onSubmit={handleSubmit} className="dash-form">
          <div className="dash-field">
            <label htmlFor="addr-label">Address label</label>
            <input
              id="addr-label"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Home, Work…"
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
            Set as default address
          </label>
          <div className="confirm-actions">
            <button type="button" className="confirm-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="confirm-confirm" disabled={busy}>
              {busy ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> Saving…
                </>
              ) : initial ? (
                'Save Changes'
              ) : (
                'Add Address'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddressesPage() {
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
    showToast(wasEditing ? 'Address updated.' : 'Address added.');
  };

  const handleSetDefault = (id) => {
    const next = setDefaultAddress(uid, id);
    setList(next);
    showToast('Default address updated.');
  };

  const handleRemove = async (address) => {
    setPendingRemoval(null);
    const next = removeAddress(uid, address.id);
    setList(next);
    showToast('Address removed.');
  };

  return (
    <div className="dash-section">
      <SectionTitle
        title="Addresses"
        subtitle="Manage delivery addresses used at checkout"
      />
      <div className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faLocationDot} /> Saved Addresses
          </h3>
          <button
            type="button"
            className="menu-btn dash-btn-sm"
            onClick={() => setEditing(false)}
          >
            <FontAwesomeIcon icon={faPlus} /> Add New Address
          </button>
        </div>

        {list.length === 0 ? (
          <div className="dash-empty">
            <FontAwesomeIcon icon={faLocationDot} className="dash-empty-icon" />
            <p>No saved addresses.</p>
            <button
              type="button"
              className="menu-btn dash-btn-sm"
              onClick={() => setEditing(false)}
            >
              Add New Address
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
          title="Delete this address?"
          message={
            pendingRemoval.isDefault
              ? 'This is your default address. If you delete it, the first remaining address becomes the default.'
              : 'This address will be removed from your account.'
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => handleRemove(pendingRemoval)}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
    </div>
  );
}

export default AddressesPage;