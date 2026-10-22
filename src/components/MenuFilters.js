import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { formatMoney } from '../i18n/format';

function MenuFilters({
  filters,
  categories,
  priceLimits,
  onChange,
  onReset,
  onClose,
}) {
  const { t, i18n } = useTranslation();
  const set = (patch) => onChange(patch);

  return (
    <aside className="filters-panel">
      <div className="filters-head">
        <h3>{t('menu.filters')}</h3>
        <button
          className="filters-close"
          onClick={onClose}
          aria-label={t('menu.ariaCloseFilters')}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="filter-group">
        <h5>{t('menu.filterCategory')}</h5>
        <div className="filter-chips">
          <button
            className={filters.category === 'All' ? 'active' : ''}
            onClick={() => set({ category: 'All' })}
          >
            {t('menu.allCategories')}
          </button>
          {categories.map((category) => (
            <button
              key={category}
              className={filters.category === category ? 'active' : ''}
              onClick={() => set({ category })}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h5>{t('menu.filterPriceRange')}</h5>
        <div className="price-inputs">
          <input
            type="number"
            min={priceLimits.min}
            max={priceLimits.max}
            placeholder={formatMoney(priceLimits.min, i18n.language)}
            value={filters.priceMin ?? ''}
            onChange={(e) =>
              set({ priceMin: e.target.value === '' ? null : Number(e.target.value) })
            }
            aria-label={t('menu.ariaMinPrice')}
          />
          <span>&ndash;</span>
          <input
            type="number"
            min={priceLimits.min}
            max={priceLimits.max}
            placeholder={formatMoney(priceLimits.max, i18n.language)}
            value={filters.priceMax ?? ''}
            onChange={(e) =>
              set({ priceMax: e.target.value === '' ? null : Number(e.target.value) })
            }
            aria-label={t('menu.ariaMaxPrice')}
          />
        </div>
      </div>

      <div className="filter-group">
        <h5>{t('menu.filterOptions')}</h5>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.available}
            onChange={(e) => set({ available: e.target.checked })}
          />
          {t('menu.filterAvailableNow')}
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.popular}
            onChange={(e) => set({ popular: e.target.checked })}
          />
          {t('menu.filterPopular')}
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.featured}
            onChange={(e) => set({ featured: e.target.checked })}
          />
          {t('menu.filterFeatured')}
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.vegetarian}
            onChange={(e) => set({ vegetarian: e.target.checked })}
          />
          {t('menu.filterVegetarian')}
        </label>
      </div>

      <button className="contact-btn filter-reset" onClick={onReset}>
        {t('menu.clearAllFilters')}
      </button>
    </aside>
  );
}

export default MenuFilters;