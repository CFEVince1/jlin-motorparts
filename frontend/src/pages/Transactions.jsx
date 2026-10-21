import { useState, useEffect, useCallback, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import { History, Receipt, X, Printer, Search, Calendar, RotateCcw, ArrowDownRight, ArrowUpRight, Filter } from 'lucide-react';
import Spinner from '../components/Spinner';
import { getProductSnapshotMatch, normalizeSearchText } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import ReceiptPrint from '../components/ReceiptPrint';
import PrintTransactionsReportModal from '../components/PrintTransactionsReportModal';
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

    // Receipt Modal State
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [receiptDetails, setReceiptDetails] = useState(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);
    const [receiptWidth, setReceiptWidth] = useState('80mm');

    // Return & Refund Modal State
    const [refundTarget, setRefundTarget] = useState(null);

    // Reporting State
    const [timeframe, setTimeframe] = useState('Daily');
    const [showPrintModal, setShowPrintModal] = useState(false);

    // Status Filter State
    const [statusFilter, setStatusFilter] = useState('ALL');

    const filterTransactionsFn = useCallback((items, debouncedQuery, filters) => {
        const normalizedQuery = normalizeSearchText(debouncedQuery);
        return items.map((transaction, index) => {
            const snapshotMatch = getProductSnapshotMatch(transaction, normalizedQuery);
            const orderMatch = String(transaction.id).includes(normalizedQuery) ||
                normalizeSearchText(transaction.order_number).includes(normalizedQuery);
            const cashierMatch = normalizeSearchText(transaction.cashier).includes(normalizedQuery);
            const rank = orderMatch || cashierMatch ? 6 : snapshotMatch.rank;

            return {
                transaction,
                index,
                matchRank: rank
            };
        }).filter(({ transaction, matchRank }) => {
            const matchSearch = !normalizedQuery || Number.isFinite(matchRank);
            let matchDate = true;
            if (filters.date) {
                const tDateStr = new Date(transaction.sale_date);
                const offset = tDateStr.getTimezoneOffset() * 60000;
                const localISOTime = (new Date(tDateStr - offset)).toISOString().split('T')[0];
                matchDate = localISOTime === filters.date;
            }

            let matchStatus = true;
            if (statusFilter !== 'ALL') {
                if (statusFilter === 'REFUNDED') {
                    matchStatus = transaction.status === 'REFUNDED' || transaction.status === 'PARTIALLY_REFUNDED';
                } else {
                    matchStatus = transaction.status === statusFilter;
                }
            }

            return matchSearch && matchDate && matchStatus;
        }).sort((a, b) => {
            if (normalizedQuery && a.matchRank !== b.matchRank) {
                return a.matchRank - b.matchRank;
            }

            if (filters.sortBy === 'newest') {
                return new Date(b.transaction.sale_date) - new Date(a.transaction.sale_date);
            } else if (filters.sortBy === 'oldest') {
                return new Date(a.transaction.sale_date) - new Date(b.transaction.sale_date);
            } else if (filters.sortBy === 'highest') {
                return Number(b.transaction.total_amount) - Number(a.transaction.total_amount);
            }
            return a.index - b.index;
        }).map(({ transaction }) => transaction);
    }, [statusFilter]);

    const {
        searchQuery,
        handleSearchChange,
        filters,
        setFilter,
        filteredItems: filteredTransactions
    } = useTableFilter({
        items: transactions,
        initialFilters: { date: '', sortBy: 'newest' },
        filterFn: filterTransactionsFn
    });

    const filterDate = filters.date;
    const sortBy = filters.sortBy;

    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1
    });

    const fetchTransactions = async (page = 1) => {
        try {
            const res = await api.get('/sales', {
                params: {
                    page,
                    limit: 20,
                    status: statusFilter !== 'ALL' ? statusFilter : undefined
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
    };

    const fetchReturnsHistory = async (page = 1) => {
        setLoadingReturns(true);
        try {
            const res = await api.get('/sales/returns/history', {
                params: {
                    page,
                    limit: 20,
                    search: searchQuery || undefined,
                    date: filterDate || undefined
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
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
            fetchTransactions(newPage);
        }
    };

    const handleReturnsPageChange = (newPage) => {
        if (newPage >= 1 && newPage <= returnsPagination.totalPages && newPage !== returnsPagination.page) {
            fetchReturnsHistory(newPage);
        }
    };

    const getPageNumbers = (curr, total) => {
        const pages = [];
        const maxButtons = 5;
        let start = Math.max(1, curr - 2);
        let end = Math.min(total, start + maxButtons - 1);
        if (end - start + 1 < maxButtons) {
            start = Math.max(1, end - maxButtons + 1);
        }
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    };

    useEffect(() => {
        fetchTransactions();
        fetchReturnsHistory();
    }, [statusFilter]);

    useEffect(() => {
        if (activeTab === 'returns') {
            fetchReturnsHistory(1);
        }
    }, [activeTab, searchQuery, filterDate]);

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
                        <option value="Monthly">Monthly Report</option>
                        <option value="Yearly">Yearly Report</option>
                    </select>
                    <button onClick={() => setShowPrintModal(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Printer size={16} /> Print {timeframe} {isStaff ? 'Transaction Records' : 'Transactions'}
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

                {activeTab === 'sales' && (
                    <div style={{ flex: '0 0 auto' }}>
                        <select
                            className="input-premium"
                            style={{ width: '170px' }}
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="COMPLETED">Completed Only</option>
                            <option value="REFUNDED">Refunded / Returned</option>
                            <option value="VOIDED">Voided Only</option>
                        </select>
                    </div>
                )}

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
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTransactions.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" className="table-empty-state">No transactions match your search.</td>
                                            </tr>
                                        ) : (
                                            filteredTransactions.map(t => (
                                                <tr key={t.id}>
                                                    <td style={{ fontWeight: 'bold', color: t.status === 'VOIDED' ? 'var(--text-muted)' : 'var(--primary)', fontFamily: 'monospace' }}>
                                                        <div>{t.order_number || `SO-${t.id}`}</div>
                                                        <div style={{ marginTop: '3px' }}>
                                                            {t.status === 'VOIDED' && (
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '1px 6px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.68rem',
                                                                    fontWeight: 'bold',
                                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                                    color: '#ef4444',
                                                                    border: '1px solid rgba(239, 68, 68, 0.3)'
                                                                }}>
                                                                    VOIDED
                                                                </span>
                                                            )}
                                                            {t.status === 'REFUNDED' && (
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '1px 6px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.68rem',
                                                                    fontWeight: 'bold',
                                                                    background: 'rgba(220, 38, 38, 0.12)',
                                                                    color: '#dc2626',
                                                                    border: '1px solid rgba(220, 38, 38, 0.3)'
                                                                }}>
                                                                    REFUNDED
                                                                </span>
                                                            )}
                                                            {t.status === 'PARTIALLY_REFUNDED' && (
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '1px 6px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.68rem',
                                                                    fontWeight: 'bold',
                                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                                    color: '#d97706',
                                                                    border: '1px solid rgba(245, 158, 11, 0.3)'
                                                                }}>
                                                                    PARTIAL REFUND
                                                                </span>
                                                            )}
                                                        {t.return_dispositions && (
                                                                <div style={{ display: 'flex', gap: '3px', marginTop: '3px', flexWrap: 'wrap' }}>
                                                                    {t.return_dispositions.split(',').map((disp, di) => {
                                                                        const clean = disp.trim();
                                                                        if (!clean) return null;
                                                                        return <span key={di}>{renderDispositionPill(clean)}</span>;
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
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
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                            <button
                                                                onClick={() => handleViewReceipt(t.id)}
                                                                className="btn-secondary"
                                                                style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                                                                disabled={loadingReceipt}
                                                                title="View Receipt"
                                                            >
                                                                <Receipt size={14} /> Receipt
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

                            {pagination.totalPages > 1 && (
                                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '8px' }}>
                                        Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                                    </span>
                                    <button
                                        disabled={pagination.page <= 1}
                                        onClick={() => handlePageChange(pagination.page - 1)}
                                        className="btn-secondary"
                                        style={{ padding: '4px 12px', fontSize: '0.9rem', opacity: pagination.page <= 1 ? 0.5 : 1 }}
                                    >
                                        Prev
                                    </button>

                                    {getPageNumbers(pagination.page, pagination.totalPages).map(pageNum => (
                                        <button
                                            key={pageNum}
                                            onClick={() => handlePageChange(pageNum)}
                                            className={pagination.page === pageNum ? "btn-primary" : "btn-secondary"}
                                            style={{ padding: '4px 12px', fontSize: '0.9rem' }}
                                        >
                                            {pageNum}
                                        </button>
                                    ))}

                                    <button
                                        disabled={pagination.page >= pagination.totalPages}
                                        onClick={() => handlePageChange(pagination.page + 1)}
                                        className="btn-secondary"
                                        style={{ padding: '4px 12px', fontSize: '0.9rem', opacity: pagination.page >= pagination.totalPages ? 0.5 : 1 }}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <RotateCcw size={18} color="var(--primary)" /> Processed Return & Refund Ledger
                                </h2>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                    Full historical audit log of customer product returns, inventory restocks/outflows, and monetary refunds.
                                </p>
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                {returnsPagination.total} Total Return Slip{returnsPagination.total !== 1 ? 's' : ''}
                            </span>
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

                        {returnsPagination.totalPages > 1 && (
                            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '8px' }}>
                                    Page {returnsPagination.page} of {returnsPagination.totalPages} ({returnsPagination.total} total)
                                </span>
                                <button
                                    disabled={returnsPagination.page <= 1}
                                    onClick={() => handleReturnsPageChange(returnsPagination.page - 1)}
                                    className="btn-secondary"
                                    style={{ padding: '4px 12px', fontSize: '0.9rem', opacity: returnsPagination.page <= 1 ? 0.5 : 1 }}
                                >
                                    Prev
                                </button>

                                {getPageNumbers(returnsPagination.page, returnsPagination.totalPages).map(pageNum => (
                                    <button
                                        key={pageNum}
                                        onClick={() => handleReturnsPageChange(pageNum)}
                                        className={returnsPagination.page === pageNum ? "btn-primary" : "btn-secondary"}
                                        style={{ padding: '4px 12px', fontSize: '0.9rem' }}
                                    >
                                        {pageNum}
                                    </button>
                                ))}

                                <button
                                    disabled={returnsPagination.page >= returnsPagination.totalPages}
                                    onClick={() => handleReturnsPageChange(returnsPagination.page + 1)}
                                    className="btn-secondary"
                                    style={{ padding: '4px 12px', fontSize: '0.9rem', opacity: returnsPagination.page >= returnsPagination.totalPages ? 0.5 : 1 }}
                                >
                                    Next
                                </button>
                            </div>
                        )}
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

                        <div className="no-print" style={{ marginTop: '20px', display: 'flex', gap: '10px', width: '100%' }}>
                            <button className="btn-primary no-print" style={{ flex: 1, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={handlePrint}>
                                <Printer size={16} /> Print Receipt
                            </button>
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
                transactions={filteredTransactions}
                currentFilterDate={filterDate}
                searchQuery={searchQuery}
            />
        </div>
    );
};

export default Transactions;
