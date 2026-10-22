import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  faChartLine,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import { computeSalesSeries } from '../../services/adminService';
import { formatMoney } from '../../i18n/format';
import { useTheme } from '../../context/ThemeContext';
import AdminEmptyState from './AdminEmptyState';
import AdminErrorState from './AdminErrorState';

// Read the active theme's design tokens so the chart follows Light/Dark mode
// instead of being permanently dark.
function readPalette() {
  const rootStyles =
    typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement)
      : null;
  const token = (name, fallback) =>
    rootStyles?.getPropertyValue(name)?.trim() || fallback;
  return {
    accent: token('--accent', '#dca54c'),
    grid: token('--border', '#23282c'),
    axis: token('--border-strong', '#2a2f33'),
    tick: token('--text-muted', '#808080'),
    label: token('--text-secondary', '#b8b8b8'),
    tooltipBg: token('--surface-elevated', '#171b1e'),
    tooltipBorder: token('--border-strong', '#2a2f33'),
    onAccent: token('--on-accent', '#121618'),
  };
}

// Default ranges carry a translation key instead of copy so the labels stay
// translatable while the keys remain the shared source of truth.
const DEFAULT_RANGES = [
  { key: 'today', labelKey: 'admin.rangeToday' },
  { key: '7d', labelKey: 'admin.range7Days' },
  { key: '30d', labelKey: 'admin.range30Days' },
];

function SalesSkeleton() {
  return (
    <div className="admin-sales-skeleton">
      <div className="dash-skeleton-line" style={{ width: 160, height: 20 }} />
      <div className="admin-sales-skeleton-chart">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="dash-skeleton-line" style={{ width: '100%', height: 26 }} />
        ))}
      </div>
    </div>
  );
}

function SalesOverview({
  orders = [],
  status,
  error,
  onRetry,
  ranges,
  range: controlledRange,
  onRangeChange,
  defaultRange = '7d',
}) {
  const { t, i18n } = useTranslation();
  const [internalRange, setInternalRange] = useState(defaultRange);
  const range = controlledRange || internalRange;
  const setRange = (key) => {
    if (onRangeChange) onRangeChange(key);
    else setInternalRange(key);
  };
  const rangeOptions = ranges && ranges.length ? ranges : DEFAULT_RANGES;
  const labelFor = (entry) =>
    entry.labelKey ? t(entry.labelKey) : entry.label || entry.key;
  useTheme();
  const palette = readPalette();

  const series = useMemo(
    () => computeSalesSeries(orders, range),
    [orders, range]
  );

  const rangeTotal = useMemo(
    () => series.reduce((sum, point) => sum + point.revenue, 0),
    [series]
  );

  return (
    <section className="admin-panel admin-sales">
      <div className="admin-panel-head">
        <div>
          <h3>
            <FontAwesomeIcon icon={faChartLine} /> {t('admin.salesOverview')}
          </h3>
          <p className="admin-panel-sub">
            {range === 'today'
              ? t('admin.revenueByHour')
              : t('admin.revenueRange', {
                  range: labelFor(
                    rangeOptions.find((entry) => entry.key === range) || { key: range }
                  ),
                })}
          </p>
        </div>
        <div className="admin-tabs" role="tablist" aria-label={t('admin.ariaSalesRange')}>
          {rangeOptions.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={range === r.key ? 'admin-tab active' : 'admin-tab'}
              onClick={() => setRange(r.key)}
            >
              {labelFor(r)}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && <SalesSkeleton />}

      {status === 'error' && (
        <AdminErrorState
          message={error || t('admin.errorLoadSales')}
          onRetry={onRetry}
        />
      )}

      {status === 'success' && orders.length === 0 && (
        <AdminEmptyState
          icon={faChartLine}
          title={t('admin.noSalesYet')}
          message={t('admin.noSalesYetMessage')}
        />
      )}

      {status === 'success' && orders.length > 0 && (
        <>
          <div className="admin-sales-total">
            {formatMoney(rangeTotal, i18n.language)}{' '}
            <span>{t('admin.inSelectedRange')}</span>
          </div>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={series} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={palette.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={palette.accent} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: palette.tick, fontSize: 11 }}
                  axisLine={{ stroke: palette.axis }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: palette.tick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatMoney(v, i18n.language)}
                  width={64}
                />
                <Tooltip
                  contentStyle={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, borderRadius: 8 }}
                  labelStyle={{ color: palette.label }}
                  formatter={(value) => [
                    formatMoney(Number(value), i18n.language),
                    t('admin.revenue'),
                  ]}
                  cursor={{ stroke: palette.accent, strokeDasharray: '3 3' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={palette.accent}
                  strokeWidth={2}
                  fill="url(#salesFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: palette.accent, stroke: palette.onAccent }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}

export default SalesOverview;