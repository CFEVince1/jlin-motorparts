// frontend/src/components/BestSellersBar.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
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

  const getRankBadgeStyle = (index) => {
    if (index === 0) {
      return {
        background: '#d97706',
        color: '#ffffff',
        border: 'none'
      };
    }
    if (index === 1) {
      return {
        background: '#0284c7',
        color: '#ffffff',
        border: 'none'
      };
    }
    if (index === 2) {
      return {
        background: '#16a34a',
        color: '#ffffff',
        border: 'none'
      };
    }
    return {
      background: 'var(--surface)',
      color: 'var(--text-muted)',
      border: '1px solid var(--border)'
    };
  };

  return (
    <div
      className="glass-panel best-sellers-widget"
      style={{
        marginBottom: '16px',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '14px 16px',
        boxShadow: 'var(--glass-shadow)'
      }}
    >
      {/* Widget Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
          <h3
            style={{
              fontSize: '0.92rem',
              fontWeight: '700',
              color: 'var(--text-main)',
              margin: 0
            }}
          >
            Top Selling Items
          </h3>
          <span
            style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
          >
            (Quick reference for customer inquiries)
          </span>
        </div>

        {/* Timeframe Toggle Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setTimeframe('30')}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: timeframe === '30' ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: timeframe === '30' ? 'var(--primary)' : 'transparent',
              color: timeframe === '30' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: timeframe === '30' ? '600' : 'normal',
              cursor: 'pointer',
              fontSize: '0.75rem',
              transition: 'all 0.15s ease'
            }}
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('')}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: timeframe === '' ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: timeframe === '' ? 'var(--primary)' : 'transparent',
              color: timeframe === '' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: timeframe === '' ? '600' : 'normal',
              cursor: 'pointer',
              fontSize: '0.75rem',
              transition: 'all 0.15s ease'
            }}
          >
            All-Time
          </button>
        </div>
      </div>

      {/* Cards Display */}
      {loading ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
          Loading top selling items...
        </div>
      ) : bestSellers.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
          No sales recorded yet.
        </div>
      ) : (
        <div
          className="best-sellers-cards-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px'
          }}
        >
          {bestSellers.map((item, index) => {
            const stockCount = Number(item.current_stock ?? item.stock ?? 0);
            const isOutOfStock = stockCount <= 0;
            const price = Number(item.retail_price ?? item.price ?? 0);
            const rankStyle = getRankBadgeStyle(index);

            return (
              <div
                key={item.product_id || item.id || index}
                onClick={() => !isOutOfStock && (onAddToCart ? onAddToCart(item) : navigate('/pos'))}
                title={isOutOfStock ? `${item.name} is currently out of stock` : `Click to open POS for ${item.name}`}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderRadius: '10px',
                  border: isOutOfStock ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
                  background: isOutOfStock ? 'rgba(239, 68, 68, 0.06)' : 'var(--surface-hover)',
                  padding: '12px 14px',
                  cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Clean Rank Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: '700',
                      letterSpacing: '0.04em',
                      lineHeight: '1.2',
                      display: 'inline-flex',
                      alignItems: 'center',
                      ...rankStyle
                    }}
                  >
                    TOP {index + 1}
                  </span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      color: 'var(--primary)'
                    }}
                  >
                    ₱{price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div>
                  <div
                    title={item.name}
                    style={{
                      fontSize: '0.85rem',
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
                    style={{
                      fontSize: '0.74rem',
                      color: 'var(--text-muted)',
                      marginTop: '2px'
                    }}
                  >
                    {item.brand || 'Generic'}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid var(--border)',
                    paddingTop: '6px',
                    fontSize: '0.74rem'
                  }}
                >
                  {/* Stock Availability */}
                  <span
                    style={{
                      fontWeight: '600',
                      color: isOutOfStock
                        ? 'var(--danger)'
                        : stockCount <= 3
                        ? '#d97706'
                        : 'var(--success)'
                    }}
                  >
                    {isOutOfStock ? 'Out of stock' : `${stockCount} in stock`}
                  </span>

                  {/* Volume Sold */}
                  <span style={{ color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text-main)' }}>{item.units_sold || 0}</strong> sold
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
