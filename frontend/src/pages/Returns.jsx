import React, { useState, useEffect, useContext } from 'react';
import { 
  RotateCcw, 
  Search, 
  Calendar, 
  Printer, 
  ArrowUpRight, 
  ArrowDownRight, 
  AlertTriangle, 
  Package, 
  CheckCircle, 
  RefreshCw, 
  X, 
  FileText,
  DollarSign,
  Truck,
  Layers,
  ShoppingBag
} from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import Spinner from '../components/Spinner';

export const Returns = () => {
  const { user } = useContext(AuthContext);
  const isStaff = user?.role === 'staff';

  // Active Main Tab: 'order-return' | 'inventory-discrepancy' | 'history'
  const [activeTab, setActiveTab] = useState('order-return');

  // --- STATE FOR ORDER-BASED RETURN & REFUND ---
  const [recentSales, setRecentSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [saleSearch, setSaleSearch] = useState('');
  const [saleDetails, setSaleDetails] = useState(null);
  const [loadingSaleDetails, setLoadingSaleDetails] = useState(false);
  const [returnItems, setReturnItems] = useState({});
  const [refundPaymentMethod, setRefundPaymentMethod] = useState('Cash');
  const [orderReturnReason, setOrderReturnReason] = useState('');
  const [submittingOrderReturn, setSubmittingOrderReturn] = useState(false);

  // --- STATE FOR DIRECT INVENTORY DISCREPANCY ---
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [adjType, setAdjType] = useState('DAMAGE'); // DAMAGE | LOSS | FOUND | RETURN_TO_SUPPLIER
  const [adjQuantity, setAdjQuantity] = useState('');
  const [adjRefNo, setAdjRefNo] = useState('');
  const [adjRemarks, setAdjRemarks] = useState('');
  const [submittingAdj, setSubmittingAdj] = useState(false);

  // --- STATE FOR RETURNS HISTORY ---
  const [returnsHistory, setReturnsHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDate, setHistoryDate] = useState('');
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  });

  // --- VOUCHER PRINT MODAL ---
  const [voucherModalData, setVoucherModalData] = useState(null);

  // Fetch recent sales for quick order selection
  const fetchRecentSales = async () => {
    setLoadingSales(true);
    try {
      const res = await api.get('/sales?limit=50');
      const salesList = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      // Filter out voided
      setRecentSales(salesList.filter(s => s.status !== 'VOIDED'));
    } catch {
      toast.error('Failed to load recent sales');
    } finally {
      setLoadingSales(false);
    }
  };

  // Fetch products for direct adjustment
  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await api.get('/products');
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.products || []);
      setProducts(list.filter(p => p.is_active !== false && p.is_active !== 0));
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  };

  // Fetch Returns & Refunds History
  const fetchReturnsHistory = async (page = 1) => {
    setLoadingHistory(true);
    try {
      const res = await api.get('/sales/returns/history', {
        params: {
          page,
          limit: 20,
          search: historySearch.trim() || undefined,
          date: historyDate || undefined
        }
      });
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw?.data || []);
      setReturnsHistory(list);
      if (raw?.pagination) {
        setHistoryPagination(raw.pagination);
      }
    } catch {
      toast.error('Failed to load returns history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Initial loads
  useEffect(() => {
    fetchRecentSales();
    fetchProducts();
    fetchReturnsHistory(1);
  }, []);

  // Whenever history search or date changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReturnsHistory(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [historySearch, historyDate]);

  // Load sale details when selected
  useEffect(() => {
    if (!selectedSaleId) {
      setSaleDetails(null);
      setReturnItems({});
      return;
    }

    const loadDetails = async () => {
      setLoadingSaleDetails(true);
      try {
        const res = await api.get(`/sales/${selectedSaleId}`);
        const sale = res.data;
        setSaleDetails(sale);
        setRefundPaymentMethod(sale.payment_method === 'GCash' ? 'GCash' : 'Cash');

        const initial = {};
        (sale.items || []).forEach(item => {
          const available = item.available_to_return ?? (item.quantity - (item.returned_quantity || 0));
          initial[item.sale_item_id || item.id] = {
            selected: available > 0,
            quantity: available > 0 ? 1 : 0,
            maxQuantity: Math.max(0, available),
            disposition: 'FOUND', // Default: Restock (+ into inventory)
            refund_price: Number(item.price || 0),
            notes: ''
          };
        });
        setReturnItems(initial);
      } catch {
        toast.error('Failed to load sale transaction items');
        setSaleDetails(null);
      } finally {
        setLoadingSaleDetails(false);
      }
    };

    loadDetails();
  }, [selectedSaleId]);

  // Auto-generate reference number for quick adjustment
  useEffect(() => {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(2, 12);
    let prefix = 'DMG';
    if (adjType === 'LOSS') prefix = 'LOSS';
    if (adjType === 'FOUND') prefix = 'FND';
    if (adjType === 'RETURN_TO_SUPPLIER') prefix = 'RTS';
    setAdjRefNo(`ADJ-${prefix}-${timestamp}`);
  }, [adjType]);

  // --- HANDLERS FOR ORDER-BASED RETURN ---
  const handleToggleSelectItem = (itemId) => {
    setReturnItems(prev => {
      const current = prev[itemId];
      if (!current || current.maxQuantity <= 0) return prev;
      return {
        ...prev,
        [itemId]: {
          ...current,
          selected: !current.selected,
          quantity: !current.selected ? Math.max(1, current.quantity || 1) : 0
        }
      };
    });
  };

  const handleItemQuantityChange = (itemId, val) => {
    const num = parseInt(val, 10) || 0;
    setReturnItems(prev => {
      const current = prev[itemId];
      if (!current) return prev;
      const clamped = Math.max(0, Math.min(num, current.maxQuantity));
      return {
        ...prev,
        [itemId]: {
          ...current,
          quantity: clamped,
          selected: clamped > 0
        }
      };
    });
  };

  const handleItemDispositionChange = (itemId, disp) => {
    setReturnItems(prev => {
      const current = prev[itemId];
      if (!current) return prev;
      return {
        ...prev,
        [itemId]: {
          ...current,
          disposition: disp
        }
      };
    });
  };

  const selectedEntries = Object.entries(returnItems).filter(([, it]) => it.selected && it.quantity > 0);
  const totalRefundAmount = selectedEntries.reduce((sum, [, it]) => sum + (it.quantity * it.refund_price), 0);
  const totalUnitsReturning = selectedEntries.reduce((sum, [, it]) => sum + it.quantity, 0);

  const handleSubmitOrderReturn = async (e) => {
    e.preventDefault();

    if (!selectedSaleId) {
      toast.error('Please select an order to return items from');
      return;
    }

    if (selectedEntries.length === 0) {
      toast.error('Please select at least one item and quantity to return');
      return;
    }

    if (!orderReturnReason.trim()) {
      toast.error('Please enter a return reason / remarks for audit compliance');
      return;
    }

    setSubmittingOrderReturn(true);
    try {
      const payloadItems = selectedEntries.map(([saleItemId, it]) => ({
        sale_item_id: Number(saleItemId),
        quantity: it.quantity,
        refund_price: it.refund_price,
        disposition: it.disposition,
        notes: it.notes || ''
      }));

      const res = await api.post(`/sales/${selectedSaleId}/refund`, {
        items: payloadItems,
        refundPaymentMethod,
        reason: orderReturnReason.trim()
      });

      toast.success(res.data?.message || 'Return & Refund processed successfully!');
      
      // Open print voucher modal
      setVoucherModalData({
        return_number: res.data?.returnNumber,
        sale_order_number: saleDetails?.order_number || `SO-${selectedSaleId}`,
        created_at: new Date().toISOString(),
        cashier: user?.username || 'Cashier',
        refund_amount: totalRefundAmount,
        refund_payment_method: refundPaymentMethod,
        reason: orderReturnReason.trim(),
        items: selectedEntries.map(([id, it]) => {
          const orig = (saleDetails?.items || []).find(x => (x.sale_item_id || x.id) === Number(id));
          return {
            name: orig?.product_name || 'Product',
            part_number: orig?.part_number || '-',
            quantity: it.quantity,
            price: it.refund_price,
            subtotal: it.quantity * it.refund_price,
            disposition: it.disposition
          };
        })
      });

      // Reset form & refresh
      setSelectedSaleId('');
      setOrderReturnReason('');
      fetchReturnsHistory(1);
      fetchRecentSales();
      fetchProducts();
    } catch (err) {
      console.error('Return failed:', err);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to process return & refund');
    } finally {
      setSubmittingOrderReturn(false);
    }
  };

  // --- HANDLER FOR DIRECT INVENTORY DISCREPANCY ---
  const handleSubmitDirectAdjustment = async (e) => {
    e.preventDefault();

    if (!selectedProductId) {
      toast.error('Please select a product');
      return;
    }

    const qty = parseInt(adjQuantity, 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error('Please enter a valid positive quantity');
      return;
    }

    const targetProduct = products.find(p => String(p.id) === String(selectedProductId));
    const currentStock = targetProduct?.current_stock ?? targetProduct?.stock ?? 0;

    if (['DAMAGE', 'LOSS', 'RETURN_TO_SUPPLIER'].includes(adjType) && qty > currentStock) {
      toast.error(`Cannot deduct more than current stock (${currentStock})`);
      return;
    }

    if (!adjRefNo.trim()) {
      toast.error('Reference number is required');
      return;
    }

    if (!adjRemarks.trim()) {
      toast.error('Remarks / reason are required for audit compliance');
      return;
    }

    setSubmittingAdj(true);
    try {
      await api.post('/inventory/adjustments', {
        item_id: Number(selectedProductId),
        product_id: Number(selectedProductId),
        movement_type: adjType,
        transaction_type: adjType,
        quantity: qty,
        reference_no: adjRefNo.trim(),
        remarks: adjRemarks.trim()
      });

      toast.success(`Inventory adjustment (${adjType}) recorded successfully!`);

      // Reset & refresh
      setAdjQuantity('');
      setAdjRemarks('');
      fetchProducts();
      fetchReturnsHistory(1);
    } catch (err) {
      console.error('Adjustment failed:', err);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to record adjustment');
    } finally {
      setSubmittingAdj(false);
    }
  };

  // Filtered sales for search dropdown
  const filteredSalesOptions = recentSales.filter(s => {
    if (!saleSearch.trim()) return true;
    const q = saleSearch.toLowerCase();
    const ord = (s.order_number || `SO-${s.id}`).toLowerCase();
    const cash = (s.cashier || '').toLowerCase();
    const prods = (s.products_included || '').toLowerCase();
    return ord.includes(q) || cash.includes(q) || prods.includes(q);
  });

  // Filtered products for search dropdown
  const filteredProductsOptions = products.filter(p => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    const name = (p.name || '').toLowerCase();
    const pn = (p.part_number || '').toLowerCase();
    const brand = (p.brand || '').toLowerCase();
    return name.includes(q) || pn.includes(q) || brand.includes(q);
  });

  const selectedProductObj = products.find(p => String(p.id) === String(selectedProductId));

  // Summary Metrics
  const totalReturnRecords = returnsHistory.length;
  const totalRefundedSum = returnsHistory.reduce((sum, r) => sum + Number(r.total_refund_amount || 0), 0);
  const totalFoundCount = returnsHistory.filter(r => (r.dispositions || '').includes('FOUND')).length;
  const totalDeductedCount = returnsHistory.filter(r => 
    (r.dispositions || '').includes('DAMAGE') || 
    (r.dispositions || '').includes('RETURN_TO_SUPPLIER') || 
    (r.dispositions || '').includes('LOSS')
  ).length;

  const renderDispositionBadge = (disp) => {
    switch (disp) {
      case 'FOUND':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: 'rgba(22, 163, 74, 0.1)',
            color: '#16a34a',
            border: '1px solid rgba(22, 163, 74, 0.25)'
          }}>
            <ArrowUpRight size={13} /> + Found (Restock)
          </span>
        );
      case 'DAMAGE':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: 'rgba(220, 38, 38, 0.1)',
            color: '#dc2626',
            border: '1px solid rgba(220, 38, 38, 0.25)'
          }}>
            <ArrowDownRight size={13} /> - Damaged (RTS / Damage)
          </span>
        );
      case 'RETURN_TO_SUPPLIER':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: 'rgba(217, 119, 6, 0.1)',
            color: '#d97706',
            border: '1px solid rgba(217, 119, 6, 0.25)'
          }}>
            <ArrowDownRight size={13} /> - Return to Supplier
          </span>
        );
      case 'LOSS':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: 'rgba(147, 51, 234, 0.1)',
            color: '#9333ea',
            border: '1px solid rgba(147, 51, 234, 0.25)'
          }}>
            <ArrowDownRight size={13} /> - Loss (Negative)
          </span>
        );
      default:
        return (
          <span style={{ fontSize: '0.74rem', fontWeight: 600, padding: '2px 6px', background: 'var(--border)', borderRadius: '4px' }}>
            {disp || 'ADJUSTMENT'}
          </span>
        );
    }
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* Page Header */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
            <RotateCcw size={32} color="var(--primary)" /> Return / Refund Management
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 44px' }}>
            Process customer returns, return to supplier for damaged goods, loss write-offs, and found inventory restorations.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="glass-panel" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Returns / Refunds</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(22, 163, 74, 0.1)', color: 'var(--primary)' }}>
              <RotateCcw size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {historyPagination.total || totalReturnRecords}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Audited return transactions
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Amount Refunded</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#dc2626' }}>
            {formatCurrency(totalRefundedSum)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Cash & GCash customer disbursements
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Restocked / Found Items</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a' }}>
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#16a34a' }}>
            +{totalFoundCount} batches
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Positive stock added into inventory (+)
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Damaged / Supplier / Loss</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(217, 119, 6, 0.1)', color: '#d97706' }}>
              <ArrowDownRight size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#d97706' }}>
            -{totalDeductedCount} batches
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Negative stock written off / returned (-)
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('order-return')}
          style={{
            padding: '9px 18px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: activeTab === 'order-return' ? 'var(--primary)' : 'var(--border)',
            background: activeTab === 'order-return' ? 'rgba(22, 163, 74, 0.1)' : 'var(--surface)',
            color: activeTab === 'order-return' ? 'var(--primary)' : 'var(--text-main)',
            fontWeight: 600,
            fontSize: '0.88rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <ShoppingBag size={17} /> Customer Sale Return & Refund
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('inventory-discrepancy')}
          style={{
            padding: '9px 18px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: activeTab === 'inventory-discrepancy' ? 'var(--primary)' : 'var(--border)',
            background: activeTab === 'inventory-discrepancy' ? 'rgba(22, 163, 74, 0.1)' : 'var(--surface)',
            color: activeTab === 'inventory-discrepancy' ? 'var(--primary)' : 'var(--text-main)',
            fontWeight: 600,
            fontSize: '0.88rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Layers size={17} /> Direct Stock Discrepancy (Damage / Loss / Found / RTS)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{
            padding: '9px 18px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: activeTab === 'history' ? 'var(--primary)' : 'var(--border)',
            background: activeTab === 'history' ? 'rgba(22, 163, 74, 0.1)' : 'var(--surface)',
            color: activeTab === 'history' ? 'var(--primary)' : 'var(--text-main)',
            fontWeight: 600,
            fontSize: '0.88rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <RotateCcw size={17} /> Return / Refund Audit History
          <span style={{
            background: activeTab === 'history' ? 'var(--primary)' : 'var(--border)',
            color: activeTab === 'history' ? '#fff' : 'var(--text-muted)',
            padding: '1px 6px',
            borderRadius: '10px',
            fontSize: '0.72rem'
          }}>
            {historyPagination.total || returnsHistory.length}
          </span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: CUSTOMER SALE RETURN & REFUND                           */}
      {/* ============================================================== */}
      {activeTab === 'order-return' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingBag size={20} color="var(--primary)" /> 1. Select Customer Order
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Search Order Number or Cashier
              </label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter order # (e.g. SO-144, ORD-0-2030)..."
                  className="input-premium"
                  style={{ paddingLeft: '36px', width: '100%' }}
                  value={saleSearch}
                  onChange={(e) => setSaleSearch(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Select Sale Transaction <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                className="input-premium"
                value={selectedSaleId}
                onChange={(e) => setSelectedSaleId(e.target.value)}
                style={{ width: '100%' }}
                disabled={loadingSales}
              >
                <option value="">-- Choose a Completed Sale Transaction --</option>
                {filteredSalesOptions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.order_number || `SO-${s.id}`} • {s.cashier} • {formatCurrency(s.total_amount)} • {new Date(s.sale_date).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadingSaleDetails && (
            <div style={{ padding: '40px 0' }}>
              <Spinner text="Loading sale transaction items..." />
            </div>
          )}

          {saleDetails && !loadingSaleDetails && (
            <form onSubmit={handleSubmitOrderReturn} style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              {/* Order Meta Header */}
              <div style={{
                background: 'var(--bg-base, #F9FAFB)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '20px'
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary)', fontFamily: 'monospace' }}>
                    {saleDetails.order_number || `SO-${saleDetails.id}`}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Date: {formatAuditDate(saleDetails.sale_date)} • Cashier: <strong style={{ textTransform: 'capitalize' }}>{saleDetails.cashier}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Payment: </span>
                    <strong style={{ fontSize: '0.85rem' }}>{saleDetails.payment_method || 'Cash'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Original Total: </span>
                    <strong style={{ fontSize: '1.05rem', color: 'var(--text-main)' }}>{formatCurrency(saleDetails.total_amount)}</strong>
                  </div>
                </div>
              </div>

              {/* Items Selection Table */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 700 }}>
                    Select Items to Return & Choose Inventory Disposition
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {selectedEntries.length} of {(saleDetails.items || []).length} items selected
                  </span>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead style={{ background: 'var(--bg-base, #F9FAFB)', borderBottom: '1px solid var(--border)' }}>
                      <tr>
                        <th style={{ padding: '10px 12px', textAlign: 'center', width: '40px' }}></th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Product & Part Number</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', width: '90px' }}>Sold Qty</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', width: '110px' }}>Return Qty</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', width: '270px' }}>Inventory Disposition</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>Refund Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(saleDetails.items || []).map(item => {
                        const itemId = item.sale_item_id || item.id;
                        const returnState = returnItems[itemId] || { selected: false, quantity: 0, maxQuantity: 0, disposition: 'FOUND', refund_price: Number(item.price || 0) };
                        const isMaxedOut = returnState.maxQuantity <= 0;

                        return (
                          <tr
                            key={itemId}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              background: returnState.selected ? 'rgba(22, 163, 74, 0.04)' : 'transparent',
                              opacity: isMaxedOut ? 0.6 : 1
                            }}
                          >
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={returnState.selected}
                                disabled={isMaxedOut}
                                onChange={() => handleToggleSelectItem(itemId)}
                                style={{ width: '16px', height: '16px', cursor: isMaxedOut ? 'not-allowed' : 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.product_name}</div>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: 'var(--bg-base)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                  {item.part_number || '-'}
                                </span>
                                {item.serial_numbers && (
                                  <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--primary)', background: 'rgba(22, 163, 74, 0.1)', padding: '1px 6px', borderRadius: '4px' }}>
                                    SN: {item.serial_numbers}
                                  </span>
                                )}
                                {item.returned_quantity > 0 && (
                                  <span style={{ fontSize: '0.72rem', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: '4px' }}>
                                    Prev returned: {item.returned_quantity}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>
                              {item.quantity}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              {isMaxedOut ? (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fully Returned</span>
                              ) : (
                                <input
                                  type="number"
                                  min="1"
                                  max={returnState.maxQuantity}
                                  value={returnState.quantity || ''}
                                  onChange={(e) => handleItemQuantityChange(itemId, e.target.value)}
                                  disabled={!returnState.selected}
                                  style={{
                                    width: '64px',
                                    textAlign: 'center',
                                    padding: '4px 6px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: returnState.selected ? '#fff' : 'var(--bg-base)'
                                  }}
                                />
                              )}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <select
                                value={returnState.disposition}
                                disabled={!returnState.selected}
                                onChange={(e) => handleItemDispositionChange(itemId, e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border)',
                                  fontSize: '0.8rem',
                                  background: returnState.selected ? '#fff' : 'var(--bg-base)',
                                  cursor: returnState.selected ? 'pointer' : 'not-allowed'
                                }}
                              >
                                <option value="FOUND">🟢 Found / Restock (+ Plus into Inventory)</option>
                                <option value="DAMAGE">🔴 Damaged - Return to Supplier (- Inventory)</option>
                                <option value="RETURN_TO_SUPPLIER">🟠 Return to Supplier (- Inventory)</option>
                                <option value="LOSS">🟣 Loss / Unrecovered (- Negative into Inventory)</option>
                              </select>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: returnState.selected ? 'var(--primary)' : 'var(--text-muted)' }}>
                              {formatCurrency(returnState.selected ? (returnState.quantity * returnState.refund_price) : 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Disposition Rule Clarification Pill Banner */}
              <div style={{
                background: 'var(--bg-base, #F9FAFB)',
                border: '1px solid var(--border, #E5E7EB)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '20px',
                fontSize: '0.8rem'
              }}>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  Automatic Inventory Invariants:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', color: 'var(--text-muted)' }}>
                  <div><strong style={{ color: '#16A34A' }}>+ FOUND:</strong> Returned in good condition $\rightarrow$ Added back to stock.</div>
                  <div><strong style={{ color: '#DC2626' }}>- DAMAGE:</strong> Defective / chipped item $\rightarrow$ Written off / RTS damage.</div>
                  <div><strong style={{ color: '#D97706' }}>- RETURN TO SUPPLIER:</strong> Direct supplier RMA $\rightarrow$ Deducted from stock.</div>
                  <div><strong style={{ color: '#9333EA' }}>- LOSS:</strong> Missing / unrecovered item $\rightarrow$ Negative stock ledger entry.</div>
                </div>
              </div>

              {/* Refund Method & Totals */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Refund Payment Method
                  </label>
                  <select
                    className="input-premium"
                    value={refundPaymentMethod}
                    onChange={(e) => setRefundPaymentMethod(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="Cash">Cash Refund</option>
                    <option value="GCash">GCash Transfer</option>
                    <option value="Original Payment">Original Payment Method ({saleDetails?.payment_method})</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Total Refund Amount to Customer
                  </label>
                  <div style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: 'rgba(22, 163, 74, 0.08)',
                    border: '1px solid rgba(22, 163, 74, 0.25)',
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    color: 'var(--primary, #16A34A)'
                  }}>
                    {formatCurrency(totalRefundAmount)}
                    <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      ({totalUnitsReturning} unit{totalUnitsReturning !== 1 ? 's' : ''})
                    </span>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Return Reason & Audit Remarks <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  className="input-premium"
                  rows="2"
                  placeholder="e.g. Customer brought back unopened item; replacing with supplier / returned damaged caliper bolt..."
                  value={orderReturnReason}
                  onChange={(e) => setOrderReturnReason(e.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                  required
                />
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setSelectedSaleId(''); setSaleDetails(null); }}
                  disabled={submittingOrderReturn}
                  style={{ padding: '8px 18px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingOrderReturn || selectedEntries.length === 0}
                  style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {submittingOrderReturn ? (
                    <>Processing Refund...</>
                  ) : (
                    <>
                      <RotateCcw size={16} /> Confirm Return & Refund ({formatCurrency(totalRefundAmount)})
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: DIRECT INVENTORY DISCREPANCY ADJUSTMENT                */}
      {/* ============================================================== */}
      {activeTab === 'inventory-discrepancy' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={20} color="var(--primary)" /> Direct Inventory Discrepancy Adjustment
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
            Record non-sale inventory movements: write off damaged goods, lost parts, restore found stock, or process return to supplier.
          </p>

          <form onSubmit={handleSubmitDirectAdjustment}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Filter Products
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search part #, product name, or brand..."
                    className="input-premium"
                    style={{ paddingLeft: '36px', width: '100%' }}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Select Target Product <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  className="input-premium"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={loadingProducts}
                  required
                >
                  <option value="">-- Choose Product --</option>
                  {filteredProductsOptions.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} [{p.part_number || p.sku}] (Stock: {p.current_stock ?? p.stock})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedProductObj && (
              <div style={{
                background: 'var(--bg-base, #F9FAFB)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '20px',
                display: 'flex',
                gap: '24px',
                alignItems: 'center',
                flexWrap: 'wrap'
              }}>
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Product:</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{selectedProductObj.name}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Part Number:</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedProductObj.part_number}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Current Shelf Stock:</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {selectedProductObj.current_stock ?? selectedProductObj.stock} units
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Movement / Adjustment Type <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  className="input-premium"
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="DAMAGE">🔴 Damage (- Negative into Inventory)</option>
                  <option value="LOSS">🟣 Loss (- Negative into Inventory)</option>
                  <option value="RETURN_TO_SUPPLIER">🟠 Return to Supplier (- Negative into Inventory)</option>
                  <option value="FOUND">🟢 Found (+ Plus into Inventory)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Quantity <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 1"
                  className="input-premium"
                  value={adjQuantity}
                  onChange={(e) => setAdjQuantity(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Reference Number <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  className="input-premium"
                  value={adjRefNo}
                  onChange={(e) => setAdjRefNo(e.target.value)}
                  style={{ width: '100%', fontFamily: 'monospace' }}
                  required
                />
              </div>
            </div>

            {/* Dynamic visual impact banner */}
            <div style={{
              background: adjType === 'FOUND' ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)',
              border: `1px solid ${adjType === 'FOUND' ? 'rgba(22, 163, 74, 0.25)' : 'rgba(220, 38, 38, 0.25)'}`,
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              {adjType === 'FOUND' ? (
                <>
                  <ArrowUpRight color="#16a34a" size={20} />
                  <div>
                    <strong style={{ color: '#16a34a' }}>Positive Stock Inflow:</strong> This adjustment will ADD +{parseInt(adjQuantity, 10) || 0} unit(s) back into available inventory.
                  </div>
                </>
              ) : (
                <>
                  <ArrowDownRight color="#dc2626" size={20} />
                  <div>
                    <strong style={{ color: '#dc2626' }}>Negative Stock Outflow:</strong> This adjustment will DEDUCT -{parseInt(adjQuantity, 10) || 0} unit(s) from inventory ({adjType === 'RETURN_TO_SUPPLIER' ? 'returned to supplier' : adjType === 'DAMAGE' ? 'damaged part write-off' : 'lost inventory write-off'}).
                  </div>
                </>
              )}
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Reason / Audit Remarks <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea
                className="input-premium"
                rows="2"
                placeholder="e.g. Scratched during unboxing; defective batch returned to supplier; misplaced part found..."
                value={adjRemarks}
                onChange={(e) => setAdjRemarks(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setSelectedProductId(''); setAdjQuantity(''); setAdjRemarks(''); }}
                disabled={submittingAdj}
                style={{ padding: '8px 18px' }}
              >
                Clear
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submittingAdj || !selectedProductId || !adjQuantity}
                style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {submittingAdj ? (
                  <>Recording Adjustment...</>
                ) : (
                  <>
                    <CheckCircle size={16} /> Record Inventory Adjustment ({adjType})
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: RETURNS & REFUNDS AUDIT HISTORY                         */}
      {/* ============================================================== */}
      {activeTab === 'history' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          {/* History Filters */}
          <div className="no-print" style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 280px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search return #, order #, product, or cashier..."
                className="input-premium"
                style={{ paddingLeft: '36px', width: '100%' }}
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>

            <div style={{ position: 'relative', flex: '0 0 auto' }}>
              <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="date"
                className="input-premium"
                style={{ paddingLeft: '36px', paddingRight: '12px' }}
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
              />
            </div>

            {historyDate && (
              <button className="btn-secondary" onClick={() => setHistoryDate('')} style={{ flex: '0 0 auto' }}>
                Clear Date
              </button>
            )}

            <button
              onClick={() => fetchReturnsHistory(historyPagination.page)}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Refresh"
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          {/* Table */}
          {loadingHistory ? (
            <div style={{ padding: '60px 0' }}>
              <Spinner text="Loading returns history..." />
            </div>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Return No.</th>
                      <th>Date & Time</th>
                      <th>Order No.</th>
                      <th>Cashier</th>
                      <th>Items Returned</th>
                      <th>Inventory Impact</th>
                      <th className="text-right">Refund Amount</th>
                      <th>Reason / Remarks</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnsHistory.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="table-empty-state">
                          No returns or refunds match your search criteria.
                        </td>
                      </tr>
                    ) : (
                      returnsHistory.map(ret => (
                        <tr key={ret.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--primary)' }}>
                            {ret.return_number}
                          </td>
                          <td>{formatAuditDate(ret.created_at)}</td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {ret.order_number || `SO-${ret.sale_id}`}
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>
                            {ret.cashier}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{ret.products_returned || '-'}</div>
                            {ret.part_numbers && (
                              <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                {ret.part_numbers}
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {(ret.dispositions || 'FOUND').split(',').map((d, i) => (
                                <span key={i}>
                                  {renderDispositionBadge(d.trim())}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="text-right" style={{ fontWeight: 'bold', color: '#dc2626' }}>
                            -{formatCurrency(ret.total_refund_amount)}
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              via {ret.refund_payment_method || 'Cash'}
                            </div>
                          </td>
                          <td style={{ maxWidth: '240px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {ret.reason || '-'}
                          </td>
                          <td>
                            <button
                              onClick={() => {
                                setVoucherModalData({
                                  return_number: ret.return_number,
                                  sale_order_number: ret.order_number || `SO-${ret.sale_id}`,
                                  created_at: ret.created_at,
                                  cashier: ret.cashier,
                                  refund_amount: ret.total_refund_amount,
                                  refund_payment_method: ret.refund_payment_method || 'Cash',
                                  reason: ret.reason,
                                  items: (ret.products_returned || '').split(',').map(p => ({
                                    name: p.trim(),
                                    part_number: ret.part_numbers || '',
                                    quantity: 1,
                                    price: ret.total_refund_amount,
                                    subtotal: ret.total_refund_amount,
                                    disposition: ret.dispositions || 'FOUND'
                                  }))
                                });
                              }}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                              title="Print Return Voucher"
                            >
                              <Printer size={13} /> Print Slip
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {historyPagination.totalPages > 1 && (
                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '8px' }}>
                    Page {historyPagination.page} of {historyPagination.totalPages} ({historyPagination.total} total)
                  </span>
                  <button
                    disabled={historyPagination.page <= 1}
                    onClick={() => fetchReturnsHistory(historyPagination.page - 1)}
                    className="btn-secondary"
                    style={{ padding: '4px 12px', fontSize: '0.9rem', opacity: historyPagination.page <= 1 ? 0.5 : 1 }}
                  >
                    Prev
                  </button>
                  <button
                    disabled={historyPagination.page >= historyPagination.totalPages}
                    onClick={() => fetchReturnsHistory(historyPagination.page + 1)}
                    className="btn-secondary"
                    style={{ padding: '4px 12px', fontSize: '0.9rem', opacity: historyPagination.page >= historyPagination.totalPages ? 0.5 : 1 }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* VOUCHER / SLIP PRINT MODAL                                    */}
      {/* ============================================================== */}
      {voucherModalData && (
        <div className="receipt-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '40px', overflowY: 'auto' }}>
          <div className="glass-panel" style={{ background: 'white', color: 'black', padding: '24px', width: '420px', borderRadius: '8px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            <button
              className="no-print"
              onClick={() => setVoucherModalData(null)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}
            >
              <X size={24} />
            </button>

            {/* Printable Slip Content */}
            <div id="print-area" className="printable-report" style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', color: '#000' }}>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <h2 style={{ margin: '0 0 2px 0', fontSize: '18px', fontWeight: 'bold' }}>JLIN MOTORPARTS</h2>
                <div style={{ fontSize: '10px' }}>RETURN & REFUND VOUCHER</div>
                <div style={{ fontSize: '9px', color: '#555' }}>Official Stock Adjustment & Refund Slip</div>
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '8px 0', margin: '8px 0', fontSize: '11px', lineHeight: '1.4' }}>
                <div><strong>Return #:</strong> {voucherModalData.return_number}</div>
                <div><strong>Original Order:</strong> {voucherModalData.sale_order_number}</div>
                <div><strong>Date:</strong> {formatAuditDate(voucherModalData.created_at)}</div>
                <div><strong>Cashier / Staff:</strong> {voucherModalData.cashier}</div>
                <div><strong>Refund Method:</strong> {voucherModalData.refund_payment_method}</div>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '4px' }}>
                  RETURNED ITEMS & DISPOSITION
                </div>
                {(voucherModalData.items || []).map((it, idx) => (
                  <div key={idx} style={{ marginBottom: '6px', fontSize: '11px' }}>
                    <div style={{ fontWeight: 'bold' }}>{it.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#333' }}>
                      <span>{it.quantity}x @ {formatCurrency(it.price)} [{it.disposition}]</span>
                      <span>{formatCurrency(it.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px dashed #000', paddingTop: '8px', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
                  <span>TOTAL REFUND:</span>
                  <span>{formatCurrency(voucherModalData.refund_amount)}</span>
                </div>
              </div>

              <div style={{ marginTop: '10px', fontSize: '10px', color: '#444' }}>
                <strong>Reason:</strong> {voucherModalData.reason}
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', paddingTop: '20px' }}>
                <div style={{ borderTop: '1px solid #000', width: '42%', textAlign: 'center', paddingTop: '4px' }}>
                  Customer Signature
                </div>
                <div style={{ borderTop: '1px solid #000', width: '42%', textAlign: 'center', paddingTop: '4px' }}>
                  Authorized Staff
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="no-print" style={{ marginTop: '20px', display: 'flex', gap: '10px', width: '100%' }}>
              <button
                className="btn-primary"
                style={{ flex: 1, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={() => window.print()}
              >
                <Printer size={16} /> Print Voucher
              </button>
              <button
                className="btn-secondary"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => setVoucherModalData(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Returns;
