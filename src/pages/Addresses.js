import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getSavedAddresses,
  saveSavedAddresses,
} from '../services/storage';

function Addresses() {
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
    showToast('Address added.');
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
    showToast('Default address updated.');
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
    showToast('Address removed.');
  };

  const defaultAddress = userProfile?.address;

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">SAVED ADDRESSES</h1>
      </div>
      <div className="cart-container">
        <div className="address-form-card">
          <h2>Add a New Address</h2>
          <form className="auth-form" onSubmit={handleAdd}>
            <input
              type="text"
              name="label"
              placeholder="Label (Home, Work...)"
              value={form.label}
              onChange={handleChange}
            />
            <input
              type="text"
              name="street"
              placeholder="Street address"
              value={form.street}
              onChange={handleChange}
              required
            />
            <input
              type="text"
              name="city"
              placeholder="City"
              value={form.city}
              onChange={handleChange}
              required
            />
            <input
              type="text"
              name="zip"
              placeholder="Zip code (optional)"
              value={form.zip}
              onChange={handleChange}
            />
            <button type="submit" className="contact-btn">
              Add Address
            </button>
          </form>
        </div>

        <div className="address-list">
          {list.length === 0 ? (
            <div className="auth-card empty-cart">
              <h2>No saved addresses</h2>
              <p className="auth-subtitle">
                Add an address to speed up checkout.
              </p>
            </div>
          ) : (
            list.map((addr) => (
              <div className="order-card" key={addr.id}>
                <div className="order-head">
                  <h4>
                    {addr.label}
                    {addr.isDefault && (
                      <span className="address-badge">Default</span>
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
                        Set as Default
                      </button>
                    )}
                  <button
                    type="button"
                    className="cart-remove"
                    onClick={() => handleRemove(addr.id)}
                  >
                    Remove
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