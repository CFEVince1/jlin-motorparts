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

    // Recent receipts modal
    const [showRecentModal, setShowRecentModal] = useState(false);
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
    // 3. STEP 3: REPLACEMENT PART SELECTOR & PRICE LOCK
    // ==========================================
    const [selectedReplacement, setSelectedReplacement] = useState(null);
    const [newSearchQuery, setNewSearchQuery] = useState('');
    const [catalogProducts, setCatalogProducts] = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(false);

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
    const newReplacementPrice = selectedReplacement ? Number(selectedReplacement.selling_price || selectedReplacement.price || 0) : 0;
    const priceDifference = Math.round((newReplacementPrice - oldPricePaid) * 100) / 100;
    const isUpgrade = priceDifference > 0;
    const isEven = priceDifference === 0;
    const isDowngrade = selectedReplacement && priceDifference < 0;

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
                setSelectedReplacement(null);
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
        setLookupQuery(sale.order_number || '');
        setCustomerName(sale.customer_name || 'Walk-in Customer');
        setSelectedSaleItem(null);
        setReturnedProduct(null);
        setReturnedUnitPrice(0);
        setCounterConditionVerified(false);
        setSelectedReplacement(null);
        setShowRecentModal(false);
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
        setSelectedReplacement(null);
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
        setSelectedReplacement(null);
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
                    limit: 30
                }
            });
            const prods = res.data.products || res.data || [];
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

    // Handle replacement selection with PRICE LOCK validation
    const handleSelectReplacement = (prod) => {
        const prodPrice = Number(prod.selling_price || prod.price || 0);
        const oldPrice = Number(returnedUnitPrice) || 0;

        if (Number(prod.stock || 0) <= 0) {
            return toast.error(`"${prod.name}" is OUT OF STOCK.`);
        }

        if (prodPrice < oldPrice) {
            return toast.error(`Lower Price Blocked: Replacement item price (₱${prodPrice.toFixed(2)}) is lower than what the customer paid (₱${oldPrice.toFixed(2)}). Under our Zero Cash Refund Policy, cash cannot be returned.`);
        }

        setSelectedReplacement(prod);
        if (prodPrice > oldPrice) {
            const diff = prodPrice - oldPrice;
            setAmountTendered(String(diff));
            toast.success(`Selected Upgrade: ${prod.name} (+₱${diff.toFixed(2)} Top-Up Due)`);
        } else {
            setAmountTendered('0');
            toast.success(`Selected Even Swap: ${prod.name} (₱0.00 Difference)`);
        }
    };

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
        if (!selectedReplacement) {
            return toast.error('Please select a valid replacement part in Step 3');
        }

        const prodPrice = Number(selectedReplacement.selling_price || selectedReplacement.price || 0);
        if (prodPrice < oldPricePaid) {
            return toast.error('Lower Price Blocked: Replacement item price cannot be lower than the original price paid.');
        }

        if (isUpgrade && paymentMethod === 'Cash') {
            const tendered = Number(amountTendered) || 0;
            if (tendered < topUpDue) {
                return toast.error(`Customer must add ₱${topUpDue.toFixed(2)}. Tendered amount (₱${tendered.toFixed(2)}) is insufficient.`);
            }
        }

        let confirmMsg = '';
        if (isUpgrade) {
            confirmMsg = `Confirm Upgrade Swap:\n\nReturned Item: ${returnedProduct.name} (Credit: ₱${oldPricePaid.toFixed(2)})\nNew Replacement: ${selectedReplacement.name} (Price: ₱${prodPrice.toFixed(2)})\n\nCustomer must PAY +₱${topUpDue.toFixed(2)} (${paymentMethod}).\n\nStock Impact:\n+1 ${returnedProduct.name} to Sellable Stock\n-1 ${selectedReplacement.name} from Sellable Stock\n\nProceed?`;
        } else {
            confirmMsg = `Confirm Equal-Value Swap:\n\nReturned Item: ${returnedProduct.name} (₱${oldPricePaid.toFixed(2)})\nNew Replacement: ${selectedReplacement.name} (₱${prodPrice.toFixed(2)})\n\nNo money exchanged (₱0.00).\n\nStock Impact:\n+1 ${returnedProduct.name} to Sellable Stock\n-1 ${selectedReplacement.name} from Sellable Stock\n\nProceed?`;
        }

        if (!window.confirm(confirmMsg)) return;

        setProcessingSwap(true);
        try {
            const payload = {
                sale_id: foundSale?.id || null,
                sale_item_id: selectedSaleItem?.sale_item_id || selectedSaleItem?.id || null,
                order_number: foundSale?.order_number || null,
                customer_name: customerName.trim() || 'Walk-in Customer',
                returned_product_id: returnedProduct.id,
                returned_qty: 1,
                returned_unit_price: oldPricePaid,
                counter_condition_verified: true,
                new_product_id: selectedReplacement.id,
                new_qty: 1,
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
                setSelectedReplacement(null);
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
                                onClick={handleOpenRecentModal}
                                className="btn-secondary"
                                style={{ height: '38px', padding: '0 14px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Clock size={14} color="var(--primary)" />
                                <span>Recent Receipts</span>
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
                                            setCounterConditionVerified(false);
                                            setSelectedReplacement(null);
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
                                            {returnedProduct.name}
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            SKU: {returnedProduct.part_number || 'N/A'} • Brand: {returnedProduct.brand || 'Generic'} • Quantity: 1 unit
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
                                            if (!e.target.checked) setSelectedReplacement(null);
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
                    {/* STEP 3: REPLACEMENT PART SELECTOR & STRICT PRICE LOCK     */}
                    {/* ========================================================= */}
                    <div className="glass-panel" style={{
                        padding: '20px',
                        borderRadius: '14px',
                        border: selectedReplacement ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)',
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
                                    Step 3: Replacement Part Selector & Price Lock
                                </h3>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Strict Price Lock: Parts priced below ₱{oldPricePaid.toFixed(2)} are blocked (Zero-Cash Policy)
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
                                        placeholder={`Search replacement parts in Sellable Stock (minimum retail price: ₱${oldPricePaid.toFixed(2)})...`}
                                        value={newSearchQuery}
                                        onChange={(e) => setNewSearchQuery(e.target.value)}
                                        className="input-premium"
                                        style={{ width: '100%', height: '38px', paddingLeft: '34px', fontSize: '0.85rem' }}
                                    />
                                </div>

                                {/* Catalog Table with Price Lock Tags */}
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
                                    <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', maxHeight: '320px', overflowY: 'auto' }}>
                                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                                                <tr>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'left' }}>Replacement Part</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'left' }}>Brand & SKU</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Stock</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'right' }}>Retail Price</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Price Rule / Lock</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '8px 12px', textAlign: 'center' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {catalogProducts.map(prod => {
                                                    const prodPrice = Number(prod.selling_price || prod.price || 0);
                                                    const inStock = Number(prod.stock || 0) > 0;
                                                    const isSelected = selectedReplacement?.id === prod.id;
                                                    const isLower = prodPrice < oldPricePaid;
                                                    const isExact = prodPrice === oldPricePaid;
                                                    const diff = prodPrice - oldPricePaid;

                                                    return (
                                                        <tr key={prod.id} style={{
                                                            borderBottom: '1px solid var(--border)',
                                                            background: isSelected ? 'rgba(16, 185, 129, 0.12)' : isLower ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                                                            opacity: isLower || !inStock ? 0.6 : 1
                                                        }}>
                                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                                {prod.name}
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
                                                                ) : isLower ? (
                                                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', fontWeight: 800 }}>
                                                                        ⛔ Lower Price Blocked
                                                                    </span>
                                                                ) : isExact ? (
                                                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)', fontWeight: 800 }}>
                                                                        🟢 Equal Value (₱0.00)
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 800 }}>
                                                                        ⬆ Upgrade (+₱{diff.toFixed(2)})
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                {!inStock || isLower ? (
                                                                    <button
                                                                        type="button"
                                                                        disabled
                                                                        className="btn-secondary"
                                                                        style={{ height: '26px', padding: '0 8px', fontSize: '0.72rem', cursor: 'not-allowed', opacity: 0.4 }}
                                                                        title={isLower ? `Blocked: Price is ₱${prodPrice} (< ₱${oldPricePaid})` : 'Out of stock'}
                                                                    >
                                                                        Blocked
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSelectReplacement(prod)}
                                                                        className={isSelected ? 'btn-secondary' : 'btn-primary'}
                                                                        style={{ height: '26px', padding: '0 10px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                                                    >
                                                                        {isSelected ? '✓ Selected' : isExact ? 'Select Even' : 'Select Upgrade'}
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
                            </div>
                        )}
                    </div>

                    {/* ========================================================= */}
                    {/* STEP 4: ZERO-CASH OR TOP-UP CHECKOUT                      */}
                    {/* ========================================================= */}
                    <div className="glass-panel" style={{
                        padding: '22px',
                        borderRadius: '14px',
                        border: selectedReplacement ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                        opacity: selectedReplacement ? 1 : 0.5
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    background: selectedReplacement ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 100, 100, 0.15)',
                                    color: selectedReplacement ? 'var(--primary)' : 'var(--text-muted)',
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
                            {selectedReplacement && (
                                <span style={{
                                    fontSize: '0.74rem',
                                    padding: '3px 10px',
                                    borderRadius: '6px',
                                    background: isEven ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                    color: isEven ? 'var(--primary)' : '#3b82f6',
                                    fontWeight: 800
                                }}>
                                    {isEven ? 'Scenario A: Equal-Value Swap' : 'Scenario B: Upgrade Swap'}
                                </span>
                            )}
                        </div>

                        {!selectedReplacement ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                Select a replacement part in <strong>Step 3</strong> above to proceed with the swap transaction.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                {/* Comparison Card: Old Item vs New Item */}
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
                                            {returnedProduct.name}
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            SKU: {returnedProduct.part_number || 'N/A'} • Brand: {returnedProduct.brand || 'Generic'}
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--danger)', marginTop: '6px' }}>
                                            Credit: {formatCurrency(oldPricePaid)}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--primary)', marginTop: '4px', fontWeight: 700 }}>
                                            +1 to Sellable Stock (Verified)
                                        </div>
                                    </div>

                                    {/* Right: New Replacement Item */}
                                    <div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                            New Replacement Part
                                        </div>
                                        <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                            {selectedReplacement.name}
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            SKU: {selectedReplacement.part_number || 'N/A'} • Brand: {selectedReplacement.brand || 'Generic'}
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)', marginTop: '6px' }}>
                                            Retail: {formatCurrency(newReplacementPrice)}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '4px', fontWeight: 700 }}>
                                            -1 from Sellable Stock
                                        </div>
                                    </div>
                                </div>

                                {/* Math Breakdown Banner */}
                                {isEven ? (
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
                                            setSelectedReplacement(null);
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
                                        disabled={processingSwap || !selectedReplacement}
                                        className="btn-primary"
                                        style={{
                                            height: '40px',
                                            padding: '0 24px',
                                            fontSize: '0.86rem',
                                            fontWeight: 800,
                                            cursor: processingSwap || !selectedReplacement ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <Check size={16} />
                                        <span>
                                            {processingSwap
                                                ? 'Processing Swap...'
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
            {/* RECENT SALES MODAL (FOR EASY RECEIPT PICKING)             */}
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
                                                {formatAuditDate(sale.created_at)} • {sale.items?.length || 0} line item(s) • Total: {formatCurrency(sale.total_amount)}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                Items: {sale.items?.map(it => `${it.product_name} (cap: ${it.swappable_cap})`).join(', ')}
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

                                {/* Replacement Item */}
                                <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                                    <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        Replacement Part Issued:
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)', fontSize: '0.78rem', fontWeight: 600 }}>
                                        <span>{completedSwap.new_product_name}</span>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                                            +{formatCurrency(completedSwap.new_total_price || completedSwap.new_unit_price)}
                                        </span>
                                    </div>
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
