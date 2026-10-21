import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import { notifyInventoryChange } from '../utils/syncEvents';
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
    // 2. RETURNS & AUDIT HISTORY STATE
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

    // Returns & Stock Adjustment Audit History state
    const [auditHistory, setAuditHistory] = useState([]);
    const [loadingAudit, setLoadingAudit] = useState(false);
    const [auditFilter, setAuditFilter] = useState('ALL');
    const [auditSearch, setAuditSearch] = useState('');
    const [auditDate, setAuditDate] = useState('');
    const [auditPagination, setAuditPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1
    });
    const [supplierReturnTarget, setSupplierReturnTarget] = useState(null);
    const [supplierNameInput, setSupplierNameInput] = useState('');
    const [supplierRemarksInput, setSupplierRemarksInput] = useState('');
    const [submittingSupplierReturn, setSubmittingSupplierReturn] = useState(false);

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


    const fetchAuditHistory = useCallback(async (targetPage = 1, customLimit) => {
        setLoadingAudit(true);
        try {
            const activeLimit = customLimit || auditPagination.limit || 10;
            const res = await api.get('/sales/returns/audit-history', {
                params: {
                    page: targetPage,
                    limit: activeLimit,
                    filter: auditFilter !== 'ALL' ? auditFilter : undefined,
                    search: auditSearch || undefined,
                    date: auditDate || undefined
                }
            });
            const data = res.data;
            setAuditHistory(data?.data || []);
            if (data?.pagination) {
                setAuditPagination(data.pagination);
            }
        } catch (err) {
            console.error('Failed to load return/refund audit history:', err);
        } finally {
            setLoadingAudit(false);
        }
    }, [auditFilter, auditSearch, auditDate, auditPagination.limit]);

    useEffect(() => {
        fetchAuditHistory();
    }, [fetchAuditHistory]);

    useEffect(() => {
        if (activeTab === 'history') {
            fetchAuditHistory();
        }
    }, [activeTab, fetchAuditHistory]);

    const handleExecuteSupplierReturn = async (e) => {
        e.preventDefault();
        if (!supplierReturnTarget) return;

        setSubmittingSupplierReturn(true);
        try {
            const res = await api.post('/sales/returns/damage-to-supplier', {
                historyId: supplierReturnTarget.id,
                supplierName: supplierNameInput.trim() || 'Parts Supplier',
                remarks: supplierRemarksInput.trim() || undefined
            });

            toast.success(res.data?.message || 'Returned to supplier successfully');
            setSupplierReturnTarget(null);
            setSupplierNameInput('');
            setSupplierRemarksInput('');
            fetchAuditHistory();
            fetchProductsCatalog();
            notifyInventoryChange({ source: 'damage-to-supplier', id: supplierReturnTarget.id });
        } catch (err) {
            console.error('Error executing supplier return:', err);
            toast.error(err.response?.data?.message || 'Failed to dispatch to supplier');
        } finally {
            setSubmittingSupplierReturn(false);
        }
    };

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
            fetchAuditHistory();
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
                    disposition: 'RESTOCK', // Default: Good Condition (+ Restock into Inventory)
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
            notifyInventoryChange('return');
            setLastProcessedReturn(res.data);
            setSelectedSale(null);
            setReturnItems({});
            setReturnReason('');

            // Refresh recent sales and returns list
            fetchRecentSales();
            fetchReturnsHistory(1);
            fetchAuditHistory();
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
            notifyInventoryChange('adjustment');
            setDirectRef('');
            setDirectRemarks('');
            setDirectQty(1);
            fetchProductsCatalog();
            fetchAuditHistory();
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

    const renderEffectBadge = (effect) => {
        const text = String(effect || '');
        if (text.includes('-') && text.includes('Damage')) {
            return (
                <span style={{
                    display: 'inline-block',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: 'rgba(249, 115, 22, 0.15)',
                    color: '#ea580c',
                    border: '1px solid rgba(249, 115, 22, 0.35)'
                }}>
                    {text}
                </span>
            );
        }
        if (text.includes('-') && text.includes('Inventory')) {
            return (
                <span style={{
                    display: 'inline-block',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#dc2626',
                    border: '1px solid rgba(239, 68, 68, 0.35)'
                }}>
                    {text}
                </span>
            );
        }
        if (text.includes('+') && text.includes('Damage')) {
            return (
                <span style={{
                    display: 'inline-block',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: 'rgba(234, 179, 8, 0.18)',
                    color: '#ca8a04',
                    border: '1px solid rgba(234, 179, 8, 0.4)'
                }}>
                    {text}
                </span>
            );
        }
        return (
            <span style={{
                display: 'inline-block',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: 'rgba(22, 163, 74, 0.15)',
                color: '#16a34a',
                border: '1px solid rgba(22, 163, 74, 0.35)'
            }}>
                {text}
            </span>
        );
    };

    const renderFlowPathBadge = (flowPath) => {
        const text = String(flowPath || '');
        let bg = 'var(--surface-hover, #f3f4f6)';
        let color = 'var(--text-main, #111111)';
        let border = 'var(--border, #e5e7eb)';

        if (text.includes('Damage → Return to Supplier')) {
            bg = 'rgba(234, 88, 12, 0.12)';
            color = '#ea580c';
            border = 'rgba(234, 88, 12, 0.3)';
        } else if (text.includes('Damage')) {
            bg = 'rgba(220, 38, 38, 0.1)';
            color = '#dc2626';
            border = 'rgba(220, 38, 38, 0.25)';
        } else if (text.includes('Good') || text.includes('Found')) {
            bg = 'rgba(22, 163, 74, 0.1)';
            color = '#16a34a';
            border = 'rgba(22, 163, 74, 0.25)';
        } else if (text.includes('Loss')) {
            bg = 'rgba(147, 51, 234, 0.1)';
            color = '#9333ea';
            border = 'rgba(147, 51, 234, 0.25)';
        } else if (text.includes('Return to Supplier')) {
            bg = 'rgba(217, 119, 6, 0.1)';
            color = '#d97706';
            border = 'rgba(217, 119, 6, 0.25)';
        }

        return (
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '0.74rem',
                fontWeight: 600,
                background: bg,
                color: color,
                border: `1px solid ${border}`
            }}>
                {flowPath}
            </span>
        );
    };

    const renderDispositionBadge = (disp) => {
        switch (disp) {
            case 'RESTOCK':
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
                        <ArrowUpRight size={13} /> {disp === 'RESTOCK' ? '+ Good Condition (Restock: + Inventory)' : '+ Found (+ Inventory)'}
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
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
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
                        <ArrowUpRight size={16} /> Customer: Good Condition (+ Restock)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Customer returns sellable item in good condition. Restocked back to shelf stock (+1 Inventory).
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
                        <ArrowDownRight size={16} /> Customer: Defective / Damaged (+ Damage Pool)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Customer returns broken unit. Kept off sellable shelf and held in Damage Pool for supplier return.
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
                        <ArrowDownRight size={16} /> Warehouse: Loss (- Inventory) & Found (+ Inv)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Internal inventory count discrepancies: Loss deducts missing stock, Found adds discovered surplus.
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
                        <ArrowDownRight size={16} /> Supplier: Return to Supplier (- Stock)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Direct dispatch or RMA return back to supplier. Deducted from damaged pool or shelf stock.
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
                    <History size={16} /> Return / Refund & Stock Adjustment History
                    <span style={{
                        background: activeTab === 'history' ? 'var(--primary)' : 'var(--border)',
                        color: activeTab === 'history' ? '#fff' : 'var(--text-muted)',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontSize: '0.72rem'
                    }}>
                        {auditPagination.total || auditHistory.length}
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
                                                                        value={state.disposition || 'RESTOCK'}
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
                                                                        <option value="RESTOCK">🟢 Good Condition (+ Restock to Inventory)</option>
                                                                        <option value="DAMAGE">🔴 Defective / Damaged (+ Move to Damage Pool)</option>
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
            {/* TAB 2: RETURN / REFUND & STOCK ADJUSTMENT HISTORY */}
            {/* ==================================================== */}
            {activeTab === 'history' && (
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <History size={20} color="var(--primary)" /> Return / Refund & Stock Adjustment History Table
                            </h2>
                            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                                Complete trace of customer returns, stock damages, losses, found units, and supplier returns. Proves sellable inventory vs. damage balances side-by-side.
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/transactions?tab=returns')}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                        >
                            <Receipt size={14} /> Open in Transaction History
                        </button>
                    </div>

                    {/* Category Filter Tabs */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {[
                            { key: 'ALL', label: 'All Movements' },
                            { key: 'CUSTOMER_RETURNS', label: 'Customer Returns' },
                            { key: 'DAMAGE', label: 'Damage' },
                            { key: 'LOSS', label: 'Loss' },
                            { key: 'FOUND', label: 'Found' },
                            { key: 'RETURN_TO_SUPPLIER', label: 'Returned to Supplier' }
                        ].map(f => (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => { setAuditFilter(f.key); fetchAuditHistory(1); }}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    border: '1px solid',
                                    borderColor: auditFilter === f.key ? 'var(--primary)' : 'var(--border)',
                                    background: auditFilter === f.key ? 'var(--primary)' : 'var(--surface)',
                                    color: auditFilter === f.key ? '#fff' : 'var(--text-main)',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {/* Search and Date filter bar */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: '1 1 240px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Search ref #, order #, part #, product, remarks, staff..."
                                className="input-premium"
                                style={{ paddingLeft: '36px', width: '100%' }}
                                value={auditSearch}
                                onChange={(e) => setAuditSearch(e.target.value)}
                            />
                        </div>
                        <div style={{ position: 'relative', flex: '0 0 auto' }}>
                            <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="date"
                                className="input-premium"
                                style={{ paddingLeft: '36px' }}
                                value={auditDate}
                                onChange={(e) => setAuditDate(e.target.value)}
                            />
                        </div>
                        {auditDate && (
                            <button className="btn-secondary" onClick={() => setAuditDate('')}>Clear Date</button>
                        )}
                        <button
                            className="btn-secondary"
                            onClick={() => fetchAuditHistory()}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                            title="Refresh Audit Table"
                        >
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </div>

                    {loadingAudit ? (
                        <Spinner text="Loading return & stock adjustment audit trail..." />
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date & Time</th>
                                        <th>Reference / Order No.</th>
                                        <th>Part No. & Product Name</th>
                                        <th>Category / Flow Path</th>
                                        <th>Effect (+ / - Bucket)</th>
                                        <th style={{ textAlign: 'center' }}>Sellable Inventory (Before → After)</th>
                                        <th style={{ textAlign: 'center' }}>Damage Pool (Before → After)</th>
                                        <th>Processed By & Remarks</th>
                                        <th className="text-right">Action / Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditHistory.length === 0 ? (
                                        <tr>
                                            <td colSpan="9" className="table-empty-state">
                                                No return or stock adjustment records match your filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        auditHistory.map(row => (
                                            <tr key={row.id}>
                                                <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                                                    {formatAuditDate(row.created_at)}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)', fontSize: '0.85rem' }}>
                                                        {row.reference_no}
                                                    </div>
                                                    {row.order_id && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewReceipt(row.order_id)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                padding: '2px 0 0 0',
                                                                fontSize: '0.73rem',
                                                                color: 'var(--primary)',
                                                                fontFamily: 'monospace',
                                                                cursor: 'pointer',
                                                                textDecoration: 'underline',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px'
                                                            }}
                                                            title="Click to view order receipt"
                                                        >
                                                            <Receipt size={11} /> Order #SO-{row.order_id}
                                                        </button>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>
                                                        {row.product_name}
                                                    </div>
                                                    {row.part_number && (
                                                        <span style={{
                                                            display: 'inline-block',
                                                            marginTop: '2px',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            background: 'var(--surface-hover)',
                                                            border: '1px solid var(--border)',
                                                            fontFamily: 'monospace',
                                                            fontSize: '0.74rem',
                                                            color: 'var(--text-main)',
                                                            fontWeight: 600
                                                        }}>
                                                            {row.part_number}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    {renderFlowPathBadge(row.flow_path || row.movement_type)}
                                                </td>
                                                <td>
                                                    {renderEffectBadge(row.effect_badge)}
                                                </td>
                                                <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>{row.inv_before}</span>
                                                    <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
                                                    <strong style={{ color: row.inv_after < row.inv_before ? '#dc2626' : (row.inv_after > row.inv_before ? 'var(--primary)' : 'inherit') }}>
                                                        {row.inv_after}
                                                    </strong>
                                                </td>
                                                <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>{row.damage_before}</span>
                                                    <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
                                                    <strong style={{ color: row.damage_after > row.damage_before ? '#ca8a04' : (row.damage_after < row.damage_before ? '#ea580c' : 'inherit') }}>
                                                        {row.damage_after}
                                                    </strong>
                                                </td>
                                                <td>
                                                    <div style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.78rem' }}>
                                                        {row.processed_by || 'staff'}
                                                    </div>
                                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', maxWidth: '240px', marginTop: '2px' }}>
                                                        {row.remarks || '-'}
                                                    </div>
                                                </td>
                                                <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                                                    {row.status === 'PENDING_SUPPLIER_RETURN' ? (
                                                        <button
                                                            onClick={() => {
                                                                setSupplierReturnTarget(row);
                                                                setSupplierNameInput(row.supplier_name || 'JVT Parts Supplier');
                                                                setSupplierRemarksInput('Handed defective unit back to supplier delivery rider');
                                                            }}
                                                            className="btn-primary"
                                                            style={{
                                                                padding: '4px 10px',
                                                                fontSize: '0.74rem',
                                                                background: '#ea580c',
                                                                borderColor: '#ea580c',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                            title="Return this damaged item to supplier"
                                                        >
                                                            <Truck size={13} /> Return to Supplier
                                                        </button>
                                                    ) : row.status === 'RETURNED_TO_SUPPLIER' ? (
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '3px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700,
                                                            background: 'rgba(22, 163, 74, 0.12)',
                                                            color: '#16a34a',
                                                            border: '1px solid rgba(22, 163, 74, 0.3)'
                                                        }}>
                                                            <CheckCircle size={12} /> Returned to Supplier
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '3px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 600,
                                                            background: 'rgba(107, 114, 128, 0.1)',
                                                            color: 'var(--text-muted)',
                                                            border: '1px solid var(--border)'
                                                        }}>
                                                            {row.status || 'Completed'}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination Footer */}
                    {!loadingAudit && auditPagination.total > 0 && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: '20px',
                            flexWrap: 'wrap',
                            gap: '12px',
                            paddingTop: '16px',
                            borderTop: '1px solid var(--border)'
                        }}>
                            {/* Summary & Rows Selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                <span>
                                    Showing <strong style={{ color: 'var(--text-main)' }}>{(auditPagination.page - 1) * auditPagination.limit + 1}</strong> to <strong style={{ color: 'var(--text-main)' }}>{Math.min(auditPagination.page * auditPagination.limit, auditPagination.total)}</strong> of <strong style={{ color: 'var(--text-main)' }}>{auditPagination.total}</strong> records
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>Rows:</span>
                                    <select
                                        className="input-premium"
                                        value={auditPagination.limit}
                                        onChange={(e) => {
                                            const newLimit = Number(e.target.value);
                                            fetchAuditHistory(1, newLimit);
                                        }}
                                        style={{ padding: '3px 8px', fontSize: '0.82rem' }}
                                    >
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                </div>
                            </div>

                            {/* Page Navigation Buttons */}
                            {auditPagination.totalPages > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                        type="button"
                                        disabled={auditPagination.page <= 1}
                                        onClick={() => fetchAuditHistory(auditPagination.page - 1)}
                                        className="btn-secondary"
                                        style={{
                                            padding: '4px 12px',
                                            fontSize: '0.82rem',
                                            opacity: auditPagination.page <= 1 ? 0.45 : 1,
                                            cursor: auditPagination.page <= 1 ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        Previous
                                    </button>

                                    {Array.from({ length: auditPagination.totalPages }, (_, i) => i + 1)
                                        .filter(p => {
                                            if (p === 1 || p === auditPagination.totalPages) return true;
                                            return Math.abs(p - auditPagination.page) <= 1;
                                        })
                                        .map((p, idx, arr) => {
                                            const prevP = arr[idx - 1];
                                            const hasGap = prevP && p - prevP > 1;
                                            return (
                                                <React.Fragment key={p}>
                                                    {hasGap && <span style={{ padding: '0 4px', color: 'var(--text-muted)' }}>...</span>}
                                                    <button
                                                        type="button"
                                                        onClick={() => fetchAuditHistory(p)}
                                                        style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '6px',
                                                            border: '1px solid',
                                                            borderColor: auditPagination.page === p ? 'var(--primary)' : 'var(--border)',
                                                            background: auditPagination.page === p ? 'var(--primary)' : 'var(--surface)',
                                                            color: auditPagination.page === p ? '#fff' : 'var(--text-main)',
                                                            fontWeight: 600,
                                                            fontSize: '0.82rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {p}
                                                    </button>
                                                </React.Fragment>
                                            );
                                        })}

                                    <button
                                        type="button"
                                        disabled={auditPagination.page >= auditPagination.totalPages}
                                        onClick={() => fetchAuditHistory(auditPagination.page + 1)}
                                        className="btn-secondary"
                                        style={{
                                            padding: '4px 12px',
                                            fontSize: '0.82rem',
                                            opacity: auditPagination.page >= auditPagination.totalPages ? 0.45 : 1,
                                            cursor: auditPagination.page >= auditPagination.totalPages ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
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


            {/* Modal: Return Damaged Unit to Supplier */}
            {supplierReturnTarget && (
                <div className="receipt-modal" style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    zIndex: 10001,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div className="glass-panel" style={{
                        background: 'var(--surface, #FFFFFF)',
                        color: 'var(--text-main, #111111)',
                        padding: '24px',
                        width: '100%',
                        maxWidth: '520px',
                        borderRadius: '12px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#ea580c' }}>
                                <Truck size={18} /> Return Damaged Unit to Supplier
                            </h3>
                            <button
                                onClick={() => setSupplierReturnTarget(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteSupplierReturn}>
                            <div style={{ background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.25)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>
                                    {supplierReturnTarget.product_name}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    Part Number: <code style={{ fontWeight: 600 }}>{supplierReturnTarget.part_number}</code> • Ref: {supplierReturnTarget.reference_no}
                                </div>
                                <div style={{ marginTop: '8px', fontSize: '0.8rem', display: 'flex', gap: '16px' }}>
                                    <span>Units to Dispatch: <strong>{supplierReturnTarget.qty} pc(s)</strong></span>
                                    <span>Effect: <strong style={{ color: '#ea580c' }}>-{supplierReturnTarget.qty} Damage</strong></span>
                                </div>
                                <div style={{ marginTop: '4px', fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    * Sellable shelf inventory is preserved ({supplierReturnTarget.inv_before} → {supplierReturnTarget.inv_after}). Only the Damage Pool decrements from {supplierReturnTarget.damage_after} → {Math.max(0, supplierReturnTarget.damage_after - supplierReturnTarget.qty)}.
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                                    Supplier / Distributor Name
                                </label>
                                <input
                                    type="text"
                                    className="input-premium"
                                    style={{ width: '100%' }}
                                    placeholder="e.g. JVT Parts Supplier / Yamaha Genuine Supplier"
                                    value={supplierNameInput}
                                    onChange={(e) => setSupplierNameInput(e.target.value)}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                                    Dispatch Remarks / Courier Receipt
                                </label>
                                <textarea
                                    className="input-premium"
                                    rows="2"
                                    style={{ width: '100%', resize: 'vertical' }}
                                    placeholder="Remarks (e.g. Handed defective unit back to supplier delivery rider)..."
                                    value={supplierRemarksInput}
                                    onChange={(e) => setSupplierRemarksInput(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setSupplierReturnTarget(null)}
                                    className="btn-secondary"
                                    disabled={submittingSupplierReturn}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    style={{ background: '#ea580c', borderColor: '#ea580c', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    disabled={submittingSupplierReturn}
                                >
                                    {submittingSupplierReturn ? <Spinner text="Dispatching..." /> : (
                                        <>
                                            <Truck size={14} /> Confirm & Dispatch to Supplier
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
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
