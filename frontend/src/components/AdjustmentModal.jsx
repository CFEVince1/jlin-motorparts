import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, CheckCircle, Package } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * AdjustmentModal Component
 * 
 * Stock adjustment modal for:
 * - DAMAGE (-), LOSS (-), RETURN_TO_SUPPLIER (-)
 * - FOUND (+) with conditional open-losses dropdown via GET /api/items/:id/open-losses
 * - Mandatory reference number and remarks.
 */
export const AdjustmentModal = ({
  isOpen,
  onClose,
  product, // { id, part_number, name/product_name, stock/current_stock }
  onSuccess,
}) => {
  const [movementType, setMovementType] = useState('DAMAGE'); // DAMAGE | LOSS | RETURN_TO_SUPPLIER | FOUND
  const [quantity, setQuantity] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [openLosses, setOpenLosses] = useState([]);
  const [selectedLossId, setSelectedLossId] = useState('');
  const [loadingLosses, setLoadingLosses] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const itemId = product?.id || product?.product_id;
  const currentStock = product?.current_stock ?? product?.stock ?? 0;

  // When movementType changes to FOUND, fetch open losses for this item
  useEffect(() => {
    if (!isOpen || !itemId) return;

    if (movementType === 'FOUND') {
      const fetchOpenLosses = async () => {
        setLoadingLosses(true);
        try {
          const res = await api.get(`/items/${itemId}/open-losses`);
          const losses = res.data || [];
          setOpenLosses(losses);
          if (losses.length > 0) {
            setSelectedLossId(String(losses[0].id || losses[0].loss_transaction_id || ''));
          } else {
            setSelectedLossId('');
          }
        } catch (err) {
          console.error('Error fetching open losses:', err);
          toast.error('Failed to load past loss records for restoration');
          setOpenLosses([]);
        } finally {
          setLoadingLosses(false);
        }
      };
      fetchOpenLosses();
    } else {
      setSelectedLossId('');
    }
  }, [isOpen, itemId, movementType]);

  if (!isOpen || !product) return null;

  const isDeduction = ['DAMAGE', 'LOSS', 'RETURN_TO_SUPPLIER'].includes(movementType);
  const qtyNumber = parseInt(quantity, 10) || 0;

  // Selected open loss details if FOUND
  const activeLossRecord = openLosses.find(l => 
    String(l.id || l.loss_transaction_id) === String(selectedLossId) ||
    l.reference_no === selectedLossId
  );
  const maxRestorable = activeLossRecord 
    ? Number(activeLossRecord.restorable_balance ?? activeLossRecord.unrestored_quantity ?? 0) 
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!quantity || qtyNumber <= 0) {
      toast.error('Please enter a valid positive quantity');
      return;
    }

    if (isDeduction && qtyNumber > currentStock) {
      toast.error(`Cannot deduct more than available current stock (${currentStock})`);
      return;
    }

    if (movementType === 'FOUND') {
      if (openLosses.length === 0) {
        toast.error('No unresolved loss records exist for this item to restore');
        return;
      }
      if (!activeLossRecord) {
        toast.error('Please select the prior loss record to link this found stock');
        return;
      }
      if (qtyNumber > maxRestorable) {
        toast.error(`Cannot restore more than unrestored lost quantity (${maxRestorable})`);
        return;
      }
    }

    if (!referenceNo.trim()) {
      toast.error('Reference number is mandatory');
      return;
    }

    if (!remarks.trim()) {
      toast.error('Remarks/reason are mandatory for audit compliance');
      return;
    }

    setSubmitting(true);
    try {
      const lossTxId = activeLossRecord ? (activeLossRecord.id || activeLossRecord.loss_transaction_id) : undefined;
      const lossRefNo = activeLossRecord?.reference_no || undefined;

      await api.post('/inventory/adjustments', {
        item_id: itemId,
        product_id: itemId,
        movement_type: movementType,
        transaction_type: movementType,
        quantity: qtyNumber,
        reference_no: referenceNo.trim(),
        remarks: remarks.trim(),
        loss_transaction_id: lossTxId,
        loss_reference_no: lossRefNo,
      });

      toast.success(`Inventory adjustment (${movementType}) recorded successfully`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to submit adjustment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="receipt-overlay no-print" style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.75)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div className="glass-panel" style={{
        background: 'var(--surface)',
        padding: '24px',
        width: '460px',
        maxWidth: '100%',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        border: '1px solid var(--border)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} style={{ color: isDeduction ? 'var(--danger)' : 'var(--success)' }} />
              Stock Adjustment
            </h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Audit ledger adjustment for item discrepancies
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Item Info Banner */}
        <div style={{
          padding: '10px 14px',
          background: 'var(--surface-hover)',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-main)' }}>
              {product.product_name || product.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Part #: {product.part_number} | {product.brand || 'No Brand'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Current Stock</span>
            <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: currentStock > 0 ? 'var(--primary)' : 'var(--danger)' }}>
              {currentStock}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Movement Type */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
              Adjustment Reason / Type *
            </label>
            <select
              className="input-premium"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              disabled={submitting}
            >
              <option value="DAMAGE">DAMAGE (Damaged in storage / unusable)</option>
              <option value="LOSS">LOSS (Missing / Inventory shrinkage)</option>
              <option value="RETURN_TO_SUPPLIER">RETURN_TO_SUPPLIER (Defective / supplier return)</option>
              <option value="FOUND">FOUND (Recovered previously lost stock)</option>
            </select>
          </div>

          {/* Conditional Open Loss Dropdown for FOUND */}
          {movementType === 'FOUND' && (
            <div style={{
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(5, 150, 105, 0.08)',
              border: '1px solid rgba(5, 150, 105, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--primary)', display: 'block' }}>
                Select Prior Loss Entry to Restore *
              </label>
              {loadingLosses ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading previous loss entries...</div>
              ) : openLosses.length > 0 ? (
                <>
                  <select
                    className="input-premium"
                    value={selectedLossId}
                    onChange={(e) => setSelectedLossId(e.target.value)}
                    disabled={submitting}
                  >
                    {openLosses.map(loss => {
                      const idVal = String(loss.id || loss.loss_transaction_id);
                      const lostCount = loss.reported_lost ?? loss.quantity_lost ?? 0;
                      const restorableCount = loss.restorable_balance ?? loss.unrestored_quantity ?? 0;
                      return (
                        <option key={idVal || loss.reference_no} value={idVal}>
                          Ref: {loss.reference_no || loss.transaction_number || `#${idVal}`} (Lost: {lostCount}, Remaining restorable: {restorableCount})
                        </option>
                      );
                    })}
                  </select>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Max restorable against this record: <strong style={{ color: 'var(--primary)' }}>{maxRestorable}</strong>
                  </span>
                </>
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: '500' }}>
                  No past unresolved loss entries found for this product. FOUND adjustment requires an open LOSS reference.
                </div>
              )}
            </div>
          )}

          {/* Quantity & Reference No */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Quantity *
              </label>
              <input
                type="number"
                min="1"
                max={movementType === 'FOUND' ? maxRestorable : (isDeduction ? currentStock : 9999)}
                placeholder="Qty"
                className="input-premium"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Reference Code *
              </label>
              <input
                type="text"
                placeholder="e.g. ADJ-2026-001"
                className="input-premium"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Detailed Audit Remarks *
            </label>
            <textarea
              className="input-premium"
              placeholder="State the verified physical discrepancy reason..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows="3"
              style={{ height: '70px', resize: 'vertical' }}
              required
              disabled={submitting}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1 }}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{
                flex: 1.4,
                backgroundColor: isDeduction ? 'var(--danger)' : 'var(--primary)'
              }}
              disabled={submitting || (movementType === 'FOUND' && openLosses.length === 0)}
            >
              {submitting ? 'Recording...' : (
                <>
                  <CheckCircle size={16} /> Record Adjustment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdjustmentModal;
