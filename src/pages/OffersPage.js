import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPercent,
  faTag,
  faTruckFast,
  faArrowRight,
  faLightbulb,
  faCopy,
} from '@fortawesome/free-solid-svg-icons';
import { PROMO_CODES, FREE_DELIVERY_THRESHOLD } from '../utils/cartPricing';

const OFFER_META = {
  PIZZA10: {
    icon: faPercent,
    title: '10% off your order',
    text: 'Save a full 10% on your entire order — every pizza, side and dessert counts.',
  },
  WELCOME5: {
    icon: faTag,
    title: '$5 off your order',
    text: 'An easy welcome: $5 straight off the total. Perfect for your first order.',
  },
  FREEDELIVERY: {
    icon: faTruckFast,
    title: 'Free delivery',
    text: `Skip the delivery fee entirely by spending $${FREE_DELIVERY_THRESHOLD} or more — or just apply the code.`,
  },
};

const HOW_TO_USE = [
  'Add your favorites to the cart and head to checkout.',
  'Open the promo-code field in the order summary.',
  'Enter the code — the discount is applied before you pay.',
];

function OfferCard({ code }) {
  const meta = OFFER_META[code] || {
    icon: faTag,
    title: PROMO_CODES[code]?.label || code,
    text: 'A limited-time saving, applied automatically at checkout.',
  };

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
      <h3>{meta.title}</h3>
      <p>{meta.text}</p>
      <div className="offer-card-code">
        <span>{code}</span>
        <button
          type="button"
          className="offer-card-copy"
          onClick={handleCopy}
          aria-label={`Copy ${code} to clipboard`}
        >
          <FontAwesomeIcon icon={faCopy} />
        </button>
      </div>
      <Link to="/menu" className="offer-card-link">
        Browse the menu <FontAwesomeIcon icon={faArrowRight} />
      </Link>
    </article>
  );
}

function OffersPage() {
  const codes = Object.keys(PROMO_CODES).filter((code) => OFFER_META[code]);

  return (
    <>
      <div className="landing-page">
        <h1 className="landing-title">OFFERS</h1>
      </div>

      <section className="section">
        <div className="container">
          <div className="section-head is-center">
            <span className="section-eyebrow">Current offers</span>
            <h2 className="section-title">Deals that actually work</h2>
            <p className="section-sub">
              Real promo codes, entered at checkout. No email walls, no fine
              print — just the savings that are live in the store today.
            </p>
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
            <span className="section-eyebrow">Simple to redeem</span>
            <h2 className="section-title">How to use a code</h2>
          </div>
          <div className="how-grid">
            {HOW_TO_USE.map((step, index) => (
              <div key={step} className="how-step">
                <span className="how-num">{index + 1}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>

          <div className="offer-note">
            <FontAwesomeIcon icon={faLightbulb} />
            <p>
              Got an order over the free-delivery threshold? Delivery is free
              automatically — you don&rsquo;t even need the code, but it never
              hurts to have it ready.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta-band">
            <h2>Ready for a hot one?</h2>
            <p>
              Pick your favorites, drop in a code at checkout and your order is
              in the oven before you know it.
            </p>
            <Link to="/menu" className="contact-btn">
              Order now <FontAwesomeIcon icon={faArrowRight} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default OffersPage;