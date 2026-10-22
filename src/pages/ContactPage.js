import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import {
  faLocationDot,
  faClock,
  faPhone,
  faEnvelope,
  faPaperPlane,
} from '@fortawesome/free-solid-svg-icons';
import { RESTAURANT_SETTINGS } from '../config/restaurant';
import { useToast } from '../context/ToastContext';

const INITIAL_FORM = {
  name: '',
  email: '',
  subject: '',
  message: '',
};

function ContactPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const { showToast } = useToast();

  const CONTACT_DETAILS = [
    {
      icon: faLocationDot,
      label: t('address', { ns: 'home' }),
      value: RESTAURANT_SETTINGS.pickup.address,
    },
    { icon: faClock, label: t('hours', { ns: 'home' }), value: RESTAURANT_SETTINGS.pickup.hours },
    { icon: faPhone, label: t('phone', { ns: 'home' }), value: RESTAURANT_SETTINGS.phone },
    { icon: faEnvelope, label: t('email', { ns: 'home' }), value: RESTAURANT_SETTINGS.email },
  ];

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = t('errorName', { ns: 'home' });
    if (!/\S+@\S+\.\S+/.test(form.email)) next.email = t('errorEmail', { ns: 'home' });
    if (!form.subject.trim()) next.subject = t('errorSubject', { ns: 'home' });
    if (!form.message.trim()) next.message = t('errorMessage', { ns: 'home' });
    return next;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    showToast(t('contactSuccessToast', { ns: 'home' }));
    setForm(INITIAL_FORM);
  };

  return (
    <>
      <div className="landing-page landing-page--contact">
        <h1 className="landing-title">{t('contactTitle', { ns: 'home' })}</h1>
      </div>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">{t('wereHere', { ns: 'home' })}</span>
            <h2 className="section-title">{t('talkToTheTeam', { ns: 'home' })}</h2>
            <p className="section-sub">{t('talkToTheTeamSub', { ns: 'home' })}</p>
          </div>

          <div className="contact-layout">
            <div>
              <ul className="about-contact-list">
                {CONTACT_DETAILS.map((detail) => (
                  <li key={detail.label}>
                    <FontAwesomeIcon icon={detail.icon} />
                    <strong>{detail.label}</strong>
                    <span>{detail.value}</span>
                  </li>
                ))}
              </ul>
              <figure className="contact-media">
                <img src="/images/bg_2.jpg" alt={t('contactImageAlt', { ns: 'home' })} />
              </figure>
            </div>

            <form className="contact-form contact-card" onSubmit={handleSubmit} noValidate>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="contact-name">{t('yourName', { ns: 'home' })}</label>
                  <input
                    id="contact-name"
                    type="text"
                    placeholder={t('namePlaceholder', { ns: 'home' })}
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name && <p className="form-error">{errors.name}</p>}
                </div>
                <div className="field">
                  <label htmlFor="contact-email">{t('email', { ns: 'home' })}</label>
                  <input
                    id="contact-email"
                    type="email"
                    placeholder={t('emailPlaceholder', { ns: 'home' })}
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    aria-invalid={Boolean(errors.email)}
                  />
                  {errors.email && <p className="form-error">{errors.email}</p>}
                </div>
              </div>

              <div className="field">
                <label htmlFor="contact-subject">{t('subject', { ns: 'home' })}</label>
                <input
                  id="contact-subject"
                  type="text"
                  placeholder={t('subjectPlaceholder', { ns: 'home' })}
                  value={form.subject}
                  onChange={(event) => updateField('subject', event.target.value)}
                  aria-invalid={Boolean(errors.subject)}
                />
                {errors.subject && <p className="form-error">{errors.subject}</p>}
              </div>

              <div className="field">
                <label htmlFor="contact-message">{t('message', { ns: 'home' })}</label>
                <textarea
                  id="contact-message"
                  placeholder={t('messagePlaceholder', { ns: 'home' })}
                  value={form.message}
                  onChange={(event) => updateField('message', event.target.value)}
                  aria-invalid={Boolean(errors.message)}
                />
                {errors.message && <p className="form-error">{errors.message}</p>}
              </div>

              <button type="submit" className="contact-btn">
                <FontAwesomeIcon icon={faPaperPlane} /> {t('sendMessage', { ns: 'home' })}
              </button>
              <p className="contact-form-hint">
                {t('contactHint', { ns: 'home', phone: RESTAURANT_SETTINGS.phone })}
              </p>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}

export default ContactPage;
