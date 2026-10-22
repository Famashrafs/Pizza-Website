import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPhone, faLock } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import SectionTitle from '../../components/account/SectionTitle';
import PhoneVerification from '../../components/account/PhoneVerification';
import PasswordChangeForm from '../../components/account/PasswordChangeForm';
import DangerZone from '../../components/account/DangerZone';

function SecurityPage() {
  const { t } = useTranslation();
  const { account } = useOutletContext();

  return (
    <div className="dash-section">
      <SectionTitle
        title={t('account.navSecurity')}
        subtitle={t('account.securitySubtitle')}
      />

      <section className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faPhone} /> {t('account.phoneNumberTitle')}
          </h3>
        </div>
        <p className="dash-card-sub">{t('account.phoneVerifyInfo')}</p>
        <PhoneVerification account={account} />
      </section>

      <section className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faLock} /> {t('account.changePasswordTitle')}
          </h3>
        </div>
        <PasswordChangeForm />
      </section>

      <DangerZone />
    </div>
  );
}

export default SecurityPage;
