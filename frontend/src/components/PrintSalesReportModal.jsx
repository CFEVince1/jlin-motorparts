import React from 'react';
import { Printer, X, FileText, Calendar, TrendingUp, Users, DollarSign, BarChart3 } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

export default function PrintSalesReportModal({
  isOpen,
  onClose,
  summary = { total_sales: 0, total_transactions: 0, total_profit: 0 },
  bestSelling = [],
  salesByMotorcycle = [],
  salesByCashier = [],
  filters = {},
  period = 'all',
  user = {}
}) {
  if (!isOpen) return null;

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

  const getPeriodTitle = () => {
    if (period === 'daily') return 'DAILY SALES & PERFORMANCE REPORT';
    if (period === 'weekly') return 'WEEKLY SALES & PERFORMANCE REPORT';
    if (period === 'monthly') return 'MONTHLY SALES & PERFORMANCE REPORT';
    if (period === 'all') return 'ALL-TIME SALES SUMMARY REPORT';
    return 'CUSTOM SALES PERFORMANCE REPORT';
  };

  const getDateRangeDisplay = () => {
    if (period === 'daily') {
      return filters.startDate ? `Single Day: ${filters.startDate}` : 'Daily (Today)';
    }
    if (period === 'weekly') {
      return filters.startDate && filters.endDate
        ? `Weekly: ${filters.startDate} to ${filters.endDate}`
        : 'Weekly Range';
    }
    if (period === 'monthly') {
      return filters.startDate && filters.endDate
        ? `Monthly: ${filters.startDate} to ${filters.endDate}`
        : 'Monthly Range';
    }
    if (filters.startDate && filters.endDate) {
      return `${filters.startDate} to ${filters.endDate}`;
    }
    if (filters.startDate) return `From: ${filters.startDate}`;
    if (filters.endDate) return `Until: ${filters.endDate}`;
    return 'All-Time Records (No Date Restrictions)';
  };

  const avgOrderValue = summary.total_transactions > 0
    ? Number(summary.total_sales) / Number(summary.total_transactions)
    : 0;

  const hasFilterTags = Boolean(
    (filters.brand && filters.brand !== 'All') ||
    (filters.category && filters.category !== 'All') ||
    filters.partNumber ||
    filters.motorcycleModel
  );

  return (
    <>
      {/* Dynamic Print CSS: ensures only the report sheet is printed */}
      <style>{`
        #printable-sales-report {
          display: none;
        }
        @media print {
          @page {
            size: A4 portrait !important;
            margin: 10mm 8mm !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-sales-report,
          #printable-sales-report * {
            visibility: visible !important;
          }
          #printable-sales-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            font-size: 10px !important;
            display: block !important;
            z-index: 9999999 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Screen Modal Dialog */}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
            maxWidth: '920px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            border: '1px solid var(--border)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.02)'
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
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Print Sales Report</h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {getPeriodTitle()} • {getDateRangeDisplay()}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={handlePrint}
                className="btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  fontSize: '0.82rem'
                }}
              >
                <Printer size={16} /> Print Now
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Modal Body Preview */}
          <div
            style={{
              padding: '24px',
              overflowY: 'auto',
              flex: 1,
              background: 'rgba(0, 0, 0, 0.2)'
            }}
          >
            {/* Visual Paper Preview Container */}
            <div
              style={{
                background: '#ffffff',
                color: '#111827',
                padding: '32px',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                fontFamily: 'Inter, sans-serif'
              }}
            >
              {/* Paper Header */}
              <div style={{ borderBottom: '2px solid #111827', paddingBottom: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <img
                      src="/jlin-logo.png"
                      alt="JLIN Logo"
                      style={{
                        width: '56px',
                        height: '56px',
                        objectFit: 'contain',
                        borderRadius: '50%',
                        border: '2px solid #111827',
                        flexShrink: 0
                      }}
                    />
                    <div>
                      <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0, letterSpacing: '0.5px', color: '#111827' }}>
                        JLIN MOTO PARTS & ACCESSORIES
                      </h2>
                      <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>
                        Sales Performance, Inventory Turns & Revenue Audit
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '11px', color: '#374151' }}>
                    <div><strong>Date Generated:</strong> {currentDate}</div>
                    <div><strong>Generated By:</strong> {user?.username || 'admin'} ({user?.role || 'Admin'})</div>
                  </div>
                </div>

                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #d1d5db', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', color: '#059669' }}>
                      {getPeriodTitle()}
                    </span>
                    <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '8px' }}>
                      ({getDateRangeDisplay()})
                    </span>
                  </div>
                  {hasFilterTags && (
                    <div style={{ fontSize: '10px', color: '#4b5563', background: '#f3f4f6', padding: '3px 8px', borderRadius: '4px' }}>
                      Filters: {filters.brand !== 'All' ? `Brand: ${filters.brand} ` : ''}
                      {filters.category !== 'All' ? `Cat: ${filters.category} ` : ''}
                      {filters.partNumber ? `Part: ${filters.partNumber} ` : ''}
                      {filters.motorcycleModel ? `Model: ${filters.motorcycleModel}` : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* KPI Cards (Paper format) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Total Revenue</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#15803d', marginTop: '2px' }}>{formatCurrency(summary.total_sales)}</div>
                </div>
                <div style={{ padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Gross Profit</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#15803d', marginTop: '2px' }}>{formatCurrency(summary.total_profit)}</div>
                </div>
                <div style={{ padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#475569', fontWeight: 600, textTransform: 'uppercase' }}>Transactions</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginTop: '2px' }}>{summary.total_transactions || 0}</div>
                </div>
                <div style={{ padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#475569', fontWeight: 600, textTransform: 'uppercase' }}>Avg Transaction</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginTop: '2px' }}>{formatCurrency(avgOrderValue)}</div>
                </div>
              </div>

              {/* Section 1: Best Selling Parts */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>
                  1. Top Selling Parts & Performance
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db' }}>
                      <th style={{ padding: '5px', textAlign: 'left', width: '35px' }}>Rank</th>
                      <th style={{ padding: '5px', textAlign: 'left', width: '100px' }}>Part #</th>
                      <th style={{ padding: '5px', textAlign: 'left' }}>Product Name</th>
                      <th style={{ padding: '5px', textAlign: 'left', width: '90px' }}>Brand & Size</th>
                      <th style={{ padding: '5px', textAlign: 'center', width: '60px' }}>Sold</th>
                      <th style={{ padding: '5px', textAlign: 'right', width: '85px' }}>Revenue</th>
                      <th style={{ padding: '5px', textAlign: 'right', width: '85px' }}>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestSelling.length > 0 ? bestSelling.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '5px', fontWeight: 600, color: '#059669' }}>#{idx + 1}</td>
                        <td style={{ padding: '5px', fontWeight: 600 }}>{item.part_number}</td>
                        <td style={{ padding: '5px' }}>{item.product_name}</td>
                        <td style={{ padding: '5px', color: '#4b5563' }}>{item.brand} | {item.size}</td>
                        <td style={{ padding: '5px', textAlign: 'center', fontWeight: 'bold', color: '#059669' }}>{item.total_sold}</td>
                        <td style={{ padding: '5px', textAlign: 'right' }}>{formatCurrency(item.total_revenue)}</td>
                        <td style={{ padding: '5px', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(item.total_profit)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '12px', color: '#6b7280' }}>
                          No sales data for the selected period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Section 2: Sales by Motorcycle & Cashier Side by Side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>
                    2. Sales by Motorcycle Model
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db' }}>
                        <th style={{ padding: '5px', textAlign: 'left' }}>Model</th>
                        <th style={{ padding: '5px', textAlign: 'center', width: '50px' }}>Units</th>
                        <th style={{ padding: '5px', textAlign: 'right', width: '80px' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesByMotorcycle.length > 0 ? salesByMotorcycle.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '5px' }}>{row.motorcycle_display || row.motorcycle_model}</td>
                          <td style={{ padding: '5px', textAlign: 'center', fontWeight: 600 }}>{row.total_sold}</td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>{formatCurrency(row.total_revenue)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', padding: '10px', color: '#6b7280' }}>
                            No model-linked sales for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>
                    3. Cashier Sales Breakdown
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db' }}>
                        <th style={{ padding: '5px', textAlign: 'left' }}>Cashier</th>
                        <th style={{ padding: '5px', textAlign: 'center', width: '60px' }}>Orders</th>
                        <th style={{ padding: '5px', textAlign: 'right', width: '85px' }}>Total Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesByCashier.length > 0 ? salesByCashier.map((staff, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '5px', fontWeight: 600, textTransform: 'capitalize' }}>{staff.cashier}</td>
                          <td style={{ padding: '5px', textAlign: 'center' }}>{staff.total_transactions}</td>
                          <td style={{ padding: '5px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{formatCurrency(staff.total_revenue)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', padding: '10px', color: '#6b7280' }}>
                            No cashier records for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Signatures & Verification */}
              <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid #d1d5db', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ width: '220px', textAlign: 'center' }}>
                  <div style={{ borderBottom: '1px solid #111827', height: '36px' }}></div>
                  <div style={{ fontSize: '10px', fontWeight: 600, marginTop: '4px' }}>Prepared By: {user?.username || 'Staff'}</div>
                  <div style={{ fontSize: '9px', color: '#6b7280' }}>Staff / Cashier Signature</div>
                </div>
                <div style={{ width: '220px', textAlign: 'center' }}>
                  <div style={{ borderBottom: '1px solid #111827', height: '36px' }}></div>
                  <div style={{ fontSize: '10px', fontWeight: 600, marginTop: '4px' }}>Approved By: Store Manager</div>
                  <div style={{ fontSize: '9px', color: '#6b7280' }}>Manager / Owner Signature</div>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.02)'
            }}
          >
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Standard A4 / Letter Print Layout • High Contrast Black & White Friendly
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
                style={{ padding: '8px 16px', fontSize: '0.8rem' }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', fontSize: '0.8rem' }}
              >
                <Printer size={16} /> Print Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PRINTABLE SHEET CONTAINER (Strictly visible during browser print)
         ========================================================================= */}
      <div id="printable-sales-report">
        {/* Printable Header */}
        <div style={{ borderBottom: '2px solid #000000', paddingBottom: '8px', marginBottom: '12px' }}>
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
                <div style={{ fontSize: '10px', color: '#444444' }}>
                  Motorcycle Parts & Accessories Sales Performance & Audit Report
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '10px', color: '#333333' }}>
              <div><strong>Date Generated:</strong> {currentDate}</div>
              <div><strong>Generated By:</strong> {user?.username || 'admin'} ({user?.role || 'Admin'})</div>
            </div>
          </div>

          <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #666666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {getPeriodTitle()}
            </span>
            <span style={{ fontSize: '10px', fontWeight: '600' }}>
              Period: {getDateRangeDisplay()}
            </span>
          </div>

          {hasFilterTags && (
            <div style={{ fontSize: '9px', color: '#555555', marginTop: '4px' }}>
              Active Filters: {filters.brand !== 'All' ? `Brand: ${filters.brand} | ` : ''}
              {filters.category !== 'All' ? `Category: ${filters.category} | ` : ''}
              {filters.partNumber ? `Part Number: ${filters.partNumber} | ` : ''}
              {filters.motorcycleModel ? `Motorcycle: ${filters.motorcycleModel}` : ''}
            </div>
          )}
        </div>

        {/* Printable KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
          <div style={{ padding: '6px 8px', border: '1px solid #000000', borderRadius: '4px' }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Total Revenue</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px' }}>{formatCurrency(summary.total_sales)}</div>
          </div>
          <div style={{ padding: '6px 8px', border: '1px solid #000000', borderRadius: '4px' }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Gross Profit</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px' }}>{formatCurrency(summary.total_profit)}</div>
          </div>
          <div style={{ padding: '6px 8px', border: '1px solid #000000', borderRadius: '4px' }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Transactions</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px' }}>{summary.total_transactions || 0}</div>
          </div>
          <div style={{ padding: '6px 8px', border: '1px solid #000000', borderRadius: '4px' }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Avg Transaction</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px' }}>{formatCurrency(avgOrderValue)}</div>
          </div>
        </div>

        {/* Printable Section 1: Best Selling Parts */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '1px solid #000000', paddingBottom: '3px', marginBottom: '4px' }}>
            1. Top Selling Parts
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
                <th style={{ padding: '4px', textAlign: 'left', width: '30px' }}>#</th>
                <th style={{ padding: '4px', textAlign: 'left', width: '90px' }}>Part #</th>
                <th style={{ padding: '4px', textAlign: 'left' }}>Product Name</th>
                <th style={{ padding: '4px', textAlign: 'left', width: '80px' }}>Brand / Size</th>
                <th style={{ padding: '4px', textAlign: 'center', width: '50px' }}>Sold</th>
                <th style={{ padding: '4px', textAlign: 'right', width: '75px' }}>Revenue</th>
                <th style={{ padding: '4px', textAlign: 'right', width: '75px' }}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {bestSelling.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '4px' }}>#{idx + 1}</td>
                  <td style={{ padding: '4px', fontWeight: 'bold' }}>{item.part_number}</td>
                  <td style={{ padding: '4px' }}>{item.product_name}</td>
                  <td style={{ padding: '4px' }}>{item.brand} | {item.size}</td>
                  <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{item.total_sold}</td>
                  <td style={{ padding: '4px', textAlign: 'right' }}>{formatCurrency(item.total_revenue)}</td>
                  <td style={{ padding: '4px', textAlign: 'right' }}>{formatCurrency(item.total_profit)}</td>
                </tr>
              ))}
              {bestSelling.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '8px' }}>No sales data for this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Printable Section 2 & 3: Model & Cashier */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '1px solid #000000', paddingBottom: '3px', marginBottom: '4px' }}>
              2. Sales by Motorcycle Model
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
                  <th style={{ padding: '4px', textAlign: 'left' }}>Model</th>
                  <th style={{ padding: '4px', textAlign: 'center', width: '45px' }}>Units</th>
                  <th style={{ padding: '4px', textAlign: 'right', width: '70px' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {salesByMotorcycle.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <td style={{ padding: '4px' }}>{row.motorcycle_display || row.motorcycle_model}</td>
                    <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{row.total_sold}</td>
                    <td style={{ padding: '4px', textAlign: 'right' }}>{formatCurrency(row.total_revenue)}</td>
                  </tr>
                ))}
                {salesByMotorcycle.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '8px' }}>No model sales recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '1px solid #000000', paddingBottom: '3px', marginBottom: '4px' }}>
              3. Cashier Breakdown
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
                  <th style={{ padding: '4px', textAlign: 'left' }}>Cashier</th>
                  <th style={{ padding: '4px', textAlign: 'center', width: '50px' }}>Orders</th>
                  <th style={{ padding: '4px', textAlign: 'right', width: '70px' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {salesByCashier.map((staff, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <td style={{ padding: '4px', fontWeight: 'bold', textTransform: 'capitalize' }}>{staff.cashier}</td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>{staff.total_transactions}</td>
                    <td style={{ padding: '4px', textAlign: 'right' }}>{formatCurrency(staff.total_revenue)}</td>
                  </tr>
                ))}
                {salesByCashier.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '8px' }}>No cashier transactions recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Printable Signatures */}
        <div style={{ marginTop: '20px', paddingTop: '10px', borderTop: '1px solid #000000', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '200px', textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000000', height: '30px' }}></div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '3px' }}>Prepared By: {user?.username || 'Staff'}</div>
            <div style={{ fontSize: '8px', color: '#555555' }}>Staff / Cashier Signature</div>
          </div>
          <div style={{ width: '200px', textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000000', height: '30px' }}></div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '3px' }}>Approved By: Store Manager</div>
            <div style={{ fontSize: '8px', color: '#555555' }}>Manager / Owner Signature</div>
          </div>
        </div>
      </div>
    </>
  );
}
