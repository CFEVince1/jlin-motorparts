import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Truck, Plus, Trash2, CheckCircle, Search, ArrowLeft, Building2, History, Eye, Calendar, Printer, X, FileText, ChevronRight, RefreshCw, Filter, Layers, PackagePlus } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import QuickAddSupplierModal from '../components/QuickAddSupplierModal';

/**
 * StockReceiveScreen Page
 * 
 * Multi-Item Stock Receiving & Receiving History UI:
 * - Tab 1: New Stock Delivery Entry form (Supplier, DR/Invoice #, Driver, Line items matrix).
 * - Tab 2: Complete Stock Receiving History & Audit Log (Filtered by search, supplier, date).
 * - Detailed Batch Modal & Printable Receiving Slip for physical warehouse filing.
 */
export const StockReceiveScreen = () => {
  const [activeTab, setActiveTab] = useState('form'); // 'form' | 'history'
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form Header State
  const [supplierId, setSupplierId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [deliveryPersonnel, setDeliveryPersonnel] = useState('');
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  // Line items matrix
  const [lineItems, setLineItems] = useState([
    { itemId: '', quantity: '', costPrice: '' }
  ]);

  // Receiving History State
  const [receivingHistory, setReceivingHistory] = useState([]);
  const [historySummary, setHistorySummary] = useState({
    total_batches: 0,
    total_units_received: 0,
    total_received_value: 0
  });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historySupplier, setHistorySupplier] = useState('ALL');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');

  // Selected Batch for View Slip Modal
  const [selectedBatch, setSelectedBatch] = useState(null);

  // Load initial catalog & receiving history
  const fetchReceivingHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = {};
      if (historySupplier !== 'ALL') params.supplierId = historySupplier;
      if (historyStartDate) params.startDate = historyStartDate;
      if (historyEndDate) params.endDate = historyEndDate;
      if (historySearch.trim()) params.search = historySearch.trim();

      const res = await api.get('/inventory/receiving-history', { params });
      const raw = res.data;
      const records = Array.isArray(raw) ? raw : (raw?.data || raw?.records || []);
      setReceivingHistory(records);
      if (raw?.summary) {
        setHistorySummary(raw.summary);
      }
    } catch (err) {
      console.error('Failed to load receiving history', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [historySupplier, historyStartDate, historyEndDate, historySearch]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [suppRes, prodRes] = await Promise.all([
          api.get('/suppliers'),
          api.get('/products')
        ]);
        setSuppliers(suppRes.data || []);
        setProducts(prodRes.data || []);
        if (suppRes.data && suppRes.data.length > 0) {
          setSupplierId(suppRes.data[0].id);
        }
      } catch (err) {
        console.error('Failed to load suppliers or products', err);
        toast.error('Failed to load suppliers or products catalog');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    fetchReceivingHistory();
  }, [fetchReceivingHistory]);

  const addRow = () => {
    setLineItems(prev => [...prev, { itemId: '', quantity: '', costPrice: '' }]);
  };

  const removeRow = (index) => {
    if (lineItems.length === 1) {
      toast.error('Receiving record must contain at least one line item');
      return;
    }
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index, field, value) => {
    setLineItems(prev => {
      const next = [...prev];
      let sanitizedValue = value;
      if (field === 'quantity') {
        sanitizedValue = String(value).replace(/[^0-9]/g, '');
        if (sanitizedValue.length > 1 && sanitizedValue.startsWith('0')) {
          sanitizedValue = sanitizedValue.replace(/^0+/, '');
        }
      } else if (field === 'costPrice') {
        sanitizedValue = String(value).replace(/[^0-9.]/g, '');
        const parts = sanitizedValue.split('.');
        if (parts.length > 2) {
          sanitizedValue = parts[0] + '.' + parts.slice(1).join('');
        }
      }
      next[index] = { ...next[index], [field]: sanitizedValue };

      // Auto-populate default cost price when item is selected
      if (field === 'itemId' && value) {
        const selectedProd = products.find(p => String(p.id) === String(value));
        if (selectedProd && (!next[index].costPrice || next[index].costPrice === '')) {
          next[index].costPrice = selectedProd.cost_price || '';
        }
      }
      return next;
    });
  };

  const calculateTotalCost = () => {
    return lineItems.reduce((acc, row) => {
      const qty = Math.max(0, parseInt(row.quantity, 10) || 0);
      const cost = Math.max(0, parseFloat(row.costPrice) || 0);
      return acc + (qty * cost);
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!supplierId) {
      toast.error('Please select a supplier');
      return;
    }

    if (!referenceNo.trim()) {
      toast.error('Supplier Invoice / Delivery Receipt reference number is required');
      return;
    }

    if (!deliveryPersonnel.trim()) {
      toast.error('Delivery personnel / driver name is required');
      return;
    }

    // Validate rows
    const seenItemIds = new Set();
    const formattedItems = [];

    for (let i = 0; i < lineItems.length; i++) {
      const row = lineItems[i];
      if (!row.itemId) {
        toast.error(`Line item #${i + 1} has no product selected`);
        return;
      }
      if (seenItemIds.has(row.itemId)) {
        toast.error(`Product duplicate detected at row #${i + 1}. Consolidate quantities into a single row.`);
        return;
      }
      seenItemIds.add(row.itemId);

      const qty = parseInt(row.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        toast.error(`Invalid quantity at row #${i + 1}. Must be a positive integer.`);
        return;
      }

      const cost = Number(row.costPrice);
      if (isNaN(cost) || cost < 0) {
        toast.error(`Invalid cost price at row #${i + 1}`);
        return;
      }

      formattedItems.push({
        itemId: Number(row.itemId),
        quantity: qty,
        costPrice: cost
      });
    }

    setSubmitting(true);
    try {
      await api.post('/inventory/receive', {
        supplierId: Number(supplierId),
        referenceNo: referenceNo.trim(),
        deliveryPersonnel: deliveryPersonnel.trim(),
        receivedDate,
        items: formattedItems
      });

      toast.success('Stock received and immutable ledger updated successfully!');

      // Reset form
      setReferenceNo('');
      setDeliveryPersonnel('');
      setLineItems([{ itemId: '', quantity: '', costPrice: '' }]);

      // Refresh product stock cache & receiving history log
      const updatedProds = await api.get('/products');
      setProducts(updatedProds.data || []);
      await fetchReceivingHistory();

      // Switch to history tab to immediately show the output log
      setActiveTab('history');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to submit receiving record');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Dynamic Print CSS for Receiving Slip */}
      <style>{`
        #printable-receiving-slip {
          display: none;
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 10mm;
          }
          #root {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
          }
          #printable-receiving-slip,
          #printable-receiving-slip * {
            visibility: visible !important;
          }
          #printable-receiving-slip {
            display: block !important;
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            font-size: 11px !important;
            display: block !important;
            }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Screen Title & Top Navigation Tabs */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Stock Receiving & Delivery Inward</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Receive supplier deliveries into stock, generate purchase slips, and audit all added inventory.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', gap: '8px', background: 'var(--surface-hover)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <button
            type="button"
            className={activeTab === 'form' ? 'btn-primary' : 'btn-secondary'}
            style={{ height: '34px', padding: '0 14px', fontSize: '0.8rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', border: 'none' }}
            onClick={() => setActiveTab('form')}
          >
            <PackagePlus size={15} /> Receive New Stock
          </button>
          <button
            type="button"
            className={activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}
            style={{ height: '34px', padding: '0 14px', fontSize: '0.8rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', border: 'none' }}
            onClick={() => {
              setActiveTab('history');
              fetchReceivingHistory();
            }}
          >
            <History size={15} /> Receiving History ({receivingHistory.length})
          </button>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: RECEIVE NEW STOCK DELIVERY FORM
         ========================================================================= */}
      {activeTab === 'form' && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Form Header Panel */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Truck size={18} style={{ color: 'var(--primary)' }} /> Delivery Header Information
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>
                    Supplier *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddSupplierOpen(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0
                    }}
                  >
                    <Plus size={13} /> Quick Add
                  </button>
                </div>
                <select
                  className="input-premium"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  required
                  disabled={submitting}
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.supplier_name || s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Invoice / DR / OR Reference No. *
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-2026-YAM-019"
                  className="input-premium"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Delivery Personnel / Driver *
                </label>
                <input
                  type="text"
                  placeholder="Driver or courier name"
                  className="input-premium"
                  value={deliveryPersonnel}
                  onChange={(e) => setDeliveryPersonnel(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Delivery Date *
                </label>
                <input
                  type="date"
                  className="input-premium"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          {/* Dynamic Line Items Matrix */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                Received Line Items
              </h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={addRow}
                disabled={submitting}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} /> Add Row
              </button>
            </div>

            <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '45%' }}>Item / Product</th>
                    <th style={{ width: '15%', textAlign: 'center' }}>Quantity</th>
                    <th style={{ width: '20%', textAlign: 'right' }}>Unit Cost (₱)</th>
                    <th style={{ width: '15%', textAlign: 'right' }}>Subtotal</th>
                    <th style={{ width: '5%', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((row, index) => {
                    const qty = Math.max(0, parseInt(row.quantity, 10) || 0);
                    const cost = Math.max(0, parseFloat(row.costPrice) || 0);
                    const rowSubtotal = qty * cost;

                    return (
                      <tr key={index}>
                        <td style={{ padding: '6px 10px' }}>
                          <select
                            className="input-premium"
                            value={row.itemId}
                            onChange={(e) => updateRow(index, 'itemId', e.target.value)}
                            required
                            disabled={submitting}
                          >
                            <option value="">-- Select Product --</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.part_number} - {p.product_name || p.name} ({p.brand || 'No Brand'})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Qty"
                            className="input-premium"
                            style={{ textAlign: 'center' }}
                            value={row.quantity}
                            onKeyDown={(e) => {
                              if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') {
                                e.preventDefault();
                              }
                            }}
                            onChange={(e) => updateRow(index, 'quantity', e.target.value)}
                            required
                            disabled={submitting}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Cost"
                            className="input-premium"
                            style={{ textAlign: 'right' }}
                            value={row.costPrice}
                            onKeyDown={(e) => {
                              if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') {
                                e.preventDefault();
                              }
                            }}
                            onChange={(e) => updateRow(index, 'costPrice', e.target.value)}
                            required
                            disabled={submitting}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>
                          {formatCurrency(rowSubtotal)}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                            disabled={submitting}
                            title="Remove row"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer Summary & Submission */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border)'
            }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Batch Cost:</span>
                <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)', marginLeft: '8px' }}>
                  {formatCurrency(calculateTotalCost())}
                </span>
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ padding: '10px 24px', fontSize: '0.9rem' }}
                disabled={submitting || lineItems.length === 0}
              >
                {submitting ? 'Processing Delivery...' : (
                  <>
                    <CheckCircle size={18} /> Confirm Stock Receiving
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Preview of Recent Deliveries */}
          {receivingHistory.length > 0 && (
            <div className="glass-panel" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={16} style={{ color: 'var(--primary)' }} /> Recent Stock Receivings (Last 3 Deliveries)
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  View Full History ({receivingHistory.length}) <ChevronRight size={14} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                {receivingHistory.slice(0, 3).map(rec => (
                  <div
                    key={rec.id}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'var(--surface-hover)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedBatch(rec)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>{rec.reference_no}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatAuditDate(rec.received_at)}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, marginTop: '2px' }}>{rec.supplier_name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>+{rec.total_quantity} units</span>
                      <strong style={{ color: 'var(--text-main)' }}>{formatCurrency(rec.total_cost)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      )}

      {/* =========================================================================
          TAB 2: STOCK RECEIVING HISTORY & AUDIT LOG
         ========================================================================= */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Summary Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div className="glass-panel" style={{ padding: '16px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Total Delivery Batches
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--primary)', marginTop: '6px' }}>
                {historySummary.total_batches || receivingHistory.length}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Completed supplier receiving orders
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '16px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Total Physical Units Added
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#10b981', marginTop: '6px' }}>
                +{Number(historySummary.total_units_received || receivingHistory.reduce((s, r) => s + Number(r.total_quantity || 0), 0)).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Inward stock ledger increments
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '16px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Total Stock Inward Valuation
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--text-main)', marginTop: '6px' }}>
                {formatCurrency(historySummary.total_received_value || receivingHistory.reduce((s, r) => s + Number(r.total_cost || 0), 0))}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Cumulative delivery invoice costs
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="glass-panel no-print" style={{ padding: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) auto', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Search Reference / Item
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search DR #, product, or supplier..."
                    className="input-premium"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    style={{ paddingRight: historySearch ? '28px' : '12px' }}
                  />
                  {historySearch && (
                    <button
                      type="button"
                      onClick={() => setHistorySearch('')}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Filter Supplier
                </label>
                <select
                  className="input-premium"
                  value={historySupplier}
                  onChange={(e) => setHistorySupplier(e.target.value)}
                >
                  <option value="ALL">All Suppliers</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.supplier_name || s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Start Date
                </label>
                <input
                  type="date"
                  className="input-premium"
                  value={historyStartDate}
                  onChange={(e) => setHistoryStartDate(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  End Date
                </label>
                <input
                  type="date"
                  className="input-premium"
                  value={historyEndDate}
                  onChange={(e) => setHistoryEndDate(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ height: '42px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={fetchReceivingHistory}
                >
                  <Filter size={15} /> Apply
                </button>
                {(historySearch || historySupplier !== 'ALL' || historyStartDate || historyEndDate) && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: '42px', padding: '0 12px' }}
                    onClick={() => {
                      setHistorySearch('');
                      setHistorySupplier('ALL');
                      setHistoryStartDate('');
                      setHistoryEndDate('');
                      setTimeout(() => fetchReceivingHistory(), 50);
                    }}
                    title="Reset filters"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Receiving History Data Table */}
          <div className="glass-panel" style={{ padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                Stock Inward Audit Log ({receivingHistory.length} {receivingHistory.length === 1 ? 'batch' : 'batches'})
              </h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={fetchReceivingHistory}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', padding: '4px 10px' }}
              >
                <RefreshCw size={13} className={loadingHistory ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            <div className="table-container" style={{ border: 'none', borderRadius: '0 0 12px 12px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Reference / DR #</th>
                    <th>Supplier</th>
                    <th>Products Added</th>
                    <th style={{ textAlign: 'center' }}>Units Added</th>
                    <th style={{ textAlign: 'right' }}>Total Cost</th>
                    <th>Received By</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={8} className="table-empty-state">Loading receiving records...</td>
                    </tr>
                  ) : receivingHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="table-empty-state">No stock receiving records found matching filter criteria.</td>
                    </tr>
                  ) : (
                    receivingHistory.map((rec) => (
                      <tr key={rec.id}>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {formatAuditDate(rec.received_at || rec.created_at)}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'monospace' }}>
                          {rec.reference_no}
                        </td>
                        <td style={{ fontWeight: 500 }}>
                          {rec.supplier_name}
                        </td>
                        <td style={{ fontSize: '0.8rem', maxWidth: '320px', color: 'var(--text-main)' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rec.items_summary}>
                            {rec.items_summary || `${rec.items_count || 1} line item(s)`}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#10b981' }}>
                          +{rec.total_quantity}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                          {formatCurrency(rec.total_cost)}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {rec.received_by_username || 'admin'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setSelectedBatch(rec)}
                            style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={13} /> View Slip
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          BATCH DETAILS & RECEIVING SLIP MODAL
         ========================================================================= */}
      {selectedBatch && (
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
          onClick={() => setSelectedBatch(null)}
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
                  <FileText size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                    Stock Receiving Slip • {selectedBatch.reference_no}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Supplier Delivery Voucher & Inventory Inward Audit
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedBatch(null)}
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

            {/* Delivery Meta Information */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                background: 'var(--surface)',
                fontSize: '0.8rem'
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Supplier:</span>
                <strong style={{ fontSize: '0.9rem' }}>{selectedBatch.supplier_name}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Invoice / DR Reference:</span>
                <strong style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{selectedBatch.reference_no}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Date Received:</span>
                <strong>{formatAuditDate(selectedBatch.received_at)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Receiver Staff:</span>
                <strong>{selectedBatch.received_by_username || 'admin'}</strong>
              </div>
            </div>

            {/* Line Items List */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Part Number</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Product Name</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Brand | Size</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Qty Added</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedBatch.items || []).map((it, idx) => (
                    <tr key={it.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{it.part_number}</td>
                      <td style={{ padding: '8px 10px' }}>{it.product_name}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {it.brand || '-'} {it.size ? `| ${it.size}` : ''}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold', color: '#10b981' }}>
                        +{it.quantity}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {formatCurrency(it.cost_price)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(it.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                    <td colSpan={4} style={{ padding: '12px 10px', textAlign: 'right' }}>
                      TOTAL RECEIVED ({selectedBatch.total_quantity} units):
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: '#10b981' }}>
                      +{selectedBatch.total_quantity}
                    </td>
                    <td></td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: 'var(--primary)', fontSize: '1rem' }}>
                      {formatCurrency(selectedBatch.total_cost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Modal Actions */}
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
              <button className="btn-secondary" onClick={() => setSelectedBatch(null)}>
                Close
              </button>
              <button
                className="btn-primary"
                onClick={handlePrintSlip}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Printer size={16} /> Print Receiving Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PRINTABLE RECEIVING SLIP (Rendered via portal into body to eliminate page height inheritance)
         ========================================================================= */}
      {selectedBatch && typeof document !== 'undefined' && createPortal(
        <div id="printable-receiving-slip" className="report-paper-sheet" style={{ color: '#000000' }}>
          {/* Slip Header */}
          <div style={{ borderBottom: '2px solid #000000', paddingBottom: '10px', marginBottom: '14px', color: '#000000' }}>
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
                  <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#000000' }}>
                    JLIN MOTO PARTS & ACCESSORIES
                  </h1>
                  <div style={{ fontSize: '11px', color: '#222222', fontWeight: 600 }}>
                    Warehouse Stock Receiving Slip & Purchase Voucher
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '10px', color: '#333333' }}>
                <div><strong>Delivery Ref / DR:</strong> {selectedBatch.reference_no}</div>
                <div><strong>Date Received:</strong> {formatAuditDate(selectedBatch.received_at)}</div>
              </div>
            </div>

            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #666666', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
              <div><strong>Supplier:</strong> {selectedBatch.supplier_name}</div>
              <div><strong>Received By:</strong> {selectedBatch.received_by_username || 'admin'}</div>
            </div>
          </div>

          {/* Slip Line Items Table */}
          <table className="report-paper-sheet" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', color: '#000000' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
                <th style={{ padding: '6px 4px', textAlign: 'left', width: '30px' }}>#</th>
                <th style={{ padding: '6px 4px', textAlign: 'left', width: '110px' }}>Part Number</th>
                <th style={{ padding: '6px 4px', textAlign: 'left' }}>Product Name</th>
                <th style={{ padding: '6px 4px', textAlign: 'left', width: '100px' }}>Brand / Size</th>
                <th style={{ padding: '6px 4px', textAlign: 'center', width: '60px' }}>Qty Added</th>
                <th style={{ padding: '6px 4px', textAlign: 'right', width: '85px' }}>Unit Cost</th>
                <th style={{ padding: '6px 4px', textAlign: 'right', width: '95px' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(selectedBatch.items || []).map((it, idx) => (
                <tr key={it.id || idx} style={{ borderBottom: '1px solid #dddddd' }}>
                  <td style={{ padding: '5px 4px', color: '#555555' }}>{idx + 1}</td>
                  <td style={{ padding: '5px 4px', fontWeight: 'bold' }}>{it.part_number}</td>
                  <td style={{ padding: '5px 4px' }}>{it.product_name}</td>
                  <td style={{ padding: '5px 4px' }}>{it.brand || '-'} {it.size ? `| ${it.size}` : ''}</td>
                  <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 'bold' }}>+{it.quantity}</td>
                  <td style={{ padding: '5px 4px', textAlign: 'right' }}>{formatCurrency(it.cost_price)}</td>
                  <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #000000', background: '#f9f9f9', fontWeight: 'bold' }}>
                <td colSpan={4} style={{ padding: '8px 4px', textAlign: 'right' }}>
                  TOTAL RECEIVED ({selectedBatch.total_quantity} units):
                </td>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>+{selectedBatch.total_quantity}</td>
                <td></td>
                <td style={{ padding: '8px 4px', textAlign: 'right', fontSize: '11px' }}>
                  {formatCurrency(selectedBatch.total_cost)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures Footer */}
          <div style={{ marginTop: '35px', paddingTop: '10px', borderTop: '1px solid #000000', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <div style={{ width: '220px' }}>
              <div style={{ borderBottom: '1px solid #000000', height: '35px' }}></div>
              <div style={{ marginTop: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                Delivered By: ___________________
              </div>
              <div style={{ textAlign: 'center', color: '#666666', fontSize: '9px' }}>
                Supplier Driver / Courier
              </div>
            </div>

            <div style={{ width: '220px' }}>
              <div style={{ borderBottom: '1px solid #000000', height: '35px' }}></div>
              <div style={{ marginTop: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                Received & Inspected By: {selectedBatch.received_by_username || 'admin'}
              </div>
              <div style={{ textAlign: 'center', color: '#666666', fontSize: '9px' }}>
                Warehouse Custodian / Staff
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Quick Add Supplier Modal */}
      <QuickAddSupplierModal
        isOpen={isAddSupplierOpen}
        onClose={() => setIsAddSupplierOpen(false)}
        onSupplierCreated={(newSupplier) => {
          setSuppliers(prev => [newSupplier, ...prev]);
          setSupplierId(newSupplier.id);
        }}
      />
    </div>
  );
};

export default StockReceiveScreen;
