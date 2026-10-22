import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useFavorites } from '../../context/FavoritesContext';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import SectionTitle from '../../components/account/SectionTitle';
import { fetchProducts } from '../../services/menuService';
import { formatMoney } from '../../i18n/format';

function FavoritesSection() {
  const { t, i18n } = useTranslation();
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
    showToast(t('account.toastFavoriteAddedToCart', { name: fav.name }));
  };

  const handleRemove = (fav) => {
    removeFavorite(fav.id);
    showToast(t('account.toastFavoriteRemoved', { name: fav.name }));
  };

  if (favorites.length === 0) {
    return (
      <div className="dash-section">
        <SectionTitle
          title={t('account.navFavorites')}
          subtitle={t('account.favoritesSubtitle')}
        />
        <div className="dash-card">
          <div className="dash-empty">
            <FontAwesomeIcon icon={faHeart} className="dash-empty-icon" />
            <p>{t('account.noFavoriteDishes')}</p>
            <p className="dash-form-note">
              {t('account.favoritesHint')}
            </p>
            <Link to="/menu" className="menu-btn dash-btn-sm">
              {t('account.browseMenu')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-section">
      <SectionTitle
        title={t('account.navFavorites')}
        subtitle={t('account.favoritesSubtitle')}
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
                    <span className="tag tag-soldout">
                      {t('account.currentlyUnavailable')}
                    </span>
                  )}
                </div>
                <div className="dash-fav-body">
                  <h4>{fav.name}</h4>
                  <p className="dash-fav-price">
                    {formatMoney(fav.price, i18n.language)}
                  </p>
                  <div className="dash-fav-actions">
                    <Link to="/menu" className="menu-btn dash-btn-xs">
                      {t('account.viewProduct')}
                    </Link>
                    <button
                      type="button"
                      className="menu-btn dash-btn-xs"
                      disabled={isUnavailable}
                      onClick={() => handleAddToCart(fav)}
                    >
                      {isUnavailable
                        ? t('account.unavailable')
                        : t('account.addToCart')}
                    </button>
                    <button
                      type="button"
                      className="menu-btn dash-btn-xs is-danger"
                      aria-label={t('account.ariaRemoveFromFavorites', {
                        name: fav.name,
                      })}
                      onClick={() => handleRemove(fav)}
                    >
                      <FontAwesomeIcon icon={faHeart} />{' '}
                      {t('common.actions.remove')}
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
