import React, { useState, useMemo } from 'react';
import {
  ClipboardList,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Search,
  CheckSquare,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Layers,
  Save,
  Filter
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatters';

const PhysicalInventoryAudit = ({ products = [], onAuditCompleted }) => {
  const [counts, setCounts] = useState({});
  const [notes, setNotes] = useState('');
  const [auditTitle, setAuditTitle] = useState(() => {
    const today = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Physical Shelf Count - ${today}`;
  });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [filterDiscrepanciesOnly, setFilterDiscrepanciesOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(products.map(p => p.category).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [products]);

  // Handle count change for a product
  const handleCountChange = (productId, val) => {
    if (val === '') {
      setCounts(prev => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      return;
    }
    const num = Math.max(0, parseInt(val, 10) || 0);
    setCounts(prev => ({ ...prev, [productId]: num }));
  };

  // Match all visible to expected
  const handleMatchAllToExpected = () => {
    const next = { ...counts };
    for (const p of products) {
      const sysStock = Number(p.stock ?? p.current_stock ?? 0);
      next[p.id] = sysStock;
    }
    setCounts(next);
    toast.success('All items set to match expected system stock');
  };

  // Clear all counts
  const handleClearCounts = () => {
    if (Object.keys(counts).length === 0) return;
    if (window.confirm('Clear all entered physical counts?')) {
      setCounts({});
    }
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const pName = (p.product_name || p.name || '').toLowerCase();
      const pSku = (p.part_number || p.sku || '').toLowerCase();
      const pBrand = (p.brand || '').toLowerCase();
      const s = search.toLowerCase();

      const matchesSearch = !search || pName.includes(s) || pSku.includes(s) || pBrand.includes(s);
      const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;

      if (!matchesSearch || !matchesCategory) return false;

      if (filterDiscrepanciesOnly) {
        const sysStock = Number(p.stock ?? p.current_stock ?? 0);
        const actualCount = counts[p.id];
        if (actualCount === undefined) return false;
        return actualCount !== sysStock;
      }

      return true;
    });
  }, [products, search, categoryFilter, filterDiscrepanciesOnly, counts]);

  // Audit Calculations
  const auditMetrics = useMemo(() => {
    let totalExpected = 0;
    let totalCounted = 0;
    let countedItemsCount = 0;
    let discrepanciesCount = 0;
    let missingUnits = 0;
    let surplusUnits = 0;
    let financialImpact = 0;

    for (const p of products) {
      const sysStock = Number(p.stock ?? p.current_stock ?? 0);
      totalExpected += sysStock;

      if (counts[p.id] !== undefined) {
        const actual = counts[p.id];
        totalCounted += actual;
        countedItemsCount++;

        const diff = actual - sysStock;
        if (diff !== 0) {
          discrepanciesCount++;
          const cost = Number(p.cost_price || 0);
          financialImpact += (diff * cost);
          if (diff < 0) missingUnits += Math.abs(diff);
          else surplusUnits += diff;
        }
      }
    }

    return {
      totalExpected,
      totalCounted,
      countedItemsCount,
      discrepanciesCount,
      missingUnits,
      surplusUnits,
      financialImpact
    };
  }, [products, counts]);

  // Submit physical count adjustments
  const handleSubmitAudit = async () => {
    const itemsToPost = [];
    for (const [pIdStr, actualCount] of Object.entries(counts)) {
      const pId = Number(pIdStr);
      const prod = products.find(p => p.id === pId);
      if (!prod) continue;
      const sysStock = Number(prod.stock ?? prod.current_stock ?? 0);
      if (actualCount !== sysStock) {
        itemsToPost.push({
          product_id: pId,
          counted_stock: actualCount,
          system_stock: sysStock,
          reason: `Discrepancy: Expected ${sysStock}, Counted ${actualCount}`
        });
      }
    }

    if (itemsToPost.length === 0) {
      if (auditMetrics.countedItemsCount === 0) {
        toast.error('Please enter physical counts for at least one item');
        return;
      }
      toast.success('All counted items perfectly match system stock! No adjustments needed.');
      return;
    }

    const confirmMsg = `Post physical count adjustments for ${itemsToPost.length} discrepancy items? Total financial impact: ${formatCurrency(auditMetrics.financialImpact)}`;
    if (!window.confirm(confirmMsg)) return;

    setSubmitting(true);
    try {
      const res = await api.post('/inventory/physical-audit', {
        audit_title: auditTitle,
        notes: notes.trim(),
        items: itemsToPost
      });

      toast.success(res.data?.message || 'Physical audit adjustments posted successfully!');
      setCounts({});
      if (onAuditCompleted) onAuditCompleted();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to post physical count adjustments');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div className="glass-panel" style={{
        padding: '18px 22px',
        borderRadius: '12px',
        background: 'rgba(56, 189, 248, 0.04)',
        border: '1.5px solid rgba(56, 189, 248, 0.25)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(56, 189, 248, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8'
          }}>
            <ClipboardList size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Physical Stock Count & Shelf Audit
            </div>
            <div style={{ fontSize: '0.80rem', color: 'var(--text-muted)' }}>
              Conduct weekly or monthly shelf counts. Enter physical quantities to auto-calculate missing / surplus variances and post adjustments.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleMatchAllToExpected}
            style={{ fontSize: '0.82rem', height: '36px', padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title="Pre-fill all items with current system stock"
          >
            <CheckSquare size={14} /> Match All to System
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleClearCounts}
            style={{ fontSize: '0.82rem', height: '36px', padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title="Clear all count inputs"
          >
            <RotateCcw size={14} /> Clear
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmitAudit}
            disabled={submitting}
            style={{
              fontSize: '0.84rem',
              height: '36px',
              padding: '0 18px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
            }}
          >
            <Save size={15} /> {submitting ? 'Posting...' : 'Post Adjustments'}
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Items Counted</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '3px' }}>
            {auditMetrics.countedItemsCount} <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ {products.length}</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {Math.round((auditMetrics.countedItemsCount / (products.length || 1)) * 100)}% shelf coverage
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>System vs Counted Units</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '3px' }}>
            {auditMetrics.totalCounted} <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>units</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            System expected: {auditMetrics.totalExpected}
          </div>
        </div>

        <div className="glass-panel" style={{
          padding: '14px 16px',
          borderRadius: '10px',
          border: auditMetrics.discrepanciesCount > 0 ? '1px solid #f59e0b' : '1px solid var(--border)'
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Discrepant Items</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: auditMetrics.discrepanciesCount > 0 ? '#f59e0b' : '#10b981', marginTop: '3px' }}>
            {auditMetrics.discrepanciesCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            -{auditMetrics.missingUnits} missing • +{auditMetrics.surplusUnits} surplus
          </div>
        </div>

        <div className="glass-panel" style={{
          padding: '14px 16px',
          borderRadius: '10px',
          border: auditMetrics.financialImpact < 0 ? '1px solid #ef4444' : (auditMetrics.financialImpact > 0 ? '1px solid #10b981' : '1px solid var(--border)')
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Cost Variance</div>
          <div style={{
            fontSize: '1.35rem',
            fontWeight: 700,
            color: auditMetrics.financialImpact < 0 ? '#ef4444' : (auditMetrics.financialImpact > 0 ? '#10b981' : 'var(--text-main)'),
            marginTop: '3px'
          }}>
            {formatCurrency(auditMetrics.financialImpact)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Puhunan impact on store profit
          </div>
        </div>
      </div>

      {/* Filter and Audit Session Details Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              AUDIT SESSION TITLE
            </label>
            <input
              type="text"
              className="input-premium"
              value={auditTitle}
              onChange={(e) => setAuditTitle(e.target.value)}
              style={{ width: '100%', height: '36px', fontSize: '0.84rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              SEARCH PART OR SKU
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search motorpart, SKU, brand..."
                className="input-premium"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '32px', width: '100%', height: '36px', fontSize: '0.84rem' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              CATEGORY FILTER
            </label>
            <select
              className="input-premium"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ width: '100%', height: '36px', fontSize: '0.84rem' }}
            >
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div style={{ paddingTop: '18px' }}>
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: filterDiscrepanciesOnly ? '#f59e0b' : 'var(--text-muted)'
            }}>
              <input
                type="checkbox"
                checked={filterDiscrepanciesOnly}
                onChange={(e) => setFilterDiscrepanciesOnly(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#f59e0b' }}
              />
              <span>Show Discrepancies Only</span>
            </label>
          </div>
        </div>

        {/* Shelf Count Table */}
        <div className="table-container" style={{ marginTop: '16px', overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: '110px' }}>Item Code / SKU</th>
                <th style={{ minWidth: '220px' }}>Product & Brand</th>
                <th style={{ textAlign: 'center', minWidth: '110px' }}>System Stock</th>
                <th style={{ textAlign: 'center', minWidth: '130px' }}>Actual Physical Count</th>
                <th style={{ textAlign: 'center', minWidth: '110px' }}>Variance</th>
                <th style={{ textAlign: 'right', minWidth: '110px' }}>Unit Cost</th>
                <th style={{ textAlign: 'right', minWidth: '120px' }}>Variance Value</th>
                <th style={{ textAlign: 'center', minWidth: '80px' }}>Quick Match</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const sysStock = Number(p.stock ?? p.current_stock ?? 0);
                const hasEnteredCount = counts[p.id] !== undefined;
                const actualCount = hasEnteredCount ? counts[p.id] : '';
                const diff = hasEnteredCount ? (counts[p.id] - sysStock) : 0;
                const unitCost = Number(p.cost_price || 0);
                const varianceCost = diff * unitCost;

                return (
                  <tr key={p.id} style={{
                    background: hasEnteredCount && diff !== 0 ? 'rgba(245, 158, 11, 0.04)' : undefined
                  }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)' }}>
                      {p.part_number || p.sku}
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.product_name || p.name}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        {p.brand || 'Generic'} • {p.category || 'Motorcycle Part'}
                      </div>
                    </td>

                    <td style={{ textAlign: 'center', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {sysStock}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        placeholder="Count"
                        value={actualCount}
                        onChange={(e) => handleCountChange(p.id, e.target.value)}
                        className="input-premium"
                        style={{
                          width: '90px',
                          textAlign: 'center',
                          height: '32px',
                          fontWeight: 700,
                          fontSize: '0.90rem',
                          borderColor: hasEnteredCount && diff !== 0 ? '#f59e0b' : undefined
                        }}
                      />
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      {!hasEnteredCount ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Uncounted</span>
                      ) : diff === 0 ? (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.3)'
                        }}>
                          Balanced (0)
                        </span>
                      ) : diff < 0 ? (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)'
                        }}>
                          {diff} Missing
                        </span>
                      ) : (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)'
                        }}>
                          +{diff} Surplus
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {unitCost > 0 ? formatCurrency(unitCost) : '—'}
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.84rem' }}>
                      {!hasEnteredCount || diff === 0 ? (
                        <span style={{ color: 'var(--text-muted)' }}>₱0.00</span>
                      ) : (
                        <span style={{ color: varianceCost < 0 ? '#ef4444' : '#10b981' }}>
                          {varianceCost > 0 ? '+' : ''}{formatCurrency(varianceCost)}
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleCountChange(p.id, sysStock)}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                        title="Set actual count equal to system stock"
                      >
                        = Match
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PhysicalInventoryAudit;
