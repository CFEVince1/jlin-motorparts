import React, { useState, useEffect } from 'react';
import { X, History, FileText, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatAuditDate } from '../utils/formatters';

/**
 * ItemLedgerDrawer Component (Renamed to History)
 * 
 * Slide-out drawer displaying stock movement history for an item.
 * - Queries GET /api/items/:id/ledger (or /api/inventory/items/:id/ledger).
 * - Badges: OPENING_BALANCE, STOCK_IN, SALE, DAMAGE, LOSS, RETURN_TO_SUPPLIER, FOUND.
 * - Displays quantity change, balance after, reference number, cashier/staff username, and timestamp.
 */
export const ItemLedgerDrawer = ({
  isOpen,
  onClose,
  product, // { id, part_number, name/product_name }
}) => {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);

  const itemId = product?.id || product?.product_id;

  const fetchLedger = async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      let res;
      try {
        res = await api.get(`/items/${itemId}/ledger`);
      } catch (firstErr) {
        res = await api.get(`/inventory/items/${itemId}/ledger`);
      }
      const raw = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.transactions || []);
      const normalized = raw.map(entry => ({
        ...entry,
        movement_type: entry.movement_type || entry.transaction_type,
        remarks: entry.remarks || entry.notes
      }));
      setLedger(normalized);
    } catch (err) {
      console.error('History fetch error:', err);
      toast.error('Failed to load item movement history');
      setLedger([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && itemId) {
      fetchLedger();
    }
  }, [isOpen, itemId]);

  if (!isOpen || !product) return null;

  const getMovementColor = (type, qtyChange) => {
    switch (type) {
      case 'OPENING_BALANCE':
        return { bg: 'rgba(107, 114, 128, 0.15)', text: '#9ca3af', border: 'rgba(107, 114, 128, 0.4)' };
      case 'STOCK_IN':
      case 'FOUND':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.4)' };
      case 'SALE':
        return { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.4)' };
      case 'DAMAGE':
      case 'LOSS':
      case 'RETURN_TO_SUPPLIER':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.4)' };
      default:
        return qtyChange >= 0
          ? { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.4)' }
          : { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.4)' };
    }
  };

  return (
    <div className="receipt-overlay no-print" style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      zIndex: 9999,
      display: 'flex',
      justifyContent: 'flex-end',
      transition: 'opacity 0.2s ease'
    }}>
      <div style={{
        width: '560px',
        maxWidth: '100vw',
        height: '100vh',
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Drawer Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0, color: 'var(--text-main)' }}>
                Stock Movement History
              </h2>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {product.product_name || product.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Part #: <strong style={{ color: 'var(--text-main)' }}>{product.part_number}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={fetchLedger}
              className="btn-secondary"
              style={{ padding: '6px 10px', height: '32px' }}
              title="Refresh history"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* History Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              Loading movement history...
            </div>
          ) : ledger.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              No movement history recorded for this item yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {ledger.map((entry, index) => {
                const styles = getMovementColor(entry.movement_type, entry.quantity_change);
                const isPositive = Number(entry.quantity_change) > 0;
                const isZero = Number(entry.quantity_change) === 0;

                return (
                  <div key={entry.id || index} style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    {/* Top Row: Movement Badge + Change */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: styles.bg,
                          color: styles.text,
                          border: `1px solid ${styles.border}`
                        }}>
                          {entry.movement_type}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          Ref: {entry.reference_no}
                        </span>
                      </div>

                      {/* Quantity delta & Balance */}
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          fontWeight: 'bold',
                          fontSize: '0.95rem',
                          color: isZero ? 'var(--text-muted)' : (isPositive ? 'var(--success)' : 'var(--danger)')
                        }}>
                          {isPositive ? `+${entry.quantity_change}` : entry.quantity_change}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          Bal: <strong>{entry.balance_after}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Remarks if present */}
                    {entry.remarks && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontStyle: 'italic', padding: '4px 0' }}>
                        "{entry.remarks}"
                      </div>
                    )}

                    {/* Bottom Row: Cashier / Created At */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      borderTop: '1px dashed var(--border)',
                      paddingTop: '6px',
                      marginTop: '2px'
                    }}>
                      <span>Staff: <strong style={{ color: 'var(--text-main)' }}>{entry.created_by_username || 'system'}</strong></span>
                      <span>{formatAuditDate(entry.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Total Movement Events: <strong>{ledger.length}</strong>
          </span>
          <button className="btn-secondary" onClick={onClose}>
            Close History
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemLedgerDrawer;
