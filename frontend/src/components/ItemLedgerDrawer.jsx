import React, { useState, useEffect } from 'react';
import { X, History, FileText, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatAuditDate } from '../utils/formatters';

/**
 * ItemLedgerDrawer Component (Stock Card History)
 * 
 * Displays append-only stock movement history for an item.
 * Supports both inline panel mode (asPanel=true, no modal overlay, no border box)
 * and drawer mode.
 */
export const ItemLedgerDrawer = ({
  isOpen,
  onClose,
  product, // { id, part_number, name/product_name }
  asPanel = false,
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

  const getMovementLabel = (type) => {
    switch (type) {
      case 'SALE':
        return 'Customer Buy (POS)';
      case 'DAMAGE':
        return 'In-Store Defect / Damage';
      case 'RETURN_TO_SUPPLIER':
        return 'Rejected / Returned to Supplier';
      case 'LOSS':
        return 'Loss (- Inventory)';
      case 'FOUND':
        return 'Found (+ Inventory)';
      case 'STOCK_IN':
        return 'Stock In (+ Inventory)';
      case 'OPENING_BALANCE':
        return 'Opening Balance';
      default:
        return type;
    }
  };

  const getMovementColor = (type, qtyChange) => {
    switch (type) {
      case 'OPENING_BALANCE':
        return { bg: 'rgba(107, 114, 128, 0.15)', text: '#9ca3af' };
      case 'STOCK_IN':
      case 'FOUND':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' };
      case 'SALE':
        return { bg: 'rgba(59, 130, 246, 0.15)', text: '#2563eb' };
      case 'DAMAGE':
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#d97706' };
      case 'LOSS':
      case 'RETURN_TO_SUPPLIER':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' };
      default:
        return qtyChange >= 0
          ? { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' }
          : { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' };
    }
  };

  const content = (
    <div
      id={asPanel ? 'inline-stock-card-container' : undefined}
      className="stock-card-content"
      style={asPanel ? {
        width: '100%',
        backgroundColor: 'var(--surface)',
        borderRadius: '12px',
        border: 'none',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.18)',
        overflow: 'hidden',
        marginBottom: '20px'
      } : {
        width: '560px',
        maxWidth: '100vw',
        height: '100vh',
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div style={{
        padding: '18px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: asPanel ? 'rgba(16, 185, 129, 0.04)' : 'transparent'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              Stock Movement History (Stock Card)
            </h2>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{product.product_name || product.name}</span>
            <span style={{ margin: '0 8px', color: 'var(--border)' }}>•</span>
            <span>Part #: <strong style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>{product.part_number}</strong></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={fetchLedger}
            className="btn-secondary"
            style={{ padding: '6px 10px', height: '34px', borderRadius: '8px', cursor: 'pointer' }}
            title="Refresh history"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              height: '34px',
              borderRadius: '8px',
              cursor: 'pointer',
              color: 'var(--text-muted)'
            }}
            title="Close Stock Card"
          >
            <X size={16} />
            <span>Close Stock Card</span>
          </button>
        </div>
      </div>

      {/* Movement History List (Clean flat layout - No Border Box) */}
      <div style={{
        flex: asPanel ? 'none' : 1,
        maxHeight: asPanel ? '420px' : 'none',
        overflowY: 'auto',
        padding: '12px 24px'
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            Loading movement history...
          </div>
        ) : ledger.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No movement history recorded for this item yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ledger.map((entry, index) => {
              const styles = getMovementColor(entry.movement_type, entry.quantity_change);
              const isPositive = Number(entry.quantity_change) > 0;
              const isZero = Number(entry.quantity_change) === 0;

              return (
                <div
                  key={entry.id || index}
                  style={{
                    padding: '12px 0',
                    borderBottom: index === ledger.length - 1 ? 'none' : '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    background: 'transparent'
                  }}
                >
                  {/* Top Row: Movement Badge + Reference + Change + Balance */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: styles.bg,
                        color: styles.text,
                        border: 'none',
                        lineHeight: 1
                      }}>
                        {getMovementLabel(entry.movement_type)}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        Ref: <strong style={{ color: 'var(--text-main)' }}>{entry.reference_no}</strong>
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        • {formatAuditDate(entry.created_at)}
                      </span>
                    </div>

                    {/* Quantity delta & Balance */}
                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        fontWeight: 700,
                        fontSize: '0.92rem',
                        color: isZero ? 'var(--text-muted)' : (isPositive ? 'var(--success)' : 'var(--danger)')
                      }}>
                        {isPositive ? `+${entry.quantity_change} Units` : `${entry.quantity_change} Units`}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Bal: <strong style={{ color: 'var(--text-main)' }}>{entry.balance_before !== undefined ? `${entry.balance_before} → ${entry.balance_after}` : entry.balance_after}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Middle Row: Remarks if present */}
                  {entry.remarks && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontStyle: 'italic', paddingLeft: '2px' }}>
                      "{entry.remarks}"
                    </div>
                  )}

                  {/* Bottom Row: Cashier / Created By */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.74rem',
                    color: 'var(--text-muted)',
                    paddingTop: '2px'
                  }}>
                    <span>Logged by: <strong style={{ color: 'var(--text-main)' }}>{entry.created_by_username || 'system'}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 24px',
        borderTop: '1px solid var(--border)',
        background: asPanel ? 'rgba(255, 255, 255, 0.01)' : 'var(--surface)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Total Movement Records: <strong style={{ color: 'var(--text-main)' }}>{ledger.length}</strong>
        </span>
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          style={{ padding: '5px 12px', fontSize: '0.78rem', borderRadius: '6px' }}
        >
          Close Stock Card
        </button>
      </div>
    </div>
  );

  if (asPanel) {
    return content;
  }

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
      {content}
    </div>
  );
};

export default ItemLedgerDrawer;
