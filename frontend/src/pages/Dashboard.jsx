import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import {
    TrendingUp,
    AlertTriangle,
    DollarSign,
    ShoppingCart,
    Award,
    Users,
    Search,
    RefreshCw,
    History,
    Calendar,
    RotateCcw,
    Receipt,
    Package,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    X,
    Printer,
    Banknote,
    Smartphone,
    AlertCircle,
    Eye,
    ArrowRight,
    CheckCircle,
    Clock,
    CreditCard,
    MessageSquare,
    Building2,
    ShieldAlert,
    Check,
    Send,
    PackagePlus,
    ArrowDownLeft,
    ArrowUpRight,
    Truck,
    Wallet,
    XCircle,
    Ban,
    Mail,
    CheckSquare,
    Square
} from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import { getShortBrand, getLedgerCategoryCode } from '../utils/categoryTaxonomy';
import ReceiptPrint from '../components/ReceiptPrint';
import toast from 'react-hot-toast';
import { subscribeToInventoryChange } from '../utils/syncEvents';

const formatShortOrderNo = (raw) => {
    if (!raw) return '';
    const str = String(raw).trim();
    let shortened = str.replace(/^SO-\d{4}-/i, 'SO-');
    shortened = shortened.replace(/^PO-\d{4}-/i, 'PO-');
    shortened = shortened.replace(/^SO-GC-(\d+)/i, (_, p1) => `SO-GC${p1.padStart(2, '0')}`);
    shortened = shortened.replace(/^SO-BAL-(\d+)/i, (_, p1) => `SO-BAL${p1.padStart(2, '0')}`);
    shortened = shortened.replace(/^PO-COD-(\d+)/i, (_, p1) => `PO-COD${p1.padStart(2, '0')}`);
    return shortened;
};

export default function Dashboard() {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isAdmin = (user?.role || '').toLowerCase() === 'admin';

    // Confidentiality Protection: Staff/Cashiers must never view store revenue and financials
    useEffect(() => {
        if (user && (user.role || '').toLowerCase() !== 'admin') {
            navigate('/pos', { replace: true });
        }
    }, [user, navigate]);

    // ==========================================
    // 1. TIMEFRAME & DATE FILTER STATE
    // ==========================================
    // 'today' | 'week' | 'month' | 'custom'
    const [timeframe, setTimeframe] = useState('today');

    const getPHTToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

    const [customStartDate, setCustomStartDate] = useState(() => getPHTToday());
    const [customEndDate, setCustomEndDate] = useState(() => getPHTToday());

    // Compute effective date bounds for display & queries
    const dateRange = useMemo(() => {
        const todayStr = getPHTToday();
        const now = new Date();

        if (timeframe === 'today') {
            return {
                start: todayStr,
                end: todayStr,
                label: `Today (${todayStr})`,
                periodTitle: "Today's"
            };
        } else if (timeframe === 'week') {
            const past7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
            const startStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(past7);
            return {
                start: startStr,
                end: todayStr,
                label: `This Week (${startStr} to ${todayStr})`,
                periodTitle: "This Week's"
            };
        } else if (timeframe === 'month') {
            const startStr = `${todayStr.slice(0, 7)}-01`;
            return {
                start: startStr,
                end: todayStr,
                label: `This Month (${startStr} to ${todayStr})`,
                periodTitle: "This Month's"
            };
        } else {
            const startStr = customStartDate || todayStr;
            const endStr = customEndDate || todayStr;
            return {
                start: startStr,
                end: endStr,
                label: `Custom (${startStr} to ${endStr})`,
                periodTitle: "Period"
            };
        }
    }, [timeframe, customStartDate, customEndDate]);

    // Helpers to navigate to POS Sales History or Transactions with active timeframe and date bounds
    const navigateToSalesHistory = (extraParams = {}) => {
        const params = new URLSearchParams();
        params.set('tab', 'history');
        if (timeframe === 'today') {
            params.set('date', 'today');
        } else {
            params.set('timeframe', timeframe);
            if (dateRange.start) params.set('startDate', dateRange.start);
            if (dateRange.end) params.set('endDate', dateRange.end);
        }
        Object.entries(extraParams).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
                params.set(k, v);
            }
        });
        navigate(`/pos?${params.toString()}`);
    };

    const navigateToTransactions = (extraParams = {}) => {
        const params = new URLSearchParams();
        if (timeframe === 'today') {
            params.set('date', 'today');
        } else {
            params.set('timeframe', timeframe);
            if (dateRange.start) params.set('startDate', dateRange.start);
            if (dateRange.end) params.set('endDate', dateRange.end);
        }
        Object.entries(extraParams).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
                params.set(k, v);
            }
        });
        navigate(`/transactions?${params.toString()}`);
    };

    // ==========================================
    // 2. DASHBOARD KPI SUMMARY STATE
    // ==========================================
    const [kpiSummary, setKpiSummary] = useState({
        sales: {
            total_revenue: 0,
            total_profit: 0,
            total_transactions: 0,
            cash_revenue: 0,
            cash_transactions: 0,
            cash_profit: 0,
            gcash_revenue: 0,
            gcash_transactions: 0,
            gcash_profit: 0
        },
        void_return: { void_count: 0, void_amount: 0, return_count: 0, return_amount: 0, total_count: 0, total_amount: 0 },
        discounts: { discount_count: 0, total_discounts: 0 },
        low_stock_count: 0
    });
    const [loadingKPI, setLoadingKPI] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    const activeKPI = useMemo(() => {
        const sales = kpiSummary.sales || {};
        return {
            revenue: sales.total_revenue || 0,
            transactions: sales.total_transactions || 0,
            profit: sales.total_profit || 0,
            label: 'All Payments'
        };
    }, [kpiSummary.sales]);

    // ==========================================
    // 3. OWNER COMMAND CENTER DATA
    // Low Stock Alerts & Recent Voided Sales Tracker
    // ==========================================
    const [ownerData, setOwnerData] = useState({
        low_stock_alerts: [],
        returns_voids_tracker: {
            all_records: [],
            voids: [],
            total_events_count: 0,
            total_voids_count: 0,
            total_voided_amount: 0,
            total_items_restored: 0
        }
    });
    const [loadingOwnerData, setLoadingOwnerData] = useState(false);

    // Active Search inside Recent Voided Sales
    const [returnsVoidsTab, setReturnsVoidsTab] = useState('all');
    const [returnsVoidsSearchQuery, setReturnsVoidsSearchQuery] = useState('');
    const [isReturnsVoidsSearchFocused, setIsReturnsVoidsSearchFocused] = useState(false);

    // Flag / Reject Pending Payment Modal State
    const [flaggingTarget, setFlaggingTarget] = useState(null);
    const [flagReason, setFlagReason] = useState('');
    const [flagSubmitting, setFlagSubmitting] = useState(false);

    // Quick Purchase Order Modal State (from Low Stock Alert)
    const [quickPOModal, setQuickPOModal] = useState(null);
    const [poSubmitting, setPoSubmitting] = useState(false);
    const [poFormData, setPoFormData] = useState({
        quantity: 5,
        unit_cost: 0,
        shipping_fee: 0,
        courier_name: 'Lalamove',
        notes: ''
    });

    // ==========================================
    // STAFF RESTOCK REQUESTS & ADMIN APPROVALS
    // ==========================================
    // 1. Staff Submit Restock Request Modal
    const [restockModalItem, setRestockModalItem] = useState(null);
    const [restockFormData, setRestockFormData] = useState({
        requested_qty: 5,
        priority: 'NORMAL',
        notes: ''
    });
    const [restockSubmitting, setRestockSubmitting] = useState(false);

    // Multi-select & Bulk Restock Request State (Staff Choice of Multi-select or ALL)
    const [selectedLowStockIds, setSelectedLowStockIds] = useState([]);
    const [bulkRestockModalOpen, setBulkRestockModalOpen] = useState(false);
    const [bulkRestockItems, setBulkRestockItems] = useState([]);
    const [bulkRestockPriority, setBulkRestockPriority] = useState('NORMAL');
    const [bulkRestockNotes, setBulkRestockNotes] = useState('');
    const [bulkRestockSubmitting, setBulkRestockSubmitting] = useState(false);

    // 2. Admin Approve Restock Request Modal
    const [approvingRestockModal, setApprovingRestockModal] = useState(null);
    const [approvingRestockFormData, setApprovingRestockFormData] = useState({
        approved_qty: 5,
        courier_name: 'Lalamove',
        shipping_fee: 0,
        admin_notes: '',
        create_po: true
    });
    const [approvingRestockSubmitting, setApprovingRestockSubmitting] = useState(false);

    // 3. Admin Reject Restock Request Modal
    const [rejectingRestockModal, setRejectingRestockModal] = useState(null);
    const [rejectingReason, setRejectingReason] = useState('');
    const [rejectingSubmitting, setRejectingSubmitting] = useState(false);

    // 4. Restock Requests List, Stats & Tabs
    const [restockRequestsList, setRestockRequestsList] = useState([]);
    const [restockStats, setRestockStats] = useState({ total_count: 0, pending_count: 0, approved_count: 0, rejected_count: 0, approved_today: 0 });
    const [restockFilterTab, setRestockFilterTab] = useState('PENDING');

    // Supplier Payment Approval Modal State
    const [approvingOrder, setApprovingOrder] = useState(null);
    const [approvalRefNo, setApprovalRefNo] = useState('');
    const [approvingSubmitting, setApprovingSubmitting] = useState(false);

    // Verifying Customer GCash loading map
    const [verifyingSaleId, setVerifyingSaleId] = useState(null);

    // Staff Cash Float Integration
    const [myCashFloat, setMyCashFloat] = useState(null);
    const [loadingMyFloat, setLoadingMyFloat] = useState(false);

    // Table lists & filters
    const [counterList, setCounterList] = useState([]);
    const [counterLoading, setCounterLoading] = useState(false);
    const [counterPage, setCounterPage] = useState(1);
    const [counterPerPage, setCounterPerPage] = useState(5);
    const [counterTotal, setCounterTotal] = useState(0);

    const [bestSellingList, setBestSellingList] = useState([]);
    const [bestSellingLoading, setBestSellingLoading] = useState(false);
    const [bestSellingPeriod, setBestSellingPeriod] = useState('daily');
    const [bestSellingBrand, setBestSellingBrand] = useState('All');
    const [brandsList, setBrandsList] = useState([]);

    const [staffToday, setStaffToday] = useState([]);
    const [staffPeriod, setStaffPeriod] = useState('today');

    // Low stock search
    const [lowStockSearch, setLowStockSearch] = useState('');

    // Receipt Modal State
    const [selectedReceiptSaleId, setSelectedReceiptSaleId] = useState(null);
    const [receiptDetails, setReceiptDetails] = useState(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);

    // ==========================================
    // DATA FETCHING FUNCTIONS
    // ==========================================
    // 1. Fetch Top 5 KPI Summary Cards & Cash/GCash Totals
    const fetchKPISummary = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoadingKPI(true);
        try {
            const res = await api.get('/reports/dashboard-summary', {
                params: {
                    timeframe,
                    startDate: dateRange.start,
                    endDate: dateRange.end
                }
            });
            if (res.data?.success) {
                setKpiSummary(res.data);
            }
        } catch (err) {
            console.error('Failed to load dashboard KPI summary:', err);
        } finally {
            if (!isSilent) setLoadingKPI(false);
        }
    }, [timeframe, dateRange.start, dateRange.end]);

    // 2. Fetch Alerts & Approvals (Low stock for all, Payments for Admin)
    const fetchOwnerAlerts = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoadingOwnerData(true);
        try {
            const res = await api.get('/reports/owner-dashboard');
            if (res.data?.success) {
                setOwnerData(res.data);
            }
        } catch (err) {
            console.error('Failed to load alerts data:', err);
        } finally {
            if (!isSilent) setLoadingOwnerData(false);
        }
    }, []);

    // 3. Fetch Staff Cash Float (My Starting Panukli)
    const fetchMyCashFloat = useCallback(async (isSilent = false) => {
        try {
            if (!isSilent) setLoadingMyFloat(true);
            const res = await api.get('/cash-float/my-float');
            setMyCashFloat(res.data?.activeFloat || null);
        } catch (err) {
            console.error('Failed to fetch my cash float:', err);
        } finally {
            if (!isSilent) setLoadingMyFloat(false);
        }
    }, []);

    // 4. Fetch Recent Counter Activity
    const fetchRecentCounter = useCallback(async (targetPage = counterPage, customLimit = counterPerPage, isSilent = false) => {
        if (!isSilent) setCounterLoading(true);
        try {
            const params = {
                page: targetPage,
                limit: customLimit,
                startDate: dateRange.start,
                endDate: dateRange.end
            };
            if (!isAdmin) {
                params.selfOnly = 'true';
            }
            const res = await api.get('/sales', { params });
            const data = res.data;
            if (data?.data && Array.isArray(data.data)) {
                setCounterList(data.data);
                setCounterTotal(data.pagination?.total || data.data.length);
            } else if (Array.isArray(data)) {
                setCounterList(data);
                setCounterTotal(data.length);
            }
        } catch (err) {
            console.error('Failed to load recent counter activity:', err);
        } finally {
            if (!isSilent) setCounterLoading(false);
        }
    }, [counterPage, counterPerPage, dateRange.start, dateRange.end, isAdmin]);

    // 5. Fetch Best Selling Parts (Top 5 fast-moving items)
    const fetchBestSelling = useCallback(async (isSilent = false) => {
        if (!isSilent) setBestSellingLoading(true);
        try {
            const params = {
                period: bestSellingPeriod,
                limit: 5
            };
            if (bestSellingBrand && bestSellingBrand !== 'All') {
                params.brand = bestSellingBrand;
            }
            const res = await api.get('/reports/best-selling', { params });
            setBestSellingList(Array.isArray(res.data) ? res.data.slice(0, 5) : []);
        } catch (err) {
            console.error('Failed to load best selling products:', err);
        } finally {
            if (!isSilent) setBestSellingLoading(false);
        }
    }, [bestSellingPeriod, bestSellingBrand]);

    // 6. Fetch Staff Performance
    const fetchStaffStats = useCallback(async () => {
        if (!isAdmin) return;
        try {
            const res = await api.get('/reports/staff-today');
            setStaffToday(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Failed to load staff performance stats:', err);
        }
    }, [isAdmin]);

    // Load available brands for best selling filter
    useEffect(() => {
        let isMounted = true;
        const loadBrands = async () => {
            try {
                const res = await api.get('/reports/brands');
                if (isMounted && Array.isArray(res.data) && res.data.length > 0) {
                    setBrandsList(res.data);
                }
            } catch (err) {
                console.error('Failed to load brands for filter:', err);
            }
        };
        loadBrands();
        return () => { isMounted = false; };
    }, []);

    // When best selling filter dropdowns change, re-fetch best selling
    useEffect(() => {
        fetchBestSelling(false);
    }, [bestSellingPeriod, bestSellingBrand]);

    // Fetch Restock Requests Queue & History
    const fetchRestockRequests = useCallback(async () => {
        try {
            const res = await api.get('/restock-requests');
            if (res.data?.success) {
                setRestockRequestsList(res.data.data || []);
                setRestockStats(res.data.stats || { total_count: 0, pending_count: 0, approved_count: 0, rejected_count: 0, approved_today: 0 });
            }
        } catch (err) {
            console.error('Failed to load restock requests:', err);
        }
    }, []);

    // Master Refresh
    const fetchAllDashboardData = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsRefreshing(true);
        try {
            await Promise.all([
                fetchKPISummary(isSilent),
                fetchOwnerAlerts(isSilent),
                fetchRestockRequests(),
                fetchMyCashFloat(isSilent),
                fetchRecentCounter(counterPage, counterPerPage, isSilent),
                fetchBestSelling(isSilent),
                fetchStaffStats()
            ]);
            setLastUpdated(new Date());
        } finally {
            if (!isSilent) setIsRefreshing(false);
        }
    }, [fetchKPISummary, fetchOwnerAlerts, fetchRestockRequests, fetchMyCashFloat, fetchRecentCounter, fetchBestSelling, fetchStaffStats, counterPage, counterPerPage]);

    // Primary initial fetch & when date filter changes
    useEffect(() => {
        fetchAllDashboardData(false);
    }, [timeframe, dateRange.start, dateRange.end]);

    // Reset pagination when date filter changes
    useEffect(() => {
        setCounterPage(1);
    }, [timeframe, customStartDate, customEndDate]);

    // Live cross-tab sync and background polling (silent heartbeat, no UI flashing)
    useEffect(() => {
        const unsubscribe = subscribeToInventoryChange(() => {
            fetchAllDashboardData(true);
        });

        // 8-second gentle silent polling so numbers stay up-to-date in real time without flashing UI
        const pollInterval = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchAllDashboardData(true);
        }, 8000);

        return () => {
            unsubscribe();
            clearInterval(pollInterval);
        };
    }, [fetchAllDashboardData]);

    // ==========================================
    // OWNER ACTIONS: PENDING PAYMENTS CLEARANCE
    // ==========================================
    const handleVerifyCustomerGCash = async (saleId) => {
        setVerifyingSaleId(saleId);
        try {
            const res = await api.post(`/reports/verify-customer-gcash/${saleId}`);
            toast.success(res.data?.message || 'Customer GCash payment verified and confirmed in wallet!');
            fetchOwnerAlerts(true);
            fetchKPISummary();
        } catch (err) {
            console.error('Failed to verify customer GCash payment:', err);
            toast.error(err.response?.data?.message || 'Failed to verify payment');
        } finally {
            setVerifyingSaleId(null);
        }
    };

    const handleRejectCustomerGCash = async (saleId, reason) => {
        try {
            const res = await api.post(`/reports/reject-customer-gcash/${saleId}`, { reason });
            toast.success(res.data?.message || 'Customer GCash payment flagged as unverified');
            fetchOwnerAlerts(true);
        } catch (err) {
            console.error('Failed to flag GCash payment:', err);
            toast.error(err.response?.data?.message || 'Failed to flag payment');
        }
    };

    const handleSettleCustomerBalance = async (saleId) => {
        try {
            const res = await api.post(`/reports/settle-customer-balance/${saleId}`);
            toast.success(res.data?.message || 'Customer balance settled and marked as paid!');
            fetchOwnerAlerts(true);
            fetchKPISummary();
        } catch (err) {
            console.error('Failed to settle customer balance:', err);
            toast.error(err.response?.data?.message || 'Failed to settle balance');
        }
    };

    const handleOpenApprovePO = (order) => {
        setApprovingOrder(order);
        setApprovalRefNo('');
    };

    const handleConfirmApprovePO = async () => {
        if (!approvingOrder) return;
        setApprovingSubmitting(true);
        try {
            const res = await api.post(`/reports/approve-supplier-po-payment/${approvingOrder.order_id}`, {
                payment_reference: approvalRefNo.trim() || undefined
            });
            toast.success(res.data?.message || 'Supplier PO payment approved and released!');
            setApprovingOrder(null);
            fetchOwnerAlerts(true);
        } catch (err) {
            console.error('Failed to approve supplier PO payment:', err);
            toast.error(err.response?.data?.message || 'Failed to approve payment');
        } finally {
            setApprovingSubmitting(false);
        }
    };

    const handleRejectSupplierPO = async (orderId, reason) => {
        try {
            const res = await api.post(`/reports/reject-supplier-po-payment/${orderId}`, { reason });
            toast.success(res.data?.message || 'Supplier PO payment rejected');
            fetchOwnerAlerts(true);
        } catch (err) {
            console.error('Failed to reject supplier PO:', err);
            toast.error(err.response?.data?.message || 'Failed to reject PO');
        }
    };

    const handleConfirmCODPayout = async (orderId) => {
        try {
            const res = await api.post(`/reports/confirm-supplier-cod/${orderId}`);
            toast.success(res.data?.message || 'COD delivery confirmed and cash payout recorded!');
            fetchOwnerAlerts(true);
        } catch (err) {
            console.error('Failed to confirm COD payout:', err);
            toast.error(err.response?.data?.message || 'Failed to confirm COD payout');
        }
    };

    const handleConfirmFlagging = async () => {
        if (!flaggingTarget) return;
        setFlagSubmitting(true);
        try {
            if (flaggingTarget.type === 'gcash') {
                await handleRejectCustomerGCash(flaggingTarget.id, flagReason);
            } else if (flaggingTarget.type === 'supplier') {
                await handleRejectSupplierPO(flaggingTarget.id, flagReason);
            } else if (flaggingTarget.type === 'cod') {
                await handleRejectSupplierPO(flaggingTarget.id, flagReason);
            } else if (flaggingTarget.type === 'balance') {
                await handleRejectCustomerGCash(flaggingTarget.id, flagReason);
            }
            setFlaggingTarget(null);
            setFlagReason('');
        } finally {
            setFlagSubmitting(false);
        }
    };

    const handleOpenQuickPO = (item) => {
        setQuickPOModal(item);
        setPoFormData({
            quantity: item.suggested_order_qty || Math.max(1, (item.reorder_level || 5) * 2),
            unit_cost: Number(item.cost_price || 0),
            shipping_fee: 0,
            courier_name: 'Lalamove',
            notes: `Restock PO for ${item.part_number} - ${item.product_name}`
        });
    };

    const handleCreateQuickPO = async (e) => {
        e.preventDefault();
        if (!quickPOModal) return;
        if (Number(poFormData.quantity) <= 0) {
            toast.error('Quantity must be greater than 0');
            return;
        }

        setPoSubmitting(true);
        try {
            const res = await api.post('/reports/create-quick-po', {
                product_id: quickPOModal.id,
                supplier_id: quickPOModal.supplier_id || null,
                quantity: Number(poFormData.quantity),
                unit_cost: Number(poFormData.unit_cost),
                shipping_fee: Number(poFormData.shipping_fee || 0),
                courier_name: poFormData.courier_name || 'Lalamove',
                notes: poFormData.notes || ''
            });

            toast.success(res.data?.message || 'Purchase Order created successfully!');
            setQuickPOModal(null);
            fetchOwnerAlerts(true);
        } catch (err) {
            console.error('Failed to create quick PO:', err);
            toast.error(err.response?.data?.message || 'Failed to create Purchase Order');
        } finally {
            setPoSubmitting(false);
        }
    };

    // ==========================================
    // RESTOCK REQUEST HANDLERS (STAFF & ADMIN)
    // ==========================================
    const handleOpenRestockRequest = (item) => {
        const stockQty = Number(item.sellable_stock ?? item.stock ?? 0);
        const reorderLvl = Number(item.reorder_level || 5);
        const suggestedQty = item.suggested_order_qty || Math.max(1, (reorderLvl * 2) - stockQty);

        setRestockModalItem(item);
        setRestockFormData({
            requested_qty: suggestedQty,
            priority: stockQty <= 0 ? 'URGENT' : 'NORMAL',
            notes: ''
        });
    };

    const handleSubmitRestockRequest = async (e) => {
        e.preventDefault();
        if (!restockModalItem) return;
        const qtyNum = parseInt(restockFormData.requested_qty, 10);
        if (isNaN(qtyNum) || qtyNum <= 0) {
            toast.error('Requested quantity must be at least 1');
            return;
        }

        setRestockSubmitting(true);
        try {
            const res = await api.post('/restock-requests', {
                product_id: restockModalItem.id,
                requested_qty: qtyNum,
                priority: restockFormData.priority,
                notes: (restockFormData.notes || '').trim()
            });

            toast.success(res.data?.message || 'Restock request submitted to Admin for approval!');
            setRestockModalItem(null);
            fetchOwnerAlerts(true);
            fetchRestockRequests();
        } catch (err) {
            console.error('Failed to submit restock request:', err);
            toast.error(err.response?.data?.message || 'Failed to submit restock request');
        } finally {
            setRestockSubmitting(false);
        }
    };

    // Selection handlers for staff low-stock restock requests (Multi-select or ALL)
    const handleToggleSelectLowStock = (productId) => {
        setSelectedLowStockIds(prev => 
            prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
        );
    };

    const handleSelectAllFilteredLowStock = () => {
        const selectableIds = filteredLowStock
            .filter(item => !item.restock_request_id && item.restock_request_status !== 'PENDING')
            .map(item => item.id || item.product_id);
        
        if (selectedLowStockIds.length === selectableIds.length && selectableIds.length > 0) {
            setSelectedLowStockIds([]);
        } else {
            setSelectedLowStockIds(selectableIds);
        }
    };

    const handleOpenBulkRestockModal = (itemsToInclude = null) => {
        let targets = [];
        if (itemsToInclude && Array.isArray(itemsToInclude)) {
            targets = itemsToInclude;
        } else if (selectedLowStockIds.length > 0) {
            targets = filteredLowStock.filter(item => selectedLowStockIds.includes(item.id || item.product_id));
        } else {
            // Default to all selectable low-stock items
            targets = filteredLowStock.filter(item => !item.restock_request_id && item.restock_request_status !== 'PENDING');
        }

        if (targets.length === 0) {
            toast.error('No selectable low-stock items to request restock for.');
            return;
        }

        const preparedItems = targets.map(item => {
            const stockQty = Number(item.sellable_stock ?? item.stock ?? 0);
            const reorderLvl = Number(item.reorder_level || 5);
            const defaultQty = item.suggested_order_qty || Math.max(1, (reorderLvl * 2) - stockQty);
            return {
                ...item,
                product_id: item.id || item.product_id,
                requested_qty: defaultQty
            };
        });

        const hasOutOfStock = targets.some(item => Number(item.sellable_stock ?? item.stock ?? 0) <= 0);

        setBulkRestockItems(preparedItems);
        setBulkRestockPriority(hasOutOfStock ? 'URGENT' : 'NORMAL');
        setBulkRestockNotes('');
        setBulkRestockModalOpen(true);
    };

    const handleBulkItemQtyChange = (productId, newQty) => {
        const parsed = parseInt(newQty, 10);
        setBulkRestockItems(prev => prev.map(item => {
            if ((item.id || item.product_id) === productId) {
                return { ...item, requested_qty: isNaN(parsed) ? '' : Math.max(1, parsed) };
            }
            return item;
        }));
    };

    const handleBulkItemRemove = (productId) => {
        setBulkRestockItems(prev => {
            const next = prev.filter(item => (item.id || item.product_id) !== productId);
            if (next.length === 0) {
                setBulkRestockModalOpen(false);
            }
            return next;
        });
        setSelectedLowStockIds(prev => prev.filter(id => id !== productId));
    };

    const handleSubmitBulkRestock = async (e) => {
        e.preventDefault();
        if (bulkRestockItems.length === 0) {
            toast.error('No items selected for restock');
            return;
        }

        for (const item of bulkRestockItems) {
            const qtyNum = parseInt(item.requested_qty, 10);
            if (isNaN(qtyNum) || qtyNum <= 0) {
                toast.error(`Please provide a valid quantity for ${item.product_name || item.part_number}`);
                return;
            }
        }

        setBulkRestockSubmitting(true);
        try {
            const payload = {
                priority: bulkRestockPriority,
                notes: bulkRestockNotes.trim() || undefined,
                items: bulkRestockItems.map(item => ({
                    product_id: item.id || item.product_id,
                    requested_qty: parseInt(item.requested_qty, 10),
                    notes: bulkRestockNotes.trim() || undefined
                }))
            };

            const res = await api.post('/restock-requests', payload);
            toast.success(res.data?.message || `Submitted restock request for ${bulkRestockItems.length} items! Owner notified via Gmail.`);
            setBulkRestockModalOpen(false);
            setSelectedLowStockIds([]);
            fetchOwnerAlerts(true);
            fetchRestockRequests();
        } catch (err) {
            console.error('Failed to submit bulk restock request:', err);
            toast.error(err.response?.data?.message || 'Failed to submit bulk restock request');
        } finally {
            setBulkRestockSubmitting(false);
        }
    };

    const handleOpenApproveRestock = (itemOrRequest) => {
        const isFromAlertTable = !itemOrRequest.requested_qty && itemOrRequest.restock_requested_qty;
        const reqId = itemOrRequest.restock_request_id || itemOrRequest.id;
        const qty = isFromAlertTable ? itemOrRequest.restock_requested_qty : itemOrRequest.requested_qty;
        const pName = itemOrRequest.product_name;
        const pSku = itemOrRequest.part_number;
        const sName = itemOrRequest.supplier_name || itemOrRequest.current_supplier_name || 'Generic / FB Supplier';
        const staff = itemOrRequest.restock_staff_name || itemOrRequest.staff_name || 'Staff';
        const uCost = Number(itemOrRequest.cost_price || itemOrRequest.unit_cost || 0);

        setApprovingRestockModal({
            id: reqId,
            product_id: itemOrRequest.product_id || itemOrRequest.id,
            part_number: pSku,
            product_name: pName,
            supplier_name: sName,
            staff_name: staff,
            unit_cost: uCost,
            requested_qty: qty,
            priority: itemOrRequest.restock_priority || itemOrRequest.priority || 'NORMAL',
            notes: itemOrRequest.restock_notes || itemOrRequest.notes || ''
        });

        setApprovingRestockFormData({
            approved_qty: qty || 5,
            courier_name: 'Lalamove',
            shipping_fee: 0,
            admin_notes: `Approved restock request by ${staff}.`,
            create_po: true
        });
    };

    const handleConfirmApproveRestock = async (e) => {
        e.preventDefault();
        if (!approvingRestockModal) return;

        setApprovingRestockSubmitting(true);
        try {
            const res = await api.post(`/restock-requests/${approvingRestockModal.id}/approve`, {
                approved_qty: Number(approvingRestockFormData.approved_qty),
                courier_name: approvingRestockFormData.courier_name,
                shipping_fee: Number(approvingRestockFormData.shipping_fee || 0),
                admin_notes: (approvingRestockFormData.admin_notes || '').trim(),
                create_po: approvingRestockFormData.create_po
            });

            toast.success(res.data?.message || 'Restock request approved and Purchase Order created!');
            setApprovingRestockModal(null);
            fetchOwnerAlerts(true);
            fetchRestockRequests();
        } catch (err) {
            console.error('Failed to approve restock request:', err);
            toast.error(err.response?.data?.message || 'Failed to approve restock request');
        } finally {
            setApprovingRestockSubmitting(false);
        }
    };

    const handleOpenRejectRestock = (itemOrRequest) => {
        const reqId = itemOrRequest.restock_request_id || itemOrRequest.id;
        setRejectingRestockModal({
            id: reqId,
            part_number: itemOrRequest.part_number,
            product_name: itemOrRequest.product_name,
            staff_name: itemOrRequest.restock_staff_name || itemOrRequest.staff_name || 'Staff'
        });
        setRejectingReason('');
    };

    const handleConfirmRejectRestock = async (e) => {
        e.preventDefault();
        if (!rejectingRestockModal) return;

        setRejectingSubmitting(true);
        try {
            const res = await api.post(`/restock-requests/${rejectingRestockModal.id}/reject`, {
                reason: rejectingReason.trim() || 'Declined by Admin'
            });

            toast.success(res.data?.message || 'Restock request declined.');
            setRejectingRestockModal(null);
            fetchOwnerAlerts(true);
            fetchRestockRequests();
        } catch (err) {
            console.error('Failed to decline restock request:', err);
            toast.error(err.response?.data?.message || 'Failed to decline restock request');
        } finally {
            setRejectingSubmitting(false);
        }
    };

    // Handle Receipt Modal Lookup
    const handleViewReceipt = async (saleId) => {
        setSelectedReceiptSaleId(saleId);
        setLoadingReceipt(true);
        try {
            const res = await api.get(`/sales/${saleId}`);
            setReceiptDetails(res.data);
        } catch (err) {
            console.error('Failed to load receipt details:', err);
        } finally {
            setLoadingReceipt(false);
        }
    };

    // Filter low stock list by search
    const filteredLowStock = useMemo(() => {
        const list = ownerData.low_stock_alerts || [];
        if (!lowStockSearch.trim()) return list;
        const q = lowStockSearch.toLowerCase();
        return list.filter(item =>
            (item.part_number || '').toLowerCase().includes(q) ||
            (item.product_name || '').toLowerCase().includes(q) ||
            (item.supplier_name || '').toLowerCase().includes(q) ||
            (item.brand || '').toLowerCase().includes(q)
        );
    }, [ownerData.low_stock_alerts, lowStockSearch]);

    // Selectable low-stock items that do not yet have a pending restock request
    const selectableLowStockItems = useMemo(() => {
        return filteredLowStock.filter(item => !item.restock_request_id && item.restock_request_status !== 'PENDING');
    }, [filteredLowStock]);

    const returnsTracker = ownerData.returns_voids_tracker || {
        all_records: [],
        voids: [],
        total_events_count: 0,
        total_voids_count: 0,
        total_voided_amount: 0,
        total_items_restored: 0
    };

    const filteredReturnsVoids = useMemo(() => {
        let list = returnsTracker.all_records || returnsTracker.voids || [];
        if (returnsVoidsTab === 'voids') {
            list = returnsTracker.voids || [];
        }

        const query = returnsVoidsSearchQuery.trim().toLowerCase();
        if (!query) return list;

        return list.filter(item => {
            const ref = String(item.return_number || item.order_number || item.id || '').toLowerCase();
            const cashier = String(item.cashier_name || '').toLowerCase();
            const reason = String(item.reason || '').toLowerCase();
            const items = String(item.items_summary || '').toLowerCase();
            const type = String(item.type_label || '').toLowerCase();
            return ref.includes(query) || cashier.includes(query) || reason.includes(query) || items.includes(query) || type.includes(query);
        });
    }, [returnsTracker, returnsVoidsTab, returnsVoidsSearchQuery]);

    return (
        <div style={{ position: 'relative', height: '100%', paddingBottom: '30px' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isAdmin ? 'Admin Dashboard' : 'Staff Counter Dashboard'}
                    </h1>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        {isAdmin
                            ? "Overview of today's sales, cashier transactions, and low stock."
                            : `Welcome back, ${user?.username || 'Staff'}. Review counter transactions and inventory metrics.`}
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        <span className="live-pulse-dot" />
                        <span>Live Sync {lastUpdated ? `• ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchAllDashboardData(false)}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.82rem' }}
                        disabled={isRefreshing}
                        title="Force refresh live dashboard data"
                    >
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* ========================================== */}
            {/* TIMEFRAME SELECTOR BAR */}
            {/* Today | This Week | This Month | Custom Date */}
            {/* ========================================== */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '12px',
                background: 'var(--surface)',
                padding: '12px 18px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                boxShadow: 'var(--glass-shadow)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }}>
                        <Calendar size={16} color="var(--primary)" /> Timeframe:
                    </span>
                    {[
                        { key: 'today', label: 'Today' },
                        { key: 'week', label: 'This Week' },
                        { key: 'month', label: 'This Month' },
                        { key: 'custom', label: 'Custom Date' }
                    ].map(tf => {
                        const active = timeframe === tf.key;
                        return (
                            <button
                                key={tf.key}
                                type="button"
                                onClick={() => setTimeframe(tf.key)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    border: '1px solid',
                                    borderColor: active ? 'var(--primary)' : 'var(--border)',
                                    background: active ? 'var(--primary)' : 'var(--surface)',
                                    color: active ? '#ffffff' : 'var(--text-main)',
                                    fontWeight: active ? 700 : 500,
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {tf.label}
                            </button>
                        );
                    })}
                </div>

                {/* Custom Date Inputs */}
                {timeframe === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                            type="date"
                            className="input-premium"
                            style={{ padding: '5px 10px', fontSize: '0.82rem' }}
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>to</span>
                        <input
                            type="date"
                            className="input-premium"
                            style={{ padding: '5px 10px', fontSize: '0.82rem' }}
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                        />
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => fetchAllDashboardData(false)}
                            style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                        >
                            Apply
                        </button>
                    </div>
                )}

                {/* Active Date Indicator */}
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Active Period:</span>
                    <strong style={{ color: 'var(--primary)' }}>{dateRange.label}</strong>
                </div>
            </div>

            {/* ============================================================ */}
            {/* CASH SALES | GCASH SALES | TOTAL SALES                      */}
            {/* 3 Standalone Direct-Link KPI Cards (Identical Box Styling)   */}
            {/* ============================================================ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '12px',
                marginBottom: '16px'
            }}>
                {/* 1. Cash Sales */}
                <div
                    onClick={() => navigateToSalesHistory({ paymentMethod: 'CASH' })}
                    className="dashboard-payment-card-cash"
                    style={{
                        background: 'var(--surface)',
                        border: '1.5px solid #16a34a',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        boxShadow: 'var(--glass-shadow)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '110px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.18)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--glass-shadow)'; }}
                    title="Click to view Cash Sales in Sales History"
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            {dateRange.periodTitle} Cash Sales
                        </span>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(22, 163, 74, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#16a34a'
                        }}>
                            <Banknote size={18} />
                        </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1 }}>
                            {loadingKPI ? '...' : formatCurrency(kpiSummary.sales?.cash_revenue || 0)}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {kpiSummary.sales?.cash_transactions || 0} Cash sales made
                        </div>
                    </div>
                </div>

                {/* 2. GCash Sales */}
                <div
                    onClick={() => navigateToSalesHistory({ paymentMethod: 'GCASH' })}
                    className="dashboard-payment-card-gcash"
                    style={{
                        background: 'var(--surface)',
                        border: '1.5px solid #2563eb',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        boxShadow: 'var(--glass-shadow)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '110px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.18)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--glass-shadow)'; }}
                    title="Click to view GCash Sales in Sales History"
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            {dateRange.periodTitle} GCash Sales
                        </span>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(37, 99, 235, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#2563eb'
                        }}>
                            <Smartphone size={18} />
                        </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1 }}>
                            {loadingKPI ? '...' : formatCurrency(kpiSummary.sales?.gcash_revenue || 0)}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {kpiSummary.sales?.gcash_transactions || 0} GCash sales made
                        </div>
                    </div>
                </div>

                {/* 3. Total Sales */}
                <div
                    onClick={() => navigateToSalesHistory({ paymentMethod: 'ALL' })}
                    className="dashboard-payment-card-total"
                    style={{
                        background: 'var(--surface)',
                        border: '1.5px solid #9333ea',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        boxShadow: 'var(--glass-shadow)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '110px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(147, 51, 234, 0.18)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--glass-shadow)'; }}
                    title="Click to view All Sales in Sales History"
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            {dateRange.periodTitle} Total Sales
                        </span>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(147, 51, 234, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#9333ea'
                        }}>
                            <TrendingUp size={18} />
                        </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1 }}>
                            {loadingKPI ? '...' : formatCurrency(kpiSummary.sales?.total_revenue || 0)}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {kpiSummary.sales?.total_transactions || 0} total sales made
                        </div>
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* OPERATIONAL KPI CARDS (ROUNDED BORDER & COLORED)             */}
            {/* Today's Profit | Tx | Void / Return | Low Stock              */}
            {/* ============================================================ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: isAdmin ? 'repeat(4, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
                gap: '12px',
                marginBottom: '24px'
            }}>

                {/* 2. Today's Profit (Admin only - Hidden for Staff) */}
                {isAdmin && (
                    <div style={{
                        background: 'var(--surface)',
                        border: '1.5px solid #10b981',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        boxShadow: 'var(--glass-shadow)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '110px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                {dateRange.periodTitle} Profit
                            </span>
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: 'rgba(16, 185, 129, 0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#10b981'
                            }}>
                                <DollarSign size={18} />
                            </div>
                        </div>
                        <div style={{ marginTop: '8px' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981', lineHeight: 1.1 }}>
                                {loadingKPI ? '...' : formatCurrency(activeKPI.profit)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Total sales minus item cost (Puhunan)
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Transaction Today */}
                <div
                    onClick={() => navigateToSalesHistory()}
                    className="dashboard-kpi-card-tx-today"
                    style={{
                        background: 'var(--surface)',
                        border: '1.5px solid #0284c7',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        boxShadow: 'var(--glass-shadow)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '110px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(2, 132, 199, 0.18)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--glass-shadow)'; }}
                    title={`Click to view ${dateRange.periodTitle} Transactions in Sales History`}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Transactions {dateRange.periodTitle}
                        </span>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(2, 132, 199, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#0284c7'
                        }}>
                            <ShoppingCart size={18} />
                        </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0284c7', lineHeight: 1.1 }}>
                            {loadingKPI ? '...' : `${activeKPI.transactions}`}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Sales receipts issued
                        </div>
                    </div>
                </div>

                {/* 4. Void / Return Today */}
                <div
                    onClick={() => navigateToSalesHistory({ filterType: 'VOID' })}
                    className="dashboard-kpi-card-void-today"
                    style={{
                        background: 'var(--surface)',
                        border: '1.5px solid #ea580c',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        boxShadow: 'var(--glass-shadow)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '110px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(234, 88, 12, 0.18)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--glass-shadow)'; }}
                    title="Click to view Today's Voided Sales in Sales History"
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Voided Sales Today
                        </span>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(239, 68, 68, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ef4444'
                        }}>
                            <Ban size={18} />
                        </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ef4444', lineHeight: 1.1 }}>
                            {loadingKPI ? '...' : `${kpiSummary.void_return?.total_count || 0}`}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {formatCurrency(kpiSummary.void_return?.total_amount || 0)} cancelled sales
                        </div>
                    </div>
                </div>

                {/* 5. Low Stock */}
                <div
                    onClick={() => {
                        const el = document.getElementById('low-stock-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    style={{
                        background: 'var(--surface)',
                        border: '1.5px solid #dc2626',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        boxShadow: 'var(--glass-shadow)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '110px',
                        cursor: 'pointer'
                    }}
                    title="Click to view Low-Stock Alert List"
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Low Stock Items
                        </span>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(220, 38, 38, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#dc2626'
                        }}>
                            <AlertTriangle size={18} />
                        </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#dc2626', lineHeight: 1.1 }}>
                            {loadingKPI ? '...' : `${kpiSummary.low_stock_count || 0}`}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {kpiSummary.low_stock_count > 0 ? 'Items running low - needs restock' : 'All items stocked'}
                        </div>
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* STAFF CASH DRAWER OVERVIEW (FULL-WIDTH CURRENT BALANCE)      */}
            {/* ============================================================ */}
            {!isAdmin && (
                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    marginBottom: '20px',
                    boxShadow: 'var(--glass-shadow)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Banknote size={20} color="var(--primary)" />
                            <span style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Today's Sales & Cash Drawer Overview
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '8px',
                                background: myCashFloat ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-hover)',
                                color: myCashFloat ? 'var(--primary)' : 'var(--text-muted)',
                                border: '1px solid',
                                borderColor: myCashFloat ? 'rgba(16, 185, 129, 0.3)' : 'var(--border)'
                            }}>
                                {myCashFloat ? '🟢 Shift Cash Float Active' : '⚪ No Active Float (₱0.00 Starting Cash)'}
                            </span>
                        </div>
                    </div>

                    {/* Full-width Current Cash Balance Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(16, 185, 129, 0.06) 100%)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderLeft: '5px solid #3b82f6',
                        borderRadius: '10px',
                        padding: '18px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '16px'
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Current Cash Balance
                                </span>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', background: 'rgba(59, 130, 246, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                                    In Drawer (Physical Cash)
                                </span>
                            </div>
                            <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#3b82f6', fontFamily: 'monospace', lineHeight: 1.1 }}>
                                {loadingMyFloat ? '...' : formatCurrency(myCashFloat ? myCashFloat.current_cash_balance : 0)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {myCashFloat ? (
                                    <span>
                                        Starting Panukli: <strong>{formatCurrency(myCashFloat.starting_cash || myCashFloat.total_amount)}</strong>
                                        {' '}• Cash Sales Added: <strong>+{formatCurrency(myCashFloat.cash_sales || 0)}</strong>
                                    </span>
                                ) : (
                                    <span>
                                        Starting Panukli: <strong>₱0.00</strong> • <span style={{ color: '#f59e0b', fontWeight: 600 }}>Awaiting Admin Cash Float Assignment</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '54px',
                            height: '54px',
                            borderRadius: '12px',
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#3b82f6'
                        }}>
                            <Banknote size={30} />
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* RECENT VOIDED SALES TRACKER (DIRECT OWNER/ADMIN VISIBILITY)  */}
            {/* Real-time monitoring of cashier voided sales                 */}
            {/* ============================================================ */}
            <div id="payment-approvals-section" className="glass-panel" style={{ padding: '20px', borderRadius: '14px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Ban size={20} color="#ef4444" />
                            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                Recent Voided Sales
                            </h2>
                            <span style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: (returnsTracker.total_voids_count || returnsTracker.total_events_count || 0) > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                color: (returnsTracker.total_voids_count || returnsTracker.total_events_count || 0) > 0 ? '#ef4444' : '#10b981',
                                border: `1px solid ${(returnsTracker.total_voids_count || returnsTracker.total_events_count || 0) > 0 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.3)'}`,
                                fontWeight: 700
                            }}>
                                {returnsTracker.total_voids_count || returnsTracker.total_events_count || 0} Voided Transactions
                            </span>
                        </div>
                        <p style={{ margin: '3px 0 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            Monitors same-day cashier transaction cancellations and encoding corrections.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => navigateToTransactions()}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', padding: '5px 12px' }}
                            title="View all transactions in Sales History"
                        >
                            <History size={13} /> Full Sales History ➔
                        </button>
                    </div>
                </div>

                {/* 1. Summary KPI Metric Row */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                    marginBottom: '16px'
                }}>
                    {/* Stat 1: Total Voids Count */}
                    <div style={{
                        background: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Total Voided Sales
                            </span>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px', lineHeight: 1.1 }}>
                                {returnsTracker.total_voids_count || returnsTracker.total_events_count || 0}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                Cancelled cashier sales
                            </div>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Ban size={18} />
                        </div>
                    </div>

                    {/* Stat 2: Total Voided Value */}
                    <div style={{
                        background: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Cancelled Sales Value
                            </span>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ef4444', fontFamily: 'monospace', marginTop: '2px', lineHeight: 1.1 }}>
                                {formatCurrency(returnsTracker.total_voided_amount || 0)}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                Reversal amount
                            </div>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <History size={18} />
                        </div>
                    </div>

                    {/* Stat 3: Stock Restored */}
                    <div style={{
                        background: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Stock Restored
                            </span>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981', marginTop: '2px', lineHeight: 1.1 }}>
                                {returnsTracker.total_items_restored || 0} units
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                Restored to sellable inventory
                            </div>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={18} />
                        </div>
                    </div>
                </div>

                {/* 2. Filter Bar & Live Search */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '14px',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Voided Transactions Log</span>
                    </div>

                    {/* Live Search Input */}
                    <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
                        <Search
                            size={14}
                            style={{
                                position: 'absolute',
                                left: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: isReturnsVoidsSearchFocused ? '#ea580c' : '#64748b',
                                pointerEvents: 'none'
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Search order #, cashier, or reason..."
                            value={returnsVoidsSearchQuery}
                            onChange={(e) => setReturnsVoidsSearchQuery(e.target.value)}
                            onFocus={() => setIsReturnsVoidsSearchFocused(true)}
                            onBlur={() => setIsReturnsVoidsSearchFocused(false)}
                            className="input-premium"
                            style={{
                                width: '100%',
                                height: '32px',
                                fontSize: '0.78rem',
                                paddingLeft: '32px',
                                paddingRight: returnsVoidsSearchQuery ? '28px' : '10px',
                                borderColor: isReturnsVoidsSearchFocused ? '#ea580c' : 'var(--border)'
                            }}
                        />
                        {returnsVoidsSearchQuery && (
                            <button
                                type="button"
                                onClick={() => setReturnsVoidsSearchQuery('')}
                                style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                                title="Clear search"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                </div>

                {/* 3. Table of Recent Voided Sales */}
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
                        <thead>
                            <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '135px', color: 'var(--text-muted)' }}>TYPE & REFERENCE</th>
                                <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '140px', color: 'var(--text-muted)' }}>DATE & TIME</th>
                                <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '120px', color: 'var(--text-muted)' }}>CASHIER</th>
                                <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '190px', color: 'var(--text-muted)' }}>PARTS & QTY</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', minWidth: '120px', color: 'var(--text-muted)' }}>AMOUNT IMPACT</th>
                                <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '220px', color: 'var(--text-muted)' }}>REASON NOTE (MANDATORY)</th>
                                <th style={{ padding: '10px 14px', textAlign: 'center', minWidth: '85px', color: 'var(--text-muted)' }}>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredReturnsVoids.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <Ban size={28} style={{ opacity: 0.35, marginBottom: '6px', display: 'inline-block' }} />
                                        <div style={{ fontWeight: 600 }}>No voided sales found</div>
                                        <div style={{ fontSize: '0.74rem', marginTop: '2px' }}>
                                            {returnsVoidsSearchQuery ? `No matching records for '${returnsVoidsSearchQuery}'` : 'All sales transactions are in good standing without voids.'}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredReturnsVoids.map((item, idx) => {
                                    const isVoid = item.record_type === 'VOID';
                                    const isReplacement = item.record_type === 'REPLACEMENT';
                                    const shortRef = formatShortOrderNo(item.return_number || item.order_number || `SO-${item.id}`);

                                    return (
                                        <tr key={`${item.record_type}-${item.id}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                            {/* Type & Reference */}
                                            <td style={{ padding: '10px 14px' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '0.70rem',
                                                    fontWeight: 700,
                                                    padding: '2px 7px',
                                                    borderRadius: '4px',
                                                    background: isVoid ? 'rgba(239, 68, 68, 0.15)' : (isReplacement ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                                                    color: isVoid ? '#ef4444' : (isReplacement ? '#3b82f6' : '#f59e0b'),
                                                    border: `1px solid ${isVoid ? 'rgba(239, 68, 68, 0.3)' : (isReplacement ? 'rgba(59, 130, 246, 0.3)' : 'rgba(245, 158, 11, 0.3)')}`
                                                }}>
                                                    {isVoid ? <Ban size={11} /> : <RotateCcw size={11} />}
                                                    {item.type_label}
                                                </span>
                                                <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.84rem', marginTop: '4px', color: 'var(--text-main)' }}>
                                                    {shortRef}
                                                </div>
                                            </td>

                                            {/* Date & Time */}
                                            <td style={{ padding: '10px 14px' }}>
                                                <div style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                                    {formatAuditDate(item.event_date)}
                                                </div>
                                            </td>

                                            {/* Cashier / Staff */}
                                            <td style={{ padding: '10px 14px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.82rem' }}>
                                                        {item.cashier_name}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.66rem',
                                                        padding: '1px 5px',
                                                        borderRadius: '4px',
                                                        background: item.cashier_role === 'admin' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                        color: item.cashier_role === 'admin' ? '#c084fc' : '#10b981',
                                                        fontWeight: 600
                                                    }}>
                                                        {item.cashier_role === 'admin' ? 'Admin' : 'Cashier'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Parts & Qty */}
                                            <td style={{ padding: '10px 14px' }}>
                                                <div style={{ fontSize: '0.80rem', color: 'var(--text-main)', fontWeight: 600 }}>
                                                    {item.items_summary || `${item.items_qty || 1} units`}
                                                </div>
                                                <div style={{ fontSize: '0.70rem', color: '#10b981', marginTop: '2px' }}>
                                                    ✓ {item.items_qty || 1} unit(s) restored to stock
                                                </div>
                                            </td>

                                            {/* Amount Impact */}
                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.94rem', fontWeight: 800, fontFamily: 'monospace', color: isVoid ? '#ef4444' : '#f59e0b' }}>
                                                    -{formatCurrency(item.total_amount)}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    Voided Sale
                                                </div>
                                            </td>

                                            {/* Reason Note (Mandatory) */}
                                            <td style={{ padding: '10px 14px' }}>
                                                <div style={{
                                                    fontSize: '0.78rem',
                                                    color: 'var(--text-main)',
                                                    background: 'var(--surface-hover)',
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    borderLeft: `3px solid ${isVoid ? '#ef4444' : '#f59e0b'}`
                                                }}>
                                                    "{item.reason}"
                                                </div>
                                            </td>

                                            {/* Action */}
                                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewReceipt(item.sale_id || item.id)}
                                                    className="btn-secondary"
                                                    style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                    title="View Receipt Details"
                                                >
                                                    <Receipt size={12} /> Slip
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="low-stock-section" className="glass-panel" style={{ padding: '20px', borderRadius: '14px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertTriangle size={20} color="#ef4444" />
                            Low-Stock Alerts {isAdmin ? '& Supplier Restock Shortcuts' : '& Restock Warning'}
                        </h2>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            Motorparts where Sellable Stock is at or below Reorder Level.
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Search part #, name, supplier..."
                            className="input-premium"
                            value={lowStockSearch}
                            onChange={(e) => setLowStockSearch(e.target.value)}
                            style={{ width: '220px', height: '34px', fontSize: '0.80rem' }}
                        />
                        {!isAdmin && (
                            <button
                                type="button"
                                id="request-all-low-stock-btn"
                                onClick={() => handleOpenBulkRestockModal()}
                                disabled={selectableLowStockItems.length === 0}
                                className="btn-primary"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.80rem',
                                    padding: '6px 14px',
                                    background: selectableLowStockItems.length > 0 ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'var(--surface-hover)',
                                    color: selectableLowStockItems.length > 0 ? '#000000' : 'var(--text-muted)',
                                    fontWeight: 800,
                                    border: 'none',
                                    cursor: selectableLowStockItems.length > 0 ? 'pointer' : 'not-allowed',
                                    boxShadow: selectableLowStockItems.length > 0 ? '0 2px 8px rgba(245, 158, 11, 0.25)' : 'none'
                                }}
                                title="Request restock for all low-stock items at once and notify owner via Gmail"
                            >
                                <Mail size={14} />
                                <span>⚡ Request ALL Low Stock ({selectableLowStockItems.length})</span>
                            </button>
                        )}
                        {isAdmin && (
                            <button
                                type="button"
                                onClick={() => navigate('/suppliers')}
                                className="btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.80rem', padding: '6px 12px' }}
                            >
                                <Building2 size={14} /> Full Supplier Page
                            </button>
                        )}
                    </div>
                </div>

                {/* ============================================================ */}
                {/* ADMIN: PENDING STAFF RESTOCK REQUESTS AWAITING APPROVAL      */}
                {/* ============================================================ */}
                {isAdmin && (ownerData.staff_restock_requests?.length > 0 || restockRequestsList.filter(r => r.status === 'PENDING').length > 0) && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0.03) 100%)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        borderRadius: '12px',
                        padding: '16px 18px',
                        marginBottom: '20px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    background: '#f59e0b',
                                    color: '#ffffff',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.72rem',
                                    fontWeight: 800
                                }}>
                                    {(ownerData.staff_restock_requests || restockRequestsList.filter(r => r.status === 'PENDING')).length} PENDING
                                </span>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Send size={15} color="#f59e0b" />
                                    Staff Restock Requests Awaiting Admin Approval
                                </h3>
                            </div>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                Cashiers reported shelf deficits. Approve to automatically generate supplier PO.
                            </span>
                        </div>

                        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem', background: 'var(--surface)' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(245, 158, 11, 0.08)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>PART # & PRODUCT</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>REQUESTED QTY</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>URGENCY</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>STAFF & NOTE</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>SUPPLIER</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>ACTION</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(ownerData.staff_restock_requests || restockRequestsList.filter(r => r.status === 'PENDING')).map((req, idx) => {
                                        const isUrgent = req.priority === 'URGENT';
                                        const isHigh = req.priority === 'HIGH';
                                        return (
                                            <tr key={`pending-req-${req.id}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{req.product_name}</div>
                                                    <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                        {req.part_number} • Stock: <span style={{ color: (req.current_stock || 0) <= 0 ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>{req.current_stock ?? req.current_sellable_stock ?? 0} units</span> (Threshold: {req.reorder_level || 5})
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                                                        +{req.requested_qty} pcs
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '2px 7px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 800,
                                                        background: isUrgent ? 'rgba(239, 68, 68, 0.15)' : (isHigh ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)'),
                                                        color: isUrgent ? '#ef4444' : (isHigh ? '#f59e0b' : '#3b82f6'),
                                                        border: `1px solid ${isUrgent ? 'rgba(239, 68, 68, 0.3)' : (isHigh ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)')}`
                                                    }}>
                                                        {req.priority || 'NORMAL'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.78rem' }}>
                                                        {req.staff_name || 'Staff'} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>({formatAuditDate(req.created_at)})</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: req.notes ? 'italic' : 'normal' }}>
                                                        {req.notes ? `"${req.notes}"` : 'No additional note'}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.78rem' }}>
                                                        {req.supplier_name || 'Generic / FB Supplier'}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenApproveRestock(req)}
                                                            className="btn-primary"
                                                            style={{
                                                                padding: '4px 10px',
                                                                fontSize: '0.74rem',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                background: '#10b981',
                                                                borderColor: '#059669'
                                                            }}
                                                            title="Approve & Generate Purchase Order"
                                                        >
                                                            <Check size={12} />
                                                            <span>Approve & PO</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenRejectRestock(req)}
                                                            className="btn-secondary"
                                                            style={{
                                                                padding: '4px 8px',
                                                                fontSize: '0.74rem',
                                                                color: '#ef4444',
                                                                borderColor: 'rgba(239, 68, 68, 0.3)'
                                                            }}
                                                            title="Decline this restock request"
                                                        >
                                                            <X size={12} />
                                                            <span>Decline</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ============================================================ */}
                {/* STAFF: MY SUBMITTED RESTOCK REQUESTS TRACKER                 */}
                {/* ============================================================ */}
                {!isAdmin && restockRequestsList.length > 0 && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.02) 100%)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: '12px',
                        padding: '16px 18px',
                        marginBottom: '20px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Clock size={16} color="#f59e0b" />
                                    My Restock Requests Tracker
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Track whether the Admin has approved your requested low-stock items.
                                </p>
                            </div>

                            {/* Filter Tabs */}
                            <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.15)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((tab) => {
                                    const count = tab === 'ALL'
                                        ? restockRequestsList.length
                                        : restockRequestsList.filter(r => r.status === tab).length;
                                    return (
                                        <button
                                            key={tab}
                                            type="button"
                                            onClick={() => setRestockFilterTab(tab)}
                                            style={{
                                                padding: '3px 9px',
                                                borderRadius: '4px',
                                                border: 'none',
                                                background: restockFilterTab === tab ? 'var(--primary)' : 'transparent',
                                                color: restockFilterTab === tab ? '#ffffff' : 'var(--text-muted)',
                                                fontWeight: restockFilterTab === tab ? 700 : 500,
                                                fontSize: '0.72rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem', background: 'var(--surface)' }}>
                                <thead>
                                    <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>PART # & PRODUCT</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>REQUESTED</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>PRIORITY</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>YOUR NOTE</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>SUBMITTED</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>ADMIN STATUS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {restockRequestsList
                                        .filter(r => restockFilterTab === 'ALL' || r.status === restockFilterTab)
                                        .slice(0, 10)
                                        .map((req, idx) => {
                                            const isPending = req.status === 'PENDING';
                                            const isApproved = req.status === 'APPROVED';
                                            return (
                                                <tr key={`my-req-${req.id}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{req.product_name}</div>
                                                        <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{req.part_number}</div>
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: 'var(--text-main)' }}>
                                                        {req.requested_qty} pcs
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                        <span style={{
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.67rem',
                                                            fontWeight: 700,
                                                            background: req.priority === 'URGENT' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                                            color: req.priority === 'URGENT' ? '#ef4444' : '#f59e0b'
                                                        }}>
                                                            {req.priority || 'NORMAL'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px 12px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                        {req.notes || '—'}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        {formatAuditDate(req.created_at)}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                        {isPending ? (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(245, 158, 11, 0.15)',
                                                                color: '#f59e0b',
                                                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700
                                                            }}>
                                                                <Clock size={11} />
                                                                <span>Pending Admin</span>
                                                            </span>
                                                        ) : isApproved ? (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(16, 185, 129, 0.15)',
                                                                color: '#10b981',
                                                                border: '1px solid rgba(16, 185, 129, 0.35)',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700
                                                            }}>
                                                                <CheckCircle size={11} />
                                                                <span>Approved {req.po_id ? `(PO #${req.po_id})` : ''}</span>
                                                            </span>
                                                        ) : (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(239, 68, 68, 0.15)',
                                                                color: '#ef4444',
                                                                border: '1px solid rgba(239, 68, 68, 0.35)',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700
                                                            }} title={req.admin_notes || 'Declined'}>
                                                                <XCircle size={11} />
                                                                <span>Declined</span>
                                                            </span>
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

                {/* ============================================================ */}
                {/* INLINE FORM: SUBMIT RESTOCK REQUEST TO ADMIN (NO MODAL, NO GLASS PANEL) */}
                {/* ============================================================ */}
                {!isAdmin && restockModalItem && (
                    <div id="inline-restock-panel" style={{
                        background: 'var(--surface)',
                        border: '1.5px solid #f59e0b',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '18px',
                        boxShadow: '0 8px 30px rgba(245, 158, 11, 0.12)'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: 'rgba(245, 158, 11, 0.18)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#f59e0b'
                                }}>
                                    <Send size={16} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                        Submit Restock Request to Admin
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        Request stock replenishment. The shop owner will be notified via Gmail to buy new Purchase Orders.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setRestockModalItem(null)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '6px 12px' }}
                            >
                                <X size={14} />
                                <span>Close Form</span>
                            </button>
                        </div>

                        {/* Restock Form */}
                        <form onSubmit={handleSubmitRestockRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Product Info Card */}
                            <div style={{
                                background: 'var(--surface-hover)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '12px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '10px'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                        {restockModalItem.product_name}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                                        Part #{restockModalItem.part_number} • Brand: <strong>{restockModalItem.brand || 'Generic'}</strong>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Linked Supplier: <strong style={{ color: 'var(--primary)' }}>{restockModalItem.supplier_name || 'Generic / FB Supplier'}</strong>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                                        Current Stock
                                    </div>
                                    <div style={{
                                        fontSize: '1.1rem',
                                        fontWeight: 800,
                                        color: Number(restockModalItem.sellable_stock ?? restockModalItem.stock ?? 0) <= 0 ? '#ef4444' : '#f59e0b'
                                    }}>
                                        {Number(restockModalItem.sellable_stock ?? restockModalItem.stock ?? 0)} units
                                    </div>
                                    <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                                        Reorder Threshold: {restockModalItem.reorder_level || 5} units
                                    </div>
                                </div>
                            </div>

                            {/* Inputs: Requested Qty, Urgency, Notes */}
                            <div style={{ display: 'grid', gridTemplateColumns: '140px 200px 1fr', gap: '12px', alignItems: 'flex-start' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Requested Qty *
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="input-premium"
                                        style={{ width: '100%', height: '38px', fontSize: '0.92rem', fontWeight: 800, textAlign: 'center' }}
                                        value={restockFormData.requested_qty}
                                        onChange={(e) => setRestockFormData({ ...restockFormData, requested_qty: e.target.value })}
                                        required
                                        disabled={restockSubmitting}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Urgency / Priority *
                                    </label>
                                    <select
                                        className="input-premium"
                                        style={{ width: '100%', height: '38px', fontSize: '0.82rem' }}
                                        value={restockFormData.priority}
                                        onChange={(e) => setRestockFormData({ ...restockFormData, priority: e.target.value })}
                                        disabled={restockSubmitting}
                                    >
                                        <option value="NORMAL">🟢 Normal (Shelf Replenish)</option>
                                        <option value="HIGH">🟡 High Priority (Fast Moving)</option>
                                        <option value="URGENT">🔴 Urgent (Customer Waiting / 0 Out)</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Note for Admin / Owner (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        className="input-premium"
                                        style={{ width: '100%', height: '38px', fontSize: '0.82rem' }}
                                        placeholder="e.g. Inquired by multiple walk-in riders today. Zero stock on shelf."
                                        value={restockFormData.notes}
                                        onChange={(e) => setRestockFormData({ ...restockFormData, notes: e.target.value })}
                                        disabled={restockSubmitting}
                                    />
                                </div>
                            </div>

                            {/* Gmail Notification Info & Actions */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '10px',
                                paddingTop: '4px',
                                borderTop: '1px solid var(--border)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#1877f2' }}>
                                    <Mail size={15} />
                                    <span><strong>Owner Gmail Notification:</strong> Submitting will send an automated restock alert email to the Owner.</span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => setRestockModalItem(null)}
                                        disabled={restockSubmitting}
                                        style={{ fontSize: '0.80rem', padding: '6px 14px' }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn-primary"
                                        disabled={restockSubmitting}
                                        style={{
                                            fontSize: '0.80rem',
                                            padding: '6px 16px',
                                            fontWeight: 800,
                                            background: '#f59e0b',
                                            borderColor: '#d97706',
                                            color: '#000000',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)'
                                        }}
                                    >
                                        <Send size={13} />
                                        <span>{restockSubmitting ? 'Sending Request...' : 'Submit Request to Admin'}</span>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                )}

                {/* ============================================================ */}
                {/* INLINE FORM: SUBMIT BULK RESTOCK REQUEST TO ADMIN (NO MODAL, NO GLASS PANEL) */}
                {/* ============================================================ */}
                {!isAdmin && bulkRestockModalOpen && (
                    <div id="inline-restock-panel" style={{
                        background: 'var(--surface)',
                        border: '1.5px solid #f59e0b',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '18px',
                        boxShadow: '0 8px 30px rgba(245, 158, 11, 0.12)'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: 'rgba(245, 158, 11, 0.18)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#f59e0b'
                                }}>
                                    <Mail size={16} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                        Submit Bulk Restock Request ({bulkRestockItems.length} Parts) to Admin
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        Request replenishment for multiple deficit parts at once. Owner will be notified via Gmail to buy new POs.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setBulkRestockModalOpen(false)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '6px 12px' }}
                            >
                                <X size={14} />
                                <span>Close Form</span>
                            </button>
                        </div>

                        <form onSubmit={handleSubmitBulkRestock} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Urgency & Notes Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Restock Urgency *
                                    </label>
                                    <select
                                        className="input-premium"
                                        style={{ width: '100%', height: '38px', fontSize: '0.82rem' }}
                                        value={bulkRestockPriority}
                                        onChange={(e) => setBulkRestockPriority(e.target.value)}
                                        disabled={bulkRestockSubmitting}
                                    >
                                        <option value="NORMAL">🟢 Normal (Shelf Replenish)</option>
                                        <option value="HIGH">🟡 High Priority (Fast Moving)</option>
                                        <option value="URGENT">🔴 Urgent (Customer Waiting / 0 Out)</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Notes for Owner (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        className="input-premium"
                                        style={{ width: '100%', height: '38px', fontSize: '0.82rem' }}
                                        placeholder="e.g. Please order from FB supplier today, multiple inquiries from riders"
                                        value={bulkRestockNotes}
                                        onChange={(e) => setBulkRestockNotes(e.target.value)}
                                        disabled={bulkRestockSubmitting}
                                    />
                                </div>
                            </div>

                            {/* Items List Table */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                        Parts to Restock ({bulkRestockItems.length})
                                    </label>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        Total Request: <strong>{bulkRestockItems.reduce((acc, i) => acc + (parseInt(i.requested_qty, 10) || 0), 0)} units</strong>
                                    </span>
                                </div>

                                <div style={{
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    overflowY: 'auto',
                                    maxHeight: '240px',
                                    background: 'var(--surface-hover)'
                                }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                                                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Part & Description</th>
                                                <th style={{ padding: '8px 8px', textAlign: 'center' }}>Stock / Reorder</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Supplier</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'center', width: '110px' }}>Request Qty</th>
                                                <th style={{ padding: '8px 8px', textAlign: 'center', width: '40px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bulkRestockItems.map((item) => {
                                                const currentStock = Number(item.sellable_stock ?? item.stock ?? 0);
                                                const isZero = currentStock <= 0;
                                                const pId = item.id || item.product_id;

                                                return (
                                                    <tr key={`bulk-item-${pId}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '8px 12px' }}>
                                                            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.product_name}</div>
                                                            <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                                {item.part_number} • Brand: {item.brand || 'Generic'}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                                            <span style={{
                                                                color: isZero ? '#ef4444' : '#f59e0b',
                                                                fontWeight: 700,
                                                                fontSize: '0.78rem'
                                                            }}>
                                                                {currentStock} {isZero ? '(OUT)' : '(LOW)'}
                                                            </span>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                                Limit: {item.reorder_level || 5}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '8px 10px' }}>
                                                            <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.76rem' }}>
                                                                {item.supplier_name || 'Generic / FB Supplier'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    className="input-premium"
                                                                    style={{ width: '68px', height: '32px', textAlign: 'center', fontWeight: 800, fontSize: '0.84rem' }}
                                                                    value={item.requested_qty}
                                                                    onChange={(e) => handleBulkItemQtyChange(pId, e.target.value)}
                                                                    disabled={bulkRestockSubmitting}
                                                                    required
                                                                />
                                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>pcs</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleBulkItemRemove(pId)}
                                                                disabled={bulkRestockSubmitting}
                                                                title="Remove item from this restock request"
                                                                style={{
                                                                    background: 'transparent',
                                                                    border: 'none',
                                                                    color: 'var(--text-muted)',
                                                                    cursor: 'pointer',
                                                                    padding: '4px'
                                                                }}
                                                            >
                                                                <X size={15} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Gmail Notification Info & Actions */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '10px',
                                paddingTop: '4px',
                                borderTop: '1px solid var(--border)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#1877f2' }}>
                                    <Mail size={15} />
                                    <span><strong>Owner Gmail Notification:</strong> Submitting will email this complete restock list to the Owner.</span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setBulkRestockModalOpen(false)}
                                        className="btn-secondary"
                                        disabled={bulkRestockSubmitting}
                                        style={{ fontSize: '0.80rem', padding: '6px 14px' }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        id="submit-bulk-restock-btn"
                                        className="btn-primary"
                                        disabled={bulkRestockSubmitting || bulkRestockItems.length === 0}
                                        style={{
                                            fontSize: '0.80rem',
                                            padding: '6px 16px',
                                            fontWeight: 800,
                                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                            borderColor: '#d97706',
                                            color: '#000000',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)'
                                        }}
                                    >
                                        <Mail size={13} />
                                        <span>{bulkRestockSubmitting ? 'Sending Request...' : `Submit Request (${bulkRestockItems.length}) & Notify Owner`}</span>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                )}

                    {/* STAFF MULTI-SELECT & BULK ACTION BAR */}
                    {!isAdmin && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            marginBottom: '12px',
                            borderRadius: '8px',
                            background: selectedLowStockIds.length > 0 ? 'rgba(245, 158, 11, 0.12)' : 'var(--surface-hover)',
                            border: selectedLowStockIds.length > 0 ? '1.5px solid #f59e0b' : '1px solid var(--border)',
                            transition: 'all 0.2s ease',
                            flexWrap: 'wrap',
                            gap: '10px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                                <CheckSquare size={16} color={selectedLowStockIds.length > 0 ? '#f59e0b' : 'var(--text-muted)'} />
                                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                                    {selectedLowStockIds.length > 0 ? (
                                        <>Selected <strong style={{ color: '#f59e0b' }}>{selectedLowStockIds.length}</strong> of {selectableLowStockItems.length} low-stock parts</>
                                    ) : (
                                        <>Choice 1: Select items with checkboxes • Choice 2: Click "Request ALL Low Stock"</>
                                    )}
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {selectedLowStockIds.length > 0 ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedLowStockIds([])}
                                            className="btn-secondary"
                                            style={{ fontSize: '0.74rem', padding: '4px 10px' }}
                                        >
                                            Deselect All
                                        </button>
                                        <button
                                            type="button"
                                            id="request-selected-restock-btn"
                                            onClick={() => handleOpenBulkRestockModal()}
                                            className="btn-primary"
                                            style={{
                                                fontSize: '0.78rem',
                                                padding: '5px 14px',
                                                fontWeight: 800,
                                                background: '#f59e0b',
                                                borderColor: '#d97706',
                                                color: '#000000',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)'
                                            }}
                                        >
                                            <Mail size={13} />
                                            <span>Request Restock for Selected ({selectedLowStockIds.length}) & Notify Owner</span>
                                        </button>
                                    </>
                                ) : (
                                    selectableLowStockItems.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleSelectAllFilteredLowStock}
                                            className="btn-secondary"
                                            style={{ fontSize: '0.74rem', padding: '4px 10px' }}
                                        >
                                            Select All ({selectableLowStockItems.length})
                                        </button>
                                    )
                                )}
                            </div>
                        </div>
                    )}

                    {/* Low Stock Table */}
                    <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '10px', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                                    {!isAdmin && (
                                        <th style={{ padding: '10px 8px', textAlign: 'center', width: '40px' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectableLowStockItems.length > 0 && selectedLowStockIds.length === selectableLowStockItems.length}
                                                onChange={handleSelectAllFilteredLowStock}
                                                title="Select or Deselect All"
                                                style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#f59e0b' }}
                                            />
                                        </th>
                                    )}
                                    <th style={{ padding: '10px 12px' }}>Part # & Product</th>
                                    <th style={{ padding: '10px 10px' }}>Brand & Category</th>
                                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>Sellable Stock</th>
                                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>Reorder Level</th>
                                    <th style={{ padding: '10px 10px', textAlign: 'right' }}>Unit Cost</th>
                                    <th style={{ padding: '10px 12px' }}>Linked FB Supplier</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>{isAdmin ? 'Action / Quick PO' : 'Restock Action'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLowStock.length === 0 ? (
                                    <tr>
                                        <td colSpan={!isAdmin ? 8 : 7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                                            {lowStockSearch ? 'No low stock items match your search.' : 'All motorparts are currently above their reorder thresholds.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLowStock.map((item, idx) => {
                                        const stockQty = Number(item.sellable_stock ?? item.stock ?? 0);
                                        const isCritical = stockQty <= 0;
                                        const hasPendingRequest = Boolean(item.restock_request_id || item.restock_request_status === 'PENDING');

                                        return (
                                            <tr key={`lowstock-${item.id || item.product_id || idx}-${idx}`} style={{ borderBottom: '1px solid var(--border)', background: hasPendingRequest ? 'rgba(245, 158, 11, 0.03)' : 'transparent' }}>
                                                {!isAdmin && (
                                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedLowStockIds.includes(item.id || item.product_id)}
                                                            disabled={hasPendingRequest}
                                                            onChange={() => handleToggleSelectLowStock(item.id || item.product_id)}
                                                            title={hasPendingRequest ? 'Restock request already pending' : 'Select for restock'}
                                                            style={{ cursor: hasPendingRequest ? 'not-allowed' : 'pointer', width: '16px', height: '16px', accentColor: '#f59e0b' }}
                                                        />
                                                    </td>
                                                )}
                                                <td style={{ padding: '10px 12px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.product_name}</span>
                                                        {hasPendingRequest && (
                                                            <span style={{
                                                                background: 'rgba(245, 158, 11, 0.15)',
                                                                color: '#f59e0b',
                                                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.66rem',
                                                                fontWeight: 700
                                                            }}>
                                                                ⏳ Req +{item.restock_requested_qty}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.part_number}</div>
                                                </td>
                                                <td style={{ padding: '10px 10px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{getShortBrand(item.brand)}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        <span style={{
                                                            padding: '1px 5px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            background: 'rgba(255, 255, 255, 0.06)',
                                                            border: '1px solid var(--border)'
                                                        }}>
                                                            {getLedgerCategoryCode(item.category)}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        fontWeight: 800,
                                                        fontSize: '0.82rem',
                                                        background: isCritical ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                        color: isCritical ? '#ef4444' : '#f59e0b',
                                                        border: `1px solid ${isCritical ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                                    }}>
                                                        {stockQty} {isCritical ? '(OUT)' : '(LOW)'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                    {item.reorder_level || 5}
                                                </td>
                                                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700 }}>
                                                    {formatCurrency(item.cost_price || 0)}
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <strong style={{ color: 'var(--primary)' }}>{item.supplier_name || 'Brembo & RCB Hub'}</strong>
                                                        <span style={{ background: 'rgba(24, 119, 242, 0.15)', color: '#1877f2', padding: '1px 5px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>FB</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>{item.contact_person || 'Leo Bautista'} • Fast Delivery</div>
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                    {isAdmin ? (
                                                        hasPendingRequest ? (
                                                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenApproveRestock(item)}
                                                                    className="btn-primary"
                                                                    style={{
                                                                        padding: '4px 10px',
                                                                        fontSize: '0.74rem',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        background: '#10b981',
                                                                        borderColor: '#059669'
                                                                    }}
                                                                    title={`Approve staff request by ${item.restock_staff_name}`}
                                                                >
                                                                    <Check size={12} />
                                                                    <span>Approve ({item.restock_requested_qty})</span>
                                                                </button>
                                                                <span style={{ fontSize: '0.66rem', color: '#f59e0b', fontWeight: 700 }}>
                                                                    Req by {item.restock_staff_name}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenQuickPO(item)}
                                                                className="btn-primary"
                                                                style={{
                                                                    padding: '5px 12px',
                                                                    fontSize: '0.76rem',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px'
                                                                }}
                                                                title="Create instant PO for this supplier"
                                                            >
                                                                <PackagePlus size={13} />
                                                                <span>+ Create PO</span>
                                                            </button>
                                                        )
                                                    ) : (
                                                        hasPendingRequest ? (
                                                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '6px',
                                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                                    color: '#f59e0b',
                                                                    border: '1px solid rgba(245, 158, 11, 0.35)',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: 700
                                                                }}>
                                                                    <Clock size={11} />
                                                                    <span>Requested ({item.restock_requested_qty})</span>
                                                                </span>
                                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                                    Pending Admin
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenRestockRequest(item)}
                                                                className="btn-primary"
                                                                style={{
                                                                    padding: '5px 12px',
                                                                    fontSize: '0.76rem',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px',
                                                                    background: '#f59e0b',
                                                                    borderColor: '#d97706',
                                                                    color: '#000',
                                                                    fontWeight: 700
                                                                }}
                                                                title="Request restock from Admin"
                                                            >
                                                                <Send size={12} />
                                                                <span>Request Restock</span>
                                                            </button>
                                                        )
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            {/* ============================================================ */}
            {/* ADMIN STAFF SALES & TRANSACTIONS TABLE                       */}
            {/* ============================================================ */}
            {isAdmin && staffToday && staffToday.length > 0 && (
                <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem' }}>
                                <Users size={19} color="var(--primary)" /> Staff Sales & Transactions
                            </h3>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '3px' }}>
                                {staffPeriod === 'today'
                                    ? "Live cashier shift totals and register transactions for today."
                                    : "All-time breakdown of all store transactions and revenue by staff."}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <button
                                type="button"
                                onClick={() => setStaffPeriod('today')}
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: '5px',
                                    border: 'none',
                                    background: staffPeriod === 'today' ? 'var(--primary)' : 'transparent',
                                    color: staffPeriod === 'today' ? '#ffffff' : 'var(--text-muted)',
                                    fontWeight: staffPeriod === 'today' ? 700 : 500,
                                    fontSize: '0.78rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Today
                            </button>
                            <button
                                type="button"
                                onClick={() => setStaffPeriod('all')}
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: '5px',
                                    border: 'none',
                                    background: staffPeriod === 'all' ? 'var(--primary)' : 'transparent',
                                    color: staffPeriod === 'all' ? '#ffffff' : 'var(--text-muted)',
                                    fontWeight: staffPeriod === 'all' ? 700 : 500,
                                    fontSize: '0.78rem',
                                    cursor: 'pointer'
                                }}
                            >
                                All Time
                            </button>
                        </div>
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Staff / Cashier</th>
                                    <th>Role</th>
                                    <th style={{ textAlign: 'center' }}>
                                        {staffPeriod === 'today' ? "Today's Transactions" : 'Total Transactions'}
                                    </th>
                                    <th style={{ textAlign: 'right' }}>
                                        {staffPeriod === 'today' ? "Today's Sales" : 'Total Sales'}
                                    </th>
                                    <th style={{ textAlign: 'center', width: '150px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staffToday.map((st, idx) => {
                                    const txCount = staffPeriod === 'today'
                                        ? Number(st.today_transactions || 0)
                                        : Number(st.all_time_transactions || 0);
                                    const salesAmount = staffPeriod === 'today'
                                        ? Number(st.today_sales || 0)
                                        : Number(st.all_time_sales || 0);

                                    return (
                                        <tr key={`staff-${st.id || st.user_id || st.username || idx}-${idx}`}>
                                            <td style={{ fontWeight: 600 }}>
                                                <span style={{ color: 'var(--primary)' }}>{st.username}</span>
                                            </td>
                                            <td>
                                                <span className={`badge-pill ${st.role === 'admin' ? 'badge-admin' : 'badge-staff'}`} style={{ textTransform: 'capitalize' }}>
                                                    {st.role}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                                                {txCount} {txCount === 1 ? 'sale' : 'sales'}
                                            </td>
                                            <td style={{ textAlign: 'right', color: 'var(--primary)', fontWeight: 'bold' }}>
                                                {formatCurrency(salesAmount)}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    onClick={() => navigate(`/transactions?user=${encodeURIComponent(st.username)}`)}
                                                    style={{ padding: '3px 8px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <History size={12} /> View Transactions
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

            {/* ============================================================ */}
            {/* OPERATIONAL RECORDS TABS                                     */}
            {/* Tab 1: Recent Counter Activity | Tab 2: Top 5 Fast Moving    */}
            {/* ============================================================ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                {/* 1. RECENT COUNTER ACTIVITY */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.02rem' }}>
                                <History size={18} color="var(--primary)" /> Recent Counter Sales
                            </h3>
                            <p style={{ margin: '2px 0 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                Live counter checkouts ({dateRange.label})
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigateToTransactions()}
                            className="btn-secondary"
                            style={{ fontSize: '0.76rem', padding: '4px 10px' }}
                        >
                            View All History ➔
                        </button>
                    </div>

                    {counterLoading ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading sales...</div>
                    ) : counterList.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No sales recorded in this period.</div>
                    ) : (
                        <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>Invoice / Sale #</th>
                                        <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>Cashier</th>
                                        <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>Payment</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Total</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>Receipt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {counterList.slice(0, 5).map((sale, idx) => (
                                        <tr key={`counter-${sale.id || sale.sale_id || idx}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                                                <div style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                    {formatShortOrderNo(sale.order_number) || `#${sale.id}`}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {sale.sale_date || sale.created_at ? formatAuditDate(sale.sale_date || sale.created_at) : (sale.products_included ? String(sale.products_included).split(',')[0] : 'Counter Sale')}
                                                </div>
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{ fontWeight: 600 }}>{sale.cashier_name || sale.cashier || 'Staff'}</span>
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{
                                                    fontWeight: 600,
                                                    display: 'inline-block',
                                                    color: (String(sale.payment_method || '').toLowerCase().includes('split'))
                                                        ? '#c084fc'
                                                        : (String(sale.payment_method || '').toUpperCase() === 'GCASH' ? '#3b82f6' : '#16a34a')
                                                }}>
                                                    {(String(sale.payment_method || '').toLowerCase().includes('split'))
                                                        ? 'Cash + GCash'
                                                        : (sale.payment_method || 'Cash')}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                                                {formatCurrency(sale.total_amount)}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewReceipt(sale.id)}
                                                    className="btn-secondary"
                                                    style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                    title="View receipt"
                                                >
                                                    <Receipt size={12} /> View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* 2. TOP 5 FAST-MOVING PARTS */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.02rem' }}>
                                <Award size={18} color="var(--primary)" /> Top 5 Fast-Moving Parts
                            </h3>
                            <p style={{ margin: '2px 0 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                Highest demand items by sales quantity
                            </p>
                        </div>

                        {/* Period Filter for Best Selling */}
                        <div style={{ display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.15)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                            {[
                                { key: 'daily', label: 'Today' },
                                { key: 'weekly', label: 'Week' },
                                { key: 'monthly', label: 'Month' },
                                { key: 'all_time', label: 'All' }
                            ].map(p => (
                                <button
                                    key={p.key}
                                    type="button"
                                    onClick={() => setBestSellingPeriod(p.key)}
                                    style={{
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        background: bestSellingPeriod === p.key ? 'var(--primary)' : 'transparent',
                                        color: bestSellingPeriod === p.key ? '#fff' : 'var(--text-muted)',
                                        fontSize: '0.72rem',
                                        fontWeight: bestSellingPeriod === p.key ? 700 : 500,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {bestSellingLoading ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading best selling...</div>
                    ) : bestSellingList.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No best sellers recorded in this period.</div>
                    ) : (
                        <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '8px 10px' }}>Rank & Product</th>
                                        <th style={{ padding: '8px 10px' }}>Brand</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Units Sold</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Revenue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bestSellingList.map((item, idx) => (
                                        <tr key={`bestseller-${item.id || item.product_id || idx}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '8px 10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '50%',
                                                        background: idx === 0 ? '#eab308' : (idx === 1 ? '#94a3b8' : (idx === 2 ? '#b45309' : 'var(--surface-hover)')),
                                                        color: idx < 3 ? '#000' : 'var(--text-muted)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 800,
                                                        fontSize: '0.68rem',
                                                        flexShrink: 0
                                                    }}>
                                                        {idx + 1}
                                                    </span>
                                                    <div>
                                                        <div style={{ fontWeight: 700 }}>{item.product_name}</div>
                                                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.part_number}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>
                                                {item.brand || 'Generic'}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: 'var(--primary)' }}>
                                                {item.total_quantity_sold || item.quantity_sold || 0}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                                                {formatCurrency(item.total_revenue || 0)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ============================================================ */}
            {/* MODAL: QUICK PURCHASE ORDER (FROM LOW STOCK SHORTCUT)         */}
            {/* ============================================================ */}
            {quickPOModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div className="glass-panel" style={{
                        maxWidth: '520px',
                        width: '100%',
                        borderRadius: '14px',
                        padding: '24px',
                        border: '1px solid var(--border)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <PackagePlus size={20} color="var(--primary)" />
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Create Instant Restock PO</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setQuickPOModal(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateQuickPO}>
                            {/* Product & Supplier Summary Card */}
                            <div style={{ background: 'var(--surface-hover)', padding: '12px 14px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.90rem', fontWeight: 800, color: 'var(--text-main)' }}>{quickPOModal.product_name}</div>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    Part #{quickPOModal.part_number} • Brand: {quickPOModal.brand || 'Generic'}
                                </div>
                                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
                                    <span>Linked Supplier:</span>
                                    <strong style={{ color: 'var(--primary)' }}>{quickPOModal.supplier_name || 'Brembo & RCB Online Hub'}</strong>
                                    <span style={{ background: 'rgba(24, 119, 242, 0.15)', color: '#1877f2', padding: '1px 5px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>FB</span>
                                </div>
                                <div style={{ marginTop: '4px', fontSize: '0.74rem', color: 'var(--danger)' }}>
                                    Current Sellable Stock: <strong>{quickPOModal.stock} units</strong> (Reorder threshold: {quickPOModal.reorder_level || 5})
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Order Quantity *
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="input-premium"
                                        style={{ width: '100%', height: '36px' }}
                                        value={poFormData.quantity}
                                        onChange={(e) => setPoFormData({ ...poFormData, quantity: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Supplier Unit Cost (₱) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="input-premium"
                                        style={{ width: '100%', height: '36px' }}
                                        value={poFormData.unit_cost}
                                        onChange={(e) => setPoFormData({ ...poFormData, unit_cost: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Courier / Delivery Service
                                    </label>
                                    <select
                                        className="input-premium"
                                        style={{ width: '100%', height: '36px' }}
                                        value={poFormData.courier_name}
                                        onChange={(e) => setPoFormData({ ...poFormData, courier_name: e.target.value })}
                                    >
                                        <option value="Lalamove">Lalamove</option>
                                        <option value="GrabExpress">GrabExpress</option>
                                        <option value="J&T Express">J&T Express</option>
                                        <option value="Supplier Truck">Supplier Truck Delivery</option>
                                        <option value="Direct Pickup">Direct Pickup</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Estimated Shipping Fee (₱)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="input-premium"
                                        style={{ width: '100%', height: '36px' }}
                                        value={poFormData.shipping_fee}
                                        onChange={(e) => setPoFormData({ ...poFormData, shipping_fee: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                    Purchase Order Notes / Instructions
                                </label>
                                <textarea
                                    className="input-premium"
                                    rows={2}
                                    style={{ width: '100%', resize: 'none' }}
                                    value={poFormData.notes}
                                    onChange={(e) => setPoFormData({ ...poFormData, notes: e.target.value })}
                                />
                            </div>

                            {/* Estimated Total Calculation */}
                            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>Estimated PO Total:</span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--primary)', fontFamily: 'monospace' }}>
                                    {formatCurrency((Number(poFormData.quantity || 0) * Number(poFormData.unit_cost || 0)) + Number(poFormData.shipping_fee || 0))}
                                </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setQuickPOModal(null)}
                                    className="btn-secondary"
                                    disabled={poSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    disabled={poSubmitting}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Send size={14} />
                                    <span>{poSubmitting ? 'Creating PO...' : 'Confirm & Generate PO'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: APPROVE SUPPLIER PO PAYMENT                           */}
            {/* ============================================================ */}
            {approvingOrder && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div className="glass-panel" style={{
                        maxWidth: '480px',
                        width: '100%',
                        borderRadius: '14px',
                        padding: '24px',
                        border: '1px solid var(--border)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShieldAlert size={20} color="#f59e0b" />
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Approve Supplier Payment</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setApprovingOrder(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ background: 'var(--surface-hover)', padding: '14px', borderRadius: '10px', marginBottom: '18px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Order Reference:</span>
                                <strong style={{ color: 'var(--text-main)' }}>{approvingOrder.order_number || `PO-#${approvingOrder.order_id}`}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Facebook Supplier:</span>
                                <strong>{approvingOrder.supplier_name}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Requested By:</span>
                                <span>{approvingOrder.created_by_name || 'Staff'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-muted)' }}>Amount To Disburse:</span>
                                <span style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--danger)', fontFamily: 'monospace' }}>
                                    {formatCurrency(approvingOrder.total_cost)}
                                </span>
                            </div>
                        </div>

                        <div style={{ marginBottom: '18px' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                Shop Disbursement Reference No. (e.g. GCash Send Money Ref #, Bank Trace #)
                            </label>
                            <input
                                type="text"
                                className="input-premium"
                                placeholder="e.g. 100982348719"
                                style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
                                value={approvalRefNo}
                                onChange={(e) => setApprovalRefNo(e.target.value)}
                            />
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Optional: Attaches your payment receipt reference to the supplier purchase order.
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setApprovingOrder(null)}
                                className="btn-secondary"
                                disabled={approvingSubmitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmApprovePO}
                                className="btn-primary"
                                disabled={approvingSubmitting}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: '#f59e0b',
                                    borderColor: '#f59e0b',
                                    color: '#000',
                                    fontWeight: 700
                                }}
                            >
                                <Check size={14} />
                                <span>{approvingSubmitting ? 'Approving...' : 'Confirm Payment Release'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: FLAG ISSUE / REJECT PENDING PAYMENT                   */}
            {/* ============================================================ */}
            {flaggingTarget && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: 'var(--surface)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '14px',
                        padding: '24px',
                        width: '100%',
                        maxWidth: '460px',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertCircle size={20} color="#ef4444" />
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#ef4444' }}>
                                    Flag & Reject Pending Transaction
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setFlaggingTarget(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ background: 'var(--surface-hover)', padding: '14px', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Target:</span>
                                <strong style={{ color: 'var(--text-main)' }}>{flaggingTarget.name}</strong>
                            </div>
                            {flaggingTarget.ref && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Reference:</span>
                                    <strong style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{flaggingTarget.ref}</strong>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-muted)' }}>Amount Involved:</span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ef4444', fontFamily: 'monospace' }}>
                                    {formatCurrency(flaggingTarget.amount)}
                                </span>
                            </div>
                        </div>

                        <div style={{ marginBottom: '18px' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                Reason for Flagging / Rejection (Logged to Audit Trail)
                            </label>
                            <input
                                type="text"
                                className="input-premium"
                                placeholder="e.g. Reference number not found in GCash wallet, wrong amount, damaged parcel..."
                                value={flagReason}
                                onChange={(e) => setFlagReason(e.target.value)}
                                style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                                autoFocus
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setFlaggingTarget(null)}
                                className="btn-secondary"
                                disabled={flagSubmitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmFlagging}
                                className="btn-primary"
                                disabled={flagSubmitting}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: '#ef4444',
                                    borderColor: '#ef4444',
                                    color: '#fff',
                                    fontWeight: 700
                                }}
                            >
                                <XCircle size={14} />
                                <span>{flagSubmitting ? 'Flagging...' : 'Confirm Flag & Reject'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: ORDER RECEIPT PREVIEW / PRINT                         */}
            {/* ============================================================ */}
            {selectedReceiptSaleId && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div className="glass-panel" style={{
                        maxWidth: '520px',
                        width: '100%',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        border: '1px solid var(--border)'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px 20px',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--surface)'
                        }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem' }}>
                                <Receipt size={18} color="var(--primary)" /> Order Receipt #{selectedReceiptSaleId}
                            </h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedReceiptSaleId(null);
                                    setReceiptDetails(null);
                                }}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', justifyContent: 'center' }}>
                            {loadingReceipt ? (
                                <div style={{ padding: '40px', color: 'var(--text-muted)' }}>Loading receipt...</div>
                            ) : receiptDetails ? (
                                <ReceiptPrint sale={receiptDetails} />
                            ) : (
                                <div style={{ padding: '40px', color: 'var(--danger)' }}>Failed to load receipt.</div>
                            )}
                        </div>

                        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'var(--surface)' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    setSelectedReceiptSaleId(null);
                                    setReceiptDetails(null);
                                }}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => window.print()}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Printer size={15} /> Print Receipt
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: ADMIN APPROVE RESTOCK REQUEST & GENERATE PO           */}
            {/* ============================================================ */}
            {approvingRestockModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div className="glass-panel" style={{
                        maxWidth: '540px',
                        width: '100%',
                        borderRadius: '14px',
                        overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        border: '1px solid var(--border)'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px 20px',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--surface)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckCircle size={18} color="#10b981" />
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                                    Approve Restock Request & Generate PO
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setApprovingRestockModal(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmApproveRestock} style={{ padding: '20px' }}>
                            <div style={{
                                background: 'var(--surface-hover)',
                                padding: '12px 14px',
                                borderRadius: '8px',
                                marginBottom: '16px',
                                border: '1px solid var(--border)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                            {approvingRestockModal.product_name}
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            Part #{approvingRestockModal.part_number} • Supplier: <strong style={{ color: 'var(--primary)' }}>{approvingRestockModal.supplier_name}</strong>
                                        </div>
                                    </div>
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.68rem',
                                        fontWeight: 800,
                                        background: approvingRestockModal.priority === 'URGENT' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                        color: approvingRestockModal.priority === 'URGENT' ? '#ef4444' : '#f59e0b'
                                    }}>
                                        {approvingRestockModal.priority}
                                    </span>
                                </div>

                                <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-main)', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
                                    <span>Requested By: <strong>{approvingRestockModal.staff_name}</strong></span>
                                    {approvingRestockModal.notes && (
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                                            Staff Note: "{approvingRestockModal.notes}"
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Approved Order Qty *
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="input-premium"
                                        style={{ width: '100%', height: '38px', fontSize: '0.90rem', fontWeight: 700 }}
                                        value={approvingRestockFormData.approved_qty}
                                        onChange={(e) => setApprovingRestockFormData({ ...approvingRestockFormData, approved_qty: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                        Courier / Delivery Service
                                    </label>
                                    <select
                                        className="input-premium"
                                        style={{ width: '100%', height: '38px', fontSize: '0.82rem' }}
                                        value={approvingRestockFormData.courier_name}
                                        onChange={(e) => setApprovingRestockFormData({ ...approvingRestockFormData, courier_name: e.target.value })}
                                    >
                                        <option value="Lalamove">Lalamove</option>
                                        <option value="J&T Express">J&T Express</option>
                                        <option value="Borzo">Borzo</option>
                                        <option value="Direct Supplier Rider">Direct Supplier Rider</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                    Admin Resolution Note (Optional)
                                </label>
                                <input
                                    type="text"
                                    className="input-premium"
                                    style={{ width: '100%', height: '36px', fontSize: '0.82rem' }}
                                    value={approvingRestockFormData.admin_notes}
                                    onChange={(e) => setApprovingRestockFormData({ ...approvingRestockFormData, admin_notes: e.target.value })}
                                    placeholder="e.g. Approved and ordered via FB Messenger"
                                />
                            </div>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 12px',
                                background: 'rgba(16, 185, 129, 0.08)',
                                borderRadius: '8px',
                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                marginBottom: '18px'
                            }}>
                                <input
                                    type="checkbox"
                                    id="create_po_check"
                                    checked={approvingRestockFormData.create_po}
                                    onChange={(e) => setApprovingRestockFormData({ ...approvingRestockFormData, create_po: e.target.checked })}
                                />
                                <label htmlFor="create_po_check" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer' }}>
                                    Automatically generate Purchase Order (PO) in Purchasing queue for this supplier
                                </label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setApprovingRestockModal(null)}
                                    className="btn-secondary"
                                    disabled={approvingRestockSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    disabled={approvingRestockSubmitting}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: '#10b981',
                                        borderColor: '#059669',
                                        color: '#ffffff',
                                        fontWeight: 700
                                    }}
                                >
                                    <Check size={14} />
                                    <span>{approvingRestockSubmitting ? 'Approving...' : 'Confirm & Approve Restock'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: ADMIN DECLINE RESTOCK REQUEST                         */}
            {/* ============================================================ */}
            {rejectingRestockModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div className="glass-panel" style={{
                        maxWidth: '460px',
                        width: '100%',
                        borderRadius: '14px',
                        overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        border: '1px solid var(--border)'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px 20px',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--surface)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <XCircle size={18} color="#ef4444" />
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                                    Decline Restock Request
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRejectingRestockModal(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmRejectRestock} style={{ padding: '20px' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: '14px' }}>
                                Are you sure you want to decline the restock request for <strong>{rejectingRestockModal.product_name}</strong> ({rejectingRestockModal.part_number}) requested by {rejectingRestockModal.staff_name}?
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                                    Reason for Declining (Visible to Staff)
                                </label>
                                <input
                                    type="text"
                                    className="input-premium"
                                    style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="e.g. Existing stock in backroom shelf / Supplier out of stock"
                                    required
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setRejectingRestockModal(null)}
                                    className="btn-secondary"
                                    disabled={rejectingSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    disabled={rejectingSubmitting}
                                    style={{
                                        background: '#ef4444',
                                        borderColor: '#dc2626',
                                        color: '#ffffff',
                                        fontWeight: 700
                                    }}
                                >
                                    {rejectingSubmitting ? 'Declining...' : 'Confirm Decline'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
