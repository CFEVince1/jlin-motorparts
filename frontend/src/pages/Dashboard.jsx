import { useState, useEffect, useCallback, useContext } from 'react';
import api from '../services/api';
import { TrendingUp, AlertTriangle, DollarSign, ShoppingCart, Award, Users, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';
import { formatCurrency } from '../utils/formatters';
import BestSellersBar from '../components/BestSellersBar';

const Dashboard = () => {
    const { user } = useContext(AuthContext);
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

        // Auto-refresh every 6 seconds so staff transactions immediately reflect on Admin Dashboard without restarting
        const pollInterval = setInterval(() => {
            fetchDashboardData(true);
        }, 6000);

        // Immediate background re-fetch whenever the user refocuses the browser window/tab
        const handleFocus = () => fetchDashboardData(true);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchDashboardData(true);
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
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
            <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'admin' ? 'repeat(auto-fit, minmax(200px, 1fr))' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '24px' }}>

                {/* Today's Sales: Staff sees their own today sales; Admin sees all staff today sales combined */}
                <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'rgba(5, 150, 105, 0.15)', padding: '12px', borderRadius: '10px', color: 'var(--primary)' }}>
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '2px' }}>
                            {user?.role === 'admin' ? "Store Today's Sales" : "My Today's Sales"}
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: '700', lineHeight: 1.2 }}>
                            {formatCurrency(stats.dailySales?.total_revenue || 0)}
                        </div>
                        {user?.role === 'admin' && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>All staff combined</div>
                        )}
                    </div>
                </div>

                {/* Today's Transactions: Staff sees their own today count; Admin sees all staff today count combined */}
                <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'rgba(10, 132, 255, 0.15)', padding: '12px', borderRadius: '10px', color: 'var(--accent)' }}>
                        <ShoppingCart size={24} />
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '2px' }}>
                            {user?.role === 'admin' ? "Store Today's Transactions" : "My Today's Transactions"}
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: '700', lineHeight: 1.2 }}>
                            {stats.dailySales?.total_transactions || 0}
                        </div>
                        {user?.role === 'admin' && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>All transactions today</div>
                        )}
                    </div>
                </div>

                {/* Admin-only metric cards */}
                {user?.role === 'admin' && (
                    <>
                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(5, 150, 105, 0.15)', padding: '12px', borderRadius: '10px', color: 'var(--primary)' }}>
                                <TrendingUp size={24} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '2px' }}>Total Sales (All Time)</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: '700', lineHeight: 1.2 }}>
                                    {formatCurrency(stats.adminStats?.total_sales || 0)}
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '12px', borderRadius: '10px', color: 'var(--success)' }}>
                                <DollarSign size={24} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '2px' }}>Total Profit</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: '700', lineHeight: 1.2 }}>
                                    {formatCurrency(stats.adminStats?.total_profit || 0)}
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(10, 132, 255, 0.15)', padding: '12px', borderRadius: '10px', color: 'var(--accent)' }}>
                                <ShoppingCart size={24} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '2px' }}>Total Transactions</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: '700', lineHeight: 1.2 }}>
                                    {stats.adminStats?.total_transactions || 0}
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '12px', borderRadius: '10px', color: 'var(--danger)' }}>
                                <AlertTriangle size={24} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '2px' }}>Low Stock Items</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: '700', lineHeight: 1.2, color: stats.lowStock.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                    {stats.lowStock.length}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Admin View: Staff Today's Sales & Transactions Live Breakdown */}
            {user?.role === 'admin' && (
                <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem' }}>
                                <Users size={20} style={{ color: 'var(--primary)' }} /> Staff Today's Sales & Transactions
                            </h3>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
                                Live real-time breakdown of all staff shift totals and cashier transactions for today.
                            </div>
                        </div>
                    </div>

                    {stats.staffToday && stats.staffToday.length > 0 ? (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Staff / Cashier</th>
                                        <th>Role</th>
                                        <th style={{ textAlign: 'center' }}>Today Transactions</th>
                                        <th style={{ textAlign: 'right' }}>Today Sales</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.staffToday.map((st) => (
                                        <tr key={st.id}>
                                            <td style={{ fontWeight: 600 }}>{st.username}</td>
                                            <td>
                                                <span className={`badge-pill ${st.role === 'admin' ? 'badge-admin' : 'badge-staff'}`} style={{ textTransform: 'capitalize' }}>
                                                    {st.role}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                                                {st.today_transactions} {st.today_transactions === 1 ? 'sale' : 'sales'}
                                            </td>
                                            <td style={{ textAlign: 'right', color: 'var(--primary)', fontWeight: 'bold' }}>
                                                {formatCurrency(st.today_sales)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)', margin: '12px 0 0 0' }}>No staff sales recorded today yet.</p>
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
