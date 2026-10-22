import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import {
  faMagnifyingGlass,
  faXmark,
  faSliders,
} from '@fortawesome/free-solid-svg-icons';

function MenuToolbar({
  query,
  onQueryChange,
  onClearQuery,
  sortKey,
  onSortChange,
  resultCount,
  activeFilterCount,
  onToggleFilters,
}) {
  const { t } = useTranslation();

  const sortOptions = [
    { value: 'featured', label: t('menu.sortFeatured') },
    { value: 'price-asc', label: t('menu.sortPriceAsc') },
    { value: 'price-desc', label: t('menu.sortPriceDesc') },
    { value: 'rating', label: t('menu.sortRating') },
    { value: 'popularity', label: t('menu.sortPopularity') },
    { value: 'newest', label: t('menu.sortNewest') },
  ];

  return (
    <div className="menu-toolbar">
      <div className="search-box">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="search-icon" />
        <input
          type="search"
          placeholder={t('menu.searchPlaceholder')}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label={t('menu.ariaSearchMenu')}
        />
        {query && (
          <button
            className="search-clear"
            onClick={onClearQuery}
            aria-label={t('menu.ariaClearSearch')}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
      </div>

      <div className="toolbar-controls">
        <label className="sort-control">
          <span>{t('menu.sortLabel')}</span>
          <select
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label={t('menu.ariaSortProducts')}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          className={`filters-toggle ${activeFilterCount ? 'has-filters' : ''}`}
          onClick={onToggleFilters}
          aria-label={t('menu.ariaToggleFilters')}
        >
          <FontAwesomeIcon icon={faSliders} />
          {t('menu.filters')}
          {activeFilterCount > 0 && (
            <span className="filters-count">{activeFilterCount}</span>
          )}
        </button>
      </div>

      <p className="results-count">
        {t('common.units.items', { count: resultCount })}
      </p>
    </div>
  );
}

export default MenuToolbar;