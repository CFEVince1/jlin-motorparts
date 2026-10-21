import React from 'react';
import { Printer, X, FileText, AlertOctagon, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { formatAuditDate } from '../utils/formatters';

export default function PrintAdjustmentsReportModal({
  isOpen,
  onClose,
  adjustments = [],
  summary = { DAMAGE: 0, LOSS: 0, RETURN_TO_SUPPLIER: 0, FOUND: 0 },
  filters = {},
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

  const getDateRangeDisplay = () => {
    if (filters.startDate && filters.endDate) {
      return `${filters.startDate} to ${filters.endDate}`;
    }
    if (filters.startDate) return `From: ${filters.startDate}`;
    if (filters.endDate) return `Until: ${filters.endDate}`;
    return 'All-Time Records (No Date Restrictions)';
  };

  const getTypeFilterDisplay = () => {
    if (!filters.selectedType || filters.selectedType === 'ALL') return 'All Movement Types';
    return filters.selectedType;
  };

  const totalEvents = adjustments.length;
  const totalUnits = adjustments.reduce(
    (sum, a) => sum + Math.abs(Number(a.quantity_change || a.quantity || 0)),
    0
  );

  return (
    <>
      {/* Dynamic Print CSS: ensures only the A4 landscape report is printed */}
      <style>{`
        #printable-adjustments-report {
          display: none;
        }
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm 8mm;
          }
          body * {
            visibility: hidden;
          }
          #printable-adjustments-report,
          #printable-adjustments-report * {
            visibility: visible !important;
          }
          #printable-adjustments-report {
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
                  Print Discrepancy & Adjustment Audit Report
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Preview official audit log formatted for A4 document printing
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

          {/* Scope & KPI Summary Bar */}
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              background: 'var(--surface)',
              fontSize: '0.8rem'
            }}
          >
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Date Scope: </span>
                <strong>{getDateRangeDisplay()}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Type: </span>
                <strong style={{ color: 'var(--primary)' }}>{getTypeFilterDisplay()}</strong>
              </div>
              {filters.search && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Search: </span>
                  <strong>"{filters.search}"</strong>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 600 }}>
                Damaged: {summary.DAMAGE || 0}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 600 }}>
                Lost: {summary.LOSS || 0}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1', fontWeight: 600 }}>
                Returned: {summary.RETURN_TO_SUPPLIER || 0}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 600 }}>
                Found: {summary.FOUND || 0}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--surface-hover)', fontWeight: 600 }}>
                Total Records: {totalEvents}
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
                minWidth: '700px'
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
                      Non-Sales Inventory Discrepancy & Stock Adjustment Audit Report
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '10px', color: '#333' }}>
                  <div><strong>Date Generated:</strong> {currentDate}</div>
                  <div><strong>Auditor:</strong> {user?.username || 'Staff'} ({user?.role || 'Staff'})</div>
                </div>
              </div>

              {/* Table preview */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', color: '#000' }}>
                <thead>
                  <tr style={{ background: '#f2f2f2', borderBottom: '1.5px solid #000' }}>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '30px' }}>#</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '110px' }}>Date / Time</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '90px' }}>Part Number</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>Product Name</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '90px' }}>Type / Reason</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center', width: '55px' }}>Change</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center', width: '55px' }}>Balance</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '90px' }}>Ref Code</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '70px' }}>Staff</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left', width: '140px' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: '#777' }}>
                        No discrepancy records match current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    adjustments.map((adj, index) => {
                      const isPos = Number(adj.quantity_change) > 0;
                      return (
                        <tr key={adj.id || index} style={{ borderBottom: '1px solid #e5e5e5' }}>
                          <td style={{ padding: '5px 4px', color: '#666' }}>{index + 1}</td>
                          <td style={{ padding: '5px 4px', whiteSpace: 'nowrap' }}>{formatAuditDate(adj.created_at)}</td>
                          <td style={{ padding: '5px 4px', fontWeight: 'bold' }}>{adj.part_number}</td>
                          <td style={{ padding: '5px 4px' }}>{adj.product_name}</td>
                          <td style={{ padding: '5px 4px', fontWeight: '600' }}>{adj.movement_type}</td>
                          <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 'bold', color: isPos ? '#059669' : '#dc2626' }}>
                            {isPos ? `+${adj.quantity_change}` : adj.quantity_change}
                          </td>
                          <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: '600' }}>{adj.balance_after}</td>
                          <td style={{ padding: '5px 4px', fontFamily: 'monospace', fontSize: '9px' }}>{adj.reference_no}</td>
                          <td style={{ padding: '5px 4px' }}>{adj.created_by_username || 'system'}</td>
                          <td style={{ padding: '5px 4px', color: '#444' }}>{adj.remarks || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Signatures preview */}
              <div style={{ marginTop: '30px', paddingTop: '10px', borderTop: '1px solid #000', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <div style={{ width: '220px' }}>
                  <div style={{ borderBottom: '1px solid #000', height: '35px' }}></div>
                  <div style={{ marginTop: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                    Prepared By: {user?.username || 'Staff'}
                  </div>
                  <div style={{ textAlign: 'center', color: '#666', fontSize: '9px' }}>
                    Inventory Custodian / Auditor
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
      <div id="printable-adjustments-report">
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
                  Non-Sales Inventory Discrepancy & Stock Adjustment Audit Report
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '10px', color: '#333333' }}>
              <div><strong>Date:</strong> {currentDate}</div>
              <div><strong>Auditor:</strong> {user?.username || 'Staff'} ({user?.role || 'Staff'})</div>
            </div>
          </div>

          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #666666', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px' }}>
            <div>
              <strong>Scope:</strong> {getDateRangeDisplay()} &nbsp;|&nbsp; <strong>Type:</strong> {getTypeFilterDisplay()}
              {filters.search && <span> &nbsp;|&nbsp; <strong>Search:</strong> "{filters.search}"</span>}
            </div>
            <div style={{ fontWeight: '600' }}>
              Damaged: {summary.DAMAGE || 0} | Lost: {summary.LOSS || 0} | Returned: {summary.RETURN_TO_SUPPLIER || 0} | Found: {summary.FOUND || 0} | Total Events: {totalEvents}
            </div>
          </div>
        </div>

        {/* Printable Data Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '28px' }}>#</th>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '105px' }}>Date / Time</th>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '90px' }}>Part Number</th>
              <th style={{ padding: '5px 4px', textAlign: 'left' }}>Product Name</th>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '85px' }}>Type / Reason</th>
              <th style={{ padding: '5px 4px', textAlign: 'center', width: '50px' }}>Change</th>
              <th style={{ padding: '5px 4px', textAlign: 'center', width: '50px' }}>Balance</th>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '85px' }}>Ref Code</th>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '65px' }}>Staff</th>
              <th style={{ padding: '5px 4px', textAlign: 'left', width: '150px' }}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                  No adjustments found matching filter dates.
                </td>
              </tr>
            ) : (
              adjustments.map((adj, index) => {
                const isPos = Number(adj.quantity_change) > 0;
                return (
                  <tr key={adj.id || index} style={{ borderBottom: '1px solid #dddddd' }}>
                    <td style={{ padding: '4px', color: '#555555' }}>{index + 1}</td>
                    <td style={{ padding: '4px', whiteSpace: 'nowrap' }}>{formatAuditDate(adj.created_at)}</td>
                    <td style={{ padding: '4px', fontWeight: 'bold' }}>{adj.part_number}</td>
                    <td style={{ padding: '4px' }}>{adj.product_name}</td>
                    <td style={{ padding: '4px', fontWeight: '600' }}>{adj.movement_type}</td>
                    <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                      {isPos ? `+${adj.quantity_change}` : adj.quantity_change}
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center', fontWeight: '600' }}>{adj.balance_after}</td>
                    <td style={{ padding: '4px', fontFamily: 'monospace', fontSize: '9px' }}>{adj.reference_no}</td>
                    <td style={{ padding: '4px' }}>{adj.created_by_username || 'system'}</td>
                    <td style={{ padding: '4px', color: '#333333' }}>{adj.remarks || '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Printable Footer & Signatures */}
        <div style={{ marginTop: '28px', paddingTop: '8px', borderTop: '1px solid #000000', display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }}>
          <div style={{ width: '220px' }}>
            <div style={{ borderBottom: '1px solid #000000', height: '32px' }}></div>
            <div style={{ marginTop: '4px', textAlign: 'center', fontWeight: 'bold' }}>
              Prepared By: {user?.username || 'Staff'}
            </div>
            <div style={{ textAlign: 'center', color: '#666666', fontSize: '8.5px' }}>
              Inventory Custodian / Auditor
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
