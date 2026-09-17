import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faXmark,
  faStar,
  faMinus,
  faPlus,
} from '@fortawesome/free-solid-svg-icons';
import {
  calculateUnitPrice,
  calculateTotal,
  normalizeQty,
  resolveCrust,
  resolveSize,
  validateConfiguration,
} from '../utils/cartItem';

const MAX_INSTRUCTIONS = 200;
const INSTRUCTION_SUGGESTIONS = ['No onions', 'Extra crispy', 'Cut into 8 pieces'];
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const formatAdjust = (value) => {
  const amount = Number(value) || 0;
  if (amount === 0) return 'Included';
  return `${amount > 0 ? '+' : '-'}$${Math.abs(amount).toFixed(2)}`;
};

function ProductModal({
  product,
  initialConfig = null,
  mode = 'add',
  onClose,
  onConfirm,
}) {
  const sizes = product.sizes || [];
  const crusts = (product.crusts || []).filter(
    (crustOption) => crustOption.available !== false
  );
  const toppingsList = product.toppings || [];
  const maxToppings = Number(product.maxToppings) || 0;

  const [size, setSize] = useState(() =>
    resolveSize(product, initialConfig?.sizeLabel)
  );
  const [crust, setCrust] = useState(() =>
    resolveCrust(product, initialConfig?.crustId)
  );
  const [selectedToppingIds, setSelectedToppingIds] = useState(() => {
    const ids = initialConfig?.toppingIds || [];
    const valid = toppingsList
      .filter((topping) => topping.available !== false && ids.includes(topping.id))
      .map((topping) => topping.id);
    return maxToppings > 0 ? valid.slice(0, maxToppings) : valid;
  });
  const [qty, setQty] = useState(() => normalizeQty(initialConfig?.qty ?? 1));
  const [instructions, setInstructions] = useState(
    () => initialConfig?.instructions || ''
  );
  const [showErrors, setShowErrors] = useState(false);

  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  const selectedToppings = useMemo(
    () =>
      (product.toppings || []).filter((topping) =>
        selectedToppingIds.includes(topping.id)
      ),
    [product.toppings, selectedToppingIds]
  );

  const unitPrice = calculateUnitPrice(product, {
    size,
    crust,
    toppings: selectedToppings,
  });
  const total = calculateTotal(product, {
    size,
    crust,
    toppings: selectedToppings,
    qty,
  });
  const validation = validateConfiguration(product, {
    size,
    crust,
    toppings: selectedToppings,
    qty,
    instructions,
  });

  const atMax = maxToppings > 0 && selectedToppingIds.length >= maxToppings;

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (dialogRef.current) {
      dialogRef.current.focus();
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused.current && previouslyFocused.current.focus) {
        previouslyFocused.current.focus();
      }
    };
  }, [onClose]);

  const handleTab = (event) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const nodes = Array.from(
      dialogRef.current.querySelectorAll(FOCUSABLE)
    ).filter((node) => node.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const setQtyBy = (delta) => setQty((current) => normalizeQty(current + delta));

  const toggleTopping = (id) => {
    setShowErrors(false);
    setSelectedToppingIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((value) => value !== id);
      }
      if (maxToppings > 0 && prev.length >= maxToppings) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleSuggestion = (text) => {
    setInstructions((prev) => {
      if (prev.includes(text)) {
        return prev
          .replace(text, '')
          .replace(/,\s*,/g, ',')
          .replace(/^[,\s]+|[,\s]+$/g, '');
      }
      const next = prev.trim() ? `${prev.trim()}, ${text}` : text;
      return next.slice(0, MAX_INSTRUCTIONS);
    });
  };

  const handleSubmit = () => {
    if (!validation.valid) {
      setShowErrors(true);
      return;
    }
    onConfirm({ size, crust, toppings: selectedToppings, qty, instructions });
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleTab}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close customization dialog"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>

        <div className="modal-media">
          <img src={product.image} alt={product.name} />
        </div>

        <div className="modal-content">
          <div className="modal-scroll">
            <div className="product-meta">
              <span className="product-category">{product.category}</span>
              <span className="product-rating">
                <FontAwesomeIcon icon={faStar} /> {product.rating.toFixed(1)}
              </span>
            </div>
            <h3 id="product-modal-title">{product.name}</h3>
            <p className="product-desc">{product.description}</p>

            {product.ingredients && product.ingredients.length > 0 && (
              <div className="ingredient-chips">
                {product.ingredients.map((ingredient) => (
                  <span key={ingredient} className="ingredient-chip">
                    {ingredient}
                  </span>
                ))}
              </div>
            )}

            {sizes.length > 0 && (
              <fieldset className="option-group">
                <legend>Size</legend>
                <div className="choice-row">
                  {sizes.map((option) => {
                    const active = Boolean(size) && size.label === option.label;
                    return (
                      <label
                        key={option.id || option.label}
                        className={`option-choice ${active ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="product-size"
                          value={option.label}
                          checked={active}
                          onChange={() => {
                            setShowErrors(false);
                            setSize(option);
                          }}
                        />
                        <span className="option-face">
                          <span className="option-label">{option.label}</span>
                          <small className="option-price">
                            {formatAdjust(option.adjust)}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {crusts.length > 0 && (
              <fieldset className="option-group">
                <legend>Crust</legend>
                <div className="choice-row">
                  {crusts.map((option) => {
                    const active = Boolean(crust) && crust.id === option.id;
                    return (
                      <label
                        key={option.id}
                        className={`option-choice ${active ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="product-crust"
                          value={option.id}
                          checked={active}
                          onChange={() => {
                            setShowErrors(false);
                            setCrust(option);
                          }}
                        />
                        <span className="option-face">
                          <span className="option-label">{option.label}</span>
                          <small className="option-price">
                            {formatAdjust(option.price)}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {toppingsList.length > 0 && (
              <fieldset className="option-group">
                <legend>
                  Extra toppings
                  {maxToppings > 0 && (
                    <span className={`option-count ${atMax ? 'at-max' : ''}`}>
                      {selectedToppingIds.length}/{maxToppings}
                    </span>
                  )}
                </legend>
                <div className="topping-options">
                  {toppingsList.map((option) => {
                    const checked = selectedToppingIds.includes(option.id);
                    const unavailable = option.available === false;
                    const disabled = unavailable || (!checked && atMax);
                    return (
                      <label
                        key={option.id}
                        className={`topping-option ${checked ? 'selected' : ''} ${
                          disabled ? 'disabled' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleTopping(option.id)}
                          aria-label={`${option.name}${
                            unavailable ? ' (unavailable)' : ''
                          }`}
                        />
                        <span className="topping-name">{option.name}</span>
                        <small className="topping-price">
                          {unavailable
                            ? 'Sold out'
                            : `+$${option.price.toFixed(2)}`}
                        </small>
                      </label>
                    );
                  })}
                </div>
                {maxToppings > 0 && (
                  <p className={`option-note ${atMax ? 'at-max' : ''}`}>
                    {atMax
                      ? `Maximum of ${maxToppings} toppings reached.`
                      : `Choose up to ${maxToppings} toppings.`}
                  </p>
                )}
              </fieldset>
            )}

            <div className="option-group">
              <label className="option-legend" htmlFor="product-instructions">
                Special instructions
              </label>
              <textarea
                id="product-instructions"
                className="instructions-input"
                maxLength={MAX_INSTRUCTIONS}
                placeholder="e.g. No onions, extra crispy, cut into 8 pieces"
                value={instructions}
                onChange={(event) =>
                  setInstructions(event.target.value.slice(0, MAX_INSTRUCTIONS))
                }
                aria-describedby="product-instructions-meta"
              />
              <div className="instructions-suggestions">
                {INSTRUCTION_SUGGESTIONS.map((text) => {
                  const active = instructions.includes(text);
                  return (
                    <button
                      key={text}
                      type="button"
                      className={`instruction-chip ${active ? 'active' : ''}`}
                      onClick={() => toggleSuggestion(text)}
                      aria-pressed={active}
                    >
                      {text}
                    </button>
                  );
                })}
                <span id="product-instructions-meta" className="instructions-count">
                  {instructions.length}/{MAX_INSTRUCTIONS}
                </span>
              </div>
            </div>

            {showErrors && !validation.valid && (
              <div className="modal-error" role="alert">
                {validation.errors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            )}
          </div>

          <div className="modal-foot">
            <div className="modal-total">
              <span className="modal-total-label">Total</span>
              <span className="modal-total-value">${total.toFixed(2)}</span>
              <small>${unitPrice.toFixed(2)} each</small>
            </div>

            <div className="qty-stepper" role="group" aria-label="Quantity">
              <button
                type="button"
                onClick={() => setQtyBy(-1)}
                disabled={qty <= 1}
                aria-label="Decrease quantity"
              >
                <FontAwesomeIcon icon={faMinus} />
              </button>
              <span aria-live="polite">{qty}</span>
              <button
                type="button"
                onClick={() => setQtyBy(1)}
                aria-label="Increase quantity"
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
            </div>

            <button
              type="button"
              className="product-add modal-add"
              onClick={handleSubmit}
              aria-disabled={!validation.valid}
            >
              {mode === 'edit' ? 'Update cart' : 'Add to cart'} · ${total.toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductModal;
