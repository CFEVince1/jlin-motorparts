import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, X, CheckCircle, Package, Tag, PlusCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * AdjustmentModal Component
 * 
 * Stock adjustment panel/modal supporting:
 * - Direct product selection
 * - Dedicated serial number selector for serialized products (with status, stock, and chips)
 * - Registration of new serial numbers for FOUND extra stock
 * - DAMAGE (-) : Defective, damaged or broken parts write-off
 * - LOSS (-) : Lost / stolen shrinkage write-off
 * - FOUND (+) : Found extra stock / surplus restoration
 * - RETURN_TO_SUPPLIER (-) : Returning defective units back to supplier
 */
export const AdjustmentModal = ({
  isOpen,
  onClose,
  product, // optional initial target: { id, part_number, name/product_name, stock/current_stock, serial_id, serial_number, is_serialized }
  onSuccess,
  asPanel = false,
}) => {
  const [movementType, setMovementType] = useState('DAMAGE'); // DAMAGE | LOSS | FOUND | RETURN_TO_SUPPLIER
  const [quantity, setQuantity] = useState('1');
  const [referenceNo, setReferenceNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [productsList, setProductsList] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedSerialId, setSelectedSerialId] = useState('');
  const [customSerialNumber, setCustomSerialNumber] = useState('');

  // Load all products when modal opens
  useEffect(() => {
    if (!isOpen) return;
    api.get('/products').then(res => {
      setProductsList(res.data || []);
    }).catch(err => {
      console.error('Failed to load products for adjustment modal', err);
    });
  }, [isOpen]);

  // Sorted list of products for the dropdown
  const sortedProducts = useMemo(() => {
    return [...productsList].sort((a, b) => {
      const pA = (a.part_number || a.name || '').toLowerCase();
      const pB = (b.part_number || b.name || '').toLowerCase();
      return pA.localeCompare(pB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [productsList]);

  // Initialize selected product and serial when modal opens or product prop changes
  useEffect(() => {
    if (!isOpen) return;

    if (product) {
      const pId = String(product.id || product.product_id || '');
      setSelectedProductId(pId);

      const targetSerialId = product.serial_id ? String(product.serial_id) : '';
      if (targetSerialId) {
        setSelectedSerialId(targetSerialId);
      } else if (product.serial_number) {
        setCustomSerialNumber(product.serial_number);
      }
    } else if (!selectedProductId && sortedProducts.length > 0) {
      setSelectedProductId(String(sortedProducts[0].id));
    }
  }, [isOpen, product, sortedProducts]);

  // Active product object
  const activeProduct = useMemo(() => {
    return productsList.find(p => String(p.id) === String(selectedProductId)) || null;
  }, [productsList, selectedProductId]);

  // Active serials for the selected product
  const activeProductSerials = useMemo(() => {
    if (!activeProduct?.is_serialized) return [];
    const list = [...(activeProduct.serials || [])];
    return list.sort((a, b) =>
      String(a.serial_number || '').localeCompare(String(b.serial_number || ''), undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [activeProduct]);

  // When active product changes, sync selected serial
  useEffect(() => {
    if (!activeProduct) return;

    if (!activeProduct.is_serialized) {
      setSelectedSerialId('');
      setCustomSerialNumber('');
      return;
    }

    // If an initial product serial was provided, keep it if it belongs to this product
    if (product && String(product.id || product.product_id) === String(activeProduct.id)) {
      if (product.serial_id) {
        setSelectedSerialId(String(product.serial_id));
        return;
      }
      if (product.serial_number) {
        const found = activeProductSerials.find(s => s.serial_number === product.serial_number);
        if (found) {
          setSelectedSerialId(String(found.id));
          return;
        }
      }
    }

    // Otherwise, default to the first available serial with stock > 0, or first serial, or new serial
    if (activeProductSerials.length > 0) {
      const availableSerial = activeProductSerials.find(s => Number(s.quantity || 0) > 0);
      if (availableSerial) {
        setSelectedSerialId(String(availableSerial.id));
      } else {
        setSelectedSerialId(String(activeProductSerials[0].id));
      }
    } else {
      setSelectedSerialId('__NEW_SERIAL__');
    }
  }, [activeProduct, activeProductSerials, product]);

  // Active serial object
  const activeSerial = useMemo(() => {
    if (!activeProduct?.is_serialized || selectedSerialId === '__NEW_SERIAL__') return null;
    return activeProductSerials.find(s => String(s.id) === String(selectedSerialId)) || null;
  }, [activeProduct, activeProductSerials, selectedSerialId]);

  const isCustomSerial = selectedSerialId === '__NEW_SERIAL__' || (activeProduct?.is_serialized && activeProductSerials.length === 0);

  // Determine current available stock for the selected unit/lot
  const currentStock = useMemo(() => {
    if (!activeProduct) return 0;
    if (activeProduct.is_serialized) {
      if (isCustomSerial) return 0;
      if (activeSerial) return Number(activeSerial.quantity || 0);
      return Number(activeProduct.stock ?? 0);
    }
    return Number(activeProduct.stock ?? activeProduct.current_stock ?? 0);
  }, [activeProduct, activeSerial, isCustomSerial]);

  if (!isOpen) return null;

  const qtyNumber = parseInt(quantity, 10) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!activeProduct) {
      toast.error('Please choose a valid product');
      return;
    }

    if (activeProduct.is_serialized) {
      if (isCustomSerial && !customSerialNumber.trim()) {
        toast.error('Please enter a valid serial number for this serialized product');
        return;
      }
      if (!isCustomSerial && !selectedSerialId) {
        toast.error('Please select which serial number to adjust');
        return;
      }
    }

    if (!quantity || qtyNumber <= 0) {
      toast.error('Please enter a valid positive quantity');
      return;
    }

    if (movementType !== 'FOUND' && qtyNumber > currentStock) {
      const lotMsg = activeProduct.is_serialized && activeSerial 
        ? `in serial lot "${activeSerial.serial_number}"` 
        : 'for this product';
      toast.error(`Cannot deduct ${qtyNumber} units. Only ${currentStock} units available ${lotMsg}.`);
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
      const payload = {
        item_id: activeProduct.id,
        product_id: activeProduct.id,
        movement_type: movementType,
        transaction_type: movementType,
        quantity: qtyNumber,
        reference_no: referenceNo.trim(),
        remarks: remarks.trim(),
      };

      if (activeProduct.is_serialized) {
        if (isCustomSerial) {
          payload.serial_number = customSerialNumber.trim();
          payload.new_serial_number = customSerialNumber.trim();
        } else if (activeSerial) {
          payload.serial_id = Number(activeSerial.id);
          payload.serial_number = activeSerial.serial_number;
        }
      }

      await api.post('/inventory/adjustments', payload);

      toast.success(`Inventory adjustment (${movementType}) recorded successfully`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to submit adjustment');
    } finally {
      setSubmitting(false);
    }
  };

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
        maxWidth: '620px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '24px'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f59e0b'
          }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 'bold' }}>
              {asPanel ? 'Stock Count Adjustment Panel' : 'Record Stock Adjustment'}
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Step 1: Choose Product */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
            1. Choose Product to Adjust *
          </label>
          <select
            className="input-premium"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            disabled={submitting}
            style={{ width: '100%', height: '40px', fontSize: '0.86rem' }}
          >
            {sortedProducts.map(p => {
              const brandStr = p.brand ? p.brand : 'No Brand';
              const prodName = p.product_name || p.name;
              const partNum = p.part_number || 'NO-PART';
              const pStock = Number(p.stock ?? p.current_stock ?? 0);
              return (
                <option key={p.id} value={String(p.id)}>
                  {partNum} - {prodName} ({brandStr}) • Stock: {pStock} {p.is_serialized ? '★ [Serialized]' : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Step 2: Dedicated Serial Selector (when product is serialized) */}
        {activeProduct?.is_serialized && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.05)',
            border: '1.5px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#60a5fa', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Tag size={14} /> 2. Select Serial Number / Unit to Adjust *
              </label>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {activeProductSerials.length} registered {activeProductSerials.length === 1 ? 'serial' : 'serials'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <select
                className="input-premium"
                value={selectedSerialId}
                onChange={(e) => setSelectedSerialId(e.target.value)}
                disabled={submitting}
                style={{ width: '100%', height: '38px', fontSize: '0.86rem', borderColor: '#3b82f6' }}
              >
                {activeProductSerials.map(s => {
                  const sQty = Number(s.quantity || 0);
                  const isAvailable = sQty > 0;
                  return (
                    <option key={s.id} value={String(s.id)}>
                      Serial #{s.serial_number} — Stock: {sQty} units [{s.status?.toUpperCase() || (isAvailable ? 'AVAILABLE' : 'SOLD')}]
                    </option>
                  );
                })}
                <option value="__NEW_SERIAL__">➕ Register / Add New Serial Number...</option>
              </select>

              {/* Text input if user chooses to register a new serial or no serials exist */}
              {isCustomSerial && (
                <div style={{ marginTop: '4px' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Enter New / Found Serial Number *
                  </label>
                  <input
                    type="text"
                    className="input-premium"
                    placeholder="e.g. ARA-MN5-4421"
                    value={customSerialNumber}
                    onChange={(e) => setCustomSerialNumber(e.target.value)}
                    required
                    disabled={submitting}
                    style={{ width: '100%', height: '36px', fontSize: '0.86rem' }}
                  />
                </div>
              )}

              {/* Quick Serial Selector Chips */}
              {activeProductSerials.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                  <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>Quick Select Serial:</span>
                  {activeProductSerials.map(s => {
                    const isSelected = String(s.id) === String(selectedSerialId);
                    const sQty = Number(s.quantity || 0);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSerialId(String(s.id));
                          setCustomSerialNumber('');
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          border: isSelected ? '1.5px solid #3b82f6' : '1px solid var(--border)',
                          background: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'var(--surface)',
                          color: isSelected ? '#60a5fa' : 'var(--text-main)',
                          fontWeight: isSelected ? 700 : 500
                        }}
                        title={`Click to select serial ${s.serial_number} (${sQty} in stock)`}
                      >
                        {s.serial_number} ({sQty})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Selection Context Box */}
        {activeProduct && (
          <div style={{
            background: 'var(--surface-hover)',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            fontSize: '0.84rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.90rem', color: 'var(--text-main)' }}>
                {activeProduct.product_name || activeProduct.name}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>SKU/Part: <strong style={{ fontFamily: 'monospace', color: 'var(--text-main)' }}>{activeProduct.part_number || 'N/A'}</strong></span>
                {activeProduct.is_serialized && (
                  <>
                    <span>•</span>
                    <span style={{ color: '#60a5fa', fontWeight: 600 }}>
                      Selected SN: <strong style={{ fontFamily: 'monospace' }}>
                        {isCustomSerial ? (customSerialNumber || 'New Serial') : (activeSerial?.serial_number || 'N/A')}
                      </strong>
                    </span>
                    {activeSerial && (
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: Number(activeSerial.quantity) > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: Number(activeSerial.quantity) > 0 ? 'var(--success)' : 'var(--danger)',
                        border: `1px solid ${Number(activeSerial.quantity) > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                      }}>
                        {activeSerial.status || (Number(activeSerial.quantity) > 0 ? 'available' : 'sold')}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                {activeProduct.is_serialized ? 'Selected Serial Stock' : 'Current Stock'}
              </span>
              <span style={{
                fontSize: '1.15rem',
                fontWeight: 'bold',
                color: currentStock > 0 ? 'var(--text-main)' : 'var(--danger)'
              }}>
                {currentStock} units
              </span>
            </div>
          </div>
        )}

        {/* Zero-Stock Notice Banner */}
        {activeProduct?.is_serialized && currentStock === 0 && movementType !== 'FOUND' && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '0.78rem',
            color: '#f59e0b',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Serial lot has 0 sellable units:</strong> Cannot deduct damage or loss from an empty lot.
              If you found extra stock of this unit, select <strong>"📦 Found extra stock"</strong> below to restore it to sellable inventory.
            </div>
          </div>
        )}

        {/* Step 3: Movement Type */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
            3. Reason / Type *
          </label>
          <select
            className="input-premium"
            value={movementType}
            onChange={(e) => setMovementType(e.target.value)}
            disabled={submitting}
            style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
          >
            <option value="DAMAGE">💥 In-Store Defect / Shelf Damage (Deduct from sellable stock, log as shop shrinkage loss)</option>
            <option value="LOSS">⚠️ Lost / Stolen item (Shrinkage deduction from stock)</option>
            <option value="FOUND">📦 Found extra stock (Surplus count added to sellable stock)</option>
            <option value="RETURN_TO_SUPPLIER">🏭 Return Defective Unit to Supplier (-Deduct from stock)</option>
          </select>
        </div>

        {/* Step 4: Quantity & Reference No */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
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
              style={{ width: '100%', height: '38px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
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
              style={{ width: '100%', height: '38px' }}
            />
          </div>
        </div>

        {/* Step 5: Remarks */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Reason / Notes *
          </label>
          <textarea
            className="input-premium"
            placeholder="Explain what happened (e.g. Broken bracket upon inspection, dropped on shelf, found missing unit during audit)..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows="3"
            style={{ width: '100%', height: '70px', resize: 'vertical', fontSize: '0.84rem' }}
            required
            disabled={submitting}
          />
        </div>

        {/* Step 6: Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ flex: 1, height: '40px' }}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            style={{
              flex: 1.5,
              height: '40px',
              backgroundColor: movementType === 'FOUND' ? 'var(--primary)' : 'var(--danger)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
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
