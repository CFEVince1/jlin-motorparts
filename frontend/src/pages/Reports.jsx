import { useState, useEffect } from 'react';
import api from '../services/api';
import { BarChart3, TrendingUp, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';

const Reports = () => {
    const [dailySales, setDailySales] = useState({ total_revenue: 0, total_transactions: 0 });
    const [monthlySales, setMonthlySales] = useState({ total_revenue: 0, total_transactions: 0 });
    const [bestSelling, setBestSelling] = useState([]);
    const [salesByCashier, setSalesByCashier] = useState([]); // NEW STATE
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const [daily, monthly, best, cashier] = await Promise.all([
                    api.get('/reports/daily').catch(() => ({ data: { total_revenue: 0, total_transactions: 0 } })),
                    api.get('/reports/monthly').catch(() => ({ data: { total_revenue: 0, total_transactions: 0 } })),
                    api.get('/reports/best-selling').catch(() => ({ data: [] })),
                    api.get('/reports/by-cashier').catch(() => ({ data: [] })) // NEW API CALL
                ]);

                setDailySales(daily.data);
                setMonthlySales(monthly.data);
                setBestSelling(best.data);
                setSalesByCashier(cashier.data); // SET NEW DATA
            } catch (err) {
                toast.error('Failed to load some reports');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchReports();
    }, []);

    if (loading) return <Spinner text="Loading reports..." />;

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>Business Reports</h1>

            {/* TOP METRICS CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                <div className="glass-panel" style={{ padding: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <TrendingUp color="var(--primary)" size={28} />
                        <h2 style={{ m: 0 }}>Daily Revenue</h2>
                    </div>
                    <div style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '8px' }}>
                        ₱{Number(dailySales.total_revenue || 0).toLocaleString()}
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>
                        Transactions Today: <span style={{ color: 'white' }}>{dailySales.total_transactions || 0}</span>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <BarChart3 color="var(--success)" size={28} />
                        <h2 style={{ m: 0 }}>Monthly Revenue</h2>
                    </div>
                    <div style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '8px' }}>
                        ₱{Number(monthlySales.total_revenue || 0).toLocaleString()}
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>
                        Transactions This Month: <span style={{ color: 'white' }}>{monthlySales.total_transactions || 0}</span>
                    </div>
                </div>
            </div>

            {/* BOTTOM TABLES GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                
                {/* BEST SELLING PRODUCTS */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <TrendingUp size={20} /> Best Selling Products (Top 10)
                    </h3>
                    {bestSelling.length > 0 ? (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>Product Name</th>
                                        <th>Total Units Sold</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bestSelling.map((item, idx) => (
                                        <tr key={idx}>
                                            <td style={{ fontWeight: 'bold', color: idx < 3 ? 'var(--accent)' : 'inherit' }}>#{idx + 1}</td>
                                            <td>
                                                <div>{item.product_name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.brand}</div>
                                            </td>
                                            <td style={{ fontWeight: 'bold' }}>{item.total_sold} units</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)' }}>No sales data available yet.</p>
                    )}
                </div>

                {/* NEW: SALES BY CASHIER TODAY */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={20} /> Today's Sales by Cashier
                    </h3>
                    {salesByCashier.length > 0 ? (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Cashier</th>
                                        <th>Transactions</th>
                                        <th>Total Revenue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesByCashier.map((staff, idx) => (
                                        <tr key={idx}>
                                            <td style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                                                {staff.cashier}
                                            </td>
                                            <td>{staff.total_transactions}</td>
                                            <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                                                ₱{Number(staff.total_revenue).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)' }}>No cashier sales recorded today.</p>
                    )}
                </div>

            </div>
        </div>
    );
};

export default Reports;
