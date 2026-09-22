import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faPlus,
  faPen,
  faTrash,
  faCheck,
  faXmark,
  faArrowUp,
  faArrowDown,
  faTag,
  faGripLines,
} from '@fortawesome/free-solid-svg-icons';
import { useRestaurantCategories } from '../../hooks/useRestaurantCategories';
import { useRestaurantProducts } from '../../hooks/useRestaurantProducts';
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
} from '../../services/categoryService';
import { useToast } from '../../context/ToastContext';
import SectionTitle from '../../components/account/SectionTitle';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminErrorState from '../../components/admin/AdminErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

function CategoryManager() {
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { status, categories, error, reload } = useRestaurantCategories(restaurantId);
  const { products } = useRestaurantProducts(restaurantId);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const productCount = (categoryId) =>
    products.filter((product) => product.categoryId === categoryId).length;

  const handleCreate = (event) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || !restaurantId) return;
    setBusy(true);
    try {
      createCategory({ restaurantId, name });
      setNewName('');
      showToast(`Category "${name}" added.`);
    } catch (err) {
      showToast(err.message || 'Could not add the category.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (category) => {
    setEditingId(category.id);
    setEditName(category.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEdit = (category) => {
    const name = editName.trim();
    if (!name) {
      showToast('Category name is required.', 'error');
      return;
    }
    if (name === category.name) {
      cancelEdit();
      return;
    }
    try {
      updateCategory(category.id, { name });
      showToast('Category renamed.');
      cancelEdit();
    } catch (err) {
      showToast(err.message || 'Could not rename the category.', 'error');
    }
  };

  const confirmDelete = () => {
    const category = pendingDelete;
    setPendingDelete(null);
    if (!category) return;
    const result = deleteCategory(category.id);
    if (result.success) {
      showToast(`Category "${category.name}" deleted.`);
    } else {
      showToast(result.error || 'Could not delete the category.', 'error');
    }
  };

  const move = (category, direction) => {
    const ids = categories.map((entry) => entry.id);
    const index = ids.indexOf(category.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderCategories(restaurantId, ids);
  };

  return (
    <div className="admin-overview">
      <button type="button" className="admin-back-link" onClick={() => navigate('/admin/menu')}>
        <FontAwesomeIcon icon={faArrowLeft} /> Back to menu
      </button>

      <SectionTitle
        title="Categories"
        subtitle="Group your menu items and control the order customers see."
      />

      <form className="admin-panel admin-inline-form" onSubmit={handleCreate}>
        <input
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New category name"
          maxLength={40}
        />
        <button
          type="submit"
          className="admin-btn admin-btn--primary"
          disabled={busy || !newName.trim()}
        >
          <FontAwesomeIcon icon={faPlus} /> Add
        </button>
      </form>

      <div className="admin-panel">
        {status === 'loading' && (
          <div className="admin-category-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="admin-category-row">
                <div className="admin-skeleton-chip" style={{ width: 160 }} />
              </div>
            ))}
          </div>
        )}

        {status === 'error' && <AdminErrorState message={error} onRetry={reload} />}

        {status === 'success' && categories.length === 0 && (
          <AdminEmptyState
            icon={faTag}
            title="No categories yet"
            message="Add a category above to start organizing your menu."
          />
        )}

        {status === 'success' && categories.length > 0 && (
          <div className="admin-category-list">
            {categories.map((category, index) => {
              const count = productCount(category.id);
              const isEditing = editingId === category.id;
              return (
                <div className="admin-category-row" key={category.id}>
                  <div className="admin-category-order">
                    <span className="admin-category-grip">
                      <FontAwesomeIcon icon={faGripLines} />
                    </span>
                    <span className="admin-category-index">{index + 1}</span>
                  </div>

                  {isEditing ? (
                    <div className="admin-category-edit">
                      <input
                        type="text"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveEdit(category);
                          }
                          if (event.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                        maxLength={40}
                      />
                      <button
                        type="button"
                        className="admin-icon-btn is-success"
                        onClick={() => saveEdit(category)}
                        aria-label="Save category"
                      >
                        <FontAwesomeIcon icon={faCheck} />
                      </button>
                      <button
                        type="button"
                        className="admin-icon-btn"
                        onClick={cancelEdit}
                        aria-label="Cancel"
                      >
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    </div>
                  ) : (
                    <div className="admin-category-name">
                      <strong>{category.name}</strong>
                      <span>
                        {count} item{count === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}

                  <div className="admin-category-actions">
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--sm"
                      onClick={() => move(category, -1)}
                      disabled={index === 0 || isEditing}
                      aria-label={`Move ${category.name} up`}
                    >
                      <FontAwesomeIcon icon={faArrowUp} />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--sm"
                      onClick={() => move(category, 1)}
                      disabled={index === categories.length - 1 || isEditing}
                      aria-label={`Move ${category.name} down`}
                    >
                      <FontAwesomeIcon icon={faArrowDown} />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--sm"
                      onClick={() => startEdit(category)}
                      disabled={isEditing}
                      aria-label={`Rename ${category.name}`}
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--sm is-danger"
                      onClick={() => setPendingDelete(category)}
                      disabled={isEditing}
                      aria-label={`Delete ${category.name}`}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this category?"
          message={`"${pendingDelete.name}" will be removed. Categories with products can't be deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

export default CategoryManager;
