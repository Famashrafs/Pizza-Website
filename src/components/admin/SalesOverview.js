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
import { computeSalesSeries } from '../../services/adminService';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import AdminEmptyState from './AdminEmptyState';
import AdminErrorState from './AdminErrorState';

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
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

function SalesOverview({ orders = [], status, error, onRetry }) {
  const [range, setRange] = useState('7d');
  const currency = RESTAURANT_SETTINGS.currency || '$';

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
            <FontAwesomeIcon icon={faChartLine} /> Sales Overview
          </h3>
          <p className="admin-panel-sub">
            {range === 'today'
              ? 'Revenue by hour'
              : `Revenue, last ${range === '7d' ? 7 : 30} days`}
          </p>
        </div>
        <div className="admin-tabs" role="tablist" aria-label="Sales range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={range === r.key ? 'admin-tab active' : 'admin-tab'}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && <SalesSkeleton />}

      {status === 'error' && (
        <AdminErrorState message={error || 'Unable to load sales data.'} onRetry={onRetry} />
      )}

      {status === 'success' && orders.length === 0 && (
        <AdminEmptyState
          icon={faChartLine}
          title="No sales to display yet"
          message="Sales trends will appear here as soon as your first order comes in."
        />
      )}

      {status === 'success' && orders.length > 0 && (
        <>
          <div className="admin-sales-total">
            {currency}
            {rangeTotal.toFixed(2)} <span>in selected range</span>
          </div>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={series} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fac564" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#fac564" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#23282c" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#808080', fontSize: 11 }}
                  axisLine={{ stroke: '#2a2f33' }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: '#808080', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${currency}${v}`}
                  width={64}
                />
                <Tooltip
                  contentStyle={{ background: '#171b1e', border: '1px solid #2a2f33', borderRadius: 8 }}
                  labelStyle={{ color: '#b8b8b8' }}
                  formatter={(value) => [`${currency}${Number(value).toFixed(2)}`, 'Revenue']}
                  cursor={{ stroke: '#fac564', strokeDasharray: '3 3' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#fac564"
                  strokeWidth={2}
                  fill="url(#salesFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#fac564', stroke: '#121618' }}
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