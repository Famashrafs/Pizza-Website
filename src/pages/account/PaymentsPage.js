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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      showToast(t('account.toastProviderRequired'), 'warning');
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
      showToast(t('account.toastPaymentMethodAdded'));
    }
    setAdding(false);
  };

  const handleRemove = async (method) => {
    setPendingRemoval(null);
    const next = removePaymentMethod(uid, method.id);
    showToast(
      next.length
        ? t('account.toastPaymentMethodRemovedWithDefault')
        : t('account.toastPaymentMethodRemoved')
    );
  };

  const handleSetDefault = (id) => {
    setDefaultPaymentMethod(uid, id);
    showToast(t('account.toastDefaultPaymentUpdated'));
  };

  return (
    <div className="dash-section">
      <SectionTitle
        title={t('account.paymentMethodsTitle')}
        subtitle={t('account.paymentMethodsSubtitle')}
      />

      <div className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faWallet} /> {t('account.savedMethods')}
          </h3>
          <button type="button" className="menu-btn dash-btn-sm" onClick={handleAdd}>
            <FontAwesomeIcon icon={adding ? faSpinner : faPlus} spin={adding} />
            &nbsp; {t('account.addPaymentMethod')}
          </button>
        </div>

        <p className="dash-card-sub">
          <FontAwesomeIcon icon={faLock} /> {t('account.cardsStoredNote')}
        </p>

        {methods.length === 0 ? (
          <div className="dash-empty">
            <FontAwesomeIcon icon={faWallet} className="dash-empty-icon" />
            <p>{t('account.noPaymentMethods')}</p>
            <button
              type="button"
              className="menu-btn dash-btn-sm"
              onClick={handleAdd}
            >
              {t('account.addPaymentMethod')}
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
            <span>{t('account.providerUnavailableNote')}</span>
          </div>
        )}
      </div>

      {adding && (
        <ConfirmDialog
          title={t('account.addPaymentMethodTitle')}
          message={t('account.secureCardEntryNote')}
          confirmLabel={t('common.actions.continue')}
          onConfirm={handleSimulatedToken}
          onCancel={() => setAdding(false)}
        />
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title={t('account.removePaymentMethodTitle')}
          message={
            pendingRemoval.isDefault
              ? t('account.removeDefaultPaymentWarning')
              : t('account.removePaymentMethodWarning')
          }
          confirmLabel={t('common.actions.remove')}
          danger
          onConfirm={() => handleRemove(pendingRemoval)}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
    </div>
  );
}

export default PaymentsPage;
