import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faStar,
  faHeart as solidHeart,
} from '@fortawesome/free-solid-svg-icons';
import { faHeart as regularHeart } from '@fortawesome/free-regular-svg-icons';
import { useTranslation } from 'react-i18next';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { createSimpleCartItem, hasCustomization } from '../utils/cartItem';
import { formatMoney } from '../i18n/format';
import {
  localizedProductCategory,
  localizedProductDescription,
  localizedProductName,
} from '../utils/menuTranslations';

function ProductCard({ product, onCustomize }) {
  const { t, i18n } = useTranslation();
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { showToast } = useToast();

  const customizable = hasCustomization(product);
  const favorite = isFavorite(product.id);
  // Display-only translations; price, ids and the filter value stay untouched.
  const name = localizedProductName(product, i18n.language);
  const description = localizedProductDescription(product, i18n.language);
  const category = localizedProductCategory(product, i18n.language);

  const handleAdd = () => {
    if (!product.available) return;
    if (customizable) {
      onCustomize(product);
      return;
    }
    addItem(createSimpleCartItem(product));
    showToast(t('menu.toastAddedToCart', { name }));
  };

  const handleFavorite = () => {
    const added = toggleFavorite({
      id: product.id,
      name: product.name,
      price: product.basePrice,
      image: product.image,
    });
    showToast(
      added
        ? t('menu.toastAddedToFavorites', { name })
        : t('menu.toastRemovedFromFavorites', { name })
    );
  };

  return (
    <article className={`product-card ${product.available ? '' : 'unavailable'}`}>
      <div className="product-media">
        <img src={product.image} alt={name} loading="lazy" />
        <div className="card-badges">
          {product.featured && (
            <span className="tag tag-featured">{t('menu.badgeFeatured')}</span>
          )}
          {product.popular && (
            <span className="tag tag-popular">{t('menu.badgePopular')}</span>
          )}
          {product.vegetarian && (
            <span className="tag tag-veg">{t('menu.badgeVegetarian')}</span>
          )}
          {!product.available && (
            <span className="tag tag-soldout">{t('menu.badgeSoldOut')}</span>
          )}
        </div>
        <button
          className={`favorite-toggle ${favorite ? 'active' : ''}`}
          onClick={handleFavorite}
          aria-label={t('menu.ariaToggleFavorite')}
        >
          <FontAwesomeIcon icon={favorite ? solidHeart : regularHeart} />
        </button>
      </div>

      <div className="product-body">
        <div className="product-meta">
          <span className="product-category">{category}</span>
          <span className="product-rating">
            <FontAwesomeIcon icon={faStar} /> {product.rating.toFixed(1)}
          </span>
        </div>
        <h4>{name}</h4>
        <p className="product-desc">{description}</p>
        <div className="product-foot">
          <span className="price">
            {customizable
              ? t('menu.priceFrom', {
                  price: formatMoney(product.basePrice, i18n.language),
                })
              : formatMoney(product.basePrice, i18n.language)}
          </span>
          <button
            className="product-add"
            onClick={handleAdd}
            disabled={!product.available}
          >
            {!product.available
              ? t('menu.badgeSoldOut')
              : customizable
              ? t('menu.customize')
              : t('common.actions.add')}
          </button>
        </div>
      </div>
    </article>
  );
}

export default ProductCard;