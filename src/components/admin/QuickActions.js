import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faClipboardList,
  faUtensils,
  faGear,
} from '@fortawesome/free-solid-svg-icons';

const ACTIONS = [
  { to: '/admin/menu', label: 'Add Product', icon: faPlus, hint: 'Create a new menu item' },
  { to: '/admin/orders', label: 'View Orders', icon: faClipboardList, hint: 'Manage incoming orders' },
  { to: '/admin/menu', label: 'Manage Menu', icon: faUtensils, hint: 'Edit prices & availability' },
  { to: '/admin/settings', label: 'Restaurant Settings', icon: faGear, hint: 'Hours, delivery & billing' },
];

function QuickActions() {
  return (
    <section className="admin-quick-actions" aria-label="Quick actions">
      {ACTIONS.map((action) => (
        <Link key={action.label} to={action.to} className="admin-quick-button">
          <span className="admin-quick-icon">
            <FontAwesomeIcon icon={action.icon} />
          </span>
          <span className="admin-quick-text">
            <strong>{action.label}</strong>
            <span>{action.hint}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}

export default QuickActions;