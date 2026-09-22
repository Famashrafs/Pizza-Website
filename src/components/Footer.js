import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFacebookF,
  faInstagram,
  faXTwitter,
} from '@fortawesome/free-brands-svg-icons';
import {
  faPhone,
  faEnvelope,
  faClock,
  faLocationDot,
} from '@fortawesome/free-solid-svg-icons';
import { RESTAURANT_SETTINGS } from '../config/restaurant';

const EXPLORE_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/menu', label: 'Menu' },
  { to: '/offers', label: 'Offers' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

const CUSTOMER_LINKS = [
  { to: '/cart', label: 'Your cart' },
  { to: '/orders', label: 'Track order' },
  { to: '/account/favorites', label: 'Favorites' },
  { to: '/account/addresses', label: 'Saved addresses' },
];

const SOCIAL_LINKS = [
  { icon: faFacebookF, label: 'Facebook', href: 'https://facebook.com' },
  { icon: faInstagram, label: 'Instagram', href: 'https://instagram.com' },
  { icon: faXTwitter, label: 'X (Twitter)', href: 'https://x.com' },
];

function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer-inner">
          <div className="site-footer-brand">
            <Link to="/" className="site-logo" aria-label="Pizza home">
              <span className="site-logo-mark">P</span>
              <span>
                Pi<em>zz</em>a
              </span>
            </Link>
            <p>
              {RESTAURANT_SETTINGS.tagline}. Hand-built pizzas, an honest menu,
              and delivery you can track from our ovens to your door.
            </p>
            <div className="footer-social">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={social.label}
                >
                  <FontAwesomeIcon icon={social.icon} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4>Explore</h4>
            <ul>
              {EXPLORE_LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} end={Boolean(link.end)}>
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Customer</h4>
            <ul>
              {CUSTOMER_LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to}>{link.label}</NavLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Get in touch</h4>
            <ul className="footer-contact">
              <li>
                <FontAwesomeIcon icon={faLocationDot} />
                <span>{RESTAURANT_SETTINGS.pickup.address}</span>
              </li>
              <li>
                <FontAwesomeIcon icon={faPhone} />
                <a href={`tel:${RESTAURANT_SETTINGS.phone.replace(/[^+\d]/g, '')}`}>
                  {RESTAURANT_SETTINGS.phone}
                </a>
              </li>
              <li>
                <FontAwesomeIcon icon={faEnvelope} />
                <a href={`mailto:${RESTAURANT_SETTINGS.email}`}>
                  {RESTAURANT_SETTINGS.email}
                </a>
              </li>
              <li>
                <FontAwesomeIcon icon={faClock} />
                <span>{RESTAURANT_SETTINGS.pickup.hours}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="site-footer-bottom">
          <span>© {year} {RESTAURANT_SETTINGS.name}. All rights reserved.</span>
          <span>Fresh from the wood-fired oven.</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;