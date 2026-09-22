import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
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

const CONTACT_DETAILS = [
  { icon: faLocationDot, label: 'Address', value: RESTAURANT_SETTINGS.pickup.address },
  { icon: faClock, label: 'Hours', value: RESTAURANT_SETTINGS.pickup.hours },
  { icon: faPhone, label: 'Phone', value: RESTAURANT_SETTINGS.phone },
  { icon: faEnvelope, label: 'Email', value: RESTAURANT_SETTINGS.email },
];

function ContactPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const { showToast } = useToast();

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Please tell us your name.';
    if (!/\S+@\S+\.\S+/.test(form.email)) next.email = 'Enter a valid email address.';
    if (!form.subject.trim()) next.subject = 'Add a short subject.';
    if (!form.message.trim()) next.message = 'Write us a message.';
    return next;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    showToast('Thanks for reaching out — we’ll reply within one business day.');
    setForm(INITIAL_FORM);
  };

  return (
    <>
      <div className="landing-page landing-page--contact">
        <h1 className="landing-title">CONTACT US</h1>
      </div>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">We&rsquo;re here</span>
            <h2 className="section-title">Talk to the team</h2>
            <p className="section-sub">
              Questions about an order, feedback on the menu, or a big catering
              idea? Send a note and we&rsquo;ll get back to you quickly.
            </p>
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
                <img src="/images/bg_2.jpg" alt="Fresh pizza in our kitchen" />
              </figure>
            </div>

            <form className="contact-form contact-card" onSubmit={handleSubmit} noValidate>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="contact-name">Your name</label>
                  <input
                    id="contact-name"
                    type="text"
                    placeholder="Jamie Doe"
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name && <p className="form-error">{errors.name}</p>}
                </div>
                <div className="field">
                  <label htmlFor="contact-email">Email</label>
                  <input
                    id="contact-email"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    aria-invalid={Boolean(errors.email)}
                  />
                  {errors.email && <p className="form-error">{errors.email}</p>}
                </div>
              </div>

              <div className="field">
                <label htmlFor="contact-subject">Subject</label>
                <input
                  id="contact-subject"
                  type="text"
                  placeholder="How can we help?"
                  value={form.subject}
                  onChange={(event) => updateField('subject', event.target.value)}
                  aria-invalid={Boolean(errors.subject)}
                />
                {errors.subject && <p className="form-error">{errors.subject}</p>}
              </div>

              <div className="field">
                <label htmlFor="contact-message">Message</label>
                <textarea
                  id="contact-message"
                  placeholder="Tell us everything…"
                  value={form.message}
                  onChange={(event) => updateField('message', event.target.value)}
                  aria-invalid={Boolean(errors.message)}
                />
                {errors.message && <p className="form-error">{errors.message}</p>}
              </div>

              <button type="submit" className="contact-btn">
                <FontAwesomeIcon icon={faPaperPlane} /> Send message
              </button>
              <p className="contact-form-hint">
                We usually reply within one business day. For urgent order issues,
                call us on {RESTAURANT_SETTINGS.phone}.
              </p>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}

export default ContactPage;