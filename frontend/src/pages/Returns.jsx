import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
    RotateCcw,
    Search,
    Calendar,
    Receipt,
    ArrowUpRight,
    ArrowDownRight,
    AlertTriangle,
    Package,
    History,
    CheckCircle,
    X,
    Filter,
    Truck,
    AlertOctagon,
    RefreshCw,
    Printer,
    DollarSign
} from 'lucide-react';
import Spinner from '../components/Spinner';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import ReceiptPrint from '../components/ReceiptPrint';

export default function Returns() {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const isStaff = user?.role === 'staff';

    // Tabs: 'process' (Process Return & Refund) | 'history' (Return Slip History) | 'direct' (Direct Inventory Adjustment)
    const [activeTab, setActiveTab] = useState('process');

    // ==========================================
    // 1. ORDER LOOKUP & PROCESS RETURN STATE
    // ==========================================
    const [orderSearchQuery, setOrderSearchQuery] = useState('');
    const [searchingOrder, setSearchingOrder] = useState(false);
    const [recentSales, setRecentSales] = useState([]);
    const [loadingRecentSales, setLoadingRecentSales] = useState(false);
    const [selectedSale, setSelectedSale] = useState(null);
    const [loadingSaleDetails, setLoadingSaleDetails] = useState(false);

    // Return Form state
    const [returnItems, setReturnItems] = useState({});
    const [refundPaymentMethod, setRefundPaymentMethod] = useState('Cash');
    const [returnReason, setReturnReason] = useState('');
    const [submittingReturn, setSubmittingReturn] = useState(false);
    const [lastProcessedReturn, setLastProcessedReturn] = useState(null);

    // ==========================================
    // 2. RETURNS HISTORY STATE
    // ==========================================
    const [returnsList, setReturnsList] = useState([]);
    const [loadingReturns, setLoadingReturns] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [historyDate, setHistoryDate] = useState('');
    const [returnsPagination, setReturnsPagination] = useState({
        page: 1,
        limit: 15,
        total: 0,
        totalPages: 1
    });

    // ==========================================
    // 3. DIRECT INVENTORY ADJUSTMENT STATE
    // ==========================================
    const [productsCatalog, setProductsCatalog] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [directItemSearch, setDirectItemSearch] = useState('');
    const [directProductId, setDirectProductId] = useState('');
    const [directType, setDirectType] = useState('DAMAGE');
    const [directQty, setDirectQty] = useState(1);
    const [directRef, setDirectRef] = useState('');
    const [directRemarks, setDirectRemarks] = useState('');
    const [submittingDirect, setSubmittingDirect] = useState(false);

    // Receipt Modal State
    const [selectedReceiptSaleId, setSelectedReceiptSaleId] = useState(null);
    const [receiptDetails, setReceiptDetails] = useState(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);

    // ==========================================
    // DATA FETCHING HOOKS
    // ==========================================

    // Fetch recent completed/partial sales for quick lookup
    const fetchRecentSales = useCallback(async (query = '') => {
        setLoadingRecentSales(true);
        try {
            const res = await api.get('/sales', {
                params: {
                    limit: 10,
                    search: query || undefined,
                    selfOnly: isStaff ? 'true' : undefined
                }
            });
            const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
            // Exclude completely voided orders
            setRecentSales(data.filter(s => s.status !== 'VOIDED'));
        } catch (err) {
            console.error('Failed to load recent sales:', err);
        } finally {
            setLoadingRecentSales(false);
        }
    }, [isStaff]);

    // Fetch returns history
    const fetchReturnsHistory = useCallback(async (page = 1) => {
        setLoadingReturns(true);
        try {
            const res = await api.get('/sales/returns/history', {
                params: {
                    page,
                    limit: 15,
                    search: historySearch || undefined,
                    date: historyDate || undefined,
                    selfOnly: isStaff ? 'true' : undefined
                }
            });
            const raw = res.data;
            setReturnsList(Array.isArray(raw) ? raw : (raw?.data || []));
            if (raw?.pagination) {
                setReturnsPagination(raw.pagination);
            }
        } catch (err) {
            console.error('Failed to fetch returns history:', err);
            toast.error('Failed to load returns history');
        } finally {
            setLoadingReturns(false);
        }
    }, [historySearch, historyDate, isStaff]);

    // Fetch products catalog for direct return/adjustment
    const fetchProductsCatalog = useCallback(async () => {
        setLoadingProducts(true);
        try {
            const res = await api.get('/products');
            setProductsCatalog(res.data || []);
        } catch (err) {
            console.error('Failed to load products catalog:', err);
        } finally {
            setLoadingProducts(false);
        }
    }, []);

    useEffect(() => {
        fetchRecentSales();
        fetchReturnsHistory(1);
        fetchProductsCatalog();
    }, [fetchRecentSales, fetchReturnsHistory, fetchProductsCatalog]);

    // ==========================================
    // ORDER LOOKUP & SELECTION
    // ==========================================
    const handleSelectSale = async (sale) => {
        setLoadingSaleDetails(true);
        try {
            const res = await api.get(`/sales/${sale.id}`);
            const saleData = res.data;
            setSelectedSale(saleData);
            setRefundPaymentMethod(saleData.payment_method === 'GCash' ? 'GCash' : 'Cash');
            setReturnReason('');

            // Initialize item return selections
            const initialReturnState = {};
            (saleData.items || []).forEach(item => {
                const available = item.available_to_return ?? (item.quantity - (item.returned_quantity || 0));
                initialReturnState[item.sale_item_id || item.id] = {
                    selected: available > 0,
                    quantity: available > 0 ? 1 : 0,
                    maxQuantity: Math.max(0, available),
                    disposition: 'FOUND', // Default: Found Restock (+ Inventory)
                    refund_price: Number(item.price || 0),
                    notes: ''
                };
            });
            setReturnItems(initialReturnState);
        } catch (err) {
            console.error('Failed to load sale items:', err);
            toast.error('Failed to load sale details');
        } finally {
            setLoadingSaleDetails(false);
        }
    };

    const handleToggleItemSelect = (itemId) => {
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

    const handleQuantityChange = (itemId, val) => {
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

    const handleDispositionChange = (itemId, disp) => {
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

    const handleItemNotesChange = (itemId, notes) => {
        setReturnItems(prev => {
            const current = prev[itemId];
            if (!current) return prev;
            return {
                ...prev,
                [itemId]: {
                    ...current,
                    notes
                }
            };
        });
    };

    // Calculate totals for currently selected return items
    const selectedEntries = Object.entries(returnItems).filter(([, it]) => it.selected && it.quantity > 0);
    const totalRefundAmount = selectedEntries.reduce((sum, [, it]) => sum + (it.quantity * it.refund_price), 0);
    const totalUnitsReturning = selectedEntries.reduce((sum, [, it]) => sum + it.quantity, 0);

    // Submit Customer Return & Refund
    const handleProcessReturnSubmit = async (e) => {
        e.preventDefault();

        if (selectedEntries.length === 0) {
            toast.error('Please select at least one item with quantity greater than 0 to return');
            return;
        }

        if (!returnReason.trim()) {
            toast.error('Please specify a return reason or remarks for audit logs');
            return;
        }

        const payloadItems = selectedEntries.map(([saleItemId, it]) => {
            const originalItem = (selectedSale?.items || []).find(si => String(si.sale_item_id || si.id) === String(saleItemId));
            return {
                sale_item_id: Number(saleItemId),
                product_id: originalItem?.product_id,
                quantity: it.quantity,
                refund_price: it.refund_price,
                disposition: it.disposition,
                notes: it.notes
            };
        });

        setSubmittingReturn(true);
        try {
            const res = await api.post(`/sales/${selectedSale.id}/refund`, {
                items: payloadItems,
                refundPaymentMethod,
                reason: returnReason.trim()
            });

            toast.success(res.data?.message || 'Return & Refund processed successfully!');
            setLastProcessedReturn(res.data);
            setSelectedSale(null);
            setReturnItems({});
            setReturnReason('');

            // Refresh recent sales and returns list
            fetchRecentSales();
            fetchReturnsHistory(1);
        } catch (err) {
            console.error('Failed to submit refund:', err);
            toast.error(err.response?.data?.message || 'Failed to process return and refund');
        } finally {
            setSubmittingReturn(false);
        }
    };

    // ==========================================
    // DIRECT INVENTORY ADJUSTMENT SUBMIT
    // ==========================================
    const handleDirectAdjustmentSubmit = async (e) => {
        e.preventDefault();

        if (!directProductId) {
            toast.error('Please select a product from the catalog');
            return;
        }

        if (!directQty || directQty <= 0) {
            toast.error('Please enter a valid positive quantity');
            return;
        }

        if (!directRef.trim()) {
            toast.error('Please enter a reference number (e.g. RTS-001 or DMG-001)');
            return;
        }

        if (!directRemarks.trim()) {
            toast.error('Please provide audit remarks');
            return;
        }

        setSubmittingDirect(true);
        try {
            const res = await api.post('/inventory/adjustments', {
                itemId: Number(directProductId),
                transactionType: directType,
                quantity: Number(directQty),
                referenceNo: directRef.trim(),
                remarks: directRemarks.trim()
            });

            toast.success(res.data?.message || `Inventory adjustment (${directType}) successfully recorded`);
            setDirectRef('');
            setDirectRemarks('');
            setDirectQty(1);
            fetchProductsCatalog();
        } catch (err) {
            console.error('Direct adjustment failed:', err);
            toast.error(err.response?.data?.message || 'Failed to record direct inventory return');
        } finally {
            setSubmittingDirect(false);
        }
    };

    // ==========================================
    // VIEW RECEIPT DETAILS
    // ==========================================
    const handleViewReceipt = async (saleId) => {
        setLoadingReceipt(true);
        try {
            const res = await api.get(`/sales/${saleId}`);
            setReceiptDetails(res.data);
            setSelectedReceiptSaleId(saleId);
        } catch {
            toast.error('Failed to load transaction receipt details');
        } finally {
            setLoadingReceipt(false);
        }
    };

    // Render Disposition badge helper matching prompt rules
    const renderDispositionBadge = (disp) => {
        switch (disp) {
            case 'FOUND':
                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        background: 'rgba(22, 163, 74, 0.12)',
                        color: '#16a34a',
                        border: '1px solid rgba(22, 163, 74, 0.3)'
                    }}>
                        <ArrowUpRight size={13} /> + Found (Restock: + Inventory)
                    </span>
                );
            case 'DAMAGE':
                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        background: 'rgba(220, 38, 38, 0.12)',
                        color: '#dc2626',
                        border: '1px solid rgba(220, 38, 38, 0.3)'
                    }}>
                        <ArrowDownRight size={13} /> - Damage (Return to Supplier - Damage: - Inventory)
                    </span>
                );
            case 'RETURN_TO_SUPPLIER':
                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        background: 'rgba(217, 119, 6, 0.12)',
                        color: '#d97706',
                        border: '1px solid rgba(217, 119, 6, 0.3)'
                    }}>
                        <ArrowDownRight size={13} /> - Return to Supplier (- Inventory)
                    </span>
                );
            case 'LOSS':
                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        background: 'rgba(147, 51, 234, 0.12)',
                        color: '#9333ea',
                        border: '1px solid rgba(147, 51, 234, 0.3)'
                    }}>
                        <ArrowDownRight size={13} /> - Loss (Negative into Inventory)
                    </span>
                );
            default:
                return <span>{disp}</span>;
        }
    };

    return (
        <div style={{ position: 'relative', height: '100%', paddingBottom: '30px' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                        <RotateCcw size={30} color="var(--primary)" /> Return / Refund Center
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 42px' }}>
                        Customer return & refund management, supplier damage dispatch, and stock ledger adjustments.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        onClick={() => navigate('/transactions?tab=returns')}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                    >
                        <History size={16} /> View in Transaction History
                    </button>
                </div>
            </div>

            {/* Inventory Rules Summary Banner */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '12px',
                marginBottom: '20px'
            }}>
                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    borderLeft: '4px solid #16a34a'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#16a34a', fontSize: '0.85rem' }}>
                        <ArrowUpRight size={16} /> Found (+ into Inventory)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Customer returns sellable item in good condition. Restocked back to shelf stock.
                    </div>
                </div>

                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    borderLeft: '4px solid #dc2626'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#dc2626', fontSize: '0.85rem' }}>
                        <ArrowDownRight size={16} /> Damage (- Return to Supplier)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Damaged/defective unit. Sent back to supplier as damaged. Deducted from inventory.
                    </div>
                </div>

                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    borderLeft: '4px solid #9333ea'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#9333ea', fontSize: '0.85rem' }}>
                        <ArrowDownRight size={16} /> Loss (Negative into Inventory)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Unrecovered or missing item write-off. Negative decrement recorded in ledger.
                    </div>
                </div>

                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    borderLeft: '4px solid #d97706'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#d97706', fontSize: '0.85rem' }}>
                        <ArrowDownRight size={16} /> Return to Supplier (- Inventory)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Direct dispatch or RMA return back to supplier. Deducted from store stock.
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('process')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: activeTab === 'process' ? 'var(--primary)' : 'var(--border)',
                        background: activeTab === 'process' ? 'rgba(22, 163, 74, 0.1)' : 'var(--surface)',
                        color: activeTab === 'process' ? 'var(--primary)' : 'var(--text-main)',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <RotateCcw size={16} /> Customer Return & Refund
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: activeTab === 'history' ? 'var(--primary)' : 'var(--border)',
                        background: activeTab === 'history' ? 'rgba(22, 163, 74, 0.1)' : 'var(--surface)',
                        color: activeTab === 'history' ? 'var(--primary)' : 'var(--text-main)',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <History size={16} /> Return Slip History
                    <span style={{
                        background: activeTab === 'history' ? 'var(--primary)' : 'var(--border)',
                        color: activeTab === 'history' ? '#fff' : 'var(--text-muted)',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontSize: '0.72rem'
                    }}>
                        {returnsPagination.total}
                    </span>
                </button>

                {!isStaff && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('direct')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeTab === 'direct' ? 'var(--primary)' : 'var(--border)',
                            background: activeTab === 'direct' ? 'rgba(22, 163, 74, 0.1)' : 'var(--surface)',
                            color: activeTab === 'direct' ? 'var(--primary)' : 'var(--text-main)',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Package size={16} /> Direct Stock Return to Supplier / Write-off
                    </button>
                )}
            </div>

            {/* Success Banner if return was just processed */}
            {lastProcessedReturn && (
                <div style={{
                    background: 'rgba(22, 163, 74, 0.08)',
                    border: '1px solid rgba(22, 163, 74, 0.35)',
                    borderRadius: '8px',
                    padding: '14px 18px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CheckCircle size={22} color="#16a34a" />
                        <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                                Return Reference {lastProcessedReturn.returnNumber} Recorded
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                Refund total: <strong>{formatCurrency(lastProcessedReturn.totalRefundAmount)}</strong>. Inventory ledger and audit history updated.
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => handleViewReceipt(lastProcessedReturn.saleId)}
                            className="btn-primary"
                            style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            <Receipt size={14} /> View Updated Receipt
                        </button>
                        <button
                            onClick={() => setLastProcessedReturn(null)}
                            className="btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* ==================================================== */}
            {/* TAB 1: PROCESS CUSTOMER RETURN & REFUND */}
            {/* ==================================================== */}
            {activeTab === 'process' && (
                <div style={{ display: 'grid', gridTemplateColumns: selectedSale ? '1fr' : '1fr', gap: '20px' }}>
                    {!selectedSale ? (
                        <div className="glass-panel" style={{ padding: '24px' }}>
                            <div style={{ marginBottom: '18px' }}>
                                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Search size={18} color="var(--primary)" /> Step 1: Look Up Order to Return
                                </h2>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                                    Search by Order # (e.g. <code>SO-144</code>), Part Number, or select an eligible transaction below.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder="Search Order #, Cashier, Customer, or Part Number..."
                                        className="input-premium"
                                        style={{ paddingLeft: '36px', width: '100%' }}
                                        value={orderSearchQuery}
                                        onChange={(e) => {
                                            setOrderSearchQuery(e.target.value);
                                            fetchRecentSales(e.target.value);
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={() => fetchRecentSales(orderSearchQuery)}
                                    className="btn-primary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Search size={16} /> Search
                                </button>
                            </div>

                            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '10px' }}>
                                Recent Transactions (Select to Process Return):
                            </div>

                            {loadingRecentSales ? (
                                <Spinner text="Loading eligible transactions..." />
                            ) : (
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Order #</th>
                                                <th>Date</th>
                                                <th>Cashier</th>
                                                <th>Products Sold</th>
                                                <th>Payment</th>
                                                <th className="text-right">Total Paid</th>
                                                <th>Status</th>
                                                <th className="text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recentSales.length === 0 ? (
                                                <tr>
                                                    <td colSpan="8" className="table-empty-state">
                                                        No transactions found matching your search.
                                                    </td>
                                                </tr>
                                            ) : (
                                                recentSales.map(s => (
                                                    <tr key={s.id}>
                                                        <td style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                            {s.order_number || `SO-${s.id}`}
                                                        </td>
                                                        <td>{formatAuditDate(s.sale_date)}</td>
                                                        <td style={{ textTransform: 'capitalize' }}>{s.cashier}</td>
                                                        <td>
                                                            <div style={{ fontSize: '0.82rem', maxWidth: '320px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {s.products_included || '-'}
                                                            </div>
                                                        </td>
                                                        <td>{s.payment_method || 'Cash'}</td>
                                                        <td className="text-right" style={{ fontWeight: 700 }}>
                                                            {formatCurrency(s.total_amount)}
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                display: 'inline-block',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 600,
                                                                background: s.status === 'REFUNDED' ? 'rgba(220, 38, 38, 0.12)' : s.status === 'PARTIALLY_REFUNDED' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(22, 163, 74, 0.1)',
                                                                color: s.status === 'REFUNDED' ? '#dc2626' : s.status === 'PARTIALLY_REFUNDED' ? '#d97706' : '#16a34a'
                                                            }}>
                                                                {s.status === 'PARTIALLY_REFUNDED' ? 'PARTIAL REFUND' : s.status}
                                                            </span>
                                                        </td>
                                                        <td className="text-right">
                                                            <button
                                                                onClick={() => handleSelectSale(s)}
                                                                className="btn-primary"
                                                                style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                <RotateCcw size={13} /> Return Items
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Step 2: Return & Refund Form */
                        <div className="glass-panel" style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '20px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                                            Step 2: Process Return for Order {selectedSale.order_number || `SO-${selectedSale.id}`}
                                        </h2>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            background: 'rgba(22, 163, 74, 0.1)',
                                            color: 'var(--primary)'
                                        }}>
                                            {selectedSale.status}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                                        Sold on {formatAuditDate(selectedSale.sale_date)} by cashier <strong style={{ textTransform: 'capitalize' }}>{selectedSale.cashier}</strong> • Original Payment: <strong>{selectedSale.payment_method}</strong>
                                    </p>
                                </div>
                                <button
                                    onClick={() => setSelectedSale(null)}
                                    className="btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}
                                >
                                    <X size={14} /> Change Order
                                </button>
                            </div>

                            {loadingSaleDetails ? (
                                <Spinner text="Loading order line items..." />
                            ) : (
                                <form onSubmit={handleProcessReturnSubmit}>
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '10px' }}>
                                            Select Products to Return and Specify Reason / Inventory Impact:
                                        </div>

                                        <div className="table-container">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '40px', textAlign: 'center' }}>Return</th>
                                                        <th>Product Particulars</th>
                                                        <th style={{ textAlign: 'center' }}>Sold</th>
                                                        <th style={{ textAlign: 'center' }}>Available</th>
                                                        <th style={{ width: '90px', textAlign: 'center' }}>Return Qty</th>
                                                        <th>Return Type & Inventory Impact</th>
                                                        <th className="text-right">Refund Subtotal</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(selectedSale.items || []).map(item => {
                                                        const itemId = item.sale_item_id || item.id;
                                                        const state = returnItems[itemId] || { selected: false, quantity: 0, maxQuantity: 0, disposition: 'FOUND', refund_price: item.price };
                                                        const isMaxedOut = state.maxQuantity <= 0;

                                                        return (
                                                            <tr
                                                                key={itemId}
                                                                style={{
                                                                    background: state.selected ? 'rgba(22, 163, 74, 0.04)' : 'transparent',
                                                                    opacity: isMaxedOut ? 0.5 : 1
                                                                }}
                                                            >
                                                                <td style={{ textAlign: 'center' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={state.selected}
                                                                        disabled={isMaxedOut}
                                                                        onChange={() => handleToggleItemSelect(itemId)}
                                                                        style={{ cursor: isMaxedOut ? 'not-allowed' : 'pointer' }}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', background: 'var(--surface-hover)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                                                            {item.part_number || '-'}
                                                                        </span>
                                                                        {item.serial_numbers && (
                                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--primary)', background: 'rgba(22, 163, 74, 0.1)', padding: '1px 6px', borderRadius: '4px' }}>
                                                                                SN: {item.serial_numbers}
                                                                            </span>
                                                                        )}
                                                                        {item.returned_quantity > 0 && (
                                                                            <span style={{ fontSize: '0.72rem', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: '4px' }}>
                                                                                Already Returned: {item.returned_quantity}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                                                                <td style={{ textAlign: 'center', fontWeight: 600, color: isMaxedOut ? 'var(--text-muted)' : 'var(--primary)' }}>
                                                                    {state.maxQuantity}
                                                                </td>
                                                                <td style={{ textAlign: 'center' }}>
                                                                    {isMaxedOut ? (
                                                                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Returned</span>
                                                                    ) : (
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            max={state.maxQuantity}
                                                                            value={state.quantity || ''}
                                                                            onChange={(e) => handleQuantityChange(itemId, e.target.value)}
                                                                            disabled={!state.selected}
                                                                            style={{
                                                                                width: '60px',
                                                                                textAlign: 'center',
                                                                                padding: '4px',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid var(--border)',
                                                                                background: state.selected ? 'var(--surface)' : 'var(--bg-base)'
                                                                            }}
                                                                        />
                                                                    )}
                                                                </td>
                                                                <td>
                                                                    <select
                                                                        value={state.disposition}
                                                                        disabled={!state.selected}
                                                                        onChange={(e) => handleDispositionChange(itemId, e.target.value)}
                                                                        className="input-premium"
                                                                        style={{
                                                                            width: '100%',
                                                                            fontSize: '0.78rem',
                                                                            padding: '4px 8px',
                                                                            opacity: state.selected ? 1 : 0.6
                                                                        }}
                                                                    >
                                                                        <option value="FOUND">🟢 Found (+ into Inventory: Restock)</option>
                                                                        <option value="DAMAGE">🔴 Damage (- Return to Supplier - Damage)</option>
                                                                        <option value="LOSS">🟣 Loss (Negative into Inventory)</option>
                                                                        <option value="RETURN_TO_SUPPLIER">🟠 Return to Supplier (- Inventory)</option>
                                                                    </select>
                                                                </td>
                                                                <td className="text-right" style={{ fontWeight: 700, color: state.selected ? 'var(--primary)' : 'var(--text-muted)' }}>
                                                                    {formatCurrency(state.selected ? (state.quantity * state.refund_price) : 0)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Refund options & remarks */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                                                Refund Payment Method
                                            </label>
                                            <select
                                                className="input-premium"
                                                value={refundPaymentMethod}
                                                onChange={(e) => setRefundPaymentMethod(e.target.value)}
                                                style={{ width: '100%' }}
                                            >
                                                <option value="Cash">Cash Refund</option>
                                                <option value="GCash">GCash Payment</option>
                                                <option value="Original Payment">Original Payment Method ({selectedSale.payment_method})</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                                                Total Refund Amount Due to Customer
                                            </label>
                                            <div style={{
                                                padding: '8px 14px',
                                                borderRadius: '6px',
                                                background: 'rgba(22, 163, 74, 0.08)',
                                                border: '1px solid rgba(22, 163, 74, 0.25)',
                                                fontSize: '1.25rem',
                                                fontWeight: 'bold',
                                                color: 'var(--primary)'
                                            }}>
                                                {formatCurrency(totalRefundAmount)}
                                                <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '8px' }}>
                                                    ({totalUnitsReturning} item{totalUnitsReturning !== 1 ? 's' : ''} returning)
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '24px' }}>
                                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                                            Return Reason & Audit Remarks <span style={{ color: '#dc2626' }}>*</span>
                                        </label>
                                        <textarea
                                            className="input-premium"
                                            rows="3"
                                            placeholder="Provide reason for return (e.g. Customer ordered incorrect size, defective part returned to supplier, damage upon unboxing)..."
                                            value={returnReason}
                                            onChange={(e) => setReturnReason(e.target.value)}
                                            style={{ width: '100%', resize: 'vertical' }}
                                            required
                                        />
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedSale(null)}
                                            className="btn-secondary"
                                            disabled={submittingReturn}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="btn-primary"
                                            disabled={submittingReturn || selectedEntries.length === 0}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontWeight: 700 }}
                                        >
                                            {submittingReturn ? <Spinner text="Processing Refund..." /> : (
                                                <>
                                                    <RotateCcw size={16} /> Process & Issue Refund ({formatCurrency(totalRefundAmount)})
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ==================================================== */}
            {/* TAB 2: RETURN SLIP HISTORY */}
            {/* ==================================================== */}
            {activeTab === 'history' && (
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <History size={18} color="var(--primary)" /> Processed Return & Refund History
                            </h2>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                Complete audit log of customer return slips, inventory movements, and cash refunds.
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/transactions?tab=returns')}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                        >
                            Open in Transaction History
                        </button>
                    </div>

                    {/* Filter bar */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: '1 1 240px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Search return #, order #, part #, cashier, remarks..."
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
                                style={{ paddingLeft: '36px' }}
                                value={historyDate}
                                onChange={(e) => setHistoryDate(e.target.value)}
                            />
                        </div>
                        {historyDate && (
                            <button className="btn-secondary" onClick={() => setHistoryDate('')}>Clear Date</button>
                        )}
                    </div>

                    {loadingReturns ? (
                        <Spinner text="Loading return slips..." />
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Return Ref #</th>
                                        <th>Order No.</th>
                                        <th>Date & Time</th>
                                        <th>Cashier</th>
                                        <th>Returned Products</th>
                                        <th>Inventory Disposition</th>
                                        <th>Refund Method</th>
                                        <th className="text-right">Refund Amount</th>
                                        <th>Remarks</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {returnsList.length === 0 ? (
                                        <tr>
                                            <td colSpan="10" className="table-empty-state">
                                                No return slips recorded matching current filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        returnsList.map(ret => (
                                            <tr key={ret.id}>
                                                <td style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                    {ret.return_number}
                                                </td>
                                                <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                    {ret.order_number || `SO-${ret.sale_id}`}
                                                </td>
                                                <td>{formatAuditDate(ret.created_at)}</td>
                                                <td style={{ textTransform: 'capitalize' }}>{ret.cashier}</td>
                                                <td>
                                                    <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                                                        {ret.products_returned || '-'}
                                                    </div>
                                                    {ret.part_numbers && (
                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                            {ret.part_numbers}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                        {(ret.dispositions || '').split(',').map((disp, di) => {
                                                            const clean = disp.trim();
                                                            if (!clean) return null;
                                                            return <span key={di}>{renderDispositionBadge(clean)}</span>;
                                                        })}
                                                    </div>
                                                </td>
                                                <td>{ret.refund_payment_method || 'Cash'}</td>
                                                <td className="text-right" style={{ fontWeight: 700, color: '#dc2626' }}>
                                                    -{formatCurrency(ret.total_refund_amount)}
                                                </td>
                                                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '200px' }}>
                                                    {ret.reason || '-'}
                                                </td>
                                                <td>
                                                    <button
                                                        onClick={() => handleViewReceipt(ret.sale_id)}
                                                        className="btn-secondary"
                                                        style={{ padding: '4px 8px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        disabled={loadingReceipt}
                                                    >
                                                        <Receipt size={13} /> View Receipt
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ==================================================== */}
            {/* TAB 3: DIRECT STOCK RETURN TO SUPPLIER / WRITE-OFF */}
            {/* ==================================================== */}
            {activeTab === 'direct' && !isStaff && (
                <div className="glass-panel" style={{ padding: '24px', maxWidth: '750px' }}>
                    <div style={{ marginBottom: '20px' }}>
                        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Package size={18} color="var(--primary)" /> Direct Inventory Return to Supplier & Write-Offs
                        </h2>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                            Perform direct warehouse/shelf inventory movements: dispatch defective units to suppliers, write off lost stock, or record found parts.
                        </p>
                    </div>

                    <form onSubmit={handleDirectAdjustmentSubmit}>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                                Select Product from Inventory
                            </label>
                            <select
                                className="input-premium"
                                value={directProductId}
                                onChange={(e) => setDirectProductId(e.target.value)}
                                style={{ width: '100%' }}
                                required
                            >
                                <option value="">-- Choose Product --</option>
                                {productsCatalog.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} ({p.part_number}) — In Stock: {p.current_stock ?? p.stock ?? 0}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                                    Adjustment / Return Type
                                </label>
                                <select
                                    className="input-premium"
                                    value={directType}
                                    onChange={(e) => setDirectType(e.target.value)}
                                    style={{ width: '100%' }}
                                >
                                    <option value="DAMAGE">🔴 Damage - Return to Supplier - Damage (- Stock)</option>
                                    <option value="RETURN_TO_SUPPLIER">🟠 Return to Supplier (- Stock)</option>
                                    <option value="LOSS">🟣 Loss (- Negative into Inventory)</option>
                                    <option value="FOUND">🟢 Found (+ Plus into Inventory)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                                    Quantity
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    className="input-premium"
                                    value={directQty}
                                    onChange={(e) => setDirectQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                    style={{ width: '100%' }}
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                                Audit Reference Number (e.g. RTS-PO-1029 or DMG-CAL-01)
                            </label>
                            <input
                                type="text"
                                className="input-premium"
                                placeholder="Enter reference number..."
                                value={directRef}
                                onChange={(e) => setDirectRef(e.target.value)}
                                style={{ width: '100%' }}
                                required
                            />
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                                Reason & Audit Remarks
                            </label>
                            <textarea
                                className="input-premium"
                                rows="3"
                                placeholder="Provide detailed explanation for this return / write-off..."
                                value={directRemarks}
                                onChange={(e) => setDirectRemarks(e.target.value)}
                                style={{ width: '100%', resize: 'vertical' }}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={submittingDirect}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontWeight: 700 }}
                        >
                            {submittingDirect ? <Spinner text="Submitting Adjustment..." /> : (
                                <>
                                    <Package size={16} /> Record Inventory Return / Adjustment
                                </>
                            )}
                        </button>
                    </form>
                </div>
            )}

            {/* Receipt Modal */}
            {selectedReceiptSaleId && receiptDetails && (
                <div className="receipt-modal" style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    overflowY: 'auto'
                }}>
                    <div className="glass-panel" style={{
                        background: '#ffffff',
                        color: '#111111',
                        padding: '24px',
                        maxWidth: '450px',
                        width: '100%',
                        borderRadius: '12px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        position: 'relative'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Receipt size={16} /> Receipt & Return Slips
                            </h3>
                            <button
                                onClick={() => {
                                    setSelectedReceiptSaleId(null);
                                    setReceiptDetails(null);
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Thermal receipt rendering */}
                        <ReceiptPrint
                            orderNumber={receiptDetails.order_number || `SO-${receiptDetails.id}`}
                            date={new Date(receiptDetails.sale_date)}
                            cashier={receiptDetails.cashier}
                            items={receiptDetails.items || []}
                            totalAmount={Number(receiptDetails.total_amount)}
                            paymentMethod={receiptDetails.payment_method}
                            amountTendered={Number(receiptDetails.tendered_amount || 0)}
                            changeDue={Number(receiptDetails.change_due || 0)}
                            gcashReference={receiptDetails.payment_reference || ''}
                            cashAmount={receiptDetails.cash_amount}
                            gcashAmount={receiptDetails.gcash_amount}
                            width="80mm"
                        />

                        {/* Existing return history for this order if any */}
                        {receiptDetails.returns && receiptDetails.returns.length > 0 && (
                            <div style={{ marginTop: '16px', borderTop: '1px dashed #cbd5e1', paddingTop: '12px' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px', color: '#dc2626' }}>
                                    Processed Returns on this Order:
                                </div>
                                {receiptDetails.returns.map(ret => (
                                    <div key={ret.id} style={{ background: '#f8fafc', padding: '8px', borderRadius: '6px', marginBottom: '6px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                                            <span>{ret.return_number}</span>
                                            <span style={{ color: '#dc2626' }}>-{formatCurrency(ret.total_refund_amount)}</span>
                                        </div>
                                        <div style={{ color: '#64748b', fontSize: '0.72rem' }}>
                                            {formatAuditDate(ret.created_at)} by {ret.cashier}
                                        </div>
                                        <div style={{ marginTop: '4px', fontStyle: 'italic', color: '#475569' }}>
                                            Reason: {ret.reason || 'Customer Return'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                            <button
                                onClick={() => window.print()}
                                className="btn-primary"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                            >
                                <Printer size={14} /> Print
                            </button>
                            <button
                                onClick={() => {
                                    setSelectedReceiptSaleId(null);
                                    setReceiptDetails(null);
                                }}
                                className="btn-secondary"
                                style={{ fontSize: '0.8rem' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
