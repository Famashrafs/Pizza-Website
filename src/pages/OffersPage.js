import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import {
  faPercent,
  faTag,
  faTruckFast,
  faArrowRight,
  faLightbulb,
  faCopy,
} from '@fortawesome/free-solid-svg-icons';
import { PROMO_CODES, FREE_DELIVERY_THRESHOLD } from '../utils/cartPricing';
import { formatMoney } from '../i18n/format';

const OFFER_META = {
  PIZZA10: {
    icon: faPercent,
    title: 'offerPizza10Title',
    text: 'offerPizza10Text',
  },
  WELCOME5: {
    icon: faTag,
    title: 'offerWelcome5Title',
    text: 'offerWelcome5Text',
    amount: PROMO_CODES.WELCOME5.value,
  },
  FREEDELIVERY: {
    icon: faTruckFast,
    title: 'offerFreeDeliveryTitle',
    text: 'offerFreeDeliveryText',
    amount: FREE_DELIVERY_THRESHOLD,
  },
};

const HOW_TO_USE = ['offerHowStep1', 'offerHowStep2', 'offerHowStep3'];

function OfferCard({ code }) {
  const { t, i18n } = useTranslation();
  const meta = OFFER_META[code] || {
    icon: faTag,
    title: PROMO_CODES[code]?.label || code,
    text: 'offerGenericText',
  };
  const amount =
    meta.amount == null ? undefined : formatMoney(meta.amount, i18n.language);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch (err) {
      // Clipboard may be unavailable; the code is shown in full anyway.
    }
  };

  return (
    <article className="offer-card">
      <span className="offer-card-icon">
        <FontAwesomeIcon icon={meta.icon} />
      </span>
      <h3>{t(meta.title, { ns: 'home', amount })}</h3>
      <p>{t(meta.text, { ns: 'home', amount })}</p>
      <div className="offer-card-code">
        <span>{code}</span>
        <button
          type="button"
          className="offer-card-copy"
          onClick={handleCopy}
          aria-label={t('ariaCopyCode', { ns: 'home', code })}
        >
          <FontAwesomeIcon icon={faCopy} />
        </button>
      </div>
      <Link to="/menu" className="offer-card-link">
        {t('browseMenu', { ns: 'home' })} <FontAwesomeIcon icon={faArrowRight} />
      </Link>
    </article>
  );
}

function OffersPage() {
  const { t } = useTranslation();
  const codes = Object.keys(PROMO_CODES).filter((code) => OFFER_META[code]);

  return (
    <>
      <div className="landing-page landing-page--offers">
        <h1 className="landing-title">{t('offersTitle', { ns: 'home' })}</h1>
      </div>

      <section className="section">
        <div className="container">
          <div className="section-head is-center">
            <span className="section-eyebrow">{t('currentOffers', { ns: 'home' })}</span>
            <h2 className="section-title">{t('dealsThatWork', { ns: 'home' })}</h2>
            <p className="section-sub">{t('dealsThatWorkSub', { ns: 'home' })}</p>
          </div>

          <div className="offer-grid">
            {codes.map((code) => (
              <OfferCard key={code} code={code} />
            ))}
          </div>
        </div>
      </section>

      <section className="section section-tinted">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">{t('simpleToRedeem', { ns: 'home' })}</span>
            <h2 className="section-title">{t('howToUseCode', { ns: 'home' })}</h2>
          </div>
          <div className="how-grid">
            {HOW_TO_USE.map((step, index) => (
              <div key={step} className="how-step">
                <span className="how-num">{index + 1}</span>
                <p>{t(step, { ns: 'home' })}</p>
              </div>
            ))}
          </div>

          <div className="offer-note">
            <FontAwesomeIcon icon={faLightbulb} />
            <p>{t('offerNote', { ns: 'home' })}</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta-band">
            <h2>{t('readyForAHotOne', { ns: 'home' })}</h2>
            <p>{t('readyForAHotOneText', { ns: 'home' })}</p>
            <Link to="/menu" className="contact-btn">
              {t('orderNow', { ns: 'home' })} <FontAwesomeIcon icon={faArrowRight} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default OffersPage;
