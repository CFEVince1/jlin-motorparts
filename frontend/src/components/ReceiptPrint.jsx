import React from 'react';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

/**
 * ReceiptPrint Component
 * 
 * Semantic HTML thermal receipt component formatted specifically for 58mm and 80mm thermal printers.
 * - Header: "JLIN Motorcycle Parts", Calasiao, Pangasinan; order number, date, cashier name.
 * - Items table: Particulars, Qty, Total (with word-break to prevent clipping).
 * - Payment section: Total, payment method (CASH or GCASH), amount tendered, change, GCash ref.
 * - Dedicated print stylesheet isolating #thermal-receipt and hiding screen UI.
 */
export const ReceiptPrint = ({
  orderNumber,
  date = new Date(),
  cashier = 'Cashier',
  customerName = '',
  customerAddress = '',
  items = [],
  totalAmount = 0,
  subtotal = 0,
  discount = 0,
  discountAmount = 0,
  paymentMethod = 'CASH',
  amountTendered = 0,
  changeDue = 0,
  gcashReference = '',
  cashAmount = null,
  gcashAmount = null,
  vatableAmount = null,
  vatAmount = null,
  taxAmount = null,
  vatExemptAmount = 0,
  zeroRatedAmount = 0,
  width = '80mm', // '58mm' or '80mm'
}) => {
  const is58mm = width === '58mm';
  const containerWidth = is58mm ? '54mm' : '76mm';
  const fontSize = is58mm ? '10px' : '11px';
  const effectiveDiscount = Number(discountAmount !== undefined && discountAmount !== null && Number(discountAmount) > 0 ? discountAmount : (discount || 0));

  // Philippine 12% VAT Calculations (Gross VAT-Inclusive Retail Model)
  const numTotal = Math.max(0, Number(totalAmount || 0));
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
    <div id="printable-receipt" className="thermal-receipt-root" style={{
      width: containerWidth,
      maxWidth: '100%',
      margin: '0 auto',
      padding: '4px 2px',
      color: '#000000',
      backgroundColor: '#ffffff',
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: fontSize,
      lineHeight: 1.25,
      boxSizing: 'border-box'
    }}>
      <style>{`
        @media print {
          @page {
            size: ${is58mm ? '58mm auto' : '80mm auto'};
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          #printable-receipt,
          #printable-receipt * {
            visibility: visible !important;
          }
          #printable-receipt {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${containerWidth} !important;
            max-width: ${containerWidth} !important;
            margin: 0 !important;
            padding: 2mm 1mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            display: block !important;
            z-index: 9999999 !important;
          }
        }
        .thermal-receipt-root table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .thermal-receipt-root td, .thermal-receipt-root th {
          word-break: break-word;
          overflow-wrap: break-word;
        }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: 'center', paddingBottom: '6px', borderBottom: '1px dashed #000000' }}>
        <h2 style={{ fontSize: is58mm ? '13px' : '15px', fontWeight: 'bold', margin: '0 0 2px 0', textTransform: 'uppercase' }}>
          JLIN MOTORCYCLE PARTS
        </h2>
        <div style={{ fontSize: is58mm ? '9px' : '10px', margin: '1px 0' }}>Calasiao, Pangasinan</div>
        <div style={{ fontSize: is58mm ? '8.5px' : '9.5px', margin: '1px 0', fontWeight: 'bold', letterSpacing: '0.5px' }}>
          VAT REG. TIN: 432-876-109-000
        </div>
        <div style={{ fontSize: is58mm ? '8px' : '9px', margin: '1px 0', textTransform: 'uppercase', fontWeight: 600 }}>
          Official Sales Invoice
        </div>
        <div style={{ fontSize: is58mm ? '7.5px' : '8.5px', color: '#444444', fontStyle: 'italic', margin: '1px 0' }}>
          (Prices are 12% VAT-Inclusive)
        </div>
      </div>

      {/* Order Meta */}
      <div style={{ padding: '6px 0', borderBottom: '1px dashed #000000', fontSize: is58mm ? '9px' : '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Order No:</span>
          <span style={{ fontWeight: 'bold' }}>{orderNumber || 'PENDING'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Date:</span>
          <span>{formatAuditDate(date)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Cashier:</span>
          <span>{cashier}</span>
        </div>
        {customerName && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Customer:</span>
            <span>{customerName}</span>
          </div>
        )}
        {customerAddress && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Address:</span>
            <span>{customerAddress}</span>
          </div>
        )}
      </div>

      {/* Line Items Table */}
      <div style={{ padding: '6px 0', borderBottom: '1px dashed #000000' }}>
        <table>
          <thead>
            <tr style={{ borderBottom: '1px solid #000000', fontSize: is58mm ? '8px' : '9px', textTransform: 'uppercase' }}>
              <th style={{ textAlign: 'left', padding: '2px 0', width: '56%' }}>Particulars</th>
              <th style={{ textAlign: 'center', padding: '2px 0', width: '16%' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '2px 0', width: '28%' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const name = item.name || item.product_name || 'Item';
              const partNo = item.part_number || item.partNumber || '';
              const qty = item.quantity ?? item.qty ?? 1;
              const subtotal = item.subtotal ?? (Number(item.price || 0) * qty);

              return (
                <tr key={idx} style={{ verticalAlign: 'top', borderTop: idx > 0 ? '1px dotted #cccccc' : 'none' }}>
                  <td style={{ padding: '3px 2px 3px 0' }}>
                    <div style={{ fontWeight: 'bold', fontSize: is58mm ? '9px' : '10px' }}>{name}</div>
                    {partNo && <div style={{ fontSize: is58mm ? '8px' : '9px', color: '#333333' }}>{partNo}</div>}
                    {((item.serial_number) || (item.selected_serial_number) || (item.serial_numbers && (Array.isArray(item.serial_numbers) ? item.serial_numbers.length > 0 : Boolean(String(item.serial_numbers).trim())))) && (
                      <div style={{ fontSize: is58mm ? '8px' : '9px', color: '#111111', fontWeight: 600, fontFamily: 'monospace', marginTop: '1px' }}>
                        SN: {item.serial_number || item.selected_serial_number || (Array.isArray(item.serial_numbers) ? item.serial_numbers.join(', ') : item.serial_numbers)}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', padding: '3px 0', fontFamily: 'monospace' }}>
                    {qty}
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 0', fontFamily: 'monospace', fontWeight: 'bold' }}>
                    {formatCurrency(subtotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Payment & Totals */}
      <div style={{ padding: '6px 0', borderBottom: '1px dashed #000000', fontSize: is58mm ? '10px' : '11px' }}>
        {effectiveDiscount > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>GROSS SUBTOTAL:</span>
              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(subtotal || (numTotal + effectiveDiscount))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontWeight: 'bold' }}>
              <span>DISCOUNT / BAWAS:</span>
              <span style={{ fontFamily: 'monospace' }}>-{formatCurrency(effectiveDiscount)}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: is58mm ? '11px' : '13px', marginBottom: '4px' }}>
          <span>TOTAL AMOUNT DUE:</span>
          <span style={{ fontFamily: 'monospace' }}>{formatCurrency(totalAmount)}</span>
        </div>

        {/* Philippine 12% VAT Breakdown */}
        <div style={{
          margin: '5px 0',
          padding: '4px 0',
          borderTop: '1px dotted #666666',
          borderBottom: '1px dotted #666666',
          fontSize: is58mm ? '8.5px' : '9.5px',
          color: '#111111'
        }}>
          <div style={{ fontSize: is58mm ? '8px' : '9px', fontWeight: 'bold', color: '#333333', marginBottom: '2px', textTransform: 'uppercase' }}>
            Tax Breakdown (12% PH VAT):
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
            <span>VATable Sales:</span>
            <span style={{ fontFamily: 'monospace' }}>{formatCurrency(computedVatable)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
            <span style={{ fontWeight: 'bold' }}>12% VAT Amount:</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{formatCurrency(computedVat)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px', color: '#555555' }}>
            <span>VAT-Exempt Sales:</span>
            <span style={{ fontFamily: 'monospace' }}>{formatCurrency(vatExemptAmount || 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555555' }}>
            <span>Zero-Rated Sales:</span>
            <span style={{ fontFamily: 'monospace' }}>{formatCurrency(zeroRatedAmount || 0)}</span>
          </div>
        </div>

        {/* Payment Details */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: is58mm ? '9px' : '10px', marginTop: '4px' }}>
          <span>Payment Method:</span>
          <span style={{ fontWeight: 'bold' }}>
            {paymentMethod.toUpperCase() === 'SPLIT' ? 'SPLIT (CASH + GCASH)' : paymentMethod.toUpperCase()}
          </span>
        </div>
        {paymentMethod.toUpperCase() === 'SPLIT' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: is58mm ? '8px' : '9px', paddingLeft: '6px' }}>
              <span>- Cash Part:</span>
              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(cashAmount || 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: is58mm ? '8px' : '9px', paddingLeft: '6px' }}>
              <span>- GCash Part:</span>
              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(gcashAmount || 0)}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: is58mm ? '9px' : '10px' }}>
          <span>Amount Tendered:</span>
          <span style={{ fontFamily: 'monospace' }}>{formatCurrency(amountTendered)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: is58mm ? '9px' : '10px', fontWeight: 'bold' }}>
          <span>Change Due:</span>
          <span style={{ fontFamily: 'monospace' }}>{formatCurrency(changeDue)}</span>
        </div>
        {(paymentMethod.toUpperCase() === 'GCASH' || paymentMethod.toUpperCase() === 'SPLIT') && gcashReference && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: is58mm ? '8px' : '9px', marginTop: '2px', color: '#111827' }}>
            <span>GCash Ref:</span>
            <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{gcashReference}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', paddingTop: '8px', fontSize: is58mm ? '8px' : '9px' }}>
        <div style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>Thank You For Shopping!</div>
        <div style={{ color: '#111111', fontWeight: 'bold', marginTop: '2px', textTransform: 'uppercase' }}>ALL SALES FINAL — INSPECTED UPON RELEASE</div>
        <div style={{ fontSize: is58mm ? '7.5px' : '8px', color: '#777777', marginTop: '2px', textTransform: 'uppercase' }}>
          Official Commercial Sales Invoice
        </div>
      </div>
    </div>
  );
};

export default ReceiptPrint;
