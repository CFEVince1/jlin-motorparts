import React, { useState, useEffect, useContext, useMemo, useCallback, useRef } from 'react';
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
    Minus,
    Check,
    Receipt,
    Wallet,
    Info,
    Ban,
    Trash2,
    ShoppingCart,
    ShoppingBag,
    HelpCircle
} from 'lucide-react';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

export const ItemSwap = () => {
    const { user } = useContext(AuthContext);
    const currentUser = user || { username: 'Staff', role: 'Staff' };

    // Tabs: 'new_swap' | 'swap_history'
    const [activeTab, setActiveTab] = useState('new_swap');

    // ==========================================
    // 1. ORIGINAL ORDER LOOKUP STATE
    // ==========================================
    const [lookupQuery, setLookupQuery] = useState('');
    const [lookingUpOrder, setLookingUpOrder] = useState(false);
    const [foundSale, setFoundSale] = useState(null);
    const [matchingSales, setMatchingSales] = useState([]);

    // Recent receipts modal
    const [showRecentModal, setShowRecentModal] = useState(false);
    const [recentSales, setRecentSales] = useState([]);
    const [loadingRecent, setLoadingRecent] = useState(false);

    // Customer & Details
    const [customerName, setCustomerName] = useState('Walk-in Customer');
    const [orderNumber, setOrderNumber] = useState('');
    const [saleId, setSaleId] = useState(null);
    const [swapReason, setSwapReason] = useState('Wrong fitment / size');
    const [swapNotes, setSwapNotes] = useState('');

    // ==========================================
    // 2. RETURNED ITEM STATE
    // ==========================================
    const [returnedProduct, setReturnedProduct] = useState(null);
    const [returnedQty, setReturnedQty] = useState(1);
    const [returnedUnitPrice, setReturnedUnitPrice] = useState(0);
    const [returnedDisposition, setReturnedDisposition] = useState('RESTOCK'); // 'RESTOCK' | 'DAMAGED'

    // Returned catalog search (for walk-in swaps without receipt)
    const [retSearchQuery, setRetSearchQuery] = useState('');
    const [retSearchResults, setRetSearchResults] = useState([]);
    const [searchingRet, setSearchingRet] = useState(false);

    // ==========================================
    // 3. MULTI-ITEM REPLACEMENT CART STATE
    // ==========================================
    // replacementItems: [{ product_id, name, part_number, brand, stock, qty, unit_price, subtotal }]
    const [replacementItems, setReplacementItems] = useState([]);
    const [newSearchQuery, setNewSearchQuery] = useState('');
    const [newSearchResults, setNewSearchResults] = useState([]);
    const [searchingNew, setSearchingNew] = useState(false);
    const newSearchInputRef = useRef(null);

    // Payment & Top-Up State
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [amountTendered, setAmountTendered] = useState('');
    const [processingSwap, setProcessingSwap] = useState(false);

    // Completed Swap Result (for Modal / Print)
    const [completedSwap, setCompletedSwap] = useState(null);
    const [showSlipModal, setShowSlipModal] = useState(false);

    // ==========================================
    // 4. SWAP HISTORY STATE
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
    // 5. COMPUTED PRICING DIFFERENCE
    // ==========================================
    // Returned item trade-in credit:
    const returnedCreditTotal = useMemo(() => {
        const u = Number(returnedUnitPrice) || 0;
        const q = Number(returnedQty) || 1;
        return Math.round(u * q * 100) / 100;
    }, [returnedUnitPrice, returnedQty]);

    // Sum of all replacement products:
    const newReplacementTotal = useMemo(() => {
        if (!replacementItems || replacementItems.length === 0) return 0;
        const sum = replacementItems.reduce((acc, it) => {
            const u = Number(it.unit_price) || 0;
            const q = Number(it.qty) || 1;
            return acc + (u * q);
        }, 0);
        return Math.round(sum * 100) / 100;
    }, [replacementItems]);

    const totalReplacementQty = useMemo(() => {
        return replacementItems.reduce((acc, it) => acc + (Number(it.qty) || 1), 0);
    }, [replacementItems]);

    // Price difference:
    // If > 0: Customer must add cash/GCash for pricey product
    // If < 0: Customer has unused credit (can add more products, but cannot exchange into money)
    // If == 0: Even swap
    const priceDifference = useMemo(() => {
        return Math.round((newReplacementTotal - returnedCreditTotal) * 100) / 100;
    }, [newReplacementTotal, returnedCreditTotal]);

    const customerTopUpRequired = useMemo(() => {
        return priceDifference > 0 ? priceDifference : 0;
    }, [priceDifference]);

    const unusedCredit = useMemo(() => {
        return priceDifference < 0 ? Math.abs(priceDifference) : 0;
    }, [priceDifference]);

    const changeDue = useMemo(() => {
        if (customerTopUpRequired <= 0) return 0;
        const tendered = Number(amountTendered) || 0;
        return Math.max(0, Math.round((tendered - customerTopUpRequired) * 100) / 100);
    }, [amountTendered, customerTopUpRequired]);

    // ==========================================
    // 6. ORIGINAL RECEIPT LOOKUP HANDLERS
    // ==========================================
    const handleLookupOrder = async (e, customQuery) => {
        e?.preventDefault();
        const q = (customQuery !== undefined ? customQuery : lookupQuery).trim();
        if (!q) return toast.error('Enter an Order Number or Receipt No');

        setLookingUpOrder(true);
        try {
            const res = await api.get('/swaps/lookup-order', { params: { query: q } });
            if (res.data.success && res.data.sale) {
                const s = res.data.sale;
                setFoundSale(s);
                setMatchingSales(res.data.matches || [s]);
                setOrderNumber(s.order_number || s.receipt_no || '');
                setSaleId(s.id);
                setCustomerName(s.customer_name || 'Walk-in Customer');
                toast.success(`Found order #${s.order_number} (${s.items?.length || 0} items)`);
            }
        } catch (err) {
            console.error('Order lookup failed:', err);
            toast.error(err.response?.data?.message || `No receipt found for "${q}"`);
            setFoundSale(null);
            setMatchingSales([]);
        } finally {
            setLookingUpOrder(false);
        }
    };

    // Open recent sales modal
    const handleOpenRecentModal = async () => {
        setShowRecentModal(true);
        setLoadingRecent(true);
        try {
            const res = await api.get('/swaps/recent-sales');
            if (res.data.success) {
                setRecentSales(res.data.sales || []);
            }
        } catch (err) {
            console.error('Failed to load recent sales:', err);
            toast.error('Failed to load recent sales');
        } finally {
            setLoadingRecent(false);
        }
    };

    const handleSelectSaleFromModal = (sale) => {
        setFoundSale(sale);
        setOrderNumber(sale.order_number || sale.receipt_no || '');
        setSaleId(sale.id);
        setCustomerName(sale.customer_name || 'Walk-in Customer');
        setLookupQuery(sale.order_number || '');
        setShowRecentModal(false);
        toast.success(`Selected Order #${sale.order_number}`);
    };

    // Select returned item from found receipt
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

    // Direct catalog search for returned item (walk-in without receipt)
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

    const handleSelectCatalogReturned = (prod) => {
        setReturnedProduct(prod);
        setReturnedQty(1);
        setReturnedUnitPrice(Number(prod.selling_price || prod.price || 0));
        setRetSearchQuery('');
        setRetSearchResults([]);
        toast.success(`Selected "${prod.name}" as returned part`);
    };

    // ==========================================
    // 7. MULTI-ITEM REPLACEMENT CART HANDLERS
    // ==========================================
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

    // Add product to replacement cart
    const handleAddReplacementProduct = (prod) => {
        if (Number(prod.stock || 0) <= 0) {
            return toast.error(`"${prod.name}" is OUT OF STOCK! Please choose an in-stock part.`);
        }

        setReplacementItems(prev => {
            const existingIndex = prev.findIndex(it => it.product_id === prod.id);
            if (existingIndex >= 0) {
                // Already in cart: increment qty
                const existing = prev[existingIndex];
                if (existing.qty >= prod.stock) {
                    toast.error(`Cannot add more. Only ${prod.stock} in stock.`);
                    return prev;
                }
                const updated = [...prev];
                const newQ = existing.qty + 1;
                updated[existingIndex] = {
                    ...existing,
                    qty: newQ,
                    subtotal: Math.round(newQ * existing.unit_price * 100) / 100
                };
                toast.success(`Increased "${prod.name}" quantity to ${newQ}`);
                return updated;
            } else {
                // Add new item
                const uPrice = Number(prod.selling_price || prod.price || 0);
                toast.success(`Added "${prod.name}" to replacements`);
                return [
                    ...prev,
                    {
                        product_id: prod.id,
                        name: prod.name,
                        part_number: prod.part_number,
                        brand: prod.brand,
                        category: prod.category,
                        stock: Number(prod.stock || 0),
                        qty: 1,
                        unit_price: uPrice,
                        subtotal: uPrice
                    }
                ];
            }
        });

        setNewSearchQuery('');
        setNewSearchResults([]);
    };

    // Update replacement item quantity
    const handleUpdateReplacementQty = (productId, delta) => {
        setReplacementItems(prev => {
            return prev.map(it => {
                if (it.product_id === productId) {
                    const newQ = Math.max(1, Math.min(it.stock || 999, it.qty + delta));
                    return {
                        ...it,
                        qty: newQ,
                        subtotal: Math.round(newQ * it.unit_price * 100) / 100
                    };
                }
                return it;
            });
        });
    };

    // Change replacement item quantity directly
    const handleSetReplacementQty = (productId, val) => {
        const num = parseInt(val, 10);
        setReplacementItems(prev => {
            return prev.map(it => {
                if (it.product_id === productId) {
                    const targetQ = isNaN(num) || num < 1 ? 1 : Math.min(it.stock || 999, num);
                    return {
                        ...it,
                        qty: targetQ,
                        subtotal: Math.round(targetQ * it.unit_price * 100) / 100
                    };
                }
                return it;
            });
        });
    };

    // Remove item from replacement cart
    const handleRemoveReplacementItem = (productId) => {
        setReplacementItems(prev => prev.filter(it => it.product_id !== productId));
    };

    // Focus search input
    const handleFocusNewSearch = () => {
        if (newSearchInputRef.current) {
            newSearchInputRef.current.focus();
        }
    };

    // ==========================================
    // 8. PROCESS ITEM SWAP
    // ==========================================
    const handleProcessSwap = async (e) => {
        e.preventDefault();
        if (!returnedProduct) {
            return toast.error('Please select the returned item to swap');
        }
        if (!replacementItems || replacementItems.length === 0) {
            return toast.error('Please add at least one replacement item to swap');
        }

        // Verify stock for all items
        for (const it of replacementItems) {
            if (Number(it.stock) < Number(it.qty)) {
                return toast.error(`Insufficient stock for "${it.name}". Stock: ${it.stock}, Needed: ${it.qty}`);
            }
        }

        if (customerTopUpRequired > 0 && paymentMethod === 'Cash') {
            const tendered = Number(amountTendered) || 0;
            if (tendered < customerTopUpRequired) {
                return toast.error(`Customer must add ₱${customerTopUpRequired.toFixed(2)}. Tendered amount is insufficient.`);
            }
        }

        let confirmMsg = '';
        if (customerTopUpRequired > 0) {
            confirmMsg = `Confirm Item Swap:\n\nReturned Credit: ₱${returnedCreditTotal.toFixed(2)}\nNew Replacements (${replacementItems.length} items): ₱${newReplacementTotal.toFixed(2)}\n\nCustomer must PAY ₱${customerTopUpRequired.toFixed(2)} (${paymentMethod}). Proceed?`;
        } else if (unusedCredit > 0) {
            confirmMsg = `Notice: Customer has ₱${unusedCredit.toFixed(2)} remaining credit.\n\nStrict Zero Cash Refund Policy: No cash is returned or refunded.\n\nProceed with swap for ₱${newReplacementTotal.toFixed(2)} replacement?`;
        } else {
            confirmMsg = `Confirm Even Item Swap:\n\nReturned Credit: ₱${returnedCreditTotal.toFixed(2)}\nNew Replacements: ₱${newReplacementTotal.toFixed(2)}\n\nBalance is ₱0.00. Proceed with swap?`;
        }

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
                new_items: replacementItems.map(it => ({
                    product_id: it.product_id,
                    qty: it.qty,
                    unit_price: it.unit_price
                })),
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
                setReplacementItems([]);
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
    // 9. FETCH SWAP HISTORY
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
                        Process customer item exchanges. No cash refunds given — customers can add multiple products to fully utilize credit, or pay the difference for pricey upgrades.
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
                    <strong style={{ color: 'var(--primary)' }}>J-Lin Exchange Policy:</strong> Items cannot be converted or exchanged into money (No cash refunds). Customers can swap for another part or <strong>add multiple products</strong> to match their returned credit. If the chosen products cost more than the returned item, the customer simply pays the difference.
                </div>
            </div>

            {/* ========================================================= */}
            {/* TAB 1: NEW ITEM SWAP WORKFLOW                            */}
            {/* ========================================================= */}
            {activeTab === 'new_swap' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', minWidth: 0 }}>
                    {/* Step 1: Original Receipt Lookup */}
                    <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Receipt size={18} color="var(--primary)" />
                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                    Step 1: Original Receipt Lookup (Recommended)
                                </h3>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Enter order number (e.g. SO-2026-0156 or 156) or pick from recent sales
                            </span>
                        </div>

                        <form onSubmit={(e) => handleLookupOrder(e)} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                                <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Enter Order # or Receipt No (e.g. SO-2026-0156, SO-156, or 156)..."
                                    value={lookupQuery}
                                    onChange={(e) => setLookupQuery(e.target.value)}
                                    className="input-premium"
                                    style={{ width: '100%', height: '38px', paddingLeft: '34px', fontSize: '0.85rem' }}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={lookingUpOrder}
                                className="btn-primary"
                                style={{ height: '38px', padding: '0 18px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                {lookingUpOrder ? 'Searching...' : 'Find Receipt'}
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenRecentModal}
                                className="btn-secondary"
                                style={{ height: '38px', padding: '0 14px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Clock size={14} color="var(--primary)" />
                                <span>Browse Recent Sales</span>
                            </button>
                        </form>

                        {/* Found Receipt Items */}
                        {foundSale && (
                            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '0.82rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            fontSize: '0.72rem',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            background: 'rgba(16, 185, 129, 0.15)',
                                            color: 'var(--primary)',
                                            fontWeight: 800
                                        }}>
                                            VERIFIED RECEIPT
                                        </span>
                                        <strong style={{ color: 'var(--text-main)' }}>Order #{foundSale.order_number}</strong>
                                        <span style={{ color: 'var(--text-muted)' }}>• Customer:</span>
                                        <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{foundSale.customer_name}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>• Date: {formatAuditDate(foundSale.created_at)}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFoundSale(null);
                                            setOrderNumber('');
                                            setSaleId(null);
                                        }}
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
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Qty Bought</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'right' }}>Price Paid</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {foundSale.items?.map(it => {
                                                const isSelected = returnedProduct?.id === it.product_id;
                                                return (
                                                    <tr key={it.sale_item_id} style={{ borderBottom: '1px solid var(--border)', background: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'transparent' }}>
                                                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                            {it.product_name}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                            {it.part_number || '—'}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'monospace' }}>
                                                            {it.quantity}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                                                            {formatCurrency(it.price)}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSelectReceiptItem(it)}
                                                                className={isSelected ? 'btn-secondary' : 'btn-primary'}
                                                                style={{ height: '28px', padding: '0 12px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                                            >
                                                                {isSelected ? '✓ Selected' : 'Swap This Item'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Step 2: Side-by-Side: Returned Item vs New Replacement Products Cart */}
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

                            {/* Catalog Search if no receipt item chosen */}
                            {!returnedProduct ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        If customer has no receipt, search the catalog directly for the part being returned:
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
                                                {returnedProduct.part_number || 'No SKU'} • {returnedProduct.brand || 'Generic'}
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
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setReturnedQty(Math.max(1, returnedQty - 1))}
                                                    style={{ width: '32px', height: '36px', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '6px 0 0 6px', cursor: 'pointer', color: 'var(--text-main)' }}
                                                >
                                                    -
                                                </button>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={returnedQty}
                                                    onChange={(e) => setReturnedQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                                    className="input-premium"
                                                    style={{ width: '100%', height: '36px', textAlign: 'center', borderRadius: 0, fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setReturnedQty(returnedQty + 1)}
                                                    style={{ width: '32px', height: '36px', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '0 6px 6px 0', cursor: 'pointer', color: 'var(--text-main)' }}
                                                >
                                                    +
                                                </button>
                                            </div>
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
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        background: 'rgba(239, 68, 68, 0.08)',
                                        border: '1px solid rgba(239, 68, 68, 0.25)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                            Total Trade-In Credit:
                                        </span>
                                        <span style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--danger)' }}>
                                            {formatCurrency(returnedCreditTotal)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT: Multi-Item Replacement Cart */}
                        <div className="glass-panel" style={{
                            padding: '20px',
                            borderRadius: '14px',
                            border: replacementItems.length > 0 ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Package size={15} />
                                    </div>
                                    <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                        Replacement Part(s)
                                    </h3>
                                </div>
                                <span style={{
                                    fontSize: '0.72rem',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    background: replacementItems.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface)',
                                    color: replacementItems.length > 0 ? 'var(--primary)' : 'var(--text-muted)',
                                    fontWeight: 700
                                }}>
                                    {replacementItems.length} {replacementItems.length === 1 ? 'Item Added' : 'Items Added'}
                                </span>
                            </div>

                            {/* Search and Add Replacements (Always Available so user can add multiple items) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    {replacementItems.length === 0 ? 'Search and select replacement part:' : '+ Add more parts to swap:'}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        ref={newSearchInputRef}
                                        type="text"
                                        placeholder="Search parts to add (e.g. tires, tubes, oil, brake pads)..."
                                        value={newSearchQuery}
                                        onChange={(e) => handleSearchNewProduct(e.target.value)}
                                        className="input-premium"
                                        style={{ width: '100%', height: '36px', paddingLeft: '32px', fontSize: '0.82rem' }}
                                    />
                                </div>

                                {/* Dropdown Search Results */}
                                {newSearchResults.length > 0 && (
                                    <div style={{
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        background: 'var(--surface)',
                                        maxHeight: '220px',
                                        overflowY: 'auto',
                                        boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
                                        zIndex: 10
                                    }}>
                                        {newSearchResults.map(p => {
                                            const inStock = Number(p.stock || 0) > 0;
                                            return (
                                                <div
                                                    key={p.id}
                                                    onClick={() => inStock && handleAddReplacementProduct(p)}
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
                                                            {p.part_number || '—'} • {p.brand} • <span style={{ color: inStock ? 'var(--primary)' : 'var(--danger)', fontWeight: 600 }}>Stock: {p.stock}</span>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                                                            {formatCurrency(p.selling_price || p.price)}
                                                        </span>
                                                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--primary)', color: '#fff', fontWeight: 700 }}>
                                                            + Add
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* List of Selected Replacement Items */}
                            {replacementItems.length === 0 ? (
                                <div style={{
                                    border: '1.5px dashed var(--border)',
                                    borderRadius: '10px',
                                    padding: '24px 16px',
                                    textAlign: 'center',
                                    color: 'var(--text-muted)'
                                }}>
                                    <ShoppingBag size={28} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                                    <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>No replacement parts added yet</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                                        Use the search bar above to pick parts the customer wants to take home.
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{
                                        maxHeight: '260px',
                                        overflowY: 'auto',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        {replacementItems.map(it => (
                                            <div
                                                key={it.product_id}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: '8px',
                                                    background: 'var(--surface-hover)',
                                                    border: '1px solid var(--border)',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    gap: '10px'
                                                }}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {it.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        {it.part_number || 'No SKU'} • {it.brand} • <span style={{ color: 'var(--primary)' }}>Stock: {it.stock}</span>
                                                    </div>
                                                </div>

                                                {/* Quantity Stepper */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateReplacementQty(it.product_id, -1)}
                                                        style={{
                                                            width: '26px',
                                                            height: '28px',
                                                            borderRadius: '4px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--surface)',
                                                            color: 'var(--text-main)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                    >
                                                        <Minus size={12} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max={it.stock}
                                                        value={it.qty}
                                                        onChange={(e) => handleSetReplacementQty(it.product_id, e.target.value)}
                                                        style={{
                                                            width: '36px',
                                                            height: '28px',
                                                            borderRadius: '4px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--surface)',
                                                            color: 'var(--text-main)',
                                                            textAlign: 'center',
                                                            fontFamily: 'monospace',
                                                            fontWeight: 700,
                                                            fontSize: '0.8rem'
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateReplacementQty(it.product_id, 1)}
                                                        disabled={it.qty >= it.stock}
                                                        style={{
                                                            width: '26px',
                                                            height: '28px',
                                                            borderRadius: '4px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--surface)',
                                                            color: 'var(--text-main)',
                                                            cursor: it.qty >= it.stock ? 'not-allowed' : 'pointer',
                                                            opacity: it.qty >= it.stock ? 0.4 : 1,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                    >
                                                        <Plus size={12} />
                                                    </button>
                                                </div>

                                                {/* Line Price & Remove */}
                                                <div style={{ textAlign: 'right', minWidth: '70px' }}>
                                                    <div style={{ fontSize: '0.88rem', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                        {formatCurrency(it.subtotal)}
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                        @{formatCurrency(it.unit_price)}
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveReplacementItem(it.product_id)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--danger)',
                                                        cursor: 'pointer',
                                                        padding: '4px'
                                                    }}
                                                    title="Remove from replacements"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Total Replacements Summary Box */}
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        background: 'rgba(16, 185, 129, 0.08)',
                                        border: '1px solid rgba(16, 185, 129, 0.25)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginTop: '4px'
                                    }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                            Total Replacements ({totalReplacementQty} {totalReplacementQty === 1 ? 'part' : 'parts'}):
                                        </span>
                                        <span style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)' }}>
                                            {formatCurrency(newReplacementTotal)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Step 3: Exchange Calculation & Policy Verification */}
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <DollarSign size={18} color="var(--primary)" />
                            <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                Step 3: Exchange Calculation & Policy Verification
                            </h3>
                        </div>

                        {/* 3 Metric Summary Boxes */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '14px',
                            marginBottom: '18px'
                        }}>
                            {/* Card 1: Returned Credit */}
                            <div style={{
                                padding: '14px 16px',
                                borderRadius: '10px',
                                background: 'var(--surface)',
                                border: '1.5px solid var(--border)'
                            }}>
                                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                    Returned Item Credit
                                </div>
                                <div style={{ fontSize: '1.6rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--danger)', marginTop: '4px' }}>
                                    {formatCurrency(returnedCreditTotal)}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {returnedProduct ? `${returnedProduct.name} (x${returnedQty})` : 'No item selected'}
                                </div>
                            </div>

                            {/* Card 2: Total Replacements */}
                            <div style={{
                                padding: '14px 16px',
                                borderRadius: '10px',
                                background: 'var(--surface)',
                                border: '1.5px solid var(--border)'
                            }}>
                                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                    Total Replacements Value
                                </div>
                                <div style={{ fontSize: '1.6rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)', marginTop: '4px' }}>
                                    {formatCurrency(newReplacementTotal)}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {replacementItems.length > 0 ? `${replacementItems.length} product(s) chosen` : 'No replacement added'}
                                </div>
                            </div>

                            {/* Card 3: Balance Status */}
                            <div style={{
                                padding: '14px 16px',
                                borderRadius: '10px',
                                background: customerTopUpRequired > 0
                                    ? 'rgba(16, 185, 129, 0.1)'
                                    : unusedCredit > 0
                                        ? 'rgba(234, 179, 8, 0.1)'
                                        : 'var(--surface)',
                                border: customerTopUpRequired > 0
                                    ? '1.5px solid rgba(16, 185, 129, 0.4)'
                                    : unusedCredit > 0
                                        ? '1.5px solid rgba(234, 179, 8, 0.4)'
                                        : '1.5px solid var(--border)'
                            }}>
                                <div style={{
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    color: customerTopUpRequired > 0
                                        ? 'var(--primary)'
                                        : unusedCredit > 0
                                            ? '#eab308'
                                            : 'var(--text-muted)',
                                    textTransform: 'uppercase'
                                }}>
                                    {customerTopUpRequired > 0
                                        ? 'Customer Top-Up Required'
                                        : unusedCredit > 0
                                            ? 'Unused Trade-In Credit'
                                            : 'Even / Policy Balance'}
                                </div>
                                <div style={{
                                    fontSize: '1.6rem',
                                    fontFamily: 'monospace',
                                    fontWeight: 900,
                                    color: customerTopUpRequired > 0
                                        ? 'var(--primary)'
                                        : unusedCredit > 0
                                            ? '#eab308'
                                            : 'var(--text-main)',
                                    marginTop: '4px'
                                }}>
                                    {customerTopUpRequired > 0
                                        ? `+${formatCurrency(customerTopUpRequired)}`
                                        : unusedCredit > 0
                                            ? formatCurrency(unusedCredit)
                                            : '₱0.00'}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {customerTopUpRequired > 0
                                        ? 'Customer adds cash for pricey upgrade'
                                        : unusedCredit > 0
                                            ? 'Can add more parts to use this credit'
                                            : 'No money exchanged'}
                                </div>
                            </div>
                        </div>

                        {/* SMART POLICY & NOTICE BANNERS */}
                        {unusedCredit > 0 && (
                            <div style={{
                                padding: '14px 18px',
                                borderRadius: '10px',
                                background: 'rgba(234, 179, 8, 0.1)',
                                border: '1.5px solid rgba(234, 179, 8, 0.35)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '12px',
                                marginBottom: '18px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
                                    <AlertTriangle size={20} color="#eab308" style={{ flexShrink: 0 }} />
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                                        <strong style={{ color: '#eab308' }}>Customer has {formatCurrency(unusedCredit)} remaining credit!</strong>
                                        <br />
                                        Because items cannot be exchanged for cash, the customer can <strong>add more parts</strong> (e.g. inner tube, engine oil, accessories) so they don't forfeit their value.
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleFocusNewSearch}
                                    className="btn-primary"
                                    style={{
                                        height: '36px',
                                        padding: '0 16px',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        cursor: 'pointer',
                                        background: '#eab308',
                                        borderColor: '#eab308',
                                        color: '#000'
                                    }}
                                >
                                    <Plus size={15} />
                                    <span>+ Add More Parts ({formatCurrency(unusedCredit)} left)</span>
                                </button>
                            </div>
                        )}

                        {customerTopUpRequired > 0 && (
                            <div style={{
                                padding: '14px 18px',
                                borderRadius: '10px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1.5px solid rgba(16, 185, 129, 0.35)',
                                marginBottom: '18px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                    <CheckCircle2 size={20} color="var(--primary)" />
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                        Pricey Upgrade: Customer adds {formatCurrency(customerTopUpRequired)}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                            Payment Method *
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setPaymentMethod('Cash')}
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.78rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    border: paymentMethod === 'Cash' ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                                                    background: paymentMethod === 'Cash' ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface)',
                                                    color: paymentMethod === 'Cash' ? 'var(--primary)' : 'var(--text-muted)'
                                                }}
                                            >
                                                Cash
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPaymentMethod('GCash')}
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.78rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    border: paymentMethod === 'GCash' ? '1.5px solid #3b82f6' : '1px solid var(--border)',
                                                    background: paymentMethod === 'GCash' ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface)',
                                                    color: paymentMethod === 'GCash' ? '#3b82f6' : 'var(--text-muted)'
                                                }}
                                            >
                                                GCash
                                            </button>
                                        </div>
                                    </div>

                                    {paymentMethod === 'Cash' && (
                                        <>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                    Cash Tendered (₱)
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min={customerTopUpRequired}
                                                    placeholder={customerTopUpRequired.toString()}
                                                    value={amountTendered}
                                                    onChange={(e) => setAmountTendered(e.target.value)}
                                                    className="input-premium"
                                                    style={{ width: '100%', height: '36px', fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                    Change Due
                                                </label>
                                                <div style={{
                                                    height: '36px',
                                                    padding: '0 12px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    borderRadius: '8px',
                                                    background: 'var(--surface)',
                                                    border: '1px solid var(--border)',
                                                    fontFamily: 'monospace',
                                                    fontWeight: 900,
                                                    fontSize: '0.95rem',
                                                    color: 'var(--primary)'
                                                }}>
                                                    {formatCurrency(changeDue)}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Customer & Reason Inputs */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '18px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                    Customer Name
                                </label>
                                <input
                                    type="text"
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
                                    <option value="Defective on arrival">Defective on arrival</option>
                                    <option value="Changed preference">Changed preference</option>
                                    <option value="Other">Other</option>
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

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setReturnedProduct(null);
                                    setReturnedQty(1);
                                    setReturnedUnitPrice(0);
                                    setReplacementItems([]);
                                    setFoundSale(null);
                                    setLookupQuery('');
                                    setAmountTendered('');
                                    setSwapNotes('');
                                }}
                                className="btn-secondary"
                                style={{ height: '40px', padding: '0 20px', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Reset
                            </button>

                            <button
                                type="button"
                                onClick={handleProcessSwap}
                                disabled={processingSwap || !returnedProduct || replacementItems.length === 0}
                                className="btn-primary"
                                style={{
                                    height: '40px',
                                    padding: '0 24px',
                                    fontSize: '0.86rem',
                                    fontWeight: 800,
                                    cursor: processingSwap || !returnedProduct || replacementItems.length === 0 ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <Check size={16} />
                                <span>
                                    {processingSwap
                                        ? 'Processing Swap...'
                                        : customerTopUpRequired > 0
                                            ? `Complete Swap & Collect ${formatCurrency(customerTopUpRequired)} Top-Up`
                                            : `Complete Item Swap (${replacementItems.length} ${replacementItems.length === 1 ? 'part' : 'parts'})`}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* TAB 2: SWAP AUDIT & HISTORY TABLE                        */}
            {/* ========================================================= */}
            {activeTab === 'swap_history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', minWidth: 0 }}>
                    {/* 4 Summary KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', width: '100%' }}>
                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Total Swaps Processed
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '4px' }}>
                                {swapSummary.total_swaps || 0}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Customer exchanges logged
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>
                                Total Pricey Top-Ups
                            </div>
                            <div style={{ fontSize: '1.6rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)', marginTop: '4px' }}>
                                {formatCurrency(swapSummary.total_top_ups_collected || 0)}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Collected for upgraded products
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>
                                Restocked Good Items
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3b82f6', marginTop: '4px' }}>
                                {swapSummary.items_restocked || 0}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Returned to sellable shelf inventory
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase' }}>
                                Defective / Damaged Parts
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--danger)', marginTop: '4px' }}>
                                {swapSummary.items_damaged || 0}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Quarantined to damaged stock
                            </div>
                        </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="glass-panel" style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Search by swap code, customer name, part name..."
                                value={historySearch}
                                onChange={(e) => {
                                    setHistorySearch(e.target.value);
                                    setHistoryPage(1);
                                }}
                                className="input-premium"
                                style={{ width: '100%', height: '36px', paddingLeft: '32px', fontSize: '0.82rem' }}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={fetchSwapHistory}
                            className="btn-secondary"
                            style={{ height: '36px', padding: '0 14px', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                        >
                            <RefreshCw size={14} className={loadingSwaps ? 'animate-spin' : ''} />
                            <span>Refresh</span>
                        </button>
                    </div>

                    {/* History Table */}
                    <div className="table-container" style={{ margin: 0, borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                        {loadingSwaps ? (
                            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: 'var(--primary)' }} />
                                <div>Loading swap audit records...</div>
                            </div>
                        ) : swaps.length === 0 ? (
                            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <Receipt size={32} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
                                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>No swap records found</div>
                                <div style={{ fontSize: '0.78rem', marginTop: '2px' }}>Customer exchanges processed at the counter will appear here.</div>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto', width: '100%' }}>
                                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Swap Code</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Date & Customer</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Returned Item</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Replacement Item(s)</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Credit Given</th>
                                            <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>New Total</th>
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
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        {s.replacement_items?.length > 1 ? `${s.replacement_items.length} items bundled` : s.new_brand}
                                                    </div>
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
            {/* RECENT SALES MODAL (FOR EASY RECEIPT SELECTION)          */}
            {/* ========================================================= */}
            {showRecentModal && (
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
                        maxWidth: '680px',
                        width: '100%',
                        borderRadius: '16px',
                        padding: '24px',
                        position: 'relative',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={20} color="var(--primary)" />
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                                    Recent Completed Sales Receipts
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowRecentModal(false)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {loadingRecent ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: 'var(--primary)' }} />
                                <div>Loading recent sales...</div>
                            </div>
                        ) : recentSales.length === 0 ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No recent sales found.
                            </div>
                        ) : (
                            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {recentSales.map(sale => (
                                    <div
                                        key={sale.id}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '8px',
                                            background: 'var(--surface-hover)',
                                            border: '1px solid var(--border)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '12px'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                                                    #{sale.order_number}
                                                </span>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 600 }}>
                                                    {sale.customer_name}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                                {formatAuditDate(sale.created_at)} • {sale.items?.length || 0} item(s) • Total: {formatCurrency(sale.total_amount)}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                Parts: {sale.items?.map(it => it.product_name).join(', ')}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleSelectSaleFromModal(sale)}
                                            className="btn-primary"
                                            style={{ height: '32px', padding: '0 14px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                                        >
                                            Select Receipt
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setShowRecentModal(false)}
                                className="btn-secondary"
                                style={{ height: '34px', padding: '0 16px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Close
                            </button>
                        </div>
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
                        maxWidth: '460px',
                        width: '100%',
                        borderRadius: '16px',
                        padding: '24px',
                        position: 'relative',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        maxHeight: '90vh',
                        overflowY: 'auto'
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

                            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
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
                                    <span style={{ color: 'var(--text-muted)' }}>Reason:</span>
                                    <span>{completedSwap.reason || 'Item exchange'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Processed By:</span>
                                    <span>{completedSwap.processed_by}</span>
                                </div>
                            </div>

                            {/* Item Comparison Section */}
                            <div style={{
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '12px',
                                background: 'var(--surface-hover)',
                                fontSize: '0.78rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                marginBottom: '14px'
                            }}>
                                {/* Returned Item */}
                                <div>
                                    <div style={{ color: 'var(--danger)', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '2px' }}>
                                        Returned Part (Credit):
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-main)' }}>
                                        <span>{completedSwap.returned_product_name} (x{completedSwap.returned_qty})</span>
                                        <span style={{ fontFamily: 'monospace', color: 'var(--danger)', fontWeight: 800 }}>
                                            -{formatCurrency(completedSwap.returned_credit_total)}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {completedSwap.returned_part_number} • {completedSwap.returned_disposition === 'RESTOCK' ? 'Restocked' : 'Defective'}
                                    </div>
                                </div>

                                {/* Replacement Items (Itemized) */}
                                <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                                    <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        Replacement Part(s) Issued:
                                    </div>
                                    {completedSwap.replacement_items && completedSwap.replacement_items.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {completedSwap.replacement_items.map((it, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)', fontSize: '0.76rem' }}>
                                                    <span>{it.name} (x{it.qty})</span>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                        {formatCurrency(it.subtotal || (it.unit_price * it.qty))}
                                                    </span>
                                                </div>
                                            ))}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dotted var(--border)', paddingTop: '4px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
                                                <span>Total Replacement Value:</span>
                                                <span style={{ fontFamily: 'monospace' }}>+{formatCurrency(completedSwap.new_total_price)}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-main)' }}>
                                            <span>{completedSwap.new_product_name} (x{completedSwap.new_qty})</span>
                                            <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                +{formatCurrency(completedSwap.new_total_price)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Payment / Top-Up Total */}
                            <div style={{
                                padding: '10px 14px',
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
                                <span style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)' }}>
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
