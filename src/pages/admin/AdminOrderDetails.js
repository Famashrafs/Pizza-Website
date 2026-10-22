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
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatMoney } from '../../i18n/format';
import StatusBadge from '../../components/admin/StatusBadge';
import AdminErrorState from '../../components/admin/AdminErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

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
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { status, orders, error, reload } = useRestaurantOrders(restaurantId);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const order = useMemo(() => orders.find((entry) => entry.id === id), [orders, id]);

  const statusLabel = (value) => {
    const meta = ORDER_STATUS_META[value];
    if (!meta) return value;
    return t(meta.labelKey, { defaultValue: meta.label });
  };

  const changeStatus = async (nextStatus) => {
    if (!order || !nextStatus) return;
    setBusy(true);
    try {
      const result = await updateOrderStatus(order.id, nextStatus, { restaurantId });
      if (result.success) {
        showToast(
          t('admin.toastOrderMarked', {
            id: order.id,
            status: t(result.order.statusMeta.labelKey, {
              defaultValue: result.order.statusMeta.label,
            }),
          })
        );
      } else {
        showToast(result.error || t('admin.errorUpdateOrder'), 'error');
      }
    } catch (err) {
      showToast(t('admin.errorUpdateOrder'), 'error');
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
            message={t('admin.errorOrderNotFound')}
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
        <FontAwesomeIcon icon={faArrowLeft} /> {t('admin.backToOrders')}
      </button>

      <div className="admin-page-head">
        <div className="admin-order-title">
          <h2>{t('admin.orderTitle', { id: order.id })}</h2>
          <div className="admin-order-title-meta">
            <StatusBadge type="order" value={order.orderStatus} />
            <StatusBadge type="payment" value={order.paymentStatus} />
            <span className="admin-muted">
              {formatDateTime(order.createdAt, i18n.language) || '—'}
            </span>
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
              {statusLabel(nextStatus)}
            </button>
          )}
          {!isTerminal && (
            <button
              type="button"
              className="admin-btn admin-btn--danger-ghost"
              onClick={() => setConfirmCancel(true)}
              disabled={busy}
            >
              <FontAwesomeIcon icon={faXmark} /> {t('admin.cancelOrder')}
            </button>
          )}
        </div>
      </div>

      <section className="admin-panel">
        <div className="admin-status-control">
          <label className="admin-field">
            <span>{t('admin.updateStatus')}</span>
            <select
              value={order.orderStatus}
              onChange={(event) => changeStatus(event.target.value)}
              disabled={busy || allowedTransitions.length === 0}
            >
              {allowedTransitions.map((entry) => (
                <option key={entry} value={entry}>
                  {statusLabel(entry)}
                </option>
              ))}
              {allowedTransitions.length === 0 && (
                <option value={order.orderStatus}>
                  {statusLabel(order.orderStatus) || order.orderStatus}
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
              <FontAwesomeIcon icon={faReceipt} /> {t('admin.colItems')}
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
                  {formatMoney(Number(item.lineTotal), i18n.language)}
                </span>
              </li>
            ))}
          </ul>

          {order.customerNotes && (
            <div className="admin-order-note">
              <strong>{t('admin.customerNotes')}</strong>
              <p>{order.customerNotes}</p>
            </div>
          )}

          <div className="admin-order-summary">
            <div>
              <span>{t('admin.subtotal')}</span>
              <span>{formatMoney(Number(order.subtotal), i18n.language)}</span>
            </div>
            {order.discount > 0 && (
              <div>
                <span>
                  {order.pricing?.promoCode
                    ? t('admin.discountWithCode', { code: order.pricing.promoCode })
                    : t('admin.discount')}
                </span>
                <span>-{formatMoney(Number(order.discount), i18n.language)}</span>
              </div>
            )}
            <div>
              <span>{t('admin.deliveryFee')}</span>
              <span>
                {order.deliveryFee > 0
                  ? formatMoney(Number(order.deliveryFee), i18n.language)
                  : t('admin.free')}
              </span>
            </div>
            <div>
              <span>{t('admin.tax')}</span>
              <span>{formatMoney(Number(order.tax), i18n.language)}</span>
            </div>
            <div className="admin-order-total">
              <span>{t('admin.total')}</span>
              <span>{formatMoney(Number(order.total), i18n.language)}</span>
            </div>
          </div>
        </section>

        <div className="admin-order-side">
          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>
                <FontAwesomeIcon icon={faUser} /> {t('admin.colCustomer')}
              </h3>
            </div>
            <dl className="admin-detail-list">
              <div>
                <dt>{t('admin.colName')}</dt>
                <dd>{order.customer?.fullName || t('admin.guest')}</dd>
              </div>
              {order.customer?.phone && (
                <div>
                  <dt>{t('admin.colPhone')}</dt>
                  <dd>{order.customer.phone}</dd>
                </div>
              )}
              {order.customer?.email && (
                <div>
                  <dt>{t('admin.colEmail')}</dt>
                  <dd>{order.customer.email}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>
                <FontAwesomeIcon icon={faBagShopping} /> {t('admin.fulfillment')}
              </h3>
            </div>
            <dl className="admin-detail-list">
              <div>
                <dt>{t('admin.colType')}</dt>
                <dd>
                  {order.fulfillmentType === 'pickup' ? t('admin.pickup') : t('admin.delivery')}
                </dd>
              </div>
              <div>
                <dt>{t('admin.estimate')}</dt>
                <dd>{order.estimatedTime || '—'}</dd>
              </div>
              {order.addressText && (
                <div>
                  <dt>
                    <FontAwesomeIcon icon={faLocationDot} /> {t('admin.colAddress')}
                  </dt>
                  <dd>{order.addressText}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>
                <FontAwesomeIcon icon={faCreditCard} /> {t('admin.payment')}
              </h3>
            </div>
            <dl className="admin-detail-list">
              <div>
                <dt>{t('admin.colMethod')}</dt>
                <dd className="admin-capitalize">{order.paymentMethod || '—'}</dd>
              </div>
              <div>
                <dt>{t('admin.colStatus')}</dt>
                <dd>
                  <StatusBadge type="payment" value={order.paymentStatus} />
                </dd>
              </div>
            </dl>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h3>
                <FontAwesomeIcon icon={faClockRotateLeft} /> {t('admin.timeline')}
              </h3>
            </div>
            {history.length === 0 ? (
              <p className="admin-muted">{t('admin.noStatusChanges')}</p>
            ) : (
              <ol className="admin-timeline">
                {history.map((entry, index) => (
                  <li key={`${entry.status}-${entry.at}-${index}`}>
                    <span className="admin-timeline-dot" />
                    <div>
                      <strong>{statusLabel(entry.status) || entry.status}</strong>
                      <span>{formatDateTime(entry.at, i18n.language) || '—'}</span>
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
          title={t('admin.cancelOrderTitle')}
          message={t('admin.cancelOrderMessage', { id: order.id })}
          confirmLabel={t('admin.cancelOrder')}
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
