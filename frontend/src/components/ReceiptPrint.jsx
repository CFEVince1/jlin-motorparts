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
  paymentMethod = 'CASH',
  amountTendered = 0,
  changeDue = 0,
  gcashReference = '',
  width = '80mm', // '58mm' or '80mm'
}) => {
  const is58mm = width === '58mm';
  const containerWidth = is58mm ? '54mm' : '76mm';
  const fontSize = is58mm ? '10px' : '11px';

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
        <div style={{ fontSize: is58mm ? '8px' : '9px', margin: '1px 0' }}>Official Sales Slip</div>
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
                    {item.is_serialized && item.serial_numbers && item.serial_numbers.length > 0 && (
                      <div style={{ fontSize: '8px', color: '#444444' }}>
                        SN: {Array.isArray(item.serial_numbers) ? item.serial_numbers.join(', ') : item.serial_numbers}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: is58mm ? '11px' : '13px', marginBottom: '3px' }}>
          <span>TOTAL:</span>
          <span>{formatCurrency(totalAmount)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: is58mm ? '9px' : '10px' }}>
          <span>Method:</span>
          <span style={{ fontWeight: 'bold' }}>{paymentMethod.toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: is58mm ? '9px' : '10px' }}>
          <span>Tendered:</span>
          <span>{formatCurrency(amountTendered)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: is58mm ? '9px' : '10px', fontWeight: 'bold' }}>
          <span>Change:</span>
          <span>{formatCurrency(changeDue)}</span>
        </div>
        {paymentMethod.toUpperCase() === 'GCASH' && gcashReference && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: is58mm ? '8px' : '9px', marginTop: '2px', color: '#111827' }}>
            <span>GCash Ref:</span>
            <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{gcashReference}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', paddingTop: '8px', fontSize: is58mm ? '8px' : '9px' }}>
        <div style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>Thank You For Shopping!</div>
        <div style={{ color: '#555555', marginTop: '1px' }}>Keep receipt for warranty claims</div>
      </div>
    </div>
  );
};

export default ReceiptPrint;
