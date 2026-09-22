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
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import { useToast } from '../../context/ToastContext';
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
  const { restaurant, restaurantLoading } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const currency = RESTAURANT_SETTINGS.currency || '$';

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
      return [product.name, product.description, product.category]
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
      setProductAvailability(product.id, !product.available);
      showToast(
        product.available
          ? `${product.name} marked unavailable.`
          : `${product.name} is now available.`
      );
    } catch (err) {
      showToast('Could not update availability.', 'error');
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
      const result = deleteProduct(product.id);
      if (result.success) {
        showToast(
          result.mode === 'archived'
            ? `${product.name} archived (it appears in past orders).`
            : `${product.name} deleted.`
        );
      } else {
        showToast(result.error || 'Could not delete the product.', 'error');
      }
    } catch (err) {
      showToast('Could not delete the product.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const hasProducts = products.length > 0;

  return (
    <div className="admin-overview">
      <div className="admin-page-head">
        <SectionTitle
          title="Menu Management"
          subtitle={
            restaurantLoading
              ? 'Loading your restaurant…'
              : hasProducts
              ? `${products.length} item${products.length === 1 ? '' : 's'} on your menu`
              : 'Create and organize your menu'
          }
        />
        <div className="admin-page-actions">
          <Link to="/admin/menu/categories" className="admin-btn admin-btn--ghost">
            <FontAwesomeIcon icon={faTag} /> Categories
          </Link>
          <Link to="/admin/menu/new" className="admin-btn admin-btn--primary">
            <FontAwesomeIcon icon={faPlus} /> Add Product
          </Link>
        </div>
      </div>

      {hasProducts && (
        <div className="admin-toolbar">
          <label className="admin-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input
              type="search"
              placeholder="Search products…"
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
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
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
            aria-label="Filter by availability"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
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
            title="Your menu is empty"
            message="Add your first product to start selling."
            actionLabel="Add Product"
            actionTo="/admin/menu/new"
          />
        </div>
      )}

      {status === 'success' && hasProducts && (
        <div className="admin-panel">
          {pageItems.length === 0 ? (
            <AdminEmptyState
              icon={faCircleExclamation}
              title="No products match"
              message="Try a different search or filter."
              actionLabel="Clear filters"
              onAction={() => {
                setQuery('');
                setCategoryFilter('all');
                setAvailability('all');
                setPage(1);
              }}
            />
          ) : (
            <div className="admin-table" role="table" aria-label="Menu products">
              <div className="admin-table-head" role="row">
                <span role="columnheader">Product</span>
                <span role="columnheader">Category</span>
                <span role="columnheader">Price</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Featured</span>
                <span role="columnheader" className="admin-table-actions-head">
                  Actions
                </span>
              </div>

              {pageItems.map((product) => (
                <div
                  className={`admin-table-row ${busyId === product.id ? 'is-busy' : ''}`}
                  role="row"
                  key={product.id}
                >
                  <div className="admin-table-product" role="cell" data-label="Product">
                    <img
                      src={product.image || DEFAULT_PRODUCT_IMAGE}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                      }}
                    />
                    <div className="admin-table-product-meta">
                      <strong>{product.name}</strong>
                      <span>{product.description || '—'}</span>
                    </div>
                  </div>

                  <span className="admin-table-category" role="cell" data-label="Category">
                    {categoryName(product.categoryId) || product.category || '—'}
                  </span>

                  <span className="admin-table-price" role="cell" data-label="Price">
                    {currency}
                    {Number(product.basePrice).toFixed(2)}
                  </span>

                  <span className="admin-table-status" role="cell" data-label="Status">
                    <button
                      type="button"
                      className={`admin-switch ${product.available ? 'is-on' : 'is-off'}`}
                      onClick={() => toggleAvailability(product)}
                      disabled={busyId === product.id}
                      aria-pressed={product.available}
                      aria-label={`Toggle availability for ${product.name}`}
                    >
                      <span className="admin-switch-track">
                        <span className="admin-switch-thumb" />
                      </span>
                      <span className="admin-switch-label">
                        {product.available ? 'Available' : 'Off'}
                      </span>
                    </button>
                  </span>

                  <span className="admin-table-featured" role="cell" data-label="Featured">
                    {product.featured ? (
                      <span className="admin-badge tone-success">Featured</span>
                    ) : (
                      <span className="admin-muted">—</span>
                    )}
                  </span>

                  <span className="admin-table-actions" role="cell" data-label="Actions">
                    <Link
                      to={`/admin/menu/${product.id}/edit`}
                      className="admin-icon-btn admin-icon-btn--sm"
                      aria-label={`Edit ${product.name}`}
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </Link>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--sm is-danger"
                      onClick={() => setPendingDelete(product)}
                      disabled={busyId === product.id}
                      aria-label={`Delete ${product.name}`}
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
                Previous
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this product?"
          message={`"${pendingDelete.name}" will be removed. This action cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

export default AdminMenu;
