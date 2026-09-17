import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faWallet,
  faPlus,
  faLock,
  faTriangleExclamation,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import SectionTitle from '../../components/account/SectionTitle';
import PaymentMethodCard from '../../components/account/PaymentMethodCard';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  addPaymentMethod,
  removePaymentMethod,
  setDefaultPaymentMethod,
} from '../../services/accountService';
import { isPaymentProviderConfigured } from '../../services/paymentService';

function PaymentsPage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { account } = useOutletContext();
  const uid = currentUser?.uid;

  const [adding, setAdding] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null);

  const methods = account.paymentMethods || [];
  const providerConfigured = isPaymentProviderConfigured();

  const handleAdd = () => {
    if (!providerConfigured) {
      // No provider → honest blocker, never a fake card form.
      showToast(
        'Saving a card requires a PCI-compliant payment provider, which is not configured for this project yet.',
        'warning'
      );
      return;
    }
    setAdding(true);
  };

  // With a real provider configured this would open secure hosted/embedded
  // fields. Today it only explains why secure card entry is unavailable.
  const handleSimulatedToken = () => {
    // Never accepts raw card numbers; requires a provider token.
    const result = addPaymentMethod(uid, {
      provider: 'none',
      token: 'pm_placeholder',
    });
    if (!result.success && result.reason === 'provider-required') {
      showToast(result.error, 'warning');
    } else if (result.success) {
      showToast('Payment method added.');
    }
    setAdding(false);
  };

  const handleRemove = async (method) => {
    setPendingRemoval(null);
    const next = removePaymentMethod(uid, method.id);
    showToast(
      `Payment method removed${next.length ? '. Another method is now the default.' : '.'}`
    );
  };

  const handleSetDefault = (id) => {
    setDefaultPaymentMethod(uid, id);
    showToast('Default payment method updated.');
  };

  return (
    <div className="dash-section">
      <SectionTitle
        title="Payment Methods"
        subtitle="Saved payment methods used at checkout"
      />

      <div className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faWallet} /> Saved Methods
          </h3>
          <button type="button" className="menu-btn dash-btn-sm" onClick={handleAdd}>
            <FontAwesomeIcon icon={adding ? faSpinner : faPlus} spin={adding} />
            &nbsp; Add Payment Method
          </button>
        </div>

        <p className="dash-card-sub">
          <FontAwesomeIcon icon={faLock} /> Cards are stored with your payment
          provider. Full card numbers and CVVs are never kept in this app.
        </p>

        {methods.length === 0 ? (
          <div className="dash-empty">
            <FontAwesomeIcon icon={faWallet} className="dash-empty-icon" />
            <p>No payment methods saved.</p>
            <button
              type="button"
              className="menu-btn dash-btn-sm"
              onClick={handleAdd}
            >
              Add Payment Method
            </button>
          </div>
        ) : (
          <div className="dash-payment-list">
            {methods.map((method) => (
              <PaymentMethodCard
                key={method.id}
                method={method}
                onSetDefault={handleSetDefault}
                onRemove={(m) => setPendingRemoval(m)}
              />
            ))}
          </div>
        )}

        {!providerConfigured && (
          <div className="dash-provider-note">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <span>
              Card and online payments are not available yet. Their UI is in
              place and will activate once a PCI-compliant provider (e.g.
              Stripe) is connected.
            </span>
          </div>
        )}
      </div>

      {adding && (
        <ConfirmDialog
          title="Add a payment method"
          message="Secure card entry uses hosted payment fields provided by the PCI-compliant provider. Connect a payment provider (e.g. Stripe) in the restaurant dashboard before using this."
          confirmLabel="Continue"
          onConfirm={handleSimulatedToken}
          onCancel={() => setAdding(false)}
        />
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title="Remove this payment method?"
          message={
            pendingRemoval.isDefault
              ? 'This is your default payment method. Removing it will make the first remaining method the new default.'
              : 'This payment method will be removed from your account.'
          }
          confirmLabel="Remove"
          danger
          onConfirm={() => handleRemove(pendingRemoval)}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
    </div>
  );
}

export default PaymentsPage;