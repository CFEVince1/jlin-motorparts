import React, { useState, useEffect, useMemo } from 'react';
import { AlertOctagon, Printer, Filter, Calendar, RefreshCw, ArrowDownRight, ArrowUpRight, Search, RotateCcw, X, Layers } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import PrintAdjustmentsReportModal from '../components/PrintAdjustmentsReportModal';

/**
 * Helper to compute local date in YYYY-MM-DD without UTC timezone drift.
 */
const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * AdjustmentsReport Page
 * 
 * Non-Sales Inventory Discrepancy & Adjustment Report:
 * - Date range filter (startDate, endDate) & movement type selector.
 * - Quick period buttons: All Time, Daily, Weekly, Monthly.
 * - Search filter for part number, product name, ref code, staff, remarks.
 * - Interactive summary KPI cards: Total Damaged, Total Lost, Total Returned to Supplier, Total Found.
 * - Full A4 printable audit report modal.
 */
export const AdjustmentsReport = () => {
  const [data, setData] = useState({
    summary: { DAMAGE: 0, LOSS: 0, RETURN_TO_SUPPLIER: 0, FOUND: 0 },
    adjustments: []
  });
  const [loading, setLoading] = useState(true);

  // Period preset: 'all' | 'daily' | 'weekly' | 'monthly' | 'custom'
  const [period, setPeriod] = useState('all');

  // Date Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Print modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || { username: 'admin', role: 'admin' };
    } catch {
      return { username: 'admin', role: 'admin' };
    }
  })();

  const fetchReport = async (overrideStart = startDate, overrideEnd = endDate, overrideType = selectedType) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (overrideStart) params.append('startDate', overrideStart);
      if (overrideEnd) params.append('endDate', overrideEnd);
      if (overrideType && overrideType !== 'ALL') params.append('movementType', overrideType);

      const res = await api.get(`/reports/adjustments?${params.toString()}`);
      const raw = res.data;
      const adjustmentsList = Array.isArray(raw) ? raw : (raw?.adjustments || []);
      const summaryObj = (raw && !Array.isArray(raw) && raw.summary) ? raw.summary : {};

      const normalizedSummary = {
        DAMAGE: summaryObj.DAMAGE ?? adjustmentsList.filter(a => (a.movement_type || a.transaction_type) === 'DAMAGE').reduce((s, a) => s + Math.abs(Number(a.quantity_change || a.quantity || 0)), 0),
        LOSS: summaryObj.LOSS ?? adjustmentsList.filter(a => (a.movement_type || a.transaction_type) === 'LOSS').reduce((s, a) => s + Math.abs(Number(a.quantity_change || a.quantity || 0)), 0),
        RETURN_TO_SUPPLIER: summaryObj.RETURN_TO_SUPPLIER ?? adjustmentsList.filter(a => (a.movement_type || a.transaction_type) === 'RETURN_TO_SUPPLIER').reduce((s, a) => s + Math.abs(Number(a.quantity_change || a.quantity || 0)), 0),
        FOUND: summaryObj.FOUND ?? adjustmentsList.filter(a => (a.movement_type || a.transaction_type) === 'FOUND').reduce((s, a) => s + Math.abs(Number(a.quantity_change || a.quantity || 0)), 0),
      };

      setData({
        summary: normalizedSummary,
        adjustments: adjustmentsList.map(a => ({
          ...a,
          movement_type: a.movement_type || a.transaction_type || 'ADJUSTMENT'
        }))
      });
    } catch (err) {
      console.error('Failed to load adjustments report', err);
      toast.error('Failed to load adjustments audit report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handlePeriodSelect = (selectedPeriod) => {
    setPeriod(selectedPeriod);
    const now = new Date();
    let newStart = '';
    let newEnd = '';

    if (selectedPeriod === 'daily') {
      const todayStr = getLocalDateString(now);
      newStart = todayStr;
      newEnd = todayStr;
    } else if (selectedPeriod === 'weekly') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 6);
      newStart = getLocalDateString(weekStart);
      newEnd = getLocalDateString(now);
    } else if (selectedPeriod === 'monthly') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      newStart = getLocalDateString(monthStart);
      newEnd = getLocalDateString(now);
    } else if (selectedPeriod === 'all') {
      newStart = '';
      newEnd = '';
    }

    setStartDate(newStart);
    setEndDate(newEnd);
    fetchReport(newStart, newEnd, selectedType);
  };

  const handleTypeSelect = (newType) => {
    setSelectedType(newType);
    fetchReport(startDate, endDate, newType);
  };

  const handleResetFilters = () => {
    setPeriod('all');
    setStartDate('');
    setEndDate('');
    setSelectedType('ALL');
    setSearchTerm('');
    fetchReport('', '', 'ALL');
  };

  const toggleCardType = (typeKey) => {
    if (selectedType === typeKey) {
      handleTypeSelect('ALL');
    } else {
      handleTypeSelect(typeKey);
    }
  };

  // Client-side search filtering
  const filteredAdjustments = useMemo(() => {
    if (!searchTerm.trim()) return data.adjustments || [];
    const q = searchTerm.toLowerCase().trim();
    return (data.adjustments || []).filter(adj =>
      (adj.part_number && adj.part_number.toLowerCase().includes(q)) ||
      (adj.product_name && adj.product_name.toLowerCase().includes(q)) ||
      (adj.reference_no && adj.reference_no.toLowerCase().includes(q)) ||
      (adj.created_by_username && adj.created_by_username.toLowerCase().includes(q)) ||
      (adj.remarks && adj.remarks.toLowerCase().includes(q))
    );
  }, [data.adjustments, searchTerm]);

  const getMovementColor = (type) => {
    switch (type) {
      case 'FOUND':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.4)' };
      case 'DAMAGE':
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.4)' };
      case 'LOSS':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.4)' };
      case 'RETURN_TO_SUPPLIER':
        return { bg: 'rgba(55, 65, 81, 0.15)', text: '#374151', border: 'rgba(55, 65, 81, 0.4)' };
      default:
        return { bg: 'var(--surface-hover)', text: 'var(--text-main)', border: 'var(--border)' };
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Inventory Discrepancy & Adjustment Audit</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Audit log of all non-sales stock movements: damages, shrinkage/losses, returns, and recovered stock.
          </p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={() => fetchReport()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Refresh current records">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn-primary" onClick={() => setShowPrintModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Open official printable audit report">
            <Printer size={16} /> Print Report
          </button>
        </div>
      </div>

      {/* KPI Cards (Click to quick-filter by type) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div
          className="glass-panel"
          style={{
            padding: '16px',
            cursor: 'pointer',
            border: selectedType === 'DAMAGE' ? '2px solid #f59e0b' : '1px solid var(--border)',
            background: selectedType === 'DAMAGE' ? 'rgba(245, 158, 11, 0.08)' : 'var(--surface)',
            transition: 'all 0.2s ease'
          }}
          onClick={() => toggleCardType('DAMAGE')}
          title="Click to filter by Damage"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Total Damaged Units
            </span>
            {selectedType === 'DAMAGE' && (
              <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: '#f59e0b', color: '#000', fontWeight: 700 }}>
                ACTIVE FILTER
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#f59e0b', marginTop: '6px' }}>
            {data.summary?.DAMAGE || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Defective or broken in storage
          </div>
        </div>

        <div
          className="glass-panel"
          style={{
            padding: '16px',
            cursor: 'pointer',
            border: selectedType === 'LOSS' ? '2px solid #ef4444' : '1px solid var(--border)',
            background: selectedType === 'LOSS' ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface)',
            transition: 'all 0.2s ease'
          }}
          onClick={() => toggleCardType('LOSS')}
          title="Click to filter by Loss"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Total Lost (Shrinkage)
            </span>
            {selectedType === 'LOSS' && (
              <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: '#ef4444', color: '#fff', fontWeight: 700 }}>
                ACTIVE FILTER
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#ef4444', marginTop: '6px' }}>
            {data.summary?.LOSS || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Unaccounted physical losses
          </div>
        </div>

        <div
          className="glass-panel"
          style={{
            padding: '16px',
            cursor: 'pointer',
            border: selectedType === 'RETURN_TO_SUPPLIER' ? '2px solid #374151' : '1px solid var(--border)',
            background: selectedType === 'RETURN_TO_SUPPLIER' ? 'rgba(55, 65, 81, 0.08)' : 'var(--surface)',
            transition: 'all 0.2s ease'
          }}
          onClick={() => toggleCardType('RETURN_TO_SUPPLIER')}
          title="Click to filter by Return to Supplier"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Returned to Supplier
            </span>
            {selectedType === 'RETURN_TO_SUPPLIER' && (
              <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: '#374151', color: '#fff', fontWeight: 700 }}>
                ACTIVE FILTER
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#374151', marginTop: '6px' }}>
            {data.summary?.RETURN_TO_SUPPLIER || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            RMA & supplier warranty returns
          </div>
        </div>

        <div
          className="glass-panel"
          style={{
            padding: '16px',
            cursor: 'pointer',
            border: selectedType === 'FOUND' ? '2px solid #10b981' : '1px solid var(--border)',
            background: selectedType === 'FOUND' ? 'rgba(16, 185, 129, 0.08)' : 'var(--surface)',
            transition: 'all 0.2s ease'
          }}
          onClick={() => toggleCardType('FOUND')}
          title="Click to filter by Found / Recovered"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Recovered / Found
            </span>
            {selectedType === 'FOUND' && (
              <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: '#10b981', color: '#000', fontWeight: 700 }}>
                ACTIVE FILTER
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#10b981', marginTop: '6px' }}>
            {data.summary?.FOUND || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Restored from prior loss entries
          </div>
        </div>
      </div>

      {/* Filter Control Center */}
      <div className="glass-panel no-print" style={{ padding: '16px' }}>
        {/* Preset Period Buttons Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '4px' }}>
              Time Period:
            </span>
            <button
              type="button"
              className={period === 'all' ? 'btn-primary' : 'btn-secondary'}
              style={{ height: '30px', padding: '0 12px', fontSize: '0.75rem', borderRadius: '6px', fontWeight: period === 'all' ? 600 : 500 }}
              onClick={() => handlePeriodSelect('all')}
            >
              All Time
            </button>
            <button
              type="button"
              className={period === 'daily' ? 'btn-primary' : 'btn-secondary'}
              style={{ height: '30px', padding: '0 12px', fontSize: '0.75rem', borderRadius: '6px', fontWeight: period === 'daily' ? 600 : 500 }}
              onClick={() => handlePeriodSelect('daily')}
            >
              Daily
            </button>
            <button
              type="button"
              className={period === 'weekly' ? 'btn-primary' : 'btn-secondary'}
              style={{ height: '30px', padding: '0 12px', fontSize: '0.75rem', borderRadius: '6px', fontWeight: period === 'weekly' ? 600 : 500 }}
              onClick={() => handlePeriodSelect('weekly')}
            >
              Weekly
            </button>
            <button
              type="button"
              className={period === 'monthly' ? 'btn-primary' : 'btn-secondary'}
              style={{ height: '30px', padding: '0 12px', fontSize: '0.75rem', borderRadius: '6px', fontWeight: period === 'monthly' ? 600 : 500 }}
              onClick={() => handlePeriodSelect('monthly')}
            >
              Monthly
            </button>
          </div>

          {(startDate || endDate || selectedType !== 'ALL' || searchTerm) && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResetFilters}
              style={{ height: '30px', padding: '0 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}
              title="Reset all filters to defaults"
            >
              <RotateCcw size={13} /> Reset Filters
            </button>
          )}
        </div>

        {/* Detailed Filter Inputs Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr)) 100px', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Start Date
            </label>
            <input
              type="date"
              className="input-premium"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriod('custom');
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              End Date
            </label>
            <input
              type="date"
              className="input-premium"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriod('custom');
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Movement Type
            </label>
            <select
              className="input-premium"
              value={selectedType}
              onChange={(e) => handleTypeSelect(e.target.value)}
            >
              <option value="ALL">All Types</option>
              <option value="DAMAGE">DAMAGE</option>
              <option value="LOSS">LOSS</option>
              <option value="RETURN_TO_SUPPLIER">RETURN_TO_SUPPLIER</option>
              <option value="FOUND">FOUND</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Search Filter
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="input-premium"
                placeholder="Part, Name, Ref..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingRight: searchTerm ? '28px' : '12px' }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div>
            <button
              className="btn-primary"
              style={{ width: '100%', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => fetchReport(startDate, endDate, selectedType)}
            >
              <Filter size={14} /> Apply
            </button>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="glass-panel" style={{ padding: '0' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              Audit Discrepancy Log ({filteredAdjustments.length} {filteredAdjustments.length === 1 ? 'event' : 'events'})
            </h3>
            {searchTerm && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Filtered from {data.adjustments?.length || 0} total records
              </span>
            )}
          </div>

          {selectedType !== 'ALL' && (
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: '6px',
              background: getMovementColor(selectedType).bg,
              color: getMovementColor(selectedType).text,
              border: `1px solid ${getMovementColor(selectedType).border}`
            }}>
              Filtered by: {selectedType}
            </span>
          )}
        </div>

        <div className="table-container" style={{ border: 'none', borderRadius: '0 0 12px 12px' }}>
          <table>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Part Number</th>
                <th>Product Name</th>
                <th>Reason / Type</th>
                <th style={{ textAlign: 'center' }}>Change</th>
                <th style={{ textAlign: 'center' }}>Balance After</th>
                <th>Reference Code</th>
                <th>Staff</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="table-empty-state">Loading discrepancy records...</td>
                </tr>
              ) : (!filteredAdjustments || filteredAdjustments.length === 0) ? (
                <tr>
                  <td colSpan={9} className="table-empty-state">No adjustments found matching filter criteria.</td>
                </tr>
              ) : (
                filteredAdjustments.map((adj) => {
                  const style = getMovementColor(adj.movement_type);
                  const isPositive = Number(adj.quantity_change) > 0;

                  return (
                    <tr key={adj.id}>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatAuditDate(adj.created_at)}
                      </td>
                      <td style={{ fontWeight: '600', color: 'var(--text-muted)' }}>
                        {adj.part_number}
                      </td>
                      <td style={{ fontWeight: '500' }}>
                        {adj.product_name}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: style.bg,
                          color: style.text,
                          border: `1px solid ${style.border}`
                        }}>
                          {adj.movement_type}
                        </span>
                      </td>
                      <td style={{
                        textAlign: 'center',
                        fontWeight: 'bold',
                        color: isPositive ? 'var(--success)' : 'var(--danger)'
                      }}>
                        {isPositive ? `+${adj.quantity_change}` : adj.quantity_change}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        {adj.balance_after}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {adj.reference_no}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {adj.created_by_username || 'system'}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '240px' }}>
                        {adj.remarks || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Official Print Preview Modal */}
      <PrintAdjustmentsReportModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        adjustments={filteredAdjustments}
        summary={data.summary}
        filters={{
          startDate,
          endDate,
          selectedType,
          search: searchTerm
        }}
        user={user}
      />
    </div>
  );
};

export default AdjustmentsReport;
