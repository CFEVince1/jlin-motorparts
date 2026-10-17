import React, { useState, useEffect, useCallback } from 'react';
import { Printer, X, Calendar, DollarSign, Receipt, CreditCard, Wallet, Users, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function PrintTransactionsReportModal({
  isOpen,
  onClose,
  initialTimeframe = 'Daily',
  user = {},
  transactions = [],
  currentFilterDate = '',
  searchQuery = ''
}) {
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [reportTransactions, setReportTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTransactionsForReport = useCallback(async (selectedTf) => {
    setLoading(true);
    const now = new Date();
    const todayStr = getLocalDateString(now);

    let startDate = '';
    let endDate = '';

    if (selectedTf === 'Daily') {
      startDate = currentFilterDate || todayStr;
      endDate = currentFilterDate || todayStr;
    } else if (selectedTf === 'Weekly') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 6);
      startDate = getLocalDateString(weekAgo);
      endDate = todayStr;
    } else if (selectedTf === 'Monthly') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = getLocalDateString(monthStart);
      endDate = todayStr;
    } else if (selectedTf === 'Yearly') {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      startDate = getLocalDateString(yearStart);
      endDate = todayStr;
    } else if (selectedTf === 'All') {
      startDate = '';
      endDate = '';
    }

    try {
      const params = {
        page: 1,
        limit: 500
      };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (searchQuery && searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get('/sales', { params });
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw?.data || []);
      setReportTransactions(list);
    } catch {
      // Fallback to currently available transactions passed from page
      setReportTransactions(transactions || []);
    } finally {
      setLoading(false);
    }
  }, [currentFilterDate, searchQuery, transactions]);

  useEffect(() => {
    if (isOpen) {
      setTimeframe(initialTimeframe);
      fetchTransactionsForReport(initialTimeframe);
    }
  }, [isOpen, initialTimeframe, fetchTransactionsForReport]);

  const handleTimeframeChange = (tf) => {
    setTimeframe(tf);
    fetchTransactionsForReport(tf);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const isStaff = user?.role === 'staff';
  const currentDate = new Date().toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const getTimeframeLabel = () => {
    if (timeframe === 'Daily') {
      return currentFilterDate ? `Daily Report (${currentFilterDate})` : `Daily Report (Today - ${getLocalDateString()})`;
    }
    if (timeframe === 'Weekly') return 'Weekly Report (Last 7 Days)';
    if (timeframe === 'Monthly') {
      const now = new Date();
      return `Monthly Report (${now.toLocaleString('en-PH', { month: 'long', year: 'numeric' })})`;
    }
    if (timeframe === 'Yearly') {
      return `Annual Report (${new Date().getFullYear()})`;
    }
    return 'All-Time Transactions Audit';
  };

  // Calculations
  const totalCount = reportTransactions.length;
  const totalRevenue = reportTransactions.reduce((acc, t) => acc + Number(t.total_amount || 0), 0);
  const cashSales = reportTransactions
    .filter(t => (t.payment_method || '').toUpperCase() === 'CASH')
    .reduce((acc, t) => acc + Number(t.total_amount || 0), 0);
  const gcashSales = reportTransactions
    .filter(t => (t.payment_method || '').toUpperCase() === 'GCASH')
    .reduce((acc, t) => acc + Number(t.total_amount || 0), 0);
  const otherSales = totalRevenue - cashSales - gcashSales;
  const avgOrderValue = totalCount > 0 ? totalRevenue / totalCount : 0;

  return (
    <>
      {/* Dynamic Print CSS: ensures only the A4 landscape report is printed */}
      <style>{`
        #printable-transactions-report {
          display: none;
        }
        @media print {
          @page {
            size: A4 landscape !important;
            margin: 10mm 8mm !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-transactions-report,
          #printable-transactions-report * {
            visibility: visible !important;
          }
          #printable-transactions-report {
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
            maxWidth: '1050px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden'
          }}
          onClick={(e) => e.stopPropagation()}
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
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                  Print {isStaff ? 'Cashier Sales Record' : 'Transaction History Audit Report'}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Preview official sales transaction history formatted for standard A4 landscape printing
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

          {/* Timeframe Presets & KPI Summary */}
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              background: 'var(--surface)'
            }}
          >
            {/* Timeframe Tabs */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>
                Timeframe:
              </span>
              {['Daily', 'Weekly', 'Monthly', 'Yearly', 'All'].map(tf => (
                <button
                  key={tf}
                  type="button"
                  className={timeframe === tf ? 'btn-primary' : 'btn-secondary'}
                  style={{
                    height: '28px',
                    padding: '0 10px',
                    fontSize: '0.75rem',
                    borderRadius: '6px',
                    fontWeight: timeframe === tf ? 600 : 500
                  }}
                  onClick={() => handleTimeframeChange(tf)}
                >
                  {tf === 'All' ? 'All Time' : tf}
                </button>
              ))}
            </div>

            {/* KPI Badges */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(5, 150, 105, 0.15)', color: 'var(--primary)', fontWeight: 700 }}>
                Revenue: {formatCurrency(totalRevenue)}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--surface-hover)', fontWeight: 600 }}>
                Transactions: {totalCount}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 600 }}>
                Cash: {formatCurrency(cashSales)}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 600 }}>
                GCash: {formatCurrency(gcashSales)}
              </span>
            </div>
          </div>

          {/* Modal Preview Body */}
          <div
            style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1,
              background: 'var(--bg-dark)'
            }}
          >
            <div
              style={{
                background: '#ffffff',
                color: '#000000',
                padding: '24px',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                minWidth: '750px'
              }}
            >
              {/* Header inside paper preview */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img
                    src="/jlin-logo.png"
                    alt="JLIN Logo"
                    style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '50%', border: '1.5px solid #000' }}
                  />
                  <div>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>
                      JLIN MOTO PARTS & ACCESSORIES
                    </h2>
                    <div style={{ fontSize: '11px', color: '#444' }}>
                      {isStaff ? 'Cashier Personal Sales Audit & Checkout Summary' : 'Complete Sales Transaction History & Financial Audit Report'}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '10px', color: '#333' }}>
                  <div><strong>Date Generated:</strong> {currentDate}</div>
                  <div><strong>Auditor / Cashier:</strong> {user?.username || 'Staff'} ({user?.role || 'Staff'})</div>
                </div>
              </div>

              {/* Sub-header Scope */}
              <div style={{ padding: '8px 0', borderBottom: '1px dashed #666', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                <div>
                  <strong>Report Scope:</strong> {getTimeframeLabel()}
                  {searchQuery && <span> &nbsp;|&nbsp; <strong>Search Filter:</strong> "{searchQuery}"</span>}
                </div>
                <div style={{ fontWeight: 'bold' }}>
                  Total: {formatCurrency(totalRevenue)} ({totalCount} Sales)
                </div>
              </div>

              {/* Table preview */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', color: '#000' }}>
                <thead>
                  <tr style={{ background: '#f2f2f2', borderBottom: '1.5px solid #000' }}>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '30px' }}>#</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '90px' }}>Receipt #</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '120px' }}>Date & Time</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '80px' }}>Cashier</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '110px' }}>Part Number</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>Products Included</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center', width: '75px' }}>Payment</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right', width: '85px' }}>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
                        Loading transaction records for {timeframe}...
                      </td>
                    </tr>
                  ) : reportTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#777' }}>
                        No transactions found for {getTimeframeLabel()}.
                      </td>
                    </tr>
                  ) : (
                    reportTransactions.map((t, index) => (
                      <tr key={t.id || index} style={{ borderBottom: '1px solid #e5e5e5' }}>
                        <td style={{ padding: '5px 4px', color: '#666' }}>{index + 1}</td>
                        <td style={{ padding: '5px 4px', fontWeight: 'bold' }}>
                          {t.order_number || `#${t.id}`}
                        </td>
                        <td style={{ padding: '5px 4px', whiteSpace: 'nowrap' }}>
                          {formatAuditDate(t.sale_date)}
                        </td>
                        <td style={{ padding: '5px 4px', textTransform: 'capitalize' }}>
                          {t.cashier || '-'}
                        </td>
                        <td style={{ padding: '5px 4px', fontSize: '9px', color: '#111', fontFamily: 'monospace' }}>
                          {t.part_numbers || t.part_number || '-'}
                        </td>
                        <td style={{ padding: '5px 4px' }}>
                          <div>{t.products_included || '-'}</div>
                          {t.compatibility_display && (
                            <div style={{ fontSize: '8.5px', color: '#666' }}>{t.compatibility_display}</div>
                          )}
                        </td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: '500' }}>
                          {t.payment_method || 'Cash'}
                        </td>
                        <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 'bold' }}>
                          {formatCurrency(t.total_amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {reportTransactions.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #000', background: '#fafafa', fontWeight: 'bold' }}>
                      <td colSpan={6} style={{ padding: '8px 4px', textAlign: 'right' }}>
                        GRAND TOTAL ({totalCount} Transactions):
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>-</td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', color: '#059669', fontSize: '11px' }}>
                        {formatCurrency(totalRevenue)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>

              {/* Signatures preview */}
              <div style={{ marginTop: '30px', paddingTop: '10px', borderTop: '1px solid #000', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <div style={{ width: '220px' }}>
                  <div style={{ borderBottom: '1px solid #000', height: '35px' }}></div>
                  <div style={{ marginTop: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                    Prepared By: {user?.username || 'Staff'}
                  </div>
                  <div style={{ textAlign: 'center', color: '#666', fontSize: '9px' }}>
                    {isStaff ? 'Cashier / Staff' : 'Store Auditor'}
                  </div>
                </div>

                <div style={{ width: '220px' }}>
                  <div style={{ borderBottom: '1px solid #000', height: '35px' }}></div>
                  <div style={{ marginTop: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                    Verified By / Store Manager
                  </div>
                  <div style={{ textAlign: 'center', color: '#666', fontSize: '9px' }}>
                    Authorized Signature
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
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
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handlePrint}
              disabled={loading || reportTransactions.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={16} /> Print Document
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PRINTABLE SHEET CONTAINER (Strictly visible during browser print)
         ========================================================================= */}
      <div id="printable-transactions-report">
        {/* Printable Header */}
        <div style={{ borderBottom: '2px solid #000000', paddingBottom: '10px', marginBottom: '12px' }}>
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
                <h1 style={{ fontSize: '17px', fontWeight: 'bold', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  JLIN MOTO PARTS & ACCESSORIES
                </h1>
                <div style={{ fontSize: '11px', color: '#444444' }}>
                  {isStaff ? 'Cashier Personal Sales Audit & Checkout Summary' : 'Complete Sales Transaction History & Financial Audit Report'}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '10px', color: '#333333' }}>
              <div><strong>Date:</strong> {currentDate}</div>
              <div><strong>Cashier / Auditor:</strong> {user?.username || 'Staff'} ({user?.role || 'Staff'})</div>
            </div>
          </div>

          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #666666', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px' }}>
            <div>
              <strong>Scope:</strong> {getTimeframeLabel()}
              {searchQuery && <span> &nbsp;|&nbsp; <strong>Search Filter:</strong> "{searchQuery}"</span>}
            </div>
            <div style={{ fontWeight: '600' }}>
              Sales: {formatCurrency(totalRevenue)} | Count: {totalCount} | Cash: {formatCurrency(cashSales)} | GCash: {formatCurrency(gcashSales)}
            </div>
          </div>
        </div>

        {/* Printable Data Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '28px' }}>#</th>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '85px' }}>Receipt #</th>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '110px' }}>Date & Time</th>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '75px' }}>Cashier</th>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '105px' }}>Part Number</th>
              <th style={{ padding: '5px 4px', textAlign: 'left' }}>Products Included</th>
              <th style={{ padding: '5px 4px', textAlign: 'center', width: '70px' }}>Payment</th>
              <th style={{ padding: '5px 4px', textAlign: 'right', width: '85px' }}>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {reportTransactions.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                  No transaction records found matching report criteria.
                </td>
              </tr>
            ) : (
              reportTransactions.map((t, index) => (
                <tr key={t.id || index} style={{ borderBottom: '1px solid #dddddd' }}>
                  <td style={{ padding: '4px', color: '#555555' }}>{index + 1}</td>
                  <td style={{ padding: '4px', fontWeight: 'bold' }}>{t.order_number || `#${t.id}`}</td>
                  <td style={{ padding: '4px', whiteSpace: 'nowrap' }}>{formatAuditDate(t.sale_date)}</td>
                  <td style={{ padding: '4px', textTransform: 'capitalize' }}>{t.cashier || '-'}</td>
                  <td style={{ padding: '4px', fontSize: '8.5px', color: '#111', fontFamily: 'monospace' }}>{t.part_numbers || t.part_number || '-'}</td>
                  <td style={{ padding: '4px' }}>
                    <div>{t.products_included || '-'}</div>
                    {t.compatibility_display && (
                      <div style={{ fontSize: '8px', color: '#666' }}>{t.compatibility_display}</div>
                    )}
                  </td>
                  <td style={{ padding: '4px', textAlign: 'center', fontWeight: '500' }}>
                    {t.payment_method || 'Cash'}
                  </td>
                  <td style={{ padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                    {formatCurrency(t.total_amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {reportTransactions.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid #000000', background: '#f9f9f9', fontWeight: 'bold' }}>
                <td colSpan={6} style={{ padding: '6px 4px', textAlign: 'right' }}>
                  GRAND TOTAL ({totalCount} Transactions):
                </td>
                <td style={{ padding: '6px 4px', textAlign: 'center' }}>-</td>
                <td style={{ padding: '6px 4px', textAlign: 'right', fontSize: '10.5px' }}>
                  {formatCurrency(totalRevenue)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* Printable Footer & Signatures */}
        <div style={{ marginTop: '28px', paddingTop: '8px', borderTop: '1px solid #000000', display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }}>
          <div style={{ width: '220px' }}>
            <div style={{ borderBottom: '1px solid #000000', height: '32px' }}></div>
            <div style={{ marginTop: '4px', textAlign: 'center', fontWeight: 'bold' }}>
              Prepared By: {user?.username || 'Staff'}
            </div>
            <div style={{ textAlign: 'center', color: '#666666', fontSize: '8.5px' }}>
              {isStaff ? 'Cashier / Staff' : 'Store Auditor'}
            </div>
          </div>

          <div style={{ width: '220px' }}>
            <div style={{ borderBottom: '1px solid #000000', height: '32px' }}></div>
            <div style={{ marginTop: '4px', textAlign: 'center', fontWeight: 'bold' }}>
              Verified By / Store Manager
            </div>
            <div style={{ textAlign: 'center', color: '#666666', fontSize: '8.5px' }}>
              Authorized Signature
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
