import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
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
          <div className="cards">
            {favorites.map((fav) => (
              <div className="card" key={fav.id}>
                <img src={fav.image} alt={fav.name} />
                <h4>{fav.name}</h4>
                <p className="price">${fav.price.toFixed(2)}</p>
                <button onClick={() => handleAddToCart(fav)}>
                  Add to Cart
                </button>
                <button
                  className="favorite-btn"
                  onClick={() => {
                    removeFavorite(fav.id);
                    showToast('Removed from favorites.');
                  }}
                >
                  <FontAwesomeIcon icon={faHeart} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Favorites;