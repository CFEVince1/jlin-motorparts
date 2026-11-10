import React from 'react';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

export const ThermalReceipt = ({
  receiptId,
  orderNumber,
  date,
  cashier,
  customer,
  customerName,
  customerAddress,
  items = [],
  total = 0,
  totalAmount,
  subtotal = 0,
  discount = 0,
  discountAmount = 0,
  paymentMethod = 'Cash',
  amountTendered = 0,
  change = 0,
  changeDue,
  paymentReference = '',
  gcashReference = '',
  cashAmount = null,
  gcashAmount = null,
  vatableAmount = null,
  vatAmount = null,
  taxAmount = null,
  vatExemptAmount = 0,
  zeroRatedAmount = 0,
}) => {
  const displayReceiptNo = orderNumber || receiptId || 'PENDING';
  const displayCustomer = customer || customerName || '';
  const displayTotal = totalAmount !== undefined ? totalAmount : total;
  const displayChange = changeDue !== undefined ? changeDue : change;
  const displayRef = gcashReference || paymentReference || '';
  const isGcash = (paymentMethod || '').toUpperCase() === 'GCASH';
  const effectiveDiscount = Number(discountAmount !== undefined && discountAmount !== null && Number(discountAmount) > 0 ? discountAmount : (discount || 0));

  // Philippine 12% VAT Calculations (Gross VAT-Inclusive Retail Model)
  const numTotal = Math.max(0, Number(displayTotal || 0));
  const computedVatable = (vatableAmount !== null && vatableAmount !== undefined)
    ? Number(vatableAmount)
    : Math.round((numTotal / 1.12) * 100) / 100;

  const effectiveVat = vatAmount !== null && vatAmount !== undefined
    ? vatAmount
    : taxAmount;
  const computedVat = (effectiveVat !== null && effectiveVat !== undefined)
    ? Number(effectiveVat)
    : Math.round((numTotal - computedVatable) * 100) / 100;

  return (
    <div id="printable-receipt" className="printable-receipt thermal-receipt-root" style={{ color: '#000000', padding: '4px', fontSize: '11px', lineHeight: 1.3, width: '76mm', margin: '0 auto', fontFamily: "'Courier New', Courier, monospace" }}>
      {/* Header */}
      <div style={{ textAlign: 'center', paddingBottom: '8px', borderBottom: '1px dashed #000000' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 2px 0', letterSpacing: '-0.025em', textTransform: 'uppercase' }}>JLIN MOTORCYCLE PARTS</h2>
        <p style={{ fontSize: '10px', margin: '2px 0' }}>Calasiao, Pangasinan</p>
        <p style={{ fontSize: '9px', fontWeight: 'bold', margin: '2px 0', letterSpacing: '0.4px' }}>VAT REG. TIN: 432-876-109-000</p>
        <p style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', margin: '2px 0' }}>Official Sales Invoice</p>
        <p style={{ fontSize: '8px', color: '#555555', fontStyle: 'italic', margin: '1px 0' }}>(Prices are 12% VAT-Inclusive)</p>
      </div>

      {/* Meta Info */}
      <div style={{ padding: '8px 0', borderBottom: '1px dashed #000000', fontSize: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Order No:</span>
          <span style={{ fontWeight: 'bold' }}>{displayReceiptNo}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Date:</span>
          <span>{formatAuditDate(date)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Cashier:</span>
          <span>{cashier}</span>
        </div>
        {displayCustomer && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span>Customer:</span>
            <span>{displayCustomer}</span>
          </div>
        )}
        {customerAddress && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span>Address:</span>
            <span>{customerAddress}</span>
          </div>
        )}
      </div>

      {/* Line Items */}
      <div style={{ padding: '8px 0', borderBottom: '1px dashed #000000' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000000', fontSize: '9px', textTransform: 'uppercase' }}>
              <th style={{ padding: '2px 0', fontWeight: 'bold' }}>Item</th>
              <th style={{ padding: '2px 0', textAlign: 'center', fontWeight: 'bold' }}>Qty</th>
              <th style={{ padding: '2px 0', textAlign: 'right', fontWeight: 'bold' }}>Price</th>
              <th style={{ padding: '2px 0', textAlign: 'right', fontWeight: 'bold' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const name = item.name || item.product_name;
              const partNumber = item.partNumber || item.part_number;
              const qty = item.qty ?? item.quantity ?? 1;
              const unitPrice = item.unitPrice ?? item.price ?? (item.subtotal ? item.subtotal / qty : 0);
              const subtotal = item.subtotal ?? (unitPrice * qty);

              return (
                <tr key={idx} style={{ verticalAlign: 'top', borderTop: idx > 0 ? '1px dotted #000000' : 'none' }}>
                  <td style={{ padding: '4px 4px 4px 0' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '10px' }}>{name}</div>
                    {partNumber && <div style={{ fontSize: '9px', color: '#444444' }}>{partNumber}</div>}
                    {((item.serial_number) || (item.selected_serial_number) || (item.serial_numbers && (Array.isArray(item.serial_numbers) ? item.serial_numbers.length > 0 : Boolean(String(item.serial_numbers).trim())))) && (
                      <div style={{ fontSize: '9px', color: '#111111', fontWeight: 600, fontFamily: 'monospace', marginTop: '1px' }}>
                        SN: {item.serial_number || item.selected_serial_number || (Array.isArray(item.serial_numbers) ? item.serial_numbers.join(', ') : item.serial_numbers)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '4px 0', textAlign: 'center', fontFamily: 'monospace' }}>{qty}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(unitPrice)}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>{formatCurrency(subtotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Financial Breakdown */}
      <div style={{ padding: '8px 0', borderBottom: '1px dashed #000000', fontFamily: 'monospace', fontSize: '11px' }}>
        {effectiveDiscount > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>GROSS SUBTOTAL:</span>
              <span>{formatCurrency(subtotal || (numTotal + effectiveDiscount))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontWeight: 'bold' }}>
              <span>DISCOUNT / BAWAS:</span>
              <span>-{formatCurrency(effectiveDiscount)}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
          <span>TOTAL AMOUNT DUE:</span>
          <span>{formatCurrency(displayTotal)}</span>
        </div>

        {/* Philippine 12% VAT Breakdown */}
        <div style={{
          margin: '5px 0',
          padding: '4px 0',
          borderTop: '1px dotted #555555',
          borderBottom: '1px dotted #555555',
          fontSize: '9.5px',
          color: '#111111'
        }}>
          <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#222222', marginBottom: '2px', textTransform: 'uppercase' }}>
            Tax Breakdown (12% PH VAT):
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
            <span>VATable Sales:</span>
            <span>{formatCurrency(computedVatable)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
            <span style={{ fontWeight: 'bold' }}>12% VAT Amount:</span>
            <span style={{ fontWeight: 'bold' }}>{formatCurrency(computedVat)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px', color: '#555555' }}>
            <span>VAT-Exempt Sales:</span>
            <span>{formatCurrency(vatExemptAmount || 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555555' }}>
            <span>Zero-Rated Sales:</span>
            <span>{formatCurrency(zeroRatedAmount || 0)}</span>
          </div>
        </div>

        {/* Payment Details */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '4px', marginBottom: '2px' }}>
          <span>Payment ({paymentMethod.toUpperCase() === 'SPLIT' ? 'Split Cash+GCash' : paymentMethod}):</span>
          <span>{formatCurrency(amountTendered || displayTotal)}</span>
        </div>
        {paymentMethod.toUpperCase() === 'SPLIT' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', paddingLeft: '6px' }}>
              <span>- Cash Part:</span>
              <span>{formatCurrency(cashAmount || 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', paddingLeft: '6px' }}>
              <span>- GCash Part:</span>
              <span>{formatCurrency(gcashAmount || 0)}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold' }}>
          <span>Change Due:</span>
          <span>{formatCurrency(displayChange || 0)}</span>
        </div>
        {(isGcash || paymentMethod.toUpperCase() === 'SPLIT' || displayRef) && displayRef && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '2px' }}>
            <span>GCash Ref:</span>
            <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{displayRef}</span>
          </div>
        )}
      </div>

      {/* Footer / Barcode Target */}
      <div style={{ textAlign: 'center', paddingTop: '10px' }}>
        <p style={{ fontSize: '9px', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 2px 0', fontWeight: 'bold' }}>Thank you for your business!</p>
        <p style={{ fontSize: '8px', color: '#111111', margin: '0 0 2px 0', fontWeight: 'bold', textTransform: 'uppercase' }}>ALL SALES FINAL — INSPECTED UPON RELEASE</p>
        <p style={{ fontSize: '8px', color: '#777777', margin: 0, textTransform: 'uppercase' }}>Official Commercial Sales Invoice</p>
      </div>
    </div>
  );
};

export default ThermalReceipt;
