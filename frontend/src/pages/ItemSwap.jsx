import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
    ArrowLeftRight,
    Search,
    RefreshCw,
    Printer,
    CheckCircle2,
    Package,
    DollarSign,
    ShieldAlert,
    RotateCcw,
    X,
    Clock,
    Check,
    Receipt,
    AlertTriangle,
    Lock,
    Unlock,
    HelpCircle
} from 'lucide-react';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

export const ItemSwap = () => {
    const { user } = useContext(AuthContext);
    const [searchParams] = useSearchParams();

    // Tabs: 'new_swap' | 'swap_history'
    const [activeTab, setActiveTab] = useState('new_swap');

    // ==========================================
    // 1. STEP 1: RECEIPT LOOKUP & SWAP CAP
    // ==========================================
    const [lookupQuery, setLookupQuery] = useState('');
    const [lookingUpOrder, setLookingUpOrder] = useState(false);
    const [foundSale, setFoundSale] = useState(null);
    const [selectedSaleItem, setSelectedSaleItem] = useState(null);

    // Recent receipts inline panel
    const [showRecentPanel, setShowRecentPanel] = useState(false);
    const [recentSales, setRecentSales] = useState([]);
    const [loadingRecent, setLoadingRecent] = useState(false);

    // Customer & Details
    const [customerName, setCustomerName] = useState('Walk-in Customer');
    const [swapReason, setSwapReason] = useState('Wrong fitment / size');
    const [swapNotes, setSwapNotes] = useState('');

    // ==========================================
    // 2. STEP 2: RETURNED ITEM & CONDITION CHECK
    // ==========================================
    const [returnedProduct, setReturnedProduct] = useState(null);
    const [returnedUnitPrice, setReturnedUnitPrice] = useState(0);
    const [counterConditionVerified, setCounterConditionVerified] = useState(false);

    // Catalog search for returned item (for walk-ins without receipt)
    const [showDirectReturnSearch, setShowDirectReturnSearch] = useState(false);
    const [retSearchQuery, setRetSearchQuery] = useState('');
    const [retSearchResults, setRetSearchResults] = useState([]);
    const [searchingRet, setSearchingRet] = useState(false);

    // ==========================================
    // 3. STEP 3: REPLACEMENT PART SELECTOR & CART
    // ==========================================
    const [replacementCart, setReplacementCart] = useState([]);
    const [newSearchQuery, setNewSearchQuery] = useState('');
    const [catalogProducts, setCatalogProducts] = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(false);

    // Backwards compatibility helper
    const selectedReplacement = replacementCart[0] || null;

    // ==========================================
    // 4. STEP 4: CHECKOUT & PAYMENT
    // ==========================================
    const [paymentMethod, setPaymentMethod] = useState('Cash'); // 'Cash' | 'GCash'
    const [amountTendered, setAmountTendered] = useState('');
    const [processingSwap, setProcessingSwap] = useState(false);

    // Completed Swap Result (for Thermal Slip Modal)
    const [completedSwap, setCompletedSwap] = useState(null);
    const [showSlipModal, setShowSlipModal] = useState(false);

    // ==========================================
    // 5. SWAP AUDIT & HISTORY STATE
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
        total_cogs_adjustment: 0
    });

    // ==========================================
    // EXACT ACCOUNTING MATH
    // ==========================================
    const oldPricePaid = Number(returnedUnitPrice) || 0;
    const newReplacementPrice = useMemo(() => {
        return replacementCart.reduce((sum, it) => {
            const p = Number(it.selling_price || it.price || 0);
            const q = Number(it.qty || 1);
            return sum + (p * q);
        }, 0);
    }, [replacementCart]);

    const priceDifference = Math.round((newReplacementPrice - oldPricePaid) * 100) / 100;
    const isEven = replacementCart.length > 0 && Math.abs(priceDifference) < 0.01;
    const isUpgrade = priceDifference > 0.01;
    const isUnderCredit = replacementCart.length > 0 && priceDifference < -0.01;
    const remainingNeeded = isUnderCredit ? Math.abs(priceDifference) : 0;
    const isDowngrade = isUnderCredit;

    const topUpDue = isUpgrade ? priceDifference : 0;

    const changeDue = useMemo(() => {
        if (!isUpgrade || paymentMethod !== 'Cash') return 0;
        const tendered = Number(amountTendered) || 0;
        return Math.max(0, Math.round((tendered - topUpDue) * 100) / 100);
    }, [isUpgrade, paymentMethod, amountTendered, topUpDue]);

    // ==========================================
    // AUTOMATIC LOOKUP FROM URL PARAM
    // ==========================================
    const handleLookupOrder = useCallback(async (e, customQuery) => {
        if (e) e.preventDefault();
        const q = (customQuery !== undefined ? customQuery : lookupQuery).trim();
        if (!q) return toast.error('Enter an Order Number or Receipt No');

        setLookingUpOrder(true);
        try {
            const res = await api.get('/swaps/lookup-order', { params: { query: q } });
            if (res.data.success && res.data.sale) {
                const s = res.data.sale;
                setFoundSale(s);
                setCustomerName(s.customer_name || 'Walk-in Customer');
                setSelectedSaleItem(null);
                setReturnedProduct(null);
                setReturnedUnitPrice(0);
                setCounterConditionVerified(false);
                setReplacementCart([]);
                toast.success(`Found Receipt #${s.order_number}`);
            }
        } catch (err) {
            console.error('Order lookup failed:', err);
            toast.error(err.response?.data?.message || `No receipt found for "${q}"`);
            setFoundSale(null);
        } finally {
            setLookingUpOrder(false);
        }
    }, [lookupQuery]);

    useEffect(() => {
        const receiptParam = searchParams.get('receipt') || searchParams.get('sale_id');
        if (receiptParam) {
            setLookupQuery(receiptParam);
            handleLookupOrder(null, receiptParam);
        }
    }, [searchParams, handleLookupOrder]);

    // Toggle recent sales inline panel
    const handleToggleRecentPanel = async () => {
        if (showRecentPanel) {
            setShowRecentPanel(false);
            return;
        }
        setShowRecentPanel(true);
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

    const handleSelectSaleFromRecent = (sale) => {
        setFoundSale(sale);
        setLookupQuery(sale.order_number || '');
        setCustomerName(sale.customer_name || 'Walk-in Customer');
        setSelectedSaleItem(null);
        setReturnedProduct(null);
        setReturnedUnitPrice(0);
        setCounterConditionVerified(false);
        setReplacementCart([]);
        setShowRecentPanel(false);
        toast.success(`Selected Receipt #${sale.order_number}`);
    };

    // Selecting a line item from verified receipt
    const handleSelectReceiptItem = (item) => {
        const cap = Number(item.swappable_cap ?? (item.qty_sold - item.qty_swapped));
        if (cap <= 0) {
            return toast.error(`Item "${item.product_name}" has already been swapped (Cap: 0).`);
        }

        setSelectedSaleItem(item);
        setReturnedProduct({
            id: item.product_id,
            name: item.product_name,
            part_number: item.part_number,
            brand: item.brand,
            category: item.category
        });
        setReturnedUnitPrice(Number(item.price || 0));
        setCounterConditionVerified(false);
        setReplacementCart([]);
        toast.success(`Selected "${item.product_name}" (Cap: ${cap} units remaining)`);
    };

    // Fallback search for walk-in returned items without receipt
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
        setSelectedSaleItem(null);
        setReturnedProduct({
            id: prod.id,
            name: prod.name,
            part_number: prod.part_number,
            brand: prod.brand,
            category: prod.category
        });
        setReturnedUnitPrice(Number(prod.selling_price || prod.price || 0));
        setCounterConditionVerified(false);
        setReplacementCart([]);
        setRetSearchQuery('');
        setRetSearchResults([]);
        setShowDirectReturnSearch(false);
        toast.success(`Selected "${prod.name}" as returned part`);
    };

    // ==========================================
    // FETCH CATALOG PRODUCTS FOR REPLACEMENT
    // ==========================================
    const fetchCatalog = useCallback(async (searchQuery = '') => {
        setLoadingCatalog(true);
        try {
            const res = await api.get('/products', {
                params: {
                    search: searchQuery.trim(),
                    limit: 40
                }
            });
            const rawProds = res.data.products || res.data || [];
            const prods = rawProds.map(p => {
                const pName = p.product_name || p.name || 'Motorcycle Part';
                return {
                    ...p,
                    id: p.id,
                    product_id: p.id,
                    name: pName,
                    product_name: pName,
                    part_number: p.part_number || '',
                    brand: p.brand || '',
                    selling_price: Number(p.selling_price || p.price || 0),
                    cost_price: Number(p.cost_price || 0),
                    stock: Number(p.stock ?? p.current_stock ?? 0)
                };
            });
            setCatalogProducts(prods);
        } catch (err) {
            console.error('Failed to load catalog products:', err);
        } finally {
            setLoadingCatalog(false);
        }
    }, []);

    useEffect(() => {
        if (counterConditionVerified) {
            fetchCatalog(newSearchQuery);
        }
    }, [counterConditionVerified, newSearchQuery, fetchCatalog]);

    // Handle adding replacement items to the swap cart (supports lower-priced & multiple items)
    const handleAddToCart = (prod) => {
        const prodName = prod.name || prod.product_name || 'Motorcycle Part';
        if (Number(prod.stock || 0) <= 0) {
            return toast.error(`"${prodName}" is OUT OF STOCK.`);
        }
        setReplacementCart(prev => {
            const existingIndex = prev.findIndex(item => (item.id || item.product_id) === prod.id);
            if (existingIndex > -1) {
                const currentQty = prev[existingIndex].qty || 1;
                if (currentQty >= Number(prod.stock)) {
                    toast.error(`Only ${prod.stock} units available in stock for "${prodName}"`);
                    return prev;
                }
                const updated = [...prev];
                updated[existingIndex] = {
                    ...updated[existingIndex],
                    qty: currentQty + 1
                };
                toast.success(`Increased "${prodName}" quantity to ${currentQty + 1}`);
                return updated;
            } else {
                toast.success(`Added "${prodName}" to swap cart`);
                return [...prev, {
                    ...prod,
                    id: prod.id,
                    product_id: prod.id,
                    name: prodName,
                    product_name: prodName,
                    part_number: prod.part_number || '',
                    brand: prod.brand || '',
                    selling_price: Number(prod.selling_price || prod.price || 0),
                    cost_price: Number(prod.cost_price || 0),
                    stock: Number(prod.stock || 0),
                    qty: 1
                }];
            }
        });
    };

    const handleUpdateCartQty = (productId, newQty) => {
        const parsed = parseInt(newQty, 10);
        if (isNaN(parsed) || parsed <= 0) {
            handleRemoveFromCart(productId);
            return;
        }
        setReplacementCart(prev => {
            return prev.map(item => {
                if ((item.id || item.product_id) === productId) {
                    const maxStock = Number(item.stock || 9999);
                    if (parsed > maxStock) {
                        toast.error(`Only ${maxStock} units available for "${item.name}"`);
                        return { ...item, qty: maxStock };
                    }
                    return { ...item, qty: parsed };
                }
                return item;
            });
        });
    };

    const handleRemoveFromCart = (productId) => {
        setReplacementCart(prev => prev.filter(item => (item.id || item.product_id) !== productId));
        toast.success('Removed item from swap cart');
    };

    // Auto-update amount tendered when upgrade topUpDue changes
    useEffect(() => {
        if (isUpgrade) {
            setAmountTendered(String(topUpDue));
        } else {
            setAmountTendered('0');
        }
    }, [isUpgrade, topUpDue]);

    // ==========================================
    // PROCESS ITEM SWAP SUBMIT
    // ==========================================
    const handleProcessSwap = async (e) => {
        e.preventDefault();

        if (!returnedProduct) {
            return toast.error('Please select the returned item in Step 1');
        }
        if (!counterConditionVerified) {
            return toast.error('Mandatory Counter Condition Check must be verified in Step 2');
        }
        if (replacementCart.length === 0) {
            return toast.error('Please select at least one replacement part in Step 3');
        }

        if (isUnderCredit) {
            return toast.error(`Zero Cash Refund Policy: Replacement total (₱${newReplacementPrice.toFixed(2)}) is lower than returned credit (₱${oldPricePaid.toFixed(2)}). Please add at least ₱${remainingNeeded.toFixed(2)} more in replacement items.`);
        }

        if (isUpgrade && paymentMethod === 'Cash') {
            const tendered = Number(amountTendered) || 0;
            if (tendered < topUpDue) {
                return toast.error(`Customer must add ₱${topUpDue.toFixed(2)}. Tendered amount (₱${tendered.toFixed(2)}) is insufficient.`);
            }
        }

        setProcessingSwap(true);
        try {
            const payload = {
                sale_id: foundSale?.id || null,
                sale_item_id: selectedSaleItem?.sale_item_id || selectedSaleItem?.id || null,
                order_number: foundSale?.order_number || null,
                customer_name: customerName.trim() || 'Walk-in Customer',
                returned_product_id: returnedProduct?.id,
                returned_qty: 1,
                returned_unit_price: oldPricePaid,
                counter_condition_verified: true,
                replacement_items: replacementCart.map(item => ({
                    product_id: item.id || item.product_id,
                    qty: Number(item.qty || 1)
                })),
                new_product_id: replacementCart[0]?.id || replacementCart[0]?.product_id,
                new_qty: replacementCart.reduce((s, it) => s + Number(it.qty || 1), 0),
                payment_method: isUpgrade ? paymentMethod : 'None',
                amount_tendered: isUpgrade ? (paymentMethod === 'Cash' ? (Number(amountTendered) || topUpDue) : topUpDue) : 0,
                reason: swapReason,
                notes: swapNotes.trim()
            };

            const res = await api.post('/swaps', payload);
            if (res.data.success) {
                toast.success(res.data.message || 'Item swap completed successfully!');
                setCompletedSwap(res.data.swap);
                setShowSlipModal(true);

                // Reset workflow state
                setFoundSale(null);
                setSelectedSaleItem(null);
                setReturnedProduct(null);
                setReturnedUnitPrice(0);
                setCounterConditionVerified(false);
                setReplacementCart([]);
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
    // FETCH SWAP AUDIT HISTORY
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
                        Strict Zero-Cash Policy: Customers cannot exchange items for cash. They can perform an Equal-Value Swap (₱0.00) or pay the difference for a pricey upgrade.
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
                        <RotateCcw size={15} />
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
                        <span>Swap Ledger ({swapSummary.total_swaps || 0})</span>
                    </button>
                </div>
            </div>

            {/* Strict Policy Rules Banner */}
            <div className="glass-panel" style={{
                padding: '12px 18px',
                borderRadius: '12px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                border: '1.5px solid rgba(16, 185, 129, 0.35)',
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
                <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: '1.45' }}>
                    <strong style={{ color: 'var(--primary)' }}>Strict Zero Cash Refund Policy:</strong> Money is never handed back to the customer. Any replacement item priced lower than the original paid price is blocked. Only two paths are allowed:
                    <span style={{ fontWeight: 700, color: '#10b981', marginLeft: '6px' }}>Scenario A (Equal-Value Swap ₱0.00)</span> or
                    <span style={{ fontWeight: 700, color: '#3b82f6', marginLeft: '6px' }}>Scenario B (Upgrade Swap with Cash/GCash Top-Up)</span>.
                </div>
            </div>

            {/* ========================================================= */}
            {/* TAB 1: 4-STEP ITEM SWAP WORKFLOW                          */}
            {/* ========================================================= */}
            {activeTab === 'new_swap' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', minWidth: 0 }}>

                    {/* ========================================================= */}
                    {/* STEP 1: RECEIPT LOOKUP & SWAP CAP                         */}
                    {/* ========================================================= */}
                    <div className="glass-panel" style={{
                        padding: '20px',
                        borderRadius: '14px',
                        border: foundSale ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
                                    1
                                </div>
                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                    Step 1: Receipt Lookup & Swappable Cap Verification
                                </h3>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Enter Receipt / Order # to check purchase price and remaining swappable quantity
                            </span>
                        </div>

                        {/* Search Bar */}
                        <form onSubmit={(e) => handleLookupOrder(e)} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                                <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Enter Receipt No. (e.g. SO-2026-0001, SO-0001, or 1)..."
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
                                {lookingUpOrder ? 'Verifying...' : 'Look Up Receipt'}
                            </button>
                            <button
                                type="button"
                                onClick={handleToggleRecentPanel}
                                className={showRecentPanel ? "btn-primary" : "btn-secondary"}
                                style={{ height: '38px', padding: '0 14px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Clock size={14} color={showRecentPanel ? "#ffffff" : "var(--primary)"} />
                                <span>{showRecentPanel ? 'Hide Recent' : 'Recent Receipts'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowDirectReturnSearch(!showDirectReturnSearch)}
                                className="btn-secondary"
                                style={{ height: '38px', padding: '0 12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}
                                title="Swap part without original receipt (Counter Walk-in)"
                            >
                                No Receipt Walk-in
                            </button>
                        </form>

                        {/* Inline Recent Completed Sales Receipts (NO MODAL, NO GLASS PANEL POPUP) */}
                        {showRecentPanel && !foundSale && (
                            <div style={{
                                padding: '14px 16px',
                                borderRadius: '10px',
                                background: 'var(--surface-hover)',
                                border: '1px solid var(--border)',
                                marginBottom: '14px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Clock size={16} color="var(--primary)" />
                                        <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                            Recent Completed Sales Receipts
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowRecentPanel(false)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            cursor: 'pointer',
                                            fontSize: '0.78rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <X size={15} /> Close
                                    </button>
                                </div>

                                {loadingRecent ? (
                                    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 6px auto', color: 'var(--primary)' }} />
                                        <div style={{ fontSize: '0.8rem' }}>Loading recent sales...</div>
                                    </div>
                                ) : recentSales.length === 0 ? (
                                    <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                        No recent completed sales found.
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {recentSales.map(sale => (
                                            <div
                                                key={sale.id}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: '8px',
                                                    background: 'var(--surface)',
                                                    border: '1px solid var(--border)',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    gap: '10px'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.84rem' }}>
                                                            #{sale.order_number}
                                                        </span>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 600 }}>
                                                            {sale.customer_name}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                        {formatAuditDate(sale.created_at)} • {sale.items?.length || 0} line item(s) • Total: {formatCurrency(sale.total_amount)}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                                                        Items: {sale.items?.map(it => `${it.product_name || it.name} (cap: ${it.swappable_cap})`).join(', ')}
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectSaleFromRecent(sale)}
                                                    className="btn-primary"
                                                    style={{ height: '30px', padding: '0 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                                                >
                                                    Select Receipt
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Direct Walk-in Product Search (No Receipt) */}
                        {showDirectReturnSearch && !foundSale && (
                            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-hover)', border: '1px dashed var(--border)', marginBottom: '14px' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                                    Search Catalog for Returned Item (Counter Walk-in):
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder="Search item name, brand, or part #..."
                                        value={retSearchQuery}
                                        onChange={(e) => handleSearchReturnedProduct(e.target.value)}
                                        className="input-premium"
                                        style={{ width: '100%', height: '34px', paddingLeft: '30px', fontSize: '0.82rem' }}
                                    />
                                </div>
                                {retSearchResults.length > 0 && (
                                    <div style={{ marginTop: '8px', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)' }}>
                                        {retSearchResults.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => handleSelectCatalogReturned(p)}
                                                style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}
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
                        )}

                        {/* Verified Receipt Line Items Table with SWAPPABLE CAP */}
                        {foundSale && (
                            <div style={{ marginTop: '10px' }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    background: 'rgba(16, 185, 129, 0.08)',
                                    border: '1px solid rgba(16, 185, 129, 0.25)',
                                    marginBottom: '12px',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                    fontSize: '0.82rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--primary)', color: '#fff', fontWeight: 800 }}>
                                            RECEIPT VERIFIED
                                        </span>
                                        <strong style={{ color: 'var(--text-main)', fontFamily: 'monospace' }}>#{foundSale.order_number}</strong>
                                        <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                                        <strong style={{ color: 'var(--primary)' }}>{foundSale.customer_name}</strong>
                                        <span style={{ color: 'var(--text-muted)' }}>• Date: {formatAuditDate(foundSale.created_at)}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFoundSale(null);
                                            setSelectedSaleItem(null);
                                            setReturnedProduct(null);
                                            setReturnedUnitPrice(0);
                                            setCounterConditionVerified(false);
                                            setReplacementCart([]);
                                        }}
                                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}
                                    >
                                        Change Receipt
                                    </button>
                                </div>

                                <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'left' }}>Item / Description</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'left' }}>Part #</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Qty Sold</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Already Swapped</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Swappable Cap</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'right' }}>Price Paid (Credit)</th>
                                                <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {foundSale.items?.map(it => {
                                                const sold = Number(it.qty_sold ?? it.quantity ?? 1);
                                                const swapped = Number(it.qty_swapped || 0);
                                                const cap = Math.max(0, sold - swapped);
                                                const isLocked = cap <= 0;
                                                const isSelected = selectedSaleItem?.sale_item_id === it.sale_item_id || selectedSaleItem?.id === it.id;

                                                return (
                                                    <tr key={it.sale_item_id || it.id} style={{
                                                        borderBottom: '1px solid var(--border)',
                                                        background: isSelected ? 'rgba(16, 185, 129, 0.1)' : isLocked ? 'rgba(0,0,0,0.05)' : 'transparent',
                                                        opacity: isLocked ? 0.6 : 1
                                                    }}>
                                                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                            {it.product_name}
                                                            {it.brand && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>{it.brand}</span>}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                            {it.part_number || '—'}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'monospace' }}>
                                                            {sold}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'monospace', color: swapped > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                                                            {swapped}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                            {isLocked ? (
                                                                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', fontWeight: 800 }}>
                                                                    Cap: 0 (Locked)
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)', fontWeight: 800 }}>
                                                                    {cap} unit(s) left
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                                                            {formatCurrency(it.price)}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                            {isLocked ? (
                                                                <button
                                                                    type="button"
                                                                    disabled
                                                                    className="btn-secondary"
                                                                    style={{ height: '28px', padding: '0 10px', fontSize: '0.72rem', opacity: 0.5, cursor: 'not-allowed' }}
                                                                >
                                                                    Fully Swapped
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSelectReceiptItem(it)}
                                                                    className={isSelected ? 'btn-secondary' : 'btn-primary'}
                                                                    style={{ height: '28px', padding: '0 12px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                                                >
                                                                    {isSelected ? '✓ Selected' : 'Select Item (1 unit)'}
                                                                </button>
                                                            )}
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

                    {/* ========================================================= */}
                    {/* STEP 2: MANDATORY COUNTER CONDITION CHECK                 */}
                    {/* ========================================================= */}
                    <div className="glass-panel" style={{
                        padding: '20px',
                        borderRadius: '14px',
                        border: counterConditionVerified ? '1.5px solid rgba(16, 185, 129, 0.4)' : returnedProduct ? '1.5px solid rgba(234, 179, 8, 0.4)' : '1px solid var(--border)',
                        opacity: returnedProduct ? 1 : 0.6
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    background: counterConditionVerified ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                    color: counterConditionVerified ? 'var(--primary)' : '#eab308',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 900
                                }}>
                                    2
                                </div>
                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                    Step 2: Mandatory Counter Condition Check
                                </h3>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Part must be unused, unmounted, and in original packaging to return to Sellable Stock
                            </span>
                        </div>

                        {!returnedProduct ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                Please select a line item from the receipt in <strong>Step 1</strong> above to perform the counter inspection.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {/* Returned Part Summary Card */}
                                <div style={{
                                    padding: '12px 16px',
                                    borderRadius: '10px',
                                    background: 'var(--surface-hover)',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '12px'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                            {returnedProduct?.name}
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            SKU: {returnedProduct?.part_number || 'N/A'} • Brand: {returnedProduct?.brand || 'Generic'} • Quantity: 1 unit
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                            Trade-In Credit
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--danger)' }}>
                                            {formatCurrency(oldPricePaid)}
                                        </div>
                                    </div>
                                </div>

                                {/* Mandatory Counter Check Verification Checkbox */}
                                <label style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '12px',
                                    padding: '14px 16px',
                                    borderRadius: '10px',
                                    background: counterConditionVerified ? 'rgba(16, 185, 129, 0.1)' : 'rgba(234, 179, 8, 0.08)',
                                    border: counterConditionVerified ? '1.5px solid var(--primary)' : '1.5px solid rgba(234, 179, 8, 0.4)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={counterConditionVerified}
                                        onChange={(e) => {
                                            setCounterConditionVerified(e.target.checked);
                                            if (!e.target.checked) setReplacementCart([]);
                                        }}
                                        style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer', accentColor: '#10b981' }}
                                    />
                                    <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: '1.45' }}>
                                        <strong style={{ color: counterConditionVerified ? 'var(--primary)' : '#eab308' }}>
                                            Counter Condition Verification Check:
                                        </strong>
                                        <div style={{ marginTop: '3px' }}>
                                            I confirm that this returned item has been physically checked at the counter and is <strong>unused, unmounted, and in its original undamaged packaging</strong>. It is safe and approved to immediately return to <strong>Sellable Stock (+1)</strong>.
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            <em>(Note: If the part is scratched, installed, or has torn packaging, decline the swap at the counter).</em>
                                        </div>
                                    </div>
                                </label>
                            </div>
                        )}
                    </div>

                    {/* ========================================================= */}
                    {/* STEP 3: REPLACEMENT PART SELECTOR & SWAP CART             */}
                    {/* ========================================================= */}
                    <div className="glass-panel" style={{
                        padding: '20px',
                        borderRadius: '14px',
                        border: replacementCart.length > 0 ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)',
                        opacity: counterConditionVerified ? 1 : 0.5
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    background: counterConditionVerified ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 100, 100, 0.15)',
                                    color: counterConditionVerified ? 'var(--primary)' : 'var(--text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 900
                                }}>
                                    3
                                </div>
                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                    Step 3: Replacement Part Selector & Cart
                                </h3>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Target Swap Value: <strong style={{ color: 'var(--primary)' }}>₱{oldPricePaid.toFixed(2)}</strong> (Lower prices allowed; total cart must reach or exceed target)
                            </span>
                        </div>

                        {!counterConditionVerified ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <Lock size={16} />
                                <span>Locked: Complete <strong>Step 2 Counter Condition Verification</strong> above to unlock the replacement part selector.</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {/* Search input */}
                                <div style={{ position: 'relative' }}>
                                    <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder={`Search replacement parts in Sellable Stock (by part #, name, brand)...`}
                                        value={newSearchQuery}
                                        onChange={(e) => setNewSearchQuery(e.target.value)}
                                        className="input-premium"
                                        style={{ width: '100%', height: '38px', paddingLeft: '34px', fontSize: '0.85rem' }}
                                    />
                                </div>

                                {/* Catalog Table (Lower priced parts are NOT blocked; cashier can select them!) */}
                                {loadingCatalog ? (
                                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto', color: 'var(--primary)' }} />
                                        <div>Loading sellable parts catalog...</div>
                                    </div>
                                ) : catalogProducts.length === 0 ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                                        No products found in catalog matching your search.
                                    </div>
                                ) : (
                                    <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', maxHeight: '300px', overflowY: 'auto' }}>
                                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                                                <tr>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'left' }}>Replacement Part</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'left' }}>Brand & SKU</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Stock</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'right' }}>Retail Price</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Swap Status</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {catalogProducts.map(prod => {
                                                    const prodPrice = Number(prod.selling_price || prod.price || 0);
                                                    const inStock = Number(prod.stock || 0) > 0;
                                                    const itemInCart = replacementCart.find(it => (it.id || it.product_id) === prod.id);
                                                    const inCartQty = itemInCart?.qty || 0;
                                                    const isExact = prodPrice === oldPricePaid;
                                                    const isHigher = prodPrice > oldPricePaid;

                                                    return (
                                                        <tr key={prod.id} style={{
                                                            borderBottom: '1px solid var(--border)',
                                                            background: inCartQty > 0 ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                                                            opacity: !inStock ? 0.5 : 1
                                                        }}>
                                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                                {prod.name || prod.product_name || 'Part'}
                                                            </td>
                                                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                                                                {prod.brand || 'Generic'} • <span style={{ fontFamily: 'monospace' }}>{prod.part_number || '—'}</span>
                                                            </td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: inStock ? 'var(--primary)' : 'var(--danger)' }}>
                                                                {prod.stock} {inStock ? '' : '(OUT)'}
                                                            </td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--text-main)' }}>
                                                                {formatCurrency(prodPrice)}
                                                            </td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                {!inStock ? (
                                                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontWeight: 700 }}>
                                                                        Out of Stock
                                                                    </span>
                                                                ) : inCartQty > 0 ? (
                                                                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)', fontWeight: 800 }}>
                                                                        ✓ In Swap Cart (x{inCartQty})
                                                                    </span>
                                                                ) : isExact ? (
                                                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)', fontWeight: 800 }}>
                                                                        🟢 Exact Match (₱0.00)
                                                                    </span>
                                                                ) : isHigher ? (
                                                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 800 }}>
                                                                        ⬆ Upgrade (+₱{(prodPrice - oldPricePaid).toFixed(2)})
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.12)', color: '#eab308', fontWeight: 700 }}>
                                                                        Available (₱{prodPrice.toFixed(2)})
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                {!inStock ? (
                                                                    <button
                                                                        type="button"
                                                                        disabled
                                                                        className="btn-secondary"
                                                                        style={{ height: '26px', padding: '0 8px', fontSize: '0.72rem', cursor: 'not-allowed', opacity: 0.4 }}
                                                                    >
                                                                        Out of Stock
                                                                    </button>
                                                                ) : inCartQty > 0 ? (
                                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleUpdateCartQty(prod.id, inCartQty - 1)}
                                                                            className="btn-secondary"
                                                                            style={{ width: '24px', height: '24px', padding: 0, fontSize: '0.78rem', fontWeight: 800 }}
                                                                            title="Decrease quantity"
                                                                        >
                                                                            -
                                                                        </button>
                                                                        <span style={{ minWidth: '18px', textAlign: 'center', fontWeight: 800, fontSize: '0.78rem' }}>
                                                                            {inCartQty}
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleAddToCart(prod)}
                                                                            disabled={inCartQty >= Number(prod.stock)}
                                                                            className="btn-primary"
                                                                            style={{ width: '24px', height: '24px', padding: 0, fontSize: '0.78rem', fontWeight: 800 }}
                                                                            title="Add one more"
                                                                        >
                                                                            +
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleAddToCart(prod)}
                                                                        className="btn-primary"
                                                                        style={{ height: '26px', padding: '0 10px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                                                    >
                                                                        + Add to Swap
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Selected Replacement Items Cart & Live Target Progress */}
                                {replacementCart.length > 0 && (
                                    <div style={{
                                        marginTop: '6px',
                                        padding: '14px 16px',
                                        borderRadius: '10px',
                                        background: 'var(--surface-hover)',
                                        border: '1.5px solid var(--border)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Package size={16} color="var(--primary)" />
                                                Selected Replacement Items ({replacementCart.length} {replacementCart.length === 1 ? 'part' : 'parts'})
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setReplacementCart([])}
                                                style={{ background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                Clear Cart
                                            </button>
                                        </div>

                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '12px' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Item Name</th>
                                                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Unit Price</th>
                                                    <th style={{ textAlign: 'center', padding: '6px 8px' }}>Qty</th>
                                                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Subtotal</th>
                                                    <th style={{ textAlign: 'center', padding: '6px 8px', width: '36px' }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {replacementCart.map(it => {
                                                    const price = Number(it.selling_price || it.price || 0);
                                                    const qty = Number(it.qty || 1);
                                                    const subtotal = price * qty;
                                                    return (
                                                        <tr key={it.id || it.product_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                                                                {it.name || it.product_name || 'Part'} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({it.brand || 'Generic'})</span>
                                                            </td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                                                {formatCurrency(price)}
                                                            </td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleUpdateCartQty(it.id || it.product_id, qty - 1)}
                                                                        className="btn-secondary"
                                                                        style={{ width: '22px', height: '22px', padding: 0, fontSize: '0.74rem', fontWeight: 800 }}
                                                                    >
                                                                        -
                                                                    </button>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        max={it.stock}
                                                                        value={qty}
                                                                        onChange={(e) => handleUpdateCartQty(it.id || it.product_id, e.target.value)}
                                                                        style={{ width: '38px', height: '22px', textAlign: 'center', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-main)', borderRadius: '4px', fontSize: '0.76rem', fontWeight: 700 }}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleAddToCart(it)}
                                                                        disabled={qty >= Number(it.stock)}
                                                                        className="btn-primary"
                                                                        style={{ width: '22px', height: '22px', padding: 0, fontSize: '0.74rem', fontWeight: 800 }}
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                                {formatCurrency(subtotal)}
                                                            </td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveFromCart(it.id || it.product_id)}
                                                                    style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px 4px' }}
                                                                    title="Remove item"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>

                                        {/* Live Balance / Policy Target Status */}
                                        <div style={{
                                            padding: '12px 14px',
                                            borderRadius: '8px',
                                            background: isUnderCredit
                                                ? 'rgba(234, 179, 8, 0.12)'
                                                : isEven
                                                    ? 'rgba(16, 185, 129, 0.12)'
                                                    : 'rgba(59, 130, 246, 0.12)',
                                            border: isUnderCredit
                                                ? '1px solid rgba(234, 179, 8, 0.4)'
                                                : isEven
                                                    ? '1px solid rgba(16, 185, 129, 0.4)'
                                                    : '1px solid rgba(59, 130, 246, 0.4)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '8px'
                                        }}>
                                            <div>
                                                <div style={{
                                                    fontSize: '0.84rem',
                                                    fontWeight: 800,
                                                    color: isUnderCredit ? '#eab308' : isEven ? 'var(--primary)' : '#3b82f6'
                                                }}>
                                                    {isUnderCredit
                                                        ? `⚠️ Lacking ₱${remainingNeeded.toFixed(2)} to reach returned product value`
                                                        : isEven
                                                            ? '🟢 Exact Value Match (₱0.00 Difference)'
                                                            : `⬆️ Upgrade Swap (+₱${topUpDue.toFixed(2)} Top-Up Due)`}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {isUnderCredit
                                                        ? `Customer returned ₱${oldPricePaid.toFixed(2)} credit. Please add ₱${remainingNeeded.toFixed(2)} more in parts or quantity (No cash refund allowed).`
                                                        : isEven
                                                            ? 'Selected replacement parts match the credit exactly. No cash exchanged.'
                                                            : `Replacement parts exceed credit by ₱${topUpDue.toFixed(2)}. Customer pays difference at checkout.`}
                                                </div>
                                            </div>

                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Replacement Total</div>
                                                <div style={{
                                                    fontSize: '1.25rem',
                                                    fontFamily: 'monospace',
                                                    fontWeight: 900,
                                                    color: isUnderCredit ? '#eab308' : isEven ? 'var(--primary)' : '#3b82f6'
                                                }}>
                                                    {formatCurrency(newReplacementPrice)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ========================================================= */}
                    {/* STEP 4: ZERO-CASH OR TOP-UP CHECKOUT                      */}
                    {/* ========================================================= */}
                    <div className="glass-panel" style={{
                        padding: '22px',
                        borderRadius: '14px',
                        border: replacementCart.length > 0
                            ? (isUnderCredit ? '1.5px solid rgba(234, 179, 8, 0.4)' : '1.5px solid var(--primary)')
                            : '1px solid var(--border)',
                        opacity: replacementCart.length > 0 ? 1 : 0.5
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    background: replacementCart.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 100, 100, 0.15)',
                                    color: replacementCart.length > 0 ? 'var(--primary)' : 'var(--text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 900
                                }}>
                                    4
                                </div>
                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                    Step 4: Zero-Cash or Top-Up Checkout
                                </h3>
                            </div>
                            {replacementCart.length > 0 && (
                                <span style={{
                                    fontSize: '0.74rem',
                                    padding: '3px 10px',
                                    borderRadius: '6px',
                                    background: isUnderCredit
                                        ? 'rgba(234, 179, 8, 0.15)'
                                        : isEven
                                            ? 'rgba(16, 185, 129, 0.15)'
                                            : 'rgba(59, 130, 246, 0.15)',
                                    color: isUnderCredit ? '#eab308' : isEven ? 'var(--primary)' : '#3b82f6',
                                    fontWeight: 800
                                }}>
                                    {isUnderCredit ? `Lacking ₱${remainingNeeded.toFixed(2)}` : isEven ? 'Scenario A: Equal-Value Swap' : 'Scenario B: Upgrade Swap'}
                                </span>
                            )}
                        </div>

                        {!returnedProduct ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                Please select and verify a returned item in <strong>Step 1 &amp; 2</strong> above to proceed.
                            </div>
                        ) : replacementCart.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                Select replacement parts in <strong>Step 3</strong> above to proceed with the swap transaction.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                {/* Comparison Card: Old Item vs New Items */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                    gap: '14px',
                                    padding: '16px',
                                    borderRadius: '10px',
                                    background: 'var(--surface-hover)',
                                    border: '1px solid var(--border)'
                                }}>
                                    {/* Left: Returning Item */}
                                    <div style={{ borderRight: '1px solid var(--border)', paddingRight: '14px' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--danger)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                            Returned Part (Trade-In Credit)
                                        </div>
                                        <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                            {returnedProduct?.name}
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            SKU: {returnedProduct?.part_number || 'N/A'} • Brand: {returnedProduct?.brand || 'Generic'}
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--danger)', marginTop: '6px' }}>
                                            Credit: {formatCurrency(oldPricePaid)}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--primary)', marginTop: '4px', fontWeight: 700 }}>
                                            +1 to Sellable Stock (Verified)
                                        </div>
                                    </div>

                                    {/* Right: New Replacement Items */}
                                    <div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                            New Replacement Items ({replacementCart.length} {replacementCart.length === 1 ? 'part' : 'parts'})
                                        </div>
                                        <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                            {replacementCart.length === 1
                                                ? (replacementCart[0]?.name || replacementCart[0]?.product_name || 'Part')
                                                : `${replacementCart[0]?.name || replacementCart[0]?.product_name || 'Part'} (+${replacementCart.length - 1} more)`}
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {replacementCart.map(r => `${r.name || r.product_name || 'Part'} x${r.qty}`).join(', ')}
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)', marginTop: '6px' }}>
                                            Total: {formatCurrency(newReplacementPrice)}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '4px', fontWeight: 700 }}>
                                            -Deduct replacement units from Sellable Stock
                                        </div>
                                    </div>
                                </div>

                                {/* Math Breakdown Banner */}
                                {isUnderCredit ? (
                                    <div style={{
                                        padding: '14px 18px',
                                        borderRadius: '10px',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1.5px solid rgba(239, 68, 68, 0.4)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <AlertTriangle size={16} />
                                                Strict Zero Cash Refund Policy: Lacking ₱{remainingNeeded.toFixed(2)}
                                            </div>
                                            <div style={{ fontSize: '1.3rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--danger)' }}>
                                                -₱{remainingNeeded.toFixed(2)}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                            The customer's returned credit is {formatCurrency(oldPricePaid)}, but the replacement cart only totals {formatCurrency(newReplacementPrice)}. Under store policy, cash cannot be refunded. Please add ₱{remainingNeeded.toFixed(2)} more in items in Step 3 to reach or exceed the credit before checkout.
                                        </div>
                                    </div>
                                ) : isEven ? (
                                    <div style={{
                                        padding: '14px 18px',
                                        borderRadius: '10px',
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        border: '1.5px solid rgba(16, 185, 129, 0.4)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: '10px'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--primary)' }}>
                                                Scenario A: Equal-Value Swap (₱0.00)
                                            </div>
                                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                No money exchanged. Shift drawer unchanged. Product cost (puhunan) difference recorded in ledger.
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.5rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)' }}>
                                            ₱0.00
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{
                                        padding: '16px 18px',
                                        borderRadius: '10px',
                                        background: 'rgba(59, 130, 246, 0.08)',
                                        border: '1.5px solid rgba(59, 130, 246, 0.35)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '14px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                            <div>
                                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#3b82f6' }}>
                                                    Scenario B: Upgrade Swap (Customer Top-Up Required)
                                                </div>
                                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    Difference ({formatCurrency(newReplacementPrice)} − {formatCurrency(oldPricePaid)}) added to active shift drawer.
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                                                    Top-Up Difference Due
                                                </div>
                                                <div style={{ fontSize: '1.6rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)' }}>
                                                    +{formatCurrency(topUpDue)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Payment Method Selector & Cash Tender */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
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
                                                        <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                                                            Amount Tendered (₱)
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={amountTendered}
                                                            onChange={(e) => setAmountTendered(e.target.value)}
                                                            className="input-premium"
                                                            style={{ width: '100%', height: '36px', fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
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

                                {/* Customer, Reason & Notes */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
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
                                            Reason for Swap
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
                                            Cashier Notes
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Optional notes or references..."
                                            value={swapNotes}
                                            onChange={(e) => setSwapNotes(e.target.value)}
                                            className="input-premium"
                                            style={{ width: '100%', height: '36px', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                </div>

                                {/* Confirmation Buttons */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReplacementCart([]);
                                            setAmountTendered('');
                                        }}
                                        className="btn-secondary"
                                        style={{ height: '40px', padding: '0 20px', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        Reset Step 4
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleProcessSwap}
                                        disabled={processingSwap || replacementCart.length === 0 || isUnderCredit}
                                        className="btn-primary"
                                        style={{
                                            height: '40px',
                                            padding: '0 24px',
                                            fontSize: '0.86rem',
                                            fontWeight: 800,
                                            cursor: processingSwap || replacementCart.length === 0 || isUnderCredit ? 'not-allowed' : 'pointer',
                                            opacity: processingSwap || replacementCart.length === 0 || isUnderCredit ? 0.5 : 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            background: isUnderCredit ? '#71717a' : undefined
                                        }}
                                    >
                                        <Check size={16} />
                                        <span>
                                            {processingSwap
                                                ? 'Processing Swap...'
                                                : isUnderCredit
                                                    ? `Add ₱${remainingNeeded.toFixed(2)} More to Reach Swap Value`
                                                    : isUpgrade
                                                        ? `Confirm Upgrade Swap & Collect +${formatCurrency(topUpDue)}`
                                                        : `Confirm Even Swap (₱0.00)`}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* TAB 2: SWAP AUDIT LEDGER TABLE                            */}
            {/* ========================================================= */}
            {activeTab === 'swap_history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', minWidth: 0 }}>
                    {/* Summary KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', width: '100%' }}>
                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Total Swaps Processed
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '4px' }}>
                                {swapSummary.total_swaps || 0}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Verified exchanges logged
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>
                                Total Upgrade Top-Ups
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--primary)', marginTop: '4px' }}>
                                {formatCurrency(swapSummary.total_top_ups_collected || 0)}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Extra revenue added to shifts
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>
                                Items Returned to Stock
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3b82f6', marginTop: '4px' }}>
                                {swapSummary.items_restocked || 0}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Verified unused parts
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>
                                Net Puhunan Adjustment
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f59e0b', marginTop: '4px' }}>
                                {formatCurrency(swapSummary.total_cogs_adjustment || 0)}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Supplier cost difference logged
                            </div>
                        </div>
                    </div>

                    {/* Search & History Table */}
                    <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Search by swap code, receipt #, customer, or part name..."
                                    value={historySearch}
                                    onChange={(e) => setHistorySearch(e.target.value)}
                                    className="input-premium"
                                    style={{ width: '100%', height: '36px', paddingLeft: '32px', fontSize: '0.82rem' }}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={fetchSwapHistory}
                                className="btn-secondary"
                                style={{ height: '36px', padding: '0 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <RefreshCw size={14} className={loadingSwaps ? 'animate-spin' : ''} />
                                <span>Refresh Ledger</span>
                            </button>
                        </div>

                        <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr>
                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Date & Swap Code</th>
                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Receipt / Customer</th>
                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Returned Item</th>
                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Replacement Part</th>
                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Top-Up Paid</th>
                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Slip</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingSwaps ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto', color: 'var(--primary)' }} />
                                                <div>Loading swap ledger...</div>
                                            </td>
                                        </tr>
                                    ) : swaps.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No item swaps recorded yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        swaps.map(s => (
                                            <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                        {s.swap_code}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        {formatAuditDate(s.created_at)}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                                        {s.customer_name}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                        #{s.order_number || 'Walk-in'}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--danger)' }}>
                                                        {s.returned_product_name}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        {formatCurrency(s.returned_unit_price)} • Verified
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                                        {s.new_product_name}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        {formatCurrency(s.new_unit_price)}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800 }}>
                                                    {Number(s.customer_top_up_paid) > 0 ? (
                                                        <span style={{ color: 'var(--primary)' }}>
                                                            +{formatCurrency(s.customer_top_up_paid)} ({s.payment_method})
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)' }}>
                                                            ₱0.00 (Even)
                                                        </span>
                                                    )}
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
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}



            {/* ========================================================= */}
            {/* THERMAL PRINTABLE ITEM SWAP SLIP MODAL                   */}
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
                                        Returned Part (Trade-In Credit):
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-main)' }}>
                                        <span>{completedSwap.returned_product_name}</span>
                                        <span style={{ fontFamily: 'monospace', color: 'var(--danger)', fontWeight: 800 }}>
                                            -{formatCurrency(completedSwap.returned_credit_total || completedSwap.returned_unit_price)}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>
                                        ✓ Inspected & Restocked to Sellable Inventory
                                    </div>
                                </div>

                                {/* Replacement Item(s) */}
                                <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                                    <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        Replacement Parts Issued ({Array.isArray(completedSwap.replacement_items) ? completedSwap.replacement_items.length : 1}):
                                    </div>
                                    {Array.isArray(completedSwap.replacement_items) && completedSwap.replacement_items.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {completedSwap.replacement_items.map((rep, rIdx) => (
                                                <div key={rIdx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)', fontSize: '0.76rem' }}>
                                                    <span>{rep.name || rep.product_name || 'Part'} <strong style={{ color: 'var(--text-muted)' }}>x{rep.qty}</strong></span>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                        +{formatCurrency(rep.total_price || rep.unit_price * rep.qty)}
                                                    </span>
                                                </div>
                                            ))}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--primary)', fontWeight: 800, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '4px', marginTop: '2px' }}>
                                                <span>Total Replacement:</span>
                                                <span style={{ fontFamily: 'monospace' }}>+{formatCurrency(completedSwap.new_total_price)}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)', fontSize: '0.78rem', fontWeight: 600 }}>
                                            <span>{completedSwap.new_product_name}</span>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                                                +{formatCurrency(completedSwap.new_total_price || completedSwap.new_unit_price)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Payment / Top-Up Breakdown */}
                            <div style={{
                                borderTop: '1px dashed var(--border)',
                                paddingTop: '10px',
                                fontSize: '0.82rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Swap Type:</span>
                                    <strong style={{ color: Number(completedSwap.customer_top_up_paid) > 0 ? '#3b82f6' : 'var(--primary)' }}>
                                        {Number(completedSwap.customer_top_up_paid) > 0 ? 'UPGRADE SWAP (+TOP-UP)' : 'EQUAL-VALUE SWAP (₱0.00)'}
                                    </strong>
                                </div>

                                {Number(completedSwap.customer_top_up_paid) > 0 && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: 'var(--primary)' }}>
                                            <span>Top-Up Paid ({completedSwap.payment_method}):</span>
                                            <span style={{ fontFamily: 'monospace' }}>+{formatCurrency(completedSwap.customer_top_up_paid)}</span>
                                        </div>
                                        {completedSwap.payment_method === 'Cash' && Number(completedSwap.amount_tendered) > 0 && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                                                    <span>Amount Tendered:</span>
                                                    <span style={{ fontFamily: 'monospace' }}>{formatCurrency(completedSwap.amount_tendered)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                                                    <span>Change Returned:</span>
                                                    <span style={{ fontFamily: 'monospace' }}>{formatCurrency(completedSwap.change_amount || 0)}</span>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.7rem', color: 'var(--text-muted)', borderTop: '1px dashed var(--border)', paddingTop: '10px' }}>
                                Thank you for choosing JLIN MOTO PARTS!
                                <br />
                                <em>Strict Zero Cash Refund Policy • Parts Exchange Receipt</em>
                            </div>
                        </div>

                        {/* Modal Action Buttons */}
                        <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                            <button
                                type="button"
                                onClick={() => setShowSlipModal(false)}
                                className="btn-secondary"
                                style={{ height: '36px', padding: '0 16px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="btn-primary"
                                style={{ height: '36px', padding: '0 18px', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Printer size={15} />
                                <span>Print Thermal Slip</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ItemSwap;
