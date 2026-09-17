import React, { useEffect, useState } from 'react';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { fetchProductById } from '../services/menuService';
import { createCartItem, hasCustomization } from '../utils/cartItem';
import ProductModal from './ProductModal';

function CartItemEditor({ item, onClose }) {
  const { updateItem } = useCart();
  const { showToast } = useToast();
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState('idle');

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
        showToast('This item has no options to edit.', 'error');
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
      showToast('That configuration is not valid.', 'error');
      return;
    }
    updateItem(item.id, next);
    showToast(`${product.name} updated.`);
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
