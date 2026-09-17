import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMagnifyingGlass,
  faXmark,
  faSliders,
} from '@fortawesome/free-solid-svg-icons';
import { SORT_OPTIONS } from '../utils/menuLogic';

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
  return (
    <div className="menu-toolbar">
      <div className="search-box">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="search-icon" />
        <input
          type="search"
          placeholder="Search by name, ingredient or category..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search menu"
        />
        {query && (
          <button
            className="search-clear"
            onClick={onClearQuery}
            aria-label="Clear search"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
      </div>

      <div className="toolbar-controls">
        <label className="sort-control">
          <span>Sort</span>
          <select
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label="Sort products"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          className={`filters-toggle ${activeFilterCount ? 'has-filters' : ''}`}
          onClick={onToggleFilters}
          aria-label="Toggle filters"
        >
          <FontAwesomeIcon icon={faSliders} />
          Filters
          {activeFilterCount > 0 && (
            <span className="filters-count">{activeFilterCount}</span>
          )}
        </button>
      </div>

      <p className="results-count">
        {resultCount} {resultCount === 1 ? 'item' : 'items'}
      </p>
    </div>
  );
}

export default MenuToolbar;