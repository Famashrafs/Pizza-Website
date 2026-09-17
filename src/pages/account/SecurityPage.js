import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPhone, faLock } from '@fortawesome/free-solid-svg-icons';
import SectionTitle from '../../components/account/SectionTitle';
import PhoneVerification from '../../components/account/PhoneVerification';
import PasswordChangeForm from '../../components/account/PasswordChangeForm';
import DangerZone from '../../components/account/DangerZone';

function SecurityPage() {
  const { account } = useOutletContext();

  return (
    <div className="dash-section">
      <SectionTitle
        title="Security"
        subtitle="Phone verification, password and account safety"
      />

      <section className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faPhone} /> Phone Number
          </h3>
        </div>
        <p className="dash-card-sub">
          Verify your phone number to receive order updates by SMS. A 6-digit
          code will be sent to your phone.
        </p>
        <PhoneVerification account={account} />
      </section>

      <section className="dash-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faLock} /> Change Password
          </h3>
        </div>
        <PasswordChangeForm />
      </section>

      <DangerZone />
    </div>
  );
}

export default SecurityPage;