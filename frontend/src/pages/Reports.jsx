import { useState, useEffect } from 'react';
import api from '../services/api';
import { BarChart3, TrendingUp, Users, Calendar, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';

const Reports = () => {
    const [dailySales, setDailySales] = useState({ total_revenue: 0, total_transactions: 0 });
    const [monthlySales, setMonthlySales] = useState({ total_revenue: 0, total_transactions: 0 });
    const [bestSelling, setBestSelling] = useState([]);
    const [salesByCashier, setSalesByCashier] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filters for Best Selling
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [bestSellingLoading, setBestSellingLoading] = useState(false);

    useEffect(() => {
        const fetchInitialReports = async () => {
            try {
                const [daily, monthly, cashier, cats] = await Promise.all([
                    api.get('/reports/daily').catch(() => ({ data: { total_revenue: 0, total_transactions: 0 } })),
                    api.get('/reports/monthly').catch(() => ({ data: { total_revenue: 0, total_transactions: 0 } })),
                    api.get('/reports/by-cashier').catch(() => ({ data: [] })),
                    api.get('/reports/categories').catch(() => ({ data: [] }))
                ]);

                setDailySales(daily.data);
                setMonthlySales(monthly.data);
                setSalesByCashier(cashier.data);
                setCategories(cats.data);
            } catch (err) {
                toast.error('Failed to load some reports');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialReports();
    }, []);

    // Effect for fetching Best Selling based on filters
    useEffect(() => {
        const fetchBestSelling = async () => {
            setBestSellingLoading(true);
            try {
                const query = new URLSearchParams();
                if (startDate) query.append('startDate', startDate);
                if (endDate) query.append('endDate', endDate);
                if (filterCategory !== 'All') query.append('category', filterCategory);
                
                const res = await api.get(`/reports/best-selling?${query.toString()}`);
                setBestSelling(res.data);
            } catch (err) {
                toast.error('Failed to load best selling products');
                console.error(err);
            } finally {
                setBestSellingLoading(false);
            }
        };
        fetchBestSelling();
    }, [startDate, endDate, filterCategory]);

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
                        Transactions Today: <span style={{ color: 'var(--text-main)' }}>{dailySales.total_transactions || 0}</span>
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
                        Transactions This Month: <span style={{ color: 'var(--text-main)' }}>{monthlySales.total_transactions || 0}</span>
                    </div>
                </div>
            </div>

            {/* BOTTOM TABLES GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                
                {/* BEST SELLING PRODUCTS WITH FILTERS */}
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                            <TrendingUp size={20} /> Best Selling Products
                        </h3>
                    </div>

                    {/* Filter Bar */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '120px' }}>
                            <select 
                                className="input-premium" 
                                value={filterCategory} 
                                onChange={(e) => setFilterCategory(e.target.value)}
                                style={{ height: '40px', padding: '0 16px', cursor: 'pointer' }}
                            >
                                <option value="All">All Categories</option>
                                {categories.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '240px' }}>
                            <input 
                                type="date" 
                                className="input-premium" 
                                value={startDate} 
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{ padding: '8px 12px', height: '40px' }}
                            />
                            <span style={{ color: 'var(--text-muted)' }}>to</span>
                            <input 
                                type="date" 
                                className="input-premium" 
                                value={endDate} 
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{ padding: '8px 12px', height: '40px' }}
                            />
                        </div>
                        {(startDate || endDate || filterCategory !== 'All') && (
                            <button 
                                className="btn-secondary" 
                                onClick={() => { setStartDate(''); setEndDate(''); setFilterCategory('All'); }}
                                style={{ height: '40px', padding: '0 12px', fontSize: '0.85rem' }}
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {bestSellingLoading ? (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
                            <Spinner text="Filtering products..." />
                        </div>
                    ) : bestSelling.length > 0 ? (
                        <div className="table-container" style={{ flex: 1 }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>Product Name</th>
                                        <th>Units Sold</th>
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
                                            <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{item.total_sold}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', minHeight: '200px' }}>
                            No sales data matches these filters.
                        </div>
                    )}
                </div>

                {/* SALES BY CASHIER TODAY */}
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
