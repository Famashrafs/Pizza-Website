import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { fetchProductById } from '../services/menuService';
import { createCartItem, hasCustomization } from '../utils/cartItem';
import ProductModal from './ProductModal';

function CartItemEditor({ item, onClose }) {
  const { t } = useTranslation();
  const { updateItem } = useCart();
  const { showToast } = useToast();
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState('idle');

  // The translate function is kept in a ref so a language switch never
  // re-triggers the product fetch below (the effect still runs exactly when
  // the item, the close handler or the toast function changes).
  const translateRef = useRef(t);
  useEffect(() => {
    translateRef.current = t;
  }, [t]);

  useEffect(() => {
    let active = true;
    if (!item) {
      setProduct(null);
      setStatus('idle');
      return () => {
        active = false;
      };
    }
    setStatus('loading');
    fetchProductById(item.productId).then((found) => {
      if (!active) return;
      if (!found || !hasCustomization(found)) {
        showToast(translateRef.current('cart.toastNoOptionsToEdit'), 'error');
        onClose();
        return;
      }
      setProduct(found);
      setStatus('ready');
    });
    return () => {
      active = false;
    };
  }, [item, onClose, showToast]);

  if (!item || status !== 'ready' || !product) return null;

  const handleConfirm = (config) => {
    const next = createCartItem(product, config);
    if (!next) {
      showToast(t('cart.toastInvalidConfiguration'), 'error');
      return;
    }
    updateItem(item.id, next);
    showToast(t('cart.toastUpdated', { name: product.name }));
    onClose();
  };

  return (
    <ProductModal
      product={product}
      mode="edit"
      initialConfig={{ ...(item.config || {}), qty: item.qty }}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
}

export default CartItemEditor;
