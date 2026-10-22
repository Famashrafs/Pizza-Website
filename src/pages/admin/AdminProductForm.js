import React from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useRestaurantProducts } from '../../hooks/useRestaurantProducts';
import { useRestaurantCategories } from '../../hooks/useRestaurantCategories';
import { createProduct, updateProduct } from '../../services/menuService';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';
import ProductForm from '../../components/admin/ProductForm';
import AdminErrorState from '../../components/admin/AdminErrorState';
import SectionTitle from '../../components/account/SectionTitle';

function FormSkeleton() {
  return (
    <div className="admin-panel">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="admin-skeleton-chip"
          style={{ height: 48, width: i % 2 === 0 ? '100%' : '60%', marginBottom: 16 }}
        />
      ))}
    </div>
  );
}

// Hosts the shared ProductForm for both create and edit. Persists through the
// menu service and sends the owner back to the menu with a confirmation.
function AdminProductForm() {
  const { t } = useTranslation();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { status, products, error, reload } = useRestaurantProducts(restaurantId);
  const { categories } = useRestaurantCategories(restaurantId);

  const product = isEdit ? products.find((entry) => entry.id === id) : null;

  const handleSubmit = async (values) => {
    if (!restaurantId) {
      return { success: false, error: t('admin.errorRestaurantNotReady') };
    }

    try {
      if (isEdit) {
        const updated = await updateProduct(id, values);
        if (!updated) return { success: false, error: t('admin.errorProductNotFound') };
        showToast(t('admin.toastProductUpdated', { name: updated.name }));
      } else {
        const created = await createProduct(values, restaurantId);
        showToast(t('admin.toastProductAdded', { name: created.name }));
      }
      navigate('/admin/menu');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || t('admin.errorSaveProduct') };
    }
  };

  if (isEdit && status === 'loading') {
    return (
      <div className="admin-overview">
        <SectionTitle title={t('admin.editProduct')} subtitle={t('admin.loadingProduct')} />
        <FormSkeleton />
      </div>
    );
  }

  if (isEdit && status === 'error') {
    return (
      <div className="admin-overview">
        <SectionTitle title={t('admin.editProduct')} />
        <div className="admin-panel">
          <AdminErrorState message={error} onRetry={reload} />
        </div>
      </div>
    );
  }

  if (isEdit && status === 'success' && !product) {
    return (
      <div className="admin-overview">
        <SectionTitle title={t('admin.editProduct')} />
        <div className="admin-panel">
          <AdminErrorState
            message={t('admin.errorProductNotFoundLong')}
            onRetry={() => navigate('/admin/menu')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-overview">
      <SectionTitle
        title={isEdit ? t('admin.editProduct') : t('admin.addProductTitle')}
        subtitle={isEdit ? t('admin.editProductSubtitle') : t('admin.addProductSubtitle')}
      />
      <ProductForm
        product={product}
        categories={categories}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/admin/menu')}
      />
    </div>
  );
}

export default AdminProductForm;
