import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
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

const VALUE_PROPS = [
  {
    icon: faFire,
    title: 'Wood-fired freshness',
    text: 'Every pizza is stone-baked in our wood-fired oven, so it arrives blistered, smoky and exactly as it should be.',
  },
  {
    icon: faTruckFast,
    title: 'Tracked to your door',
    text: 'Follow your order from the oven to your address — no refresh guessing, just live status updates.',
  },
  {
    icon: faClock,
    title: 'Delivery in minutes',
    text: `Hot, fresh and on time. Estimate ${RESTAURANT_SETTINGS.delivery.estimatedMinutes[0]}–${RESTAURANT_SETTINGS.delivery.estimatedMinutes[1]} minutes for delivery, or grab takeout at our counter.`,
  },
];

const HOW_STEPS = [
  {
    icon: faHandPointer,
    title: 'Pick your dishes',
    text: 'Browse the menu and customize your pizza with toppings, crust and size.',
  },
  {
    icon: faWallet,
    title: 'Check out in seconds',
    text: 'Delivery or pickup, saved addresses and payment details make repeat orders a tap away.',
  },
  {
    icon: faFireBurner,
    title: 'We cook it fresh',
    text: 'Your order hits the wood-fired oven the moment the kitchen receives it.',
  },
  {
    icon: faTruckFast,
    title: 'Track it to your door',
    text: 'Follow each step in real time, from prep to the courier on your street.',
  },
];

function HomePage() {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [customizing, setCustomizing] = useState(null);

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
    showToast(`${product.name} added to cart.`);
  };

  const handleConfirmCustomization = (config) => {
    const item = createCartItem(customizing, config);
    if (!item) {
      showToast('That configuration is not valid.', 'error');
      return;
    }
    addItem(item);
    showToast(`${customizing.name} added to cart.`);
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
                <FontAwesomeIcon icon={faFire} /> Wood-fired kitchen &amp; delivery
              </span>
              <h1 className="hero-title">
                Real dough. <em>Real fire.</em> Real fast.
              </h1>
              <p className="hero-sub">
                Hand-stretched dough, slow-risen overnight and baked in a wood-fired
                oven. Order online in minutes and watch it go from oven to your door.
              </p>
              <div className="hero-cta">
                <Link to="/menu" className="contact-btn">
                  Browse the menu <FontAwesomeIcon icon={faArrowRight} />
                </Link>
                <Link to="/offers" className="menu-btn">
                  Today&rsquo;s offers
                </Link>
              </div>
              <div className="hero-trust">
                <div className="hero-trust-item">
                  <FontAwesomeIcon icon={faClock} />
                  <div>
                    <strong>Open daily</strong>
                    <span>{RESTAURANT_SETTINGS.pickup.hours}</span>
                  </div>
                </div>
                <div className="hero-trust-item">
                  <FontAwesomeIcon icon={faTruckFast} />
                  <div>
                    <strong>
                      {RESTAURANT_SETTINGS.delivery.estimatedMinutes[0]}–
                      {RESTAURANT_SETTINGS.delivery.estimatedMinutes[1]} min
                    </strong>
                    <span>Fresh at your door</span>
                  </div>
                </div>
                <div className="hero-trust-item">
                  <FontAwesomeIcon icon={faStar} />
                  <div>
                    <strong>4.8 rated</strong>
                    <span>Loved by regulars</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="hero-media">
              <div className="hero-rating-chip">
                <FontAwesomeIcon icon={faStar} /> 4.8 · 1,000+ orders
              </div>
              <div className="hero-img-wrap">
                <img
                  src="/images/BA-Perfect-Pizza.webp"
                  alt="A wood-fired pizza straight from the oven"
                />
              </div>
              <div className="hero-card">
                <span className="hero-card-icon">
                  <FontAwesomeIcon icon={faFire} />
                </span>
                <div>
                  <strong>Stone-baked</strong>
                  <span>90 seconds at 450°C</span>
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
            <span className="section-eyebrow">From the kitchen</span>
            <h2 className="section-title">Featured this week</h2>
            <p className="section-sub">
              Our most-loved dishes, ready in minutes and customizable to taste.
            </p>
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
              title="We couldn't load the menu"
              message="Something went wrong while fetching the home menu. Try again."
              actionLabel="Try again"
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
                          ? `from $${product.basePrice.toFixed(2)}`
                          : `$${product.basePrice.toFixed(2)}`}
                      </span>
                      <button
                        type="button"
                        className="mini-card-add"
                        onClick={() => handleAdd(product)}
                        disabled={!product.available}
                        aria-label={`Add ${product.name} to cart`}
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
            <span className="section-eyebrow">Browse the menu</span>
            <h2 className="section-title">Find your craving</h2>
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
            <span className="section-eyebrow">Why order here</span>
            <h2 className="section-title">Ordering made easy</h2>
            <p className="section-sub">
              A restaurant-grade experience without the fuss of a phone call.
            </p>
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
                <h2>Grab a deal while it&rsquo;s hot</h2>
                <p>
                  Enter a code at checkout and the discount is applied instantly.
                  No sign-up tricks, just savings.
                </p>
                <div className="offer-band-codes">
                  {promoEntries.map(({ code }) => (
                    <span key={code} className="offer-code-pill">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
              <Link to="/offers" className="contact-btn">
                See all offers <FontAwesomeIcon icon={faArrowRight} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section">
        <div className="container">
          <div className="section-head is-center">
            <span className="section-eyebrow">How it works</span>
            <h2 className="section-title">From craving to doorstep</h2>
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
            <h2>Hungry yet?</h2>
            <p>
              Hot pizza doesn&rsquo;t wait. Order now and we&rsquo;ll have it out
              of the oven before you finish reading this.
            </p>
            <Link to="/menu" className="contact-btn">
              Order now <FontAwesomeIcon icon={faArrowRight} />
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