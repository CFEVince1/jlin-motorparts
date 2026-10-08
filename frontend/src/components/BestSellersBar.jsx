// frontend/src/components/BestSellersBar.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function BestSellersBar({ onAddToCart }) {
  const navigate = useNavigate();
  const [bestSellers, setBestSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('30'); // '30' days or '' for all time

  useEffect(() => {
    fetchBestSellers();
  }, [timeframe]);

  const fetchBestSellers = async () => {
    try {
      setLoading(true);
      const query = timeframe ? `?days=${timeframe}&limit=5` : '?limit=5';
      let data = null;

      try {
        const res = await api.get(`/sales/best-sellers${query}`);
        data = res.data;
      } catch (axiosErr) {
        // Fallback to fetch if direct API proxy / URL is used
        const token = localStorage.getItem('token');
        const fetchUrl = `/api/sales/best-sellers${query}`;
        const res = await fetch(fetchUrl, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null);
        if (res && res.ok) {
          data = await res.json();
        } else {
          throw axiosErr;
        }
      }

      if (data && data.success) {
        setBestSellers(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load best sellers', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 shadow-lg best-sellers-widget"
      style={{
        marginBottom: '16px',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '12px 14px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
      }}
    >
      <div
        className="flex items-center justify-between mb-2"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div
          className="flex items-center gap-2"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
        >
          <h3
            className="text-xs font-bold uppercase tracking-wider text-amber-400"
            style={{
              fontSize: '0.78rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#f59e0b',
              margin: 0
            }}
          >
            Staff Quick Guide: Top Selling Items
          </h3>
          <span
            className="text-[10px] text-zinc-500"
            style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}
          >
            (Quick answer for inquiring customers)
          </span>
        </div>

        {/* Timeframe Toggle */}
        <div
          className="flex items-center gap-1 text-[10px]"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}
        >
          <button
            type="button"
            onClick={() => setTimeframe('30')}
            className={`px-2 py-0.5 rounded transition ${
              timeframe === '30'
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: timeframe === '30' ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid var(--border)',
              background: timeframe === '30' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
              color: timeframe === '30' ? '#fbbf24' : 'var(--text-muted)',
              fontWeight: timeframe === '30' ? '600' : 'normal',
              cursor: 'pointer',
              fontSize: '0.75rem'
            }}
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('')}
            className={`px-2 py-0.5 rounded transition ${
              timeframe === ''
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: timeframe === '' ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid var(--border)',
              background: timeframe === '' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
              color: timeframe === '' ? '#fbbf24' : 'var(--text-muted)',
              fontWeight: timeframe === '' ? '600' : 'normal',
              cursor: 'pointer',
              fontSize: '0.75rem'
            }}
          >
            All-Time
          </button>
        </div>
      </div>

      <style>{`
        .best-sellers-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        @media (min-width: 900px) {
          .best-sellers-cards-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
          }
        }
      `}</style>

      {loading ? (
        <div
          className="text-[11px] text-zinc-500 py-1"
          style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '6px 0' }}
        >
          Loading recommendations...
        </div>
      ) : bestSellers.length === 0 ? (
        <div
          className="text-[11px] text-zinc-500 py-1"
          style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '6px 0' }}
        >
          No sales recorded yet.
        </div>
      ) : (
        <div
          className="best-sellers-cards-grid"
        >
          {bestSellers.map((item, index) => {
            const stockCount = Number(item.current_stock ?? item.stock ?? 0);
            const isOutOfStock = stockCount <= 0;
            const price = Number(item.retail_price ?? item.price ?? 0);

            return (
              <div
                key={item.id}
                onClick={() => !isOutOfStock && (onAddToCart ? onAddToCart(item) : navigate('/pos'))}
                className={`relative flex flex-col justify-between rounded-lg border p-2.5 transition cursor-pointer select-none ${
                  isOutOfStock
                    ? 'border-red-950/40 bg-zinc-950/40 opacity-60 cursor-not-allowed'
                    : 'border-zinc-800 bg-zinc-950/80 hover:border-amber-500/60 hover:bg-zinc-800/80'
                }`}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderRadius: '8px',
                  border: isOutOfStock ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border)',
                  background: isOutOfStock ? 'rgba(0,0,0,0.4)' : 'var(--surface-hover)',
                  padding: '10px 12px',
                  opacity: isOutOfStock ? 0.6 : 1,
                  cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Rank Badge */}
                <span
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    left: '-4px',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    background: '#f59e0b',
                    color: '#000000',
                    fontSize: '10px',
                    fontWeight: '900',
                    letterSpacing: '0.04em',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
                    zIndex: 2,
                    lineHeight: '1.2'
                  }}
                >
                  TOP {index + 1}
                </span>

                <div>
                  <div
                    className="truncate text-xs font-semibold text-zinc-100"
                    title={item.name}
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: '600',
                      color: 'var(--text-main)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {item.name}
                  </div>
                  <div
                    className="text-[10px] text-zinc-400 flex justify-between mt-0.5"
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '2px'
                    }}
                  >
                    <span>{item.brand || 'Generic'}</span>
                    <span
                      className="font-mono text-zinc-300"
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: '600',
                        color: 'var(--primary)'
                      }}
                    >
                      ₱{price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div
                  className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-1.5 text-[10px]"
                  style={{
                    marginTop: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid var(--border)',
                    paddingTop: '6px',
                    fontSize: '0.72rem'
                  }}
                >
                  {/* Stock Availability */}
                  <span
                    className={`font-semibold ${
                      isOutOfStock
                        ? 'text-red-400'
                        : stockCount <= 3
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                    style={{
                      fontWeight: '600',
                      color: isOutOfStock
                        ? 'var(--danger)'
                        : stockCount <= 3
                        ? '#fbbf24'
                        : 'var(--success)'
                    }}
                  >
                    {isOutOfStock ? 'Out of stock' : `${stockCount} in stock`}
                  </span>

                  {/* Volume Sold */}
                  <span
                    className="text-zinc-500"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {item.units_sold || 0} sold
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
