import { useState, useEffect, useContext } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api from '../services/api';
import { TrendingUp, AlertTriangle, DollarSign, ShoppingCart, Award, ChevronLeft, ChevronRight } from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';
import { formatCurrency } from '../utils/formatters';

const Dashboard = () => {
    const { user } = useContext(AuthContext);
    const [weeklySales, setWeeklySales] = useState([]);
    const [stats, setStats] = useState({
        dailySales: { total_revenue: 0, total_transactions: 0 },
        lowStock: [],
        adminStats: null,
        bestSelling: []
    });

    const [lowStockPage, setLowStockPage] = useState(1);
    const lowStockPerPage = 5;

    const indexOfLastLowStock = lowStockPage * lowStockPerPage;
    const indexOfFirstLowStock = indexOfLastLowStock - lowStockPerPage;
    const currentLowStockItems = stats.lowStock.slice(indexOfFirstLowStock, indexOfLastLowStock);
    const totalLowStockPages = Math.ceil(stats.lowStock.length / lowStockPerPage);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                // Common API calls
                const promises = [
                    api.get('/reports/daily').catch(() => ({ data: { total_revenue: 0, total_transactions: 0 } })),
                    api.get('/reports/low-stock').catch(() => ({ data: [] }))
                ];

                // Admin-only API calls
                if (user?.role === 'admin') {
                    promises.push(api.get('/reports/admin-stats').catch(() => ({ data: { total_sales: 0, total_transactions: 0, total_profit: 0 } })));
                    promises.push(api.get('/reports/best-selling').catch(() => ({ data: [] })));
                    promises.push(api.get('/reports/weekly-chart').catch(() => ({ data: [] })));
                }

                const results = await Promise.all(promises);

                const newStats = {
                    dailySales: results[0].data,
                    lowStock: results[1].data,
                    adminStats: null,
                    bestSelling: []
                };

                if (user?.role === 'admin' && results[2]) {
                    newStats.adminStats = results[2].data;
                    newStats.bestSelling = results[3].data;
                    if (results[4]?.data) {
                        setWeeklySales(results[4].data.map(d => ({
                            date: d.date,
                            day: d.day,
                            sales: parseFloat(d.total_sales || 0),
                            orders: d.total_orders || 0
                        })));
                    }
                }

                setStats(newStats);
            } catch (err) {
                console.error('Failed to load dashboard data', err);
            }
        };
        fetchDashboardData();
    }, [user]);

    return (
        <div>
            <div style={{ marginBottom: '20px' }}>
                <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)' }}>{user?.role === 'admin' ? 'Admin Dashboard' : 'Staff Dashboard'}</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>Welcome back, {user?.username || 'admin'}. Here is your store's sales and inventory overview.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>

                {user?.role === 'admin' ? (
                    <>
                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(22, 163, 74, 0.12)', padding: '10px', borderRadius: '8px', color: 'var(--primary)' }}>
                                <TrendingUp size={22} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Total Sales</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.2 }}>{formatCurrency(stats.adminStats?.total_sales || 0)}</div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(22, 163, 74, 0.12)', padding: '10px', borderRadius: '8px', color: 'var(--primary)' }}>
                                <DollarSign size={22} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Total Profit</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.2 }}>{formatCurrency(stats.adminStats?.total_profit || 0)}</div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(22, 163, 74, 0.12)', padding: '10px', borderRadius: '8px', color: 'var(--primary)' }}>
                                <ShoppingCart size={22} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Total Transactions</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.2 }}>{stats.adminStats?.total_transactions || 0}</div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '10px', borderRadius: '8px', color: 'var(--danger)' }}>
                                <AlertTriangle size={22} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Low Stock Items</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.2, color: stats.lowStock.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                    {stats.lowStock.length}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(22, 163, 74, 0.12)', padding: '10px', borderRadius: '8px', color: 'var(--primary)' }}>
                                <TrendingUp size={22} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Today's Sales</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.2 }}>{formatCurrency(stats.dailySales.total_revenue || 0)}</div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(22, 163, 74, 0.12)', padding: '10px', borderRadius: '8px', color: 'var(--primary)' }}>
                                <ShoppingCart size={22} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Today's Transactions</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.2 }}>{stats.dailySales.total_transactions || 0}</div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '10px', borderRadius: '8px', color: 'var(--danger)' }}>
                                <AlertTriangle size={22} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Low Stock Items</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.2, color: stats.lowStock.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                    {stats.lowStock.length}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            
            {/* Sales (Last 7 Days) Bar Chart in Green */}
            {user?.role === 'admin' && (
                <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <TrendingUp size={18} color="var(--primary)" /> Sales Performance (Last 7 Days)
                            </h3>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Daily store revenue trends</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(22, 163, 74, 0.12)', color: 'var(--primary)', border: '1px solid rgba(22, 163, 74, 0.3)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                            7-Day Trend
                        </span>
                    </div>
                    <div style={{ width: '100%', height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklySales} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                                <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={{ stroke: 'var(--border)' }} tickFormatter={(val) => `₱${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(22, 163, 74, 0.06)' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{data.date} ({data.day})</div>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(data.sales)}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-main)', marginTop: '2px' }}>{data.orders} {data.orders === 1 ? 'order' : 'orders'}</div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="sales" fill="#16A34A" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'admin' ? 'repeat(auto-fit, minmax(400px, 1fr))' : '1fr', gap: '24px' }}>
                {user?.role === 'admin' && (
                    <div className="glass-panel" style={{ padding: '24px' }}>
                        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 600 }}>
                            <Award size={20} color="var(--primary)" /> Top 5 Best-Selling Products
                        </h3>
                        {(stats.bestSelling || []).filter(i => !i.product_name?.toLowerCase().includes('snapshot') && !i.product_name?.toLowerCase().includes('test')).slice(0, 5).length > 0 ? (
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Product Name</th>
                                            <th>Units Sold</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(stats.bestSelling || []).filter(i => !i.product_name?.toLowerCase().includes('snapshot') && !i.product_name?.toLowerCase().includes('test')).slice(0, 5).map((item, index) => (
                                            <tr key={index}>
                                                <td>{item.product_name}</td>
                                                <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>{item.total_sold}</td>
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

                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ marginBottom: '16px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', fontWeight: 600 }}>
                        <AlertTriangle size={20} color="var(--danger)" /> Low Stock Alerts
                    </h3>
                    {stats.lowStock.length > 0 ? (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product Name</th>
                                        <th>Current Stock</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentLowStockItems.map(item => (
                                        <tr key={item.id}>
                                            <td>{item.product_name}</td>
                                            <td>
                                                {item.stock === 0 ? (
                                                    <span className="badge-pill" style={{ background: 'rgba(220, 38, 38, 0.12)', color: 'var(--danger)', border: '1px solid rgba(220, 38, 38, 0.3)', fontWeight: 600 }}>Out of stock</span>
                                                ) : (
                                                    <span className="badge-pill" style={{ background: '#FEF3C7', color: '#D97706', border: '1px solid #FCD34D', fontWeight: 600 }}>Low ({item.stock})</span>
                                                )}
                                            </td>
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
