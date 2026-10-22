import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMinus,
  faPlus,
  faTrashCan,
  faPenToSquare,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../i18n/format';

function CartLine({
  item,
  variant = 'page',
  onIncrease,
  onDecrease,
  onRemove,
  onEdit,
  editing = false,
}) {
  const { t, i18n } = useTranslation();
  const optionSummary = [item.size, item.crust].filter(Boolean).join(' · ');
  const toppingSummary = (item.toppings || []).join(', ');
  const configurable = Boolean(onEdit);

  return (
    <div className={`cart-line cart-line--${variant}`}>
      <img className="cart-line-img" src={item.image} alt={item.name} />

      <div className="cart-line-body">
        <div className="cart-line-head">
          <h4>{item.name}</h4>
          <button
            type="button"
            className="cart-line-remove"
            onClick={() => onRemove?.(item)}
            aria-label={t('cart.ariaRemoveItem', { name: item.name })}
          >
            <FontAwesomeIcon icon={faTrashCan} />
            <span>{t('common.actions.remove')}</span>
          </button>
        </div>

        {optionSummary && <p className="cart-line-config">{optionSummary}</p>}
        {toppingSummary && (
          <p className="cart-line-config">
            {t('cart.toppingsLabel', { toppings: toppingSummary })}
          </p>
        )}
        {!optionSummary && !toppingSummary && item.desc && (
          <p className="cart-line-config">{item.desc}</p>
        )}
        {item.instructions && (
          <p className="cart-line-notes">
            {t('cart.noteLabel', { note: item.instructions })}
          </p>
        )}

        <div className="cart-line-foot">
          <span className="cart-line-unit">
            {t('cart.priceEach', {
              price: formatMoney(item.price, i18n.language),
            })}
          </span>

          <div className="cart-qty">
            <button
              type="button"
              onClick={() => onDecrease?.(item)}
              disabled={item.qty <= 1}
              aria-label={t('cart.ariaDecreaseQty', { name: item.name })}
            >
              <FontAwesomeIcon icon={faMinus} />
            </button>
            <span aria-live="polite">{item.qty}</span>
            <button
              type="button"
              onClick={() => onIncrease?.(item)}
              aria-label={t('cart.ariaIncreaseQty', { name: item.name })}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>

          <span className="cart-line-total">
            {formatMoney(item.lineTotal ?? item.price * item.qty, i18n.language)}
          </span>
        </div>

        {configurable && (
          <button
            type="button"
            className="cart-edit"
            onClick={() => onEdit(item)}
            disabled={editing}
          >
            <FontAwesomeIcon icon={faPenToSquare} />{' '}
            {editing ? t('common.actions.loading') : t('cart.editOptions')}
          </button>
        )}
      </div>
    </div>
  );
}

export default CartLine;
