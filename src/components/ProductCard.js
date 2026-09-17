import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faStar,
  faHeart as solidHeart,
} from '@fortawesome/free-solid-svg-icons';
import { faHeart as regularHeart } from '@fortawesome/free-regular-svg-icons';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { createSimpleCartItem, hasCustomization } from '../utils/cartItem';

function ProductCard({ product, onCustomize }) {
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { showToast } = useToast();

  const customizable = hasCustomization(product);
  const favorite = isFavorite(product.id);

  const handleAdd = () => {
    if (!product.available) return;
    if (customizable) {
      onCustomize(product);
      return;
    }
    addItem(createSimpleCartItem(product));
    showToast(`${product.name} added to cart.`);
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
        ? `${product.name} added to favorites.`
        : `${product.name} removed from favorites.`
    );
  };

  return (
    <article className={`product-card ${product.available ? '' : 'unavailable'}`}>
      <div className="product-media">
        <img src={product.image} alt={product.name} loading="lazy" />
        <div className="card-badges">
          {product.featured && <span className="tag tag-featured">Featured</span>}
          {product.popular && <span className="tag tag-popular">Popular</span>}
          {product.vegetarian && <span className="tag tag-veg">Veg</span>}
          {!product.available && <span className="tag tag-soldout">Sold Out</span>}
        </div>
        <button
          className={`favorite-toggle ${favorite ? 'active' : ''}`}
          onClick={handleFavorite}
          aria-label="Toggle favorite"
        >
          <FontAwesomeIcon icon={favorite ? solidHeart : regularHeart} />
        </button>
      </div>

      <div className="product-body">
        <div className="product-meta">
          <span className="product-category">{product.category}</span>
          <span className="product-rating">
            <FontAwesomeIcon icon={faStar} /> {product.rating.toFixed(1)}
          </span>
        </div>
        <h4>{product.name}</h4>
        <p className="product-desc">{product.description}</p>
        <div className="product-foot">
          <span className="price">
            {customizable
              ? `from $${product.basePrice.toFixed(2)}`
              : `$${product.basePrice.toFixed(2)}`}
          </span>
          <button
            className="product-add"
            onClick={handleAdd}
            disabled={!product.available}
          >
            {!product.available
              ? 'Sold Out'
              : customizable
              ? 'Customize'
              : 'Add'}
          </button>
        </div>
      </div>
    </article>
  );
}

export default ProductCard;