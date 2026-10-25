import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, RotateCcw, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function PrintReturnsReportModal({
  isOpen,
  onClose,
  initialTimeframe = 'Daily',
  user = {},
  returns = [],
  currentFilterDate = '',
  currentCashier = '',
  searchQuery = ''
}) {
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [reportReturns, setReportReturns] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchReturnsForReport = useCallback(async (selectedTf) => {
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
      if (currentCashier && currentCashier !== 'ALL') params.user = currentCashier;

      const res = await api.get('/sales/returns/history', { params });
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw?.data || []);
      setReportReturns(list);
    } catch {
      setReportReturns(returns || []);
    } finally {
      setLoading(false);
    }
  }, [currentFilterDate, searchQuery, currentCashier, returns]);

  useEffect(() => {
    if (isOpen) {
      setTimeframe(initialTimeframe);
      fetchReturnsForReport(initialTimeframe);
    }
  }, [isOpen, initialTimeframe, fetchReturnsForReport]);

  const handleTimeframeChange = (tf) => {
    setTimeframe(tf);
    fetchReturnsForReport(tf);
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
    return 'All-Time Returns & Refunds Audit';
  };

  // Calculations
  const totalCount = reportReturns.length;
  const totalRefund = reportReturns.reduce((acc, r) => acc + Number(r.total_refund_amount || 0), 0);
  const cashRefunds = reportReturns
    .filter(r => (r.refund_payment_method || '').toUpperCase() === 'CASH')
    .reduce((acc, r) => acc + Number(r.total_refund_amount || 0), 0);
  const gcashRefunds = reportReturns
    .filter(r => (r.refund_payment_method || '').toUpperCase() === 'GCASH')
    .reduce((acc, r) => acc + Number(r.total_refund_amount || 0), 0);
  const damagedCount = reportReturns.filter(r => (r.dispositions || '').toUpperCase().includes('DAMAGE')).length;
  const restockedCount = reportReturns.filter(r => {
    const disp = (r.dispositions || '').toUpperCase();
    return disp.includes('FOUND') || disp.includes('RESTOCK') || disp.includes('GOOD');
  }).length;

  return (
    <>
      {/* Dynamic Print CSS: ensures only the A4 landscape report is printed and collapses #root */}
      <style>{`
        #printable-returns-report {
          display: none;
        }
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm 8mm;
          }
          #root {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
          }
          #printable-returns-report,
          #printable-returns-report * {
            visibility: visible !important;
          }
          #printable-returns-report {
            display: block !important;
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            font-size: 10px !important;
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
            maxWidth: '1100px',
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
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                  Print {isStaff ? 'Cashier Return & Refund Record' : 'Returns & Refunds Audit Report'}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Official summary of customer returns, deductions, item dispositions, and cash/GCash refunds
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
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 700 }}>
                Total Refunded: {formatCurrency(totalRefund)}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--surface-hover)', fontWeight: 600 }}>
                Returns: {totalCount}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 600 }}>
                Cash: {formatCurrency(cashRefunds)}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 600 }}>
                GCash: {formatCurrency(gcashRefunds)}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(20, 184, 166, 0.12)', color: '#0f766e', fontWeight: 600 }}>
                Restocked: {restockedCount}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.12)', color: '#b45309', fontWeight: 600 }}>
                Damaged: {damagedCount}
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
              className="report-paper-sheet"
              style={{
                background: '#ffffff',
                color: '#111827',
                padding: '24px',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                minWidth: '850px'
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
                      {isStaff ? 'Cashier Return & Refund Audit Summary' : 'Customer Returns & Refund Deductions Audit Report'}
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
                <div style={{ fontWeight: 'bold', color: '#b91c1c' }}>
                  Total Refunds Deducted: {formatCurrency(totalRefund)} ({totalCount} Return Slips)
                </div>
              </div>

              {/* Table preview */}
              <table className="report-paper-sheet" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', color: '#111827' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #000' }}>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '25px' }}>#</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '95px' }}>Return Slip No.</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '90px' }}>Orig. Order</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '110px' }}>Date & Time</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '75px' }}>Cashier</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '95px' }}>Part Number</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>Items Returned</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '85px' }}>Disposition</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '100px' }}>Reason</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center', width: '60px' }}>Method</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right', width: '85px' }}>Refund Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
                        Loading return and refund records for {timeframe}...
                      </td>
                    </tr>
                  ) : reportReturns.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: '#777' }}>
                        No return records found for {getTimeframeLabel()}.
                      </td>
                    </tr>
                  ) : (
                    reportReturns.map((r, index) => {
                      const isDamaged = (r.dispositions || '').toUpperCase().includes('DAMAGE');
                      const isGood = (r.dispositions || '').toUpperCase().includes('RESTOCK') || (r.dispositions || '').toUpperCase().includes('FOUND') || (r.dispositions || '').toUpperCase().includes('GOOD');

                      return (
                        <tr key={r.id || index} style={{ borderBottom: '1px solid #e5e5e5' }}>
                          <td style={{ padding: '5px 4px', color: '#666' }}>{index + 1}</td>
                          <td style={{ padding: '5px 4px', fontWeight: 'bold' }}>
                            {r.return_number || `RET-${r.id}`}
                          </td>
                          <td style={{ padding: '5px 4px', color: '#444' }}>
                            {r.order_number || `SO-${r.sale_id}`}
                          </td>
                          <td style={{ padding: '5px 4px', whiteSpace: 'nowrap' }}>
                            {formatAuditDate(r.created_at)}
                          </td>
                          <td style={{ padding: '5px 4px', textTransform: 'capitalize' }}>
                            {r.cashier || '-'}
                          </td>
                          <td style={{ padding: '5px 4px', fontSize: '9px', color: '#111', fontFamily: 'monospace' }}>
                            {r.part_numbers || '-'}
                          </td>
                          <td style={{ padding: '5px 4px' }}>
                            {r.products_returned || '-'}
                          </td>
                          <td style={{ padding: '5px 4px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '8.5px',
                              fontWeight: 600,
                              background: isDamaged ? 'rgba(239, 68, 68, 0.12)' : isGood ? 'rgba(16, 185, 129, 0.12)' : '#f3f4f6',
                              color: isDamaged ? '#b91c1c' : isGood ? '#047857' : '#374151',
                              border: isDamaged ? '1px solid rgba(239, 68, 68, 0.3)' : isGood ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #d1d5db'
                            }}>
                              {isDamaged ? 'Damaged (Lost)' : isGood ? 'Good (Restocked)' : (r.dispositions || 'Standard')}
                            </span>
                          </td>
                          <td style={{ padding: '5px 4px', color: '#555', fontStyle: 'italic', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.reason || 'None specified'}
                          </td>
                          <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: '500' }}>
                            {r.refund_payment_method || 'Cash'}
                          </td>
                          <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 'bold', color: '#b91c1c' }}>
                            {formatCurrency(r.total_refund_amount)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {reportReturns.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #000', background: '#fafafa', fontWeight: 'bold' }}>
                      <td colSpan={10} style={{ padding: '8px 4px', textAlign: 'right' }}>
                        TOTAL DEDUCTIONS ({totalCount} Returns):
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', color: '#b91c1c', fontSize: '11px' }}>
                        {formatCurrency(totalRefund)}
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
              disabled={loading || reportReturns.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={16} /> Print Document
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PRINTABLE SHEET CONTAINER (Rendered via portal into body)
         ========================================================================= */}
      {typeof document !== 'undefined' && createPortal(
        <div id="printable-returns-report" className="report-paper-sheet">
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
                    {isStaff ? 'Cashier Return & Refund Audit Summary' : 'Customer Returns & Refund Deductions Audit Report'}
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
                Total Refunds: {formatCurrency(totalRefund)} | Returns: {totalCount} | Cash: {formatCurrency(cashRefunds)} | GCash: {formatCurrency(gcashRefunds)}
              </div>
            </div>
          </div>

          {/* Printable Data Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
                <th style={{ padding: '5px 4px', textAlign: 'left', width: '25px' }}>#</th>
                <th style={{ padding: '5px 4px', textAlign: 'left', width: '90px' }}>Return Slip No.</th>
                <th style={{ padding: '5px 4px', textAlign: 'left', width: '85px' }}>Orig. Order</th>
                <th style={{ padding: '5px 4px', textAlign: 'left', width: '100px' }}>Date & Time</th>
                <th style={{ padding: '5px 4px', textAlign: 'left', width: '70px' }}>Cashier</th>
                <th style={{ padding: '5px 4px', textAlign: 'left', width: '90px' }}>Part Number</th>
                <th style={{ padding: '5px 4px', textAlign: 'left' }}>Items Returned</th>
                <th style={{ padding: '5px 4px', textAlign: 'left', width: '80px' }}>Disposition</th>
                <th style={{ padding: '5px 4px', textAlign: 'left', width: '90px' }}>Reason</th>
                <th style={{ padding: '5px 4px', textAlign: 'center', width: '55px' }}>Method</th>
                <th style={{ padding: '5px 4px', textAlign: 'right', width: '80px' }}>Refund Amount</th>
              </tr>
            </thead>
            <tbody>
              {reportReturns.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                    No return records found matching report criteria.
                  </td>
                </tr>
              ) : (
                reportReturns.map((r, index) => {
                  const isDamaged = (r.dispositions || '').toUpperCase().includes('DAMAGE');
                  const isGood = (r.dispositions || '').toUpperCase().includes('RESTOCK') || (r.dispositions || '').toUpperCase().includes('FOUND') || (r.dispositions || '').toUpperCase().includes('GOOD');

                  return (
                    <tr key={r.id || index} style={{ borderBottom: '1px solid #dddddd' }}>
                      <td style={{ padding: '4px', color: '#555555' }}>{index + 1}</td>
                      <td style={{ padding: '4px', fontWeight: 'bold' }}>{r.return_number || `RET-${r.id}`}</td>
                      <td style={{ padding: '4px', color: '#333333' }}>{r.order_number || `SO-${r.sale_id}`}</td>
                      <td style={{ padding: '4px', whiteSpace: 'nowrap' }}>{formatAuditDate(r.created_at)}</td>
                      <td style={{ padding: '4px', textTransform: 'capitalize' }}>{r.cashier || '-'}</td>
                      <td style={{ padding: '4px', fontSize: '8.5px', color: '#111', fontFamily: 'monospace' }}>{r.part_numbers || '-'}</td>
                      <td style={{ padding: '4px' }}>{r.products_returned || '-'}</td>
                      <td style={{ padding: '4px' }}>
                        {isDamaged ? 'Damaged (Lost)' : isGood ? 'Good (Restocked)' : (r.dispositions || 'Standard')}
                      </td>
                      <td style={{ padding: '4px', color: '#444444', fontStyle: 'italic' }}>{r.reason || 'None specified'}</td>
                      <td style={{ padding: '4px', textAlign: 'center', fontWeight: '500' }}>{r.refund_payment_method || 'Cash'}</td>
                      <td style={{ padding: '4px', textAlign: 'right', fontWeight: 'bold', color: '#000000' }}>
                        {formatCurrency(r.total_refund_amount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {reportReturns.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid #000000', background: '#f9f9f9', fontWeight: 'bold' }}>
                  <td colSpan={10} style={{ padding: '6px 4px', textAlign: 'right' }}>
                    TOTAL DEDUCTIONS ({totalCount} Returns):
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontSize: '10.5px' }}>
                    {formatCurrency(totalRefund)}
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
        </div>,
        document.body
      )}
    </>
  );
}
