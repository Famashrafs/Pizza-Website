import React, { useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faForward,
  faXmark,
  faUser,
  faLocationDot,
  faBagShopping,
  faCreditCard,
  faClockRotateLeft,
  faReceipt,
} from '@fortawesome/free-solid-svg-icons';
import { useRestaurantOrders } from '../../hooks/useRestaurantOrders';
import { updateOrderStatus } from '../../services/orderService';
import {
  ORDER_STATUS,
  ORDER_STATUS_META,
  getNextOrderStatus,
  getAllowedOrderTransitions,
} from '../../config/orderStatus';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import { useToast } from '../../context/ToastContext';
import StatusBadge from '../../components/admin/StatusBadge';
import AdminErrorState from '../../components/admin/AdminErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function DetailsSkeleton() {
  return (
    <div className="admin-order-details">
      <div className="admin-panel">
        <div className="admin-skeleton-chip" style={{ width: 220, height: 28 }} />
        <div className="admin-skeleton-chip" style={{ width: '60%', marginTop: 12 }} />
      </div>
      <div className="admin-panel">
        <div className="admin-skeleton-chip" style={{ width: '100%', height: 120 }} />
      </div>
    </div>
  );
}

function AdminOrderDetails() {
  const { id } = useParams();
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const currency = RESTAURANT_SETTINGS.currency || '$';
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { status, orders, error, reload } = useRestaurantOrders(restaurantId);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const order = useMemo(() => orders.find((entry) => entry.id === id), [orders, id]);

  const changeStatus = async (nextStatus) => {
    if (!order || !nextStatus) return;
    setBusy(true);
    try {
      const result = await updateOrderStatus(order.id, nextStatus, { restaurantId });
      if (result.success) {
        showToast(`Order ${order.id} marked ${result.order.statusMeta.label.toLowerCase()}.`);
      } else {
        showToast(result.error || 'Could not update the order.', 'error');
      }
    } catch (err) {
      showToast('Could not update the order.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="admin-overview">
        <DetailsSkeleton />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="admin-overview">
        <div className="admin-panel">
          <AdminErrorState message={error} onRetry={reload} />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="admin-overview">
        <div className="admin-panel">
          <AdminErrorState
            message="We couldn't find that order. It may have been removed."
            onRetry={() => navigate('/admin/orders')}
          />
        </div>
      </div>
    );
  }

  const nextStatus = getNextOrderStatus(order.fulfillmentType, order.orderStatus);
  const allowedTransitions = getAllowedOrderTransitions(
    order.fulfillmentType,
    order.orderStatus
  );
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const isTerminal =
    order.orderStatus === ORDER_STATUS.DELIVERED || order.orderStatus === ORDER_STATUS.CANCELLED;

  return (
    <div className="admin-overview">
      <button type="button" className="admin-back-link" onClick={() => navigate('/admin/orders')}>
        <FontAwesomeIcon icon={faArrowLeft} /> Back to orders
      </button>

      <div className="admin-page-head">
        <div className="admin-order-title">
          <h2>Order {order.id}</h2>
          <div className="admin-order-title-meta">
            <StatusBadge type="order" value={order.orderStatus} />
            <StatusBadge type="payment" value={order.paymentStatus} />
            <span className="admin-muted">{formatDateTime(order.createdAt)}</span>
          </div>
        </div>
        <div className="admin-page-actions">
          {nextStatus && (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={() => changeStatus(nextStatus)}
              disabled={busy}
            >
              <FontAwesomeIcon icon={faForward} />
              {ORDER_STATUS_META[nextStatus].label}
            </button>
          )}
          {!isTerminal && (
            <button
              type="button"
              className="admin-btn admin-btn--danger-ghost"
              onClick={() => setConfirmCancel(true)}
              disabled={busy}
            >
              <FontAwesomeIcon icon={faXmark} /> Cancel order
            </button>
          )}
        </div>
      </div>

      <section className="admin-panel">
        <div className="admin-status-control">
          <label className="admin-field">
            <span>Update status</span>
            <select
              value={order.orderStatus}
              onChange={(event) => changeStatus(event.target.value)}
              disabled={busy || allowedTransitions.length === 0}
            >
              {allowedTransitions.map((entry) => (
                <option key={entry} value={entry}>
                  {ORDER_STATUS_META[entry].label}
                </option>
              ))}
              {allowedTransitions.length === 0 && (
                <option value={order.orderStatus}>
                  {ORDER_STATUS_META[order.orderStatus]?.label || order.orderStatus}
                </option>
              )}
            </select>
          </label>
        </div>
      </section>

      <div className="admin-order-details">
        <section className="admin-panel">
          <div className="admin-panel-head">
            <h3>
              <FontAwesomeIcon icon={faReceipt} /> Items
            </h3>
          </div>
          <ul className="admin-order-items">
            {(order.items || []).map((item) => (
              <li key={item.id} className="admin-order-item">
                <span className="admin-order-item-qty">{item.qty}×</span>
                <div className="admin-order-item-body">
                  <strong>{item.name}</strong>
                  {(item.desc || item.instructions) && (
                    <span>
                      {item.desc}
                      {item.desc && item.instructions ? ' · ' : ''}
                      {item.instructions && `“${item.instructions}”`}
                    </span>
                  )}
                </div>
                <span className="admin-order-item-price">
                  {currency}
                  {Number(item.lineTotal).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>

          {order.customerNotes && (
            <div className="admin-order-note">
              <strong>Customer notes</strong>
              <p>{order.customerNotes}</p>
            </div>
          )}

          <div className="admin-order-summary">
            <div>
              <span>Subtotal</span>
              <span>
                {currency}
                {Number(order.subtotal).toFixed(2)}
              </span>
            </div>
            {order.discount > 0 && (
              <div>
                <span>Discount {order.pricing?.promoCode ? `(${order.pricing.promoCode})` : ''}</span>
                <span>-{currency}
                  {Number(order.discount).toFixed(2)}
                </span>
              </div>
            )}
            <div>
              <span>Delivery</span>
              <span>
                {order.deliveryFee > 0
                  ? `${currency}${Number(order.deliveryFee).toFixed(2)}`
                  : 'Free'}
              </span>
            </div>
            <div>
              <span>Tax</span>
              <span>
                {currency}
                {Number(order.tax).toFixed(2)}
              </span>
            </div>
            <div className="admin-order-total">
              <span>Total</span>
              <span>
                {currency}
                {Number(order.total).toFixed(2)}
              </span>
            </div>
          </div>
        </section>

        <div className="admin-order-side">
          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>
                <FontAwesomeIcon icon={faUser} /> Customer
              </h3>
            </div>
            <dl className="admin-detail-list">
              <div>
                <dt>Name</dt>
                <dd>{order.customer?.fullName || 'Guest'}</dd>
              </div>
              {order.customer?.phone && (
                <div>
                  <dt>Phone</dt>
                  <dd>{order.customer.phone}</dd>
                </div>
              )}
              {order.customer?.email && (
                <div>
                  <dt>Email</dt>
                  <dd>{order.customer.email}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>
                <FontAwesomeIcon icon={faBagShopping} /> Fulfillment
              </h3>
            </div>
            <dl className="admin-detail-list">
              <div>
                <dt>Type</dt>
                <dd>{order.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}</dd>
              </div>
              <div>
                <dt>Estimate</dt>
                <dd>{order.estimatedTime || '—'}</dd>
              </div>
              {order.addressText && (
                <div>
                  <dt>
                    <FontAwesomeIcon icon={faLocationDot} /> Address
                  </dt>
                  <dd>{order.addressText}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>
                <FontAwesomeIcon icon={faCreditCard} /> Payment
              </h3>
            </div>
            <dl className="admin-detail-list">
              <div>
                <dt>Method</dt>
                <dd className="admin-capitalize">{order.paymentMethod || '—'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusBadge type="payment" value={order.paymentStatus} />
                </dd>
              </div>
            </dl>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>
                <FontAwesomeIcon icon={faClockRotateLeft} /> Timeline
              </h3>
            </div>
            {history.length === 0 ? (
              <p className="admin-muted">No status changes yet.</p>
            ) : (
              <ol className="admin-timeline">
                {history.map((entry, index) => (
                  <li key={`${entry.status}-${entry.at}-${index}`}>
                    <span className="admin-timeline-dot" />
                    <div>
                      <strong>{ORDER_STATUS_META[entry.status]?.label || entry.status}</strong>
                      <span>{formatDateTime(entry.at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title="Cancel this order?"
          message={`Order ${order.id} will be marked as cancelled. The customer will see the change.`}
          confirmLabel="Cancel order"
          danger
          onConfirm={() => {
            setConfirmCancel(false);
            changeStatus(ORDER_STATUS.CANCELLED);
          }}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}

export default AdminOrderDetails;
