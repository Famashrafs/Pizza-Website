import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import {
  faArrowRight,
  faFire,
  faDrumstickBite,
  faHands,
  faLocationDot,
  faClock,
  faPhone,
  faEnvelope,
} from '@fortawesome/free-solid-svg-icons';
import { RESTAURANT_SETTINGS } from '../config/restaurant';

function AboutPage() {
  const { t } = useTranslation();

  const VALUES = [
    {
      icon: faDrumstickBite,
      title: t('valueHonestTitle', { ns: 'home' }),
      text: t('valueHonestText', { ns: 'home' }),
    },
    {
      icon: faFire,
      title: t('valueCraftTitle', { ns: 'home' }),
      text: t('valueCraftText', { ns: 'home' }),
    },
    {
      icon: faHands,
      title: t('valueTableTitle', { ns: 'home' }),
      text: t('valueTableText', { ns: 'home' }),
    },
  ];

  return (
    <>
      <div className="landing-page landing-page--about">
        <h1 className="landing-title">{t('aboutTitle', { ns: 'home' })}</h1>
      </div>

      <section className="section">
        <div className="container">
          <div className="about-grid">
            <div className="about-copy">
              <span className="section-eyebrow">{t('ourStory', { ns: 'home' })}</span>
              <h2 className="section-title">{t('woodFiredFromStart', { ns: 'home' })}</h2>
              <p>
                {t('aboutStory1', { ns: 'home', name: RESTAURANT_SETTINGS.name })}
              </p>
              <p>{t('aboutStory2', { ns: 'home' })}</p>
            </div>
            <div className="about-figure">
              <img
                src="/images/PIZZA_edited.webp"
                alt={t('aboutImageAlt', { ns: 'home' })}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="section section-tinted">
        <div className="container">
          <div className="section-head is-center">
            <span className="section-eyebrow">{t('whatWeStandFor', { ns: 'home' })}</span>
            <h2 className="section-title">{t('threeThings', { ns: 'home' })}</h2>
          </div>
          <div className="value-grid">
            {VALUES.map((value) => (
              <div key={value.title} className="value-card">
                <span className="value-icon">
                  <FontAwesomeIcon icon={value.icon} />
                </span>
                <h3>{value.title}</h3>
                <p>{value.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="about-grid">
            <div className="about-figure">
              <img
                src="/images/about.jpg"
                alt={t('aboutKitchenAlt', { ns: 'home' })}
                loading="lazy"
              />
            </div>
            <div>
              <span className="section-eyebrow">{t('findUs', { ns: 'home' })}</span>
              <h2 className="section-title">{t('comeByOrWeCome', { ns: 'home' })}</h2>
              <ul className="about-contact-list">
                <li>
                  <FontAwesomeIcon icon={faLocationDot} />
                  <strong>{t('address', { ns: 'home' })}</strong>
                  <span>{RESTAURANT_SETTINGS.pickup.address}</span>
                </li>
                <li>
                  <FontAwesomeIcon icon={faClock} />
                  <strong>{t('hours', { ns: 'home' })}</strong>
                  <span>{RESTAURANT_SETTINGS.pickup.hours}</span>
                </li>
                <li>
                  <FontAwesomeIcon icon={faPhone} />
                  <strong>{t('phone', { ns: 'home' })}</strong>
                  <span>{RESTAURANT_SETTINGS.phone}</span>
                </li>
                <li>
                  <FontAwesomeIcon icon={faEnvelope} />
                  <strong>{t('email', { ns: 'home' })}</strong>
                  <span>{RESTAURANT_SETTINGS.email}</span>
                </li>
              </ul>
              <div className="about-cta">
                <Link to="/menu" className="contact-btn">
                  {t('browseMenu', { ns: 'home' })} <FontAwesomeIcon icon={faArrowRight} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default AboutPage;
