import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';

function MenuFilters({
  filters,
  categories,
  priceLimits,
  onChange,
  onReset,
  onClose,
}) {
  const set = (patch) => onChange(patch);

  return (
    <aside className="filters-panel">
      <div className="filters-head">
        <h3>Filters</h3>
        <button
          className="filters-close"
          onClick={onClose}
          aria-label="Close filters"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="filter-group">
        <h5>Category</h5>
        <div className="filter-chips">
          <button
            className={filters.category === 'All' ? 'active' : ''}
            onClick={() => set({ category: 'All' })}
          >
            All
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
        <h5>Price range</h5>
        <div className="price-inputs">
          <input
            type="number"
            min={priceLimits.min}
            max={priceLimits.max}
            placeholder={`$${priceLimits.min}`}
            value={filters.priceMin ?? ''}
            onChange={(e) =>
              set({ priceMin: e.target.value === '' ? null : Number(e.target.value) })
            }
            aria-label="Minimum price"
          />
          <span>&ndash;</span>
          <input
            type="number"
            min={priceLimits.min}
            max={priceLimits.max}
            placeholder={`$${priceLimits.max}`}
            value={filters.priceMax ?? ''}
            onChange={(e) =>
              set({ priceMax: e.target.value === '' ? null : Number(e.target.value) })
            }
            aria-label="Maximum price"
          />
        </div>
      </div>

      <div className="filter-group">
        <h5>Options</h5>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.available}
            onChange={(e) => set({ available: e.target.checked })}
          />
          Available now
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.popular}
            onChange={(e) => set({ popular: e.target.checked })}
          />
          Popular
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.featured}
            onChange={(e) => set({ featured: e.target.checked })}
          />
          Featured
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.vegetarian}
            onChange={(e) => set({ vegetarian: e.target.checked })}
          />
          Vegetarian
        </label>
      </div>

      <button className="contact-btn filter-reset" onClick={onReset}>
        Clear all filters
      </button>
    </aside>
  );
}

export default MenuFilters;