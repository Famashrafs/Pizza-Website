import React from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useRestaurantProducts } from '../../hooks/useRestaurantProducts';
import { useRestaurantCategories } from '../../hooks/useRestaurantCategories';
import { createProduct, updateProduct } from '../../services/menuService';
import { useToast } from '../../context/ToastContext';
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
      return { success: false, error: 'Your restaurant is not ready yet.' };
    }

    try {
      if (isEdit) {
        const updated = updateProduct(id, values);
        if (!updated) return { success: false, error: 'Product not found.' };
        showToast(`${updated.name} updated.`);
      } else {
        const created = createProduct(values, restaurantId);
        showToast(`${created.name} added to your menu.`);
      }
      navigate('/admin/menu');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Could not save the product.' };
    }
  };

  if (isEdit && status === 'loading') {
    return (
      <div className="admin-overview">
        <SectionTitle title="Edit product" subtitle="Loading product…" />
        <FormSkeleton />
      </div>
    );
  }

  if (isEdit && status === 'error') {
    return (
      <div className="admin-overview">
        <SectionTitle title="Edit product" />
        <div className="admin-panel">
          <AdminErrorState message={error} onRetry={reload} />
        </div>
      </div>
    );
  }

  if (isEdit && status === 'success' && !product) {
    return (
      <div className="admin-overview">
        <SectionTitle title="Edit product" />
        <div className="admin-panel">
          <AdminErrorState
            message="We couldn't find that product. It may have been deleted."
            onRetry={() => navigate('/admin/menu')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-overview">
      <SectionTitle
        title={isEdit ? 'Edit product' : 'Add product'}
        subtitle={
          isEdit
            ? 'Update the details customers see on your menu.'
            : 'Create a new item for your menu.'
        }
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
