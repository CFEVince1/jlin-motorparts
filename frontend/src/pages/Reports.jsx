import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
    TrendingUp,
    DollarSign,
    Package,
    Wallet,
    Download,
    Calendar,
    Printer,
    Search,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
    ArrowUpRight,
    ArrowDownRight,
    Filter,
    Layers,
    FileSpreadsheet,
    Truck,
    Percent,
    ShieldAlert,
    Clock,
    Lock,
    Eye,
    X,
    Building2,
    Boxes
} from 'lucide-react';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import { getLedgerCategoryCode, getCategoryBadgeMeta, getShortBrand } from '../utils/categoryTaxonomy';

const TABS = [
    { id: 'profit_report', name: 'Profit Report', icon: DollarSign },
    { id: 'sales_report', name: 'Sales Report', icon: TrendingUp },
    { id: 'inventory_report', name: 'Inventory Velocity', icon: Package },
    { id: 'cashflow_report', name: 'Expenses & Cash Flow', icon: Wallet },
    { id: 'export_tab', name: 'Export & Bookkeeping', icon: Download },
];

// Helper to get formatted PST dates
const getPSTDateString = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
};

const getFirstDayOfMonthString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
};

const getMondayOfWeekString = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(d.setDate(diff));
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(monday);
};

export const Reports = () => {
    const { user } = useContext(AuthContext);
    const isAdmin = user?.role?.toLowerCase() === 'admin';

    // 1. Navigation & Filters
    const [activeTab, setActiveTab] = useState('profit_report');
    const [timeframe, setTimeframe] = useState('today'); // 'today' | 'yesterday' | 'week' | 'month' | 'custom'
    const [startDate, setStartDate] = useState(() => getPSTDateString(0));
    const [endDate, setEndDate] = useState(() => getPSTDateString(0));
    const [velocityFilter, setVelocityFilter] = useState('ALL'); // 'ALL' | 'FAST' | 'SLOW' | 'DEAD'
    const [deadStockThreshold, setDeadStockThreshold] = useState(60);
    const [productSearch, setProductSearch] = useState('');
    const [loading, setLoading] = useState(false);

    // 2. Report Data States
    const [salesProfitData, setSalesProfitData] = useState(null);
    const [fastDeadStockData, setFastDeadStockData] = useState(null);
    const [cashflowData, setCashflowData] = useState(null);

    // 3. Print Modal State for Tab 5 (Export & Bookkeeping)
    const [printModalState, setPrintModalState] = useState({
        isOpen: false,
        title: '',
        type: ''
    });

    // Query string helper
    const queryParams = useMemo(() => {
        const p = new URLSearchParams();
        p.append('timeframe', timeframe);
        if (startDate) p.append('startDate', startDate);
        if (endDate) p.append('endDate', endDate);
        return p.toString();
    }, [timeframe, startDate, endDate]);

    // Active timeframe label
    const activeTimeframeLabel = useMemo(() => {
        if (timeframe === 'today') return `Today (${getPSTDateString(0)})`;
        if (timeframe === 'yesterday') return `Yesterday (${getPSTDateString(-1)})`;
        if (timeframe === 'week') return 'This Week';
        if (timeframe === 'month') return 'This Month';
        if (timeframe === 'custom') return `${startDate || 'Start'} to ${endDate || 'End'}`;
        return 'Active Period';
    }, [timeframe, startDate, endDate]);

    // Apply quick preset to filter bar
    const handleApplyPreset = (preset) => {
        setTimeframe(preset);
        if (preset === 'today') {
            const today = getPSTDateString(0);
            setStartDate(today);
            setEndDate(today);
        } else if (preset === 'yesterday') {
            const yesterday = getPSTDateString(-1);
            setStartDate(yesterday);
            setEndDate(yesterday);
        } else if (preset === 'week') {
            setStartDate(getMondayOfWeekString());
            setEndDate(getPSTDateString(0));
        } else if (preset === 'month') {
            setStartDate(getFirstDayOfMonthString());
            setEndDate(getPSTDateString(0));
        }
    };

    // Data Fetcher
    const fetchActiveReport = useCallback(async () => {
        if (!isAdmin) return;
        setLoading(true);
        try {
            if (activeTab === 'profit_report' || activeTab === 'sales_report') {
                const res = await api.get(`/reports/sales-net-profit?${queryParams}`);
                setSalesProfitData(res.data);
            } else if (activeTab === 'inventory_report') {
                const res = await api.get(`/reports/fast-moving-dead-stock?${queryParams}&thresholdDays=${deadStockThreshold}`);
                setFastDeadStockData(res.data);
            } else if (activeTab === 'cashflow_report') {
                const res = await api.get(`/reports/expenses-cashflow?${queryParams}`);
                setCashflowData(res.data);
            } else if (activeTab === 'export_tab') {
                // Pre-fetch all necessary datasets for 1-click downloads
                const [pRes, vRes, cRes] = await Promise.all([
                    api.get(`/reports/sales-net-profit?${queryParams}`),
                    api.get(`/reports/fast-moving-dead-stock?${queryParams}&thresholdDays=${deadStockThreshold}`),
                    api.get(`/reports/expenses-cashflow?${queryParams}`)
                ]);
                setSalesProfitData(pRes.data);
                setFastDeadStockData(vRes.data);
                setCashflowData(cRes.data);
            }
        } catch (err) {
            console.error('Failed to load report:', err);
            toast.error('Failed to generate report data');
        } finally {
            setLoading(false);
        }
    }, [isAdmin, activeTab, queryParams, deadStockThreshold]);

    useEffect(() => {
        fetchActiveReport();
    }, [fetchActiveReport]);

    // Filtered Sold Products for Profit Report
    const filteredSoldProducts = useMemo(() => {
        const list = salesProfitData?.sold_products || [];
        if (!productSearch.trim()) return list;
        const q = productSearch.trim().toLowerCase();
        return list.filter(p =>
            (p.product_name || '').toLowerCase().includes(q) ||
            (p.part_number || '').toLowerCase().includes(q) ||
            (p.brand || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q)
        );
    }, [salesProfitData?.sold_products, productSearch]);

    // Filtered Velocity Products for Inventory Report
    const filteredVelocityProducts = useMemo(() => {
        const fast = fastDeadStockData?.fast_moving?.items || [];
        const slow = fastDeadStockData?.slow_moving?.items || [];
        const dead = fastDeadStockData?.dead_stock?.items || [];

        let combined = [];
        if (velocityFilter === 'FAST') combined = fast;
        else if (velocityFilter === 'SLOW') combined = slow;
        else if (velocityFilter === 'DEAD') combined = dead;
        else combined = [...fast, ...slow, ...dead];

        if (!productSearch.trim()) return combined;
        const q = productSearch.trim().toLowerCase();
        return combined.filter(p =>
            (p.part_name || '').toLowerCase().includes(q) ||
            (p.sku || '').toLowerCase().includes(q) ||
            (p.brand || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q) ||
            (p.shelf_location || '').toLowerCase().includes(q)
        );
    }, [fastDeadStockData, velocityFilter, productSearch]);

    // CSV Download Helper
    const downloadCSV = (filename, csvContent) => {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}_${getPSTDateString(0)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Downloaded ${filename}.csv!`);
    };

    // 1-Click Exports
    const exportSalesGCashLog = () => {
        const txns = salesProfitData?.sales_transactions || [];
        let csv = 'Transaction #,Sale Date,Cashier,Customer,Payment Method,GCash Ref #,Total Amount (PHP),Status,Items Summary\n';
        txns.forEach(t => {
            csv += `"${t.order_number}","${t.sale_date}","${t.cashier_name}","${t.customer_name}","${t.payment_method}","${t.payment_reference || ''}","${t.total_amount}","${t.status}","${(t.items_summary || '').replace(/"/g, '""')}"\n`;
        });
        downloadCSV('Sales_and_GCash_Reference_Log', csv);
    };

    const exportProfitCOGSSummary = () => {
        const prods = salesProfitData?.sold_products || [];
        let csv = 'Part / Product Name,SKU / Part Number,Category Code,Brand,Units Sold,Wholesale Cost (PHP),Retail Price (PHP),Total Revenue (PHP),Gross Profit (PHP),Margin %\n';
        prods.forEach(p => {
            const catCode = getLedgerCategoryCode(p.category);
            csv += `"${p.product_name}","${p.part_number}","${catCode}","${p.brand}","${p.total_qty_sold}","${p.avg_unit_cost}","${p.avg_unit_price}","${p.total_revenue}","${p.total_gross_profit}","${p.margin_pct}%"\n`;
        });
        downloadCSV('Profit_and_COGS_Summary', csv);
    };

    const exportInventoryValuation = () => {
        const allItems = [...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])];
        let csv = 'Part Name,SKU,Category,Brand,Rack / Shelf,Current Stock,Unit Cost (PHP),Retail Price (PHP),Tied-Up Capital (PHP),Velocity Category\n';
        allItems.forEach(i => {
            const velCat = i.days_inactive >= 60 ? 'Dead Stock' : (i.net_qty_sold >= 3 ? 'Fast-Moving' : 'Slow-Moving');
            csv += `"${i.part_name}","${i.sku}","${i.category}","${i.brand}","${i.shelf_location || 'Main Floor'}","${i.sellable_stock}","${i.supplier_cost}","${i.retail_price}","${i.capital_tied_up || (i.sellable_stock * i.supplier_cost).toFixed(2)}","${velCat}"\n`;
        });
        downloadCSV('Inventory_Valuation_and_Velocity_Sheet', csv);
    };

    const exportSupplierTruckDeliveries = () => {
        const recs = cashflowData?.receiving_records || [];
        let csv = 'Paper DR / Reference #,Date Received,Supplier Name,Truck Driver,Sent Qty,Accepted Good Qty,Rejected / Damaged Qty,Total Paid (PHP),Payment Mode\n';
        recs.forEach(r => {
            csv += `"${r.reference_no}","${r.received_at}","${r.supplier_name}","${r.delivery_personnel}","${r.total_delivered_qty}","${r.total_accepted_qty}","${r.total_rejected_qty}","${r.total_cost}","${r.payment_source === 'owner_funds' ? 'Owner Funds' : 'Shift Drawer'}"\n`;
        });
        downloadCSV('Supplier_Truck_Deliveries_Log', csv);
    };

    const exportShiftDrawerVarianceLog = () => {
        const shifts = salesProfitData?.daily_shift_summary || [];
        let csv = 'Date / Shift,Cashier,Transactions Count,Gross Sales (PHP),OTP Discounts (PHP),Net Collected (PHP),Cash Collected (PHP),GCash Collected (PHP)\n';
        shifts.forEach(s => {
            csv += `"${s.shift_date}","${s.cashier_name}","${s.txns_count}","${s.gross_sales}","${s.otp_discounts}","${s.net_collected}","${s.cash_collected}","${s.gcash_collected}"\n`;
        });
        downloadCSV('Shift_and_Cash_Drawer_Log', csv);
    };

    // Print Modal Opener & Body Class Management
    useEffect(() => {
        if (printModalState.isOpen) {
            document.body.classList.add('report-print-mode');
        } else {
            document.body.classList.remove('report-print-mode');
        }
        return () => {
            document.body.classList.remove('report-print-mode');
        };
    }, [printModalState.isOpen]);

    const handleOpenPrintModal = (type, title) => {
        setPrintModalState({
            isOpen: true,
            title,
            type
        });
    };

    const handlePrintActiveTab = () => {
        if (activeTab === 'profit_report') {
            handleOpenPrintModal('profit_summary', 'Profit & COGS Summary');
        } else if (activeTab === 'sales_report') {
            handleOpenPrintModal('sales_log', 'Sales & GCash Reference Log');
        } else if (activeTab === 'inventory_report') {
            handleOpenPrintModal('inventory_val', 'Inventory Valuation & Velocity Sheet');
        } else if (activeTab === 'cashflow_report') {
            handleOpenPrintModal('truck_deliveries', 'Supplier Truck Deliveries Log');
        } else {
            handleOpenPrintModal('sales_log', 'Sales & GCash Reference Log');
        }
    };

    // Security Check: Reports are strictly Admin/Owner only
    if (!isAdmin) {
        return (
            <div className="container" style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div className="glass-panel" style={{ maxWidth: '500px', margin: '0 auto', padding: '40px 24px', borderRadius: '16px' }}>
                    <ShieldAlert size={56} style={{ color: 'var(--danger)', margin: '0 auto 16px auto' }} />
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>Admin Authorization Required</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                        Financial reports, supplier cost valuations (puhunan), and cash flow analytics are strictly reserved for the Store Owner and Admin role.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="container" style={{ padding: '24px 20px', maxWidth: '1440px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                    <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <DollarSign size={26} style={{ color: 'var(--primary)' }} /> Reports & Financial Intelligence
                    </h1>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={handlePrintActiveTab}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
                        title="Print or export PDF of current report"
                    >
                        <Printer size={14} />
                        Print Report
                    </button>
                    <button
                        type="button"
                        onClick={fetchActiveReport}
                        disabled={loading}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
                        title="Refresh report data"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Refresh Data
                    </button>
                </div>
            </div>

            {/* GLOBAL FILTER BAR (SHARED ACROSS ALL 5 TABS) */}
            <div className="glass-panel" style={{ padding: '14px 18px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                    {/* Presets */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={14} /> Presets:
                        </span>
                        {[
                            { key: 'today', label: 'Today' },
                            { key: 'yesterday', label: 'Yesterday' },
                            { key: 'week', label: 'This Week' },
                            { key: 'month', label: 'This Month' },
                            { key: 'custom', label: 'Custom Range' }
                        ].map(p => {
                            const isSelected = timeframe === p.key;
                            return (
                                <button
                                    key={p.key}
                                    type="button"
                                    onClick={() => handleApplyPreset(p.key)}
                                    style={{
                                        padding: '5px 12px',
                                        fontSize: '0.78rem',
                                        fontWeight: 600,
                                        borderRadius: '6px',
                                        border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                                        background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface)',
                                        color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {p.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Date Pickers */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>From:</label>
                            <input
                                type="date"
                                className="input-premium"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setTimeframe('custom');
                                }}
                                style={{ height: '32px', fontSize: '0.78rem', padding: '0 8px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>To:</label>
                            <input
                                type="date"
                                className="input-premium"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setTimeframe('custom');
                                }}
                                style={{ height: '32px', fontSize: '0.78rem', padding: '0 8px' }}
                            />
                        </div>

                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--surface-hover)', padding: '4px 8px', borderRadius: '4px' }}>
                            Filtering: <strong>{activeTimeframeLabel}</strong>
                        </span>
                    </div>
                </div>
            </div>

            {/* TAB NAVIGATION BUTTONS */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '22px' }}>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                                setActiveTab(tab.id);
                                setProductSearch('');
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '9px 16px',
                                fontSize: '0.86rem',
                                fontWeight: 700,
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
                                background: isActive ? 'var(--primary)' : 'transparent',
                                color: isActive ? '#000' : 'var(--text-muted)',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            <Icon size={16} />
                            {tab.name}
                        </button>
                    );
                })}
            </div>

            {/* TAB 1: PROFIT REPORT */}
            {activeTab === 'profit_report' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                    {/* 4 TOP KPI SUMMARY CARDS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                        {/* 1. Net Retail Revenue */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Net Retail Revenue
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                {formatCurrency(salesProfitData?.financials?.net_retail_sales || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Counter Sales − OTP Discounts (excl. voided)
                            </div>
                        </div>

                        {/* 2. Total Active COGS (Puhunan) */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Total Active COGS (Puhunan)
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>
                                {formatCurrency(salesProfitData?.financials?.cost_of_goods_sold || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Supplier wholesale cost of all parts sold
                            </div>
                        </div>

                        {/* 3. In-Store Damage Write-Offs */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                In-Store Damage Write-Offs
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger)' }}>
                                {formatCurrency(salesProfitData?.financials?.shrinkage_losses || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Parts damaged/dropped on shelf (cost × qty)
                            </div>
                        </div>

                        {/* 4. True Net Profit & Margin % */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase' }}>
                                    True Net Profit
                                </span>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: 'var(--primary)'
                                }}>
                                    {salesProfitData?.financials?.profit_margin_pct || 0}% Margin
                                </span>
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)' }}>
                                {formatCurrency(salesProfitData?.financials?.true_net_profit || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Revenue − COGS − Damage − OpEx
                            </div>
                        </div>
                    </div>

                    {/* PROFIT BREAKDOWN TABLE (6 COLUMNS) */}
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                                    Profit Breakdown by Product & Category
                                </h3>
                            </div>

                            <div style={{ position: 'relative', width: '280px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    className="input-premium"
                                    placeholder="Filter by part name or SKU..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    style={{ width: '100%', paddingLeft: '32px', height: '34px', fontSize: '0.8rem' }}
                                />
                                {productSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setProductSearch('')}
                                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>1. Part & SKU</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', width: '90px' }}>2. Cat Code</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', width: '100px' }}>3. Net Units Sold</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'right', width: '120px' }}>4. Net Revenue</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'right', width: '120px' }}>5. Total COGS</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right', width: '150px' }}>6. Gross Profit & Margin</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSoldProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No parts sold in this period matching your filter.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredSoldProducts.map((p, idx) => {
                                            const catCode = getLedgerCategoryCode(p.category);
                                            const catMeta = getCategoryBadgeMeta(catCode);
                                            const profit = Number(p.total_gross_profit || 0);
                                            const margin = p.margin_pct || 0;

                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    {/* 1. Part & SKU */}
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{p.product_name}</div>
                                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                            {p.part_number} • {p.brand}
                                                        </div>
                                                    </td>

                                                    {/* 2. Cat Code */}
                                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                        <span style={{
                                                            fontSize: '0.72rem',
                                                            fontWeight: 800,
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            background: catMeta.bg,
                                                            color: catMeta.color,
                                                            border: `1px solid ${catMeta.border}`
                                                        }}>
                                                            {catCode}
                                                        </span>
                                                    </td>

                                                    {/* 3. Net Units Sold */}
                                                    <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700 }}>
                                                        {p.total_qty_sold} units
                                                    </td>

                                                    {/* 4. Net Revenue */}
                                                    <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600 }}>
                                                        {formatCurrency(p.total_revenue)}
                                                    </td>

                                                    {/* 5. Total COGS */}
                                                    <td style={{ padding: '10px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>
                                                        {formatCurrency(Number(p.avg_unit_cost) * Number(p.total_qty_sold))}
                                                    </td>

                                                    {/* 6. Gross Profit & Margin % */}
                                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                        <div style={{ fontWeight: 800, color: profit >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                                                            {formatCurrency(profit)}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                            ({margin}%)
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

            {/* TAB 2: SALES REPORT */}
            {activeTab === 'sales_report' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                    {/* 4 TOP KPI SUMMARY CARDS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                        {/* 1. Total Completed Transactions */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Completed Transactions
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                {salesProfitData?.payment_channels?.total_transactions || 0}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                POS Sales Receipts (SO) & Swaps (SWP)
                            </div>
                        </div>

                        {/* 2. Cash Collected at Counter */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Cash Collected at Counter
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)' }}>
                                {formatCurrency(salesProfitData?.payment_channels?.cash?.amount || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {salesProfitData?.payment_channels?.cash?.count || 0} Cash Transactions
                            </div>
                        </div>

                        {/* 3. GCash Collected */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                GCash Collected
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8' }}>
                                {formatCurrency(salesProfitData?.payment_channels?.gcash?.amount || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {salesProfitData?.payment_channels?.gcash?.count || 0} Verified GCash Payments
                            </div>
                        </div>

                        {/* 4. Discounts & Exceptions */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Discounts & Exceptions
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>
                                {formatCurrency(salesProfitData?.financials?.discounts || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Admin OTP Authorized Price Reductions
                            </div>
                        </div>
                    </div>

                    {/* DAILY / PER-SHIFT SALES SUMMARY TABLE (6 COLUMNS) */}
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                                Daily & Per-Shift Counter Summary
                            </h3>
                        </div>

                        <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', width: '140px' }}>1. Date / Shift</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>2. Cashier</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', width: '110px' }}>3. Txns (Count)</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'right', width: '120px' }}>4. Gross Sales</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'right', width: '120px' }}>5. OTP Discounts</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right', width: '220px' }}>6. Net Collected (Cash vs GCash)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(salesProfitData?.daily_shift_summary || []).length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No counter sales recorded in this timeframe.
                                            </td>
                                        </tr>
                                    ) : (
                                        (salesProfitData?.daily_shift_summary || []).map((s, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                {/* 1. Date / Shift */}
                                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                                                    {formatAuditDate(s.shift_date)}
                                                </td>

                                                {/* 2. Cashier */}
                                                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                    {s.cashier_name}
                                                </td>

                                                {/* 3. Txns Count */}
                                                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600 }}>
                                                    {s.txns_count} txns
                                                </td>

                                                {/* 4. Gross Sales */}
                                                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600 }}>
                                                    {formatCurrency(s.gross_sales)}
                                                </td>

                                                {/* 5. OTP Discounts */}
                                                <td style={{ padding: '10px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>
                                                    {formatCurrency(s.otp_discounts)}
                                                </td>

                                                {/* 6. Net Collected (Cash vs GCash Split) */}
                                                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                    <div style={{ fontWeight: 800, color: 'var(--primary)' }}>
                                                        {formatCurrency(s.net_collected)}
                                                    </div>
                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                        💵 {formatCurrency(s.cash_collected)} • 📱 {formatCurrency(s.gcash_collected)}
                                                    </div>
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

            {/* TAB 3: INVENTORY VELOCITY */}
            {activeTab === 'inventory_report' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                    {/* 3 TOP CAPITAL CARDS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {/* 1. Total Inventory Value at Cost */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Total Inventory Value at Cost
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>
                                {formatCurrency(fastDeadStockData?.summary?.total_inventory_cost || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Total shop capital invested in inventory (Cost × Stock)
                            </div>
                        </div>

                        {/* 2. Expected Retail Value */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Expected Retail Value
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)' }}>
                                {formatCurrency(fastDeadStockData?.summary?.total_inventory_retail || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Potential revenue when all current shelf stock sells
                            </div>
                        </div>

                        {/* 3. Dead Stock Alert */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--danger)', fontWeight: 700, textTransform: 'uppercase' }}>
                                    Dead Stock Capital Alert
                                </span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)' }}>
                                    {fastDeadStockData?.summary?.total_dead_units || 0} units stuck
                                </span>
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger)' }}>
                                {formatCurrency(fastDeadStockData?.summary?.dead_stock_capital || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Cost tied up in parts with 0 sales in 60+ days
                            </div>
                        </div>
                    </div>

                    {/* SUB-FILTERS & VELOCITY TABLE (6 COLUMNS) */}
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Velocity Filter:</span>
                                {[
                                    { key: 'ALL', label: 'All Items' },
                                    { key: 'FAST', label: `⚡ Fast-Moving (${fastDeadStockData?.fast_moving?.count || 0})` },
                                    { key: 'SLOW', label: `⏳ Slow-Moving (${fastDeadStockData?.slow_moving?.count || 0})` },
                                    { key: 'DEAD', label: `⚠️ Dead Stock (${fastDeadStockData?.dead_stock?.count || 0})` }
                                ].map(f => (
                                    <button
                                        key={f.key}
                                        type="button"
                                        onClick={() => setVelocityFilter(f.key)}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '0.78rem',
                                            fontWeight: 600,
                                            borderRadius: '6px',
                                            border: velocityFilter === f.key ? '1px solid var(--primary)' : '1px solid var(--border)',
                                            background: velocityFilter === f.key ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface)',
                                            color: velocityFilter === f.key ? 'var(--primary)' : 'var(--text-main)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            <div style={{ position: 'relative', width: '260px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    className="input-premium"
                                    placeholder="Filter by part, SKU, or rack..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    style={{ width: '100%', paddingLeft: '32px', height: '34px', fontSize: '0.8rem' }}
                                />
                                {productSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setProductSearch('')}
                                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>1. Part & Rack Location</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'left', width: '130px' }}>2. Cat & Brand</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', width: '110px' }}>3. Current Stock</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', width: '110px' }}>4. Units Sold</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'left', width: '130px' }}>5. Last Sold Date</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right', width: '140px' }}>6. Tied-Up Capital</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredVelocityProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No velocity parts match this filter.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredVelocityProducts.map((item, idx) => {
                                            const catCode = getLedgerCategoryCode(item.category);
                                            const catMeta = getCategoryBadgeMeta(catCode);
                                            const tiedCapital = item.capital_tied_up || (Number(item.sellable_stock || 0) * Number(item.supplier_cost || 0));

                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    {/* 1. Part & Rack */}
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.part_name}</div>
                                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                            SKU: <span style={{ fontFamily: 'monospace' }}>{item.sku}</span> • 📍 Rack: <strong style={{ color: 'var(--text-main)' }}>{item.shelf_location || 'Main Shelf'}</strong>
                                                        </div>
                                                    </td>

                                                    {/* 2. Cat & Brand */}
                                                    <td style={{ padding: '10px 10px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{
                                                                fontSize: '0.7rem',
                                                                fontWeight: 800,
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                background: catMeta.bg,
                                                                color: catMeta.color,
                                                                border: `1px solid ${catMeta.border}`
                                                            }}>
                                                                {catCode}
                                                            </span>
                                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                                {item.brand}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* 3. Current Stock */}
                                                    <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700 }}>
                                                        <span style={{ color: Number(item.sellable_stock) <= Number(item.reorder_level || 5) ? 'var(--danger)' : 'var(--text-main)' }}>
                                                            {item.sellable_stock} pcs
                                                        </span>
                                                    </td>

                                                    {/* 4. Units Sold */}
                                                    <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600 }}>
                                                        {item.net_qty_sold || 0} sold
                                                    </td>

                                                    {/* 5. Last Sold Date */}
                                                    <td style={{ padding: '10px 10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                        {item.last_sale || 'Recent'}
                                                    </td>

                                                    {/* 6. Tied-Up Capital */}
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#f59e0b' }}>
                                                        {formatCurrency(tiedCapital)}
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

            {/* TAB 4: EXPENSES & CASH FLOW */}
            {activeTab === 'cashflow_report' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                    {/* 4 TOP CASH FLOW SUMMARY CARDS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                        {/* 1. Total Cash & GCash Inflow */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Total Counter Inflow
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)' }}>
                                +{formatCurrency(cashflowData?.summary?.total_inflow || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Cash: {formatCurrency(cashflowData?.summary?.cash_inflow || 0)} • GCash: {formatCurrency(cashflowData?.summary?.gcash_inflow || 0)}
                            </div>
                        </div>

                        {/* 2. Supplier Truck Payouts */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Supplier Truck Payouts
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger)' }}>
                                -{formatCurrency(cashflowData?.summary?.supplier_truck_payouts || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {cashflowData?.summary?.deliveries_count || 0} Truck Deliveries Paid on Arrival
                            </div>
                        </div>

                        {/* 3. Shop Operating Expenses */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Shop Operating Expenses
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>
                                -{formatCurrency(cashflowData?.summary?.shop_operating_expenses || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Rent, utilities, packaging & petty cash
                            </div>
                        </div>

                        {/* 4. Net Cash Flow */}
                        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                                Net Cash Flow
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: Number(cashflowData?.summary?.net_cash_flow || 0) >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                                {Number(cashflowData?.summary?.net_cash_flow || 0) >= 0 ? '+' : ''}{formatCurrency(cashflowData?.summary?.net_cash_flow || 0)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Counter Inflow − Truck Payouts − OpEx
                            </div>
                        </div>
                    </div>

                    {/* UNIFIED CASH FLOW LEDGER TABLE (6 COLUMNS) */}
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                                Unified Cash Flow & Expense Ledger
                            </h3>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                Chronological ledger combining POS sales remittances, supplier truck cash payouts, and store expenses.
                            </p>
                        </div>

                        <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', width: '140px' }}>1. Date & Time</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'left', width: '170px' }}>2. Flow Type</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'left', width: '150px' }}>3. Reference #</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>4. Description / Supplier</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'left', width: '140px' }}>5. Payment Mode</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right', width: '130px' }}>6. Peso Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(cashflowData?.unified_ledger || []).length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No cash transactions logged in this timeframe.
                                            </td>
                                        </tr>
                                    ) : (
                                        (cashflowData?.unified_ledger || []).map((entry, idx) => {
                                            const isInflow = entry.is_inflow;
                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    {/* 1. Date & Time */}
                                                    <td style={{ padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                        {formatAuditDate(entry.date_time)}
                                                    </td>

                                                    {/* 2. Flow Type */}
                                                    <td style={{ padding: '10px 10px' }}>
                                                        {entry.flow_type === 'INFLOW_SALES' && (
                                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)' }}>
                                                                🟢 Shift Remittance In
                                                            </span>
                                                        )}
                                                        {entry.flow_type === 'OUTFLOW_SUPPLIER' && (
                                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)' }}>
                                                                🔴 Supplier Truck Payout
                                                            </span>
                                                        )}
                                                        {entry.flow_type === 'OUTFLOW_EXPENSE' && (
                                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}>
                                                                🟠 Shop Expense
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* 3. Reference # */}
                                                    <td style={{ padding: '10px 10px', fontFamily: 'monospace', fontWeight: 600 }}>
                                                        {entry.reference_no}
                                                    </td>

                                                    {/* 4. Description / Supplier */}
                                                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                                                        {entry.description}
                                                    </td>

                                                    {/* 5. Payment Mode */}
                                                    <td style={{ padding: '10px 10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                        {entry.payment_mode}
                                                    </td>

                                                    {/* 6. Amount */}
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: isInflow ? 'var(--primary)' : 'var(--danger)' }}>
                                                        {isInflow ? '+' : '-'}{formatCurrency(entry.amount)}
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

            {/* TAB 5: EXPORT & BOOKKEEPING */}
            {activeTab === 'export_tab' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                            1-Click Bookkeeping & Offline Audit Sheets
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                            Generate offline CSV spreadsheets and printable documents for bookkeeping, tax compliance, and physical inventory audits for <strong>{activeTimeframeLabel}</strong>.
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
                        {/* 1. Sales & GCash Reference Log */}
                        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <FileSpreadsheet size={20} style={{ color: 'var(--primary)' }} />
                                    <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700 }}>
                                        Sales & GCash Reference Log
                                    </h4>
                                </div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                    Itemized transaction list with receipt #, cashier, customer, payment channel, and GCash reference numbers for daily counter balancing.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={exportSalesGCashLog}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.78rem', padding: '7px 10px' }}
                                >
                                    <Download size={14} /> Download CSV
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleOpenPrintModal('sales_log', 'Sales & GCash Reference Log')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '7px 12px' }}
                                >
                                    <Printer size={14} /> Print View
                                </button>
                            </div>
                        </div>

                        {/* 2. Profit & COGS Summary */}
                        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <DollarSign size={20} style={{ color: '#f59e0b' }} />
                                    <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700 }}>
                                        Profit & COGS Summary
                                    </h4>
                                </div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                    Part-by-part wholesale supplier cost (puhunan), retail revenue, units sold, and net profit margins to track which motorcycle brands are most lucrative.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={exportProfitCOGSSummary}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.78rem', padding: '7px 10px' }}
                                >
                                    <Download size={14} /> Download CSV
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleOpenPrintModal('profit_summary', 'Profit & COGS Summary')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '7px 12px' }}
                                >
                                    <Printer size={14} /> Print View
                                </button>
                            </div>
                        </div>

                        {/* 3. Inventory Valuation & Reorder Sheet */}
                        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <Package size={20} style={{ color: '#38bdf8' }} />
                                    <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700 }}>
                                        Inventory Valuation & Velocity Sheet
                                    </h4>
                                </div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                    Complete shelf inventory valuation at Cost and Retail, current stock levels, rack location, and reorder levels for physical warehouse inventory counts.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={exportInventoryValuation}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.78rem', padding: '7px 10px' }}
                                >
                                    <Download size={14} /> Download CSV
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleOpenPrintModal('inventory_val', 'Inventory Valuation & Velocity Sheet')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '7px 12px' }}
                                >
                                    <Printer size={14} /> Print View
                                </button>
                            </div>
                        </div>

                        {/* 4. Supplier Truck Deliveries Log */}
                        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <Truck size={20} style={{ color: '#a855f7' }} />
                                    <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700 }}>
                                        Supplier Truck Deliveries Log
                                    </h4>
                                </div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                    Paper Delivery Receipt (DR) / Invoice log, driver names, delivered pieces, rejected pieces handed back on the spot, and cash paid to drivers.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={exportSupplierTruckDeliveries}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.78rem', padding: '7px 10px' }}
                                >
                                    <Download size={14} /> Download CSV
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleOpenPrintModal('truck_deliveries', 'Supplier Truck Deliveries Log')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '7px 12px' }}
                                >
                                    <Printer size={14} /> Print View
                                </button>
                            </div>
                        </div>

                        {/* 5. Shift & Cash Drawer Variance Log */}
                        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <Wallet size={20} style={{ color: '#10b981' }} />
                                    <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700 }}>
                                        Shift & Cash Drawer Variance Log
                                    </h4>
                                </div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                    Per-shift cashier remittance records, transaction volumes, cash vs. GCash collections, and drawer variance audit summary.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={exportShiftDrawerVarianceLog}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.78rem', padding: '7px 10px' }}
                                >
                                    <Download size={14} /> Download CSV
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleOpenPrintModal('shift_variance', 'Shift & Cash Drawer Variance Log')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '7px 12px' }}
                                >
                                    <Printer size={14} /> Print View
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* PRINT MODAL (HIGH CONTRAST PREVIEW MODAL + ISOLATED PORTAL PRINT SHEET) */}
            {printModalState.isOpen && (
                <>
                    {/* DYNAMIC PRINT CSS: Hides #root and renders only #printable-bookkeeping-report */}
                    <style>{`
                        #printable-bookkeeping-report {
                            display: none;
                        }
                        @media print {
                            @page {
                                size: A4 portrait;
                                margin: 10mm 8mm;
                            }
                            #root {
                                display: none !important;
                                height: 0 !important;
                                overflow: hidden !important;
                            }
                            #printable-bookkeeping-report,
                            #printable-bookkeeping-report * {
                                visibility: visible !important;
                            }
                            #printable-bookkeeping-report {
                                display: block !important;
                                position: static !important;
                                width: 100% !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                background: #ffffff !important;
                                color: #000000 !important;
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                                font-size: 9.5px !important;
                                line-height: 1.35 !important;
                            }
                            .no-print {
                                display: none !important;
                            }
                        }
                    `}</style>

                    {/* 1. ON-SCREEN MODAL PREVIEW DIALOG */}
                    <div
                        className="no-print"
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0, 0, 0, 0.75)',
                            zIndex: 2000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '20px'
                        }}
                        onClick={() => setPrintModalState({ isOpen: false, title: '', type: '' })}
                    >
                        <div
                            style={{
                                background: '#ffffff',
                                color: '#111827',
                                borderRadius: '12px',
                                width: '100%',
                                maxWidth: '980px',
                                maxHeight: '90vh',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div style={{
                                padding: '16px 22px',
                                borderBottom: '1px solid #e5e7eb',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#f9fafb'
                            }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
                                        {printModalState.title}
                                    </h3>
                                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '2px' }}>
                                        J-Lin Motor Parts • Filter: <strong>{activeTimeframeLabel}</strong>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={() => window.print()}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '8px 16px',
                                            background: '#10b981',
                                            color: '#ffffff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            fontWeight: 700,
                                            fontSize: '0.84rem',
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)'
                                        }}
                                    >
                                        <Printer size={15} /> Print / Save as PDF
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPrintModalState({ isOpen: false, title: '', type: '' })}
                                        style={{
                                            background: '#e5e7eb',
                                            border: 'none',
                                            borderRadius: '6px',
                                            padding: '7px',
                                            cursor: 'pointer',
                                            color: '#374151',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Table Content */}
                            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, fontSize: '0.82rem', color: '#111827' }}>
                                {printModalState.type === 'sales_log' && (
                                    <table className="report-paper-sheet" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#111827' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #d1d5db', background: '#f3f4f6' }}>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Ref / Order #</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Date & Time</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Cashier</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Customer</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Payment Mode</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>GCash Ref #</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(salesProfitData?.sales_transactions || []).length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                                                        No transactions recorded for this timeframe.
                                                    </td>
                                                </tr>
                                            ) : (
                                                (salesProfitData?.sales_transactions || []).map((t, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                        <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#111827' }}>{t.order_number}</td>
                                                        <td style={{ padding: '8px', color: '#374151' }}>{formatAuditDate(t.sale_date)}</td>
                                                        <td style={{ padding: '8px', color: '#374151' }}>{t.cashier_name}</td>
                                                        <td style={{ padding: '8px', color: '#374151' }}>{t.customer_name || 'Walk-in'}</td>
                                                        <td style={{ padding: '8px', color: '#111827', fontWeight: 600 }}>{t.payment_method}</td>
                                                        <td style={{ padding: '8px', fontFamily: 'monospace', color: '#4b5563' }}>{t.payment_reference || '-'}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{formatCurrency(t.total_amount)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {(salesProfitData?.sales_transactions || []).length > 0 && (
                                            <tfoot>
                                                <tr style={{ borderTop: '2px solid #111827', background: '#f9fafb', fontWeight: 800 }}>
                                                    <td colSpan="4" style={{ padding: '10px 8px', color: '#111827' }}>
                                                        Total Transactions: {(salesProfitData?.sales_transactions || []).length}
                                                    </td>
                                                    <td colSpan="2" style={{ padding: '10px 8px', textAlign: 'right', color: '#4b5563', fontSize: '0.78rem' }}>
                                                        Cash: {formatCurrency((salesProfitData?.sales_transactions || []).filter(t => (t.payment_method || '').toLowerCase() === 'cash').reduce((sum, t) => sum + Number(t.total_amount || 0), 0))} • GCash: {formatCurrency((salesProfitData?.sales_transactions || []).filter(t => (t.payment_method || '').toLowerCase() === 'gcash').reduce((sum, t) => sum + Number(t.total_amount || 0), 0))}
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#059669', fontSize: '0.95rem' }}>
                                                        {formatCurrency((salesProfitData?.sales_transactions || []).reduce((sum, t) => sum + Number(t.total_amount || 0), 0))}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                )}

                                {printModalState.type === 'profit_summary' && (
                                    <table className="report-paper-sheet" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#111827' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #d1d5db', background: '#f3f4f6' }}>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Part Name & SKU</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Cat Code</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'center' }}>Units Sold</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Wholesale Cost</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Revenue</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Total COGS</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Gross Profit</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(salesProfitData?.sold_products || []).length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                                                        No sold parts logged for this timeframe.
                                                    </td>
                                                </tr>
                                            ) : (
                                                (salesProfitData?.sold_products || []).map((p, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                        <td style={{ padding: '8px', fontWeight: 600, color: '#111827' }}>
                                                            {p.product_name} <span style={{ color: '#6b7280', fontSize: '0.74rem' }}>({p.part_number})</span>
                                                        </td>
                                                        <td style={{ padding: '8px', color: '#4b5563' }}>{getLedgerCategoryCode(p.category)}</td>
                                                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>{p.total_qty_sold}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', color: '#4b5563' }}>{formatCurrency(p.avg_unit_cost)}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(p.total_revenue)}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', color: '#d97706' }}>{formatCurrency(Number(p.avg_unit_cost) * Number(p.total_qty_sold))}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{formatCurrency(p.total_gross_profit)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {(salesProfitData?.sold_products || []).length > 0 && (
                                            <tfoot>
                                                <tr style={{ borderTop: '2px solid #111827', background: '#f9fafb', fontWeight: 800 }}>
                                                    <td colSpan="2" style={{ padding: '10px 8px', color: '#111827' }}>
                                                        Total Items Sold: {(salesProfitData?.sold_products || []).length} SKUs
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                        {(salesProfitData?.sold_products || []).reduce((sum, p) => sum + Number(p.total_qty_sold || 0), 0)}
                                                    </td>
                                                    <td></td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#111827' }}>
                                                        {formatCurrency((salesProfitData?.sold_products || []).reduce((sum, p) => sum + Number(p.total_revenue || 0), 0))}
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#d97706' }}>
                                                        {formatCurrency((salesProfitData?.sold_products || []).reduce((sum, p) => sum + (Number(p.avg_unit_cost || 0) * Number(p.total_qty_sold || 0)), 0))}
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#16a34a', fontSize: '0.95rem' }}>
                                                        {formatCurrency((salesProfitData?.sold_products || []).reduce((sum, p) => sum + Number(p.total_gross_profit || 0), 0))}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                )}

                                {printModalState.type === 'inventory_val' && (
                                    <table className="report-paper-sheet" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#111827' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #d1d5db', background: '#f3f4f6' }}>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Part Name & SKU</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Rack / Location</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'center' }}>Stock</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Wholesale Cost</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Retail Price</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Tied Capital</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])].length === 0 ? (
                                                <tr>
                                                    <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                                                        No inventory catalog items loaded.
                                                    </td>
                                                </tr>
                                            ) : (
                                                [...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])].map((i, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                        <td style={{ padding: '8px', fontWeight: 600, color: '#111827' }}>
                                                            {i.part_name} <span style={{ color: '#6b7280', fontSize: '0.74rem' }}>({i.sku})</span>
                                                        </td>
                                                        <td style={{ padding: '8px', color: '#4b5563' }}>{i.shelf_location || 'Main Floor'}</td>
                                                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700 }}>{i.sellable_stock}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', color: '#4b5563' }}>{formatCurrency(i.supplier_cost)}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', color: '#4b5563' }}>{formatCurrency(i.retail_price)}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{formatCurrency(i.capital_tied_up || (i.sellable_stock * i.supplier_cost))}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {[...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])].length > 0 && (
                                            <tfoot>
                                                <tr style={{ borderTop: '2px solid #111827', background: '#f9fafb', fontWeight: 800 }}>
                                                    <td colSpan="2" style={{ padding: '10px 8px', color: '#111827' }}>
                                                        Total Catalog Items: {[...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])].length} SKUs
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                        {[...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])].reduce((sum, i) => sum + Number(i.sellable_stock || 0), 0)} pcs
                                                    </td>
                                                    <td colSpan="2"></td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#d97706', fontSize: '0.95rem' }}>
                                                        {formatCurrency([...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])].reduce((sum, i) => sum + Number(i.capital_tied_up || (Number(i.sellable_stock || 0) * Number(i.supplier_cost || 0))), 0))}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                )}

                                {printModalState.type === 'truck_deliveries' && (
                                    <table className="report-paper-sheet" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#111827' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #d1d5db', background: '#f3f4f6' }}>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Paper DR #</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Date Received</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Supplier</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Truck Driver</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'center' }}>Good Qty</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'center' }}>Rejected Qty</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Net Paid on Spot</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(cashflowData?.receiving_records || []).length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                                                        No supplier truck deliveries logged for this timeframe.
                                                    </td>
                                                </tr>
                                            ) : (
                                                (cashflowData?.receiving_records || []).map((r, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                        <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#111827' }}>{r.reference_no}</td>
                                                        <td style={{ padding: '8px', color: '#374151' }}>{formatAuditDate(r.received_at)}</td>
                                                        <td style={{ padding: '8px', fontWeight: 600, color: '#111827' }}>{r.supplier_name}</td>
                                                        <td style={{ padding: '8px', color: '#4b5563' }}>{r.delivery_personnel}</td>
                                                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>{r.total_accepted_qty} pcs</td>
                                                        <td style={{ padding: '8px', textAlign: 'center', color: Number(r.total_rejected_qty) > 0 ? '#dc2626' : '#6b7280' }}>{r.total_rejected_qty || 0} pcs</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{formatCurrency(r.total_cost)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {(cashflowData?.receiving_records || []).length > 0 && (
                                            <tfoot>
                                                <tr style={{ borderTop: '2px solid #111827', background: '#f9fafb', fontWeight: 800 }}>
                                                    <td colSpan="4" style={{ padding: '10px 8px', color: '#111827' }}>
                                                        Total Deliveries: {(cashflowData?.receiving_records || []).length}
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#059669' }}>
                                                        {(cashflowData?.receiving_records || []).reduce((sum, r) => sum + Number(r.total_accepted_qty || 0), 0)} pcs
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#dc2626' }}>
                                                        {(cashflowData?.receiving_records || []).reduce((sum, r) => sum + Number(r.total_rejected_qty || 0), 0)} pcs
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#dc2626', fontSize: '0.95rem' }}>
                                                        {formatCurrency((cashflowData?.receiving_records || []).reduce((sum, r) => sum + Number(r.total_cost || 0), 0))}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                )}

                                {printModalState.type === 'shift_variance' && (
                                    <table className="report-paper-sheet" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#111827' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #d1d5db', background: '#f3f4f6' }}>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Shift Date</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>Cashier</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'center' }}>Txns</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Gross Sales</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>OTP Discounts</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Cash Remitted</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>GCash Remitted</th>
                                                <th style={{ padding: '10px 8px', color: '#111827', fontWeight: 700, textAlign: 'right' }}>Total Remitted</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(salesProfitData?.daily_shift_summary || []).length === 0 ? (
                                                <tr>
                                                    <td colSpan="8" style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                                                        No shift summaries recorded for this timeframe.
                                                    </td>
                                                </tr>
                                            ) : (
                                                (salesProfitData?.daily_shift_summary || []).map((s, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                        <td style={{ padding: '8px', fontWeight: 600, color: '#111827' }}>{formatAuditDate(s.shift_date)}</td>
                                                        <td style={{ padding: '8px', color: '#374151' }}>{s.cashier_name}</td>
                                                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>{s.txns_count}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', color: '#4b5563' }}>{formatCurrency(s.gross_sales)}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', color: '#f59e0b' }}>{formatCurrency(s.otp_discounts)}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{formatCurrency(s.cash_collected)}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>{formatCurrency(s.gcash_collected)}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{formatCurrency(s.net_collected)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {(salesProfitData?.daily_shift_summary || []).length > 0 && (
                                            <tfoot>
                                                <tr style={{ borderTop: '2px solid #111827', background: '#f9fafb', fontWeight: 800 }}>
                                                    <td colSpan="2" style={{ padding: '10px 8px', color: '#111827' }}>
                                                        Total Shifts: {(salesProfitData?.daily_shift_summary || []).length}
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                        {(salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.txns_count || 0), 0)}
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#4b5563' }}>
                                                        {formatCurrency((salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.gross_sales || 0), 0))}
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#f59e0b' }}>
                                                        {formatCurrency((salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.otp_discounts || 0), 0))}
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#111827' }}>
                                                        {formatCurrency((salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.cash_collected || 0), 0))}
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#0284c7' }}>
                                                        {formatCurrency((salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.gcash_collected || 0), 0))}
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#059669', fontSize: '0.95rem' }}>
                                                        {formatCurrency((salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.net_collected || 0), 0))}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 2. DEDICATED PORTAL PRINTABLE DOCUMENT (RENDERED OUTSIDE #root ON document.body) */}
                    {typeof document !== 'undefined' && createPortal(
                        <div id="printable-bookkeeping-report">
                            {/* Document Header */}
                            <div style={{ borderBottom: '2px solid #000000', paddingBottom: '8px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        JLIN MOTO PARTS
                                    </h1>
                                    <div style={{ fontSize: '9px', color: '#333333', textTransform: 'uppercase', marginTop: '2px' }}>
                                        Motorparts Inventory, Genuine Spare Parts & Retail Sales • Philippines
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 900, marginTop: '6px', textTransform: 'uppercase', color: '#000000' }}>
                                        {printModalState.title}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', fontSize: '9px', color: '#333333', lineHeight: 1.4 }}>
                                    <div><strong>Filter / Period:</strong> {activeTimeframeLabel}</div>
                                    <div><strong>Printed Date:</strong> {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                                    <div><strong>Prepared By:</strong> {user?.username || 'Owner / Admin'} ({isAdmin ? 'Store Admin' : 'Staff'})</div>
                                </div>
                            </div>

                            {/* Printable Tables */}
                            {printModalState.type === 'sales_log' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '9px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '30px' }}>#</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '110px' }}>Order / Ref #</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000' }}>Date & Time</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000' }}>Cashier</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000' }}>Customer</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '70px' }}>Mode</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '100px' }}>GCash Ref #</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '85px' }}>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(salesProfitData?.sales_transactions || []).map((t, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>#{idx + 1}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', fontFamily: 'monospace', fontWeight: 'bold' }}>{t.order_number}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>{formatAuditDate(t.sale_date)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>{t.cashier_name}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>{t.customer_name || 'Walk-in'}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', fontWeight: 600 }}>{t.payment_method}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', fontFamily: 'monospace' }}>{t.payment_reference || '-'}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(t.total_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #000000', background: '#f5f5f5', fontWeight: 'bold' }}>
                                            <td colSpan="5" style={{ padding: '5px', border: '1px solid #000000' }}>
                                                Total Transactions: {(salesProfitData?.sales_transactions || []).length}
                                            </td>
                                            <td colSpan="2" style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right', fontSize: '8.5px' }}>
                                                Cash: {formatCurrency((salesProfitData?.sales_transactions || []).filter(t => (t.payment_method || '').toLowerCase() === 'cash').reduce((sum, t) => sum + Number(t.total_amount || 0), 0))} | GCash: {formatCurrency((salesProfitData?.sales_transactions || []).filter(t => (t.payment_method || '').toLowerCase() === 'gcash').reduce((sum, t) => sum + Number(t.total_amount || 0), 0))}
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right', fontSize: '10.5px' }}>
                                                {formatCurrency((salesProfitData?.sales_transactions || []).reduce((sum, t) => sum + Number(t.total_amount || 0), 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}

                            {printModalState.type === 'profit_summary' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '9px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '25px' }}>#</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000' }}>Part Name</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '85px' }}>SKU</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '45px' }}>Cat</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'center', width: '45px' }}>Sold</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '65px' }}>Cost</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '75px' }}>Revenue</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '75px' }}>COGS</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '75px' }}>Profit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(salesProfitData?.sold_products || []).map((p, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>#{idx + 1}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', fontWeight: 'bold' }}>{p.product_name}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', fontFamily: 'monospace' }}>{p.part_number}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>{getLedgerCategoryCode(p.category)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'center', fontWeight: 'bold' }}>{p.total_qty_sold}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right' }}>{formatCurrency(p.avg_unit_cost)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right' }}>{formatCurrency(p.total_revenue)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right' }}>{formatCurrency(Number(p.avg_unit_cost) * Number(p.total_qty_sold))}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(p.total_gross_profit)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #000000', background: '#f5f5f5', fontWeight: 'bold' }}>
                                            <td colSpan="4" style={{ padding: '5px', border: '1px solid #000000' }}>
                                                Total Products Sold: {(salesProfitData?.sold_products || []).length} SKUs
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'center' }}>
                                                {(salesProfitData?.sold_products || []).reduce((sum, p) => sum + Number(p.total_qty_sold || 0), 0)}
                                            </td>
                                            <td style={{ border: '1px solid #000000' }}></td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right' }}>
                                                {formatCurrency((salesProfitData?.sold_products || []).reduce((sum, p) => sum + Number(p.total_revenue || 0), 0))}
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right' }}>
                                                {formatCurrency((salesProfitData?.sold_products || []).reduce((sum, p) => sum + (Number(p.avg_unit_cost || 0) * Number(p.total_qty_sold || 0)), 0))}
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right', fontSize: '10.5px' }}>
                                                {formatCurrency((salesProfitData?.sold_products || []).reduce((sum, p) => sum + Number(p.total_gross_profit || 0), 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}

                            {printModalState.type === 'inventory_val' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '9px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '25px' }}>#</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000' }}>Part Name & Description</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '90px' }}>SKU</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '70px' }}>Location</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'center', width: '45px' }}>Stock</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '70px' }}>Unit Cost</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '70px' }}>Retail</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '85px' }}>Tied Capital</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])].map((i, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>#{idx + 1}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', fontWeight: 'bold' }}>{i.part_name}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', fontFamily: 'monospace' }}>{i.sku}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>{i.shelf_location || 'Main Floor'}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'center', fontWeight: 'bold' }}>{i.sellable_stock}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right' }}>{formatCurrency(i.supplier_cost)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right' }}>{formatCurrency(i.retail_price)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(i.capital_tied_up || (i.sellable_stock * i.supplier_cost))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #000000', background: '#f5f5f5', fontWeight: 'bold' }}>
                                            <td colSpan="4" style={{ padding: '5px', border: '1px solid #000000' }}>
                                                Total Inventory Catalog: {[...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])].length} SKUs
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'center' }}>
                                                {[...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])].reduce((sum, i) => sum + Number(i.sellable_stock || 0), 0)} pcs
                                            </td>
                                            <td colSpan="2" style={{ border: '1px solid #000000' }}></td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right', fontSize: '10.5px' }}>
                                                {formatCurrency([...(fastDeadStockData?.fast_moving?.items || []), ...(fastDeadStockData?.slow_moving?.items || []), ...(fastDeadStockData?.dead_stock?.items || [])].reduce((sum, i) => sum + Number(i.capital_tied_up || (Number(i.sellable_stock || 0) * Number(i.supplier_cost || 0))), 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}

                            {printModalState.type === 'truck_deliveries' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '9px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '25px' }}>#</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '100px' }}>DR / Invoice #</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000' }}>Date Received</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000' }}>Supplier</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000' }}>Driver</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'center', width: '60px' }}>Good Qty</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'center', width: '60px' }}>Rejected</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '90px' }}>Paid on Spot</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(cashflowData?.receiving_records || []).map((r, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>#{idx + 1}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', fontFamily: 'monospace', fontWeight: 'bold' }}>{r.reference_no}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>{formatAuditDate(r.received_at)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', fontWeight: 'bold' }}>{r.supplier_name}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>{r.delivery_personnel}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'center', fontWeight: 'bold' }}>{r.total_accepted_qty} pcs</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'center' }}>{r.total_rejected_qty || 0} pcs</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(r.total_cost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #000000', background: '#f5f5f5', fontWeight: 'bold' }}>
                                            <td colSpan="5" style={{ padding: '5px', border: '1px solid #000000' }}>
                                                Total Deliveries: {(cashflowData?.receiving_records || []).length}
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'center' }}>
                                                {(cashflowData?.receiving_records || []).reduce((sum, r) => sum + Number(r.total_accepted_qty || 0), 0)} pcs
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'center' }}>
                                                {(cashflowData?.receiving_records || []).reduce((sum, r) => sum + Number(r.total_rejected_qty || 0), 0)} pcs
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right', fontSize: '10.5px' }}>
                                                {formatCurrency((cashflowData?.receiving_records || []).reduce((sum, r) => sum + Number(r.total_cost || 0), 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}

                            {printModalState.type === 'shift_variance' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '9px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1.5px solid #000000', background: '#f2f2f2' }}>
                                            <th style={{ padding: '4px', border: '1px solid #000000', width: '25px' }}>#</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000' }}>Shift Date</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000' }}>Cashier</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'center', width: '45px' }}>Txns</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '70px' }}>Gross</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '60px' }}>Discounts</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '75px' }}>Cash</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '75px' }}>GCash</th>
                                            <th style={{ padding: '4px', border: '1px solid #000000', textAlign: 'right', width: '80px' }}>Net Remitted</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(salesProfitData?.daily_shift_summary || []).map((s, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>#{idx + 1}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', fontWeight: 'bold' }}>{formatAuditDate(s.shift_date)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc' }}>{s.cashier_name}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'center', fontWeight: 'bold' }}>{s.txns_count}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right' }}>{formatCurrency(s.gross_sales)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right' }}>{formatCurrency(s.otp_discounts)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right' }}>{formatCurrency(s.cash_collected)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right' }}>{formatCurrency(s.gcash_collected)}</td>
                                                <td style={{ padding: '4px', border: '1px solid #cccccc', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(s.net_collected)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #000000', background: '#f5f5f5', fontWeight: 'bold' }}>
                                            <td colSpan="3" style={{ padding: '5px', border: '1px solid #000000' }}>
                                                Total Shifts: {(salesProfitData?.daily_shift_summary || []).length}
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'center' }}>
                                                {(salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.txns_count || 0), 0)}
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right' }}>
                                                {formatCurrency((salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.gross_sales || 0), 0))}
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right' }}>
                                                {formatCurrency((salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.otp_discounts || 0), 0))}
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right' }}>
                                                {formatCurrency((salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.cash_collected || 0), 0))}
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right' }}>
                                                {formatCurrency((salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.gcash_collected || 0), 0))}
                                            </td>
                                            <td style={{ padding: '5px', border: '1px solid #000000', textAlign: 'right', fontSize: '10.5px' }}>
                                                {formatCurrency((salesProfitData?.daily_shift_summary || []).reduce((sum, s) => sum + Number(s.net_collected || 0), 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}

                            {/* Signatures Block for Official Compliance & Audit */}
                            <div style={{ marginTop: '28px', paddingTop: '12px', borderTop: '1px solid #000000', display: 'flex', justifyContent: 'space-between', breakInside: 'avoid' }}>
                                <div style={{ width: '220px', textAlign: 'center' }}>
                                    <div style={{ borderBottom: '1px solid #000000', height: '35px' }}></div>
                                    <div style={{ fontSize: '9.5px', fontWeight: 'bold', marginTop: '4px' }}>Prepared By: {user?.username || 'Staff'}</div>
                                    <div style={{ fontSize: '8.5px', color: '#555555' }}>Staff / Cashier / Bookkeeper Signature</div>
                                </div>
                                <div style={{ width: '220px', textAlign: 'center' }}>
                                    <div style={{ borderBottom: '1px solid #000000', height: '35px' }}></div>
                                    <div style={{ fontSize: '9.5px', fontWeight: 'bold', marginTop: '4px' }}>Verified & Approved By: Store Owner</div>
                                    <div style={{ fontSize: '8.5px', color: '#555555' }}>Owner / Admin Signature</div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                </>
            )}
        </div>
    );
};
export default Reports;
