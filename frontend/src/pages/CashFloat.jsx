import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import {
    Banknote,
    Users,
    CheckCircle,
    RotateCcw,
    Eye,
    Edit3,
    Search,
    RefreshCw,
    X,
    Clock,
    AlertCircle,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    FileText,
    DollarSign,
    Lock,
    Check,
    AlertTriangle,
    Plus,
    MinusCircle,
    ShieldCheck,
    Coins,
    Sliders,
    TrendingDown,
    TrendingUp,
    KeyRound,
    Play,
    Square
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import { notifyInventoryChange, subscribeToInventoryChange } from '../utils/syncEvents';

export const CashFloat = () => {
    const { user } = useContext(AuthContext);
    const [searchParams, setSearchParams] = useSearchParams();
    const isAdmin = (user?.role || '').toLowerCase() === 'admin';

    // Tabs: 'active' | 'history' | 'manage'
    const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'active');

    useEffect(() => {
        const qTab = searchParams.get('tab');
        setActiveTab(qTab || 'active');
    }, [searchParams]);

    // ==========================================
    // 1. ACTIVE SHIFT TRACKER STATE
    // ==========================================
    const [activeShift, setActiveShift] = useState(null);
    const [loadingActiveShift, setLoadingActiveShift] = useState(true);

    // Open Shift Form State
    const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
    const [openShiftForm, setOpenShiftForm] = useState({
        staff_id: '',
        starting_cash: '2000',
        notes: '',
        bills_1000: 0,
        bills_500: 2,
        bills_200: 2,
        bills_100: 4,
        bills_50: 2,
        bills_20: 5,
        coins_10: 0,
        coins_5: 0,
        coins_1: 0
    });
    const [openingShift, setOpeningShift] = useState(false);
    const [useDenomOpen, setUseDenomOpen] = useState(false);

    // Petty Cash Expense Modal State
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [expenseForm, setExpenseForm] = useState({
        amount: '',
        category: 'Store Supplies',
        reason: ''
    });
    const [submittingExpense, setSubmittingExpense] = useState(false);

    // Close Shift (Blind Cash Count) Modal State
    const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
    const [closeShiftForm, setCloseShiftForm] = useState({
        actual_cash: '',
        notes: '',
        bills_1000: 0,
        bills_500: 0,
        bills_200: 0,
        bills_100: 0,
        bills_50: 0,
        bills_20: 0,
        coins_10: 0,
        coins_5: 0,
        coins_1: 0
    });
    const [closingShift, setClosingShift] = useState(false);
    const [useDenomClose, setUseDenomClose] = useState(false);

    // Reconciliation Result Modal (Post-Closing Receipt)
    const [reconResultModal, setReconResultModal] = useState(null);

    // ==========================================
    // 2. CASH COUNT HISTORY STATE
    // ==========================================
    const [records, setRecords] = useState([]);
    const [loadingRecords, setLoadingRecords] = useState(true);
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'COMPLETED' | 'DISCREPANCY'
    const [staffFilter, setStaffFilter] = useState('ALL');
    const [dateFilter, setDateFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [staffList, setStaffList] = useState([]);

    // Shift Slip Inspector Modal
    const [viewShiftDetails, setViewShiftDetails] = useState(null);

    // Admin Sign-off processing map
    const [signingOffId, setSigningOffId] = useState(null);

    // ==========================================
    // 3. ADMIN DRAWER SUMMARY STATE
    // ==========================================
    const [summaryStats, setSummaryStats] = useState({
        activeCount: 0,
        totalStartingCash: 0,
        totalDrawerBalance: 0,
        totalCashSales: 0,
        totalCashDrops: 0,
        activeStaffName: null,
        activeStaffUsername: null,
        activeShiftCode: null,
        activeStartTime: null,
        pendingSignOffCount: 0,
        pendingSignOffAmount: 0
    });

    // Mid-Shift Cash Drop (Safe Remittance) Modal State
    const [showCashDropModal, setShowCashDropModal] = useState(false);
    const [cashDropShift, setCashDropShift] = useState(null);
    const [cashDropAmount, setCashDropAmount] = useState('');
    const [cashDropNotes, setCashDropNotes] = useState('');
    const [submittingCashDrop, setSubmittingCashDrop] = useState(false);

    // Admin Force Time-Out / Close Modal State
    const [showForceCloseModal, setShowForceCloseModal] = useState(false);
    const [forceCloseShift, setForceCloseShift] = useState(null);
    const [forceCloseActual, setForceCloseActual] = useState('');
    const [forceCloseNotes, setForceCloseNotes] = useState('');
    const [submittingForceClose, setSubmittingForceClose] = useState(false);

    // Shift Action In Progress
    const [actionInProgressShiftId, setActionInProgressShiftId] = useState(null);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            return next;
        });
    };

    // Calculate denomination sum helper
    const calculateDenomTotal = (form) => {
        return (Number(form.bills_1000 || 0) * 1000) +
               (Number(form.bills_500 || 0) * 500) +
               (Number(form.bills_200 || 0) * 200) +
               (Number(form.bills_100 || 0) * 100) +
               (Number(form.bills_50 || 0) * 50) +
               (Number(form.bills_20 || 0) * 20) +
               (Number(form.coins_10 || 0) * 10) +
               (Number(form.coins_5 || 0) * 5) +
               (Number(form.coins_1 || 0) * 1);
    };

    // Fetch active shift tracker
    const fetchActiveShift = useCallback(async (silent = false) => {
        if (!silent) setLoadingActiveShift(true);
        try {
            const res = await api.get('/cash-float/active-shift');
            setActiveShift(res.data?.activeShift || null);
        } catch (err) {
            console.error('Failed to load active shift:', err);
        } finally {
            if (!silent) setLoadingActiveShift(false);
        }
    }, []);

    // Fetch shift history records
    const fetchRecords = useCallback(async (silent = false) => {
        if (!silent) setLoadingRecords(true);
        try {
            const params = {};
            if (statusFilter !== 'ALL' && statusFilter !== 'DISCREPANCY') params.status = statusFilter;
            if (staffFilter !== 'ALL') params.staff_id = staffFilter;
            if (dateFilter) params.date = dateFilter;
            if (searchTerm.trim()) params.search = searchTerm.trim();

            const res = await api.get('/cash-float', { params });
            let list = res.data || [];
            if (statusFilter === 'DISCREPANCY') {
                list = list.filter(r => Number(r.shortage_overage || 0) !== 0);
            }
            setRecords(list);
        } catch (err) {
            console.error('Failed to load shift records:', err);
            if (!silent) toast.error('Failed to load cash count history');
        } finally {
            if (!silent) setLoadingRecords(false);
        }
    }, [statusFilter, staffFilter, dateFilter, searchTerm]);

    // Fetch staff list for Admin
    const fetchStaffList = useCallback(async () => {
        if (!isAdmin) return;
        try {
            const res = await api.get('/cash-float/staff-list');
            setStaffList(res.data || []);
        } catch (err) {
            console.error('Failed to load staff list:', err);
        }
    }, [isAdmin]);

    // Fetch admin summary
    const fetchSummary = useCallback(async () => {
        if (!isAdmin) return;
        try {
            const res = await api.get('/cash-float/summary');
            setSummaryStats(res.data || {
                activeCount: 0,
                totalStartingCash: 0,
                totalDrawerBalance: 0,
                totalCashSales: 0
            });
        } catch (err) {
            console.error('Failed to load summary:', err);
        }
    }, [isAdmin]);

    useEffect(() => {
        fetchActiveShift();
        fetchRecords();
        fetchStaffList();
        fetchSummary();

        // Real-time cross-tab & live sync
        const unsubscribe = subscribeToInventoryChange(() => {
            fetchActiveShift(true);
            fetchRecords(true);
            fetchStaffList();
            fetchSummary();
        });

        // 5-second gentle background polling so shift submissions / remittances appear live without restarting or flashing
        const poll = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchActiveShift(true);
            fetchRecords(true);
            fetchSummary();
        }, 5000);

        return () => {
            unsubscribe();
            clearInterval(poll);
        };
    }, [fetchActiveShift, fetchRecords, fetchStaffList, fetchSummary]);

    // ==========================================
    // ACTION HANDLERS
    // ==========================================
    // 1. OPEN SHIFT
    const handleOpenShiftSubmit = async (e) => {
        e.preventDefault();
        const startingAmount = useDenomOpen ? calculateDenomTotal(openShiftForm) : Number(openShiftForm.starting_cash);
        if (startingAmount <= 0) {
            toast.error('Opening Cash Float must be greater than ₱0.00');
            return;
        }

        setOpeningShift(true);
        try {
            const payload = {
                starting_cash: startingAmount,
                notes: openShiftForm.notes,
                staff_id: openShiftForm.staff_id || undefined,
                ...(useDenomOpen ? {
                    bills_1000: openShiftForm.bills_1000,
                    bills_500: openShiftForm.bills_500,
                    bills_200: openShiftForm.bills_200,
                    bills_100: openShiftForm.bills_100,
                    bills_50: openShiftForm.bills_50,
                    bills_20: openShiftForm.bills_20,
                    coins_10: openShiftForm.coins_10,
                    coins_5: openShiftForm.coins_5,
                    coins_1: openShiftForm.coins_1
                } : {})
            };

            const res = await api.post('/cash-float/open-shift', payload);
            toast.success(res.data?.message || 'Shift opened successfully!');
            setActiveTab('active');
            fetchActiveShift();
            fetchRecords();
            fetchSummary();
            notifyInventoryChange('shift_open');
        } catch (err) {
            console.error('Failed to open shift:', err);
            toast.error(err.response?.data?.message || 'Failed to open shift');
        } finally {
            setOpeningShift(false);
        }
    };

    // 2. RECORD PETTY CASH EXPENSE
    const handlePettyCashSubmit = async (e) => {
        e.preventDefault();
        const amt = Number(expenseForm.amount);
        if (amt <= 0) {
            toast.error('Expense amount must be greater than ₱0.00');
            return;
        }
        if (!expenseForm.reason.trim()) {
            toast.error('Please specify a reason or store item for this expense');
            return;
        }

        setSubmittingExpense(true);
        try {
            const res = await api.post('/cash-float/petty-cash', {
                amount: amt,
                category: expenseForm.category,
                reason: expenseForm.reason.trim()
            });

            toast.success(res.data?.message || 'Petty cash expense recorded!');
            setShowExpenseModal(false);
            setExpenseForm({ amount: '', category: 'Store Supplies', reason: '' });
            fetchActiveShift();
            fetchRecords();
            fetchSummary();
            notifyInventoryChange('shift_expense');
        } catch (err) {
            console.error('Failed to record petty cash expense:', err);
            toast.error(err.response?.data?.message || 'Failed to record expense');
        } finally {
            setSubmittingExpense(false);
        }
    };

    // 3. CLOSE SHIFT (BLIND CASH COUNT)
    const handleCloseShiftSubmit = async (e) => {
        e.preventDefault();
        const countedAmount = useDenomClose ? calculateDenomTotal(closeShiftForm) : Number(closeShiftForm.actual_cash);
        if (countedAmount < 0 || isNaN(countedAmount)) {
            toast.error('Please enter a valid actual counted cash amount');
            return;
        }

        setClosingShift(true);
        try {
            const payload = {
                shift_id: activeShift?.id,
                actual_cash: countedAmount,
                notes: closeShiftForm.notes,
                ...(useDenomClose ? {
                    bills_1000: closeShiftForm.bills_1000,
                    bills_500: closeShiftForm.bills_500,
                    bills_200: closeShiftForm.bills_200,
                    bills_100: closeShiftForm.bills_100,
                    bills_50: closeShiftForm.bills_50,
                    bills_20: closeShiftForm.bills_20,
                    coins_10: closeShiftForm.coins_10,
                    coins_5: closeShiftForm.coins_5,
                    coins_1: closeShiftForm.coins_1
                } : {})
            };

            const res = await api.post('/cash-float/close-shift', payload);
            toast.success('Shift closed and reconciled successfully!');
            setShowCloseShiftModal(false);
            setReconResultModal(res.data?.reconciliation || null);
            fetchActiveShift();
            fetchRecords();
            fetchSummary();
            notifyInventoryChange('shift_expense');
        } catch (err) {
            console.error('Failed to close shift:', err);
            toast.error(err.response?.data?.message || 'Failed to close shift');
        } finally {
            setClosingShift(false);
        }
    };

    // 4. ADMIN REMOTE REVIEW & SIGN-OFF MODAL
    const [signOffModalShift, setSignOffModalShift] = useState(null);
    const [signOffVerifiedCash, setSignOffVerifiedCash] = useState('');
    const [signOffNotes, setSignOffNotes] = useState('');
    const [signOffLoadingDetails, setSignOffLoadingDetails] = useState(false);
    const [signOffDetails, setSignOffDetails] = useState(null);

    const handleOpenSignOffModal = async (shift) => {
        if (!isAdmin) return;
        const shiftId = shift.active_float_id || shift.id;
        setSignOffModalShift(shift);
        setSignOffVerifiedCash(String(shift.actual_cash || shift.blind_count_entered || shift.expected_cash || ''));
        setSignOffNotes('');
        setSignOffLoadingDetails(true);
        setSignOffDetails(null);
        try {
            const res = await api.get(`/cash-float/${shiftId}`);
            setSignOffDetails(res.data);
            if (res.data.actual_cash || res.data.blind_count_entered) {
                setSignOffVerifiedCash(String(res.data.actual_cash || res.data.blind_count_entered));
            }
        } catch (err) {
            console.error('Failed to load shift details for sign-off:', err);
        } finally {
            setSignOffLoadingDetails(false);
        }
    };

    const handleConfirmSignOff = async (e) => {
        e.preventDefault();
        if (!signOffModalShift) return;
        const shiftId = signOffModalShift.active_float_id || signOffModalShift.id;
        const shiftCode = signOffModalShift.active_shift_code || signOffModalShift.shift_code || `SHIFT-${shiftId}`;

        setSigningOffId(shiftId);
        try {
            const res = await api.post(`/cash-float/${shiftId}/sign-off`, {
                verified_actual_cash: signOffVerifiedCash ? Number(signOffVerifiedCash) : undefined,
                notes: signOffNotes.trim() || `Verified & approved by Admin ${user?.username || 'admin'}`
            });
            toast.success(res.data?.message || `Shift ${shiftCode} approved and ended!`);
            setSignOffModalShift(null);
            setSignOffDetails(null);
            fetchRecords();
            fetchStaffList();
            fetchSummary();
            fetchActiveShift();
            notifyInventoryChange('shift_signoff');
        } catch (err) {
            console.error('Failed to sign off shift:', err);
            toast.error(err.response?.data?.message || 'Failed to sign off shift');
        } finally {
            setSigningOffId(null);
        }
    };

    const handleAdminSignOff = handleOpenSignOffModal;

    // 5. ADMIN CANCEL SHIFT (Accidental open with 0 sales)
    const handleCancelShift = async (shift) => {
        if (!isAdmin) return;
        const shiftId = shift.active_float_id || shift.id;
        const shiftCode = shift.active_shift_code || shift.shift_code || `SHIFT-${shiftId}`;
        const staffName = shift.username || shift.staff_username || 'staff';
        const confirmMsg = `Cancel accidental shift ${shiftCode} for @${staffName}?\n\nStaff will be reset to Off-Shift. This is only allowed if 0 sales were punched.`;
        if (!window.confirm(confirmMsg)) return;

        setActionInProgressShiftId(shiftId);
        try {
            const res = await api.post(`/cash-float/${shiftId}/cancel`);
            toast.success(res.data?.message || 'Shift canceled successfully.');
            fetchActiveShift();
            fetchRecords();
            fetchStaffList();
            fetchSummary();
            notifyInventoryChange('shift_cancel');
        } catch (err) {
            console.error('Failed to cancel shift:', err);
            toast.error(err.response?.data?.message || 'Failed to cancel shift');
        } finally {
            setActionInProgressShiftId(null);
        }
    };

    // 6. ADMIN REOPEN SHIFT (Undo accidental close / return to selling)
    const handleReopenShift = async (shift) => {
        if (!isAdmin) return;
        const shiftId = shift.active_float_id || shift.id;
        const shiftCode = shift.active_shift_code || shift.shift_code || `SHIFT-${shiftId}`;
        const staffName = shift.username || shift.staff_username || 'staff';
        const confirmMsg = `Reopen shift ${shiftCode} for @${staffName}?\n\nStaff will be put back on Active Duty and can immediately resume punching sales with all previous shift numbers preserved.`;
        if (!window.confirm(confirmMsg)) return;

        setActionInProgressShiftId(shiftId);
        try {
            const res = await api.post(`/cash-float/${shiftId}/reopen`);
            toast.success(res.data?.message || 'Shift reopened successfully!');
            fetchActiveShift();
            fetchRecords();
            fetchStaffList();
            fetchSummary();
            notifyInventoryChange('shift_cancel');
        } catch (err) {
            console.error('Failed to reopen shift:', err);
            toast.error(err.response?.data?.message || 'Failed to reopen shift');
        } finally {
            setActionInProgressShiftId(null);
        }
    };

    // 7. MID-SHIFT CASH DROP (Safe Remittance)
    const handleCashDropSubmit = async (e) => {
        e.preventDefault();
        if (!cashDropShift) return;
        const shiftId = cashDropShift.active_float_id || cashDropShift.id;
        const numAmount = Number(cashDropAmount);
        if (!numAmount || numAmount <= 0) {
            return toast.error('Please enter a valid drop amount');
        }

        setSubmittingCashDrop(true);
        try {
            const res = await api.post(`/cash-float/${shiftId}/cash-drop`, {
                amount: numAmount,
                notes: cashDropNotes.trim()
            });
            toast.success(res.data?.message || `₱${numAmount.toFixed(2)} cash drop logged!`);
            setShowCashDropModal(false);
            setCashDropAmount('');
            setCashDropNotes('');
            setCashDropShift(null);
            fetchActiveShift();
            fetchRecords();
            fetchStaffList();
            fetchSummary();
            notifyInventoryChange('shift_cancel');
        } catch (err) {
            console.error('Failed to log cash drop:', err);
            toast.error(err.response?.data?.message || 'Failed to log cash drop');
        } finally {
            setSubmittingCashDrop(false);
        }
    };

    // 8. ADMIN FORCE TIME-OUT & COUNT
    const handleForceCloseSubmit = async (e) => {
        e.preventDefault();
        if (!forceCloseShift) return;
        const shiftId = forceCloseShift.active_float_id || forceCloseShift.id;
        const numActual = Number(forceCloseActual);
        if (!Number.isFinite(numActual) || numActual < 0) {
            return toast.error('Please enter valid physical cash counted');
        }

        setSubmittingForceClose(true);
        try {
            const res = await api.post('/cash-float/close-shift', {
                shift_id: shiftId,
                actual_cash: numActual,
                notes: forceCloseNotes.trim() || `Force time-out & counted by Admin ${user?.username}`
            });
            toast.success(res.data?.message || 'Shift force closed successfully!');
            setShowForceCloseModal(false);
            setForceCloseActual('');
            setForceCloseNotes('');
            setForceCloseShift(null);
            setReconResultModal(res.data?.reconciliation || null);
            fetchActiveShift();
            fetchRecords();
            fetchStaffList();
            fetchSummary();
            notifyInventoryChange('shift_cancel');
        } catch (err) {
            console.error('Failed to force close shift:', err);
            toast.error(err.response?.data?.message || 'Failed to force close shift');
        } finally {
            setSubmittingForceClose(false);
        }
    };

    // 9. QUICK TIME-IN FOR STAFF
    // 9. DIRECT 1-CLICK TIME-IN (Instant start with standard ₱2,000 float & POS unlock - no modal)
    const handleDirectTimeIn = async (staff, startingFloat = 2000) => {
        if (!isAdmin || !staff) return;

        setActionInProgressShiftId(`timein-${staff.id}`);
        try {
            const res = await api.post('/cash-float/open-shift', {
                staff_id: staff.id,
                starting_cash: Number(startingFloat),
                notes: `Timed-In with ₱${Number(startingFloat).toLocaleString('en-US', { minimumFractionDigits: 2 })} float by Admin ${user?.username || 'admin'}`
            });
            toast.success(res.data?.message || `🟢 Timed-In @${staff.username}! Register unlocked with ₱${Number(startingFloat).toLocaleString('en-US', { minimumFractionDigits: 2 })} float.`);
            fetchActiveShift();
            fetchRecords();
            fetchStaffList();
            fetchSummary();
            notifyInventoryChange('shift_cancel');
        } catch (err) {
            console.error('Failed to time in staff:', err);
            toast.error(err.response?.data?.message || 'Failed to time-in staff');
        } finally {
            setActionInProgressShiftId(null);
        }
    };

    // 11. DIRECT 1-CLICK TIME-OUT (Instant close shift, record timestamp & lock POS)
    const handleDirectTimeOut = async (staff) => {
        if (!isAdmin) return;
        const shiftId = staff.active_float_id || staff.id;
        const staffName = staff.full_name || staff.username;
        const currentDrawerCash = Number(staff.active_cash_balance || staff.active_expected_cash || staff.active_starting_cash || 0);
        const salesCount = Number(staff.active_sales_count || 0);

        const confirmMsg = `Clock Out & End Shift for @${staff.username} (${staffName})?\n\n• Recorded Closing Drawer Cash: ₱${currentDrawerCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• Shift Activity: ${salesCount} sale(s)\n• POS Terminal: Will be locked immediately.\n\nTime-out this staff member now?`;
        if (!window.confirm(confirmMsg)) return;

        setActionInProgressShiftId(shiftId);
        try {
            const res = await api.post('/cash-float/close-shift', {
                shift_id: shiftId,
                actual_cash: currentDrawerCash,
                notes: `Direct 1-Click Time-Out by Admin ${user?.username || 'admin'}. Balanced closing cash: ₱${currentDrawerCash.toFixed(2)}`
            });
            toast.success(res.data?.message || `⏹ Timed-Out @${staff.username}. Shift completed & terminal locked.`);
            fetchActiveShift();
            fetchRecords();
            fetchStaffList();
            fetchSummary();
            notifyInventoryChange('shift_cancel');
        } catch (err) {
            console.error('Failed to time out staff:', err);
            toast.error(err.response?.data?.message || 'Failed to time out staff');
        } finally {
            setActionInProgressShiftId(null);
        }
    };

    return (
        <div style={{ position: 'relative', height: '100%', paddingBottom: '30px' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Banknote size={24} color="var(--primary)" /> Shifts & Cash Drawer
                    </h1>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        Holds cashiers accountable for every peso in the cash drawer from opening change fund to closing blind count.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {isAdmin && !activeShift && (
                        <button
                            type="button"
                            onClick={() => {
                                setOpenShiftForm({ ...openShiftForm, staff_id: user?.id || '' });
                                setActiveTab('open_shift');
                            }}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.84rem' }}
                        >
                            <Plus size={16} /> Open Shift (Starting Float)
                        </button>
                    )}
                    {activeShift && activeShift.status === 'ACTIVE' && (
                        <button
                            type="button"
                            onClick={() => {
                                setCloseShiftForm({
                                    actual_cash: '',
                                    notes: '',
                                    bills_1000: 0, bills_500: 0, bills_200: 0, bills_100: 0, bills_50: 0, bills_20: 0, coins_10: 0, coins_5: 0, coins_1: 0
                                });
                                setShowCloseShiftModal(true);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                fontSize: '0.84rem',
                                background: isAdmin ? '#dc2626' : '#d97706',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            <Lock size={15} /> {isAdmin ? 'End Shift & Remit' : 'Submit Closing Count'}
                        </button>
                    )}
                    {activeShift && activeShift.status === 'PENDING_REMIT' && !isAdmin && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            fontSize: '0.82rem',
                            background: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid rgba(245, 158, 11, 0.35)',
                            color: '#f59e0b',
                            borderRadius: '8px',
                            fontWeight: 700
                        }}>
                            <Clock size={15} /> Preliminary Count Submitted • Awaiting Admin Sign-Off
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '1px solid var(--border)',
                marginBottom: '20px',
                flexWrap: 'wrap'
            }}>
                <button
                    type="button"
                    onClick={() => handleTabChange('active')}
                    style={{
                        padding: '10px 18px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'active' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'active' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'active' ? 700 : 500,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Banknote size={17} /> Active Shift Tracker {activeShift ? '🟢' : '⚪'}
                </button>

                <button
                    type="button"
                    onClick={() => handleTabChange('history')}
                    style={{
                        padding: '10px 18px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'history' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'history' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'history' ? 700 : 500,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Clock size={17} /> Cash Count History ({records.length})
                </button>

                {isAdmin && (
                    <button
                        type="button"
                        onClick={() => handleTabChange('manage')}
                        style={{
                            padding: '10px 18px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'manage' ? '3px solid var(--primary)' : '3px solid transparent',
                            color: activeTab === 'manage' ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: activeTab === 'manage' ? 700 : 500,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Users size={17} /> Staff Drawer Control Panel ({staffList.length})
                    </button>
                )}
            </div>

            {/* ============================================================ */}
            {/* TAB: OPEN SHIFT / ASSIGN STARTING FLOAT FORM                 */}
            {/* ============================================================ */}
            {activeTab === 'open_shift' && (
                <div style={{ maxWidth: '640px', margin: '0 auto 24px auto' }}>
                    <div style={{
                        borderRadius: '16px',
                        padding: '28px',
                        border: '1.5px solid #10b981',
                        backgroundColor: '#1a1f1b',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <div style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '10px',
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Banknote size={24} color="#10b981" />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#f4f4f5' }}>
                                    {isAdmin ? 'Open Cashier Shift / Assign Starting Float' : 'Open Shift (Starting Float Entry)'}
                                </h2>
                                <p style={{ margin: '3px 0 0 0', fontSize: '0.84rem', color: '#a1a1aa' }}>
                                    Record the opening cash float (panukli in coins and small bills) loaded into the register drawer.
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleOpenShiftSubmit} style={{ marginTop: '20px' }}>
                            {/* If Admin, allow selecting staff member */}
                            {isAdmin && staffList.length > 0 && (
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, color: '#f4f4f5', marginBottom: '6px' }}>
                                        Assign To Cashier / Staff:
                                    </label>
                                    <select
                                        value={openShiftForm.staff_id}
                                        onChange={(e) => setOpenShiftForm({ ...openShiftForm, staff_id: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 14px',
                                            fontSize: '0.88rem',
                                            backgroundColor: '#272d28',
                                            color: '#ffffff',
                                            border: '1.5px solid #3f4a41',
                                            borderRadius: '8px',
                                            outline: 'none',
                                            fontWeight: 600
                                        }}
                                    >
                                        <option value={user?.id}>Me ({user?.username} - Admin)</option>
                                        {staffList.filter(s => s.id !== user?.id).map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.full_name || s.username} ({s.role})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Denomination Counter Toggle */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f4f4f5' }}>
                                    Starting Cash Fund:
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setUseDenomOpen(!useDenomOpen)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#34d399',
                                        fontSize: '0.82rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <Coins size={15} /> {useDenomOpen ? 'Switch to Quick Amount' : 'Use Coin & Bill Breakdown'}
                                </button>
                            </div>

                            {!useDenomOpen ? (
                                <div style={{ marginBottom: '18px' }}>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{
                                            position: 'absolute',
                                            left: '14px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            fontWeight: 900,
                                            fontSize: '1.45rem',
                                            color: '#10b981'
                                        }}>₱</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="1"
                                            style={{
                                                width: '100%',
                                                padding: '12px 16px 12px 42px',
                                                fontSize: '1.45rem',
                                                fontWeight: 900,
                                                fontFamily: 'monospace',
                                                backgroundColor: '#0f172a',
                                                color: '#10b981',
                                                border: '2px solid #10b981',
                                                borderRadius: '10px',
                                                outline: 'none',
                                                boxShadow: '0 0 12px rgba(16, 185, 129, 0.35)'
                                            }}
                                            placeholder="2000.00"
                                            value={openShiftForm.starting_cash}
                                            onChange={(e) => setOpenShiftForm({ ...openShiftForm, starting_cash: e.target.value })}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                                        {['1000', '1500', '2000', '3000', '5000'].map(preset => {
                                            const isSelected = String(openShiftForm.starting_cash) === String(preset);
                                            return (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => setOpenShiftForm({ ...openShiftForm, starting_cash: preset })}
                                                    style={{
                                                        fontSize: '0.88rem',
                                                        fontWeight: 800,
                                                        padding: '8px 16px',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                        backgroundColor: isSelected ? '#10b981' : '#1e293b',
                                                        color: '#ffffff',
                                                        border: isSelected ? '2px solid #34d399' : '1.5px solid #64748b',
                                                        boxShadow: isSelected ? '0 2px 10px rgba(16, 185, 129, 0.55)' : 'none'
                                                    }}
                                                >
                                                    ₱{preset}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div style={{
                                    backgroundColor: '#242a25',
                                    border: '1.5px solid #3f4a41',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    marginBottom: '18px'
                                }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f4f4f5', marginBottom: '10px' }}>
                                        Itemized Bill & Coin Count:
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '0.8rem' }}>
                                        {[
                                            { key: 'bills_1000', label: '₱1,000' },
                                            { key: 'bills_500', label: '₱500' },
                                            { key: 'bills_200', label: '₱200' },
                                            { key: 'bills_100', label: '₱100' },
                                            { key: 'bills_50', label: '₱50' },
                                            { key: 'bills_20', label: '₱20' },
                                            { key: 'coins_10', label: '₱10 coin' },
                                            { key: 'coins_5', label: '₱5 coin' },
                                            { key: 'coins_1', label: '₱1 coin' }
                                        ].map(denom => (
                                            <div key={denom.key}>
                                                <label style={{ display: 'block', marginBottom: '4px', color: '#d4d4d8', fontWeight: 600 }}>{denom.label}:</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    style={{
                                                        width: '100%',
                                                        padding: '7px 8px',
                                                        fontSize: '0.9rem',
                                                        fontWeight: 700,
                                                        textAlign: 'center',
                                                        backgroundColor: '#1b201c',
                                                        color: '#ffffff',
                                                        border: '1px solid #455047',
                                                        borderRadius: '6px'
                                                    }}
                                                    value={openShiftForm[denom.key] || 0}
                                                    onChange={(e) => setOpenShiftForm({ ...openShiftForm, [denom.key]: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #3f4a41', textAlign: 'right', fontWeight: 800, fontSize: '1rem', color: '#34d399' }}>
                                        Computed Total: {formatCurrency(calculateDenomTotal(openShiftForm))}
                                    </div>
                                </div>
                            )}

                            <div style={{ marginBottom: '22px' }}>
                                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, color: '#f4f4f5', marginBottom: '6px' }}>
                                    Opening Shift Notes (Optional):
                                </label>
                                <input
                                    type="text"
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        fontSize: '0.88rem',
                                        backgroundColor: '#272d28',
                                        color: '#ffffff',
                                        border: '1.5px solid #3f4a41',
                                        borderRadius: '8px',
                                        outline: 'none'
                                    }}
                                    placeholder="Morning register 1 opening; coins verified."
                                    value={openShiftForm.notes}
                                    onChange={(e) => setOpenShiftForm({ ...openShiftForm, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '14px', borderTop: '1px solid #333d35' }}>
                                <button
                                    type="button"
                                    onClick={() => handleTabChange('active')}
                                    style={{
                                        padding: '10px 20px',
                                        fontSize: '0.86rem',
                                        fontWeight: 600,
                                        backgroundColor: '#353c37',
                                        color: '#f4f4f5',
                                        borderRadius: '8px',
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        padding: '10px 24px',
                                        fontSize: '0.88rem',
                                        fontWeight: 800,
                                        backgroundColor: '#10b981',
                                        color: '#ffffff',
                                        borderRadius: '8px',
                                        border: 'none',
                                        cursor: openingShift ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                                    }}
                                    disabled={openingShift}
                                >
                                    {openingShift ? 'Opening Shift...' : 'Open Register & Start Shift'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* TAB 1: ACTIVE SHIFT TRACKER                                  */}
            {/* ============================================================ */}
            {activeTab === 'active' && (
                <div>
                    {!activeShift ? (
                        /* No Active Shift: Prominent Open Shift Card */
                        <div className="glass-panel" style={{ padding: '40px 24px', textAlign: 'center', borderRadius: '14px', maxWidth: '650px', margin: '20px auto' }}>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: '16px',
                                background: 'rgba(22, 163, 74, 0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 16px auto',
                                color: 'var(--primary)'
                            }}>
                                <Banknote size={32} />
                            </div>

                            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 800 }}>
                                Register is Closed • Open Shift Required
                            </h2>
                            <p style={{ margin: '0 0 24px 0', fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Log in at the start of your cashier duty and enter your <strong>Opening Cash Float / Starting Change Fund</strong> (panukli in coins and small bills). Every peso will be tracked automatically until closing.
                            </p>

                            <button
                                type="button"
                                onClick={() => {
                                    setOpenShiftForm({ ...openShiftForm, staff_id: user?.id || '' });
                                    setActiveTab('open_shift');
                                }}
                                className="btn-primary"
                                style={{ padding: '10px 24px', fontSize: '0.92rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                            >
                                <Plus size={18} /> Open Shift & Enter Starting Float
                            </button>
                        </div>
                    ) : (
                        /* Active Shift Running: Real-time Silent Tracker */
                        <div>
                            {/* Shift Status Header Card */}
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.1) 0%, rgba(59, 130, 246, 0.08) 100%)',
                                border: '1.5px solid rgba(22, 163, 74, 0.4)',
                                borderRadius: '14px',
                                padding: '18px 24px',
                                marginBottom: '20px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '14px'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <span style={{
                                            fontSize: '0.72rem',
                                            fontWeight: 800,
                                            background: '#16a34a',
                                            color: '#ffffff',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            textTransform: 'uppercase'
                                        }}>
                                            🟢 Active Shift
                                        </span>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                                            {activeShift.shift_code || 'SHIFT-' + activeShift.id}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                        Cashier on Duty: <strong style={{ color: 'var(--text-main)' }}>{activeShift.staff_username}</strong>
                                        {' '}• Opened: <strong>{formatAuditDate(activeShift.assigned_at)}</strong>
                                        {activeShift.notes && ` • "${activeShift.notes}"`}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowExpenseModal(true)}
                                        className="btn-secondary"
                                        style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <MinusCircle size={15} color="#ef4444" /> Record Petty Cash Expense
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCashDropShift(activeShift);
                                            setCashDropAmount('');
                                            setCashDropNotes('');
                                            setShowCashDropModal(true);
                                        }}
                                        className="btn-secondary"
                                        style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <Coins size={15} color="#3b82f6" /> Log Cash Drop (Safe Remit)
                                    </button>

                                    {activeShift.status === 'ACTIVE' ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCloseShiftForm({
                                                    actual_cash: '',
                                                    notes: '',
                                                    bills_1000: 0, bills_500: 0, bills_200: 0, bills_100: 0, bills_50: 0, bills_20: 0, coins_10: 0, coins_5: 0, coins_1: 0
                                                });
                                                setShowCloseShiftModal(true);
                                            }}
                                            style={{
                                                background: isAdmin ? '#dc2626' : '#d97706',
                                                color: '#ffffff',
                                                border: 'none',
                                                borderRadius: '8px',
                                                padding: '8px 16px',
                                                fontSize: '0.82rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <Lock size={15} /> {isAdmin ? 'End Shift & Remit' : 'Submit Closing Count'}
                                        </button>
                                    ) : (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 14px',
                                            fontSize: '0.8rem',
                                            background: 'rgba(245, 158, 11, 0.15)',
                                            border: '1px solid rgba(245, 158, 11, 0.35)',
                                            color: '#f59e0b',
                                            borderRadius: '8px',
                                            fontWeight: 700
                                        }}>
                                            <Clock size={15} /> Count Submitted • Awaiting Admin Verification
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 5 Real-time Cash Tracker Cards */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                                gap: '14px',
                                marginBottom: '22px'
                            }}>
                                {/* 1. Opening Cash Float */}
                                <div style={{
                                    background: 'var(--surface)',
                                    border: '1.5px solid #2563eb',
                                    borderRadius: '12px',
                                    padding: '14px 18px',
                                    boxShadow: 'var(--glass-shadow)'
                                }}>
                                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                        Opening Cash Float
                                    </div>
                                    <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#3b82f6', marginTop: '6px', fontFamily: 'monospace' }}>
                                        {formatCurrency(activeShift.starting_cash)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Starting change fund (panukli)
                                    </div>
                                </div>

                                {/* 2. Cash Sales In */}
                                <div style={{
                                    background: 'var(--surface)',
                                    border: '1.5px solid #16a34a',
                                    borderRadius: '12px',
                                    padding: '14px 18px',
                                    boxShadow: 'var(--glass-shadow)'
                                }}>
                                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                        Cash Sales In (+)
                                    </div>
                                    <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#16a34a', marginTop: '6px', fontFamily: 'monospace' }}>
                                        +{formatCurrency(activeShift.cash_sales || 0)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {activeShift.sales_count || 0} receipt{activeShift.sales_count !== 1 ? 's' : ''} issued
                                    </div>
                                </div>

                                {/* 3. GCash Sales (Digital) */}
                                <div style={{
                                    background: 'var(--surface)',
                                    border: '1.5px solid #0284c7',
                                    borderRadius: '12px',
                                    padding: '14px 18px',
                                    boxShadow: 'var(--glass-shadow)'
                                }}>
                                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                        GCash Sales In (Digital)
                                    </div>
                                    <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#0284c7', marginTop: '6px', fontFamily: 'monospace' }}>
                                        {formatCurrency(activeShift.gcash_sales || 0)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Silently tracked (wallet, not drawer)
                                    </div>
                                </div>

                                {/* 4. Petty Cash Expenses Out */}
                                <div style={{
                                    background: 'var(--surface)',
                                    border: '1.5px solid #dc2626',
                                    borderRadius: '12px',
                                    padding: '14px 18px',
                                    boxShadow: 'var(--glass-shadow)'
                                }}>
                                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                        Petty Expenses Out (-)
                                    </div>
                                    <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#dc2626', marginTop: '6px', fontFamily: 'monospace' }}>
                                        -{formatCurrency(activeShift.petty_cash_expenses || 0)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Tape, water, snacks, supplies
                                    </div>
                                </div>
                            </div>

                            {/* Full-Width Expected Drawer Cash Highlight */}
                            <div style={{
                                background: 'var(--surface)',
                                border: '2px solid var(--primary)',
                                borderRadius: '12px',
                                padding: '18px 24px',
                                marginBottom: '22px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '16px'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Expected Physical Drawer Cash
                                    </div>
                                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-main)', fontFamily: 'monospace', lineHeight: 1.1, marginTop: '4px' }}>
                                        {formatCurrency(activeShift.current_cash_balance)}
                                    </div>
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Formula: Opening Float ({formatCurrency(activeShift.starting_cash)}) + Cash Sales (+{formatCurrency(activeShift.cash_sales || 0)}) − Petty Cash (-{formatCurrency(activeShift.petty_cash_expenses || 0)}) − Mid-Shift Drops (-{formatCurrency(activeShift.cash_drops || 0)})
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    <span style={{
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        background: 'rgba(22, 163, 74, 0.12)',
                                        color: 'var(--primary)',
                                        padding: '4px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(22, 163, 74, 0.3)'
                                    }}>
                                        Register Drawer In Sync
                                    </span>
                                </div>
                            </div>

                            {/* Recent Cash Drawer Movements */}
                            <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Coins size={18} color="var(--primary)" /> Cash Drawer Movements During This Shift
                                    </h3>
                                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                        {activeShift.movements?.length || 0} movement{activeShift.movements?.length !== 1 ? 's' : ''} logged
                                    </span>
                                </div>

                                <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                                    <table className="table" style={{ margin: 0 }}>
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>Movement Type</th>
                                                <th>Reference</th>
                                                <th>Amount</th>
                                                <th>Balance Before</th>
                                                <th>Balance After</th>
                                                <th>Notes / Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {!activeShift.movements || activeShift.movements.length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                                                        No sales or expenses recorded yet in this shift.
                                                    </td>
                                                </tr>
                                            ) : (
                                                activeShift.movements.map(m => (
                                                    <tr key={m.id}>
                                                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                            {formatAuditDate(m.created_at)}
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700,
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                background: m.movement_type === 'CASH_SALE' ? 'rgba(22, 163, 74, 0.12)' : (m.movement_type === 'PETTY_CASH_EXPENSE' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)'),
                                                                color: m.movement_type === 'CASH_SALE' ? '#16a34a' : (m.movement_type === 'PETTY_CASH_EXPENSE' ? '#ef4444' : '#3b82f6')
                                                            }}>
                                                                {m.movement_type}
                                                            </span>
                                                        </td>
                                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>
                                                            {m.reference_id || 'N/A'}
                                                        </td>
                                                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: m.movement_type === 'PETTY_CASH_EXPENSE' ? '#ef4444' : 'var(--text-main)' }}>
                                                            {m.movement_type === 'PETTY_CASH_EXPENSE' ? '-' : '+'}{formatCurrency(m.amount)}
                                                        </td>
                                                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                            {formatCurrency(m.balance_before)}
                                                        </td>
                                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>
                                                            {formatCurrency(m.balance_after)}
                                                        </td>
                                                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                            {m.notes || '—'}
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
                </div>
            )}

            {/* ============================================================ */}
            {/* TAB 2: CASH COUNT HISTORY                                    */}
            {/* ============================================================ */}
            {activeTab === 'history' && (
                <div>
                    {/* Filter Bar */}
                    <div className="glass-panel" style={{ padding: '12px 16px', borderRadius: '12px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'nowrap', width: '100%' }}>
                            <div style={{ position: 'relative', flex: '1 1 auto', minWidth: '180px' }}>
                                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    className="input-premium"
                                    style={{ paddingLeft: '32px', width: '100%', fontSize: '0.82rem' }}
                                    placeholder="Search by Shift ID or Cashier..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <select
                                className="input-premium"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                style={{ width: '175px', flexShrink: 0, padding: '7px 10px', fontSize: '0.82rem' }}
                            >
                                <option value="ALL">All Shift Statuses</option>
                                <option value="ACTIVE">Active Shifts Only</option>
                                <option value="COMPLETED">Completed / Reconciled</option>
                                <option value="DISCREPANCY">Discrepancy (Short/Over)</option>
                            </select>

                            <input
                                type="date"
                                className="input-premium"
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                style={{ width: '140px', flexShrink: 0, padding: '6px 10px', fontSize: '0.82rem' }}
                            />

                            {(searchTerm || statusFilter !== 'ALL' || dateFilter) && (
                                <button
                                    type="button"
                                    onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setDateFilter(''); }}
                                    className="btn-secondary"
                                    style={{ padding: '7px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Shift History Table (6-Column Compact 1366x768 Optimized) */}
                    <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                        <div className="table-container">
                            <table className="table" style={{ margin: 0 }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '9px 12px', minWidth: '150px' }}>Shift & Cashier</th>
                                        <th style={{ padding: '9px 12px', minWidth: '170px' }}>Shift Duration</th>
                                        <th style={{ padding: '9px 12px', minWidth: '100px', textAlign: 'right' }}>Opening Float</th>
                                        <th style={{ padding: '9px 12px', minWidth: '125px', textAlign: 'right' }}>Actual / Expected</th>
                                        <th style={{ padding: '9px 12px', minWidth: '115px', textAlign: 'center' }}>Variance</th>
                                        <th style={{ padding: '9px 12px', minWidth: '145px', textAlign: 'right', paddingRight: '14px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingRecords ? (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                                                <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 8px auto' }} />
                                                <div>Loading cash count history...</div>
                                            </td>
                                        </tr>
                                    ) : records.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                                                <Clock size={32} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
                                                <div>No shift records found matching your filters.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        records.map(shift => {
                                            const isClosed = shift.status === 'COMPLETED' || shift.status === 'RETURNED';
                                            const hasActualCount = shift.actual_cash !== null && shift.actual_cash !== undefined && String(shift.actual_cash).trim() !== '';
                                            const actualCashNum = hasActualCount ? Number(shift.actual_cash) : null;
                                            const expectedCashNum = Number(shift.expected_cash || 0);

                                            let variance = null;
                                            if (shift.shortage_overage !== null && shift.shortage_overage !== undefined && String(shift.shortage_overage).trim() !== '') {
                                                variance = Number(shift.shortage_overage);
                                            } else if (hasActualCount) {
                                                variance = actualCashNum - expectedCashNum;
                                            }

                                            const shortCode = (shift.shift_code || `SHIFT-${String(shift.id).padStart(3, '0')}`).replace(/^SHIFT-/i, 'SH-');

                                            return (
                                                <tr key={shift.id}>
                                                    {/* Col 1: Shift & Cashier */}
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.86rem' }}>
                                                            {shift.staff_full_name || shift.staff_username}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                            <span style={{
                                                                fontFamily: 'monospace',
                                                                fontWeight: 800,
                                                                background: 'rgba(59, 130, 246, 0.1)',
                                                                color: '#3b82f6',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                border: '1px solid rgba(59, 130, 246, 0.25)',
                                                                fontSize: '0.72rem'
                                                            }}>
                                                                {shortCode}
                                                            </span>
                                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                                • {shift.staff_role ? shift.staff_role.charAt(0).toUpperCase() + shift.staff_role.slice(1) : 'Cashier'}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Col 2: Shift Duration */}
                                                    <td style={{ padding: '8px 12px', fontSize: '0.78rem' }}>
                                                        <div style={{ color: 'var(--text-main)' }}>
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>In: </span>
                                                            {formatAuditDate(shift.assigned_at)}
                                                        </div>
                                                        <div style={{ marginTop: '2px' }}>
                                                            {isClosed ? (
                                                                <div>
                                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Out: </span>
                                                                    <span style={{ color: 'var(--text-muted)' }}>{formatAuditDate(shift.completed_at || shift.returned_at)}</span>
                                                                </div>
                                                            ) : (
                                                                <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.72rem' }}>🟢 Active On Duty</span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Col 3: Opening Float */}
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-main)', fontSize: '0.84rem' }}>
                                                        {formatCurrency(shift.starting_cash)}
                                                    </td>

                                                    {/* Col 4: Actual / Expected */}
                                                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.86rem', color: isClosed && hasActualCount ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                                            {!isClosed ? '— (Active)' : hasActualCount ? formatCurrency(actualCashNum) : '— (Pending)'}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                                                            Exp: {formatCurrency(shift.expected_cash)}
                                                        </div>
                                                    </td>

                                                    {/* Col 5: Variance */}
                                                    <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        {!isClosed ? (
                                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>On Duty</span>
                                                        ) : !hasActualCount ? (
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700,
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(245, 158, 11, 0.12)',
                                                                color: '#f59e0b',
                                                                border: '1px solid rgba(245, 158, 11, 0.25)',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                <Clock size={11} /> Pending Count
                                                            </span>
                                                        ) : Math.abs(variance) < 0.01 ? (
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: 800,
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(22, 163, 74, 0.12)',
                                                                color: '#16a34a',
                                                                border: '1px solid rgba(22, 163, 74, 0.25)',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px'
                                                            }}>
                                                                <Check size={11} /> ✓ Balanced
                                                            </span>
                                                        ) : variance < 0 ? (
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: 800,
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(239, 68, 68, 0.12)',
                                                                color: '#ef4444',
                                                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px'
                                                            }}>
                                                                <TrendingDown size={11} /> -{formatCurrency(Math.abs(variance))}
                                                            </span>
                                                        ) : (
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: 800,
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(245, 158, 11, 0.12)',
                                                                color: '#f59e0b',
                                                                border: '1px solid rgba(245, 158, 11, 0.25)',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px'
                                                            }}>
                                                                <TrendingUp size={11} /> +{formatCurrency(variance)}
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Col 6: Actions */}
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', paddingRight: '14px' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                                                            {shift.admin_signed_off ? (
                                                                <span style={{
                                                                    fontSize: '0.70rem',
                                                                    fontWeight: 700,
                                                                    color: '#16a34a',
                                                                    background: 'rgba(22, 163, 74, 0.1)',
                                                                    border: '1px solid rgba(22, 163, 74, 0.25)',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '5px',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '3px'
                                                                }}>
                                                                    <ShieldCheck size={12} /> {shift.signed_off_by_name || 'Admin'}
                                                                </span>
                                                            ) : isClosed && isAdmin ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAdminSignOff(shift)}
                                                                    className="btn-primary"
                                                                    style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                    disabled={signingOffId === shift.id}
                                                                >
                                                                    <ShieldCheck size={12} /> {signingOffId === shift.id ? 'Signing...' : 'Sign Off'}
                                                                </button>
                                                            ) : null}

                                                            <button
                                                                type="button"
                                                                onClick={() => setViewShiftDetails(shift)}
                                                                className="btn-secondary"
                                                                style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                <Eye size={12} /> Slip
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* TAB 3: STAFF DRAWER CONTROL PANEL (ADMIN ONLY)               */}
            {/* ============================================================ */}
            {activeTab === 'manage' && isAdmin && (
                <div>
                    {/* Top 3 Live Status Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '16px',
                        marginBottom: '22px'
                    }}>
                        {/* 1. Active Drawer Status */}
                        <div style={{
                            background: 'var(--surface)',
                            border: summaryStats.activeCount > 0 ? '1.5px solid #10b981' : '1.5px solid var(--border)',
                            borderRadius: '14px',
                            padding: '16px 20px',
                            boxShadow: 'var(--glass-shadow)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '8px'
                        }}>
                            <div>
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Active Drawer &amp; POS Status
                                </div>
                                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: summaryStats.activeCount > 0 ? '#10b981' : 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{summaryStats.activeStaffName ? summaryStats.activeStaffName : 'No Active Shift'}</span>
                                    {summaryStats.activeCount > 0 ? (
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                            POS UNLOCKED 🟢
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                            POS LOCKED 🔒
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                {summaryStats.activeCount > 0 ? (
                                    <>
                                        Shift: <strong style={{ color: 'var(--text-main)', fontFamily: 'monospace' }}>{summaryStats.activeShiftCode || 'ACTIVE'}</strong> • Timed In: <strong>{formatAuditDate(summaryStats.activeStartTime)}</strong>
                                    </>
                                ) : (
                                    'Cashier cannot ring up POS sales until a shift is timed-in & assigned float.'
                                )}
                            </div>
                        </div>

                        {/* 2. Live Expected Drawer Cash */}
                        <div style={{
                            background: 'var(--surface)',
                            border: '1.5px solid #3b82f6',
                            borderRadius: '14px',
                            padding: '16px 20px',
                            boxShadow: 'var(--glass-shadow)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '8px'
                        }}>
                            <div>
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Live Expected Drawer Cash
                                </div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#3b82f6', marginTop: '4px', fontFamily: 'monospace' }}>
                                    {formatCurrency(summaryStats.totalDrawerBalance)}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                Float: <strong>{formatCurrency(summaryStats.totalStartingCash)}</strong> • Sales: <strong style={{ color: '#10b981' }}>+{formatCurrency(summaryStats.totalCashSales)}</strong> • Drops: <strong style={{ color: '#ef4444' }}>-{formatCurrency(summaryStats.totalCashDrops || 0)}</strong>
                            </div>
                        </div>

                        {/* 3. Pending Remittances to Sign Off */}
                        <div style={{
                            background: 'var(--surface)',
                            border: summaryStats.pendingSignOffCount > 0 ? '1.5px solid #f59e0b' : '1.5px solid var(--border)',
                            borderRadius: '14px',
                            padding: '16px 20px',
                            boxShadow: 'var(--glass-shadow)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '8px'
                        }}>
                            <div>
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Pending Remittances to Sign Off
                                </div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: summaryStats.pendingSignOffCount > 0 ? '#f59e0b' : 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{summaryStats.pendingSignOffCount || 0} Shift{summaryStats.pendingSignOffCount !== 1 ? 's' : ''}</span>
                                    {summaryStats.pendingSignOffCount > 0 && (
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                            ACTION NEEDED
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                {summaryStats.pendingSignOffCount > 0
                                    ? `Total: ${formatCurrency(summaryStats.pendingSignOffAmount || 0)} physical cash waiting for owner verification.`
                                    : 'All closed shifts have been verified and signed off.'}
                            </div>
                        </div>
                    </div>

                    {/* 6-Column Control Table */}
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Users size={18} color="var(--primary)" /> Staff Drawer Management &amp; Time Controls
                                </h3>
                                <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    Time-in staff with starting change fund, monitor real-time drawer totals, log safe drops, and sign off shift remittances.
                                </p>
                            </div>
                            {staffList.length > 0 && !staffList.some(s => s.active_shift_status === 'ACTIVE') && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const target = staffList.find(s => !s.active_float_id) || staffList[0];
                                        if (target) handleDirectTimeIn(target, 2000);
                                    }}
                                    className="btn-primary"
                                    style={{ padding: '7px 16px', fontSize: '0.82rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}
                                    title="Immediately time-in cashier with standard ₱2,000 float and unlock POS terminal"
                                >
                                    <Plus size={15} /> Time-In Cashier &amp; Assign Float
                                </button>
                            )}
                        </div>

                        <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                            <table className="table" style={{ margin: 0 }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '10px 14px' }}>Staff &amp; Role</th>
                                        <th style={{ padding: '10px 14px' }}>Shift Status</th>
                                        <th style={{ padding: '10px 14px' }}>Time-In / Time-Out</th>
                                        <th style={{ padding: '10px 14px' }}>Drawer Math</th>
                                        <th style={{ padding: '10px 14px' }}>Txns in Shift</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Admin Control Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {staffList.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                                                No active cashier or staff accounts found.
                                            </td>
                                        </tr>
                                    ) : (
                                        staffList.map(s => {
                                            const hasActive = !!s.active_float_id;
                                            const status = s.active_shift_status || (hasActive ? 'ACTIVE' : 'OFF');
                                            const salesCount = Number(s.active_sales_count || 0);
                                            const isActionBusy = actionInProgressShiftId === s.active_float_id;

                                            return (
                                                <tr key={s.id}>
                                                    {/* Col 1: Staff & Role */}
                                                    <td style={{ padding: '12px 14px' }}>
                                                        <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.88rem' }}>
                                                            {s.full_name || s.username}
                                                        </div>
                                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                            <span>@{s.username}</span>
                                                            <span style={{ fontSize: '0.68rem', background: 'var(--surface-hover)', padding: '1px 6px', borderRadius: '4px', textTransform: 'capitalize' }}>
                                                                {s.role}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Col 2: Shift Status */}
                                                    <td style={{ padding: '12px 14px' }}>
                                                        {status === 'ACTIVE' ? (
                                                            <div>
                                                                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#16a34a', background: 'rgba(22, 163, 74, 0.12)', border: '1px solid rgba(22, 163, 74, 0.3)', padding: '3px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                    🟢 On-Shift (Selling)
                                                                </span>
                                                                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: '3px' }}>
                                                                    {s.active_shift_code || `SHIFT-${s.active_float_id}`}
                                                                </div>
                                                            </div>
                                                        ) : status === 'PENDING_REMIT' ? (
                                                            <div>
                                                                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '3px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                    🟡 Pending Remittance
                                                                </span>
                                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                                                    Waiting Sign-Off
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface-hover)', padding: '3px 8px', borderRadius: '6px' }}>
                                                                    ⚪ Off-Shift
                                                                </span>
                                                                <div style={{ fontSize: '0.70rem', color: '#ef4444', marginTop: '2px' }}>
                                                                    Terminal Locked
                                                                </div>
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Col 3: Time-In / Time-Out Status & Duration */}
                                                    <td style={{ padding: '12px 14px' }}>
                                                        {status === 'ACTIVE' ? (() => {
                                                            const diffMs = s.active_float_assigned_at ? (Date.now() - new Date(s.active_float_assigned_at).getTime()) : 0;
                                                            const totalMins = Math.max(0, Math.floor(diffMs / 60000));
                                                            const hrs = Math.floor(totalMins / 60);
                                                            const mins = totalMins % 60;
                                                            const isOvertime = hrs >= 8;

                                                            return (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                    <div style={{ fontSize: '0.78rem' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                            <span style={{ color: '#16a34a', fontWeight: 800 }}>🟢 IN:</span>
                                                                            <strong>{formatAuditDate(s.active_float_assigned_at)}</strong>
                                                                        </div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', fontSize: '0.74rem' }}>
                                                                            <span style={{ color: 'var(--text-muted)' }}>⏱ On-Duty:</span>
                                                                            <strong style={{ color: isOvertime ? '#d97706' : 'var(--text-main)' }}>
                                                                                {hrs}h {mins}m
                                                                            </strong>
                                                                        </div>
                                                                    </div>
                                                                    {isOvertime ? (
                                                                        <span style={{
                                                                            marginTop: '3px',
                                                                            padding: '2px 7px',
                                                                            borderRadius: '4px',
                                                                            fontSize: '0.68rem',
                                                                            fontWeight: 800,
                                                                            background: 'rgba(245, 158, 11, 0.15)',
                                                                            color: '#d97706',
                                                                            border: '1px solid rgba(245, 158, 11, 0.35)',
                                                                            width: 'fit-content',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px'
                                                                        }}>
                                                                            ⏱️ Overtime / Remit Due
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.70rem', color: '#10b981', fontWeight: 700, marginTop: '2px' }}>
                                                                            ● Active on Register
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })() : status === 'PENDING_REMIT' ? (
                                                            <div style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                <div>
                                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.70rem' }}>In: </span>
                                                                    <strong>{formatAuditDate(s.active_float_assigned_at)}</strong>
                                                                </div>
                                                                <div>
                                                                    <span style={{ color: '#f59e0b', fontSize: '0.70rem', fontWeight: 700 }}>Remit: </span>
                                                                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                                                                        {s.active_float_completed_at ? formatAuditDate(s.active_float_completed_at) : 'Submitted (Pending Admin)'}
                                                                    </span>
                                                                </div>
                                                                <span style={{
                                                                    marginTop: '2px',
                                                                    padding: '2px 7px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.68rem',
                                                                    fontWeight: 800,
                                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                                    color: '#d97706',
                                                                    border: '1px solid rgba(245, 158, 11, 0.35)',
                                                                    width: 'fit-content'
                                                                }}>
                                                                    ⏳ Awaiting Admin Sign-Off
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                {s.last_shift_assigned_at ? (
                                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                                                                        <div><span>Last In:</span> <strong>{formatAuditDate(s.last_shift_assigned_at)}</strong></div>
                                                                        <div><span>Last Out:</span> <strong>{s.last_shift_completed_at ? formatAuditDate(s.last_shift_completed_at) : 'Ended'}</strong></div>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                                        ⚪ Off-Duty
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Col 4: Drawer Math */}
                                                    <td style={{ padding: '12px 14px' }}>
                                                        {hasActive ? (
                                                            <div style={{ fontFamily: 'monospace', fontSize: '0.80rem' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                                    <span style={{ color: 'var(--text-muted)' }}>Float:</span>
                                                                    <span>{formatCurrency(s.active_starting_cash)}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: '#16a34a' }}>
                                                                    <span>Sales:</span>
                                                                    <span>+{formatCurrency(s.active_cash_sales)}</span>
                                                                </div>
                                                                {Number(s.active_cash_drops || 0) > 0 && (
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: '#ef4444' }}>
                                                                        <span>Drops:</span>
                                                                        <span>-{formatCurrency(s.active_cash_drops)}</span>
                                                                    </div>
                                                                )}
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', borderTop: '1px dashed var(--border)', marginTop: '2px', paddingTop: '2px', fontWeight: 800, color: '#3b82f6' }}>
                                                                    <span>Net:</span>
                                                                    <span>{formatCurrency(s.active_cash_balance)}</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>—</span>
                                                        )}
                                                    </td>

                                                    {/* Col 5: Txns in Shift */}
                                                    <td style={{ padding: '12px 14px' }}>
                                                        {hasActive ? (
                                                            <div>
                                                                <div style={{ fontWeight: 800, fontSize: '0.84rem', color: salesCount > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                                                    {salesCount} sale{salesCount !== 1 ? 's' : ''}
                                                                </div>
                                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                                    GCash: {formatCurrency(s.active_gcash_sales || 0)}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>0 txns</span>
                                                        )}
                                                    </td>

                                                    {/* Col 6: Dynamic Admin Control Actions */}
                                                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                            {/* Case 1: Off-Shift */}
                                                            {!hasActive && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDirectTimeIn(s, 2000)}
                                                                    disabled={isActionBusy}
                                                                    className="btn-primary"
                                                                    style={{ padding: '5px 14px', fontSize: '0.76rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                                                    title="Start shift with default ₱2,000 float & immediately unlock register"
                                                                >
                                                                    <Play size={13} fill="currentColor" /> ▶ Time-In &amp; Assign Float
                                                                </button>
                                                            )}

                                                            {/* Case 2: On-Shift with 0 Sales (Accidental open) */}
                                                            {status === 'ACTIVE' && salesCount === 0 && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDirectTimeOut(s)}
                                                                        disabled={isActionBusy}
                                                                        style={{ padding: '5px 12px', fontSize: '0.74rem', fontWeight: 800, background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                        title="1-Click Time-Out & End Shift"
                                                                    >
                                                                        <Square size={13} fill="#fff" /> ⏹ Time-Out &amp; Close
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleCancelShift(s)}
                                                                        disabled={isActionBusy}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '5px 10px', fontSize: '0.74rem', fontWeight: 700, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                        title="Cleanly void shift opened by mistake (0 sales recorded)"
                                                                    >
                                                                        <X size={13} /> Unshift / Cancel
                                                                    </button>
                                                                </>
                                                            )}

                                                            {/* Case 3: On-Shift with Active Selling (>0 Sales) */}
                                                            {status === 'ACTIVE' && salesCount > 0 && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDirectTimeOut(s)}
                                                                        disabled={isActionBusy}
                                                                        style={{ padding: '5px 12px', fontSize: '0.74rem', fontWeight: 800, background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                        title="1-Click Time-Out & End Shift with recorded drawer balance"
                                                                    >
                                                                        <Square size={13} fill="#fff" /> ⏹ Time-Out &amp; Close
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setCashDropShift(s);
                                                                            setCashDropAmount('');
                                                                            setCashDropNotes('');
                                                                            setShowCashDropModal(true);
                                                                        }}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '5px 10px', fontSize: '0.74rem', fontWeight: 700, color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.4)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                    >
                                                                        <Coins size={13} /> Log Cash Drop
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setForceCloseShift(s);
                                                                            setForceCloseActual('');
                                                                            setForceCloseNotes('');
                                                                            setShowForceCloseModal(true);
                                                                        }}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '5px 8px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                                        title="Enter physical bill count and audit breakdown"
                                                                    >
                                                                        <Lock size={12} /> Detailed Count...
                                                                    </button>
                                                                </>
                                                            )}

                                                            {/* Case 4: Pending Remittance (Awaiting Sign-Off) */}
                                                            {status === 'PENDING_REMIT' && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleAdminSignOff(s)}
                                                                        disabled={signingOffId === s.active_float_id}
                                                                        className="btn-primary"
                                                                        style={{ padding: '5px 12px', fontSize: '0.74rem', fontWeight: 800, background: '#059669', borderColor: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                        title="Review preliminary count, verify cash and GCash, and approve end shift"
                                                                    >
                                                                        <Check size={13} /> {signingOffId === s.active_float_id ? 'Verifying...' : 'Approve & End Shift'}
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleReopenShift(s)}
                                                                        disabled={isActionBusy}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '5px 10px', fontSize: '0.74rem', fontWeight: 700, color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                        title="Undo accidental shift close and let cashier resume selling"
                                                                    >
                                                                        <RefreshCw size={13} /> Unshift (Resume POS)
                                                                    </button>
                                                                </>
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
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: RECORD PETTY CASH EXPENSE                             */}
            {/* ============================================================ */}
            {showExpenseModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 99999, padding: '20px',
                    overflowY: 'auto'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', borderRadius: '14px', padding: '24px', position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setShowExpenseModal(false)}
                            style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <MinusCircle size={22} color="#ef4444" />
                            <h2 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800 }}>
                                Record Petty Cash Expense
                            </h2>
                        </div>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Deduct physical cash taken out of the drawer for minor shop expenses.
                        </p>

                        <form onSubmit={handlePettyCashSubmit}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Amount (₱) *:
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="1"
                                    max={activeShift?.current_cash_balance || 99999}
                                    className="input-premium"
                                    style={{ width: '100%', padding: '8px 12px', fontSize: '1.1rem', fontWeight: 800, fontFamily: 'monospace' }}
                                    placeholder="50.00"
                                    value={expenseForm.amount}
                                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                    required
                                    autoFocus
                                />
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                                    Current drawer cash: {formatCurrency(activeShift?.current_cash_balance || 0)}
                                </span>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Expense Category:
                                </label>
                                <select
                                    className="input-premium"
                                    value={expenseForm.category}
                                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                                    style={{ width: '100%', padding: '7px 10px', fontSize: '0.84rem' }}
                                >
                                    <option value="Store Supplies">Store Supplies (Packaging, Tape, Receipt Paper)</option>
                                    <option value="Food & Snacks">Food, Snacks & Water</option>
                                    <option value="Courier Fare">Courier Fare / Rider Delivery Tip</option>
                                    <option value="Shop Maintenance">Shop Cleaning & Minor Tools</option>
                                    <option value="Emergency Cash">Emergency / Other Expense</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Expense Reason / Store Item *:
                                </label>
                                <input
                                    type="text"
                                    className="input-premium"
                                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem' }}
                                    placeholder="e.g. 2 rolls of packaging tape from grocery"
                                    value={expenseForm.reason}
                                    onChange={(e) => setExpenseForm({ ...expenseForm, reason: e.target.value })}
                                    required
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowExpenseModal(false)}
                                    className="btn-secondary"
                                    style={{ padding: '8px 16px', fontSize: '0.84rem' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    style={{ padding: '8px 20px', fontSize: '0.84rem', fontWeight: 700 }}
                                    disabled={submittingExpense}
                                >
                                    {submittingExpense ? 'Recording...' : 'Deduct from Drawer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: CLOSE SHIFT (BLIND CASH COUNT)                        */}
            {/* ============================================================ */}
            {showCloseShiftModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 99999, padding: '20px',
                    overflowY: 'auto'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '540px', borderRadius: '14px', padding: '24px', position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setShowCloseShiftModal(false)}
                            style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <Lock size={22} color={isAdmin ? "#dc2626" : "#d97706"} />
                            <h2 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800 }}>
                                {isAdmin ? 'Admin End Shift • Final Verification' : 'Submit Closing Count • Preliminary Drawer Count'}
                            </h2>
                        </div>

                        {/* Explanation */}
                        <div style={{
                            background: isAdmin ? 'rgba(220, 38, 38, 0.08)' : 'rgba(234, 88, 12, 0.08)',
                            border: `1px solid ${isAdmin ? 'rgba(220, 38, 38, 0.25)' : 'rgba(234, 88, 12, 0.25)'}`,
                            borderRadius: '8px',
                            padding: '10px 14px',
                            marginBottom: '16px',
                            fontSize: '0.8rem',
                            color: 'var(--text-main)',
                            lineHeight: 1.4
                        }}>
                            {isAdmin ? (
                                <span><strong>Admin Final Verification:</strong> Count and verify physical cash and coins received from the drawer. Confirming this will finalize shift reconciliation and immediately revoke the staff member's login session.</span>
                            ) : (
                                <span><strong>Preliminary Drawer Count:</strong> Count the physical bills and coins currently in your cash drawer. Submitting your preliminary count sends it to the Store Owner/Admin for remote or in-person verification and locks your POS drawer until the next shift is assigned.</span>
                            )}
                        </div>

                        <form onSubmit={handleCloseShiftSubmit}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                                    Actual Counted Cash:
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setUseDenomClose(!useDenomClose)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--primary)',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Coins size={14} /> {useDenomClose ? 'Switch to Lump Sum' : 'Count Bills & Coins'}
                                </button>
                            </div>

                            {!useDenomClose ? (
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, fontSize: '1.2rem', color: '#dc2626' }}>₱</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            className="input-premium"
                                            style={{ width: '100%', padding: '10px 14px 10px 32px', fontSize: '1.2rem', fontWeight: 800, fontFamily: 'monospace' }}
                                            placeholder="Enter total physical cash counted..."
                                            value={closeShiftForm.actual_cash}
                                            onChange={(e) => setCloseShiftForm({ ...closeShiftForm, actual_cash: e.target.value })}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ background: 'var(--surface-hover)', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '0.78rem' }}>
                                        {[
                                            { key: 'bills_1000', label: '₱1,000' },
                                            { key: 'bills_500', label: '₱500' },
                                            { key: 'bills_200', label: '₱200' },
                                            { key: 'bills_100', label: '₱100' },
                                            { key: 'bills_50', label: '₱50' },
                                            { key: 'bills_20', label: '₱20' },
                                            { key: 'coins_10', label: '₱10 coin' },
                                            { key: 'coins_5', label: '₱5 coin' },
                                            { key: 'coins_1', label: '₱1 coin' }
                                        ].map(denom => (
                                            <div key={denom.key}>
                                                <label style={{ display: 'block', marginBottom: '2px', color: 'var(--text-muted)' }}>{denom.label}:</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="input-premium"
                                                    style={{ width: '100%', padding: '4px 8px', fontSize: '0.8rem', textAlign: 'center' }}
                                                    value={closeShiftForm[denom.key] || 0}
                                                    onChange={(e) => setCloseShiftForm({ ...closeShiftForm, [denom.key]: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: '10px', textAlign: 'right', fontWeight: 800, fontSize: '0.9rem', color: '#dc2626' }}>
                                        Total Counted: {formatCurrency(calculateDenomTotal(closeShiftForm))}
                                    </div>
                                </div>
                            )}

                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                                    Closing Turnover Notes:
                                </label>
                                <textarea
                                    className="input-premium"
                                    rows="2"
                                    style={{ width: '100%', padding: '7px 10px', fontSize: '0.82rem' }}
                                    placeholder="Handing drawer over to safe; notes on any torn bills or coin bags..."
                                    value={closeShiftForm.notes}
                                    onChange={(e) => setCloseShiftForm({ ...closeShiftForm, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCloseShiftModal(false)}
                                    className="btn-secondary"
                                    style={{ padding: '8px 16px', fontSize: '0.84rem' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        background: isAdmin ? '#dc2626' : '#d97706',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '8px 20px',
                                        fontSize: '0.84rem',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                    }}
                                    disabled={closingShift}
                                >
                                    {closingShift ? 'Submitting...' : (isAdmin ? 'Confirm End Shift & Verify' : 'Submit Preliminary Count to Admin')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: POST-CLOSING RECONCILIATION RECEIPT                   */}
            {/* ============================================================ */}
            {reconResultModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 99999, padding: '20px',
                    overflowY: 'auto'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', borderRadius: '14px', padding: '24px', position: 'relative' }}>
                        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                            <div style={{
                                width: '50px',
                                height: '50px',
                                borderRadius: '50%',
                                background: reconResultModal.variance === 0 ? 'rgba(22, 163, 74, 0.15)' : (reconResultModal.variance < 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                                color: reconResultModal.variance === 0 ? '#16a34a' : (reconResultModal.variance < 0 ? '#ef4444' : '#f59e0b'),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 10px auto'
                            }}>
                                {reconResultModal.variance === 0 ? <CheckCircle size={28} /> : <AlertTriangle size={28} />}
                            </div>

                            <h2 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 800 }}>
                                Shift {reconResultModal.shiftCode} Reconciled
                            </h2>
                            <span style={{
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                padding: '3px 10px',
                                borderRadius: '12px',
                                background: reconResultModal.variance === 0 ? 'rgba(22, 163, 74, 0.15)' : (reconResultModal.variance < 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                                color: reconResultModal.variance === 0 ? '#16a34a' : (reconResultModal.variance < 0 ? '#ef4444' : '#f59e0b')
                            }}>
                                {reconResultModal.variance === 0 ? '🟢 EXACT MATCH (₱0.00)' : (reconResultModal.variance < 0 ? `🔴 SHORTAGE OF ${formatCurrency(Math.abs(reconResultModal.variance))}` : `🟡 OVERAGE OF +${formatCurrency(reconResultModal.variance)}`)}
                            </span>
                        </div>

                        {/* Financial Audit Breakdown */}
                        <div style={{ background: 'var(--surface-hover)', borderRadius: '10px', padding: '14px 18px', marginBottom: '18px', fontSize: '0.84rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Opening Cash Float:</span>
                                <strong style={{ fontFamily: 'monospace' }}>{formatCurrency(reconResultModal.openingFloat)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Cash Sales In (+):</span>
                                <strong style={{ fontFamily: 'monospace', color: '#16a34a' }}>+{formatCurrency(reconResultModal.cashSales)}</strong>
                            </div>
                            {Number(reconResultModal.cashRefunds) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Historical Refunds Out (-):</span>
                                    <strong style={{ fontFamily: 'monospace', color: '#ea580c' }}>-{formatCurrency(reconResultModal.cashRefunds)}</strong>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Petty Cash Expenses Out (-):</span>
                                <strong style={{ fontFamily: 'monospace', color: '#dc2626' }}>-{formatCurrency(reconResultModal.pettyCashExpenses)}</strong>
                            </div>
                            <div style={{ borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                                <span>Expected Drawer Cash:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--text-main)', fontSize: '0.95rem' }}>{formatCurrency(reconResultModal.expectedDrawerCash)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginTop: '4px' }}>
                                <span>Actual Counted Cash:</span>
                                <span style={{ fontFamily: 'monospace', color: '#3b82f6', fontSize: '0.95rem' }}>{formatCurrency(reconResultModal.actualCountedCash)}</span>
                            </div>
                            <div style={{
                                borderTop: '1px dashed var(--border)',
                                marginTop: '8px',
                                paddingTop: '8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontWeight: 900,
                                fontSize: '1rem',
                                color: reconResultModal.variance === 0 ? '#16a34a' : (reconResultModal.variance < 0 ? '#ef4444' : '#f59e0b')
                            }}>
                                <span>Variance:</span>
                                <span style={{ fontFamily: 'monospace' }}>
                                    {reconResultModal.variance >= 0 ? '+' : ''}{formatCurrency(reconResultModal.variance)}
                                </span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setReconResultModal(null);
                                handleTabChange('history');
                            }}
                            className="btn-primary"
                            style={{ width: '100%', padding: '10px 14px', fontSize: '0.88rem', fontWeight: 700 }}
                        >
                            View in Cash Count History
                        </button>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: SHIFT SLIP INSPECTOR                                  */}
            {/* ============================================================ */}
            {viewShiftDetails && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 99999, padding: '20px',
                    overflowY: 'auto'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', borderRadius: '14px', padding: '24px', position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setViewShiftDetails(null)}
                            style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <FileText size={20} color="var(--primary)" />
                            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
                                Shift Slip: {viewShiftDetails.shift_code || `SHIFT-${viewShiftDetails.id}`}
                            </h2>
                        </div>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Cashier: <strong>{viewShiftDetails.staff_full_name || viewShiftDetails.staff_username}</strong>
                            {' '}• {formatAuditDate(viewShiftDetails.assigned_at)}
                        </p>

                        <div style={{ background: 'var(--surface-hover)', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', fontSize: '0.82rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Starting Panukli:</span>
                                <strong style={{ fontFamily: 'monospace' }}>{formatCurrency(viewShiftDetails.starting_cash)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Cash Sales In:</span>
                                <strong style={{ fontFamily: 'monospace', color: '#16a34a' }}>+{formatCurrency(viewShiftDetails.cash_sales || 0)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                                <span style={{ color: 'var(--text-muted)' }}>GCash Sales In (Digital):</span>
                                <strong style={{ fontFamily: 'monospace', color: '#0284c7' }}>{formatCurrency(viewShiftDetails.gcash_sales || 0)}</strong>
                            </div>
                            {Number(viewShiftDetails.cash_refunds) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Historical Refunds Out:</span>
                                    <strong style={{ fontFamily: 'monospace', color: '#ea580c' }}>-{formatCurrency(viewShiftDetails.cash_refunds || 0)}</strong>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Petty Cash Expenses Out:</span>
                                <strong style={{ fontFamily: 'monospace', color: '#dc2626' }}>-{formatCurrency(viewShiftDetails.petty_cash_expenses || 0)}</strong>
                            </div>
                            <div style={{ borderTop: '1px solid var(--border)', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                <span>Expected Cash:</span>
                                <span style={{ fontFamily: 'monospace' }}>{formatCurrency(viewShiftDetails.expected_cash)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                <span>Actual Counted Cash:</span>
                                <span style={{ fontFamily: 'monospace', color: '#3b82f6' }}>{formatCurrency(viewShiftDetails.actual_cash)}</span>
                            </div>
                            <div style={{
                                borderTop: '1px dashed var(--border)',
                                marginTop: '6px',
                                paddingTop: '6px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontWeight: 900,
                                fontSize: '0.92rem',
                                color: Number(viewShiftDetails.shortage_overage || 0) === 0 ? '#16a34a' : (Number(viewShiftDetails.shortage_overage || 0) < 0 ? '#ef4444' : '#f59e0b')
                            }}>
                                <span>Variance:</span>
                                <span style={{ fontFamily: 'monospace' }}>
                                    {Number(viewShiftDetails.shortage_overage || 0) >= 0 ? '+' : ''}{formatCurrency(viewShiftDetails.shortage_overage || 0)}
                                </span>
                            </div>
                        </div>

                        {/* Admin Sign-Off Status */}
                        <div style={{ marginBottom: '18px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Status: <strong>{viewShiftDetails.status}</strong>
                            {viewShiftDetails.admin_signed_off ? (
                                <div style={{ color: '#16a34a', fontWeight: 700, marginTop: '4px' }}>
                                    ✓ Signed off by {viewShiftDetails.signed_off_by_name} on {formatAuditDate(viewShiftDetails.signed_off_at)}
                                </div>
                            ) : (
                                <div style={{ color: '#f59e0b', fontWeight: 600, marginTop: '4px' }}>
                                    ⏳ Pending Admin Sign-Off
                                </div>
                            )}
                            {viewShiftDetails.notes && (
                                <div style={{ marginTop: '6px', fontStyle: 'italic' }}>
                                    Notes: "{viewShiftDetails.notes}"
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setViewShiftDetails(null)}
                                className="btn-secondary"
                                style={{ padding: '8px 16px', fontSize: '0.84rem' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* ============================================================ */}
            {/* MODAL: MID-SHIFT CASH DROP (SAFE REMITTANCE)                 */}
            {/* ============================================================ */}
            {showCashDropModal && cashDropShift && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 99999, padding: '20px',
                    overflowY: 'auto'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', borderRadius: '14px', padding: '24px', position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setShowCashDropModal(false)}
                            style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <Coins size={22} color="#3b82f6" />
                            <h2 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800 }}>
                                Mid-Shift Cash Drop (Safe Remit)
                            </h2>
                        </div>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Safely pull excess cash out of the register and transfer it to the store safe or Admin during the shift.
                        </p>

                        <form onSubmit={handleCashDropSubmit}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Amount to Remit (₱) *:
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="1"
                                    max={cashDropShift.current_cash_balance || cashDropShift.active_cash_balance || 99999}
                                    className="input-premium"
                                    style={{ width: '100%', padding: '10px 12px', fontSize: '1.2rem', fontWeight: 800, fontFamily: 'monospace' }}
                                    placeholder="5000.00"
                                    value={cashDropAmount}
                                    onChange={(e) => setCashDropAmount(e.target.value)}
                                    required
                                    autoFocus
                                />
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                    Current drawer cash: {formatCurrency(cashDropShift.current_cash_balance || cashDropShift.active_cash_balance || 0)}
                                </span>
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Notes / Safe Reference (Optional):
                                </label>
                                <input
                                    type="text"
                                    className="input-premium"
                                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem' }}
                                    placeholder="e.g. 5x ₱1000 bills dropped into safe"
                                    value={cashDropNotes}
                                    onChange={(e) => setCashDropNotes(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCashDropModal(false)}
                                    className="btn-secondary"
                                    style={{ padding: '8px 16px', fontSize: '0.84rem' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingCashDrop}
                                    className="btn-primary"
                                    style={{ padding: '8px 20px', fontSize: '0.84rem', fontWeight: 800, background: '#3b82f6', borderColor: '#3b82f6' }}
                                >
                                    {submittingCashDrop ? 'Logging Drop...' : 'Confirm Cash Drop'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: ADMIN FORCE TIME-OUT & BLIND COUNT                   */}
            {/* ============================================================ */}
            {showForceCloseModal && forceCloseShift && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 99999, padding: '20px',
                    overflowY: 'auto'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', borderRadius: '14px', padding: '24px', position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setShowForceCloseModal(false)}
                            style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <Lock size={22} color="#dc2626" />
                            <h2 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800 }}>
                                Admin Force Time-Out &amp; Close Shift
                            </h2>
                        </div>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Clock out <strong style={{ color: 'var(--text-main)' }}>@{forceCloseShift.username || forceCloseShift.staff_username}</strong> and count physical drawer cash. Their POS terminal will lock immediately.
                        </p>

                        <form onSubmit={handleForceCloseSubmit}>
                            <div style={{ marginBottom: '14px', background: 'var(--surface-hover)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                    Expected Physical Cash in Register:
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: 'monospace', color: '#3b82f6', marginTop: '2px' }}>
                                    {formatCurrency(forceCloseShift.active_cash_balance || forceCloseShift.current_cash_balance || 0)}
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Actual Physical Cash Counted (₱) *:
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="input-premium"
                                    style={{ width: '100%', padding: '10px 12px', fontSize: '1.2rem', fontWeight: 800, fontFamily: 'monospace' }}
                                    placeholder="Enter physical cash counted in drawer"
                                    value={forceCloseActual}
                                    onChange={(e) => setForceCloseActual(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Admin Notes (Optional):
                                </label>
                                <input
                                    type="text"
                                    className="input-premium"
                                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem' }}
                                    placeholder="e.g. End of night physical count"
                                    value={forceCloseNotes}
                                    onChange={(e) => setForceCloseNotes(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowForceCloseModal(false)}
                                    className="btn-secondary"
                                    style={{ padding: '8px 16px', fontSize: '0.84rem' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingForceClose}
                                    style={{ padding: '8px 20px', fontSize: '0.84rem', fontWeight: 800, background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                >
                                    {submittingForceClose ? 'Closing Shift...' : 'Force Time-Out &amp; Sign Off'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL: ADMIN REMOTE END-SHIFT REVIEW & APPROVAL              */}
            {/* ============================================================ */}
            {signOffModalShift && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 99999, padding: '20px',
                    overflowY: 'auto'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '560px', borderRadius: '14px', padding: '24px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
                        <button
                            type="button"
                            onClick={() => setSignOffModalShift(null)}
                            style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <CheckCircle size={24} color="#059669" />
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                                Approve &amp; End Shift (Sign Off)
                            </h2>
                        </div>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Review preliminary count submitted by <strong style={{ color: 'var(--text-main)' }}>@{signOffModalShift.username || signOffModalShift.staff_username}</strong>. Approving will finalize reconciliation and immediately revoke staff session access.
                        </p>

                        {/* Reconciliation Comparison Card */}
                        <div style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            padding: '14px 16px',
                            marginBottom: '16px'
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
                                <div style={{ padding: '8px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Expected Cash</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'monospace', color: '#3b82f6', marginTop: '2px' }}>
                                        {formatCurrency(signOffDetails?.expected_cash ?? signOffModalShift.expected_cash ?? (signOffModalShift.active_cash_balance || 0))}
                                    </div>
                                </div>
                                <div style={{ padding: '8px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Staff Counted</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'monospace', color: '#10b981', marginTop: '2px' }}>
                                        {formatCurrency(signOffDetails?.actual_cash ?? signOffModalShift.actual_cash ?? signOffModalShift.blind_count_entered ?? 0)}
                                    </div>
                                </div>
                                <div style={{ padding: '8px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Variance</div>
                                    {(() => {
                                        const exp = Number(signOffDetails?.expected_cash ?? signOffModalShift.expected_cash ?? (signOffModalShift.active_cash_balance || 0));
                                        const act = Number(signOffVerifiedCash || signOffDetails?.actual_cash || signOffModalShift.actual_cash || 0);
                                        const diff = act - exp;
                                        const color = Math.abs(diff) < 0.01 ? '#10b981' : (diff < 0 ? '#ef4444' : '#f59e0b');
                                        return (
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'monospace', color, marginTop: '2px' }}>
                                                {Math.abs(diff) < 0.01 ? '₱0.00' : (diff < 0 ? `-${formatCurrency(Math.abs(diff))}` : `+${formatCurrency(diff)}`)}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* GCash Verification List */}
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    GCash Verification (Match With GCash App)
                                </span>
                                <span style={{ fontSize: '0.76rem', color: '#0284c7', fontWeight: 700, fontFamily: 'monospace' }}>
                                    Total: {formatCurrency(signOffDetails?.gcash_sales ?? signOffModalShift.gcash_sales ?? 0)}
                                </span>
                            </div>

                            <div style={{
                                maxHeight: '140px',
                                overflowY: 'auto',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                background: 'var(--surface)'
                            }}>
                                {signOffLoadingDetails ? (
                                    <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Loading GCash transaction records...
                                    </div>
                                ) : signOffDetails?.gcashTransactions && signOffDetails.gcashTransactions.length > 0 ? (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                                                <th style={{ padding: '6px 8px' }}>Order</th>
                                                <th style={{ padding: '6px 8px' }}>Amount</th>
                                                <th style={{ padding: '6px 8px' }}>13-Digit Ref #</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {signOffDetails.gcashTransactions.map((tx, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{tx.receipt_no || tx.order_number}</td>
                                                    <td style={{ padding: '6px 8px', color: '#0284c7', fontWeight: 700, fontFamily: 'monospace' }}>{formatCurrency(tx.gcash_amount || tx.total_amount)}</td>
                                                    <td style={{ padding: '6px 8px', color: '#10b981', fontWeight: 700, fontFamily: 'monospace' }}>{tx.gcash_reference || 'N/A'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        No digital GCash transactions recorded in this shift.
                                    </div>
                                )}
                            </div>
                        </div>

                        <form onSubmit={handleConfirmSignOff}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Verified Physical Cash Received (₱) *:
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="input-premium"
                                    style={{ width: '100%', padding: '10px 12px', fontSize: '1.2rem', fontWeight: 800, fontFamily: 'monospace' }}
                                    value={signOffVerifiedCash}
                                    onChange={(e) => setSignOffVerifiedCash(e.target.value)}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Admin Verification Notes (Optional):
                                </label>
                                <input
                                    type="text"
                                    className="input-premium"
                                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem' }}
                                    placeholder="e.g. Cash counted and GCash refs cross-checked"
                                    value={signOffNotes}
                                    onChange={(e) => setSignOffNotes(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setSignOffModalShift(null)}
                                    className="btn-secondary"
                                    style={{ padding: '8px 16px', fontSize: '0.84rem' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    style={{ padding: '8px 20px', fontSize: '0.84rem', fontWeight: 800, background: '#059669', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    disabled={signingOffId !== null}
                                >
                                    <Check size={16} /> {signingOffId !== null ? 'Finalizing...' : 'Confirm Approve & End Shift'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CashFloat;
