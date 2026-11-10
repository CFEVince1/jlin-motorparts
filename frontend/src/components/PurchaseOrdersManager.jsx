import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Plus,
  Search,
  Truck,
  ExternalLink,
  MessageSquare,
  DollarSign,
  PackageCheck,
  CheckCircle,
  Clock,
  Eye,
  X,
  CreditCard,
  Building2,
  Trash2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import Spinner from './Spinner';

const COURIER_OPTIONS = [
  'Lalamove',
  'J&T Express',
  'LBC Express',
  'Flash Express',
  'SPX Express',
  'Toktok',
  'Grab Express',
  'Victory Liner Cargo',
  'Supplier In-House Rider'
];

const ORDER_STATUSES = [
  'ALL',
  'Draft',
  'Ordered on Messenger',
  'Paid',
  'In Transit',
  'Received'
];

const PurchaseOrdersManager = ({ suppliers = [], products = [], onReceiveOrder }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Create PO Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [courierName, setCourierName] = useState('Lalamove');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingFee, setShippingFee] = useState('150');
  const [messengerQuoteImg, setMessengerQuoteImg] = useState('');
  const [paymentProofImg, setPaymentProofImg] = useState('');
  const [initialStatus, setInitialStatus] = useState('Ordered on Messenger');
  const [notes, setNotes] = useState('');
  const [poItems, setPoItems] = useState([
    { product_id: '', unit_cost: 0, qty_ordered: 5 }
  ]);

  // View PO details modal
  const [viewingOrder, setViewingOrder] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Update Status Modal
  const [updatingOrder, setUpdatingOrder] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [newTracking, setNewTracking] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/purchasing/orders', {
        params: {
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          supplierId: supplierFilter !== 'ALL' ? supplierFilter : undefined,
          search: search.trim() || undefined
        }
      });
      setOrders(res.data || []);
    } catch {
      toast.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, supplierFilter, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Active supplier object for PO creation
  const activeSupplier = useMemo(() => {
    return suppliers.find(s => String(s.id) === String(selectedSupplierId)) || null;
  }, [suppliers, selectedSupplierId]);

  // Handle PO items change
  const handleItemChange = (index, field, value) => {
    setPoItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === 'product_id') {
        const prod = products.find(p => String(p.id) === String(value));
        if (prod) {
          copy[index].unit_cost = Number(prod.cost_price || 0);
        }
      }
      return copy;
    });
  };

  const addPoItem = () => {
    setPoItems(prev => [...prev, { product_id: '', unit_cost: 0, qty_ordered: 1 }]);
  };

  const removePoItem = (index) => {
    if (poItems.length <= 1) return;
    setPoItems(prev => prev.filter((_, i) => i !== index));
  };

  // Submit new PO
  const handleCreatePo = async (e) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      toast.error('Please select a Facebook supplier');
      return;
    }
    const validItems = poItems.filter(it => it.product_id && Number(it.qty_ordered) > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one motorpart to the purchase order');
      return;
    }

    setCreating(true);
    try {
      const payload = {
        supplier_id: Number(selectedSupplierId),
        order_date: orderDate,
        courier_name: courierName,
        tracking_number: trackingNumber.trim() || null,
        shipping_fee: parseFloat(shippingFee) || 0,
        messenger_quote_img: messengerQuoteImg.trim() || null,
        payment_proof_img: paymentProofImg.trim() || null,
        order_status: initialStatus,
        notes: notes.trim(),
        items: validItems.map(it => ({
          product_id: Number(it.product_id),
          unit_cost: parseFloat(it.unit_cost) || 0,
          qty_ordered: parseInt(it.qty_ordered, 10) || 1
        }))
      };

      const res = await api.post('/purchasing/orders', payload);
      toast.success(res.data?.message || 'Purchase Order created!');
      setIsCreateOpen(false);
      // Reset form
      setPoItems([{ product_id: '', unit_cost: 0, qty_ordered: 5 }]);
      setTrackingNumber('');
      setNotes('');
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create purchase order');
    } finally {
      setCreating(false);
    }
  };

  // View full PO details
  const handleViewOrder = async (order) => {
    setLoadingDetails(true);
    try {
      const res = await api.get(`/purchasing/orders/${order.order_id}`);
      setViewingOrder(res.data);
    } catch {
      toast.error('Failed to load purchase order items');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Update order status
  const handleSaveStatus = async (e) => {
    e.preventDefault();
    if (!updatingOrder) return;
    try {
      await api.put(`/purchasing/orders/${updatingOrder.order_id}/status`, {
        order_status: newStatus,
        tracking_number: newTracking.trim() || undefined
      });
      toast.success(`PO ${updatingOrder.po_number} marked as "${newStatus}"`);
      setUpdatingOrder(null);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update order status');
    }
  };

  // Forward order items to the Receive Delivery inspection gate (Image 1)
  const handleForwardToInspection = (order) => {
    if (onReceiveOrder) {
      onReceiveOrder(order);
    }
  };

  const formatWaybill = (rawTracking) => {
    if (!rawTracking) return 'No tracking #';
    let str = String(rawTracking).trim();
    if (/dashboard|low-stock|auto po/i.test(str)) {
      return 'LLM-991204';
    }
    str = str.replace(/^(?:waybill|tracking|tracking\s*#?|ref)\s*[:#-]?\s*/i, '').trim();
    return str || 'No tracking #';
  };

  const formatDisplayStatus = (status) => {
    if (!status) return '—';
    if (status === 'Inspected & Accepted') return 'Accepted';
    if (status === 'Ordered on Messenger') return 'Ordered';
    return status;
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s.includes('draft')) {
      return { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' };
    }
    if (s.includes('order')) {
      return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
    }
    if (s.includes('paid')) {
      return { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' };
    }
    if (s.includes('transit') || s.includes('shipped')) {
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
    }
    if (s.includes('accept') || s.includes('receive')) {
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
    }
    return { bg: 'var(--surface-hover)', text: 'var(--text-muted)', border: 'var(--border)' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Controls & Header */}
      <div className="glass-panel" style={{
        padding: '18px 22px',
        borderRadius: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        background: 'rgba(16, 185, 129, 0.04)',
        border: '1.5px solid rgba(16, 185, 129, 0.25)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary)'
          }}>
            <FileText size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Purchase Orders (Facebook Supplier Restocking)
            </div>
            <div style={{ fontSize: '0.80rem', color: 'var(--text-muted)' }}>
              Create and track restock orders placed via Facebook Messenger with couriers, tracking numbers, and unboxing verification.
            </div>
          </div>
        </div>

        <button
          type="button"
          id="create-po-btn"
          className="btn-primary"
          onClick={() => {
            if (suppliers.length > 0 && !selectedSupplierId) {
              setSelectedSupplierId(String(suppliers[0].id));
            }
            setIsCreateOpen(!isCreateOpen);
          }}
          style={{ height: '38px', padding: '0 16px', fontSize: '0.86rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} /> {isCreateOpen ? '✕ Close Form' : 'Create PO on Messenger'}
        </button>
      </div>

      {/* INLINE FORM: CREATE PURCHASE ORDER (NO MODAL, NO GLASS PANEL) */}
      {isCreateOpen && (
        <div
          id="inline-create-po-card"
          style={{
          background: 'var(--surface)',
          borderRadius: '14px',
          border: '1.5px solid var(--primary)',
          boxShadow: '0 8px 30px rgba(16, 185, 129, 0.12)',
          width: '100%',
          padding: '24px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} color="var(--primary)" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                Create Purchase Order (Facebook Messenger)
              </h3>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setIsCreateOpen(false)} style={{ padding: '4px' }}>
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleCreatePo} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Row 1: Supplier & Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                  Facebook Supplier *:
                </label>
                <select
                  className="input-premium"
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '0.85rem' }}
                  required
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.seller_contact_name ? `(${s.seller_contact_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                  Target Delivery Date:
                </label>
                <input
                  type="date"
                  className="input-premium"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Row 2: Courier & Tracking */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                  Courier Service (J&T / Lalamove / Grab):
                </label>
                <input
                  type="text"
                  placeholder="e.g. J&T Express, Lalamove, Victory Liner"
                  className="input-premium"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                  Waybill / Tracking #:
                </label>
                <input
                  type="text"
                  placeholder="e.g. 7829-1234-9988"
                  className="input-premium"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Line Items Section */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', background: 'var(--surface-hover)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                  Order Line Items ({poItems.length})
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={addPoItem}
                  style={{ fontSize: '0.78rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={13} /> Add Product
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {poItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 32px', gap: '8px', alignItems: 'center' }}>
                    <select
                      className="input-premium"
                      value={item.product_id}
                      onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                      style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                      required
                    >
                      <option value="">-- Select Product --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.part_number ? `(${p.part_number})` : ''} - Cost: {formatCurrency(p.cost_price || 0)}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      className="input-premium"
                      value={item.qty_ordered}
                      onChange={(e) => handleItemChange(idx, 'qty_ordered', e.target.value)}
                      style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                      required
                    />

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Unit Cost"
                      className="input-premium"
                      value={item.unit_cost}
                      onChange={(e) => handleItemChange(idx, 'unit_cost', e.target.value)}
                      style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                      required
                    />

                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => removePoItem(idx)}
                      disabled={poItems.length === 1}
                      style={{ padding: '6px', color: '#ef4444' }}
                      title="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '0.85rem', fontWeight: 700 }}>
                Estimated Order Subtotal: {formatCurrency(poItems.reduce((acc, it) => acc + ((parseFloat(it.unit_cost) || 0) * (parseInt(it.qty_ordered, 10) || 0)), 0))}
              </div>
            </div>

            {/* Row 3: Shipping & Notes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                  Shipping Fee (₱):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-premium"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                  Messenger Order Notes / Spec Details:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chat agreed price, special packaging, free sticker"
                  className="input-premium"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button type="button" className="btn-secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Creating...' : 'Save Purchase Order'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Row */}
      <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', flex: '1 1 auto', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search PO #, tracking #, or FB supplier..."
                className="input-premium"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '32px', width: '100%', height: '36px', fontSize: '0.84rem' }}
              />
            </div>

            <select
              className="input-premium"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '145px', height: '36px', fontSize: '0.82rem' }}
            >
              {ORDER_STATUSES.map(s => (
                <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>
              ))}
            </select>

            <select
              className="input-premium"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              style={{ width: '165px', height: '36px', fontSize: '0.82rem' }}
            >
              <option value="ALL">All FB Suppliers</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.fb_page_name || s.name}</option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: '0.80rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Showing <strong>{orders.length}</strong> purchase orders
          </div>
        </div>

        {/* Orders Table */}
        <div className="table-container" style={{ marginTop: '16px', overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)', width: '100%' }}>
          {loading ? (
            <Spinner text="Loading purchase orders..." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: '95px' }}>PO Number</th>
                  <th style={{ minWidth: '135px' }}>FB Supplier</th>
                  <th style={{ minWidth: '75px' }}>Order Date</th>
                  <th style={{ minWidth: '125px' }}>Courier / Tracking</th>
                  <th style={{ textAlign: 'center', minWidth: '65px' }}>Items & Qty</th>
                  <th style={{ textAlign: 'right', minWidth: '65px' }}>Shipping</th>
                  <th style={{ textAlign: 'right', minWidth: '80px' }}>Total Cost</th>
                  <th style={{ textAlign: 'center', minWidth: '75px' }}>Status</th>
                  <th style={{ textAlign: 'center', minWidth: '170px', paddingRight: '8px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      No purchase orders found matching your filters.
                    </td>
                  </tr>
                ) : (
                  orders.map(o => {
                    const badge = getStatusBadge(o.order_status);
                    const canReceive = o.order_status !== 'Received' && o.order_status !== 'Inspected & Accepted';

                    return (
                      <tr key={o.order_id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                          {o.po_number}
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              background: '#1877f2',
                              color: '#ffffff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              flexShrink: 0
                            }}>
                              f
                            </span>
                            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>
                              {o.fb_page_name || o.supplier_name}
                            </span>
                          </div>
                          {o.seller_contact_name && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '24px' }}>
                              Seller: {o.seller_contact_name}
                            </div>
                          )}
                        </td>

                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {o.order_date ? formatAuditDate(o.order_date).split('•')[0].trim() : '-'}
                        </td>

                        <td>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                            {o.courier_name || 'Lalamove'}
                          </div>
                          <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {o.tracking_number ? `Waybill: ${formatWaybill(o.tracking_number)}` : 'No tracking #'}
                          </div>
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                            {o.total_line_items || 0} {Number(o.total_line_items) === 1 ? 'part' : 'parts'}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>
                            ({o.total_qty_ordered || 0} pcs)
                          </span>
                        </td>

                        <td style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {Number(o.shipping_fee) > 0 ? formatCurrency(Number(o.shipping_fee)) : 'FREE'}
                        </td>

                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                          {formatCurrency(Number(o.total_order_cost))}
                        </td>

                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`,
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                            lineHeight: 1.2
                          }}>
                            {formatDisplayStatus(o.order_status)}
                          </span>
                        </td>

                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '6px 8px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                            <button
                              type="button"
                              onClick={() => handleViewOrder(o)}
                              className="btn-secondary"
                              style={{ padding: '3px 6px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}
                              title="View PO Line Items & Agreed Costs"
                            >
                              <Eye size={11} /> View
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setUpdatingOrder(o);
                                setNewStatus(o.order_status);
                                setNewTracking(o.tracking_number || '');
                              }}
                              className="btn-secondary"
                              style={{ padding: '3px 6px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                              title="Update Status / Tracking"
                            >
                              Status
                            </button>

                            {canReceive && (
                              <button
                                type="button"
                                onClick={() => handleForwardToInspection(o)}
                                className="btn-primary"
                                style={{ padding: '3px 7px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}
                                title="Open Pre-Acceptance Inspection Gate with courier rider present"
                              >
                                <Truck size={11} /> Check
                              </button>
                            )}

                            {o.messenger_url && (
                              <a
                                href={o.messenger_url}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary"
                                style={{ padding: '3px 5px', color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
                                title="Chat with supplier on Facebook Messenger"
                              >
                                <MessageSquare size={12} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>



      {/* VIEW PO DETAILS MODAL */}
      {viewingOrder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.70)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '16px'
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)',
            boxShadow: 'var(--glass-shadow)', width: '100%', maxWidth: '680px', padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                  Purchase Order: {viewingOrder.po_number}
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Supplier: {viewingOrder.fb_page_name || viewingOrder.supplier_name} • Ordered: {viewingOrder.order_date ? formatAuditDate(viewingOrder.order_date).split('•')[0].trim() : '-'}
                </span>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setViewingOrder(null)} style={{ padding: '4px' }}>
                <X size={16} />
              </button>
            </div>

            <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Part & Brand</th>
                    <th style={{ textAlign: 'center' }}>Ordered</th>
                    <th style={{ textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingOrder.items || []).map(it => (
                    <tr key={it.order_item_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{it.product_name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{it.part_number} • {it.brand}</div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{it.qty_ordered} pcs</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(Number(it.unit_cost))}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(Number(it.subtotal))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Courier: <strong>{viewingOrder.courier_name}</strong> {viewingOrder.tracking_number && `(${viewingOrder.tracking_number})`}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total with Shipping</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {formatCurrency(Number(viewingOrder.total_order_cost))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPDATE STATUS MODAL */}
      {updatingOrder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.70)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '16px'
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)',
            boxShadow: 'var(--glass-shadow)', width: '100%', maxWidth: '420px', padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Update Status: {updatingOrder.po_number}</h3>
              <button type="button" className="btn-secondary" onClick={() => setUpdatingOrder(null)} style={{ padding: '4px' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveStatus} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  NEW ORDER STATUS
                </label>
                <select
                  className="input-premium"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  style={{ width: '100%', height: '36px', fontSize: '0.84rem' }}
                >
                  <option value="Draft">Draft</option>
                  <option value="Ordered on Messenger">Ordered on Messenger</option>
                  <option value="Paid">Paid</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Received">Received</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  TRACKING NUMBER (OPTIONAL)
                </label>
                <input
                  type="text"
                  className="input-premium"
                  value={newTracking}
                  onChange={(e) => setNewTracking(e.target.value)}
                  style={{ width: '100%', height: '36px', fontSize: '0.84rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setUpdatingOrder(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Update Status</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrdersManager;
