import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faCartShopping } from '@fortawesome/free-solid-svg-icons';
import { CHECKOUT_STEPS } from '../../utils/checkoutLogic';

function CheckoutStepper({ currentStep, maxStepIndex, onStepSelect, stepErrors = {}, cartCount = 0 }) {
  const { t } = useTranslation();
  const currentIndex = CHECKOUT_STEPS.findIndex((step) => step.id === currentStep);

  const renderCart = () => (
    <li className="checkout-step checkout-step--cart">
      <Link to="/cart" className="checkout-step-link">
        <span className="checkout-step-index">
          <FontAwesomeIcon icon={faCartShopping} />
        </span>
        <span className="checkout-step-label">
          {cartCount > 0
            ? t('checkout.cartStepWithCount', { count: cartCount })
            : t('checkout.cartStep')}
        </span>
      </Link>
    </li>
  );

  return (
    <ol className="checkout-stepper" aria-label={t('checkout.ariaCheckoutProgress')}>
      {renderCart()}
      {CHECKOUT_STEPS.map((step, index) => {
        const isActive = step.id === currentStep;
        const isDone = index < currentIndex;
        const isReachable = index <= maxStepIndex;
        const hasError = Boolean(stepErrors[step.id]) && !isActive;

        const classes = [
          'checkout-step',
          isActive ? 'is-active' : '',
          isDone ? 'is-done' : '',
          hasError ? 'is-error' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <li
            key={step.id}
            className={classes}
            aria-current={isActive ? 'step' : undefined}
          >
            <button
              type="button"
              className="checkout-step-link"
              onClick={() => isReachable && onStepSelect(step.id)}
              disabled={!isReachable}
            >
              <span className="checkout-step-index">
                {isDone ? <FontAwesomeIcon icon={faCheck} /> : index + 1}
              </span>
              <span className="checkout-step-label">{t(step.labelKey)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default CheckoutStepper;
