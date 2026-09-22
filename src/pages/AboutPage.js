import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
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

const VALUES = [
  {
    icon: faDrumstickBite,
    title: 'Honest ingredients',
    text: 'Flour, slow-risen dough, fresh mozzarella and sauces made in-house. If it doesn’t belong on a pizza, it’s not in our kitchen.',
  },
  {
    icon: faFire,
    title: 'Wood-fired craft',
    text: 'Every pizza bakes in a wood-fired oven at a blistering heat — the crust comes out blistered, charred and just right.',
  },
  {
    icon: faHands,
    title: 'Made for your table',
    text: 'Delivery is tracked, pickup is ready when you are, and every order is built exactly the way you asked.',
  },
];

function AboutPage() {
  return (
    <>
      <div className="landing-page">
        <h1 className="landing-title">ABOUT US</h1>
      </div>

      <section className="section">
        <div className="container">
          <div className="about-grid">
            <div className="about-copy">
              <span className="section-eyebrow">Our story</span>
              <h2 className="section-title">Wood-fired, from the very start</h2>
              <p>
                {RESTAURANT_SETTINGS.name} began with a simple idea: great pizza
                doesn’t need shortcuts. Dough that rises overnight, a real
                wood-fired oven, and toppings chosen for flavor rather than cost.
              </p>
              <p>
                Today we bring the same care to every order — from the first
                stretch of the dough to the courier tapping their pedal down your
                street. What we’ve never automated is the craft.
              </p>
            </div>
            <div className="about-figure">
              <img
                src="/images/PIZZA_edited.webp"
                alt="A fresh wood-fired pizza"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="section section-tinted">
        <div className="container">
          <div className="section-head is-center">
            <span className="section-eyebrow">What we stand for</span>
            <h2 className="section-title">Three things, never compromised</h2>
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
                alt="Our kitchen preparing fresh food"
                loading="lazy"
              />
            </div>
            <div>
              <span className="section-eyebrow">Find us</span>
              <h2 className="section-title">Come by, or let us come to you</h2>
              <ul className="about-contact-list">
                <li>
                  <FontAwesomeIcon icon={faLocationDot} />
                  <strong>Address</strong>
                  <span>{RESTAURANT_SETTINGS.pickup.address}</span>
                </li>
                <li>
                  <FontAwesomeIcon icon={faClock} />
                  <strong>Hours</strong>
                  <span>{RESTAURANT_SETTINGS.pickup.hours}</span>
                </li>
                <li>
                  <FontAwesomeIcon icon={faPhone} />
                  <strong>Phone</strong>
                  <span>{RESTAURANT_SETTINGS.phone}</span>
                </li>
                <li>
                  <FontAwesomeIcon icon={faEnvelope} />
                  <strong>Email</strong>
                  <span>{RESTAURANT_SETTINGS.email}</span>
                </li>
              </ul>
              <div className="about-cta">
                <Link to="/menu" className="contact-btn">
                  Browse the menu <FontAwesomeIcon icon={faArrowRight} />
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