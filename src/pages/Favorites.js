import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { faCartShopping } from '@fortawesome/free-solid-svg-icons';
import { useFavorites } from '../context/FavoritesContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';

function Favorites() {
  const { favorites, removeFavorite } = useFavorites();
  const { addItem } = useCart();
  const { showToast } = useToast();

  const handleAddToCart = (fav) => {
    addItem(fav);
    showToast(`${fav.name} added to cart.`);
  };

  const handleRemove = (fav) => {
    removeFavorite(fav.id);
    showToast('Removed from favorites.');
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">FAVORITES</h1>
      </div>
      <div className="cart-container">
        {favorites.length === 0 ? (
          <div className="auth-card empty-cart">
            <h2>No favorites yet</h2>
            <p className="auth-subtitle">
              Tap the heart on any dish to save it here.
            </p>
            <Link to="/menu" className="contact-btn empty-cart-btn">
              Browse Menu
            </Link>
          </div>
        ) : (
          <div className="product-grid">
            {favorites.map((fav) => (
              <article className="product-card" key={fav.id}>
                <div className="product-media">
                  <img src={fav.image} alt={fav.name} loading="lazy" />
                  <button
                    type="button"
                    className="favorite-toggle active"
                    aria-label={`Remove ${fav.name} from favorites`}
                    onClick={() => handleRemove(fav)}
                  >
                    <FontAwesomeIcon icon={faHeart} />
                  </button>
                </div>
                <div className="product-body">
                  <h4>{fav.name}</h4>
                  <div className="product-foot">
                    <span className="price">${fav.price.toFixed(2)}</span>
                    <button
                      type="button"
                      className="product-add"
                      onClick={() => handleAddToCart(fav)}
                    >
                      <FontAwesomeIcon icon={faCartShopping} /> Add
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Favorites;