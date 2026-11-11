import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
    ArrowLeftRight,
    Search,
    RefreshCw,
    Printer,
    FileSpreadsheet,
    Calendar,
    AlertTriangle,
    CheckCircle2,
    Package,
    DollarSign,
    ShieldAlert,
    RotateCcw,
    Layers,
    Users,
    ChevronRight,
    X,
    Clock,
    Plus,
    Check,
    Receipt,
    Wallet,
    Info,
    Ban
} from 'lucide-react';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

export const ItemSwap = () => {
    const { user } = useContext(AuthContext);
    const currentUser = user || { username: 'Staff', role: 'Staff' };

    // Tabs: 'new_swap' | 'swap_history'
    const [activeTab, setActiveTab] = useState('new_swap');

    // ==========================================
    // 1. NEW SWAP FORM STATE
    // ==========================================
    // Original Order lookup
    const [lookupQuery, setLookupQuery] = useState('');
    const [lookingUpOrder, setLookingUpOrder] = useState(false);
    const [foundSale, setFoundSale] = useState(null);

    // Customer & Details
    const [customerName, setCustomerName] = useState('Walk-in Customer');
    const [orderNumber, setOrderNumber] = useState('');
    const [saleId, setSaleId] = useState(null);
    const [swapReason, setSwapReason] = useState('Wrong fitment / size');
    const [swapNotes, setSwapNotes] = useState('');

    // Returned Item State
    const [returnedProduct, setReturnedProduct] = useState(null);
    const [returnedQty, setReturnedQty] = useState(1);
    const [returnedUnitPrice, setReturnedUnitPrice] = useState(0);
    const [returnedDisposition, setReturnedDisposition] = useState('RESTOCK'); // 'RESTOCK' | 'DAMAGED'

    // Returned catalog search (for walk-in swaps without receipt)
    const [retSearchQuery, setRetSearchQuery] = useState('');
    const [retSearchResults, setRetSearchResults] = useState([]);
    const [searchingRet, setSearchingRet] = useState(false);

    // New Replacement Product State
    const [newSearchQuery, setNewSearchQuery] = useState('');
    const [newSearchResults, setNewSearchResults] = useState([]);
    const [searchingNew, setSearchingNew] = useState(false);
    const [newProduct, setNewProduct] = useState(null);
    const [newQty, setNewQty] = useState(1);

    // Payment & Top-Up State
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [amountTendered, setAmountTendered] = useState('');
    const [processingSwap, setProcessingSwap] = useState(false);

    // Completed Swap Result (for Modal / Print)
    const [completedSwap, setCompletedSwap] = useState(null);
    const [showSlipModal, setShowSlipModal] = useState(false);

    // ==========================================
    // 2. SWAP HISTORY STATE
    // ==========================================
    const [swaps, setSwaps] = useState([]);
    const [loadingSwaps, setLoadingSwaps] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalPages, setHistoryTotalPages] = useState(1);
    const [swapSummary, setSwapSummary] = useState({
        total_swaps: 0,
        total_top_ups_collected: 0,
        items_restocked: 0,
        items_damaged: 0
    });

    // ==========================================
    // 3. COMPUTED PRICING DIFFERENCE
    // ==========================================
    const returnedCreditTotal = useMemo(() => {
        const u = Number(returnedUnitPrice) || 0;
        const q = Number(returnedQty) || 1;
        return Math.round(u * q * 100) / 100;
    }, [returnedUnitPrice, returnedQty]);

    const newReplacementTotal = useMemo(() => {
        if (!newProduct) return 0;
        const u = Number(newProduct.selling_price || newProduct.price || 0);
        const q = Number(newQty) || 1;
        return Math.round(u * q * 100) / 100;
    }, [newProduct, newQty]);

    // Price difference:
    // If > 0: Customer must add cash/GCash for pricey product
    // If <= 0: Customer pays 0.00, store gives 0.00 cash refund ("cannot exchange into money")
    const priceDifference = useMemo(() => {
        return Math.round((newReplacementTotal - returnedCreditTotal) * 100) / 100;
    }, [newReplacementTotal, returnedCreditTotal]);

    const customerTopUpRequired = useMemo(() => {
        return priceDifference > 0 ? priceDifference : 0;
    }, [priceDifference]);

    const changeDue = useMemo(() => {
        if (customerTopUpRequired <= 0) return 0;
        const tendered = Number(amountTendered) || 0;
        return Math.max(0, Math.round((tendered - customerTopUpRequired) * 100) / 100);
    }, [amountTendered, customerTopUpRequired]);

    // ==========================================
    // 4. SEARCH & LOOKUP HANDLERS
    // ==========================================
    // Look up original receipt
    const handleLookupOrder = async (e) => {
        e?.preventDefault();
        const q = lookupQuery.trim();
        if (!q) return toast.error('Enter an Order Number or Receipt No');

        setLookingUpOrder(true);
        try {
            const res = await api.get('/swaps/lookup-order', { params: { query: q } });
            if (res.data.success && res.data.sale) {
                const s = res.data.sale;
                setFoundSale(s);
                setOrderNumber(s.order_number || s.receipt_no || '');
                setSaleId(s.id);
                setCustomerName(s.customer_name || 'Walk-in Customer');
                toast.success(`Found order #${s.order_number} (${s.items?.length || 0} items)`);
            }
        } catch (err) {
            console.error('Order lookup failed:', err);
            toast.error(err.response?.data?.message || `No receipt found for "${q}"`);
            setFoundSale(null);
        } finally {
            setLookingUpOrder(false);
        }
    };

    // Catalog search for returned item (walk-in without receipt)
    const handleSearchReturnedProduct = async (query) => {
        setRetSearchQuery(query);
        if (!query.trim()) {
            setRetSearchResults([]);
            return;
        }
        setSearchingRet(true);
        try {
            const res = await api.get('/products', { params: { search: query.trim(), limit: 8 } });
            setRetSearchResults(res.data.products || res.data || []);
        } catch (err) {
            console.error('Error searching returned product:', err);
        } finally {
            setSearchingRet(false);
        }
    };

    // Catalog search for new replacement item
    const handleSearchNewProduct = async (query) => {
        setNewSearchQuery(query);
        if (!query.trim()) {
            setNewSearchResults([]);
            return;
        }
        setSearchingNew(true);
        try {
            const res = await api.get('/products', { params: { search: query.trim(), limit: 8 } });
            setNewSearchResults(res.data.products || res.data || []);
        } catch (err) {
            console.error('Error searching replacement product:', err);
        } finally {
            setSearchingNew(false);
        }
    };

    // Select returned item from receipt
    const handleSelectReceiptItem = (item) => {
        setReturnedProduct({
            id: item.product_id,
            name: item.product_name,
            part_number: item.part_number,
            brand: item.brand,
            category: item.category,
            selling_price: item.price
        });
        setReturnedQty(1);
        setReturnedUnitPrice(Number(item.price || 0));
        toast.success(`Selected "${item.product_name}" for swap`);
    };

    // Select returned item from walk-in catalog search
    const handleSelectCatalogReturned = (prod) => {
        setReturnedProduct(prod);
        setReturnedQty(1);
        setReturnedUnitPrice(Number(prod.selling_price || prod.price || 0));
        setRetSearchQuery('');
        setRetSearchResults([]);
        toast.success(`Selected "${prod.name}" as returned part`);
    };

    // Select new replacement item
    const handleSelectNewProduct = (prod) => {
        if (Number(prod.stock || 0) <= 0) {
            return toast.error(`"${prod.name}" is currently OUT OF STOCK! Please choose an in-stock replacement.`);
        }
        setNewProduct(prod);
        setNewQty(1);
        setNewSearchQuery('');
        setNewSearchResults([]);
        toast.success(`Selected "${prod.name}" as replacement`);
    };

    // ==========================================
    // 5. PROCESS ITEM SWAP
    // ==========================================
    const handleProcessSwap = async (e) => {
        e.preventDefault();
        if (!returnedProduct) {
            return toast.error('Please select the returned item to swap');
        }
        if (!newProduct) {
            return toast.error('Please select the new replacement item');
        }
        if (Number(newProduct.stock) < Number(newQty)) {
            return toast.error(`Insufficient stock for replacement "${newProduct.name}" (Stock: ${newProduct.stock})`);
        }

        if (customerTopUpRequired > 0 && paymentMethod === 'Cash') {
            const tendered = Number(amountTendered) || 0;
            if (tendered < customerTopUpRequired) {
                return toast.error(`Customer must add ₱${customerTopUpRequired.toFixed(2)}. Tendered amount is insufficient.`);
            }
        }

        const confirmMsg = customerTopUpRequired > 0
            ? `Confirm Item Swap:\n\nReturned: ${returnedProduct.name} (Credit: ₱${returnedCreditTotal.toFixed(2)})\nReplacement: ${newProduct.name} (Total: ₱${newReplacementTotal.toFixed(2)})\n\nCustomer must PAY ₱${customerTopUpRequired.toFixed(2)} (${paymentMethod}). Proceed?`
            : `Confirm Item Swap:\n\nReturned: ${returnedProduct.name} (Credit: ₱${returnedCreditTotal.toFixed(2)})\nReplacement: ${newProduct.name} (Total: ₱${newReplacementTotal.toFixed(2)})\n\nZero Cash Refund Policy: Balance is ₱0.00. Proceed with 1-to-1 swap?`;

        if (!window.confirm(confirmMsg)) return;

        setProcessingSwap(true);
        try {
            const payload = {
                sale_id: saleId || null,
                order_number: orderNumber || null,
                customer_name: customerName.trim() || 'Walk-in Customer',
                returned_product_id: returnedProduct.id,
                returned_qty: Number(returnedQty) || 1,
                returned_unit_price: Number(returnedUnitPrice) || 0,
                returned_disposition: returnedDisposition,
                new_product_id: newProduct.id,
                new_qty: Number(newQty) || 1,
                payment_method: customerTopUpRequired > 0 ? paymentMethod : 'None',
                amount_tendered: customerTopUpRequired > 0 ? (Number(amountTendered) || customerTopUpRequired) : 0,
                reason: swapReason,
                notes: swapNotes.trim()
            };

            const res = await api.post('/swaps', payload);
            if (res.data.success) {
                toast.success(res.data.message || 'Item swap completed successfully!');
                setCompletedSwap(res.data.swap);
                setShowSlipModal(true);

                // Reset form
                setReturnedProduct(null);
                setReturnedQty(1);
                setReturnedUnitPrice(0);
                setNewProduct(null);
                setNewQty(1);
                setFoundSale(null);
                setLookupQuery('');
                setAmountTendered('');
                setSwapNotes('');
                fetchSwapHistory();
            }
        } catch (err) {
            console.error('Failed to process swap:', err);
            toast.error(err.response?.data?.message || 'Failed to process item swap');
        } finally {
            setProcessingSwap(false);
        }
    };

    // ==========================================
    // 6. FETCH SWAP HISTORY
    // ==========================================
    const fetchSwapHistory = useCallback(async () => {
        setLoadingSwaps(true);
        try {
            const res = await api.get('/swaps', {
                params: {
                    page: historyPage,
                    limit: 15,
                    search: historySearch.trim()
                }
            });
            if (res.data.success) {
                setSwaps(res.data.swaps || []);
                setHistoryTotalPages(res.data.pagination?.totalPages || 1);
                if (res.data.summary) {
                    setSwapSummary(res.data.summary);
                }
            }
        } catch (err) {
            console.error('Error fetching swap history:', err);
            toast.error('Failed to load swap records');
        } finally {
            setLoadingSwaps(false);
        }
    }, [historyPage, historySearch]);

    useEffect(() => {
        if (activeTab === 'swap_history') {
            fetchSwapHistory();
        }
    }, [activeTab, fetchSwapHistory]);

    return (
        <div style={{ position: 'relative', width: '100%', minWidth: 0, paddingBottom: '30px' }}>
            {/* Top Bar Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
                flexWrap: 'wrap',
                gap: '14px',
                width: '100%'
            }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <h1 style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        margin: 0,
                        fontSize: '1.35rem',
                        fontWeight: 800,
                        color: 'var(--text-main)'
                    }}>
                        <ArrowLeftRight size={24} color="var(--primary)" />
                        <span>Item Swap & Parts Exchange</span>
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Process customer item exchanges. No cash refunds given — customers only pay the price difference for pricey upgrades.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('new_swap')}
                        className={activeTab === 'new_swap' ? 'btn-primary' : 'btn-secondary'}
                        style={{
                            height: '36px',
                            padding: '0 16px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            cursor: 'pointer'
                        }}
                    >
                        <Plus size={15} />
                        <span>New Item Swap</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('swap_history')}
                        className={activeTab === 'swap_history' ? 'btn-primary' : 'btn-secondary'}
                        style={{
                            height: '36px',
                            padding: '0 16px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            cursor: 'pointer'
                        }}
                    >
                        <Receipt size={15} />
                        <span>Swap History ({swapSummary.total_swaps || 0})</span>
                    </button>
                </div>
            </div>

            {/* Strict Store Policy Notice Banner */}
            <div className="glass-panel" style={{
                padding: '12px 18px',
                borderRadius: '12px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                border: '1.5px solid rgba(16, 185, 129, 0.3)',
                background: 'rgba(16, 185, 129, 0.05)'
            }}>
                <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    <ShieldAlert size={20} />
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                    <strong style={{ color: 'var(--primary)' }}>J-Lin Exchange Policy:</strong> Items cannot be converted or exchanged into money (No cash refunds). Customers are free to swap for another part. If the customer chooses a more expensive (pricey) product, they simply add and pay the price difference.
                </div>
            </div>

            {/* ========================================================= */}
            {/* TAB 1: NEW ITEM SWAP WORKFLOW                            */}
            {/* ========================================================= */}
            {activeTab === 'new_swap' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', minWidth: 0 }}>
                    {/* Step 1: Optional Receipt Lookup */}
                    <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Receipt size={18} color="var(--primary)" />
                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                    Step 1: Original Receipt Lookup (Optional)
                                </h3>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                If customer has a receipt, enter order # to verify purchased price
                            </span>
                        </div>

                        <form onSubmit={handleLookupOrder} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                                <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Enter Order # or Receipt No (e.g. SO-2026-001 or SO-GC01)..."
                                    value={lookupQuery}
                                    onChange={(e) => setLookupQuery(e.target.value)}
                                    className="input-premium"
                                    style={{ width: '100%', height: '38px', paddingLeft: '34px', fontSize: '0.85rem' }}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={lookingUpOrder}
                                className="btn-secondary"
                                style={{ height: '38px', padding: '0 18px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                {lookingUpOrder ? 'Searching...' : 'Find Receipt'}
                            </button>
                        </form>

                        {/* Found Receipt Items */}
                        {foundSale && (
                            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '0.82rem' }}>
                                    <div>
                                        <strong style={{ color: 'var(--text-main)' }}>Order #{foundSale.order_number}</strong> — Customer: <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{foundSale.customer_name}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFoundSale(null)}
                                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem' }}
                                    >
                                        Clear Receipt
                                    </button>
                                </div>

                                <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'left' }}>Item</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'left' }}>Part #</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Purchased Qty</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'right' }}>Price Paid</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {foundSale.items?.map(it => (
                                                <tr key={it.sale_item_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-main)' }}>{it.product_name}</td>
                                                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{it.part_number}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'monospace' }}>{it.quantity}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                                                        {formatCurrency(it.price)}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSelectReceiptItem(it)}
                                                            className="btn-primary"
                                                            style={{ height: '28px', padding: '0 12px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                                        >
                                                            Swap This Item
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Step 2: Side-by-Side Returned Item vs New Replacement Item */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', width: '100%', minWidth: 0 }}>
                        {/* LEFT: Returned Item Card */}
                        <div className="glass-panel" style={{
                            padding: '20px',
                            borderRadius: '14px',
                            border: returnedProduct ? '1.5px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <RotateCcw size={15} />
                                    </div>
                                    <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                        Part Brought In (Returning)
                                    </h3>
                                </div>
                                {returnedProduct && (
                                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontWeight: 700 }}>
                                        Item Selected
                                    </span>
                                )}
                            </div>

                            {/* Direct Catalog Search if no receipt item chosen */}
                            {!returnedProduct ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Search catalog if customer has no receipt:
                                    </p>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search returned item by part name or SKU..."
                                            value={retSearchQuery}
                                            onChange={(e) => handleSearchReturnedProduct(e.target.value)}
                                            className="input-premium"
                                            style={{ width: '100%', height: '36px', paddingLeft: '32px', fontSize: '0.82rem' }}
                                        />
                                    </div>

                                    {/* Search dropdown results */}
                                    {retSearchResults.length > 0 && (
                                        <div style={{
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            background: 'var(--surface)',
                                            maxHeight: '220px',
                                            overflowY: 'auto'
                                        }}>
                                            {retSearchResults.map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => handleSelectCatalogReturned(p)}
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderBottom: '1px solid var(--border)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        fontSize: '0.82rem'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.name}</div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.part_number} • {p.brand}</div>
                                                    </div>
                                                    <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                                                        {formatCurrency(p.selling_price || p.price)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Selected Returned Item Box */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        background: 'var(--surface-hover)',
                                        border: '1px solid var(--border)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                {returnedProduct.name}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                {returnedProduct.part_number} • {returnedProduct.brand} • {returnedProduct.category}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setReturnedProduct(null)}
                                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}
                                        >
                                            Change
                                        </button>
                                    </div>

                                    {/* Qty & Unit Credit */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                Returned Qty
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={returnedQty}
                                                onChange={(e) => setReturnedQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                                className="input-premium"
                                                style={{ width: '100%', height: '36px', fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                Unit Credit Value (₱)
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={returnedUnitPrice}
                                                onChange={(e) => setReturnedUnitPrice(e.target.value)}
                                                className="input-premium"
                                                style={{ width: '100%', height: '36px', fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}
                                            />
                                        </div>
                                    </div>

                                    {/* Item Condition */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                            Returned Part Condition
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setReturnedDisposition('RESTOCK')}
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.76rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    border: returnedDisposition === 'RESTOCK' ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                                                    background: returnedDisposition === 'RESTOCK' ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface)',
                                                    color: returnedDisposition === 'RESTOCK' ? 'var(--primary)' : 'var(--text-muted)'
                                                }}
                                            >
                                                ✓ Good (Restock)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setReturnedDisposition('DAMAGED')}
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.76rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    border: returnedDisposition === 'DAMAGED' ? '1.5px solid var(--danger)' : '1px solid var(--border)',
                                                    background: returnedDisposition === 'DAMAGED' ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface)',
                                                    color: returnedDisposition === 'DAMAGED' ? 'var(--danger)' : 'var(--text-muted)'
                                                }}
                                            >
                                                ⚠ Damaged / Defect
                                            </button>
                                        </div>
                                    </div>

                                    {/* Subtotal Credit Banner */}
                                    <div style={{
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        background: 'rgba(239, 68, 68, 0.08)',
                                        border: '1px solid rgba(239, 68, 68, 0.25)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                            Total Trade-In Credit:
                                        </span>
                                        <span style={{ fontSize: '1.15rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--danger)' }}>
                                            {formatCurrency(returnedCreditTotal)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT: New Replacement Item Card */}
                        <div className="glass-panel" style={{
                            padding: '20px',
                            borderRadius: '14px',
                            border: newProduct ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Package size={15} />
                                    </div>
                                    <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                        New Replacement Part
                                    </h3>
                                </div>
                                {newProduct && (
                                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)', fontWeight: 700 }}>
                                        Replacement Chosen
                                    </span>
                                )}
                            </div>

                            {/* Search Replacement Catalog */}
                            {!newProduct ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Search and select the part the customer wants to take home:
                                    </p>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search replacement by part name, SKU, or brand..."
                                            value={newSearchQuery}
                                            onChange={(e) => handleSearchNewProduct(e.target.value)}
                                            className="input-premium"
                                            style={{ width: '100%', height: '36px', paddingLeft: '32px', fontSize: '0.82rem' }}
                                        />
                                    </div>

                                    {/* Search dropdown results */}
                                    {newSearchResults.length > 0 && (
                                        <div style={{
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            background: 'var(--surface)',
                                            maxHeight: '220px',
                                            overflowY: 'auto'
                                        }}>
                                            {newSearchResults.map(p => {
                                                const inStock = Number(p.stock || 0) > 0;
                                                return (
                                                    <div
                                                        key={p.id}
                                                        onClick={() => handleSelectNewProduct(p)}
                                                        style={{
                                                            padding: '8px 12px',
                                                            borderBottom: '1px solid var(--border)',
                                                            cursor: inStock ? 'pointer' : 'not-allowed',
                                                            opacity: inStock ? 1 : 0.5,
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            fontSize: '0.82rem'
                                                        }}
                                                        onMouseEnter={(e) => inStock && (e.currentTarget.style.background = 'var(--surface-hover)')}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <div>
                                                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.name}</div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                                {p.part_number} • {p.brand} • <span style={{ color: inStock ? 'var(--primary)' : 'var(--danger)', fontWeight: 600 }}>Stock: {p.stock}</span>
                                                            </div>
                                                        </div>
                                                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                                                            {formatCurrency(p.selling_price || p.price)}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Selected New Replacement Item Box */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        background: 'var(--surface-hover)',
                                        border: '1px solid var(--border)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                {newProduct.name}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                {newProduct.part_number} • {newProduct.brand} • <span style={{ color: 'var(--primary)', fontWeight: 700 }}>In Stock: {newProduct.stock}</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setNewProduct(null)}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}
                                        >
                                            Change
                                        </button>
                                    </div>

                                    {/* Qty & Selling Price */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                Quantity Needed
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max={newProduct.stock || 999}
                                                value={newQty}
                                                onChange={(e) => setNewQty(Math.max(1, Math.min(newProduct.stock || 999, parseInt(e.target.value, 10) || 1)))}
                                                className="input-premium"
                                                style={{ width: '100%', height: '36px', fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                Retail Price (₱)
                                            </label>
                                            <div style={{
                                                height: '36px',
                                                padding: '0 12px',
                                                borderRadius: '8px',
                                                background: 'var(--surface-hover)',
                                                border: '1px solid var(--border)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                fontFamily: 'monospace',
                                                fontWeight: 800,
                                                color: 'var(--text-main)'
                                            }}>
                                                {formatCurrency(newProduct.selling_price || newProduct.price)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Subtotal Replacement Banner */}
                                    <div style={{
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        background: 'rgba(16, 185, 129, 0.08)',
                                        border: '1px solid rgba(16, 185, 129, 0.25)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                            New Item Total:
                                        </span>
                                        <span style={{ fontSize: '1.15rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)' }}>
                                            {formatCurrency(newReplacementTotal)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Step 3: Calculation & Price Difference Payment Breakdown */}
                    {returnedProduct && newProduct && (
                        <div className="glass-panel" style={{
                            padding: '24px',
                            borderRadius: '16px',
                            border: customerTopUpRequired > 0 ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                            boxShadow: 'var(--glass-shadow)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <DollarSign size={20} color="var(--primary)" />
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                    Step 3: Exchange Calculation & Policy Verification
                                </h3>
                            </div>

                            {/* Summary Comparison Bar */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '14px',
                                marginBottom: '20px'
                            }}>
                                <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                                        Returned Item Credit
                                    </div>
                                    <div style={{ fontSize: '1.4rem', fontFamily: 'monospace', fontWeight: 800, color: 'var(--danger)', marginTop: '4px' }}>
                                        {formatCurrency(returnedCreditTotal)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        {returnedProduct.name} (x{returnedQty})
                                    </div>
                                </div>

                                <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                                        New Replacement Price
                                    </div>
                                    <div style={{ fontSize: '1.4rem', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>
                                        {formatCurrency(newReplacementTotal)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        {newProduct.name} (x{newQty})
                                    </div>
                                </div>

                                {/* Active Result Card */}
                                <div style={{
                                    padding: '14px',
                                    borderRadius: '10px',
                                    background: customerTopUpRequired > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                    border: customerTopUpRequired > 0 ? '1.5px solid var(--primary)' : '1.5px solid #3b82f6'
                                }}>
                                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 700, color: customerTopUpRequired > 0 ? 'var(--primary)' : '#3b82f6' }}>
                                        {customerTopUpRequired > 0 ? 'Pricey Upgrade Difference' : 'Even / Policy Balance'}
                                    </div>
                                    <div style={{ fontSize: '1.4rem', fontFamily: 'monospace', fontWeight: 900, color: customerTopUpRequired > 0 ? 'var(--primary)' : '#3b82f6', marginTop: '4px' }}>
                                        {customerTopUpRequired > 0 ? `+${formatCurrency(customerTopUpRequired)}` : '₱0.00'}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: customerTopUpRequired > 0 ? 'var(--primary)' : '#3b82f6', marginTop: '2px', fontWeight: 600 }}>
                                        {customerTopUpRequired > 0 ? 'Customer adds more' : 'No money exchanged'}
                                    </div>
                                </div>
                            </div>

                            {/* SCENARIO A: PRICEY UPGRADE -> CUSTOMER MUST PAY DIFFERENCE */}
                            {customerTopUpRequired > 0 ? (
                                <div style={{
                                    padding: '16px',
                                    borderRadius: '12px',
                                    background: 'var(--surface-hover)',
                                    border: '1px solid var(--border)',
                                    marginBottom: '20px'
                                }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Wallet size={16} color="var(--primary)" />
                                        <span>Customer Top-Up Payment for Pricey Product (+{formatCurrency(customerTopUpRequired)})</span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                Payment Method
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {['Cash', 'GCash'].map(m => (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        onClick={() => setPaymentMethod(m)}
                                                        style={{
                                                            flex: 1,
                                                            height: '36px',
                                                            borderRadius: '8px',
                                                            fontSize: '0.82rem',
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            border: paymentMethod === m ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                                                            background: paymentMethod === m ? 'var(--primary)' : 'var(--surface)',
                                                            color: paymentMethod === m ? '#ffffff' : 'var(--text-main)'
                                                        }}
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {paymentMethod === 'Cash' && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                    Cash Tendered (₱) *
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min={customerTopUpRequired}
                                                    placeholder={customerTopUpRequired.toFixed(2)}
                                                    value={amountTendered}
                                                    onChange={(e) => setAmountTendered(e.target.value)}
                                                    className="input-premium"
                                                    style={{ width: '100%', height: '36px', fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 800 }}
                                                    required
                                                />
                                            </div>
                                        )}

                                        {paymentMethod === 'Cash' && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                    Change Due (Panukli)
                                                </label>
                                                <div style={{
                                                    height: '36px',
                                                    padding: '0 12px',
                                                    borderRadius: '8px',
                                                    background: 'var(--surface)',
                                                    border: '1px solid var(--border)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    fontFamily: 'monospace',
                                                    fontWeight: 800,
                                                    fontSize: '0.92rem',
                                                    color: changeDue > 0 ? 'var(--primary)' : 'var(--text-muted)'
                                                }}>
                                                    {formatCurrency(changeDue)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* SCENARIO B: SAME OR LOWER PRICE -> ZERO CASH REFUND */
                                <div style={{
                                    padding: '14px 16px',
                                    borderRadius: '10px',
                                    background: 'rgba(239, 68, 68, 0.06)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    marginBottom: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <Ban size={22} color="var(--danger)" style={{ flexShrink: 0 }} />
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
                                        <strong>Strict Zero Cash Refund Policy:</strong> Returned item credit ({formatCurrency(returnedCreditTotal)}) covers the replacement ({formatCurrency(newReplacementTotal)}). No cash is returned or refunded to the customer. Total Amount to Pay: <strong style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>₱0.00</strong>.
                                    </div>
                                </div>
                            )}

                            {/* Customer, Reason & Notes */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                        Customer Name
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Walk-in Customer"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        className="input-premium"
                                        style={{ width: '100%', height: '36px', fontSize: '0.82rem' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                        Reason for Swap *
                                    </label>
                                    <select
                                        value={swapReason}
                                        onChange={(e) => setSwapReason(e.target.value)}
                                        className="input-premium"
                                        style={{ width: '100%', height: '36px', fontSize: '0.82rem' }}
                                    >
                                        <option value="Wrong fitment / size">Wrong fitment / size</option>
                                        <option value="Customer upgrade to pricey product">Customer upgrade to pricey product</option>
                                        <option value="Defective / damaged part">Defective / damaged part</option>
                                        <option value="Customer color / preference change">Customer color / preference change</option>
                                        <option value="Other">Other reason</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                        Cashier Remarks / Notes
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Optional notes or receipt reference..."
                                        value={swapNotes}
                                        onChange={(e) => setSwapNotes(e.target.value)}
                                        className="input-premium"
                                        style={{ width: '100%', height: '36px', fontSize: '0.82rem' }}
                                    />
                                </div>
                            </div>

                            {/* Submit Button */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setReturnedProduct(null);
                                        setNewProduct(null);
                                    }}
                                    className="btn-secondary"
                                    style={{ height: '42px', padding: '0 20px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={processingSwap}
                                    onClick={handleProcessSwap}
                                    className="btn-primary"
                                    style={{
                                        height: '42px',
                                        padding: '0 28px',
                                        fontSize: '0.88rem',
                                        fontWeight: 800,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        cursor: processingSwap ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    <CheckCircle2 size={18} />
                                    <span>{processingSwap ? 'Processing Swap...' : (customerTopUpRequired > 0 ? `Collect ₱${customerTopUpRequired.toFixed(2)} & Complete Swap` : 'Complete 1-to-1 Item Swap')}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================= */}
            {/* TAB 2: SWAP HISTORY & AUDIT LOG                           */}
            {/* ========================================================= */}
            {activeTab === 'swap_history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', minWidth: 0 }}>
                    {/* 4 Summary Metric Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', width: '100%', minWidth: 0 }}>
                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Swaps Processed</span>
                                <ArrowLeftRight size={16} color="var(--primary)" />
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '6px', fontFamily: 'monospace' }}>
                                {swapSummary.total_swaps || 0}
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pricey Top-Ups Collected</span>
                                <DollarSign size={16} color="var(--primary)" />
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)', marginTop: '6px', fontFamily: 'monospace' }}>
                                {formatCurrency(swapSummary.total_top_ups_collected || 0)}
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Good Parts Restocked</span>
                                <Package size={16} color="#3b82f6" />
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#3b82f6', marginTop: '6px', fontFamily: 'monospace' }}>
                                {swapSummary.items_restocked || 0}
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Damaged / Defect Units</span>
                                <AlertTriangle size={16} color="var(--danger)" />
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger)', marginTop: '6px', fontFamily: 'monospace' }}>
                                {swapSummary.items_damaged || 0}
                            </div>
                        </div>
                    </div>

                    {/* Filter & Table */}
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Receipt size={18} color="var(--primary)" />
                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                    Item Swap Records
                                </h3>
                            </div>
                            <div style={{ position: 'relative', width: '280px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Search swap code, customer, product..."
                                    value={historySearch}
                                    onChange={(e) => {
                                        setHistorySearch(e.target.value);
                                        setHistoryPage(1);
                                    }}
                                    className="input-premium"
                                    style={{ width: '100%', height: '34px', paddingLeft: '32px', fontSize: '0.82rem' }}
                                />
                            </div>
                        </div>

                        {loadingSwaps ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: 'var(--primary)' }} />
                                <span>Loading swap records...</span>
                            </div>
                        ) : swaps.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No item swap transactions recorded yet.
                            </div>
                        ) : (
                            <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Swap Code</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Date & Customer</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Returned Item</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Replacement Item</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Credit Given</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>New Price</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Top-Up Paid</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Print Slip</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {swaps.map(s => (
                                            <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                    {s.swap_code}
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{s.customer_name}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatAuditDate(s.created_at)}</div>
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{s.returned_product_name} (x{s.returned_qty})</div>
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        background: s.returned_disposition === 'RESTOCK' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                        color: s.returned_disposition === 'RESTOCK' ? 'var(--primary)' : 'var(--danger)',
                                                        fontWeight: 700
                                                    }}>
                                                        {s.returned_disposition === 'RESTOCK' ? 'Restocked' : 'Damaged / Defect'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{s.new_product_name} (x{s.new_qty})</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.new_brand}</div>
                                                </td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--danger)', fontWeight: 700 }}>
                                                    {formatCurrency(s.returned_credit_total)}
                                                </td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 700 }}>
                                                    {formatCurrency(s.new_total_price)}
                                                </td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: Number(s.customer_top_up_paid) > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                                                    {Number(s.customer_top_up_paid) > 0 ? `+${formatCurrency(s.customer_top_up_paid)} (${s.payment_method})` : '₱0.00'}
                                                </td>
                                                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setCompletedSwap(s);
                                                            setShowSlipModal(true);
                                                        }}
                                                        className="btn-secondary"
                                                        style={{ height: '28px', padding: '0 10px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                                    >
                                                        <Printer size={13} style={{ marginRight: '4px' }} />
                                                        Slip
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* PRINTABLE ITEM SWAP SLIP MODAL                            */}
            {/* ========================================================= */}
            {showSlipModal && completedSwap && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: 'rgba(0,0,0,0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px'
                }}>
                    <div className="glass-panel" style={{
                        maxWidth: '440px',
                        width: '100%',
                        borderRadius: '16px',
                        padding: '24px',
                        position: 'relative',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
                    }}>
                        {/* Printable Slip Container */}
                        <div id="swap-slip-print">
                            <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--border)', paddingBottom: '14px', marginBottom: '14px' }}>
                                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '0.5px' }}>
                                    JLIN MOTO PARTS
                                </div>
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                    Customer Item Swap & Exchange Slip
                                </div>
                                <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>
                                    {completedSwap.swap_code}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {formatAuditDate(completedSwap.created_at)}
                                </div>
                            </div>

                            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                                    <strong style={{ color: 'var(--text-main)' }}>{completedSwap.customer_name}</strong>
                                </div>
                                {completedSwap.order_number && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Original Order:</span>
                                        <span style={{ fontFamily: 'monospace' }}>#{completedSwap.order_number}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Processed By:</span>
                                    <span>{completedSwap.processed_by}</span>
                                </div>
                            </div>

                            {/* Item Comparison Section */}
                            <div style={{
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                background: 'var(--surface-hover)',
                                fontSize: '0.78rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                marginBottom: '14px'
                            }}>
                                <div>
                                    <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                                        Returned Item (Credit):
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-main)' }}>
                                        <span>{completedSwap.returned_product_name} (x{completedSwap.returned_qty})</span>
                                        <span style={{ fontFamily: 'monospace' }}>-{formatCurrency(completedSwap.returned_credit_total)}</span>
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '6px' }}>
                                    <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                                        New Replacement (Issued):
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-main)' }}>
                                        <span>{completedSwap.new_product_name} (x{completedSwap.new_qty})</span>
                                        <span style={{ fontFamily: 'monospace' }}>+{formatCurrency(completedSwap.new_total_price)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Payment / Top-Up Total */}
                            <div style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: Number(completedSwap.customer_top_up_paid) > 0 ? 'rgba(16, 185, 129, 0.1)' : 'var(--surface-hover)',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '14px'
                            }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                    {Number(completedSwap.customer_top_up_paid) > 0 ? 'Pricey Top-Up Paid:' : 'Exchange Balance:'}
                                </span>
                                <span style={{ fontSize: '1.2rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)' }}>
                                    {Number(completedSwap.customer_top_up_paid) > 0
                                        ? `${formatCurrency(completedSwap.customer_top_up_paid)} (${completedSwap.payment_method})`
                                        : '₱0.00'}
                                </span>
                            </div>

                            <div style={{
                                textAlign: 'center',
                                fontSize: '0.7rem',
                                color: 'var(--text-muted)',
                                borderTop: '1px dashed var(--border)',
                                paddingTop: '10px'
                            }}>
                                <div>No Cash Refunds • Swapped parts cannot be exchanged into money.</div>
                                <div style={{ marginTop: '2px' }}>Thank you for shopping at J-Lin Motor Parts!</div>
                            </div>
                        </div>

                        {/* Modal Action Buttons */}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }} className="no-print">
                            <button
                                type="button"
                                onClick={() => setShowSlipModal(false)}
                                className="btn-secondary"
                                style={{ flex: 1, height: '38px', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="btn-primary"
                                style={{ flex: 1, height: '38px', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                            >
                                <Printer size={15} />
                                <span>Print Swap Slip</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ItemSwap;
