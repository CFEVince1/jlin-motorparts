import React, { useState, useEffect } from 'react';
import { AlertOctagon, Printer, Filter, Calendar, RefreshCw, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

/**
 * AdjustmentsReport Page
 * 
 * Non-Sales Inventory Discrepancy & Adjustment Report:
 * - Date range filter (startDate, endDate) & movement type selector.
 * - Summary KPI cards: Total Damaged, Total Lost, Total Returned to Supplier, Total Found.
 * - Detailed audit table with printable layout.
 */
export const AdjustmentsReport = () => {
  const [data, setData] = useState({
    summary: { DAMAGE: 0, LOSS: 0, RETURN_TO_SUPPLIER: 0, FOUND: 0 },
    adjustments: []
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedType, setSelectedType] = useState('ALL');

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedType !== 'ALL') params.append('movementType', selectedType);

      const res = await api.get(`/reports/adjustments?${params.toString()}`);
      setData(res.data || { summary: {}, adjustments: [] });
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

  const handlePrint = () => {
    window.print();
  };

  const getMovementColor = (type) => {
    switch (type) {
      case 'FOUND':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.4)' };
      case 'DAMAGE':
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.4)' };
      case 'LOSS':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.4)' };
      case 'RETURN_TO_SUPPLIER':
        return { bg: 'rgba(99, 102, 241, 0.15)', text: '#6366f1', border: 'rgba(99, 102, 241, 0.4)' };
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
          <button className="btn-secondary" onClick={fetchReport} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Printer size={16} /> Print Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Total Damaged Units
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#f59e0b', marginTop: '6px' }}>
            {data.summary?.DAMAGE || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Defective or broken in storage</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Total Lost (Shrinkage)
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#ef4444', marginTop: '6px' }}>
            {data.summary?.LOSS || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Unaccounted physical losses</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Returned to Supplier
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#6366f1', marginTop: '6px' }}>
            {data.summary?.RETURN_TO_SUPPLIER || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>RMA & supplier warranty returns</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Recovered / Found
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#10b981', marginTop: '6px' }}>
            {data.summary?.FOUND || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Restored from prior loss entries</div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="glass-panel no-print" style={{ padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) 120px', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Start Date
            </label>
            <input
              type="date"
              className="input-premium"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
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
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Movement Type
            </label>
            <select
              className="input-premium"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="ALL">All Types</option>
              <option value="DAMAGE">DAMAGE</option>
              <option value="LOSS">LOSS</option>
              <option value="RETURN_TO_SUPPLIER">RETURN_TO_SUPPLIER</option>
              <option value="FOUND">FOUND</option>
            </select>
          </div>

          <div>
            <button
              className="btn-primary"
              style={{ width: '100%', height: '36px' }}
              onClick={fetchReport}
            >
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="glass-panel" style={{ padding: '0' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            Audit Discrepancy Log ({data.adjustments?.length || 0} events)
          </h3>
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
              ) : data.adjustments?.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-empty-state">No adjustments found matching filter dates.</td>
                </tr>
              ) : (
                data.adjustments.map((adj) => {
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
    </div>
  );
};

export default AdjustmentsReport;
