import React, { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faMagnifyingGlass,
  faPen,
  faTrash,
  faUtensils,
  faTag,
  faCircleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { useRestaurantProducts } from '../../hooks/useRestaurantProducts';
import { useRestaurantCategories } from '../../hooks/useRestaurantCategories';
import {
  deleteProduct,
  setAvailability as setProductAvailability,
  DEFAULT_PRODUCT_IMAGE,
} from '../../services/menuService';
import { formatMoney } from '../../i18n/format';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';
import SectionTitle from '../../components/account/SectionTitle';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminErrorState from '../../components/admin/AdminErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

const PAGE_SIZE = 8;

function TableSkeleton() {
  return (
    <div className="admin-table admin-table--skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="admin-table-row">
          <div className="admin-skeleton-chip" style={{ height: 40, width: 40 }} />
          <div className="admin-skeleton-chip" style={{ width: 180 }} />
          <div className="admin-skeleton-chip" style={{ width: 90 }} />
          <div className="admin-skeleton-chip" style={{ width: 70 }} />
          <div className="admin-skeleton-chip" style={{ width: 80 }} />
          <div className="admin-skeleton-chip" style={{ width: 120 }} />
        </div>
      ))}
    </div>
  );
}

function AdminMenu() {
  const { t, i18n } = useTranslation();
  const { restaurant, restaurantLoading } = useOutletContext();
  const restaurantId = restaurant?.id || null;

  const { status, products, error, reload } = useRestaurantProducts(restaurantId);
  const { categories } = useRestaurantCategories(restaurantId);
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [availability, setAvailability] = useState('all');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const categoryName = (id) =>
    categories.find((category) => category.id === id)?.name || '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryFilter !== 'all' && product.categoryId !== categoryFilter) return false;
      if (availability === 'available' && !product.available) return false;
      if (availability === 'unavailable' && product.available) return false;
      if (!q) return true;
      const transTexts = Object.values(product.translations || {}).flatMap((tr) =>
        tr && typeof tr === 'object' ? [tr.name, tr.description] : []
      );
      return [product.name, product.description, product.category]
        .concat(transTexts)
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [products, query, categoryFilter, availability]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleAvailability = async (product) => {
    setBusyId(product.id);
    try {
      await setProductAvailability(product.id, !product.available);
      showToast(
        product.available
          ? t('admin.toastMarkedUnavailable', { name: product.name })
          : t('admin.toastNowAvailable', { name: product.name })
      );
    } catch (err) {
      showToast(t('admin.errorUpdateAvailability'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const product = pendingDelete;
    setPendingDelete(null);
    if (!product) return;
    setBusyId(product.id);
    try {
      const result = await deleteProduct(product.id);
      if (result.success) {
        showToast(
          result.mode === 'archived'
            ? t('admin.toastArchived', { name: product.name })
            : t('admin.toastDeleted', { name: product.name })
        );
      } else {
        showToast(result.error || t('admin.errorDeleteProduct'), 'error');
      }
    } catch (err) {
      showToast(t('admin.errorDeleteProduct'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const hasProducts = products.length > 0;

  return (
    <div className="admin-overview">
      <div className="admin-page-head">
        <SectionTitle
          title={t('admin.menuManagement')}
          subtitle={
            restaurantLoading
              ? t('admin.loadingRestaurant')
              : hasProducts
              ? t('admin.menuItemsCount', { count: products.length })
              : t('admin.menuSubtitle')
          }
        />
        <div className="admin-page-actions">
          <Link to="/admin/menu/categories" className="admin-btn admin-btn--ghost">
            <FontAwesomeIcon icon={faTag} /> {t('admin.navCategories')}
          </Link>
          <Link to="/admin/menu/new" className="admin-btn admin-btn--primary">
            <FontAwesomeIcon icon={faPlus} /> {t('admin.addProduct')}
          </Link>
        </div>
      </div>

      {hasProducts && (
        <div className="admin-toolbar">
          <label className="admin-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input
              type="search"
              placeholder={t('admin.searchProducts')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              setPage(1);
            }}
            aria-label={t('admin.ariaFilterCategory')}
          >
            <option value="all">{t('admin.allCategories')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            value={availability}
            onChange={(event) => {
              setAvailability(event.target.value);
              setPage(1);
            }}
            aria-label={t('admin.ariaFilterAvailability')}
          >
            <option value="all">{t('admin.allStatuses')}</option>
            <option value="available">{t('admin.available')}</option>
            <option value="unavailable">{t('admin.unavailable')}</option>
          </select>
        </div>
      )}

      {status === 'loading' && <TableSkeleton />}

      {status === 'error' && (
        <div className="admin-panel">
          <AdminErrorState message={error} onRetry={reload} />
        </div>
      )}

      {status === 'success' && !hasProducts && (
        <div className="admin-panel">
          <AdminEmptyState
            icon={faUtensils}
            title={t('admin.menuEmptyTitle')}
            message={t('admin.menuEmptyMessage')}
            actionLabel={t('admin.addProduct')}
            actionTo="/admin/menu/new"
          />
        </div>
      )}

      {status === 'success' && hasProducts && (
        <div className="admin-panel">
          {pageItems.length === 0 ? (
            <AdminEmptyState
              icon={faCircleExclamation}
              title={t('admin.noProductsMatch')}
              message={t('admin.tryDifferentFilter')}
              actionLabel={t('admin.clearFilters')}
              onAction={() => {
                setQuery('');
                setCategoryFilter('all');
                setAvailability('all');
                setPage(1);
              }}
            />
          ) : (
            <div className="admin-table" role="table" aria-label={t('admin.ariaMenuProducts')}>
              <div className="admin-table-head" role="row">
                <span role="columnheader">{t('admin.colProduct')}</span>
                <span role="columnheader">{t('admin.colCategory')}</span>
                <span role="columnheader">{t('admin.colPrice')}</span>
                <span role="columnheader">{t('admin.colStatus')}</span>
                <span role="columnheader">{t('admin.featured')}</span>
                <span role="columnheader" className="admin-table-actions-head">
                  {t('admin.colActions')}
                </span>
              </div>

              {pageItems.map((product) => (
                <div
                  className={`admin-table-row ${busyId === product.id ? 'is-busy' : ''}`}
                  role="row"
                  key={product.id}
                >
                  <div
                    className="admin-table-product"
                    role="cell"
                    data-label={t('admin.colProduct')}
                  >
                    <img
                      src={product.image || DEFAULT_PRODUCT_IMAGE}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                      }}
                    />
                    <div className="admin-table-product-meta">
                      <strong>{product.name}</strong>
                      <span>{product.description || ''}</span>
                      {product.translations && Object.values(product.translations).some((tr) => tr && (tr.name || tr.description)) ? (
                        <span className="admin-pill" style={{ marginTop: 4, display: 'inline-block' }}>{t('admin.hasTranslations', { defaultValue: 'Translations' })}</span>
                      ) : null}
                    </div>
                  </div>

                  <span className="admin-table-category" role="cell" data-label={t('admin.colCategory')}>
                    {categoryName(product.categoryId) || product.category || '—'}
                  </span>

                  <span className="admin-table-price" role="cell" data-label={t('admin.colPrice')}>
                    {formatMoney(Number(product.basePrice), i18n.language)}
                  </span>

                  <span className="admin-table-status" role="cell" data-label={t('admin.colStatus')}>
                    <button
                      type="button"
                      className={`admin-switch ${product.available ? 'is-on' : 'is-off'}`}
                      onClick={() => toggleAvailability(product)}
                      disabled={busyId === product.id}
                      aria-pressed={product.available}
                      aria-label={t('admin.ariaToggleAvailability', { name: product.name })}
                    >
                      <span className="admin-switch-track">
                        <span className="admin-switch-thumb" />
                      </span>
                      <span className="admin-switch-label">
                        {product.available ? t('admin.available') : t('admin.off')}
                      </span>
                    </button>
                  </span>

                  <span className="admin-table-featured" role="cell" data-label={t('admin.featured')}>
                    {product.featured ? (
                      <span className="admin-badge tone-success">{t('admin.featured')}</span>
                    ) : (
                      <span className="admin-muted">—</span>
                    )}
                  </span>

                  <span className="admin-table-actions" role="cell" data-label={t('admin.colActions')}>
                    <Link
                      to={`/admin/menu/${product.id}/edit`}
                      className="admin-icon-btn admin-icon-btn--sm"
                      aria-label={t('admin.ariaEditProduct', { name: product.name })}
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </Link>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--sm is-danger"
                      onClick={() => setPendingDelete(product)}
                      disabled={busyId === product.id}
                      aria-label={t('admin.ariaDeleteProduct', { name: product.name })}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="admin-pagination">
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                {t('admin.previous')}
              </button>
              <span>
                {t('admin.pageOf', { page: safePage, total: totalPages })}
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                {t('common.actions.next')}
              </button>
            </div>
          )}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('admin.deleteProductTitle')}
          message={t('admin.deleteProductMessage', { name: pendingDelete.name })}
          confirmLabel={t('common.actions.delete')}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

export default AdminMenu;
