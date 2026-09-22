import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { fetchProducts, getCategories } from '../services/menuService';
import {
  DEFAULT_FILTERS,
  searchProducts,
  filterProducts,
  sortProducts,
  getPriceLimits,
  countActiveFilters,
  pluralizeCategory,
} from '../utils/menuLogic';
import { createCartItem } from '../utils/cartItem';
import MenuToolbar from '../components/MenuToolbar';
import MenuFilters from '../components/MenuFilters';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import SkeletonCard from '../components/SkeletonCard';
import EmptyState from '../components/EmptyState';

const SKELETON_COUNT = 8;

function MenuPage() {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(() => {
    const initialCategory = location.state?.category;
    return {
      ...DEFAULT_FILTERS,
      ...(initialCategory ? { category: initialCategory } : {}),
    };
  });
  const [sortKey, setSortKey] = useState('featured');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customizing, setCustomizing] = useState(null);

  const { addItem } = useCart();
  const { showToast } = useToast();

  const loadProducts = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await fetchProducts();
      setProducts(data);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const categories = useMemo(() => getCategories(products), [products]);
  const priceLimits = useMemo(() => getPriceLimits(products), [products]);

  const visibleProducts = useMemo(() => {
    const searched = searchProducts(products, query);
    const filtered = filterProducts(searched, filters);
    return sortProducts(filtered, sortKey);
  }, [products, query, filters, sortKey]);

  const activeFilterCount = countActiveFilters(filters);

  const updateFilters = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const resetFilters = () => {
    setQuery('');
    setFilters({ ...DEFAULT_FILTERS });
  };

  const selectCategory = (category) => updateFilters({ category });

  const handleConfirmCustomization = (config) => {
    const item = createCartItem(customizing, config);
    if (!item) {
      showToast('That configuration is not valid.', 'error');
      return;
    }
    addItem(item);
    showToast(`${customizing.name} added to cart.`);
    setCustomizing(null);
  };

  const emptyMessage = query
    ? `No ${pluralizeCategory(
        filters.category === 'All' ? null : filters.category
      )} found for '${query}'.`
    : 'No products match your filters.';

  return (
    <>
      <div className="landing-page">
        <h1 className="landing-title">OUR MENU</h1>
      </div>

      <section className="catalog">
        <div className="catalog-heading">
          <h2>Order in minutes</h2>
          <p>
            Freshly made with quality ingredients. Search, filter and customize
            your favorites.
          </p>
        </div>

        <MenuToolbar
          query={query}
          onQueryChange={setQuery}
          onClearQuery={() => setQuery('')}
          sortKey={sortKey}
          onSortChange={setSortKey}
          resultCount={visibleProducts.length}
          activeFilterCount={activeFilterCount}
          onToggleFilters={() => setFiltersOpen((open) => !open)}
        />

        <nav className="menu-tabs" aria-label="Menu categories">
          <button
            className={filters.category === 'All' ? 'active' : ''}
            onClick={() => selectCategory('All')}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              className={filters.category === category ? 'active' : ''}
              onClick={() => selectCategory(category)}
            >
              {category}
            </button>
          ))}
        </nav>

        <div className={`catalog-body${filtersOpen ? ' filters-open' : ''}`}>
          {filtersOpen && (
            <MenuFilters
              filters={filters}
              categories={categories}
              priceLimits={priceLimits}
              onChange={updateFilters}
              onReset={resetFilters}
              onClose={() => setFiltersOpen(false)}
            />
          )}

          <div className="catalog-results">
            {status === 'loading' && (
              <div className="product-grid">
                {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
                  <SkeletonCard key={index} />
                ))}
              </div>
            )}

            {status === 'error' && (
              <EmptyState
                title="We couldn't load the menu"
                message="Something went wrong while loading the products. Please try again."
                actionLabel="Try again"
                onAction={loadProducts}
              />
            )}

            {status === 'ready' && visibleProducts.length === 0 && (
              <EmptyState
                message={emptyMessage}
                actionLabel="Clear filters"
                onAction={resetFilters}
              />
            )}

            {status === 'ready' && visibleProducts.length > 0 && (
              <div className="product-grid">
                {visibleProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onCustomize={setCustomizing}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {customizing && (
        <ProductModal
          product={customizing}
          onClose={() => setCustomizing(null)}
          onConfirm={handleConfirmCustomization}
        />
      )}
    </>
  );
}

export default MenuPage;