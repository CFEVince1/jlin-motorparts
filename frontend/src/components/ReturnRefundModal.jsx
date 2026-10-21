import React, { useState, useEffect } from 'react';
import { RotateCcw, X, AlertTriangle, CheckCircle, Package, ArrowUpRight, ArrowDownRight, RefreshCw, FileText } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import Spinner from './Spinner';

/**
 * ReturnRefundModal Component
 * 
 * Handles Customer Returns & Refunds on Sales Transactions:
 * - Select items and quantities to return from an order
 * - Specify return disposition & inventory impact:
 *   1. FOUND: Restock into inventory (+ into inventory)
 *   2. DAMAGE: Damaged item, marked as damage / return to supplier (- into inventory)
 *   3. RETURN_TO_SUPPLIER: Returned directly to supplier (- inventory)
 *   4. LOSS: Unrecovered / lost item (- negative into inventory)
 * - Auto-calculates total refund amount
 * - Select refund payment method (Cash / GCash / Original)
 * - Records mandatory return reason for audit compliance
 */
export const ReturnRefundModal = ({
  isOpen,
  onClose,
  transaction,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saleDetails, setSaleDetails] = useState(null);
  const [returnItems, setReturnItems] = useState({});
  const [refundPaymentMethod, setRefundPaymentMethod] = useState('Cash');
  const [reason, setReason] = useState('');

  // Fetch full sale items and existing returns
  useEffect(() => {
    if (!isOpen || !transaction?.id) {
      setSaleDetails(null);
      setReturnItems({});
      return;
    }

    const fetchSaleDetails = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/sales/${transaction.id}`);
        const sale = res.data;
        setSaleDetails(sale);
        setRefundPaymentMethod(sale.payment_method === 'GCash' ? 'GCash' : 'Cash');

        // Initialize return state for each item
        const initial = {};
        (sale.items || []).forEach(item => {
          const available = item.available_to_return ?? (item.quantity - (item.returned_quantity || 0));
          initial[item.sale_item_id || item.id] = {
            selected: available > 0,
            quantity: available > 0 ? 1 : 0,
            maxQuantity: Math.max(0, available),
            disposition: 'FOUND', // Default: Restock (+ into inventory)
            refund_price: Number(item.price || 0),
            notes: ''
          };
        });
        setReturnItems(initial);
      } catch (err) {
        console.error('Failed to load transaction details for refund:', err);
        toast.error('Failed to load transaction details');
        onClose();
      } finally {
        setLoading(false);
      }
    };

    fetchSaleDetails();
  }, [isOpen, transaction]);

  if (!isOpen) return null;

  const handleToggleSelect = (saleItemId) => {
    setReturnItems(prev => {
      const current = prev[saleItemId];
      if (!current || current.maxQuantity <= 0) return prev;
      return {
        ...prev,
        [saleItemId]: {
          ...current,
          selected: !current.selected,
          quantity: !current.selected ? Math.max(1, current.quantity || 1) : 0
        }
      };
    });
  };

  const handleQuantityChange = (saleItemId, val) => {
    const num = parseInt(val, 10) || 0;
    setReturnItems(prev => {
      const current = prev[saleItemId];
      if (!current) return prev;
      const clamped = Math.max(0, Math.min(num, current.maxQuantity));
      return {
        ...prev,
        [saleItemId]: {
          ...current,
          quantity: clamped,
          selected: clamped > 0
        }
      };
    });
  };

  const handleDispositionChange = (saleItemId, disp) => {
    setReturnItems(prev => {
      const current = prev[saleItemId];
      if (!current) return prev;
      return {
        ...prev,
        [saleItemId]: {
          ...current,
          disposition: disp
        }
      };
    });
  };

  const handleNotesChange = (saleItemId, notes) => {
    setReturnItems(prev => {
      const current = prev[saleItemId];
      if (!current) return prev;
      return {
        ...prev,
        [saleItemId]: {
          ...current,
          notes
        }
      };
    });
  };

  // Calculate totals
  const selectedEntries = Object.entries(returnItems).filter(([, item]) => item.selected && item.quantity > 0);
  const totalRefundAmount = selectedEntries.reduce((sum, [, item]) => sum + (item.quantity * item.refund_price), 0);
  const totalUnitsReturning = selectedEntries.reduce((sum, [, item]) => sum + item.quantity, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedEntries.length === 0) {
      toast.error('Please select at least one item and quantity to return');
      return;
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason or remarks for this return/refund');
      return;
    }

    const payloadItems = selectedEntries.map(([saleItemId, it]) => {
      const originalItem = (saleDetails?.items || []).find(si => String(si.sale_item_id || si.id) === String(saleItemId));
      return {
        sale_item_id: Number(saleItemId),
        product_id: originalItem?.product_id,
        quantity: it.quantity,
        refund_price: it.refund_price,
        disposition: it.disposition,
        notes: it.notes
      };
    });

    setSubmitting(true);
    try {
      const res = await api.post(`/sales/${saleDetails.id}/refund`, {
        items: payloadItems,
        refundPaymentMethod,
        reason: reason.trim()
      });

      toast.success(res.data?.message || 'Return & Refund successfully processed');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Refund processing error:', err);
      toast.error(err.response?.data?.message || 'Failed to process return and refund');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="receipt-modal" style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div className="glass-panel" style={{
        background: 'var(--surface, #FFFFFF)',
        color: 'var(--text-main, #111111)',
        padding: '28px',
        width: '100%',
        maxWidth: '820px',
        borderRadius: '12px',
        position: 'relative',
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
        border: '1px solid var(--border, #E5E7EB)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>
              <RotateCcw size={24} color="var(--primary, #16A34A)" /> Process Return & Refund
            </h2>
            <p style={{ color: 'var(--text-muted, #6B7280)', fontSize: '0.85rem', margin: '4px 0 0 34px' }}>
              Order <strong style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>{saleDetails?.order_number || transaction?.order_number || `SO-${transaction?.id}`}</strong>
              {' '} • Sold on {formatAuditDate(saleDetails?.sale_date || transaction?.sale_date)} • Cashier: <span style={{ textTransform: 'capitalize' }}>{saleDetails?.cashier || transaction?.cashier}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
          >
            <X size={22} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '60px 0' }}>
            <Spinner text="Loading sale transaction details..." />
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Items Table */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Select Items to Return & Specify Inventory Disposition</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {selectedEntries.length} item(s) selected
                </span>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ background: 'var(--bg-base, #F9FAFB)', borderBottom: '1px solid var(--border)' }}>
                    <tr>
                      <th style={{ padding: '10px 12px', textAlign: 'left', width: '36px' }}></th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Product & Part #</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', width: '80px' }}>Sold Qty</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', width: '100px' }}>Return Qty</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', width: '230px' }}>Inventory Disposition</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', width: '110px' }}>Refund Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(saleDetails?.items || []).map(item => {
                      const itemId = item.sale_item_id || item.id;
                      const returnState = returnItems[itemId] || { selected: false, quantity: 0, maxQuantity: 0, disposition: 'FOUND', refund_price: Number(item.price || 0) };
                      const isMaxedOut = returnState.maxQuantity <= 0;

                      return (
                        <tr
                          key={itemId}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: returnState.selected ? 'rgba(22, 163, 74, 0.04)' : 'transparent',
                            opacity: isMaxedOut ? 0.6 : 1
                          }}
                        >
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={returnState.selected}
                              disabled={isMaxedOut}
                              onChange={() => handleToggleSelect(itemId)}
                              style={{ width: '16px', height: '16px', cursor: isMaxedOut ? 'not-allowed' : 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.product_name}</div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: 'var(--bg-base)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                {item.part_number || '-'}
                              </span>
                              {item.serial_numbers && (
                                <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--primary)', background: 'rgba(22, 163, 74, 0.1)', padding: '1px 6px', borderRadius: '4px' }}>
                                  SN: {item.serial_numbers}
                                </span>
                              )}
                              {item.returned_quantity > 0 && (
                                <span style={{ fontSize: '0.72rem', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: '4px' }}>
                                  Prev returned: {item.returned_quantity}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>
                            {item.quantity}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {isMaxedOut ? (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fully Returned</span>
                            ) : (
                              <input
                                type="number"
                                min="1"
                                max={returnState.maxQuantity}
                                value={returnState.quantity || ''}
                                onChange={(e) => handleQuantityChange(itemId, e.target.value)}
                                disabled={!returnState.selected}
                                style={{
                                  width: '64px',
                                  textAlign: 'center',
                                  padding: '4px 6px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border)',
                                  background: returnState.selected ? '#fff' : 'var(--bg-base)'
                                }}
                              />
                            )}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <select
                              value={returnState.disposition}
                              disabled={!returnState.selected}
                              onChange={(e) => handleDispositionChange(itemId, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                fontSize: '0.8rem',
                                background: returnState.selected ? '#fff' : 'var(--bg-base)',
                                cursor: returnState.selected ? 'pointer' : 'not-allowed'
                              }}
                            >
                              <option value="FOUND">🟢 Found / Restock (+ Inventory)</option>
                              <option value="DAMAGE">🔴 Damaged - Return to Supplier (- Inventory)</option>
                              <option value="RETURN_TO_SUPPLIER">🟠 Return to Supplier (- Inventory)</option>
                              <option value="LOSS">🟣 Loss / Unrecovered (- Inventory)</option>
                            </select>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: returnState.selected ? 'var(--primary)' : 'var(--text-muted)' }}>
                            {formatCurrency(returnState.selected ? (returnState.quantity * returnState.refund_price) : 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Inventory Impact Guide */}
            <div style={{
              background: 'var(--bg-base, #F9FAFB)',
              border: '1px solid var(--border, #E5E7EB)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px',
              fontSize: '0.78rem',
              color: 'var(--text-muted)'
            }}>
              <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Inventory Impact Rules:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
                <div><span style={{ color: '#16A34A', fontWeight: 'bold' }}>+ FOUND:</span> Restocked to shelves (+ stock)</div>
                <div><span style={{ color: '#DC2626', fontWeight: 'bold' }}>- DAMAGE:</span> Marked damaged / defective (- stock)</div>
                <div><span style={{ color: '#D97706', fontWeight: 'bold' }}>- RTS:</span> Returned to supplier (- stock)</div>
                <div><span style={{ color: '#9333EA', fontWeight: 'bold' }}>- LOSS:</span> Written off as lost (- stock)</div>
              </div>
            </div>

            {/* Refund Options & Remarks */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Refund Payment Method
                </label>
                <select
                  className="input-premium"
                  value={refundPaymentMethod}
                  onChange={(e) => setRefundPaymentMethod(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="Cash">Cash Refund</option>
                  <option value="GCash">GCash Transfer</option>
                  <option value="Original Payment">Original Payment Method ({saleDetails?.payment_method})</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Total Refund Amount
                </label>
                <div style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: 'rgba(22, 163, 74, 0.08)',
                  border: '1px solid rgba(22, 163, 74, 0.25)',
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  color: 'var(--primary, #16A34A)'
                }}>
                  {formatCurrency(totalRefundAmount)}
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '8px' }}>
                    ({totalUnitsReturning} unit{totalUnitsReturning !== 1 ? 's' : ''})
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Return Reason & Audit Remarks <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                className="input-premium"
                rows="2"
                placeholder="e.g. Customer returned damaged brake pad; replacing with supplier / restocked wrong size item..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
                required
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={submitting}
                style={{ padding: '8px 18px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting || selectedEntries.length === 0}
                style={{ padding: '8px 22px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {submitting ? (
                  <>Processing Refund...</>
                ) : (
                  <>
                    <RotateCcw size={16} /> Confirm Return & Refund ({formatCurrency(totalRefundAmount)})
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ReturnRefundModal;
