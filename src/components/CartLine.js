import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMinus,
  faPlus,
  faTrashCan,
  faPenToSquare,
} from '@fortawesome/free-solid-svg-icons';

function CartLine({
  item,
  variant = 'page',
  onIncrease,
  onDecrease,
  onRemove,
  onEdit,
  editing = false,
}) {
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
            aria-label={`Remove ${item.name} from cart`}
          >
            <FontAwesomeIcon icon={faTrashCan} />
            <span>Remove</span>
          </button>
        </div>

        {optionSummary && <p className="cart-line-config">{optionSummary}</p>}
        {toppingSummary && (
          <p className="cart-line-config">Toppings: {toppingSummary}</p>
        )}
        {!optionSummary && !toppingSummary && item.desc && (
          <p className="cart-line-config">{item.desc}</p>
        )}
        {item.instructions && (
          <p className="cart-line-notes">Note: “{item.instructions}”</p>
        )}

        <div className="cart-line-foot">
          <span className="cart-line-unit">
            ${item.price.toFixed(2)} each
          </span>

          <div className="cart-qty">
            <button
              type="button"
              onClick={() => onDecrease?.(item)}
              disabled={item.qty <= 1}
              aria-label={`Decrease quantity of ${item.name}`}
            >
              <FontAwesomeIcon icon={faMinus} />
            </button>
            <span aria-live="polite">{item.qty}</span>
            <button
              type="button"
              onClick={() => onIncrease?.(item)}
              aria-label={`Increase quantity of ${item.name}`}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>

          <span className="cart-line-total">
            ${(item.lineTotal ?? item.price * item.qty).toFixed(2)}
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
            {editing ? 'Loading…' : 'Edit options'}
          </button>
        )}
      </div>
    </div>
  );
}

export default CartLine;
