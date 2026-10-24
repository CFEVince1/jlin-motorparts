import { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { TrendingUp, AlertTriangle, DollarSign, ShoppingCart, Award, Users, RefreshCw, ChevronLeft, ChevronRight, History, Landmark } from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';
import { formatCurrency } from '../utils/formatters';
import BestSellersBar from '../components/BestSellersBar';
import { subscribeToInventoryChange } from '../utils/syncEvents';

const Dashboard = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [staffPeriod, setStaffPeriod] = useState(() => searchParams.get('period') === 'all' ? 'all' : 'today');
    const [stats, setStats] = useState({
        dailySales: { total_revenue: 0, total_transactions: 0 },
        lowStock: [],
        adminStats: null,
        bestSelling: [],
        staffToday: []
    });
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    const [lowStockPage, setLowStockPage] = useState(1);
    const lowStockPerPage = 5;

    const indexOfLastLowStock = lowStockPage * lowStockPerPage;
    const indexOfFirstLowStock = indexOfLastLowStock - lowStockPerPage;
    const currentLowStockItems = stats.lowStock.slice(indexOfFirstLowStock, indexOfLastLowStock);
    const totalLowStockPages = Math.ceil(stats.lowStock.length / lowStockPerPage);

    const fetchDashboardData = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsRefreshing(true);
        try {
            const t = Date.now();
            // Common API calls with cache-busting timestamp
            const promises = [
                api.get(`/reports/daily?_t=${t}`).catch(() => ({ data: { total_revenue: 0, total_transactions: 0 } })),
                api.get(`/reports/low-stock?_t=${t}`).catch(() => ({ data: [] })),
                api.get(`/reports/best-selling?_t=${t}`).catch(() => ({ data: [] }))
            ];

            // Admin-only API calls (admin stats and staff performance breakdown)
            if (user?.role === 'admin') {
                promises.push(api.get(`/reports/admin-stats?_t=${t}`).catch(() => ({ data: { total_sales: 0, total_transactions: 0, total_profit: 0 } })));
                promises.push(api.get(`/reports/staff-today?_t=${t}`).catch(() => ({ data: [] })));
            }

            const results = await Promise.all(promises);

            const newStats = {
                dailySales: results[0].data || { total_revenue: 0, total_transactions: 0 },
                lowStock: results[1].data || [],
                bestSelling: results[2].data || [],
                adminStats: user?.role === 'admin' ? results[3]?.data : null,
                staffToday: user?.role === 'admin' ? (results[4]?.data || []) : []
            };

            setStats(newStats);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Failed to load dashboard data', err);
        } finally {
            if (!isSilent) setIsRefreshing(false);
        }
    }, [user?.role]);

    useEffect(() => {
        fetchDashboardData(false);

        // 1. Instant cross-tab sync: The exact millisecond staff completes checkout, Admin Dashboard re-fetches with 0ms delay
        const unsubscribe = subscribeToInventoryChange(() => {
            fetchDashboardData(true);
        });

        // 2. High-frequency background polling (every 3 seconds) for multi-device real-time sync
        const pollInterval = setInterval(() => {
            fetchDashboardData(true);
        }, 3000);

        // 3. Immediate background re-fetch whenever the user refocuses the browser window/tab
        const handleFocus = () => fetchDashboardData(true);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchDashboardData(true);
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            unsubscribe();
            clearInterval(pollInterval);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchDashboardData]);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0 }}>{user?.role === 'admin' ? 'Admin Dashboard' : 'Staff Dashboard'}</h1>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {user?.role === 'admin' 
                            ? 'Overview of store-wide sales, live staff transactions, and inventory health.' 
                            : `Welcome back, ${user?.username || 'Staff'}. Review your shift sales and top-selling items.`}
                    </p>
                </div>

                {/* Real-time live sync indicator and manual Refresh button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        <span className="live-pulse-dot" />
                        <span>Live Sync {lastUpdated ? `• ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</span>
                    </div>
                    <button 
                        onClick={() => fetchDashboardData(false)}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.85rem' }}
                        disabled={isRefreshing}
                        title="Force refresh live dashboard data"
                    >
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Metric Cards */}
            {user?.role === 'admin' ? (
                <>
                    {/* Admin Row 1: Today's Shift & Inventory Alert (3 Cards) */}
                    <div className="dashboard-grid-today">
                        {/* Store Today's Sales */}
                        <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                            <div style={{ background: 'rgba(5, 150, 105, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <TrendingUp size={22} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' }}>
                                    Store Today's Sales
                                </div>
                                <div
                                    title={formatCurrency(stats.dailySales?.total_revenue || 0)}
                                    style={{ fontSize: 'clamp(1.15rem, 1.4vw, 1.45rem)', fontWeight: '700', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {formatCurrency(stats.dailySales?.total_revenue || 0)}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    All staff combined
                                </div>
                            </div>
                        </div>

                        {/* Store Today's Transactions */}
                        <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                            <div style={{ background: 'rgba(10, 132, 255, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <ShoppingCart size={22} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' }}>
                                    Store Today's Transactions
                                </div>
                                <div
                                    title={String(stats.dailySales?.total_transactions || 0)}
                                    style={{ fontSize: 'clamp(1.15rem, 1.4vw, 1.45rem)', fontWeight: '700', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {stats.dailySales?.total_transactions || 0}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    All transactions today
                                </div>
                            </div>
                        </div>

                        {/* Low Stock Items Alert */}
                        <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                            <div style={{ background: stats.lowStock.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: stats.lowStock.length > 0 ? 'var(--danger)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <AlertTriangle size={22} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' }}>
                                    Low Stock Items
                                </div>
                                <div
                                    title={String(stats.lowStock.length)}
                                    style={{ fontSize: 'clamp(1.15rem, 1.4vw, 1.45rem)', fontWeight: '700', lineHeight: 1.2, color: stats.lowStock.length > 0 ? 'var(--danger)' : 'var(--success)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {stats.lowStock.length}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: stats.lowStock.length > 0 ? 'var(--danger)' : 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {stats.lowStock.length > 0 ? 'Requires attention / restock' : 'All items sufficiently stocked'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Admin Row 2: Store Lifetime Financials & Capital (4 Cards) */}
                    <div className="dashboard-grid-lifetime">
                        {/* Total Sales (All Time) */}
                        <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                            <div style={{ background: 'rgba(5, 150, 105, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <TrendingUp size={22} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' }}>
                                    Total Sales (All Time)
                                </div>
                                <div
                                    title={formatCurrency(stats.adminStats?.total_sales || 0)}
                                    style={{ fontSize: 'clamp(1.15rem, 1.4vw, 1.45rem)', fontWeight: '700', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {formatCurrency(stats.adminStats?.total_sales || 0)}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    Lifetime store revenue
                                </div>
                            </div>
                        </div>

                        {/* Total Profit */}
                        <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <DollarSign size={22} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' }}>
                                    Total Profit
                                </div>
                                <div
                                    title={formatCurrency(stats.adminStats?.total_profit || 0)}
                                    style={{ fontSize: 'clamp(1.15rem, 1.4vw, 1.45rem)', fontWeight: '700', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {formatCurrency(stats.adminStats?.total_profit || 0)}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    Lifetime gross profit
                                </div>
                            </div>
                        </div>

                        {/* Total Capital */}
                        <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                            <div style={{ background: 'rgba(217, 119, 6, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Landmark size={22} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' }}>
                                    Total Capital
                                </div>
                                <div
                                    title={formatCurrency(stats.adminStats?.total_capital || 0)}
                                    style={{ fontSize: 'clamp(1.15rem, 1.4vw, 1.45rem)', fontWeight: '700', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {formatCurrency(stats.adminStats?.total_capital || 0)}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    Current stock ({stats.adminStats?.total_stock_units || 0} units)
                                </div>
                            </div>
                        </div>

                        {/* Total Transactions */}
                        <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                            <div style={{ background: 'rgba(10, 132, 255, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <ShoppingCart size={22} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' }}>
                                    Total Transactions
                                </div>
                                <div
                                    title={String(stats.adminStats?.total_transactions || 0)}
                                    style={{ fontSize: 'clamp(1.15rem, 1.4vw, 1.45rem)', fontWeight: '700', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {stats.adminStats?.total_transactions || 0}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    Lifetime completed orders
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                /* Staff Metric Cards (2 Cards) */
                <div className="dashboard-grid-staff">
                    <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div style={{ background: 'rgba(5, 150, 105, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <TrendingUp size={22} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' }}>
                                My Today's Sales
                            </div>
                            <div
                                title={formatCurrency(stats.dailySales?.total_revenue || 0)}
                                style={{ fontSize: 'clamp(1.15rem, 1.4vw, 1.45rem)', fontWeight: '700', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                                {formatCurrency(stats.dailySales?.total_revenue || 0)}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Today's registered register revenue
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div style={{ background: 'rgba(10, 132, 255, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ShoppingCart size={22} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' }}>
                                My Today's Transactions
                            </div>
                            <div
                                title={String(stats.dailySales?.total_transactions || 0)}
                                style={{ fontSize: 'clamp(1.15rem, 1.4vw, 1.45rem)', fontWeight: '700', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                                {stats.dailySales?.total_transactions || 0}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Transactions completed today
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Admin View: Staff Today's Sales & Transactions Live Breakdown */}
            {user?.role === 'admin' && (
                <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem' }}>
                                <Users size={20} style={{ color: 'var(--primary)' }} /> Staff Sales & Transactions
                            </h3>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
                                {staffPeriod === 'today'
                                    ? "Live breakdown of cashier shift totals and transactions for today."
                                    : "All-time breakdown of all store transactions and revenue by staff."}
                            </div>
                        </div>

                        {/* Toggle button to see how many transactions (Today vs All-Time) */}
                        <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <button
                                type="button"
                                onClick={() => setStaffPeriod('today')}
                                style={{
                                    padding: '5px 14px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: staffPeriod === 'today' ? 'var(--primary)' : 'transparent',
                                    color: staffPeriod === 'today' ? '#ffffff' : 'var(--text-muted)',
                                    fontWeight: staffPeriod === 'today' ? 700 : 500,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                Today
                            </button>
                            <button
                                type="button"
                                onClick={() => setStaffPeriod('all')}
                                style={{
                                    padding: '5px 14px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: staffPeriod === 'all' ? 'var(--primary)' : 'transparent',
                                    color: staffPeriod === 'all' ? '#ffffff' : 'var(--text-muted)',
                                    fontWeight: staffPeriod === 'all' ? 700 : 500,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                All Time
                            </button>
                        </div>
                    </div>

                    {stats.staffToday && stats.staffToday.length > 0 ? (
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
                                        <th style={{ textAlign: 'center', width: '160px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.staffToday.map((st) => {
                                        const txCount = staffPeriod === 'today'
                                            ? Number(st.today_transactions || 0)
                                            : Number(st.all_time_transactions || 0);
                                        const salesAmount = staffPeriod === 'today'
                                            ? Number(st.today_sales || 0)
                                            : Number(st.all_time_sales || 0);

                                        return (
                                            <tr
                                                key={st.id}
                                                onClick={() => navigate(`/transactions?user=${encodeURIComponent(st.username)}`)}
                                                style={{ cursor: 'pointer' }}
                                                title={`Click to view transactions for ${st.username}`}
                                            >
                                                <td style={{ fontWeight: 600 }}>
                                                    <span style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                                                        {st.username}
                                                    </span>
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
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/transactions?user=${encodeURIComponent(st.username)}`);
                                                        }}
                                                        style={{
                                                            padding: '4px 10px',
                                                            fontSize: '0.75rem',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px'
                                                        }}
                                                        title={`View transactions for ${st.username}`}
                                                    >
                                                        <History size={13} /> View ({st.all_time_transactions || 0})
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {stats.staffToday.length > 1 && (
                                    <tfoot>
                                        <tr style={{ fontWeight: 'bold', borderTop: '2px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                                            <td colSpan={2}>All Staff Combined</td>
                                            <td style={{ textAlign: 'center' }}>
                                                {stats.staffToday.reduce((sum, st) => {
                                                    const count = staffPeriod === 'today'
                                                        ? Number(st.today_transactions || 0)
                                                        : Number(st.all_time_transactions || 0);
                                                    return sum + count;
                                                }, 0)} sales
                                            </td>
                                            <td style={{ textAlign: 'right', color: 'var(--primary)' }}>
                                                {formatCurrency(stats.staffToday.reduce((sum, st) => {
                                                    const amount = staffPeriod === 'today'
                                                        ? Number(st.today_sales || 0)
                                                        : Number(st.all_time_sales || 0);
                                                    return sum + amount;
                                                }, 0))}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    onClick={() => navigate('/transactions?user=ALL')}
                                                    style={{
                                                        padding: '4px 10px',
                                                        fontSize: '0.75rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '5px'
                                                    }}
                                                    title="View all store transactions"
                                                >
                                                    <History size={13} /> View All
                                                </button>
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)', margin: '12px 0 0 0' }}>No staff sales recorded yet.</p>
                    )}
                </div>
            )}

            {/* Staff View: Staff Quick Guide - Top Selling Items Widget (Strictly on Staff Dashboard) */}
            {user?.role !== 'admin' && (
                <div style={{ marginBottom: '20px' }}>
                    <BestSellersBar />
                </div>
            )}

            {/* Bottom Section: Best Selling & Low Stock */}
            <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'admin' ? '1fr' : 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
                
                {/* Best Selling Products: Placed on Staff Dashboard for quick customer inquiry answers */}
                {user?.role !== 'admin' && (
                    <div className="glass-panel" style={{ padding: '24px' }}>
                        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Award size={20} color="var(--accent)" /> Top Selling Items
                        </h3>
                        {stats.bestSelling.length > 0 ? (
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Product Name</th>
                                            <th style={{ textAlign: 'right' }}>Units Sold</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.bestSelling.map((item, index) => (
                                            <tr key={index}>
                                                <td>{item.product_name}</td>
                                                <td style={{ color: 'var(--success)', fontWeight: 'bold', textAlign: 'right' }}>
                                                    {item.total_sold} units
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p style={{ color: 'var(--text-muted)' }}>No sales data available yet.</p>
                        )}
                    </div>
                )}

                {/* Low Stock Alerts */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ marginBottom: '16px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={20} /> Low Stock Alerts
                    </h3>
                    {stats.lowStock.length > 0 ? (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product Name</th>
                                        <th style={{ textAlign: 'right' }}>Current Stock</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentLowStockItems.map(item => (
                                        <tr key={item.id}>
                                            <td>{item.product_name}</td>
                                            <td style={{ color: 'var(--danger)', fontWeight: 'bold', textAlign: 'right' }}>{item.stock}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {totalLowStockPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        Showing {indexOfFirstLowStock + 1} to {Math.min(indexOfLastLowStock, stats.lowStock.length)} of {stats.lowStock.length}
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => setLowStockPage(prev => Math.max(prev - 1, 1))}
                                            disabled={lowStockPage === 1}
                                            className="btn-secondary"
                                            style={{ padding: '6px' }}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <button
                                            onClick={() => setLowStockPage(prev => Math.min(prev + 1, totalLowStockPages))}
                                            disabled={lowStockPage === totalLowStockPages}
                                            className="btn-secondary"
                                            style={{ padding: '6px' }}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)' }}>All stocks are healthy.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
