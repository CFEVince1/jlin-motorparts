import React, { useState, useEffect } from 'react';
import { Truck, Plus, Trash2, CheckCircle, Search, ArrowLeft, Building2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatters';
import QuickAddSupplierModal from '../components/QuickAddSupplierModal';

/**
 * StockReceiveScreen Page
 * 
 * Multi-Item Stock Receiving UI:
 * - Header: Supplier selector dropdown, reference/OR input, delivery personnel input, received date.
 * - Line Items Matrix: Dynamic table with Add Row & Remove Row (Item select, quantity, cost price).
 * - Client Validation: Enforce unique items per receipt and positive quantities.
 * - Submits atomically to POST /api/inventory/receive.
 */
export const StockReceiveScreen = () => {
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
  }, []);

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
      next[index] = { ...next[index], [field]: value };

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
      const qty = Number(row.quantity) || 0;
      const cost = Number(row.costPrice) || 0;
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

      // Refresh product stock cache
      const updatedProds = await api.get('/products');
      setProducts(updatedProds.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to submit receiving record');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ marginBottom: '6px' }}>Stock Receiving (Deliveries)</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
          Receive parts deliveries from suppliers and update inventory stock.
        </p>
      </div>

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
                  const qty = Number(row.quantity) || 0;
                  const cost = Number(row.costPrice) || 0;
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
                          placeholder="Qty"
                          className="input-premium"
                          style={{ textAlign: 'center' }}
                          value={row.quantity}
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
      </form>

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
