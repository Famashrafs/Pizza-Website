export const DEFAULT_FILTERS = {
  category: 'All',
  priceMin: null,
  priceMax: null,
  vegetarian: false,
  available: false,
  popular: false,
  featured: false,
};

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'popularity', label: 'Most Popular' },
  { value: 'newest', label: 'Newest' },
];

const fold = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export function normalizeQuery(query) {
  return fold(query).trim();
}

export function searchProducts(products, query) {
  const q = normalizeQuery(query);
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return products;
  }
  return products.filter((product) => {
    const haystack = [
      product.name,
      product.description,
      product.category,
      ...(product.ingredients || []),
    ]
      .map(fold)
      .join(' ');
    return tokens.every((token) => haystack.includes(token));
  });
}

export function filterProducts(products, filters = {}) {
  const {
    category,
    priceMin,
    priceMax,
    vegetarian,
    available,
    popular,
    featured,
  } = { ...DEFAULT_FILTERS, ...filters };

  return products.filter((product) => {
    if (category && category !== 'All' && product.category !== category) {
      return false;
    }
    if (priceMin != null && product.basePrice < priceMin) {
      return false;
    }
    if (priceMax != null && product.basePrice > priceMax) {
      return false;
    }
    if (vegetarian && !product.vegetarian) {
      return false;
    }
    if (available && !product.available) {
      return false;
    }
    if (popular && !product.popular) {
      return false;
    }
    if (featured && !product.featured) {
      return false;
    }
    return true;
  });
}

const toTime = (value) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export function sortProducts(products, sortKey) {
  const list = [...products];
  switch (sortKey) {
    case 'price-asc':
      list.sort((a, b) => a.basePrice - b.basePrice);
      break;
    case 'price-desc':
      list.sort((a, b) => b.basePrice - a.basePrice);
      break;
    case 'rating':
      list.sort((a, b) => b.rating - a.rating);
      break;
    case 'popularity':
      list.sort((a, b) => b.popularity - a.popularity);
      break;
    case 'newest':
      list.sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
      break;
    default:
      list.sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          a.name.localeCompare(b.name)
      );
  }
  return list;
}

export function getPriceLimits(products) {
  if (!products.length) {
    return { min: 0, max: 0 };
  }
  const prices = products.map((product) => product.basePrice);
  return {
    min: Math.floor(Math.min(...prices)),
    max: Math.ceil(Math.max(...prices)),
  };
}

export function countActiveFilters(filters) {
  const { category, priceMin, priceMax, vegetarian, available, popular, featured } =
    { ...DEFAULT_FILTERS, ...filters };
  let count = 0;
  if (category && category !== 'All') count += 1;
  if (priceMin != null || priceMax != null) count += 1;
  if (vegetarian) count += 1;
  if (available) count += 1;
  if (popular) count += 1;
  if (featured) count += 1;
  return count;
}

export function pluralizeCategory(category) {
  if (!category) return 'items';
  const lower = category.toLowerCase();
  return lower.endsWith('s') ? lower : `${lower}s`;
}