import React, { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import {
  faPlus,
  faTrash,
  faFloppyDisk,
  faArrowLeft,
} from '@fortawesome/free-solid-svg-icons';
import ImagePicker from './ImagePicker';

const newId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="admin-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="admin-toggle-track">
        <span className="admin-toggle-thumb" />
      </span>
      <span className="admin-toggle-text">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Reusable product form for /admin/menu/new and /admin/menu/:id/edit. Adapts the
// project's existing customization model (sizes / crusts / toppings) rather than
// introducing a parallel one — the customer ProductModal reads these exact
// fields, so anything the owner configures here is immediately purchasable.
function ProductForm({ product = null, categories = [], onSubmit, onCancel }) {
  const { t } = useTranslation();
  const isEdit = Boolean(product?.id);

  const [form, setForm] = useState(() => ({
    name: product?.name || '',
    description: product?.description || '',
    categoryId: product?.categoryId || (categories[0]?.id ?? ''),
    newCategory: '',
    basePrice: product?.basePrice != null ? String(product.basePrice) : '',
    image: product?.image || '',
    available: product ? product.available !== false : true,
    featured: Boolean(product?.featured),
    vegetarian: Boolean(product?.vegetarian),
    popular: Boolean(product?.popular),
    ingredients: (product?.ingredients || []).join(', '),
    sizes: (product?.sizes || []).map((size) => ({ ...size })),
    crusts: (product?.crusts || []).map((crust) => ({ ...crust })),
    toppings: (product?.toppings || []).map((topping) => ({ ...topping })),
    maxToppings: product?.maxToppings != null ? String(product.maxToppings) : '',
    defaultSize: product?.defaultSize || '',
    defaultCrust: product?.defaultCrust || '',
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const sizeLabels = useMemo(
    () => form.sizes.map((size) => size.label).filter(Boolean),
    [form.sizes]
  );

  // --- option row helpers ---------------------------------------------------
  const updateRow = (key, index, patch) =>
    update({ [key]: form[key].map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  const removeRow = (key, index) =>
    update({ [key]: form[key].filter((_, i) => i !== index) });

  const addSize = () =>
    update({ sizes: [...form.sizes, { id: newId('size'), label: '', adjust: 0 }] });
  const addCrust = () =>
    update({ crusts: [...form.crusts, { id: newId('crust'), label: '', price: 0, available: true }] });
  const addTopping = () =>
    update({ toppings: [...form.toppings, { id: newId('topping'), name: '', price: 0, available: true }] });

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = t('admin.errorProductNameRequired');
    if (form.basePrice === '' || Number.isNaN(Number(form.basePrice))) {
      next.basePrice = t('admin.errorInvalidPrice');
    } else if (Number(form.basePrice) < 0) {
      next.basePrice = t('admin.errorNegativePrice');
    }
    if (!form.categoryId && !form.newCategory.trim()) {
      next.category = t('admin.errorCategoryRequired');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = () => {
    const selectedCategory = categories.find((c) => c.id === form.categoryId) || null;
    const categoryName = form.newCategory.trim() || selectedCategory?.name || '';

    const sizes = form.sizes
      .filter((size) => String(size.label).trim())
      .map((size) => ({
        id: size.id || newId('size'),
        label: String(size.label).trim(),
        adjust: cleanNumber(size.adjust),
      }));

    const crusts = form.crusts
      .filter((crust) => String(crust.label).trim())
      .map((crust) => ({
        id: crust.id || newId('crust'),
        label: String(crust.label).trim(),
        price: cleanNumber(crust.price),
        available: crust.available !== false,
      }));

    const toppings = form.toppings
      .filter((topping) => String(topping.name).trim())
      .map((topping) => ({
        id: topping.id || newId('topping'),
        name: String(topping.name).trim(),
        price: cleanNumber(topping.price),
        available: topping.available !== false,
      }));

    const sizeLabelSet = new Set(sizes.map((size) => size.label));
    const crustIdSet = new Set(crusts.map((crust) => crust.id));

    return {
      name: form.name.trim(),
      description: form.description.trim(),
      image: form.image,
      categoryId: form.newCategory.trim() ? null : form.categoryId || null,
      category: categoryName,
      basePrice: cleanNumber(form.basePrice),
      available: form.available,
      featured: form.featured,
      vegetarian: form.vegetarian,
      popular: form.popular,
      ingredients: form.ingredients
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      sizes,
      crusts,
      toppings,
      maxToppings: Math.max(0, Math.floor(cleanNumber(form.maxToppings))),
      defaultSize: sizeLabelSet.has(form.defaultSize) ? form.defaultSize : null,
      defaultCrust: crustIdSet.has(form.defaultCrust) ? form.defaultCrust : null,
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSubmitError('');
    if (!validate()) return;

    setSaving(true);
    try {
      const result = await onSubmit(buildPayload());
      if (result && result.success === false) {
        setSubmitError(result.error || t('admin.errorSaveProduct'));
      }
    } catch (err) {
      setSubmitError(err.message || t('admin.errorSaveProduct'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-form" onSubmit={handleSubmit} noValidate>
      <button type="button" className="admin-back-link" onClick={onCancel}>
        <FontAwesomeIcon icon={faArrowLeft} /> {t('admin.backToMenu')}
      </button>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h3>{t('admin.formBasicInfo')}</h3>
        </div>
        <div className="admin-form-grid">
          <label className="admin-field admin-field--full">
            <span>{t('admin.fieldProductName')}</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder={t('admin.phProductName')}
              maxLength={80}
            />
            {errors.name && <small className="admin-field-error">{errors.name}</small>}
          </label>

          <label className="admin-field admin-field--full">
            <span>{t('admin.fieldDescription')}</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => update({ description: event.target.value })}
              placeholder={t('admin.phDescription')}
              maxLength={400}
            />
          </label>

          <label className="admin-field">
            <span>{t('admin.fieldCategory')}</span>
            <select
              value={form.newCategory ? '__new__' : form.categoryId}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '__new__') {
                  update({ categoryId: '', newCategory: ' ' });
                } else {
                  update({ categoryId: value, newCategory: '' });
                }
              }}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value="__new__">{t('admin.newCategoryOption')}</option>
            </select>
            {errors.category && <small className="admin-field-error">{errors.category}</small>}
          </label>

          <label className="admin-field">
            <span>{t('admin.fieldPrice')}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.basePrice}
              onChange={(event) => update({ basePrice: event.target.value })}
              placeholder="0.00"
            />
            {errors.basePrice && <small className="admin-field-error">{errors.basePrice}</small>}
          </label>

          {form.newCategory !== '' && (
            <label className="admin-field admin-field--full">
              <span>{t('admin.fieldNewCategoryName')}</span>
              <input
                type="text"
                value={form.newCategory.trim()}
                onChange={(event) => update({ newCategory: event.target.value })}
                placeholder={t('admin.phNewCategory')}
                maxLength={40}
              />
            </label>
          )}

          <label className="admin-field admin-field--full">
            <span>{t('admin.fieldIngredients')}</span>
            <input
              type="text"
              value={form.ingredients}
              onChange={(event) => update({ ingredients: event.target.value })}
              placeholder={t('admin.phIngredients')}
            />
          </label>

          <div className="admin-field admin-field--full">
            <ImagePicker
              label={t('admin.fieldProductImage')}
              value={form.image}
              onChange={(url) => update({ image: url })}
              path="products"
            />
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h3>{t('admin.formProductSettings')}</h3>
        </div>
        <div className="admin-toggle-grid">
          <Toggle
            checked={form.available}
            onChange={(value) => update({ available: value })}
            label={t('admin.available')}
            description={t('admin.toggleAvailableDesc')}
          />
          <Toggle
            checked={form.featured}
            onChange={(value) => update({ featured: value })}
            label={t('admin.featured')}
            description={t('admin.toggleFeaturedDesc')}
          />
          <Toggle
            checked={form.popular}
            onChange={(value) => update({ popular: value })}
            label={t('admin.statPopular')}
            description={t('admin.togglePopularDesc')}
          />
          <Toggle
            checked={form.vegetarian}
            onChange={(value) => update({ vegetarian: value })}
            label={t('admin.statVegetarian')}
            description={t('admin.toggleVegetarianDesc')}
          />
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h3>{t('admin.formCustomization')}</h3>
          <p className="admin-panel-sub">
            {t('admin.formCustomizationSub')}
          </p>
        </div>

        {/* Sizes */}
        <div className="admin-options-block">
          <div className="admin-options-head">
            <h4>{t('admin.fieldSizes')}</h4>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={addSize}>
              <FontAwesomeIcon icon={faPlus} /> {t('admin.addSize')}
            </button>
          </div>
          {form.sizes.length === 0 && <p className="admin-options-empty">{t('admin.noSizes')}</p>}
          {form.sizes.map((size, index) => (
            <div className="admin-option-row" key={size.id || index}>
              <input
                type="text"
                value={size.label}
                placeholder={t('admin.phSizeLabel')}
                onChange={(event) => updateRow('sizes', index, { label: event.target.value })}
              />
              <input
                type="number"
                step="0.01"
                value={size.adjust}
                placeholder={t('admin.phPriceAdjust')}
                onChange={(event) => updateRow('sizes', index, { adjust: event.target.value })}
              />
              <button
                type="button"
                className="admin-icon-danger"
                onClick={() => removeRow('sizes', index)}
                aria-label={t('admin.ariaRemoveSize')}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          ))}
        </div>

        {/* Crusts */}
        <div className="admin-options-block">
          <div className="admin-options-head">
            <h4>{t('admin.fieldCrusts')}</h4>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={addCrust}>
              <FontAwesomeIcon icon={faPlus} /> {t('admin.addCrust')}
            </button>
          </div>
          {form.crusts.length === 0 && <p className="admin-options-empty">{t('admin.noCrusts')}</p>}
          {form.crusts.map((crust, index) => (
            <div className="admin-option-row" key={crust.id || index}>
              <input
                type="text"
                value={crust.label}
                placeholder={t('admin.phCrustLabel')}
                onChange={(event) => updateRow('crusts', index, { label: event.target.value })}
              />
              <input
                type="number"
                step="0.01"
                value={crust.price}
                placeholder={t('admin.fieldPrice')}
                onChange={(event) => updateRow('crusts', index, { price: event.target.value })}
              />
              <label className="admin-option-available">
                <input
                  type="checkbox"
                  checked={crust.available !== false}
                  onChange={(event) =>
                    updateRow('crusts', index, { available: event.target.checked })
                  }
                />
                {t('admin.available')}
              </label>
              <button
                type="button"
                className="admin-icon-danger"
                onClick={() => removeRow('crusts', index)}
                aria-label={t('admin.ariaRemoveCrust')}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          ))}
        </div>

        {/* Toppings */}
        <div className="admin-options-block">
          <div className="admin-options-head">
            <h4>{t('admin.fieldToppings')}</h4>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={addTopping}>
              <FontAwesomeIcon icon={faPlus} /> {t('admin.addTopping')}
            </button>
          </div>
          {form.toppings.length === 0 && <p className="admin-options-empty">{t('admin.noToppings')}</p>}
          {form.toppings.map((topping, index) => (
            <div className="admin-option-row" key={topping.id || index}>
              <input
                type="text"
                value={topping.name}
                placeholder={t('admin.phToppingName')}
                onChange={(event) => updateRow('toppings', index, { name: event.target.value })}
              />
              <input
                type="number"
                step="0.01"
                value={topping.price}
                placeholder={t('admin.fieldPrice')}
                onChange={(event) => updateRow('toppings', index, { price: event.target.value })}
              />
              <label className="admin-option-available">
                <input
                  type="checkbox"
                  checked={topping.available !== false}
                  onChange={(event) =>
                    updateRow('toppings', index, { available: event.target.checked })
                  }
                />
                {t('admin.available')}
              </label>
              <button
                type="button"
                className="admin-icon-danger"
                onClick={() => removeRow('toppings', index)}
                aria-label={t('admin.ariaRemoveTopping')}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          ))}
        </div>

        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{t('admin.fieldMaxToppings')}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.maxToppings}
              onChange={(event) => update({ maxToppings: event.target.value })}
              placeholder={t('admin.phUnlimited')}
            />
          </label>
          <label className="admin-field">
            <span>{t('admin.fieldDefaultSize')}</span>
            <select
              value={form.defaultSize}
              onChange={(event) => update({ defaultSize: event.target.value })}
            >
              <option value="">—</option>
              {sizeLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>{t('admin.fieldDefaultCrust')}</span>
            <select
              value={form.defaultCrust}
              onChange={(event) => update({ defaultCrust: event.target.value })}
            >
              <option value="">—</option>
              {form.crusts.map((crust) => (
                <option key={crust.id} value={crust.id}>
                  {crust.label || crust.id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {submitError && (
        <div className="admin-alert admin-alert--error" role="alert">
          {submitError}
        </div>
      )}

      <div className="admin-form-actions">
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          onClick={onCancel}
          disabled={saving}
        >
          {t('common.actions.cancel')}
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
          <FontAwesomeIcon icon={faFloppyDisk} />
          {saving
            ? t('admin.saving')
            : isEdit
            ? t('common.actions.saveChanges')
            : t('admin.createProduct')}
        </button>
      </div>
    </form>
  );
}

export default ProductForm;
