import { useState, useEffect } from 'react';
import api from '../services/api';
import { AlertTriangle, BarChart3, Calendar, Filter, Printer, TrendingUp, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { formatCurrency } from '../utils/formatters';
import PrintSalesReportModal from '../components/PrintSalesReportModal';

const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

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
    const [period, setPeriod] = useState('all'); // 'all', 'daily', 'weekly', 'monthly', 'custom'
    const [showPrintModal, setShowPrintModal] = useState(false);

    // Pagination states (5 items per page)
    const [bestSellingPage, setBestSellingPage] = useState(1);
    const bestSellingPerPage = 5;
    const [motorcyclePage, setMotorcyclePage] = useState(1);
    const motorcyclePerPage = 5;
    const [lowStockPage, setLowStockPage] = useState(1);
    const lowStockPerPage = 5;
    const [cashierPage, setCashierPage] = useState(1);
    const cashierPerPage = 5;

    const user = (() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || { username: 'admin', role: 'admin' };
        } catch {
            return { username: 'admin', role: 'admin' };
        }
    })();

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

    const handlePeriodSelect = (selectedPeriod) => {
        setPeriod(selectedPeriod);
        const now = new Date();

        if (selectedPeriod === 'daily') {
            const todayStr = getLocalDateString(now);
            setFilters(prev => ({
                ...prev,
                startDate: todayStr,
                endDate: todayStr
            }));
        } else if (selectedPeriod === 'weekly') {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - 6);
            setFilters(prev => ({
                ...prev,
                startDate: getLocalDateString(weekStart),
                endDate: getLocalDateString(now)
            }));
        } else if (selectedPeriod === 'monthly') {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            setFilters(prev => ({
                ...prev,
                startDate: getLocalDateString(monthStart),
                endDate: getLocalDateString(now)
            }));
        } else if (selectedPeriod === 'all') {
            setFilters(prev => ({
                ...prev,
                startDate: '',
                endDate: ''
            }));
        }
    };

    const handleStartDateChange = (val) => {
        if (period === 'daily') {
            setFilters(prev => ({ ...prev, startDate: val, endDate: val }));
        } else {
            setPeriod('custom');
            updateFilter('startDate', val);
        }
    };

    const handleEndDateChange = (val) => {
        setPeriod('custom');
        updateFilter('endDate', val);
    };

    const clearFilters = () => {
        setPeriod('all');
        setFilters({
            startDate: '',
            endDate: '',
            partNumber: '',
            motorcycleModel: '',
            brand: 'All',
            category: 'All'
        });
    };

    const hasActiveFilters = period !== 'all' || Boolean(filters.startDate) || Boolean(filters.endDate) || Boolean(filters.partNumber) || Boolean(filters.motorcycleModel) || filters.brand !== 'All' || filters.category !== 'All';

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
                    api.get(`/reports/by-cashier${suffix}`).catch(() => ({ data: [] }))
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

    useEffect(() => {
        setBestSellingPage(1);
        setMotorcyclePage(1);
        setLowStockPage(1);
        setCashierPage(1);
    }, [debouncedFilters]);

    // Best Selling pagination
    const totalBestSellingPages = Math.ceil(bestSelling.length / bestSellingPerPage) || 1;
    const indexOfLastBestSelling = bestSellingPage * bestSellingPerPage;
    const indexOfFirstBestSelling = indexOfLastBestSelling - bestSellingPerPage;
    const currentBestSelling = bestSelling.slice(indexOfFirstBestSelling, indexOfLastBestSelling);

    // Sales by Motorcycle pagination
    const totalMotorcyclePages = Math.ceil(salesByMotorcycle.length / motorcyclePerPage) || 1;
    const indexOfLastMotorcycle = motorcyclePage * motorcyclePerPage;
    const indexOfFirstMotorcycle = indexOfLastMotorcycle - motorcyclePerPage;
    const currentSalesByMotorcycle = salesByMotorcycle.slice(indexOfFirstMotorcycle, indexOfLastMotorcycle);

    // Low Stock pagination
    const totalLowStockPages = Math.ceil(lowStock.length / lowStockPerPage) || 1;
    const indexOfLastLowStock = lowStockPage * lowStockPerPage;
    const indexOfFirstLowStock = indexOfLastLowStock - lowStockPerPage;
    const currentLowStock = lowStock.slice(indexOfFirstLowStock, indexOfLastLowStock);

    // Sales by Cashier pagination
    const totalCashierPages = Math.ceil(salesByCashier.length / cashierPerPage) || 1;
    const indexOfLastCashier = cashierPage * cashierPerPage;
    const indexOfFirstCashier = indexOfLastCashier - cashierPerPage;
    const currentSalesByCashier = salesByCashier.slice(indexOfFirstCashier, indexOfLastCashier);

    const renderPagination = (currentPage, totalPages, totalItems, indexOfFirst, indexOfLast, onPrev, onNext, itemLabel = 'items') => {
        if (totalPages <= 1) return null;
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border)',
                flexWrap: 'wrap',
                gap: '8px'
            }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Showing {totalItems > 0 ? indexOfFirst + 1 : 0} to {Math.min(indexOfLast, totalItems)} of {totalItems} {itemLabel}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                        type="button"
                        onClick={onPrev}
                        disabled={currentPage === 1}
                        className="btn-secondary"
                        style={{
                            padding: '4px 8px',
                            fontSize: '0.78rem',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: currentPage === 1 ? 0.5 : 1,
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <ChevronLeft size={14} /> Prev
                    </button>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', padding: '0 4px' }}>
                        {currentPage} / {totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={onNext}
                        disabled={currentPage === totalPages}
                        className="btn-secondary"
                        style={{
                            padding: '4px 8px',
                            fontSize: '0.78rem',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: currentPage === totalPages ? 0.5 : 1,
                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                        }}
                    >
                        Next <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        );
    };

    if (loading) return <Spinner text="Loading reports..." />;

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>Business Reports</h1>

            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Filter size={20} color="var(--primary)" />
                        <h3 style={{ margin: 0 }}>Report Filters</h3>
                        {period !== 'all' && (
                            <span style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: 'var(--primary)',
                                fontWeight: 600,
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                ● {period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : period === 'monthly' ? 'Monthly' : 'Custom'}
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Daily, Weekly, Monthly Filter Tabs */}
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <button
                                type="button"
                                className={period === 'daily' ? 'btn-primary' : 'btn-secondary'}
                                style={{
                                    height: '30px',
                                    padding: '0 12px',
                                    fontSize: '0.75rem',
                                    borderRadius: '6px',
                                    fontWeight: period === 'daily' ? 600 : 500
                                }}
                                onClick={() => handlePeriodSelect('daily')}
                            >
                                Daily
                            </button>
                            <button
                                type="button"
                                className={period === 'weekly' ? 'btn-primary' : 'btn-secondary'}
                                style={{
                                    height: '30px',
                                    padding: '0 12px',
                                    fontSize: '0.75rem',
                                    borderRadius: '6px',
                                    fontWeight: period === 'weekly' ? 600 : 500
                                }}
                                onClick={() => handlePeriodSelect('weekly')}
                            >
                                Weekly
                            </button>
                            <button
                                type="button"
                                className={period === 'monthly' ? 'btn-primary' : 'btn-secondary'}
                                style={{
                                    height: '30px',
                                    padding: '0 12px',
                                    fontSize: '0.75rem',
                                    borderRadius: '6px',
                                    fontWeight: period === 'monthly' ? 600 : 500
                                }}
                                onClick={() => handlePeriodSelect('monthly')}
                            >
                                Monthly
                            </button>
                            <button
                                type="button"
                                className={period === 'all' ? 'btn-primary' : 'btn-secondary'}
                                style={{
                                    height: '30px',
                                    padding: '0 12px',
                                    fontSize: '0.75rem',
                                    borderRadius: '6px',
                                    fontWeight: period === 'all' ? 600 : 500
                                }}
                                onClick={() => handlePeriodSelect('all')}
                            >
                                All Time
                            </button>
                        </div>

                        {/* Print Report Button */}
                        <button
                            type="button"
                            className="btn-primary"
                            style={{
                                height: '36px',
                                padding: '0 14px',
                                fontSize: '0.75rem',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer'
                            }}
                            onClick={() => setShowPrintModal(true)}
                            title="Print current filtered sales report"
                        >
                            <Printer size={16} />
                            Print Report
                        </button>
                    </div>
                </div>

                <div className="grid-cols-filter-6">
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
                    <div style={{ position: 'relative' }} title={period === 'daily' ? 'Selected Date (Daily)' : 'Start Date'}>
                        <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="date"
                            className="input-premium"
                            style={{ paddingLeft: '40px', width: '100%' }}
                            value={filters.startDate}
                            onChange={(e) => handleStartDateChange(e.target.value)}
                        />
                    </div>
                    <div style={{ position: 'relative' }} title={period === 'daily' ? 'Selected Date (Daily)' : 'End Date'}>
                        <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="date"
                            className="input-premium"
                            style={{ paddingLeft: '40px', width: '100%' }}
                            value={filters.endDate}
                            onChange={(e) => handleEndDateChange(e.target.value)}
                        />
                    </div>
                </div>

                {hasActiveFilters && (
                    <button className="btn-secondary" onClick={clearFilters} style={{ marginTop: '12px', height: '36px', padding: '0 14px' }}>
                        Clear Filters
                    </button>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Sales</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>{formatCurrency(summary.total_sales)}</div>
                </div>
                <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Profit</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>{formatCurrency(summary.total_profit)}</div>
                </div>
                <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Transactions</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{summary.total_transactions || 0}</div>
                </div>
            </div>

            {reportsLoading && <Spinner text="Updating reports..." />}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '24px', alignItems: 'start' }}>
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                            <TrendingUp size={20} /> Best Selling Parts
                        </h3>
                        {bestSelling.length > 0 && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Total: {bestSelling.length} {bestSelling.length === 1 ? 'part' : 'parts'}
                            </span>
                        )}
                    </div>
                    <div className="table-container">
                        <table style={{ minWidth: '660px' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '60px', whiteSpace: 'nowrap' }}>Rank</th>
                                    <th style={{ whiteSpace: 'nowrap' }}>Part Number</th>
                                    <th style={{ minWidth: '160px' }}>Product</th>
                                    <th style={{ minWidth: '100px' }}>Compatibility</th>
                                    <th className="text-right" style={{ whiteSpace: 'nowrap' }}>Units</th>
                                    <th className="text-right" style={{ whiteSpace: 'nowrap' }}>Revenue</th>
                                    <th className="text-right" style={{ whiteSpace: 'nowrap' }}>Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentBestSelling.length > 0 ? currentBestSelling.map((item, idx) => {
                                    const globalRank = indexOfFirstBestSelling + idx + 1;
                                    return (
                                        <tr key={`${item.part_number}-${item.brand}-${idx}`}>
                                            <td style={{ fontWeight: 'bold', color: globalRank <= 3 ? 'var(--primary)' : 'inherit', whiteSpace: 'nowrap' }}>
                                                #{globalRank}
                                            </td>
                                            <td style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{item.part_number}</td>
                                            <td>
                                                <div style={{ fontWeight: 500 }}>{item.product_name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.brand} | {item.size}</div>
                                            </td>
                                            <td>{item.compatibility_display || '-'}</td>
                                            <td className="text-right" style={{ fontWeight: 'bold', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                                                {item.total_sold}
                                            </td>
                                            <td className="text-right" style={{ whiteSpace: 'nowrap' }}>{formatCurrency(item.total_revenue)}</td>
                                            <td className="text-right" style={{ whiteSpace: 'nowrap' }}>{formatCurrency(item.total_profit)}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={7} className="table-empty-state">No sales data matches these filters.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {renderPagination(
                        bestSellingPage,
                        totalBestSellingPages,
                        bestSelling.length,
                        indexOfFirstBestSelling,
                        indexOfLastBestSelling,
                        () => setBestSellingPage(p => Math.max(p - 1, 1)),
                        () => setBestSellingPage(p => Math.min(p + 1, totalBestSellingPages)),
                        'parts'
                    )}
                </div>

                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                            <BarChart3 size={20} /> Sales by Motorcycle
                        </h3>
                        {salesByMotorcycle.length > 0 && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Total: {salesByMotorcycle.length} {salesByMotorcycle.length === 1 ? 'model' : 'models'}
                            </span>
                        )}
                    </div>
                    <div className="table-container">
                        <table style={{ minWidth: '320px' }}>
                            <thead>
                                <tr>
                                    <th>Motorcycle</th>
                                    <th className="text-right" style={{ whiteSpace: 'nowrap' }}>Units</th>
                                    <th className="text-right" style={{ whiteSpace: 'nowrap' }}>Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentSalesByMotorcycle.length > 0 ? currentSalesByMotorcycle.map((row, idx) => (
                                    <tr key={row.motorcycle_unit_id || row.model || row.motorcycle_model || idx}>
                                        <td>
                                            <div>{row.motorcycle_display || row.motorcycle_model}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.part_numbers || 'No parts'}</div>
                                        </td>
                                        <td className="text-right" style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{row.total_sold}</td>
                                        <td className="text-right" style={{ whiteSpace: 'nowrap' }}>{formatCurrency(row.total_revenue)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={3} className="table-empty-state">No motorcycle-linked sales yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {renderPagination(
                        motorcyclePage,
                        totalMotorcyclePages,
                        salesByMotorcycle.length,
                        indexOfFirstMotorcycle,
                        indexOfLastMotorcycle,
                        () => setMotorcyclePage(p => Math.max(p - 1, 1)),
                        () => setMotorcyclePage(p => Math.min(p + 1, totalMotorcyclePages)),
                        'models'
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '24px', marginTop: '24px' }}>
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertTriangle size={20} /> Low Stock
                        </h3>
                        {lowStock.length > 0 && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Total: {lowStock.length} {lowStock.length === 1 ? 'item' : 'items'}
                            </span>
                        )}
                    </div>
                    <div className="table-container">
                        <table style={{ minWidth: '450px' }}>
                            <thead>
                                <tr>
                                    <th style={{ whiteSpace: 'nowrap' }}>Part Number</th>
                                    <th style={{ minWidth: '160px' }}>Product</th>
                                    <th>Compatibility</th>
                                    <th className="text-right" style={{ whiteSpace: 'nowrap' }}>Stock</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentLowStock.length > 0 ? currentLowStock.map(item => (
                                    <tr key={item.id}>
                                        <td style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{item.part_number}</td>
                                        <td>
                                            <div style={{ fontWeight: 500 }}>{item.product_name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.brand} | {item.size}</div>
                                        </td>
                                        <td>{item.compatibility_display || '-'}</td>
                                        <td className="text-right" style={{ color: 'var(--danger)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                            {item.stock} / {item.reorder_level}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={4} className="table-empty-state">No low stock items match these filters.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {renderPagination(
                        lowStockPage,
                        totalLowStockPages,
                        lowStock.length,
                        indexOfFirstLowStock,
                        indexOfLastLowStock,
                        () => setLowStockPage(p => Math.max(p - 1, 1)),
                        () => setLowStockPage(p => Math.min(p + 1, totalLowStockPages)),
                        'items'
                    )}
                </div>

                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={20} /> {
                                period === 'daily' ? "Daily Sales by Cashier" :
                                period === 'weekly' ? "Weekly Sales by Cashier" :
                                period === 'monthly' ? "Monthly Sales by Cashier" :
                                period === 'all' ? "Sales by Cashier (All-Time)" :
                                "Sales by Cashier"
                            }
                        </h3>
                        {salesByCashier.length > 0 && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Total: {salesByCashier.length} {salesByCashier.length === 1 ? 'cashier' : 'cashiers'}
                            </span>
                        )}
                    </div>
                    <div className="table-container">
                        <table style={{ minWidth: '320px' }}>
                            <thead>
                                <tr>
                                    <th>Cashier</th>
                                    <th className="text-right" style={{ whiteSpace: 'nowrap' }}>Transactions</th>
                                    <th className="text-right" style={{ whiteSpace: 'nowrap' }}>Total Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentSalesByCashier.length > 0 ? currentSalesByCashier.map((staff, idx) => (
                                    <tr key={`${staff.cashier}-${idx}`}>
                                        <td style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{staff.cashier}</td>
                                        <td className="text-right" style={{ whiteSpace: 'nowrap' }}>{staff.total_transactions}</td>
                                        <td className="text-right" style={{ fontWeight: 'bold', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                                            {formatCurrency(staff.total_revenue)}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={3} className="table-empty-state">No cashier sales recorded for this period.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {renderPagination(
                        cashierPage,
                        totalCashierPages,
                        salesByCashier.length,
                        indexOfFirstCashier,
                        indexOfLastCashier,
                        () => setCashierPage(p => Math.max(p - 1, 1)),
                        () => setCashierPage(p => Math.min(p + 1, totalCashierPages)),
                        'cashiers'
                    )}
                </div>
            </div>

            {/* Printable Sales Report Modal */}
            <PrintSalesReportModal
                isOpen={showPrintModal}
                onClose={() => setShowPrintModal(false)}
                summary={summary}
                bestSelling={bestSelling}
                salesByMotorcycle={salesByMotorcycle}
                salesByCashier={salesByCashier}
                filters={filters}
                period={period}
                user={user}
            />
        </div>
    );
};

export default Reports;
