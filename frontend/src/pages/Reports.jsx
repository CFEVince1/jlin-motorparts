import { useState, useEffect } from 'react';
import api from '../services/api';
import { AlertTriangle, BarChart3, Calendar, Filter, TrendingUp, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import useDebouncedValue from '../hooks/useDebouncedValue';

const currency = (value) => `PHP ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const buildQuery = (filters) => {
    const query = new URLSearchParams();

    if (filters.startDate) query.append('startDate', filters.startDate);
    if (filters.endDate) query.append('endDate', filters.endDate);
    if (filters.partNumber.trim()) query.append('partNumber', filters.partNumber.trim());
    if (filters.motorcycleModel.trim()) query.append('motorcycleModel', filters.motorcycleModel.trim());
    if (filters.brand !== 'All') query.append('brand', filters.brand);
    if (filters.category !== 'All') query.append('category', filters.category);

    return query.toString();
};

const Reports = () => {
    const [summary, setSummary] = useState({ total_sales: 0, total_transactions: 0, total_profit: 0 });
    const [bestSelling, setBestSelling] = useState([]);
    const [salesByMotorcycle, setSalesByMotorcycle] = useState([]);
    const [lowStock, setLowStock] = useState([]);
    const [salesByCashier, setSalesByCashier] = useState([]);
    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reportsLoading, setReportsLoading] = useState(false);

    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        partNumber: '',
        motorcycleModel: '',
        brand: 'All',
        category: 'All'
    });
    const debouncedFilters = useDebouncedValue(filters, 250);

    const updateFilter = (key, value) => {
        setFilters(current => ({ ...current, [key]: value }));
    };

    const clearFilters = () => {
        setFilters({
            startDate: '',
            endDate: '',
            partNumber: '',
            motorcycleModel: '',
            brand: 'All',
            category: 'All'
        });
    };

    const hasActiveFilters = Object.values(filters).some(value => value && value !== 'All');

    useEffect(() => {
        const fetchMetadata = async () => {
            try {
                const [cats, brandList] = await Promise.all([
                    api.get('/reports/categories').catch(() => ({ data: [] })),
                    api.get('/reports/brands').catch(() => ({ data: [] }))
                ]);

                setCategories(cats.data);
                setBrands(brandList.data);
            } catch {
                toast.error('Failed to load report filters');
            }
        };

        fetchMetadata();
    }, []);

    useEffect(() => {
        const fetchReports = async () => {
            setReportsLoading(true);
            try {
                const query = buildQuery(debouncedFilters);
                const suffix = query ? `?${query}` : '';

                const [stats, best, motorcycle, low, cashier] = await Promise.all([
                    api.get(`/reports/admin-stats${suffix}`),
                    api.get(`/reports/best-selling${suffix}`),
                    api.get(`/reports/sales-by-motorcycle${suffix}`),
                    api.get(`/reports/low-stock${suffix}`),
                    api.get('/reports/by-cashier').catch(() => ({ data: [] }))
                ]);

                setSummary(stats.data);
                setBestSelling(best.data);
                setSalesByMotorcycle(motorcycle.data);
                setLowStock(low.data);
                setSalesByCashier(cashier.data);
            } catch {
                toast.error('Failed to load reports');
            } finally {
                setReportsLoading(false);
                setLoading(false);
            }
        };

        fetchReports();
    }, [debouncedFilters]);

    if (loading) return <Spinner text="Loading reports..." />;

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>Business Reports</h1>

            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <Filter size={20} color="var(--primary)" />
                    <h3 style={{ margin: 0 }}>Report Filters</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <input
                        type="text"
                        className="input-premium"
                        placeholder="Part number"
                        value={filters.partNumber}
                        onChange={(e) => updateFilter('partNumber', e.target.value)}
                    />
                    <input
                        type="text"
                        className="input-premium"
                        placeholder="Motorcycle model"
                        value={filters.motorcycleModel}
                        onChange={(e) => updateFilter('motorcycleModel', e.target.value)}
                    />
                    <select className="input-premium" value={filters.brand} onChange={(e) => updateFilter('brand', e.target.value)}>
                        <option value="All">All Brands</option>
                        {brands.map(brand => (
                            <option key={brand} value={brand}>{brand}</option>
                        ))}
                    </select>
                    <select className="input-premium" value={filters.category} onChange={(e) => updateFilter('category', e.target.value)}>
                        <option value="All">All Categories</option>
                        {categories.map(category => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                    <div style={{ position: 'relative' }}>
                        <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="date"
                            className="input-premium"
                            style={{ paddingLeft: '40px', width: '100%' }}
                            value={filters.startDate}
                            onChange={(e) => updateFilter('startDate', e.target.value)}
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="date"
                            className="input-premium"
                            style={{ paddingLeft: '40px', width: '100%' }}
                            value={filters.endDate}
                            onChange={(e) => updateFilter('endDate', e.target.value)}
                        />
                    </div>
                </div>

                {hasActiveFilters && (
                    <button className="btn-secondary" onClick={clearFilters} style={{ marginTop: '12px', height: '40px', padding: '0 16px' }}>
                        Clear Filters
                    </button>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>Total Sales</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{currency(summary.total_sales)}</div>
                </div>
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>Total Profit</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>{currency(summary.total_profit)}</div>
                </div>
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>Transactions</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{summary.total_transactions || 0}</div>
                </div>
            </div>

            {reportsLoading && <Spinner text="Updating reports..." />}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 0.9fr)', gap: '24px', alignItems: 'start' }}>
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0 }}>
                        <TrendingUp size={20} /> Best Selling Parts
                    </h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Part Number</th>
                                    <th>Product</th>
                                    <th>Compatibility</th>
                                    <th>Units</th>
                                    <th>Revenue</th>
                                    <th>Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bestSelling.length > 0 ? bestSelling.map((item, idx) => (
                                    <tr key={`${item.part_number}-${item.brand}-${idx}`}>
                                        <td style={{ fontWeight: 'bold', color: idx < 3 ? 'var(--accent)' : 'inherit' }}>#{idx + 1}</td>
                                        <td style={{ fontWeight: 'bold' }}>{item.part_number}</td>
                                        <td>
                                            <div>{item.product_name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.brand} | {item.size}</div>
                                        </td>
                                        <td>{item.compatibility_display || '-'}</td>
                                        <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{item.total_sold}</td>
                                        <td>{currency(item.total_revenue)}</td>
                                        <td>{currency(item.total_profit)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No sales data matches these filters.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0 }}>
                        <BarChart3 size={20} /> Sales by Motorcycle
                    </h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Motorcycle</th>
                                    <th>Units</th>
                                    <th>Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {salesByMotorcycle.length > 0 ? salesByMotorcycle.map(row => (
                                    <tr key={row.motorcycle_unit_id}>
                                        <td>
                                            <div>{row.motorcycle_display || row.motorcycle_model}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.part_numbers || 'No parts'}</div>
                                        </td>
                                        <td style={{ fontWeight: 'bold' }}>{row.total_sold}</td>
                                        <td>{currency(row.total_revenue)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No motorcycle-linked sales yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px', marginTop: '24px' }}>
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={20} /> Low Stock
                    </h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Part Number</th>
                                    <th>Product</th>
                                    <th>Compatibility</th>
                                    <th>Stock</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowStock.length > 0 ? lowStock.map(item => (
                                    <tr key={item.id}>
                                        <td style={{ fontWeight: 'bold' }}>{item.part_number}</td>
                                        <td>
                                            <div>{item.product_name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.brand} | {item.size}</div>
                                        </td>
                                        <td>{item.compatibility_display || '-'}</td>
                                        <td style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{item.stock} / {item.reorder_level}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No low stock items match these filters.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={20} /> Today's Sales by Cashier
                    </h3>
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
                                {salesByCashier.length > 0 ? salesByCashier.map((staff, idx) => (
                                    <tr key={`${staff.cashier}-${idx}`}>
                                        <td style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{staff.cashier}</td>
                                        <td>{staff.total_transactions}</td>
                                        <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{currency(staff.total_revenue)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No cashier sales recorded today.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Reports;
