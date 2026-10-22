import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import {
  faStar,
  faClock,
  faTruckFast,
  faFire,
  faPlus,
  faArrowRight,
  faPizzaSlice,
  faBurger,
  faBowlFood,
  faGlassWater,
  faCookieBite,
  faUtensils,
  faHandPointer,
  faWallet,
  faFireBurner,
} from '@fortawesome/free-solid-svg-icons';
import { fetchProducts, getCategories } from '../services/menuService';
import { PROMO_CODES } from '../utils/cartPricing';
import { RESTAURANT_SETTINGS } from '../config/restaurant';
import { formatMoney } from '../i18n/format';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { hasCustomization, createCartItem, createSimpleCartItem } from '../utils/cartItem';
import ProductModal from '../components/ProductModal';
import SkeletonCard from '../components/SkeletonCard';
import EmptyState from '../components/EmptyState';

const CATEGORY_ICONS = {
  Pizza: faPizzaSlice,
  Burger: faBurger,
  Pasta: faBowlFood,
  'Appetizers': faUtensils,
  Drinks: faGlassWater,
  Desserts: faCookieBite,
};

function HomePage() {
  const { t, i18n } = useTranslation();
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [customizing, setCustomizing] = useState(null);

  const VALUE_PROPS = [
    {
      icon: faFire,
      title: t('valueWoodFiredTitle', { ns: 'home' }),
      text: t('valueWoodFiredText', { ns: 'home' }),
    },
    {
      icon: faTruckFast,
      title: t('valueTrackedTitle', { ns: 'home' }),
      text: t('valueTrackedText', { ns: 'home' }),
    },
    {
      icon: faClock,
      title: t('valueDeliveryTitle', { ns: 'home' }),
      text: t('valueDeliveryText', {
        ns: 'home',
        min: RESTAURANT_SETTINGS.delivery.estimatedMinutes[0],
        max: RESTAURANT_SETTINGS.delivery.estimatedMinutes[1],
      }),
    },
  ];

  const HOW_STEPS = [
    {
      icon: faHandPointer,
      title: t('stepPickTitle', { ns: 'home' }),
      text: t('stepPickText', { ns: 'home' }),
    },
    {
      icon: faWallet,
      title: t('stepCheckoutTitle', { ns: 'home' }),
      text: t('stepCheckoutText', { ns: 'home' }),
    },
    {
      icon: faFireBurner,
      title: t('stepCookTitle', { ns: 'home' }),
      text: t('stepCookText', { ns: 'home' }),
    },
    {
      icon: faTruckFast,
      title: t('stepTrackTitle', { ns: 'home' }),
      text: t('stepTrackText', { ns: 'home' }),
    },
  ];

  const { addItem } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const loadProducts = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await fetchProducts();
      setProducts(data);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const categories = useMemo(() => getCategories(products), [products]);

  const featured = useMemo(
    () =>
      products
        .filter((product) => product.featured && product.available)
        .slice(0, 4),
    [products]
  );

  const promoEntries = useMemo(
    () =>
      Object.entries(PROMO_CODES).map(([code]) => ({
        code,
      })),
    []
  );

  const handleAdd = (product) => {
    if (!product.available) return;
    if (hasCustomization(product)) {
      setCustomizing(product);
      return;
    }
    addItem(createSimpleCartItem(product));
    showToast(t('toastAddedToCart', { ns: 'home', name: product.name }));
  };

  const handleConfirmCustomization = (config) => {
    const item = createCartItem(customizing, config);
    if (!item) {
      showToast(t('toastInvalidConfiguration', { ns: 'home' }), 'error');
      return;
    }
    addItem(item);
    showToast(t('toastAddedToCart', { ns: 'home', name: customizing.name }));
    setCustomizing(null);
  };

  const openCategory = (category) => {
    navigate('/menu', { state: { category } });
  };

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="hero-inner">
            <div>
              <span className="hero-eyebrow">
                <FontAwesomeIcon icon={faFire} /> {t('app.tagline', { ns: 'common' })}
              </span>
              <h1 className="hero-title">
                {t('heroTitleStart', { ns: 'home' })} <em>{t('heroTitleAccent', { ns: 'home' })}</em>{' '}
                {t('heroTitleEnd', { ns: 'home' })}
              </h1>
              <p className="hero-sub">{t('heroSubtitle', { ns: 'home' })}</p>
              <div className="hero-cta">
                <Link to="/menu" className="contact-btn">
                  {t('browseMenu', { ns: 'home' })} <FontAwesomeIcon icon={faArrowRight} />
                </Link>
                <Link to="/offers" className="menu-btn">
                  {t('todaysOffers', { ns: 'home' })}
                </Link>
              </div>
              <div className="hero-trust">
                <div className="hero-trust-item">
                  <FontAwesomeIcon icon={faClock} />
                  <div>
                    <strong>{t('openDaily', { ns: 'home' })}</strong>
                    <span>{RESTAURANT_SETTINGS.pickup.hours}</span>
                  </div>
                </div>
                <div className="hero-trust-item">
                  <FontAwesomeIcon icon={faTruckFast} />
                  <div>
                    <strong>
                      {t('deliveryEstimate', {
                        ns: 'home',
                        min: RESTAURANT_SETTINGS.delivery.estimatedMinutes[0],
                        max: RESTAURANT_SETTINGS.delivery.estimatedMinutes[1],
                      })}
                    </strong>
                    <span>{t('freshAtYourDoor', { ns: 'home' })}</span>
                  </div>
                </div>
                <div className="hero-trust-item">
                  <FontAwesomeIcon icon={faStar} />
                  <div>
                    <strong>{t('rated', { ns: 'home', rating: '4.8' })}</strong>
                    <span>{t('lovedByRegulars', { ns: 'home' })}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="hero-media">
              <div className="hero-rating-chip">
                <FontAwesomeIcon icon={faStar} />{' '}
                {t('ratingChip', { ns: 'home', rating: '4.8', orders: '1,000' })}
              </div>
              <div className="hero-img-wrap">
                <img
                  src="/images/BA-Perfect-Pizza.webp"
                  alt={t('heroImageAlt', { ns: 'home' })}
                />
              </div>
              <div className="hero-card">
                <span className="hero-card-icon">
                  <FontAwesomeIcon icon={faFire} />
                </span>
                <div>
                  <strong>{t('stoneBaked', { ns: 'home' })}</strong>
                  <span>{t('bakeDetails', { ns: 'home' })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured products */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">{t('eyebrowKitchen', { ns: 'home' })}</span>
            <h2 className="section-title">{t('featuredTitle', { ns: 'home' })}</h2>
            <p className="section-sub">{t('featuredSub', { ns: 'home' })}</p>
          </div>

          {status === 'loading' && (
            <div className="featured-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          )}

          {status === 'error' && (
            <EmptyState
              title={t('loadErrorTitle', { ns: 'home' })}
              message={t('loadErrorMessage', { ns: 'home' })}
              actionLabel={t('actions.retry', { ns: 'common' })}
              onAction={loadProducts}
            />
          )}

          {status === 'ready' && (
            <div className="featured-grid">
              {featured.map((product) => (
                <article key={product.id} className="mini-card">
                  <div className="mini-card-media">
                    <img src={product.image} alt={product.name} loading="lazy" />
                  </div>
                  <div className="mini-card-body">
                    <div className="mini-card-meta">
                      <span>{product.category}</span>
                      <span className="rating">
                        <FontAwesomeIcon icon={faStar} /> {product.rating.toFixed(1)}
                      </span>
                    </div>
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    <div className="mini-card-foot">
                      <span className="price">
                        {hasCustomization(product)
                          ? t('priceFrom', {
                              ns: 'home',
                              price: formatMoney(product.basePrice, i18n.language),
                            })
                          : formatMoney(product.basePrice, i18n.language)}
                      </span>
                      <button
                        type="button"
                        className="mini-card-add"
                        onClick={() => handleAdd(product)}
                        disabled={!product.available}
                        aria-label={t('ariaAddToCart', { ns: 'home', name: product.name })}
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Category rail */}
      <section className="section section-tinted">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">{t('browseMenu', { ns: 'home' })}</span>
            <h2 className="section-title">{t('findYourCraving', { ns: 'home' })}</h2>
          </div>
          <div className="category-rail">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className="category-tile"
                onClick={() => openCategory(category)}
              >
                <span className="category-tile-icon">
                  <FontAwesomeIcon
                    icon={CATEGORY_ICONS[category] || faUtensils}
                  />
                </span>
                <span>{category}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section className="section">
        <div className="container">
          <div className="section-head is-center">
            <span className="section-eyebrow">{t('whyOrderHere', { ns: 'home' })}</span>
            <h2 className="section-title">{t('orderingMadeEasy', { ns: 'home' })}</h2>
            <p className="section-sub">{t('orderingMadeEasySub', { ns: 'home' })}</p>
          </div>
          <div className="value-grid">
            {VALUE_PROPS.map((value) => (
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

      {/* Offer band */}
      <section className="section section-tinted">
        <div className="container">
          <div
            className="offer-band"
            style={{ '--band-img': 'url("/images/bg_2.jpg")' }}
          >
            <div className="offer-band-grid">
              <div>
                <h2>{t('grabADeal', { ns: 'home' })}</h2>
                <p>{t('grabADealText', { ns: 'home' })}</p>
                <div className="offer-band-codes">
                  {promoEntries.map(({ code }) => (
                    <span key={code} className="offer-code-pill">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
              <Link to="/offers" className="contact-btn">
                {t('seeAllOffers', { ns: 'home' })} <FontAwesomeIcon icon={faArrowRight} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section">
        <div className="container">
          <div className="section-head is-center">
            <span className="section-eyebrow">{t('howItWorks', { ns: 'home' })}</span>
            <h2 className="section-title">{t('fromCravingToDoorstep', { ns: 'home' })}</h2>
          </div>
          <div className="how-grid">
            {HOW_STEPS.map((step, index) => (
              <div key={step.title} className="how-step">
                <span className="how-num">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="section section-tinted">
        <div className="container">
          <div
            className="cta-band"
            style={{ '--band-img': 'url("/images/bg_3.jpg")' }}
          >
            <h2>{t('hungryYet', { ns: 'home' })}</h2>
            <p>{t('hungryYetText', { ns: 'home' })}</p>
            <Link to="/menu" className="contact-btn">
              {t('orderNow', { ns: 'home' })} <FontAwesomeIcon icon={faArrowRight} />
            </Link>
          </div>
        </div>
      </section>

      {customizing && (
        <ProductModal
          product={customizing}
          onClose={() => setCustomizing(null)}
          onConfirm={handleConfirmCustomization}
        />
      )}
    </>
  );
}

export default HomePage;