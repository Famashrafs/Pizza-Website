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
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import {
  DEFAULT_CONTENT_LANGUAGE,
  TRANSLATED_CONTENT_LANGUAGES,
  mergeCategoryTranslations,
  normalizeCategoryTranslations,
} from '../../utils/menuTranslations';
import SectionTitle from '../../components/account/SectionTitle';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminErrorState from '../../components/admin/AdminErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

function CategoryManager() {
  const { t } = useTranslation();
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { status, categories, error, reload } = useRestaurantCategories(restaurantId);
  const { products } = useRestaurantProducts(restaurantId);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editNames, setEditNames] = useState({});
  const [editLanguage, setEditLanguage] = useState(DEFAULT_CONTENT_LANGUAGE);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const productCount = (categoryId) =>
    products.filter((product) => product.categoryId === categoryId).length;

  const handleCreate = async (event) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || !restaurantId) return;
    setBusy(true);
    try {
      await createCategory({ restaurantId, name });
      setNewName('');
      showToast(t('admin.toastCategoryAdded', { name }));
    } catch (err) {
      showToast(err.message || t('admin.errorAddCategory'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (category) => {
    setEditingId(category.id);
    setEditLanguage(DEFAULT_CONTENT_LANGUAGE);
    setEditNames(
      TRANSLATED_CONTENT_LANGUAGES.reduce(
        (acc, locale) => ({
          ...acc,
          [locale]: category.translations?.[locale]?.name || '',
        }),
        { [DEFAULT_CONTENT_LANGUAGE]: category.name }
      )
    );
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNames({});
    setEditLanguage(DEFAULT_CONTENT_LANGUAGE);
  };

  const saveEdit = async (category) => {
    const name = String(editNames[DEFAULT_CONTENT_LANGUAGE] || '').trim();
    if (!name) {
      showToast(t('admin.errorCategoryNameRequired'), 'error');
      return;
    }

    const translations = mergeCategoryTranslations(category.translations, {
      ar: { name: editNames.ar || '' },
      it: { name: editNames.it || '' },
    });
    const sameName = name === category.name;
    const sameTranslations =
      JSON.stringify(translations) ===
      JSON.stringify(normalizeCategoryTranslations(category.translations));
    if (sameName && sameTranslations) {
      cancelEdit();
      return;
    }

    try {
      // Only send translations when they changed, so a pure rename does not
      // rewrite every product's denormalized category labels.
      const patch = sameTranslations ? { name } : { name, translations };
      await updateCategory(category.id, patch, restaurantId);
      showToast(
        sameName ? t('admin.toastCategoryUpdated') : t('admin.toastCategoryRenamed')
      );
      cancelEdit();
    } catch (err) {
      showToast(err.message || t('admin.errorRenameCategory'), 'error');
    }
  };

  const confirmDelete = async () => {
    const category = pendingDelete;
    setPendingDelete(null);
    if (!category) return;
    try {
      const result = await deleteCategory(category.id, restaurantId);
      if (result.success) {
        showToast(t('admin.toastCategoryDeleted', { name: category.name }));
      } else {
        showToast(result.error || t('admin.errorDeleteCategory'), 'error');
      }
    } catch (err) {
      showToast(err.message || t('admin.errorDeleteCategory'), 'error');
    }
  };

  const move = async (category, direction) => {
    const ids = categories.map((entry) => entry.id);
    const index = ids.indexOf(category.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderCategories(restaurantId, ids);
    } catch (err) {
      showToast(err.message || t('admin.errorReorderCategories'), 'error');
    }
  };

  return (
    <div className="admin-overview">
      <button type="button" className="admin-back-link" onClick={() => navigate('/admin/menu')}>
        <FontAwesomeIcon icon={faArrowLeft} /> {t('admin.backToMenu')}
      </button>

      <SectionTitle
        title={t('admin.navCategories')}
        subtitle={t('admin.categoriesSubtitle')}
      />

      <form className="admin-panel admin-inline-form" onSubmit={handleCreate}>
        <input
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder={t('admin.phNewCategoryName')}
          maxLength={40}
        />
        <button
          type="submit"
          className="admin-btn admin-btn--primary"
          disabled={busy || !newName.trim()}
        >
          <FontAwesomeIcon icon={faPlus} /> {t('common.actions.add')}
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
            title={t('admin.noCategoriesYet')}
            message={t('admin.noCategoriesYetMessage')}
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
                    <div className="admin-category-edit is-multilingual">
                      <div className="admin-category-edit-fields">
                        <div
                          className="admin-tabs admin-tabs--sm"
                          role="tablist"
                          aria-label={t('admin.contentLanguage')}
                        >
                          {SUPPORTED_LANGUAGES.map((language) => (
                            <button
                              key={language.code}
                              type="button"
                              role="tab"
                              aria-selected={editLanguage === language.code}
                              className={`admin-tab${
                                editLanguage === language.code ? ' active' : ''
                              }`}
                              onClick={() => setEditLanguage(language.code)}
                            >
                              {language.label}
                              {language.code === DEFAULT_CONTENT_LANGUAGE && (
                                <span className="admin-tab-count">
                                  {t('admin.defaultLanguage')}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          dir="auto"
                          value={editNames[editLanguage] ?? ''}
                          onChange={(event) =>
                            setEditNames((prev) => ({
                              ...prev,
                              [editLanguage]: event.target.value,
                            }))
                          }
                          placeholder={
                            editLanguage === DEFAULT_CONTENT_LANGUAGE
                              ? t('admin.phNewCategoryName')
                              : category.name
                          }
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
                      </div>
                      <button
                        type="button"
                        className="admin-icon-btn is-success"
                        onClick={() => saveEdit(category)}
                        aria-label={t('admin.ariaSaveCategory')}
                      >
                        <FontAwesomeIcon icon={faCheck} />
                      </button>
                      <button
                        type="button"
                        className="admin-icon-btn"
                        onClick={cancelEdit}
                        aria-label={t('common.actions.cancel')}
                      >
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    </div>
                  ) : (
                    <div className="admin-category-name">
                      <strong>{category.name}</strong>
                      <span>{t('common.units.items', { count })}</span>
                    </div>
                  )}

                  <div className="admin-category-actions">
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--sm"
                      onClick={() => move(category, -1)}
                      disabled={index === 0 || isEditing}
                      aria-label={t('admin.ariaMoveUp', { name: category.name })}
                    >
                      <FontAwesomeIcon icon={faArrowUp} />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--sm"
                      onClick={() => move(category, 1)}
                      disabled={index === categories.length - 1 || isEditing}
                      aria-label={t('admin.ariaMoveDown', { name: category.name })}
                    >
                      <FontAwesomeIcon icon={faArrowDown} />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--sm"
                      onClick={() => startEdit(category)}
                      disabled={isEditing}
                      aria-label={t('admin.ariaRenameCategory', { name: category.name })}
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--sm is-danger"
                      onClick={() => setPendingDelete(category)}
                      disabled={isEditing}
                      aria-label={t('admin.ariaDeleteCategory', { name: category.name })}
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
          title={t('admin.deleteCategoryTitle')}
          message={t('admin.deleteCategoryMessage', { name: pendingDelete.name })}
          confirmLabel={t('common.actions.delete')}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

export default CategoryManager;
