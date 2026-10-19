import React, { useState, useEffect } from 'react';
import { Banknote, Smartphone, AlertCircle, X, Printer, CheckCircle, Split } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { calculatePaymentDetails, roundCurrency } from '../utils/calculations';

/**
 * CheckoutModal Component
 * 
 * Payment selector toggle (Cash / GCash / Split).
 * - Cash: validate amountPaid >= totalAmount; auto-calculate change.
 * - GCash: lock tendered to exact total; lock change to ₱0.00; mandatory reference >= 6 chars.
 * - Split: customer pays part in Cash and remaining in GCash.
 * - On success: triggers window.print() or callback for thermal receipt.
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

  // Reset fields whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setCashTendered('');
      setGcashRef('');
      setSplitCash('');
      setSplitGcash('');
      setSplitCashTendered('');
      setSplitGcashRef('');
      setPaymentMethod('Cash');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isCash = (paymentMethod || '').toUpperCase() === 'CASH';
  const isGcash = (paymentMethod || '').toUpperCase() === 'GCASH';
  const isSplit = (paymentMethod || '').toUpperCase() === 'SPLIT';

  const tenderedNumeric = isCash ? (Number(cashTendered) || 0) : totalAmount;
  const paymentDetails = calculatePaymentDetails(totalAmount, tenderedNumeric, paymentMethod);

  // Split calculations
  const numSplitCash = parseFloat(splitCash) || 0;
  const numSplitGcash = parseFloat(splitGcash) || 0;
  const numSplitCashTendered = splitCashTendered !== '' ? (parseFloat(splitCashTendered) || 0) : numSplitCash;
  const splitChangeDue = Math.max(0, roundCurrency(numSplitCashTendered - numSplitCash));
  const splitRemainingToCover = roundCurrency(totalAmount - (numSplitCash + numSplitGcash));

  // Validation rules
  const isCashValid = isCash && cashTendered !== '' && roundCurrency(tenderedNumeric) >= roundCurrency(totalAmount);
  const isGcashValid = isGcash && gcashRef.trim().length >= 6;
  const isSplitValid = isSplit &&
    numSplitCash > 0 &&
    numSplitGcash > 0 &&
    roundCurrency(numSplitCash + numSplitGcash) >= roundCurrency(totalAmount) &&
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
    <div className="receipt-overlay no-print" style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.75)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      overflowY: 'auto'
    }}>
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
      <div className="glass-panel" style={{
        background: 'var(--surface)',
        width: '460px',
        maxWidth: '100%',
        maxHeight: 'min(92vh, 680px)',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        margin: 'auto'
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0, color: 'var(--text-main)' }}>
              Complete Payment
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
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
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden'
        }}>
          {/* Scrollable Form Body */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
          {/* Total Display */}
          <div style={{
            background: 'var(--surface-hover)',
            padding: '14px 16px',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            border: '1px solid var(--border)'
          }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Payable Amount:</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
              {formatCurrency(totalAmount)}
            </span>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
              Payment Method
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setPaymentMethod('Cash')}
                style={{
                  padding: '10px 8px',
                  borderRadius: '8px',
                  border: isCash ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: isCash ? 'rgba(5, 150, 105, 0.12)' : 'var(--input-bg)',
                  color: isCash ? 'var(--primary)' : 'var(--text-main)',
                  fontWeight: '600',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <Banknote size={16} /> Cash
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('GCash')}
                style={{
                  padding: '10px 8px',
                  borderRadius: '8px',
                  border: isGcash ? '2px solid #0284c7' : '1px solid var(--border)',
                  background: isGcash ? 'rgba(2, 132, 199, 0.12)' : 'var(--input-bg)',
                  color: isGcash ? '#0284c7' : 'var(--text-main)',
                  fontWeight: '600',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <Smartphone size={16} /> GCash
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('Split');
                  if (!splitCash && !splitGcash) {
                    const half = roundCurrency(totalAmount / 2);
                    setSplitCash(String(half));
                    setSplitGcash(String(roundCurrency(totalAmount - half)));
                  }
                }}
                style={{
                  padding: '10px 8px',
                  borderRadius: '8px',
                  border: isSplit ? '2px solid #a855f7' : '1px solid var(--border)',
                  background: isSplit ? 'rgba(168, 85, 247, 0.15)' : 'var(--input-bg)',
                  color: isSplit ? '#c084fc' : 'var(--text-main)',
                  fontWeight: '600',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <Split size={16} /> Split (Cash + GCash)
              </button>
            </div>
          </div>

          {/* Conditional Method Inputs */}
          {isSplit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{
                background: 'rgba(168, 85, 247, 0.08)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.78rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ color: 'var(--text-muted)' }}>Split Breakdown:</span>
                <span style={{ fontWeight: 600, color: '#c084fc' }}>
                  Cash: {formatCurrency(numSplitCash)} + GCash: {formatCurrency(numSplitGcash)}
                </span>
              </div>

              {/* Cash Portion and Cash Tendered */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    1. Cash Amount (₱) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Cash part"
                    className="input-premium cash-input-no-spin"
                    value={splitCash}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSplitCash(val);
                      const num = parseFloat(val) || 0;
                      if (num >= 0 && num <= totalAmount) {
                        setSplitGcash(String(roundCurrency(totalAmount - num)));
                      }
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Cash Received (₱)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder={splitCash ? `Min ₱${splitCash}` : 'Tendered'}
                    className="input-premium cash-input-no-spin"
                    value={splitCashTendered}
                    onChange={(e) => setSplitCashTendered(e.target.value)}
                  />
                </div>
              </div>

              {/* GCash Portion */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  2. GCash Portion (₱) *
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="GCash part"
                  className="input-premium cash-input-no-spin"
                  value={splitGcash}
                  onChange={(e) => setSplitGcash(e.target.value)}
                  required
                />
              </div>

              {/* GCash Reference Code */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  GCash Reference Code (Min. 6 chars) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1029384756"
                  className="input-premium"
                  value={splitGcashRef}
                  onChange={(e) => setSplitGcashRef(e.target.value)}
                  required
                />
                {splitGcashRef.length > 0 && splitGcashRef.trim().length < 6 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={14} /> Reference number must be at least 6 characters
                  </div>
                )}
              </div>

              {/* Split Summary / Change Due */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: '8px',
                background: splitChangeDue > 0 ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-hover)',
                border: splitChangeDue > 0 ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                fontSize: '0.85rem'
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Cash Change:</span>
                  <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: splitChangeDue > 0 ? 'var(--primary)' : 'var(--text-main)' }}>
                    {formatCurrency(splitChangeDue)}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Covered vs Total:</span>
                  <span style={{ fontWeight: 'bold', color: roundCurrency(numSplitCash + numSplitGcash) >= totalAmount ? 'var(--primary)' : 'var(--danger)' }}>
                    {formatCurrency(numSplitCash + numSplitGcash)} / {formatCurrency(totalAmount)}
                  </span>
                </div>
              </div>

              {numSplitCash > 0 && numSplitGcash > 0 && roundCurrency(numSplitCash + numSplitGcash) < totalAmount && (
                <div style={{ fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={14} /> Shortfall of {formatCurrency(totalAmount - (numSplitCash + numSplitGcash))} still needed to cover full total!
                </div>
              )}
            </div>
          ) : isCash ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Amount Tendered (₱)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="Enter cash received"
                  className="input-premium cash-input-no-spin"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  onKeyDown={handleCashKeyDown}
                  autoFocus
                  required
                />

                {/* Quick Cash Presets & Quick Add */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Set:</span>
                    <button
                      type="button"
                      onClick={() => setCashTendered(String(totalAmount))}
                      className="btn-secondary"
                      style={{ padding: '6px 12px', minHeight: '34px', fontSize: '0.8rem', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Exact ({formatCurrency(totalAmount)})
                    </button>
                    {[50, 100, 200, 500, 1000].filter(amt => amt >= totalAmount).map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCashTendered(String(amt))}
                        className="btn-secondary"
                        style={{ padding: '6px 12px', minHeight: '34px', fontSize: '0.8rem', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        ₱{amt}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Add:</span>
                    {[20, 50, 100, 500, 1000].map(addAmt => (
                      <button
                        key={addAmt}
                        type="button"
                        onClick={() => handleAddCash(addAmt)}
                        className="btn-secondary"
                        style={{ padding: '6px 12px', minHeight: '34px', fontSize: '0.8rem', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        +₱{addAmt}
                      </button>
                    ))}
                    {cashTendered !== '' && (
                      <button
                        type="button"
                        onClick={() => setCashTendered('')}
                        style={{ padding: '6px 12px', minHeight: '34px', fontSize: '0.8rem', borderRadius: '6px', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', color: 'var(--danger)' }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Change calculation */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                borderRadius: '8px',
                background: isCashValid && paymentDetails.changeDue > 0 ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-hover)',
                border: isCashValid && paymentDetails.changeDue > 0 ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                fontSize: '0.95rem'
              }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Change Due:</span>
                <span style={{
                  fontWeight: 'bold',
                  fontSize: '1.25rem',
                  color: isCashValid ? 'var(--primary)' : 'var(--text-muted)'
                }}>
                  {formatCurrency(paymentDetails.changeDue)}
                </span>
              </div>
              {cashTendered !== '' && !isCashValid && (
                <div style={{ fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={14} /> Amount tendered must be at least {formatCurrency(totalAmount)}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Amount Tendered (Locked to Total)
                </label>
                <input
                  type="text"
                  className="input-premium"
                  value={formatCurrency(totalAmount)}
                  disabled
                  style={{ opacity: 0.8 }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  GCash Reference Code (Min. 6 chars) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1029384756"
                  className="input-premium"
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
                fontSize: '0.85rem'
              }}>
                <span style={{ color: 'var(--text-muted)' }}>Change Due:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>₱0.00</span>
              </div>

              {gcashRef.length > 0 && gcashRef.trim().length < 6 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={14} /> Reference number must be at least 6 characters
                </div>
              )}
            </div>
          )}

          {/* Customer Optional Fields */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Customer Details (Optional)
            </span>
            <input
              type="text"
              placeholder="Customer Name"
              className="input-premium"
              value={customerName}
              onChange={(e) => onCustomerNameChange && onCustomerNameChange(e.target.value)}
            />
            <input
              type="text"
              placeholder="Customer Address / Contact"
              className="input-premium"
              value={customerAddress}
              onChange={(e) => onCustomerAddressChange && onCustomerAddressChange(e.target.value)}
            />
          </div>
          </div>

          {/* Sticky Actions Footer */}
          <div style={{
            display: 'flex',
            gap: '10px',
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0
          }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1, padding: '10px 14px' }}
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1.4, padding: '10px 14px' }}
              disabled={!canSubmit}
            >
              {loading ? 'Processing...' : (
                <>
                  <CheckCircle size={16} /> Confirm & Pay
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
