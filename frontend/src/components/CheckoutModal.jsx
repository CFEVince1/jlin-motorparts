import React, { useState, useEffect } from 'react';
import { Banknote, Smartphone, AlertCircle, X, Printer, CheckCircle } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { calculatePaymentDetails, roundCurrency } from '../utils/calculations';

/**
 * CheckoutModal Component
 * 
 * Payment selector toggle (Cash / GCash).
 * - Cash: validate amountPaid >= totalAmount; auto-calculate change.
 * - GCash: lock tendered to exact total; lock change to ₱0.00; mandatory reference >= 6 chars.
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
  const [paymentMethod, setPaymentMethod] = useState('Cash'); // 'Cash' | 'GCash'
  const [cashTendered, setCashTendered] = useState('');
  const [gcashRef, setGcashRef] = useState('');

  // Reset fields whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setCashTendered('');
      setGcashRef('');
      setPaymentMethod('Cash');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isCash = (paymentMethod || '').toUpperCase() === 'CASH';
  const isGcash = (paymentMethod || '').toUpperCase() === 'GCASH';
  const tenderedNumeric = isCash ? (Number(cashTendered) || 0) : totalAmount;
  const paymentDetails = calculatePaymentDetails(totalAmount, tenderedNumeric, paymentMethod);

  // Validation rules
  const isCashValid = isCash && cashTendered !== '' && roundCurrency(tenderedNumeric) >= roundCurrency(totalAmount);
  const isGcashValid = isGcash && gcashRef.trim().length >= 6;
  const canSubmit = !loading && (isCashValid || isGcashValid);

  const handleClose = () => {
    setCashTendered('');
    setGcashRef('');
    if (onClose) onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    onProcessPayment({
      paymentMethod: isCash ? 'Cash' : 'GCash',
      tenderedAmount: tenderedNumeric,
      changeDue: isCash ? paymentDetails.changeDue : 0,
      gcashReference: isGcash ? gcashRef.trim() : null,
    });

    setCashTendered('');
    setGcashRef('');
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
        width: '440px',
        maxWidth: '100%',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        border: '1px solid var(--border)'
      }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, color: 'var(--text-main)' }}>
              Complete Payment
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Select payment method and verify amount
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setPaymentMethod('Cash')}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: isCash ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: isCash ? 'rgba(5, 150, 105, 0.12)' : 'var(--input-bg)',
                  color: isCash ? 'var(--primary)' : 'var(--text-main)',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                <Banknote size={18} /> Cash
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('GCash')}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: isGcash ? '2px solid #0284c7' : '1px solid var(--border)',
                  background: isGcash ? 'rgba(2, 132, 199, 0.12)' : 'var(--input-bg)',
                  color: isGcash ? '#0284c7' : 'var(--text-main)',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                <Smartphone size={18} /> GCash
              </button>
            </div>
          </div>

          {/* Conditional Method Inputs */}
          {isCash ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Amount Tendered (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={totalAmount}
                  placeholder="Enter cash received"
                  className="input-premium"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  autoFocus
                  required
                />

                {/* Quick Cash Suggestions */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setCashTendered(String(totalAmount))}
                    className="btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Exact ({formatCurrency(totalAmount)})
                  </button>
                  {[50, 100, 200, 500, 1000].filter(amt => amt >= totalAmount).map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCashTendered(String(amt))}
                      className="btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      ₱{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Change calculation */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: '6px',
                background: 'var(--surface-hover)',
                border: '1px solid var(--border)',
                fontSize: '0.9rem'
              }}>
                <span style={{ color: 'var(--text-muted)' }}>Change Due:</span>
                <span style={{
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  color: isCashValid ? 'var(--success)' : 'var(--text-muted)'
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

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1 }}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1.4 }}
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
