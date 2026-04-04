import { useState, useEffect } from 'react';
import api from '../services/api';
import { Package, TrendingUp, AlertTriangle } from 'lucide-react';

const Dashboard = () => {
    const [stats, setStats] = useState({
        totalProducts: 0,
        dailySales: { total_revenue: 0, total_transactions: 0 },
        lowStock: []
    });

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [productsRes, salesRes, lowStockRes] = await Promise.all([
                    api.get('/products'),
                    api.get('/reports/daily').catch(() => ({ data: { total_revenue: 0, total_transactions: 0 } })),
                    api.get('/reports/low-stock').catch(() => ({ data: [] }))
                ]);

                setStats({
                    totalProducts: productsRes.data.length,
                    dailySales: salesRes.data,
                    lowStock: lowStockRes.data
                });
            } catch (err) {
                console.error('Failed to load dashboard data', err);
            }
        };
        fetchDashboardData();
    }, []);

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>Dashboard</h1>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>

                {/* Widget 1 */}
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ background: 'rgba(50, 215, 75, 0.2)', padding: '16px', borderRadius: '12px', color: 'var(--success)' }}>
                        <TrendingUp size={32} />
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>Today's Sales</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>₱{Number(stats.dailySales.total_revenue || 0).toLocaleString()}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{stats.dailySales.total_transactions || 0} Transactions</div>
                    </div>
                </div>

                {/* Widget 2 */}
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ background: 'rgba(255, 214, 10, 0.2)', padding: '16px', borderRadius: '12px', color: 'var(--accent)' }}>
                        <Package size={32} />
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>Total Products</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>{stats.totalProducts}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>In Catalog</div>
                    </div>
                </div>

                {/* Widget 3 */}
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ background: 'rgba(255, 69, 58, 0.2)', padding: '16px', borderRadius: '12px', color: 'var(--danger)' }}>
                        <AlertTriangle size={32} />
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>Low Stock Alerts</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>{stats.lowStock.length}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Items need restock</div>
                    </div>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '16px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={20} /> Needs Attention
                </h3>
                {stats.lowStock.length > 0 ? (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Product Name</th>
                                    <th>Brand</th>
                                    <th>Current Stock</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.lowStock.map(item => (
                                    <tr key={item.id}>
                                        <td>{item.product_name}</td>
                                        <td>{item.brand}</td>
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
    );
};

export default Dashboard;
