import React, { useState, useEffect } from 'react';
import { Banknote, Smartphone, AlertCircle, X, CheckCircle, Split, ArrowLeft } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { calculatePaymentDetails, roundCurrency } from '../utils/calculations';

/**
 * Sanitize numeric inputs: disallows negative signs, allows digits and single decimal.
 */
const sanitizeNumeric = (val) => {
  if (val === null || val === undefined) return '';
  let str = String(val).replace(/[^0-9.]/g, '');
  const parts = str.split('.');
  if (parts.length > 2) {
    str = parts[0] + '.' + parts.slice(1).join('');
  }
  return str;
};

/**
 * CheckoutModal Component (Ultra-Compact POS Edition)
 * 
 * - Payment selector toggle: Cash / GCash / Split (Cash + GCash).
 * - Cash: validate amountPaid >= totalAmount; auto-calculate change; quick cash presets.
 * - GCash: lock tendered to exact total; lock change to ₱0.00; mandatory reference >= 6 chars.
 * - Split: 2-way auto-balancing between Cash and GCash; cash tendered change calculation; strictly non-negative.
 * - Preserves cart on exit via Escape, backdrop click, or 'Back to Cart' button.
 * - Ultra-compact layout: fits on all screens without scrolling.
 */
export const CheckoutModal = ({
  isOpen,
  onClose,
  totalAmount,
  cart = [],
  customerName = '',
  customerAddress = '',
  onCustomerNameChange,
  onCustomerAddressChange,
  onProcessPayment,
  loading = false,
}) => {
  const [paymentMethod, setPaymentMethod] = useState('Cash'); // 'Cash' | 'GCash' | 'Split'
  const [cashTendered, setCashTendered] = useState('');
  const [gcashRef, setGcashRef] = useState('');

  // Split payment state
  const [splitCash, setSplitCash] = useState('');
  const [splitGcash, setSplitGcash] = useState('');
  const [splitCashTendered, setSplitCashTendered] = useState('');
  const [splitGcashRef, setSplitGcashRef] = useState('');

  // Optional customer details collapsible state
  const [showCustomer, setShowCustomer] = useState(Boolean(customerName || customerAddress));

  // Reset fields whenever modal opens & bind Escape key to close
  useEffect(() => {
    if (isOpen) {
      setCashTendered('');
      setGcashRef('');
      setSplitCash('');
      setSplitGcash('');
      setSplitCashTendered('');
      setSplitGcashRef('');
      setPaymentMethod('Cash');
      setShowCustomer(Boolean(customerName || customerAddress));

      const handleKeyDown = (e) => {
        if (e.key === 'Escape' && !loading) {
          handleClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, loading]);

  if (!isOpen) return null;

  const isCash = (paymentMethod || '').toUpperCase() === 'CASH';
  const isGcash = (paymentMethod || '').toUpperCase() === 'GCASH';
  const isSplit = (paymentMethod || '').toUpperCase() === 'SPLIT';

  const tenderedNumeric = isCash ? (Number(cashTendered) || 0) : totalAmount;
  const paymentDetails = calculatePaymentDetails(totalAmount, tenderedNumeric, paymentMethod);

  // Split calculations
  const numSplitCash = Math.max(0, parseFloat(splitCash) || 0);
  const numSplitGcash = Math.max(0, parseFloat(splitGcash) || 0);
  const numSplitCashTendered = splitCashTendered !== '' ? Math.max(0, parseFloat(splitCashTendered) || 0) : numSplitCash;
  const splitChangeDue = Math.max(0, roundCurrency(numSplitCashTendered - numSplitCash));
  const splitCovered = roundCurrency(numSplitCash + numSplitGcash);

  // Split auto-balancing handlers
  const handleSelectSplit = () => {
    setPaymentMethod('Split');
    if (!splitCash && !splitGcash) {
      const half = roundCurrency(totalAmount / 2);
      setSplitCash(String(half));
      setSplitGcash(String(roundCurrency(totalAmount - half)));
    }
  };

  const handleSplitCashChange = (raw) => {
    const clean = sanitizeNumeric(raw);
    setSplitCash(clean);
    if (clean === '') {
      setSplitGcash(String(roundCurrency(totalAmount)));
      return;
    }
    const num = parseFloat(clean) || 0;
    const remaining = Math.max(0, roundCurrency(totalAmount - num));
    setSplitGcash(String(remaining));
  };

  const handleSplitGcashChange = (raw) => {
    const clean = sanitizeNumeric(raw);
    setSplitGcash(clean);
    if (clean === '') {
      setSplitCash(String(roundCurrency(totalAmount)));
      return;
    }
    const num = parseFloat(clean) || 0;
    const remaining = Math.max(0, roundCurrency(totalAmount - num));
    setSplitCash(String(remaining));
  };

  // Validation rules
  const isCashValid = isCash && cashTendered !== '' && roundCurrency(tenderedNumeric) >= roundCurrency(totalAmount);
  const isGcashValid = isGcash && gcashRef.trim().length >= 6;
  const isSplitValid = isSplit &&
    numSplitCash > 0 &&
    numSplitGcash > 0 &&
    splitCovered >= roundCurrency(totalAmount) &&
    numSplitCashTendered >= numSplitCash &&
    splitGcashRef.trim().length >= 6;

  const canSubmit = !loading && (isCashValid || isGcashValid || isSplitValid);

  const handleAddCash = (increment) => {
    const current = parseFloat(cashTendered) || 0;
    const nextVal = current === 0 ? Math.max(totalAmount, increment) : current + increment;
    setCashTendered(String(Math.round(nextVal)));
  };

  const handleCashKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = parseFloat(cashTendered) || 0;
      setCashTendered(String(Math.round(current + 10)));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseFloat(cashTendered) || 0;
      setCashTendered(String(Math.max(0, Math.round(current - 10))));
    }
  };

  const handleClose = () => {
    setCashTendered('');
    setGcashRef('');
    setSplitCash('');
    setSplitGcash('');
    setSplitCashTendered('');
    setSplitGcashRef('');
    if (onClose) onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (isSplit) {
      onProcessPayment({
        paymentMethod: 'Split',
        cashAmount: numSplitCash,
        gcashAmount: numSplitGcash,
        tenderedAmount: roundCurrency(numSplitCashTendered + numSplitGcash),
        changeDue: splitChangeDue,
        gcashReference: splitGcashRef.trim()
      });
      return;
    }

    onProcessPayment({
      paymentMethod: isCash ? 'Cash' : 'GCash',
      tenderedAmount: tenderedNumeric,
      changeDue: isCash ? paymentDetails.changeDue : 0,
      gcashReference: isGcash ? gcashRef.trim() : null,
    });
  };

  return (
    <div
      className="receipt-overlay no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          handleClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        overflowY: 'auto'
      }}
    >
      <style>{`
        .cash-input-no-spin::-webkit-inner-spin-button,
        .cash-input-no-spin::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .cash-input-no-spin {
          -moz-appearance: textfield;
        }
      `}</style>
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          width: '450px',
          maxWidth: '96vw',
          maxHeight: 'min(92vh, 560px)',
          borderRadius: '12px',
          boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          margin: 'auto'
        }}
      >
        {/* Compact Modal Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-hover)',
          flexShrink: 0
        }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: 0, color: 'var(--text-main)' }}>
              Complete Payment
            </h2>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '1px 0 0 0' }}>
              Select payment method and verify amount
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden'
        }}>
          {/* Compact Scrollable Form Body */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            {/* Compact Payable Amount Banner */}
            <div style={{
              background: 'rgba(5, 150, 105, 0.08)',
              padding: '8px 14px',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              border: '1px solid rgba(5, 150, 105, 0.25)'
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Payable:</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                {formatCurrency(totalAmount)}
              </span>
            </div>

            {/* Compact Payment Method Selector */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                Payment Method
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.35fr', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Cash')}
                  style={{
                    padding: '7px 6px',
                    borderRadius: '6px',
                    border: isCash ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: isCash ? 'rgba(5, 150, 105, 0.12)' : 'var(--input-bg)',
                    color: isCash ? 'var(--primary)' : 'var(--text-main)',
                    fontWeight: '600',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    cursor: 'pointer'
                  }}
                >
                  <Banknote size={15} /> Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('GCash')}
                  style={{
                    padding: '7px 6px',
                    borderRadius: '6px',
                    border: isGcash ? '2px solid #0284c7' : '1px solid var(--border)',
                    background: isGcash ? 'rgba(2, 132, 199, 0.12)' : 'var(--input-bg)',
                    color: isGcash ? '#0284c7' : 'var(--text-main)',
                    fontWeight: '600',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    cursor: 'pointer'
                  }}
                >
                  <Smartphone size={15} /> GCash
                </button>
                <button
                  type="button"
                  onClick={handleSelectSplit}
                  style={{
                    padding: '7px 6px',
                    borderRadius: '6px',
                    border: isSplit ? '2px solid #a855f7' : '1px solid var(--border)',
                    background: isSplit ? 'rgba(168, 85, 247, 0.15)' : 'var(--input-bg)',
                    color: isSplit ? '#c084fc' : 'var(--text-main)',
                    fontWeight: '600',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    cursor: 'pointer'
                  }}
                >
                  <Split size={15} /> Split (Cash+GCash)
                </button>
              </div>
            </div>

            {/* Conditional Method Inputs */}
            {isSplit ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Row 1: Split amounts side-by-side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                      1. Cash Amount (₱) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Cash part"
                      className="input-premium cash-input-no-spin"
                      style={{ height: '36px', fontSize: '0.85rem' }}
                      value={splitCash}
                      onChange={(e) => handleSplitCashChange(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                      2. GCash Portion (₱) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="GCash part"
                      className="input-premium cash-input-no-spin"
                      style={{ height: '36px', fontSize: '0.85rem' }}
                      value={splitGcash}
                      onChange={(e) => handleSplitGcashChange(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Row 2: Cash Tendered & GCash Ref side-by-side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                      Cash Received (₱)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder={splitCash ? `Min ₱${splitCash}` : 'Exact'}
                      className="input-premium cash-input-no-spin"
                      style={{ height: '36px', fontSize: '0.85rem' }}
                      value={splitCashTendered}
                      onChange={(e) => setSplitCashTendered(sanitizeNumeric(e.target.value))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                      GCash Ref Code *
                    </label>
                    <input
                      type="text"
                      placeholder="Min 6 chars"
                      className="input-premium"
                      style={{ height: '36px', fontSize: '0.85rem' }}
                      value={splitGcashRef}
                      onChange={(e) => setSplitGcashRef(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Row 3: Status Summary bar */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: splitChangeDue > 0 ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface-hover)',
                  border: splitChangeDue > 0 ? '1px solid var(--primary)' : '1px solid var(--border)',
                  fontSize: '0.8rem'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Cash Change: </span>
                    <span style={{ fontWeight: 'bold', color: splitChangeDue > 0 ? 'var(--primary)' : 'var(--text-main)' }}>
                      {formatCurrency(splitChangeDue)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Covered: </span>
                    <span style={{
                      fontWeight: 'bold',
                      color: splitCovered >= totalAmount ? 'var(--primary)' : 'var(--danger)'
                    }}>
                      {formatCurrency(splitCovered)} / {formatCurrency(totalAmount)}
                      {splitCovered >= totalAmount ? '' : ''}
                    </span>
                  </div>
                </div>

                {/* Validation Warnings */}
                {splitGcashRef.length > 0 && splitGcashRef.trim().length < 6 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} /> Reference number must be at least 6 characters
                  </div>
                )}
                {numSplitCash > 0 && numSplitGcash > 0 && splitCovered < totalAmount && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} /> Shortfall of {formatCurrency(totalAmount - splitCovered)} still needed!
                  </div>
                )}
                {splitCashTendered !== '' && numSplitCashTendered < numSplitCash && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} /> Cash received ({formatCurrency(numSplitCashTendered)}) is less than cash amount ({formatCurrency(numSplitCash)})!
                  </div>
                )}
              </div>
            ) : isCash ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                    Amount Tendered (₱) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Enter cash received"
                    className="input-premium cash-input-no-spin"
                    style={{ height: '38px', fontSize: '1rem', fontWeight: '600' }}
                    value={cashTendered}
                    onChange={(e) => setCashTendered(sanitizeNumeric(e.target.value))}
                    onKeyDown={handleCashKeyDown}
                    autoFocus
                    required
                  />
                </div>

                {/* Compact Quick Cash Presets */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setCashTendered(String(totalAmount))}
                    className="btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Exact ({formatCurrency(totalAmount)})
                  </button>
                  {[50, 100, 200, 500, 1000].filter(amt => amt >= totalAmount).map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCashTendered(String(amt))}
                      className="btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      ₱{amt}
                    </button>
                  ))}
                  {[20, 50, 100, 500].map(addAmt => (
                    <button
                      key={addAmt}
                      type="button"
                      onClick={() => handleAddCash(addAmt)}
                      className="btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      +₱{addAmt}
                    </button>
                  ))}
                  {cashTendered !== '' && (
                    <button
                      type="button"
                      onClick={() => setCashTendered('')}
                      style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', color: 'var(--danger)' }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Change calculation */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: isCashValid && paymentDetails.changeDue > 0 ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface-hover)',
                  border: isCashValid && paymentDetails.changeDue > 0 ? '1px solid var(--primary)' : '1px solid var(--border)',
                  fontSize: '0.85rem'
                }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Change Due:</span>
                  <span style={{
                    fontWeight: 'bold',
                    fontSize: '1.15rem',
                    color: isCashValid ? 'var(--primary)' : 'var(--text-muted)'
                  }}>
                    {formatCurrency(paymentDetails.changeDue)}
                  </span>
                </div>
                {cashTendered !== '' && !isCashValid && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} /> Amount tendered must be at least {formatCurrency(totalAmount)}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                    Amount Tendered (Locked to Total)
                  </label>
                  <input
                    type="text"
                    className="input-premium"
                    style={{ height: '36px', fontSize: '0.85rem' }}
                    value={formatCurrency(totalAmount)}
                    disabled
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                    GCash Reference Code (Min. 6 chars) *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1029384756"
                    className="input-premium"
                    style={{ height: '36px', fontSize: '0.85rem' }}
                    value={gcashRef}
                    onChange={(e) => setGcashRef(e.target.value)}
                    autoFocus
                    required
                  />
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  fontSize: '0.8rem'
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>Change Due:</span>
                  <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>₱0.00</span>
                </div>

                {gcashRef.length > 0 && gcashRef.trim().length < 6 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} /> Reference number must be at least 6 characters
                  </div>
                )}
              </div>
            )}

            {/* Customer Optional Fields - Collapsible */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
              {!showCustomer && !customerName && !customerAddress ? (
                <button
                  type="button"
                  onClick={() => setShowCustomer(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 0'
                  }}
                >
                  + Add Customer Details (Optional)
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Customer Details (Optional)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCustomer(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer' }}
                    >
                      Hide
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="Customer Name"
                      className="input-premium"
                      style={{ height: '34px', fontSize: '0.8rem' }}
                      value={customerName}
                      onChange={(e) => onCustomerNameChange && onCustomerNameChange(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Address / Contact"
                      className="input-premium"
                      style={{ height: '34px', fontSize: '0.8rem' }}
                      value={customerAddress}
                      onChange={(e) => onCustomerAddressChange && onCustomerAddressChange(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Compact Sticky Actions Footer */}
          <div style={{
            display: 'flex',
            gap: '8px',
            padding: '10px 18px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0
          }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1, padding: '8px 12px', fontSize: '0.82rem', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
              onClick={handleClose}
              disabled={loading}
              title="Return to cart to add or edit items"
            >
              <ArrowLeft size={15} /> Back to Cart
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1.4, padding: '8px 12px', fontSize: '0.82rem', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
              disabled={!canSubmit}
            >
              {loading ? 'Processing...' : (
                <>
                  <CheckCircle size={15} /> Confirm & Pay
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CheckoutModal;
