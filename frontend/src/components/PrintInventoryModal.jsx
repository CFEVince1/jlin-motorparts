import React, { useState, useEffect } from 'react';
import { Printer, X, FileText, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

export default function PrintInventoryModal({
  isOpen,
  onClose,
  products = [],
  initialFilter = 'out_of_stock', // 'out_of_stock' | 'in_stock' | 'all'
  user
}) {
  const [filterType, setFilterType] = useState(initialFilter);

  useEffect(() => {
    if (isOpen) {
      setFilterType(initialFilter);
    }
  }, [isOpen, initialFilter]);

  if (!isOpen) return null;

  // Filter items
  const filteredProducts = products.filter(p => {
    const stock = Number(p.stock ?? p.current_stock ?? 0);
    if (filterType === 'out_of_stock') return stock <= 0;
    if (filterType === 'in_stock') return stock > 0;
    return true; // 'all'
  });

  const totalUnits = filteredProducts.reduce((sum, p) => sum + Math.max(0, Number(p.stock ?? p.current_stock ?? 0)), 0);
  const totalValue = filteredProducts.reduce((sum, p) => {
    const stock = Math.max(0, Number(p.stock ?? p.current_stock ?? 0));
    const price = Number(p.selling_price ?? p.price ?? p.retail_price ?? 0);
    return sum + (stock * price);
  }, 0);

  const reportTitle = filterType === 'out_of_stock'
    ? 'OUT-OF-STOCK REPLENISHMENT REPORT'
    : filterType === 'in_stock'
    ? 'CURRENT IN-STOCK INVENTORY REPORT'
    : 'COMPLETE INVENTORY STOCK REPORT';

  const handlePrint = () => {
    window.print();
  };

  const currentDate = new Date().toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <>
      {/* Dynamic Print Style Override for Standard Paper (A4 / Letter) */}
      <style>{`
        #printable-inventory-report {
          display: none;
        }
        @media print {
          @page {
            size: A4 portrait !important;
            margin: 12mm 10mm !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-inventory-report,
          #printable-inventory-report * {
            visibility: visible !important;
          }
          #printable-inventory-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            font-size: 11px !important;
            display: block !important;
            z-index: 9999999 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Screen Modal Preview (Hidden when printing) */}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}
        onClick={onClose}
      >
        <div
          className="glass-panel"
          style={{
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden'
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface-hover)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(5, 150, 105, 0.15)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Printer size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Print Inventory Stock</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Preview and print official stock audit reports
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Filter Tabs */}
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              background: 'var(--surface)'
            }}
          >
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setFilterType('out_of_stock')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: filterType === 'out_of_stock' ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--border)',
                  background: filterType === 'out_of_stock' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                  color: filterType === 'out_of_stock' ? '#ef4444' : 'var(--text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: filterType === 'out_of_stock' ? '600' : 'normal',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <AlertTriangle size={14} /> Out of Stock ({products.filter(p => Number(p.stock ?? p.current_stock ?? 0) <= 0).length})
              </button>

              <button
                type="button"
                onClick={() => setFilterType('in_stock')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: filterType === 'in_stock' ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid var(--border)',
                  background: filterType === 'in_stock' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  color: filterType === 'in_stock' ? '#10b981' : 'var(--text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: filterType === 'in_stock' ? '600' : 'normal',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <CheckCircle2 size={14} /> In-Stock Only ({products.filter(p => Number(p.stock ?? p.current_stock ?? 0) > 0).length})
              </button>

              <button
                type="button"
                onClick={() => setFilterType('all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: filterType === 'all' ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: filterType === 'all' ? 'rgba(5, 150, 105, 0.15)' : 'transparent',
                  color: filterType === 'all' ? 'var(--primary)' : 'var(--text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: filterType === 'all' ? '600' : 'normal',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Layers size={14} /> All Items ({products.length})
              </button>
            </div>

            {/* Summary Tag */}
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Showing <strong>{filteredProducts.length}</strong> items • Total: <strong>{totalUnits} units</strong>
            </div>
          </div>

          {/* Table Preview */}
          <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
            <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table style={{ width: '100%', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Part Number</th>
                    <th>Product Name</th>
                    <th>Brand</th>
                    <th style={{ textAlign: 'right' }}>Unit Price</th>
                    <th style={{ textAlign: 'center' }}>Stock</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        No items match the selected stock filter.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map(p => {
                      const stock = Number(p.stock ?? p.current_stock ?? 0);
                      const isOut = stock <= 0;
                      const price = Number(p.selling_price ?? p.price ?? p.retail_price ?? 0);

                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: '600', color: 'var(--text-muted)' }}>{p.part_number}</td>
                          <td style={{ fontWeight: '500' }}>{p.product_name || p.name}</td>
                          <td>{p.brand || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--primary)' }}>
                            {formatCurrency(price)}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', color: isOut ? 'var(--danger)' : 'var(--success)' }}>
                            {stock}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className="badge-pill"
                              style={{
                                background: isOut ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                color: isOut ? '#ef4444' : '#10b981',
                                border: isOut ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                                fontSize: '0.7rem'
                              }}
                            >
                              {isOut ? 'OUT OF STOCK' : 'IN STOCK'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              background: 'var(--surface-hover)'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                fontSize: '0.85rem'
              }}
            >
              <Printer size={16} /> Print Report
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PRINTABLE SHEET CONTAINER (Strictly visible during browser print)
         ========================================================================= */}
      <div id="printable-inventory-report">
        {/* Printable Header */}
        <div style={{ borderBottom: '2px solid #000000', paddingBottom: '10px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                src="/jlin-logo.png"
                alt="JLIN Logo"
                style={{
                  width: '46px',
                  height: '46px',
                  objectFit: 'contain',
                  borderRadius: '50%',
                  border: '1.5px solid #000000',
                  flexShrink: 0
                }}
              />
              <div>
                <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  JLIN MOTO PARTS & ACCESSORIES
                </h1>
                <div style={{ fontSize: '11px', color: '#444444' }}>
                  Inventory Management & Physical Stock Audit Report
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '10px', color: '#333333' }}>
              <div><strong>Date:</strong> {currentDate}</div>
              <div><strong>Staff / Cashier:</strong> {user?.username || 'Staff'} ({user?.role || 'Staff'})</div>
            </div>
          </div>

          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #666666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {reportTitle}
            </span>
            <span style={{ fontSize: '11px', fontWeight: '600' }}>
              Total SKUs: {filteredProducts.length} | Total Units: {totalUnits}
              {filterType !== 'out_of_stock' && ` | Total Valuation: ₱${totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>
        </div>

        {/* Printable Data Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginTop: '6px' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
              <th style={{ padding: '6px 4px', textAlign: 'left', width: '35px' }}>#</th>
              <th style={{ padding: '6px 6px', textAlign: 'left', width: '120px' }}>Part Number</th>
              <th style={{ padding: '6px 6px', textAlign: 'left' }}>Product Name</th>
              <th style={{ padding: '6px 6px', textAlign: 'left', width: '90px' }}>Brand</th>
              <th style={{ padding: '6px 6px', textAlign: 'right', width: '80px' }}>Price</th>
              <th style={{ padding: '6px 6px', textAlign: 'center', width: '70px' }}>Stock</th>
              <th style={{ padding: '6px 6px', textAlign: 'center', width: '100px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p, index) => {
              const stock = Number(p.stock ?? p.current_stock ?? 0);
              const isOut = stock <= 0;
              const price = Number(p.selling_price ?? p.price ?? p.retail_price ?? 0);

              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #dddddd' }}>
                  <td style={{ padding: '5px 4px', textAlign: 'left', color: '#555555' }}>{index + 1}</td>
                  <td style={{ padding: '5px 6px', fontWeight: 'bold' }}>{p.part_number}</td>
                  <td style={{ padding: '5px 6px' }}>{p.product_name || p.name}</td>
                  <td style={{ padding: '5px 6px' }}>{p.brand || '-'}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '500' }}>
                    ₱{price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 'bold' }}>
                    {stock}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 'bold' }}>
                    {isOut ? 'OUT OF STOCK' : 'IN STOCK'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Printable Footer & Signatures */}
        <div style={{ marginTop: '30px', paddingTop: '10px', borderTop: '1px solid #000000', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
          <div style={{ width: '200px' }}>
            <div style={{ borderBottom: '1px solid #000000', height: '35px' }}></div>
            <div style={{ marginTop: '4px', textAlign: 'center', fontWeight: 'bold' }}>
              Prepared By: {user?.username || 'Staff'}
            </div>
            <div style={{ textAlign: 'center', color: '#666666', fontSize: '9px' }}>
              Inventory Custodian
            </div>
          </div>

          <div style={{ width: '200px' }}>
            <div style={{ borderBottom: '1px solid #000000', height: '35px' }}></div>
            <div style={{ marginTop: '4px', textAlign: 'center', fontWeight: 'bold' }}>
              Verified By / Store Manager
            </div>
            <div style={{ textAlign: 'center', color: '#666666', fontSize: '9px' }}>
              Authorized Signature
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
