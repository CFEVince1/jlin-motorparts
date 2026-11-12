import { useState, useEffect, useCallback, useContext, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import { History, Receipt, X, Printer, Search, Calendar, RotateCcw, ArrowDownRight, ArrowUpRight, Filter, Ban, ChevronDown, ArrowLeftRight } from 'lucide-react';
import { notifyInventoryChange, subscribeToInventoryChange } from '../utils/syncEvents';
import Spinner from '../components/Spinner';
import { getProductSnapshotMatch, normalizeSearchText } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import { getLedgerCategoryCode } from '../utils/categoryTaxonomy';
import ReceiptPrint from '../components/ReceiptPrint';
import PrintTransactionsReportModal from '../components/PrintTransactionsReportModal';

export const formatShortOrderNo = (raw) => {
    if (!raw) return '—';
    let str = String(raw).trim();
    // Strip redundant 4-digit year e.g. SO-2026-0111 -> SO-0111, SO-2026-GC-01 -> SO-GC01, SO-2026-BAL-01 -> SO-BAL01
    str = str.replace(/^SO-\d{4}-/i, 'SO-');
    str = str.replace(/^SO-GC-0*(\d+)/i, (_, p1) => `SO-GC${p1.padStart(2, '0')}`);
    str = str.replace(/^SO-BAL-0*(\d+)/i, (_, p1) => `SO-BAL${p1.padStart(2, '0')}`);
    return str;
};

const Transactions = ({ embedded = false, defaultTab }) => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const isStaff = user?.role === 'staff';

    // Tab: Sales Transactions
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState('sales');

    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Void Modal State
    const [voidTarget, setVoidTarget] = useState(null);
    const [voidReason, setVoidReason] = useState('');
    const [voiding, setVoiding] = useState(false);

    // Receipt Modal State
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [receiptDetails, setReceiptDetails] = useState(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);
    const [receiptWidth, setReceiptWidth] = useState('80mm');

    // Reporting State
    const [timeframe, setTimeframe] = useState(() => {
        const tf = searchParams.get('timeframe');
        if (tf && ['Daily', 'Weekly', 'Monthly', 'Yearly', 'All'].includes(tf)) return tf;
        return 'Daily';
    });
    const [showPrintModal, setShowPrintModal] = useState(false);

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

    const initialDate = useMemo(() => {
        const d = searchParams.get('date');
        if (d && d.toLowerCase() === 'today') {
            return new Date().toLocaleDateString('en-CA');
        }
        return d || '';
    }, [searchParams]);

    const initialStartDate = useMemo(() => searchParams.get('startDate') || '', [searchParams]);
    const initialEndDate = useMemo(() => searchParams.get('endDate') || '', [searchParams]);
    const initialTimeframeFilter = useMemo(() => searchParams.get('timeframe') || '', [searchParams]);

    const {
        searchQuery,
        handleSearchChange,
        debouncedSearchQuery,
        filters,
        setFilter
    } = useTableFilter({
        initialSearch: searchParams.get('search') || '',
        initialFilters: {
            date: initialDate,
            startDate: initialStartDate,
            endDate: initialEndDate,
            timeframe: initialTimeframeFilter,
            sortBy: 'newest'
        }
    });

    const filterDate = filters.date;
    const filterStartDate = filters.startDate;
    const filterEndDate = filters.endDate;
    const filterTf = filters.timeframe;
    const sortBy = filters.sortBy;

    const getPHTToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const todayStr = getPHTToday();
    const monthStart = `${todayStr.slice(0, 7)}-01`;
    const past7 = new Date(new Date().getTime() - 6 * 24 * 60 * 60 * 1000);
    const weekStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(past7);

    // Active timeframe detector
    const activeDatePill = useMemo(() => {
        if (!filterDate && !filterStartDate && !filterEndDate) return 'all';
        if (filterTf === 'month' || (filterStartDate === monthStart && filterEndDate === todayStr)) return 'month';
        if (filterTf === 'week' || (filterStartDate === weekStart && filterEndDate === todayStr)) return 'week';
        if (filterDate === todayStr || (filterStartDate === todayStr && filterEndDate === todayStr) || filterTf === 'today') return 'today';
        return 'custom';
    }, [filterDate, filterStartDate, filterEndDate, filterTf, monthStart, weekStart, todayStr]);

    const handleSelectTimeframePill = useCallback((tf) => {
        if (tf === 'all') {
            setFilter('date', '');
            setFilter('startDate', '');
            setFilter('endDate', '');
            setFilter('timeframe', '');
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.delete('date');
                next.delete('startDate');
                next.delete('endDate');
                next.delete('timeframe');
                return next;
            });
        } else if (tf === 'today') {
            setFilter('date', todayStr);
            setFilter('startDate', '');
            setFilter('endDate', '');
            setFilter('timeframe', 'today');
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.set('date', 'today');
                next.delete('startDate');
                next.delete('endDate');
                next.delete('timeframe');
                return next;
            });
        } else if (tf === 'week') {
            setFilter('date', '');
            setFilter('startDate', weekStart);
            setFilter('endDate', todayStr);
            setFilter('timeframe', 'week');
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.delete('date');
                next.set('timeframe', 'week');
                next.set('startDate', weekStart);
                next.set('endDate', todayStr);
                return next;
            });
        } else if (tf === 'month') {
            setFilter('date', '');
            setFilter('startDate', monthStart);
            setFilter('endDate', todayStr);
            setFilter('timeframe', 'month');
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.delete('date');
                next.set('timeframe', 'month');
                next.set('startDate', monthStart);
                next.set('endDate', todayStr);
                return next;
            });
        }
    }, [setFilter, setSearchParams, todayStr, weekStart, monthStart]);

    // Filter Type: ('ALL' | 'VOID' | 'DISCOUNT')
    const [filterType, setFilterType] = useState(() => {
        const ft = searchParams.get('filterType');
        if (ft && ['VOID', 'DISCOUNT', 'VOIDED', 'DISCOUNTS'].includes(ft.toUpperCase())) {
            let u = ft.toUpperCase();
            if (u === 'VOIDED') u = 'VOID';
            if (u === 'DISCOUNTS') u = 'DISCOUNT';
            return u;
        }
        return 'ALL';
    });

    // Payment Method Filter State: ('ALL' | 'CASH' | 'GCASH')
    const [paymentMethodFilter, setPaymentMethodFilter] = useState(() => {
        const pm = searchParams.get('paymentMethod');
        if (pm && ['CASH', 'GCASH', 'SPLIT', 'Cash', 'GCash'].includes(pm)) return pm.toUpperCase();
        const ft = searchParams.get('filterType');
        if (ft && ['CASH', 'GCASH'].includes(ft.toUpperCase())) return ft.toUpperCase();
        return 'ALL';
    });

    // Summary totals for Cash | GCash | Total
    const [salesSummary, setSalesSummary] = useState({
        total_revenue: 0,
        total_count: 0,
        cash_revenue: 0,
        cash_count: 0,
        gcash_revenue: 0,
        gcash_count: 0
    });

    // Custom Filtering Dropdown state (cash, gcash, void, discount)
    const [filteringOpen, setFilteringOpen] = useState(false);
    const filteringRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (filteringRef.current && !filteringRef.current.contains(event.target)) {
                setFilteringOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSetPaymentMethod = useCallback((pm) => {
        const val = (pm || 'ALL').toUpperCase();
        setPaymentMethodFilter(val);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val === 'ALL') {
                next.delete('paymentMethod');
            } else {
                next.set('paymentMethod', val);
            }
            return next;
        });
    }, [setSearchParams]);

    const handleSetTypeFilter = useCallback((ft) => {
        let val = (ft || 'ALL').toUpperCase();
        if (val === 'VOIDED') val = 'VOID';
        if (val === 'DISCOUNTS') val = 'DISCOUNT';
        setFilterType(val);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val === 'ALL') {
                next.delete('filterType');
            } else {
                next.set('filterType', val);
            }
            return next;
        });
    }, [setSearchParams]);

    const handleClearAllFilters = useCallback(() => {
        setPaymentMethodFilter('ALL');
        setFilterType('ALL');
        setStatusFilter('ALL');
        setUserFilter('ALL');
        setFilter('date', '');
        setFilter('startDate', '');
        setFilter('endDate', '');
        setFilter('timeframe', '');
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete('paymentMethod');
            next.delete('filterType');
            next.delete('date');
            next.delete('startDate');
            next.delete('endDate');
            next.delete('timeframe');
            next.delete('user');
            next.delete('cashier');
            return next;
        });
    }, [setSearchParams, setFilter]);

    const handleApplyFilterType = useCallback((val) => {
        const upper = (val || 'ALL').toUpperCase();
        if (upper === 'CASH' || upper === 'GCASH') {
            handleSetPaymentMethod(upper);
        } else if (['VOID', 'DISCOUNT'].includes(upper)) {
            handleSetTypeFilter(upper);
        } else if (upper === 'ALL') {
            handleClearAllFilters();
        }
    }, [handleSetPaymentMethod, handleSetTypeFilter, handleClearAllFilters]);

    useEffect(() => {
        const pm = searchParams.get('paymentMethod');
        const ft = searchParams.get('filterType');
        const d = searchParams.get('date');
        const sDate = searchParams.get('startDate');
        const eDate = searchParams.get('endDate');
        const tf = searchParams.get('timeframe');
        const u = searchParams.get('user') || searchParams.get('cashier');

        let nextPm = 'ALL';
        if (pm && ['CASH', 'GCASH', 'SPLIT'].includes(pm.toUpperCase())) {
            nextPm = pm.toUpperCase();
        } else if (ft && ['CASH', 'GCASH'].includes(ft.toUpperCase())) {
            nextPm = ft.toUpperCase();
        }

        let nextFt = 'ALL';
        if (ft && ['VOID', 'DISCOUNT', 'VOIDED', 'DISCOUNTS'].includes(ft.toUpperCase())) {
            let upper = ft.toUpperCase();
            if (upper === 'VOIDED') upper = 'VOID';
            if (upper === 'DISCOUNTS') upper = 'DISCOUNT';
            nextFt = upper;
        }

        if (nextPm !== paymentMethodFilter) setPaymentMethodFilter(nextPm);
        if (nextFt !== filterType) setFilterType(nextFt);

        // Date sync (support 'today' as local YYYY-MM-DD or startDate / endDate range)
        if (sDate || eDate) {
            if (filters.startDate !== (sDate || '')) setFilter('startDate', sDate || '');
            if (filters.endDate !== (eDate || '')) setFilter('endDate', eDate || '');
            if (filters.date !== '') setFilter('date', '');
        } else if (d) {
            const resolvedDate = d.toLowerCase() === 'today' ? new Date().toLocaleDateString('en-CA') : d;
            if (filters.date !== resolvedDate) {
                setFilter('date', resolvedDate);
            }
            if (filters.startDate !== '') setFilter('startDate', '');
            if (filters.endDate !== '') setFilter('endDate', '');
        } else {
            if (filters.date) setFilter('date', '');
            if (filters.startDate) setFilter('startDate', '');
            if (filters.endDate) setFilter('endDate', '');
        }

        // Timeframe sync
        if (tf) {
            if (filters.timeframe !== tf) setFilter('timeframe', tf);
            const lower = tf.toLowerCase();
            if (lower === 'month' || lower === 'monthly') setTimeframe('Monthly');
            else if (lower === 'week' || lower === 'weekly') setTimeframe('Weekly');
            else if (lower === 'today' || lower === 'daily') setTimeframe('Daily');
            else if (lower === 'year' || lower === 'yearly') setTimeframe('Yearly');
            else if (lower === 'all') setTimeframe('All');
        } else if (d && d.toLowerCase() === 'today') {
            setTimeframe('Daily');
        }

        // User / Cashier sync
        if (u && u !== 'ALL') {
            setUserFilter(u);
        }
    }, [searchParams, filters.date, filters.startDate, filters.endDate, filters.timeframe, setFilter, paymentMethodFilter, filterType]);

    // Page size state with localStorage persistence (Default: 10)
    const [pageSize, setPageSize] = useState(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('transactions_page_size') : null;
        return saved ? Number(saved) : 10;
    });

    const handlePageSizeChange = useCallback((newSize) => {
        const size = Number(newSize);
        setPageSize(size);
        if (typeof window !== 'undefined') {
            localStorage.setItem('transactions_page_size', String(size));
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
            const params = {
                page,
                limit,
                search: debouncedSearchQuery?.trim() || undefined,
                sortBy,
                status: statusFilter !== 'ALL' ? statusFilter : undefined,
                paymentMethod: paymentMethodFilter !== 'ALL' ? paymentMethodFilter : undefined,
                filterType: filterType !== 'ALL' ? filterType : undefined,
                selfOnly: (isStaff && staffScope === 'mine') ? 'true' : undefined,
                user: userFilter !== 'ALL' ? userFilter : undefined
            };

            if (filterStartDate && filterEndDate) {
                params.startDate = filterStartDate;
                params.endDate = filterEndDate;
            } else if (filterDate) {
                params.date = filterDate;
            } else {
                if (filterStartDate) params.startDate = filterStartDate;
                if (filterEndDate) params.endDate = filterEndDate;
            }

            const res = await api.get('/sales', { params });
            const rawData = res.data;
            const salesList = Array.isArray(rawData) ? rawData : (rawData?.data || []);
            setTransactions(salesList);
            if (rawData?.pagination) {
                setPagination(rawData.pagination);
            }
            if (rawData?.summary) {
                setSalesSummary(rawData.summary);
            }
        } catch {
            toast.error('Failed to load transactions');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearchQuery, filterDate, filterStartDate, filterEndDate, sortBy, statusFilter, paymentMethodFilter, filterType, isStaff, staffScope, userFilter, pageSize]);

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
            fetchTransactions(newPage, pageSize);
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
        fetchTransactions(1, pageSize);

        const unsubscribe = subscribeToInventoryChange(() => {
            fetchTransactions(1, pageSize);
        });

        // 8-second live sync polling
        const poll = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchTransactions(1, pageSize);
        }, 8000);

        return () => {
            unsubscribe();
            clearInterval(poll);
        };
    }, [debouncedSearchQuery, filterDate, filterStartDate, filterEndDate, sortBy, statusFilter, paymentMethodFilter, filterType, staffScope, userFilter, pageSize, fetchTransactions]);

    const handleOpenVoid = (transaction) => {
        setVoidTarget(transaction);
        setVoidReason('');
    };

    const handleConfirmVoid = async () => {
        if (!voidTarget) return;
        const trimmedReason = (voidReason || '').trim();
        if (!trimmedReason) {
            toast.error('A mandatory reason note is required to void this sale.');
            return;
        }
        setVoiding(true);
        try {
            const res = await api.post(`/sales/${voidTarget.id}/void`, {
                reason: trimmedReason
            });
            toast.success(res.data?.message || `Order ${voidTarget.order_number || ('SO-' + voidTarget.id)} voided successfully`);
            notifyInventoryChange('void');

            // Update receiptDetails if currently viewing this receipt
            if (receiptDetails && (receiptDetails.id === voidTarget.id || receiptDetails.sale_id === voidTarget.id)) {
                setReceiptDetails(prev => ({
                    ...prev,
                    status: 'VOIDED',
                    void_reason: trimmedReason
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
                        <ArrowUpRight size={12} /> + Restocked (+ Stock)
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
                        <ArrowDownRight size={12} /> - Damaged Item (Set Aside)
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
                        <ArrowDownRight size={12} /> - Returned to Supplier (- Stock)
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
                        <ArrowDownRight size={12} /> - Damaged / Deducted (- Stock)
                    </span>
                );
            default:
                return <span style={{ fontSize: '0.72rem' }}>{disp}</span>;
        }
    };

    const renderStatusBadge = (t) => {
        const s = (t.status || '').toUpperCase();
        if (s === 'VOIDED') {
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

        

        if (s === 'PENDING' || s === 'PENDING_BALANCE' || s === 'PENDING_VERIFICATION') {
            return (
                <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245, 158, 11, 0.3)'
                }}>
                    Pending
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
                Sold
            </span>
        );
    };

    return (
        <div className={selectedTransaction ? 'receipt-modal-active' : ''} style={{ position: 'relative', height: '100%' }}>
            {/* Header */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: embedded ? '14px' : '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: embedded ? '1.3rem' : '1.75rem', fontWeight: 700 }}>
                        <History size={embedded ? 24 : 30} color="var(--primary)" /> Sales History
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: embedded ? '2px 0 0 34px' : '4px 0 0 42px' }}>
                        {isStaff
                            ? `Personal sales and checkouts for ${user?.username || 'your cashier account'}.`
                            : 'Complete record of all customer sales and receipts.'}
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
                        onClick={() => setShowPrintModal(true)}
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
                        <Printer size={16} /> Print {timeframe === 'All' ? 'All-Time' : timeframe} Sales Report
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
            </div>

            {/* TOP 3 SUMMARY AUDIT CARDS: CASH | GCASH | TOTAL (MATCHING IMAGE 2) */}
            {activeTab === 'sales' && (
                <div className="no-print" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '18px',
                    flexWrap: 'wrap'
                }}>
                    {/* CASH CARD */}
                    <div
                        onClick={() => {
                            handleSetPaymentMethod(paymentMethodFilter === 'CASH' ? 'ALL' : 'CASH');
                        }}
                        className="history-card-cash"
                        style={{
                            flex: '1 1 200px',
                            background: paymentMethodFilter === 'CASH' ? 'rgba(34, 197, 94, 0.14)' : 'var(--surface)',
                            border: `2px solid ${paymentMethodFilter === 'CASH' ? '#16a34a' : 'var(--border)'}`,
                            borderRadius: '12px',
                            padding: '14px 18px',
                            cursor: 'pointer',
                            transition: 'all 0.18s ease',
                            boxShadow: paymentMethodFilter === 'CASH' ? '0 4px 12px rgba(22, 163, 74, 0.18)' : 'var(--glass-shadow)'
                        }}
                        title={paymentMethodFilter === 'CASH' ? 'Click to show all payment methods' : 'Click to show Cash transactions only'}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                💵 Cash
                            </span>
                            {paymentMethodFilter === 'CASH' ? (
                                <span style={{ fontSize: '0.66rem', fontWeight: 700, background: '#16a34a', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>
                                    Active Filter
                                </span>
                            ) : (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Filter Cash</span>
                            )}
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', fontFamily: 'monospace', marginTop: '6px', lineHeight: 1.1 }}>
                            {formatCurrency(salesSummary.cash_revenue || 0)}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {salesSummary.cash_count || 0} Cash {filterType !== 'ALL' ? `${filterType.toLowerCase()}s` : 'transactions'}
                        </div>
                    </div>

                    {/* GCASH CARD */}
                    <div
                        onClick={() => {
                            handleSetPaymentMethod(paymentMethodFilter === 'GCASH' ? 'ALL' : 'GCASH');
                        }}
                        className="history-card-gcash"
                        style={{
                            flex: '1 1 200px',
                            background: paymentMethodFilter === 'GCASH' ? 'rgba(59, 130, 246, 0.14)' : 'var(--surface)',
                            border: `2px solid ${paymentMethodFilter === 'GCASH' ? '#2563eb' : 'var(--border)'}`,
                            borderRadius: '12px',
                            padding: '14px 18px',
                            cursor: 'pointer',
                            transition: 'all 0.18s ease',
                            boxShadow: paymentMethodFilter === 'GCASH' ? '0 4px 12px rgba(37, 99, 235, 0.18)' : 'var(--glass-shadow)'
                        }}
                        title={paymentMethodFilter === 'GCASH' ? 'Click to show all payment methods' : 'Click to show GCash transactions only'}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                📱 GCash
                            </span>
                            {paymentMethodFilter === 'GCASH' ? (
                                <span style={{ fontSize: '0.66rem', fontWeight: 700, background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>
                                    Active Filter
                                </span>
                            ) : (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Filter GCash</span>
                            )}
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', fontFamily: 'monospace', marginTop: '6px', lineHeight: 1.1 }}>
                            {formatCurrency(salesSummary.gcash_revenue || 0)}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {salesSummary.gcash_count || 0} GCash {filterType !== 'ALL' ? `${filterType.toLowerCase()}s` : 'transactions'}
                        </div>
                    </div>

                    {/* TOTAL CARD */}
                    <div
                        onClick={() => {
                            if (paymentMethodFilter !== 'ALL') {
                                handleSetPaymentMethod('ALL');
                            } else if (filterType !== 'ALL') {
                                handleClearAllFilters();
                            }
                        }}
                        className="history-card-total"
                        style={{
                            flex: '1 1 200px',
                            background: (paymentMethodFilter === 'ALL' && filterType === 'ALL') ? 'rgba(147, 51, 234, 0.14)' : 'var(--surface)',
                            border: `2px solid ${(paymentMethodFilter === 'ALL' && filterType === 'ALL') ? '#9333ea' : 'var(--border)'}`,
                            borderRadius: '12px',
                            padding: '14px 18px',
                            cursor: 'pointer',
                            transition: 'all 0.18s ease',
                            boxShadow: (paymentMethodFilter === 'ALL' && filterType === 'ALL') ? '0 4px 12px rgba(147, 51, 234, 0.18)' : 'var(--glass-shadow)'
                        }}
                        title={paymentMethodFilter !== 'ALL' ? 'Click to show all payment methods' : (filterType !== 'ALL' ? 'Click to clear all filters' : 'Showing all transactions')}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#9333ea', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                📊 Total
                            </span>
                            {(paymentMethodFilter === 'ALL' && filterType === 'ALL') ? (
                                <span style={{ fontSize: '0.66rem', fontWeight: 700, background: '#9333ea', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>
                                    All Total
                                </span>
                            ) : (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                    {paymentMethodFilter !== 'ALL' ? 'Show All Payments' : 'Show All'}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', fontFamily: 'monospace', marginTop: '6px', lineHeight: 1.1 }}>
                            {formatCurrency(salesSummary.total_revenue || 0)}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {salesSummary.total_count || 0} Total {filterType !== 'ALL' ? `${filterType.toLowerCase()}s` : 'transactions'}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 1: SALES TRANSACTIONS (ROUND BORDER CONTAINER MATCHING IMAGE 2 & 3) */}
            {activeTab === 'sales' && (
                <div id="print-area" className="printable-report">
                    <div
                        className={`sales-history-rounded-card ${selectedTransaction ? 'no-print' : ''}`}
                        style={{
                            background: 'var(--surface)',
                            border: '1.5px solid var(--border)',
                            borderRadius: '24px',
                            boxShadow: 'var(--glass-shadow)',
                            overflow: 'hidden',
                            marginBottom: '30px'
                        }}
                    >
                        {/* Top Inner Header Bar inside the Rounded Container (Matching Image 2) */}
                        <div className="no-print" style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            borderBottom: '1px solid var(--border)',
                            background: 'rgba(255, 255, 255, 0.015)',
                            gap: '12px',
                            flexWrap: 'wrap'
                        }}>
                            {/* Left Side: Search & Quick Filters */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 320px', flexWrap: 'wrap' }}>
                                <div style={{ position: 'relative', flex: '1 1 240px' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder="Search order #, part number, product, cashier..."
                                        className="input-premium"
                                        style={{ paddingLeft: '36px', width: '100%' }}
                                        value={searchQuery}
                                        onChange={handleSearchChange}
                                    />
                                </div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'var(--surface-hover)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    {[
                                        { key: 'all', label: 'All' },
                                        { key: 'today', label: 'Today' },
                                        { key: 'week', label: 'This Week' }
                                    ].map(p => {
                                        const isActive = activeDatePill === p.key;
                                        return (
                                            <button
                                                key={p.key}
                                                type="button"
                                                onClick={() => handleSelectTimeframePill(p.key)}
                                                style={{
                                                    padding: '4px 10px',
                                                    fontSize: '0.76rem',
                                                    fontWeight: 700,
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    background: isActive ? 'var(--primary)' : 'transparent',
                                                    color: isActive ? '#fff' : 'var(--text-muted)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div style={{ position: 'relative', flex: '0 0 auto' }}>
                                    <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        type="date"
                                        className="input-premium"
                                        style={{ paddingLeft: '36px', paddingRight: '12px' }}
                                        value={filterDate || (filterStartDate === filterEndDate ? filterStartDate : '')}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setFilter('date', val);
                                            setFilter('startDate', '');
                                            setFilter('endDate', '');
                                            setFilter('timeframe', '');
                                            setSearchParams(prev => {
                                                const next = new URLSearchParams(prev);
                                                if (val) {
                                                    next.set('date', val);
                                                } else {
                                                    next.delete('date');
                                                }
                                                next.delete('startDate');
                                                next.delete('endDate');
                                                next.delete('timeframe');
                                                return next;
                                            });
                                        }}
                                    />
                                </div>
                                {(filterDate || filterStartDate || filterEndDate) && (
                                    <button className="btn-secondary" onClick={() => handleSelectTimeframePill('all')} style={{ flex: '0 0 auto', padding: '6px 10px', fontSize: '0.8rem' }}>Clear Date</button>
                                )}
                                {isStaff ? (
                                    <select
                                        className="input-premium"
                                        style={{ width: '150px' }}
                                        value={staffScope}
                                        onChange={(e) => setStaffScope(e.target.value)}
                                    >
                                        <option value="all">All Store Sales</option>
                                        <option value="mine">My Sales Only</option>
                                    </select>
                                ) : (
                                    <select
                                        className="input-premium"
                                        style={{ width: '165px' }}
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
                                        <option value="ALL">All Cashiers</option>
                                        {usersList.map((u) => (
                                            <option key={u.id} value={u.username}>
                                                {u.username} ({u.role})
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <select className="input-premium" style={{ width: '155px' }} value={sortBy} onChange={(e) => setFilter('sortBy', e.target.value)}>
                                    <option value="newest">Sort: Newest</option>
                                    <option value="oldest">Sort: Oldest</option>
                                    <option value="highest">Sort: Highest</option>
                                </select>
                            </div>

                            {/* Right Side: The Filtering Button & Dropdown (Matching Image 2 & 3 with multi-filtering) */}
                            <div ref={filteringRef} style={{ position: 'relative', flex: '0 0 auto' }}>
                                <button
                                    type="button"
                                    onClick={() => setFilteringOpen(prev => !prev)}
                                    className="filtering-btn"
                                    style={{
                                        padding: '9px 18px',
                                        borderRadius: '8px',
                                        border: '1.5px solid',
                                        borderColor: (filterType !== 'ALL' || paymentMethodFilter !== 'ALL') ? 'var(--primary)' : 'var(--border)',
                                        background: (filterType !== 'ALL' || paymentMethodFilter !== 'ALL') ? 'rgba(22, 163, 74, 0.14)' : 'var(--surface-hover)',
                                        color: (filterType !== 'ALL' || paymentMethodFilter !== 'ALL') ? 'var(--primary)' : 'var(--text-main)',
                                        fontWeight: 700,
                                        fontSize: '0.86rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        cursor: 'pointer',
                                        boxShadow: (filterType !== 'ALL' || paymentMethodFilter !== 'ALL') ? '0 0 0 2px rgba(22, 163, 74, 0.2)' : 'none',
                                        transition: 'all 0.15s ease'
                                    }}
                                    title="Filter transactions by payment method and status (cash, gcash, void, discount)"
                                >
                                    <Filter size={15} />
                                    <span>
                                        {(() => {
                                            const parts = [];
                                            if (paymentMethodFilter !== 'ALL') parts.push(paymentMethodFilter.toLowerCase());
                                            if (filterType !== 'ALL') parts.push(filterType.toLowerCase());
                                            return parts.length > 0 ? `Category / Status: ${parts.join(' • ')}` : 'Category / Status';
                                        })()}
                                    </span>
                                    <ChevronDown size={14} style={{ transform: filteringOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                                </button>

                                {/* Dropdown Menu with Two-Tier Filtering (Payment Method + Status/Type) */}
                                {filteringOpen && (
                                    <div
                                        className="filtering-menu-dropdown"
                                        style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            right: 0,
                                            width: '215px',
                                            background: 'var(--surface)',
                                            border: '1.5px solid var(--border)',
                                            borderRadius: '10px',
                                            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.4)',
                                            zIndex: 200,
                                            overflow: 'hidden',
                                            padding: '6px'
                                        }}
                                    >
                                        <div style={{ padding: '6px 10px', fontSize: '0.70rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                                            Transaction Status / Type
                                        </div>
                                        {[
                                            { key: 'ALL', label: 'all statuses', icon: '📋' },
                                            { key: 'VOID', label: 'voided sales', icon: '🚫' },
                                            { key: 'DISCOUNT', label: 'discounted', icon: '🏷️' }
                                        ].map(item => {
                                            const isActive = filterType === item.key;
                                            return (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    onClick={() => {
                                                        handleSetTypeFilter(item.key);
                                                        setFilteringOpen(false);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '7px 12px',
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        background: isActive ? 'rgba(22, 163, 74, 0.15)' : 'transparent',
                                                        color: isActive ? 'var(--primary)' : 'var(--text-main)',
                                                        fontWeight: isActive ? 700 : 500,
                                                        fontSize: '0.84rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        transition: 'background 0.12s ease'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!isActive) e.currentTarget.style.background = 'var(--surface-hover)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isActive) e.currentTarget.style.background = 'transparent';
                                                    }}
                                                >
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'lowercase' }}>
                                                        <span>{item.icon}</span>
                                                        <span>{item.label}</span>
                                                    </span>
                                                    {isActive && (
                                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)' }} />
                                                    )}
                                                </button>
                                            );
                                        })}

                                        <div style={{ margin: '6px 0', borderTop: '1px solid var(--border)' }} />

                                        <div style={{ padding: '6px 10px', fontSize: '0.70rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                                            Payment Method
                                        </div>
                                        {[
                                            { key: 'ALL', label: 'all payments', icon: '🌐' },
                                            { key: 'CASH', label: 'cash only', icon: '💵' },
                                            { key: 'GCASH', label: 'gcash only', icon: '📱' }
                                        ].map(item => {
                                            const isActive = paymentMethodFilter === item.key;
                                            return (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    onClick={() => {
                                                        handleSetPaymentMethod(item.key);
                                                        setFilteringOpen(false);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '7px 12px',
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        background: isActive ? (item.key === 'GCASH' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(22, 163, 74, 0.15)') : 'transparent',
                                                        color: isActive ? (item.key === 'GCASH' ? '#2563eb' : 'var(--primary)') : 'var(--text-main)',
                                                        fontWeight: isActive ? 700 : 500,
                                                        fontSize: '0.84rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        transition: 'background 0.12s ease'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!isActive) e.currentTarget.style.background = 'var(--surface-hover)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isActive) e.currentTarget.style.background = 'transparent';
                                                    }}
                                                >
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'lowercase' }}>
                                                        <span>{item.icon}</span>
                                                        <span>{item.label}</span>
                                                    </span>
                                                    {isActive && (
                                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.key === 'GCASH' ? '#2563eb' : 'var(--primary)' }} />
                                                    )}
                                                </button>
                                            );
                                        })}

                                        {(paymentMethodFilter !== 'ALL' || filterType !== 'ALL') && (
                                            <>
                                                <div style={{ margin: '6px 0', borderTop: '1px solid var(--border)' }} />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        handleClearAllFilters();
                                                        setFilteringOpen(false);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '7px 12px',
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        background: 'transparent',
                                                        color: 'var(--text-muted)',
                                                        fontWeight: 600,
                                                        fontSize: '0.80rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        cursor: 'pointer',
                                                        textAlign: 'left'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.color = '#dc2626'}
                                                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                                >
                                                    <RotateCcw size={13} />
                                                    <span>reset all filters</span>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Active Filter Pill Bar */}
                        {(filterType !== 'ALL' || paymentMethodFilter !== 'ALL' || Boolean(filterDate || filterStartDate || filterEndDate) || (userFilter && userFilter !== 'ALL')) && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'rgba(22, 163, 74, 0.08)',
                                borderBottom: '1px solid rgba(22, 163, 74, 0.25)',
                                padding: '10px 20px',
                                fontSize: '0.85rem',
                                flexWrap: 'wrap',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Active Filters:</span>

                                    {(filterDate || filterStartDate || filterEndDate) && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '3px 10px',
                                            borderRadius: '16px',
                                            background: 'rgba(2, 132, 199, 0.18)',
                                            color: '#0284c7',
                                            border: '1px solid rgba(2, 132, 199, 0.4)',
                                            fontWeight: 700,
                                            fontSize: '0.78rem'
                                        }}>
                                            <span>
                                                📅 {(() => {
                                                    if (filterStartDate && filterEndDate && filterStartDate !== filterEndDate) {
                                                        if (filterTf === 'month') return `This Month (${filterStartDate} to ${filterEndDate})`;
                                                        if (filterTf === 'week') return `This Week (${filterStartDate} to ${filterEndDate})`;
                                                        return `${filterStartDate} to ${filterEndDate}`;
                                                    }
                                                    const single = filterDate || filterStartDate || filterEndDate;
                                                    return single === todayStr ? "Today" : single;
                                                })()}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleSelectTimeframePill('all')}
                                                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                title="Remove date filter"
                                            >
                                                <X size={13} />
                                            </button>
                                        </span>
                                    )}

                                    {paymentMethodFilter !== 'ALL' && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '3px 10px',
                                            borderRadius: '16px',
                                            background: paymentMethodFilter === 'CASH' ? 'rgba(34, 197, 94, 0.18)' : 'rgba(59, 130, 246, 0.18)',
                                            color: paymentMethodFilter === 'CASH' ? '#16a34a' : '#2563eb',
                                            border: `1px solid ${paymentMethodFilter === 'CASH' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
                                            fontWeight: 700,
                                            fontSize: '0.78rem'
                                        }}>
                                            <span>{paymentMethodFilter === 'CASH' ? '💵 Cash Only' : '📱 GCash Only'}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleSetPaymentMethod('ALL')}
                                                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                title="Remove payment filter"
                                            >
                                                <X size={13} />
                                            </button>
                                        </span>
                                    )}

                                    {filterType !== 'ALL' && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '3px 10px',
                                            borderRadius: '16px',
                                            background: filterType === 'VOID' ? 'rgba(100, 116, 139, 0.2)' : 'rgba(234, 88, 12, 0.18)',
                                            color: filterType === 'VOID' ? '#64748b' : '#ea580c',
                                            border: `1px solid ${filterType === 'VOID' ? 'rgba(100, 116, 139, 0.4)' : 'rgba(234, 88, 12, 0.4)'}`,
                                            fontWeight: 700,
                                            fontSize: '0.78rem'
                                        }}>
                                            <span>
                                                {filterType === 'VOID' ? '🚫 Void' :
                                                 filterType === 'DISCOUNT' ? '🏷️ Discount' : filterType.toLowerCase()}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleSetTypeFilter('ALL')}
                                                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                title="Remove type filter"
                                            >
                                                <X size={13} />
                                            </button>
                                        </span>
                                    )}

                                    {userFilter && userFilter !== 'ALL' && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '3px 10px',
                                            borderRadius: '16px',
                                            background: 'rgba(147, 51, 234, 0.18)',
                                            color: '#9333ea',
                                            border: '1px solid rgba(147, 51, 234, 0.4)',
                                            fontWeight: 700,
                                            fontSize: '0.78rem'
                                        }}>
                                            <span>👤 Cashier: {userFilter}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setUserFilter('ALL');
                                                    setSearchParams(prev => {
                                                        const next = new URLSearchParams(prev);
                                                        next.delete('user');
                                                        next.delete('cashier');
                                                        return next;
                                                    });
                                                }}
                                                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                title="Remove cashier filter"
                                            >
                                                <X size={13} />
                                            </button>
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ padding: '3px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={handleClearAllFilters}
                                >
                                    <RotateCcw size={12} /> Clear All Filters
                                </button>
                            </div>
                        )}

                        {/* Table Area inside Rounded Card */}
                        <div style={{ padding: '20px' }}>
                            {loading ? <Spinner text="Loading transactions..." /> : (
                                <>
                                <div className="table-container" style={{ width: '100%', overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th style={{ minWidth: '110px' }}>Order & Payment</th>
                                            <th style={{ minWidth: '150px' }}>Date & Cashier</th>
                                            <th style={{ minWidth: '250px' }}>Purchased Items</th>
                                            <th className="text-right" style={{ minWidth: '120px' }}>Total Amount</th>
                                            <th style={{ textAlign: 'center', minWidth: '95px' }}>Status</th>
                                            <th style={{ textAlign: 'center', minWidth: '200px', paddingRight: '12px' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" className="table-empty-state">No transactions match your search.</td>
                                            </tr>
                                        ) : (
                                            transactions.map(t => {
                                                const shortOrder = formatShortOrderNo(t.order_number || `SO-${t.id}`);
                                                const hasItems = t.products_included && t.products_included !== '-' && t.products_included !== 'Balance Payment';
                                                const isVoid = t.status === 'VOIDED';

                                                return (
                                                    <tr key={t.id}>
                                                        {/* 1. Order & Payment (Stacked) */}
                                                        <td>
                                                            <div
                                                                style={{
                                                                    fontWeight: 700,
                                                                    color: isVoid ? 'var(--text-muted)' : 'var(--primary)',
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.86rem',
                                                                    whiteSpace: 'nowrap'
                                                                }}
                                                                title={t.order_number || `SO-${t.id}`}
                                                            >
                                                                {shortOrder}
                                                            </div>
                                                            <div style={{ marginTop: '3px' }}>
                                                                {t.payment_method === 'Split' ? (
                                                                    <span style={{
                                                                        display: 'inline-block',
                                                                        background: 'rgba(168, 85, 247, 0.15)',
                                                                        color: '#c084fc',
                                                                        padding: '1px 6px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.68rem',
                                                                        fontWeight: 700,
                                                                        border: '1px solid rgba(168, 85, 247, 0.3)',
                                                                        whiteSpace: 'nowrap'
                                                                    }}>
                                                                        Split
                                                                    </span>
                                                                ) : t.payment_method === 'GCash' ? (
                                                                    <span style={{
                                                                        display: 'inline-block',
                                                                        background: 'rgba(59, 130, 246, 0.15)',
                                                                        color: '#3b82f6',
                                                                        padding: '1px 6px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.68rem',
                                                                        fontWeight: 700,
                                                                        border: '1px solid rgba(59, 130, 246, 0.3)',
                                                                        whiteSpace: 'nowrap'
                                                                    }}>
                                                                        GCash
                                                                    </span>
                                                                ) : (
                                                                    <span style={{
                                                                        display: 'inline-block',
                                                                        background: 'rgba(22, 163, 74, 0.12)',
                                                                        color: '#10b981',
                                                                        padding: '1px 6px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.68rem',
                                                                        fontWeight: 700,
                                                                        border: '1px solid rgba(22, 163, 74, 0.3)',
                                                                        whiteSpace: 'nowrap'
                                                                    }}>
                                                                        Cash
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* 2. Date & Cashier (Stacked) */}
                                                        <td>
                                                            <div style={{ fontSize: '0.80rem', whiteSpace: 'nowrap', color: 'var(--text-main)', fontWeight: 600 }}>
                                                                {formatAuditDate(t.sale_date)}
                                                            </div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'capitalize' }}>
                                                                by {t.cashier || 'Admin'}
                                                            </div>
                                                        </td>

                                                        {/* 3. Purchased Items (Merged Product & SKU/Category) */}
                                                        <td>
                                                            {!hasItems ? (
                                                                <div>
                                                                    <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#10b981' }}>
                                                                        Balance Payment
                                                                    </div>
                                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                                        POS Counter Settlement • BAL
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <div
                                                                        style={{
                                                                            fontWeight: 600,
                                                                            fontSize: '0.86rem',
                                                                            color: 'var(--text-main)',
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                            whiteSpace: 'nowrap',
                                                                            maxWidth: '280px'
                                                                        }}
                                                                        title={t.products_included}
                                                                    >
                                                                        {t.products_included}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                                            {t.part_numbers || t.part_number || 'GEN-PART'}
                                                                        </span>
                                                                        <span>•</span>
                                                                        <span style={{
                                                                            fontWeight: 700,
                                                                            fontSize: '0.68rem',
                                                                            padding: '1px 5px',
                                                                            borderRadius: '4px',
                                                                            background: 'rgba(255, 255, 255, 0.06)',
                                                                            border: '1px solid var(--border)',
                                                                            color: 'var(--text-muted)'
                                                                        }}>
                                                                            {getLedgerCategoryCode(t.category || t.products_included)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* 4. Total Amount (Single-line Disc/Ref) */}
                                                        <td className="text-right" style={{
                                                            fontWeight: 'bold',
                                                            color: isVoid ? 'var(--text-muted)' : '#10b981',
                                                            textDecoration: isVoid ? 'line-through' : 'none',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            <div style={{ fontSize: '0.92rem' }}>{formatCurrency(t.total_amount)}</div>
                                                            {Number(t.discount_amount) > 0 && (
                                                                <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, textDecoration: 'none', marginTop: '2px' }}>
                                                                    Disc: -{formatCurrency(t.discount_amount)}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* 5. Status (Single-Word Status Badge) */}
                                                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                            {renderStatusBadge(t)}
                                                        </td>

                                                        {/* 6. Compact Actions */}
                                                        <td style={{ textAlign: 'center', paddingRight: '12px', whiteSpace: 'nowrap' }}>
                                                            <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
                                                                <button
                                                                    onClick={() => handleViewReceipt(t.id)}
                                                                    className="btn-secondary"
                                                                    style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem' }}
                                                                    disabled={loadingReceipt}
                                                                    title="Reprint Receipt"
                                                                >
                                                                    <Printer size={13} /> Print
                                                                </button>

                                                                {!isVoid && (
                                                                    <button
                                                                        onClick={() => navigate(`/item-swap?receipt=${encodeURIComponent(t.order_number || t.id)}`)}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--primary)', borderColor: 'rgba(16, 185, 129, 0.4)', whiteSpace: 'nowrap' }}
                                                                        title="Replace Item from this Sale"
                                                                    >
                                                                        <ArrowLeftRight size={13} /> Replace Item
                                                                    </button>
                                                                )}

                                                                {!isVoid && (
                                                                    <button
                                                                        onClick={() => handleOpenVoid(t)}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', whiteSpace: 'nowrap' }}
                                                                        title="Void Sale"
                                                                    >
                                                                        <Ban size={13} /> Void Sale
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
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
                </div>
            )}

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

                        <div className="receipt-container" style={{ display: 'block', width: '100%' }}>
                            <ReceiptPrint
                                orderNumber={receiptDetails.order_number || `SO-${receiptDetails.id}`}
                                date={receiptDetails.sale_date}
                                cashier={receiptDetails.cashier}
                                customerName={receiptDetails.customer_name || ''}
                                customerAddress={receiptDetails.customer_address || ''}
                                items={receiptDetails.items || []}
                                totalAmount={receiptDetails.total_amount}
                                subtotal={receiptDetails.subtotal_amount}
                                discountAmount={receiptDetails.discount_amount}
                                vatableAmount={receiptDetails.vatable_amount || receiptDetails.subtotal_amount}
                                vatAmount={receiptDetails.vat_amount || receiptDetails.tax_amount}
                                taxAmount={receiptDetails.tax_amount || receiptDetails.vat_amount}
                                vatExemptAmount={receiptDetails.vat_exempt_amount || 0}
                                zeroRatedAmount={receiptDetails.zero_rated_amount || 0}
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
                            {receiptDetails.status !== 'VOIDED' && (
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
                                    title="Void Sale and restore all items into inventory stock"
                                >
                                    <Ban size={16} /> Void Sale
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
                currentFilterDate={filterDate || (filterStartDate && filterEndDate ? `${filterStartDate} to ${filterEndDate}` : '')}
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
                                    Void Sale {voidTarget.order_number || `SO-${voidTarget.id}`}?
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
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-main)' }}>
                                <span>Reason for Void (Mandatory): <span style={{ color: '#ef4444' }}>*</span></span>
                                {!voidReason.trim() && (
                                    <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 500 }}>Reason note required</span>
                                )}
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
                                placeholder="Enter mandatory reason note for voiding this sale..."
                                style={{
                                    width: '100%',
                                    resize: 'none',
                                    fontSize: '0.82rem',
                                    borderColor: !voidReason.trim() ? 'rgba(239, 68, 68, 0.45)' : undefined
                                }}
                                required
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
                                disabled={voiding || !voidReason.trim()}
                                style={{
                                    padding: '8px 18px',
                                    fontSize: '0.85rem',
                                    background: !voidReason.trim() ? '#991b1b' : '#dc2626',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: 600,
                                    cursor: (voiding || !voidReason.trim()) ? 'not-allowed' : 'pointer',
                                    opacity: (voiding || !voidReason.trim()) ? 0.6 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                                title={!voidReason.trim() ? 'A mandatory reason note is required to void this sale' : 'Void Sale'}
                            >
                                <Ban size={15} />
                                {voiding ? 'Voiding Sale...' : 'Void Sale'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            
        </div>
    );
};

export { Transactions };
export default Transactions;
