import { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { TrendingUp, AlertTriangle, DollarSign, ShoppingCart, Award } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

const Dashboard = () => {
    const { user } = useContext(AuthContext);
    const [stats, setStats] = useState({
        dailySales: { total_revenue: 0, total_transactions: 0 },
        lowStock: [],
        adminStats: null,
        bestSelling: []
    });

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
            <h1 style={{ marginBottom: '24px' }}>{user?.role === 'admin' ? 'Admin Dashboard' : 'Staff Dashboard'}</h1>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                
                {user?.role === 'admin' ? (
                    <>
                        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ background: 'rgba(50, 215, 75, 0.2)', padding: '16px', borderRadius: '12px', color: 'var(--success)' }}>
                                <TrendingUp size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>Total Sales</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: '700' }}>₱{Number(stats.adminStats?.total_sales || 0).toLocaleString()}</div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ background: 'rgba(255, 214, 10, 0.2)', padding: '16px', borderRadius: '12px', color: 'var(--accent)' }}>
                                <DollarSign size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>Total Profit</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: '700' }}>₱{Number(stats.adminStats?.total_profit || 0).toLocaleString()}</div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ background: 'rgba(10, 132, 255, 0.2)', padding: '16px', borderRadius: '12px', color: '#0a84ff' }}>
                                <ShoppingCart size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>Total Transactions</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: '700' }}>{stats.adminStats?.total_transactions || 0}</div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ background: 'rgba(50, 215, 75, 0.2)', padding: '16px', borderRadius: '12px', color: 'var(--success)' }}>
                                <TrendingUp size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>Today's Sales</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>₱{Number(stats.dailySales.total_revenue || 0).toLocaleString()}</div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ background: 'rgba(10, 132, 255, 0.2)', padding: '16px', borderRadius: '12px', color: '#0a84ff' }}>
                                <ShoppingCart size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>Today's Transactions</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>{stats.dailySales.total_transactions || 0}</div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'admin' ? 'repeat(auto-fit, minmax(400px, 1fr))' : '1fr', gap: '24px' }}>
                {user?.role === 'admin' && (
                    <div className="glass-panel" style={{ padding: '24px' }}>
                        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Award size={20} color="var(--accent)" /> Best-Selling Products
                        </h3>
                        {stats.bestSelling.length > 0 ? (
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Product Name</th>
                                            <th>Units Sold</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.bestSelling.map((item, index) => (
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
                    <h3 style={{ marginBottom: '16px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={20} /> Low Stock Alerts
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
                                    {stats.lowStock.map(item => (
                                        <tr key={item.id}>
                                            <td>{item.product_name}</td>
                                            <td style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{item.stock}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
