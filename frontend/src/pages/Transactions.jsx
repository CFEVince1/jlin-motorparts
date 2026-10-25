import { useState, useEffect, useCallback, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import { History, Receipt, X, Printer, Search, Calendar, RotateCcw, ArrowDownRight, ArrowUpRight, Filter, Ban } from 'lucide-react';
import { notifyInventoryChange } from '../utils/syncEvents';
import Spinner from '../components/Spinner';
import { getProductSnapshotMatch, normalizeSearchText } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import ReceiptPrint from '../components/ReceiptPrint';
import PrintTransactionsReportModal from '../components/PrintTransactionsReportModal';
import PrintReturnsReportModal from '../components/PrintReturnsReportModal';
import ReturnRefundModal from '../components/ReturnRefundModal';

const Transactions = () => {
    const { user } = useContext(AuthContext);
    const isStaff = user?.role === 'staff';

    // Tabs: 'sales' (Sales Transactions) | 'returns' (Returns & Refunds History)
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') === 'returns' ? 'returns' : 'sales');

    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Returns History state
    const [returnsList, setReturnsList] = useState([]);
    const [loadingReturns, setLoadingReturns] = useState(false);
    const [returnsPagination, setReturnsPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1
    });

    // Void Modal State
    const [voidTarget, setVoidTarget] = useState(null);
    const [voidReason, setVoidReason] = useState('');
    const [voiding, setVoiding] = useState(false);

    // Receipt Modal State
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [receiptDetails, setReceiptDetails] = useState(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);
    const [receiptWidth, setReceiptWidth] = useState('80mm');

    // Return & Refund Modal State
    const [refundTarget, setRefundTarget] = useState(null);

    // Reporting State
    const [timeframe, setTimeframe] = useState(() => {
        const tf = searchParams.get('timeframe');
        if (tf && ['Daily', 'Weekly', 'Monthly', 'Yearly', 'All'].includes(tf)) return tf;
        return 'Daily';
    });
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [showReturnsPrintModal, setShowReturnsPrintModal] = useState(false);

    // User / Cashier Filter State
    const [userFilter, setUserFilter] = useState(() => {
        const u = searchParams.get('user') || searchParams.get('cashier');
        return (u && u !== 'ALL') ? u : 'ALL';
    });
    const [usersList, setUsersList] = useState([]);

    useEffect(() => {
        const qUser = searchParams.get('user') || searchParams.get('cashier');
        if (qUser && qUser !== 'ALL') {
            if (qUser !== userFilter) {
                setUserFilter(qUser);
            }
        } else if (qUser === 'ALL' || (!qUser && searchParams.has('user'))) {
            if (userFilter !== 'ALL') {
                setUserFilter('ALL');
            }
        }
    }, [searchParams]);

    // Status Filter State
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [staffScope, setStaffScope] = useState('all');

    const {
        searchQuery,
        handleSearchChange,
        debouncedSearchQuery,
        filters,
        setFilter
    } = useTableFilter({
        initialSearch: searchParams.get('search') || '',
        initialFilters: { date: searchParams.get('date') || '', sortBy: 'newest' }
    });

    const filterDate = filters.date;
    const sortBy = filters.sortBy;

    // Page size state with localStorage persistence (Default: 10)
    const [pageSize, setPageSize] = useState(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('transactions_page_size') : null;
        return saved ? Number(saved) : 10;
    });

    const [returnsPageSize, setReturnsPageSize] = useState(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('returns_page_size') : null;
        return saved ? Number(saved) : 10;
    });

    const handlePageSizeChange = useCallback((newSize) => {
        const size = Number(newSize);
        setPageSize(size);
        if (typeof window !== 'undefined') {
            localStorage.setItem('transactions_page_size', String(size));
        }
    }, []);

    const handleReturnsPageSizeChange = useCallback((newSize) => {
        const size = Number(newSize);
        setReturnsPageSize(size);
        if (typeof window !== 'undefined') {
            localStorage.setItem('returns_page_size', String(size));
        }
    }, []);

    const [pagination, setPagination] = useState({
        page: 1,
        limit: pageSize,
        total: 0,
        totalPages: 1
    });

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await api.get('/users');
                if (Array.isArray(res.data)) {
                    setUsersList(res.data);
                }
            } catch (err) {
                // Ignore if unauthorized or failed
            }
        };
        if (!isStaff) {
            fetchUsers();
        }
    }, [isStaff]);

    const fetchTransactions = useCallback(async (page = 1, limit = pageSize) => {
        setLoading(true);
        try {
            const res = await api.get('/sales', {
                params: {
                    page,
                    limit,
                    search: debouncedSearchQuery?.trim() || undefined,
                    date: filterDate || undefined,
                    sortBy,
                    status: statusFilter !== 'ALL' ? statusFilter : undefined,
                    selfOnly: (isStaff && staffScope === 'mine') ? 'true' : undefined,
                    user: userFilter !== 'ALL' ? userFilter : undefined
                }
            });
            const rawData = res.data;
            const salesList = Array.isArray(rawData) ? rawData : (rawData?.data || []);
            setTransactions(salesList);
            if (rawData?.pagination) {
                setPagination(rawData.pagination);
            }
        } catch {
            toast.error('Failed to load transactions');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearchQuery, filterDate, sortBy, statusFilter, isStaff, staffScope, userFilter, pageSize]);

    const fetchReturnsHistory = useCallback(async (page = 1, limit = returnsPageSize) => {
        setLoadingReturns(true);
        try {
            const res = await api.get('/sales/returns/history', {
                params: {
                    page,
                    limit,
                    search: debouncedSearchQuery?.trim() || undefined,
                    date: filterDate || undefined,
                    user: userFilter !== 'ALL' ? userFilter : undefined
                }
            });
            const rawData = res.data;
            const list = Array.isArray(rawData) ? rawData : (rawData?.data || []);
            setReturnsList(list);
            if (rawData?.pagination) {
                setReturnsPagination(rawData.pagination);
            }
        } catch {
            toast.error('Failed to load returns history');
        } finally {
            setLoadingReturns(false);
        }
    }, [debouncedSearchQuery, filterDate, userFilter, returnsPageSize]);

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
            fetchTransactions(newPage, pageSize);
            const tableElem = document.querySelector('.table-container');
            if (tableElem) {
                tableElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    const handleReturnsPageChange = (newPage) => {
        if (newPage >= 1 && newPage <= returnsPagination.totalPages && newPage !== returnsPagination.page) {
            fetchReturnsHistory(newPage, returnsPageSize);
            const tableElem = document.querySelector('.table-container');
            if (tableElem) {
                tableElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    const getPageNumbers = (current, total) => {
        if (total <= 1) return [1];
        if (total <= 7) {
            return Array.from({ length: total }, (_, i) => i + 1);
        }
        if (current <= 4) {
            return [1, 2, 3, 4, 5, '...', total];
        }
        if (current >= total - 3) {
            return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
        }
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    useEffect(() => {
        if (activeTab === 'sales') {
            fetchTransactions(1, pageSize);
        }
    }, [activeTab, debouncedSearchQuery, filterDate, sortBy, statusFilter, staffScope, userFilter, pageSize]);

    useEffect(() => {
        if (activeTab === 'returns') {
            fetchReturnsHistory(1, returnsPageSize);
        }
    }, [activeTab, debouncedSearchQuery, filterDate, userFilter, returnsPageSize]);

    const handleOpenVoid = (transaction) => {
        setVoidTarget(transaction);
        setVoidReason('Cashier Mistake / Error');
    };

    const handleConfirmVoid = async () => {
        if (!voidTarget) return;
        setVoiding(true);
        try {
            const res = await api.post(`/sales/${voidTarget.id}/void`, {
                reason: voidReason.trim() || 'Transaction voided by cashier/admin'
            });
            toast.success(res.data?.message || `Order ${voidTarget.order_number || ('SO-' + voidTarget.id)} voided successfully`);
            notifyInventoryChange('void');

            // Update receiptDetails if currently viewing this receipt
            if (receiptDetails && (receiptDetails.id === voidTarget.id || receiptDetails.sale_id === voidTarget.id)) {
                setReceiptDetails(prev => ({
                    ...prev,
                    status: 'VOIDED',
                    void_reason: voidReason.trim() || 'Transaction voided'
                }));
            }

            // Refresh transactions list
            fetchTransactions(pagination.page);
            setVoidTarget(null);
        } catch (err) {
            toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to void transaction');
        } finally {
            setVoiding(false);
        }
    };

    const handleViewReceipt = async (saleId) => {
        setLoadingReceipt(true);
        try {
            const res = await api.get(`/sales/${saleId}`);
            setReceiptDetails(res.data);
            setSelectedTransaction(saleId);
        } catch {
            toast.error('Failed to load receipt details');
        } finally {
            setLoadingReceipt(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const closeReceipt = () => {
        setSelectedTransaction(null);
        setReceiptDetails(null);
    };

    const renderDispositionPill = (disp) => {
        switch (disp) {
            case 'FOUND':
                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: 'rgba(22, 163, 74, 0.1)',
                        color: '#16a34a',
                        border: '1px solid rgba(22, 163, 74, 0.25)'
                    }}>
                        <ArrowUpRight size={12} /> + Found (+ Inventory)
                    </span>
                );
            case 'DAMAGE':
                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: 'rgba(220, 38, 38, 0.1)',
                        color: '#dc2626',
                        border: '1px solid rgba(220, 38, 38, 0.25)'
                    }}>
                        <ArrowDownRight size={12} /> - Damage (Return to Supplier - Damage: - Inventory)
                    </span>
                );
            case 'RETURN_TO_SUPPLIER':
                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: 'rgba(217, 119, 6, 0.1)',
                        color: '#d97706',
                        border: '1px solid rgba(217, 119, 6, 0.25)'
                    }}>
                        <ArrowDownRight size={12} /> - Return to Supplier (- Inventory)
                    </span>
                );
            case 'LOSS':
                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: 'rgba(147, 51, 234, 0.1)',
                        color: '#9333ea',
                        border: '1px solid rgba(147, 51, 234, 0.25)'
                    }}>
                        <ArrowDownRight size={12} /> - Loss (Negative into Inventory)
                    </span>
                );
            default:
                return <span style={{ fontSize: '0.72rem' }}>{disp}</span>;
        }
    };

    const renderStatusBadge = (t) => {
        if (t.status === 'VOIDED') {
            return (
                <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                }}>
                    Voided
                </span>
            );
        }

        const disps = (t.return_dispositions || '').toUpperCase();
        const isDamaged = disps.includes('DAMAGE');
        const isGood = disps.includes('FOUND') || disps.includes('RESTOCK') || disps.includes('GOOD');

        if (t.status === 'REFUNDED') {
            if (isDamaged) {
                return (
                    <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#d97706',
                        border: '1px solid rgba(245, 158, 11, 0.3)'
                    }}>
                        Returned - Damaged
                    </span>
                );
            }
            if (isGood) {
                return (
                    <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        background: 'rgba(20, 184, 166, 0.15)',
                        color: '#0f766e',
                        border: '1px solid rgba(20, 184, 166, 0.3)'
                    }}>
                        Returned - Good
                    </span>
                );
            }
            return (
                <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    background: 'rgba(220, 38, 38, 0.12)',
                    color: '#dc2626',
                    border: '1px solid rgba(220, 38, 38, 0.3)'
                }}>
                    Refunded / Returned
                </span>
            );
        }

        if (t.status === 'PARTIALLY_REFUNDED') {
            return (
                <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    background: 'rgba(168, 85, 247, 0.15)',
                    color: '#7e22ce',
                    border: '1px solid rgba(168, 85, 247, 0.3)'
                }}>
                    {isDamaged ? 'Partially Returned (Damaged)' : 'Partially Returned'}
                </span>
            );
        }

        return (
            <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                background: 'rgba(22, 163, 74, 0.12)',
                color: '#16a34a',
                border: '1px solid rgba(22, 163, 74, 0.3)'
            }}>
                Sold</span>
        );
    };

    return (
        <div className={selectedTransaction ? 'receipt-modal-active' : ''} style={{ position: 'relative', height: '100%' }}>
            {/* Header */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                        <History size={32} color="var(--primary)" /> {isStaff ? 'Transaction' : 'Transaction History'}
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 44px' }}>
                        {isStaff
                            ? `Personal sales, checkouts, and customer returns for ${user?.username || 'your cashier account'}.`
                            : 'Complete audit log of all store sales transactions, returns & refunds, and cashier records.'}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <select className="input-premium" value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                        <option value="Daily">Daily Report</option>
                        <option value="Weekly">Weekly Report</option>
                        <option value="Monthly">Monthly Report</option>
                        <option value="Yearly">Yearly Report</option>
                        <option value="All">All Time Report</option>
                    </select>
                    <button
                        onClick={() => {
                            if (activeTab === 'returns') {
                                setShowReturnsPrintModal(true);
                            } else {
                                setShowPrintModal(true);
                            }
                        }}
                        className="btn-primary"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            height: '40px',
                            padding: '0 16px'
                        }}
                    >
                        <Printer size={16} /> Print {timeframe === 'All' ? 'All-Time' : timeframe} {activeTab === 'returns' ? 'Returns' : 'Sales'} Report
                    </button>
                </div>
            </div>

            {/* Segmented View Tabs */}
            <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '18px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('sales')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: activeTab === 'sales' ? 'var(--primary)' : 'var(--border)',
                        background: activeTab === 'sales' ? 'rgba(22, 163, 74, 0.1)' : 'var(--surface)',
                        color: activeTab === 'sales' ? 'var(--primary)' : 'var(--text-main)',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <Receipt size={16} /> Sales Transactions
                    <span style={{
                        background: activeTab === 'sales' ? 'var(--primary)' : 'var(--border)',
                        color: activeTab === 'sales' ? '#fff' : 'var(--text-muted)',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontSize: '0.72rem'
                    }}>
                        {pagination.total}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('returns')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: activeTab === 'returns' ? 'var(--primary)' : 'var(--border)',
                        background: activeTab === 'returns' ? 'rgba(22, 163, 74, 0.1)' : 'var(--surface)',
                        color: activeTab === 'returns' ? 'var(--primary)' : 'var(--text-main)',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <RotateCcw size={16} /> Returns & Refunds History
                    <span style={{
                        background: activeTab === 'returns' ? 'var(--primary)' : 'var(--border)',
                        color: activeTab === 'returns' ? '#fff' : 'var(--text-muted)',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontSize: '0.72rem'
                    }}>
                        {returnsPagination.total}
                    </span>
                </button>
            </div>

            {/* Filter Bar */}
            <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 260px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder={activeTab === 'sales' ? "Search order #, part number, product, cashier..." : "Search return #, order #, item, cashier, remarks..."}
                        className="input-premium"
                        style={{ paddingLeft: '36px', width: '100%' }}
                        value={searchQuery}
                        onChange={handleSearchChange}
                    />
                </div>
                <div style={{ position: 'relative', flex: '0 0 auto' }}>
                    <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="date" className="input-premium" style={{ paddingLeft: '36px', paddingRight: '12px' }} value={filterDate} onChange={(e) => setFilter('date', e.target.value)} />
                </div>


                <div style={{ flex: '0 0 auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {isStaff ? (
                        activeTab === 'sales' && (
                            <select
                                className="input-premium"
                                style={{ width: '160px' }}
                                value={staffScope}
                                onChange={(e) => setStaffScope(e.target.value)}
                            >
                                <option value="all">All Store Sales</option>
                                <option value="mine">My Sales Only</option>
                            </select>
                        )
                    ) : (
                        <select
                            className="input-premium"
                            style={{ width: '175px' }}
                            value={userFilter}
                            onChange={(e) => {
                                const val = e.target.value;
                                setUserFilter(val);
                                setSearchParams(prev => {
                                    const next = new URLSearchParams(prev);
                                    if (val === 'ALL') {
                                        next.delete('user');
                                        next.delete('cashier');
                                    } else {
                                        next.set('user', val);
                                    }
                                    return next;
                                });
                            }}
                            title="Filter by user / cashier"
                        >
                            <option value="ALL">All Users / Cashiers</option>
                            {usersList.length > 0 ? (
                                usersList.map((u) => (
                                    <option key={u.id} value={u.username}>
                                        {u.username} ({u.role})
                                    </option>
                                ))
                            ) : (
                                <>
                                    <option value="admin">admin (Admin)</option>
                                    <option value="staff">staff (Staff)</option>
                                </>
                            )}
                        </select>
                    )}

                    {activeTab === 'sales' && (
                        <select
                            className="input-premium"
                            style={{ width: '170px' }}
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="SOLD">Sold Only</option>
                            <option value="REFUNDED">Refunded / Returned</option>
                            <option value="VOIDED">Voided Only</option>
                        </select>
                    )}
                </div>


                {activeTab === 'sales' && (
                    <div style={{ flex: '0 0 auto' }}>
                        <select className="input-premium" style={{ width: '170px' }} value={sortBy} onChange={(e) => setFilter('sortBy', e.target.value)}>
                            <option value="newest">Sort: Newest First</option>
                            <option value="oldest">Sort: Oldest First</option>
                            <option value="highest">Sort: Highest Total</option>
                        </select>
                    </div>
                )}

                {filterDate && (
                    <button className="btn-secondary" onClick={() => setFilter('date', '')} style={{ flex: '0 0 auto' }}>Clear Date</button>
                )}
            </div>

            {/* TAB 1: SALES TRANSACTIONS */}
            {activeTab === 'sales' && (
                <div id="print-area" className="printable-report">
                    <div className={`glass-panel ${selectedTransaction ? 'no-print' : ''}`} style={{ padding: '24px' }}>
                        {loading ? <Spinner text="Loading transactions..." /> : (
                            <>
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Order No.</th>
                                            <th>Date & Time</th>
                                            <th>Cashier</th>
                                            <th>Part Number</th>
                                            <th>Products</th>
                                            <th>Payment Method</th>
                                            <th className="text-right">Total Amount</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.length === 0 ? (
                                            <tr>
                                                <td colSpan="9" className="table-empty-state">No transactions match your search.</td>
                                            </tr>
                                        ) : (
                                            transactions.map(t => (
                                                <tr key={t.id}>
                                                    <td style={{ fontWeight: 'bold', color: t.status === 'VOIDED' ? 'var(--text-muted)' : 'var(--primary)', fontFamily: 'monospace' }}>
                                                        <div>{t.order_number || `SO-${t.id}`}</div>
                                                    </td>
                                                    <td>{formatAuditDate(t.sale_date)}</td>
                                                    <td style={{ textTransform: 'capitalize' }}>{t.cashier}</td>
                                                    <td>
                                                        {t.part_numbers || t.part_number ? (
                                                            (t.part_numbers || t.part_number).split(',').map((pn, i) => {
                                                                const clean = pn.trim();
                                                                if (!clean) return null;
                                                                return (
                                                                    <span
                                                                        key={i}
                                                                        style={{
                                                                            display: 'inline-block',
                                                                            padding: '2px 6px',
                                                                            margin: '2px 4px 2px 0',
                                                                            borderRadius: '4px',
                                                                            background: 'var(--surface-hover)',
                                                                            border: '1px solid var(--border)',
                                                                            fontFamily: 'monospace',
                                                                            fontSize: '0.78rem',
                                                                            fontWeight: '600',
                                                                            color: 'var(--text-main)'
                                                                        }}
                                                                    >
                                                                        {clean}
                                                                    </span>
                                                                );
                                                            })
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div>{t.products_included || '-'}</div>
                                                        {t.compatibility_display && (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.compatibility_display}</div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {t.payment_method === 'Split' ? (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                background: 'rgba(168, 85, 247, 0.15)',
                                                                color: '#c084fc',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 600,
                                                                border: '1px solid rgba(168, 85, 247, 0.3)'
                                                            }}>
                                                                Split (Cash + GCash)
                                                            </span>
                                                        ) : (
                                                            t.payment_method || 'Cash'
                                                        )}
                                                    </td>
                                                    <td className="text-right" style={{
                                                        fontWeight: 'bold',
                                                        color: t.status === 'VOIDED' ? 'var(--text-muted)' : 'var(--primary)',
                                                        textDecoration: t.status === 'VOIDED' ? 'line-through' : 'none'
                                                    }}>
                                                        <div>{formatCurrency(t.total_amount)}</div>
                                                        {Number(t.refund_amount) > 0 && (
                                                            <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, textDecoration: 'none' }}>
                                                                Refund: -{formatCurrency(t.refund_amount)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>
                                                        {renderStatusBadge(t)}
                                                    </td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                            <button
                                                                onClick={() => handleViewReceipt(t.id)}
                                                                className="btn-secondary"
                                                                style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                                                                disabled={loadingReceipt}
                                                                title="View Receipt"
                                                            >
                                                                <Receipt size={14} /> View Receipt
                                                            </button>

                                                            {t.status !== 'VOIDED' && (
                                                                t.status === 'REFUNDED' ? (
                                                                    <button
                                                                        onClick={() => handleViewReceipt(t.id)}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#dc2626', borderColor: 'rgba(220, 38, 38, 0.3)' }}
                                                                        title="View Refund Details"
                                                                    >
                                                                        <RotateCcw size={14} /> Refund Details
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setRefundTarget(t)}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--primary)', borderColor: 'rgba(22, 163, 74, 0.35)' }}
                                                                        title="Return / Refund Items"
                                                                    >
                                                                        <RotateCcw size={14} /> Return / Refund
                                                                    </button>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Controls */}
                            <div className="no-print" style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginTop: '16px',
                                paddingTop: '14px',
                                borderTop: '1px solid var(--border)',
                                flexWrap: 'wrap',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                    <span>
                                        Showing <strong>{pagination.total > 0 ? ((pagination.page - 1) * pagination.limit) + 1 : 0}</strong> - <strong>{Math.min(pagination.page * pagination.limit, pagination.total)}</strong> of <strong>{pagination.total}</strong> transactions
                                    </span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => handlePageSizeChange(e.target.value)}
                                        className="input-premium"
                                        style={{ padding: '2px 8px', fontSize: '0.78rem', width: 'auto', cursor: 'pointer', height: '30px' }}
                                        title="Transactions per page"
                                    >
                                        <option value={10}>10 / page</option>
                                        <option value={20}>20 / page</option>
                                        <option value={50}>50 / page</option>
                                        <option value={100}>100 / page</option>
                                    </select>
                                </div>

                                {pagination.totalPages > 1 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <button
                                            type="button"
                                            disabled={pagination.page <= 1}
                                            onClick={() => handlePageChange(pagination.page - 1)}
                                            className="btn-secondary"
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '0.8rem',
                                                height: '32px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                opacity: pagination.page <= 1 ? 0.4 : 1,
                                                cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            Prev
                                        </button>

                                        {getPageNumbers(pagination.page, pagination.totalPages).map((pageNum, idx) => (
                                            pageNum === '...' ? (
                                                <span key={`dots-${idx}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>...</span>
                                            ) : (
                                                <button
                                                    key={`page-${pageNum}`}
                                                    type="button"
                                                    onClick={() => handlePageChange(pageNum)}
                                                    className={pagination.page === pageNum ? 'btn-primary' : 'btn-secondary'}
                                                    style={{
                                                        padding: '4px 10px',
                                                        fontSize: '0.8rem',
                                                        minWidth: '32px',
                                                        height: '32px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        textAlign: 'center',
                                                        fontWeight: pagination.page === pageNum ? 700 : 500,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {pageNum}
                                                </button>
                                            )
                                        ))}

                                        <button
                                            type="button"
                                            disabled={pagination.page >= pagination.totalPages}
                                            onClick={() => handlePageChange(pagination.page + 1)}
                                            className="btn-secondary"
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '0.8rem',
                                                height: '32px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                opacity: pagination.page >= pagination.totalPages ? 0.4 : 1,
                                                cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: RETURNS & REFUNDS HISTORY */}
            {activeTab === 'returns' && (
                <div className="glass-panel" style={{ padding: '24px' }}>
                    {loadingReturns ? <Spinner text="Loading returns & refund records..." /> : (
                        <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <RotateCcw size={18} color="var(--primary)" /> Processed Return & Refund Ledger
                                </h2>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                    Full historical audit log of customer product returns, inventory restocks/outflows, and monetary refunds.
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowReturnsPrintModal(true)}
                                    className="btn-secondary"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 14px',
                                        fontSize: '0.82rem',
                                        fontWeight: 600
                                    }}
                                >
                                    <Printer size={15} /> Print {timeframe === 'All' ? 'All-Time' : timeframe} Returns Report
                                </button>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                    {returnsPagination.total} Total Return Slip{returnsPagination.total !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>

                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Return Ref #</th>
                                        <th>Order No.</th>
                                        <th>Date & Time</th>
                                        <th>Cashier</th>
                                        <th>Returned Items</th>
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
                                                No customer returns or refunds recorded.
                                            </td>
                                        </tr>
                                    ) : (
                                        returnsList.map(ret => (
                                            <tr key={ret.id}>
                                                <td style={{ fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                    {ret.return_number}
                                                </td>
                                                <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                    {ret.order_number || `SO-${ret.sale_id}`}
                                                </td>
                                                <td>{formatAuditDate(ret.created_at)}</td>
                                                <td style={{ textTransform: 'capitalize' }}>{ret.cashier}</td>
                                                <td>
                                                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                                        {ret.products_returned || '-'}
                                                    </div>
                                                    {ret.part_numbers && (
                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            {ret.part_numbers}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                        {(ret.dispositions || '').split(',').map((disp, i) => {
                                                            const clean = disp.trim();
                                                            if (!clean) return null;
                                                            return (
                                                                <span key={i}>
                                                                    {renderDispositionPill(clean)}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                                <td>{ret.refund_payment_method || 'Cash'}</td>
                                                <td className="text-right" style={{ fontWeight: 'bold', color: '#dc2626' }}>
                                                    -{formatCurrency(ret.total_refund_amount)}
                                                </td>
                                                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '200px' }}>
                                                    {ret.reason || '-'}
                                                </td>
                                                <td>
                                                    <button
                                                        onClick={() => handleViewReceipt(ret.sale_id)}
                                                        className="btn-secondary"
                                                        style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                                                        disabled={loadingReceipt}
                                                    >
                                                        <Receipt size={14} /> View Receipt
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Returns Pagination Controls */}
                        <div className="no-print" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: '16px',
                            paddingTop: '14px',
                            borderTop: '1px solid var(--border)',
                            flexWrap: 'wrap',
                            gap: '10px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                <span>
                                    Showing <strong>{returnsPagination.total > 0 ? ((returnsPagination.page - 1) * returnsPagination.limit) + 1 : 0}</strong> - <strong>{Math.min(returnsPagination.page * returnsPagination.limit, returnsPagination.total)}</strong> of <strong>{returnsPagination.total}</strong> returns
                                </span>
                                <select
                                    value={returnsPageSize}
                                    onChange={(e) => handleReturnsPageSizeChange(e.target.value)}
                                    className="input-premium"
                                    style={{ padding: '2px 8px', fontSize: '0.78rem', width: 'auto', cursor: 'pointer', height: '30px' }}
                                    title="Returns per page"
                                >
                                    <option value={10}>10 / page</option>
                                    <option value={20}>20 / page</option>
                                    <option value={50}>50 / page</option>
                                    <option value={100}>100 / page</option>
                                </select>
                            </div>

                            {returnsPagination.totalPages > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <button
                                        type="button"
                                        disabled={returnsPagination.page <= 1}
                                        onClick={() => handleReturnsPageChange(returnsPagination.page - 1)}
                                        className="btn-secondary"
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '0.8rem',
                                            height: '32px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            opacity: returnsPagination.page <= 1 ? 0.4 : 1,
                                            cursor: returnsPagination.page <= 1 ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        Prev
                                    </button>

                                    {getPageNumbers(returnsPagination.page, returnsPagination.totalPages).map((pageNum, idx) => (
                                        pageNum === '...' ? (
                                            <span key={`dots-${idx}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>...</span>
                                        ) : (
                                            <button
                                                key={`page-${pageNum}`}
                                                type="button"
                                                onClick={() => handleReturnsPageChange(pageNum)}
                                                className={returnsPagination.page === pageNum ? 'btn-primary' : 'btn-secondary'}
                                                style={{
                                                    padding: '4px 10px',
                                                    fontSize: '0.8rem',
                                                    minWidth: '32px',
                                                    height: '32px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    textAlign: 'center',
                                                    fontWeight: returnsPagination.page === pageNum ? 700 : 500,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {pageNum}
                                            </button>
                                        )
                                    ))}

                                    <button
                                        type="button"
                                        disabled={returnsPagination.page >= returnsPagination.totalPages}
                                        onClick={() => handleReturnsPageChange(returnsPagination.page + 1)}
                                        className="btn-secondary"
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '0.8rem',
                                            height: '32px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            opacity: returnsPagination.page >= returnsPagination.totalPages ? 0.4 : 1,
                                            cursor: returnsPagination.page >= returnsPagination.totalPages ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                        </>
                    )}
                </div>
            )}

            {/* RETURN & REFUND MODAL */}
            <ReturnRefundModal
                isOpen={refundTarget !== null}
                onClose={() => setRefundTarget(null)}
                transaction={refundTarget}
                onSuccess={() => {
                    fetchTransactions(pagination.page);
                    fetchReturnsHistory(1);
                }}
            />

            {/* RECEIPT MODAL */}
            {selectedTransaction && receiptDetails && (
                <div className="receipt-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '40px', overflowY: 'auto' }}>
                    <div className="glass-panel" style={{ background: 'white', color: 'black', padding: '24px', width: '440px', borderRadius: '8px', position: 'relative', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                        <button className="no-print" onClick={closeReceipt} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <X size={24} />
                        </button>

                        {/* Format selector (Screen only) */}
                        <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', color: '#666', fontWeight: 600 }}>Paper:</span>
                            <button
                                type="button"
                                className={receiptWidth === '80mm' ? 'btn-primary' : 'btn-secondary'}
                                style={{ fontSize: '0.75rem', padding: '3px 10px', height: 'auto', borderRadius: '4px' }}
                                onClick={() => setReceiptWidth('80mm')}
                            >
                                Standard 80mm
                            </button>
                            <button
                                type="button"
                                className={receiptWidth === '58mm' ? 'btn-primary' : 'btn-secondary'}
                                style={{ fontSize: '0.75rem', padding: '3px 10px', height: 'auto', borderRadius: '4px' }}
                                onClick={() => setReceiptWidth('58mm')}
                            >
                                Compact 58mm
                            </button>
                        </div>

                        {receiptDetails.status === 'VOIDED' && (
                            <div className="no-print" style={{
                                background: 'rgba(239, 68, 68, 0.12)',
                                border: '1px solid rgba(239, 68, 68, 0.35)',
                                color: '#ef4444',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                                fontWeight: 'bold',
                                marginBottom: '14px',
                                textAlign: 'center',
                                width: '100%'
                            }}>
                                ⚠️ THIS TRANSACTION HAS BEEN VOIDED / REOPENED
                            </div>
                        )}

                        {(receiptDetails.status === 'REFUNDED' || receiptDetails.status === 'PARTIALLY_REFUNDED') && (
                            <div className="no-print" style={{
                                background: 'rgba(220, 38, 38, 0.08)',
                                border: '1px solid rgba(220, 38, 38, 0.3)',
                                color: '#dc2626',
                                padding: '10px 12px',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                marginBottom: '14px',
                                width: '100%'
                            }}>
                                <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <RotateCcw size={16} /> TRANSACTION HAS RETURN / REFUND RECORDS
                                </div>
                                <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#4b5563' }}>
                                    Total Refunded: <strong style={{ color: '#dc2626' }}>{formatCurrency(receiptDetails.refund_amount || 0)}</strong>
                                </div>
                            </div>
                        )}

                        {receiptDetails.returns && receiptDetails.returns.length > 0 && (
                            <div className="no-print" style={{ width: '100%', marginBottom: '16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px 12px', fontSize: '0.75rem' }}>
                                <div style={{ fontWeight: 600, color: '#111', marginBottom: '6px' }}>Return Slips Recorded:</div>
                                {receiptDetails.returns.map(ret => (
                                    <div key={ret.id} style={{ borderBottom: '1px dashed #d1d5db', paddingBottom: '6px', marginBottom: '6px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                                            <span style={{ fontFamily: 'monospace' }}>{ret.return_number}</span>
                                            <span style={{ color: '#dc2626' }}>-{formatCurrency(ret.total_refund_amount)} ({ret.refund_payment_method})</span>
                                        </div>
                                        <div style={{ color: '#6b7280', marginTop: '2px' }}>
                                            {formatAuditDate(ret.created_at)} by {ret.cashier} • Reason: {ret.reason || 'No remarks'}
                                        </div>
                                        {ret.items && ret.items.length > 0 && (
                                            <div style={{ marginTop: '4px', paddingLeft: '8px', borderLeft: '2px solid #e5e7eb' }}>
                                                {ret.items.map(ri => (
                                                    <div key={ri.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                                                        <span>{ri.quantity}x {ri.product_name} ({ri.disposition})</span>
                                                        <span>{formatCurrency(ri.refund_subtotal)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="receipt-container" style={{ display: 'block', width: '100%' }}>
                            <ReceiptPrint
                                orderNumber={receiptDetails.order_number || `SO-${receiptDetails.id}`}
                                date={receiptDetails.sale_date}
                                cashier={receiptDetails.cashier}
                                customerName={receiptDetails.customer_name || ''}
                                customerAddress={receiptDetails.customer_address || ''}
                                items={receiptDetails.items || []}
                                totalAmount={receiptDetails.total_amount}
                                paymentMethod={receiptDetails.payment_method || 'CASH'}
                                amountTendered={receiptDetails.tendered_amount || receiptDetails.total_amount}
                                changeDue={receiptDetails.change_due || 0}
                                gcashReference={receiptDetails.payment_reference || ''}
                                cashAmount={receiptDetails.cash_amount}
                                gcashAmount={receiptDetails.gcash_amount}
                                width={receiptWidth}
                            />
                        </div>

                        <div className="no-print" style={{ marginTop: '20px', display: 'flex', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
                            <button className="btn-primary no-print" style={{ flex: 1, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={handlePrint}>
                                <Printer size={16} /> Print Receipt
                            </button>
                            {receiptDetails.status !== 'VOIDED' && receiptDetails.status !== 'REFUNDED' && (
                                <button
                                    type="button"
                                    className="no-print"
                                    style={{
                                        padding: '10px 18px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        background: '#dc2626',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => handleOpenVoid(receiptDetails)}
                                    title="Void this sale and restore all items into inventory stock"
                                >
                                    <Ban size={16} /> Void
                                </button>
                            )}
                            <button className="btn-secondary no-print" style={{ flex: 1, padding: '10px 14px' }} onClick={closeReceipt}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PrintTransactionsReportModal
                isOpen={showPrintModal}
                onClose={() => setShowPrintModal(false)}
                initialTimeframe={timeframe}
                user={user}
                transactions={transactions}
                currentFilterDate={filterDate}
                currentCashier={userFilter !== 'ALL' ? userFilter : ''}
                searchQuery={searchQuery}
            />

            <PrintReturnsReportModal
                isOpen={showReturnsPrintModal}
                onClose={() => setShowReturnsPrintModal(false)}
                initialTimeframe={timeframe}
                user={user}
                returns={returnsList}
                currentFilterDate={filterDate}
                currentCashier={userFilter !== 'ALL' ? userFilter : ''}
                searchQuery={searchQuery}
            />

            {/* VOID CONFIRMATION MODAL */}
            {voidTarget && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    zIndex: 10001,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    overflowY: 'auto'
                }}>
                    <div className="glass-panel" style={{
                        background: 'var(--surface)',
                        color: 'var(--text-main)',
                        padding: '20px 22px',
                        borderRadius: '12px',
                        maxWidth: '460px',
                        width: '100%',
                        maxHeight: '92vh',
                        overflowY: 'auto',
                        border: '1px solid var(--border)',
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
                        position: 'relative'
                    }}>
                        <button
                            type="button"
                            onClick={() => setVoidTarget(null)}
                            style={{
                                position: 'absolute',
                                top: '14px',
                                right: '14px',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '4px'
                            }}
                            title="Close"
                        >
                            <X size={18} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', paddingRight: '24px' }}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '8px',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <Ban size={20} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                                    Void Transaction {voidTarget.order_number || `SO-${voidTarget.id}`}?
                                </h3>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Total Amount: <strong>{formatCurrency(voidTarget.total_amount)}</strong>
                                </span>
                            </div>
                        </div>

                        <div style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            marginBottom: '12px',
                            fontSize: '0.8rem',
                            color: 'var(--text-main)',
                            lineHeight: '1.35'
                        }}>
                            <strong>⚠️ Warning:</strong> Voiding will cancel this transaction and automatically restore all items and serial numbers back into active stock.
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>
                                Reason for Void:
                            </label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                {['Cashier Mistake / Error', 'Customer Cancelled', 'Wrong Items Scanned', 'Duplicate Entry'].map(preset => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setVoidReason(preset)}
                                        style={{
                                            padding: '3px 8px',
                                            fontSize: '0.72rem',
                                            borderRadius: '4px',
                                            border: '1px solid',
                                            borderColor: voidReason === preset ? 'var(--primary)' : 'var(--border)',
                                            background: voidReason === preset ? 'rgba(5, 150, 105, 0.15)' : 'var(--surface-hover)',
                                            color: voidReason === preset ? 'var(--primary)' : 'var(--text-main)',
                                            cursor: 'pointer',
                                            fontWeight: voidReason === preset ? 600 : 400
                                        }}
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                className="input-premium"
                                rows={2}
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                placeholder="Enter specific reason for voiding this transaction..."
                                style={{ width: '100%', resize: 'none', fontSize: '0.82rem' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setVoidTarget(null)}
                                disabled={voiding}
                                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmVoid}
                                disabled={voiding}
                                style={{
                                    padding: '8px 18px',
                                    fontSize: '0.85rem',
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: 600,
                                    cursor: voiding ? 'not-allowed' : 'pointer',
                                    opacity: voiding ? 0.6 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Ban size={15} />
                                {voiding ? 'Voiding Sale...' : 'Confirm Void'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {refundTarget && (
                <ReturnRefundModal
                    isOpen={!!refundTarget}
                    onClose={() => setRefundTarget(null)}
                    transaction={refundTarget}
                    onSuccess={() => {
                        fetchTransactions(pagination.page);
                        if (activeTab === 'returns') {
                            fetchReturnsHistory(returnsPagination.page);
                        }
                    }}
                />
            )}
        </div>
    );
};

export default Transactions;
