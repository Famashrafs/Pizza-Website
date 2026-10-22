import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { faCartShopping } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useFavorites } from '../context/FavoritesContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatMoney } from '../i18n/format';

function Favorites() {
  const { t, i18n } = useTranslation();
  const { favorites, removeFavorite } = useFavorites();
  const { addItem } = useCart();
  const { showToast } = useToast();

  const handleAddToCart = (fav) => {
    addItem(fav);
    showToast(t('toastAddedToCart', { ns: 'home', name: fav.name }));
  };

  const handleRemove = (fav) => {
    removeFavorite(fav.id);
    showToast(t('toastRemovedFromFavorites', { ns: 'home' }));
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">{t('favoritesTitle', { ns: 'home' })}</h1>
      </div>
      <div className="cart-container">
        {favorites.length === 0 ? (
          <div className="auth-card empty-cart">
            <h2>{t('favoritesEmptyTitle', { ns: 'home' })}</h2>
            <p className="auth-subtitle">{t('favoritesEmptyText', { ns: 'home' })}</p>
            <Link to="/menu" className="contact-btn empty-cart-btn">
              {t('browseMenuShort', { ns: 'home' })}
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
                    aria-label={t('ariaRemoveFromFavorites', { ns: 'home', name: fav.name })}
                    onClick={() => handleRemove(fav)}
                  >
                    <FontAwesomeIcon icon={faHeart} />
                  </button>
                </div>
                <div className="product-body">
                  <h4>{fav.name}</h4>
                  <div className="product-foot">
                    <span className="price">{formatMoney(fav.price, i18n.language)}</span>
                    <button
                      type="button"
                      className="product-add"
                      onClick={() => handleAddToCart(fav)}
                    >
                      <FontAwesomeIcon icon={faCartShopping} /> {t('actions.add', { ns: 'common' })}
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
