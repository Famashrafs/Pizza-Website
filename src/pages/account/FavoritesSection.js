import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { useFavorites } from '../../context/FavoritesContext';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import SectionTitle from '../../components/account/SectionTitle';
import { fetchProducts } from '../../services/menuService';

function FavoritesSection() {
  const { favorites, removeFavorite } = useFavorites();
  const { addItem } = useCart();
  const { showToast } = useToast();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchProducts()
      .then((all) => {
        if (mounted) setProducts(all);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const availabilityById = (id) => {
    const product = products.find((p) => p.id === id);
    return product ? product.available : null; // null = no info
  };

  const handleAddToCart = (fav) => {
    addItem(fav);
    showToast(`${fav.name} added to cart.`);
  };

  const handleRemove = (fav) => {
    removeFavorite(fav.id);
    showToast(`${fav.name} removed from favorites.`);
  };

  if (favorites.length === 0) {
    return (
      <div className="dash-section">
        <SectionTitle
          title="Favorites"
          subtitle="Dishes you have saved"
        />
        <div className="dash-card">
          <div className="dash-empty">
            <FontAwesomeIcon icon={faHeart} className="dash-empty-icon" />
            <p>You have no favorite dishes yet.</p>
            <p className="dash-form-note">
              Tap the heart on any dish to save it here.
            </p>
            <Link to="/menu" className="menu-btn dash-btn-sm">
              Browse Menu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-section">
      <SectionTitle
        title="Favorites"
        subtitle="Dishes you have saved"
      />

      {loading && (
        <div className="dash-fav-card dash-card--skeleton" />
      )}

      {!loading && (
        <div className="dash-fav-grid">
          {favorites.map((fav) => {
            const available = availabilityById(fav.id);
            const isUnavailable = available === false;
            return (
              <div
                className={`dash-fav-card ${isUnavailable ? 'is-unavailable' : ''}`}
                key={fav.id}
              >
                <div className="dash-fav-media">
                  <img src={fav.image} alt={fav.name} />
                  {isUnavailable && (
                    <span className="tag tag-soldout">Currently unavailable</span>
                  )}
                </div>
                <div className="dash-fav-body">
                  <h4>{fav.name}</h4>
                  <p className="dash-fav-price">${fav.price.toFixed(2)}</p>
                  <div className="dash-fav-actions">
                    <Link to="/menu" className="menu-btn dash-btn-xs">
                      View Product
                    </Link>
                    <button
                      type="button"
                      className="menu-btn dash-btn-xs"
                      disabled={isUnavailable}
                      onClick={() => handleAddToCart(fav)}
                    >
                      {isUnavailable ? 'Unavailable' : 'Add to Cart'}
                    </button>
                    <button
                      type="button"
                      className="menu-btn dash-btn-xs is-danger"
                      aria-label={`Remove ${fav.name} from favorites`}
                      onClick={() => handleRemove(fav)}
                    >
                      <FontAwesomeIcon icon={faHeart} /> Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FavoritesSection;