import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import {
  faPlus,
  faClipboardList,
  faUtensils,
  faGear,
} from '@fortawesome/free-solid-svg-icons';

function QuickActions() {
  const { t } = useTranslation();

  // The quick actions live inside the component so their copy can be translated.
  const actions = [
    {
      to: '/admin/menu/new',
      labelKey: 'admin.quickAddProduct',
      icon: faPlus,
      hintKey: 'admin.quickAddProductHint',
    },
    {
      to: '/admin/orders',
      labelKey: 'admin.quickViewOrders',
      icon: faClipboardList,
      hintKey: 'admin.quickViewOrdersHint',
    },
    {
      to: '/admin/menu',
      labelKey: 'admin.quickManageMenu',
      icon: faUtensils,
      hintKey: 'admin.quickManageMenuHint',
    },
    {
      to: '/admin/settings',
      labelKey: 'admin.quickSettings',
      icon: faGear,
      hintKey: 'admin.quickSettingsHint',
    },
  ];

  return (
    <section className="admin-quick-actions" aria-label={t('admin.ariaQuickActions')}>
      {actions.map((action) => (
        <Link key={action.to} to={action.to} className="admin-quick-button">
          <span className="admin-quick-icon">
            <FontAwesomeIcon icon={action.icon} />
          </span>
          <span className="admin-quick-text">
            <strong>{t(action.labelKey)}</strong>
            <span>{t(action.hintKey)}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}

export default QuickActions;