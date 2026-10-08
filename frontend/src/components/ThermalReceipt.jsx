import React from 'react';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

export const ThermalReceipt = ({
  receiptId,
  date,
  cashier,
  customer,
  items = [],
  total = 0,
  paymentMethod = 'Cash',
  amountTendered = 0,
  change = 0,
}) => {
  return (
    <div className="printable-receipt" style={{ color: '#000000', padding: '4px', fontSize: '11px', lineHeight: 1.3, width: '76mm', margin: '0 auto', fontFamily: "'Courier New', Courier, monospace" }}>
      {/* Header */}
      <div style={{ textAlign: 'center', paddingBottom: '8px', borderBottom: '1px dashed #000000' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 2px 0', letterSpacing: '-0.025em', textTransform: 'uppercase' }}>J-Lin Racing Parts</h2>
        <p style={{ fontSize: '10px', margin: '2px 0' }}>Pangasinan, Philippines</p>
        <p style={{ fontSize: '10px', margin: '2px 0' }}>Sales & Inventory Audit Slip</p>
      </div>

      {/* Meta Info */}
      <div style={{ padding: '8px 0', borderBottom: '1px dashed #000000', fontSize: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Receipt #:</span>
          <span style={{ fontWeight: 'bold' }}>{receiptId}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Date:</span>
          <span>{formatAuditDate(date)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Cashier:</span>
          <span>{cashier}</span>
        </div>
        {customer && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span>Customer:</span>
            <span>{customer}</span>
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
                    <div style={{ fontSize: '9px', color: '#444444' }}>{partNumber}</div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
          <span>TOTAL:</span>
          <span>{formatCurrency(total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
          <span>Payment ({paymentMethod}):</span>
          <span>{formatCurrency(amountTendered || total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
          <span>Change:</span>
          <span>{formatCurrency(change || 0)}</span>
        </div>
      </div>

      {/* Footer / Barcode Target */}
      <div style={{ textAlign: 'center', paddingTop: '12px' }}>
        <p style={{ fontSize: '9px', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 2px 0' }}>Thank you for your business!</p>
        <p style={{ fontSize: '8px', color: '#555555', margin: 0 }}>Official Internal Sales Receipt</p>
      </div>
    </div>
  );
};

export default ThermalReceipt;
