import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, X, CheckCircle, Package } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * AdjustmentModal Component
 * 
 * Stock adjustment modal for:
 * - DAMAGE (-) : Defective, damaged or broken parts
 * - RETURN_TO_SUPPLIER (-) : Returning defective units back to supplier
 * - Item/Serial lot picker formatted: "PART - Name (Brand) - SERIAL • Stock: n ★" for serialized lots,
 *   and "PART - Name (Brand) • Stock: n" for non-serialized products.
 * - Mandatory reference number and remarks.
 */
export const AdjustmentModal = ({
  isOpen,
  onClose,
  product, // optional initial target: { id, part_number, name/product_name, stock/current_stock, serial_id }
  onSuccess,
  asPanel = false,
}) => {
  const [movementType, setMovementType] = useState('DAMAGE'); // DAMAGE | RETURN_TO_SUPPLIER
  const [quantity, setQuantity] = useState('1');
  const [referenceNo, setReferenceNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [productsList, setProductsList] = useState([]);
  const [selectedOptionKey, setSelectedOptionKey] = useState('');
  const [activeItem, setActiveItem] = useState(null);

  // Load all products when modal opens
  useEffect(() => {
    if (!isOpen) return;
    api.get('/products').then(res => {
      setProductsList(res.data || []);
    }).catch(err => {
      console.error('Failed to load products for adjustment modal', err);
    });
  }, [isOpen]);

  // Build options matching specification
  const adjustmentOptions = useMemo(() => {
    const opts = [];
    const sortedProducts = [...productsList].sort((a, b) => {
      const pA = (a.part_number || a.name || '').toLowerCase();
      const pB = (b.part_number || b.name || '').toLowerCase();
      return pA.localeCompare(pB, undefined, { numeric: true, sensitivity: 'base' });
    });

    for (const p of sortedProducts) {
      const brandStr = p.brand ? p.brand : 'No Brand';
      const prodName = p.product_name || p.name;
      const partNum = p.part_number || 'NO-PART';

      if (p.is_serialized) {
        const rawSerials = p.serials || [];
        const sortedSerials = [...rawSerials].sort((s1, s2) =>
          String(s1.serial_number || '').localeCompare(String(s2.serial_number || ''), undefined, { numeric: true, sensitivity: 'base' })
        );

        for (const s of sortedSerials) {
          const sQty = Number(s.quantity || 0);
          opts.push({
            value: `serial:${p.id}:${s.id}`,
            label: `${partNum} - ${prodName} (${brandStr}) - ${s.serial_number} • Stock: ${sQty} ★`,
            productId: p.id,
            serialId: Number(s.id),
            serialNumber: s.serial_number,
            lotStock: sQty,
            isSerialized: true,
            product: p
          });
        }
      } else {
        const pStock = Number(p.stock ?? p.current_stock ?? 0);
        opts.push({
          value: `product:${p.id}`,
          label: `${partNum} - ${prodName} (${brandStr}) • Stock: ${pStock}`,
          productId: p.id,
          serialId: null,
          serialNumber: '',
          lotStock: pStock,
          isSerialized: false,
          product: p
        });
      }
    }
    return opts;
  }, [productsList]);

  // Initialize selected item when modal opens or when options load
  useEffect(() => {
    if (!isOpen) return;

    if (product) {
      const pId = product.id || product.product_id;
      if (product.is_serialized) {
        const targetSerialId = product.serial_id || (product.serials && product.serials[0]?.id);
        const match = adjustmentOptions.find(o => o.productId === pId && (!targetSerialId || o.serialId === Number(targetSerialId)));
        if (match) {
          setSelectedOptionKey(match.value);
          setActiveItem(match);
          return;
        }
      } else {
        const match = adjustmentOptions.find(o => o.productId === pId && !o.isSerialized);
        if (match) {
          setSelectedOptionKey(match.value);
          setActiveItem(match);
          return;
        }
      }
    }

    if (!selectedOptionKey && adjustmentOptions.length > 0) {
      setSelectedOptionKey(adjustmentOptions[0].value);
      setActiveItem(adjustmentOptions[0]);
    }
  }, [isOpen, product, adjustmentOptions, selectedOptionKey]);

  const handleOptionChange = (val) => {
    setSelectedOptionKey(val);
    const match = adjustmentOptions.find(o => o.value === val);
    setActiveItem(match || null);
  };

  const itemId = activeItem?.productId || product?.id || product?.product_id;
  const currentStock = activeItem ? activeItem.lotStock : (product?.current_stock ?? product?.stock ?? 0);

  if (!isOpen) return null;

  const qtyNumber = parseInt(quantity, 10) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!activeItem || !itemId) {
      toast.error('Please select an item / serial lot to adjust');
      return;
    }

    if (!quantity || qtyNumber <= 0) {
      toast.error('Please enter a valid positive quantity');
      return;
    }

    if (qtyNumber > currentStock) {
      toast.error(`Cannot deduct more than available stock in target lot (${currentStock})`);
      return;
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
      await api.post('/inventory/adjustments', {
        item_id: itemId,
        product_id: itemId,
        movement_type: movementType,
        transaction_type: movementType,
        quantity: qtyNumber,
        reference_no: referenceNo.trim(),
        remarks: remarks.trim(),
        serial_id: activeItem.isSerialized && activeItem.serialId ? Number(activeItem.serialId) : undefined,
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

  if (!isOpen) return null;

  const content = (
    <div
      id={asPanel ? 'inline-stock-adjustment-container' : undefined}
      className="stock-adjustment-panel"
      style={asPanel ? {
        width: '100%',
        backgroundColor: 'var(--surface, #18181b)',
        border: '1.5px solid #f59e0b',
        borderRadius: '16px',
        boxShadow: '0 8px 30px rgba(245, 158, 11, 0.12)',
        overflow: 'hidden',
        marginBottom: '24px',
        padding: '24px'
      } : {
        background: 'var(--surface)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        boxShadow: 'var(--glass-shadow)',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '24px'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(245, 158, 11, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f59e0b'
          }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>
              {asPanel ? 'Stock Count Adjustment Panel' : 'Record Stock Adjustment'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Adjust stock for in-store shelf defects, loss/shrinkage, or surplus found
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            padding: asPanel ? '6px 12px' : '6px',
            borderRadius: '6px'
          }}
          title={asPanel ? 'Close Panel' : 'Cancel'}
        >
          <X size={16} />
          {asPanel && <span>Close Panel</span>}
        </button>
      </div>

      {/* Item & Lot Picker */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
            Choose Product to Adjust *
          </label>
          <select
            className="input-premium"
            value={selectedOptionKey}
            onChange={(e) => handleOptionChange(e.target.value)}
            disabled={submitting}
            style={{ width: '100%' }}
          >
            {adjustmentOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Active Item Context Box */}
        {activeItem && (
          <div style={{
            background: 'var(--surface-hover)',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            marginBottom: '16px',
            fontSize: '0.82rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontWeight: 600 }}>{activeItem.product?.product_name || activeItem.product?.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                SKU/Part: <span style={{ fontFamily: 'monospace' }}>{activeItem.product?.part_number || 'N/A'}</span>
                {activeItem.isSerialized && (
                  <span style={{ marginLeft: '8px', color: 'var(--primary)' }}>
                    • Lot SN: <strong>{activeItem.serialNumber}</strong>
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Current Stock</span>
              <span style={{
                fontSize: '1rem',
                fontWeight: 'bold',
                color: currentStock > 0 ? 'var(--text-main)' : 'var(--danger)'
              }}>
                {currentStock} units
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Movement Type */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
              Reason / Type *
            </label>
            <select
              className="input-premium"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              disabled={submitting}
            >
              <option value="DAMAGE">💥 In-Store Defect / Shelf Damage (Deduct from sellable stock, log as shop shrinkage loss)</option>
              <option value="LOSS">⚠️ Lost / Stolen item (Shrinkage deduction from stock)</option>
              <option value="FOUND">📦 Found extra stock (Surplus count added to sellable stock)</option>
            </select>
          </div>

          {/* Quantity & Reference No */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Quantity *
              </label>
              <input
                type="number"
                min="1"
                max={movementType === 'FOUND' ? 9999 : (currentStock > 0 ? currentStock : 9999)}
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
                Reference / Receipt Code *
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
              Reason / Notes *
            </label>
            <textarea
              className="input-premium"
              placeholder="Explain what happened (e.g. Broken bracket upon inspection, dropped on shelf)..."
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
                backgroundColor: 'var(--danger)'
              }}
              disabled={submitting}
            >
              {submitting ? 'Recording...' : (
                <>
                  <CheckCircle size={16} /> Save Stock Adjustment
                </>
              )}
            </button>
          </div>
        </form>
    </div>
  );

  if (asPanel) {
    return content;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '16px'
    }}>
      {content}
    </div>
  );
};

export default AdjustmentModal;
