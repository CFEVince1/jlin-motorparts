import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
    TrendingUp,
    DollarSign,
    Package,
    ShieldAlert,
    RotateCcw,
    Building2,
    Calendar,
    Printer,
    Download,
    Search,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
    ArrowUpRight,
    ArrowDownRight,
    Clock,
    Lock,
    ExternalLink,
    Filter,
    Boxes,
    Layers,
    FileSpreadsheet,
    Truck,
    Percent,
    AlertOctagon,
    CreditCard,
    Users as UsersIcon,
    Plus,
    X,
    Wallet,
    Landmark
} from 'lucide-react';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

const TABS = [
    { id: 'profit_report', name: 'Profit & Loss (P&L)', icon: DollarSign },
    { id: 'sales_report', name: 'Sales Breakdown', icon: TrendingUp },
    { id: 'inventory_report', name: 'Inventory Velocity', icon: Package },
    { id: 'cashflow_report', name: 'Cash Flow & Expenses', icon: Wallet },
    { id: 'add_expense', name: '+ Add Store Expense', icon: Plus },
];

export const Reports = () => {
    const { user } = useContext(AuthContext);
    const isAdmin = user?.role?.toLowerCase() === 'admin';

    // 1. Navigation & Filters
    const [activeTab, setActiveTab] = useState('profit_report');
    const [timeframe, setTimeframe] = useState('month'); // 'today' | 'week' | 'month' | 'all' | 'custom'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [deadStockThreshold, setDeadStockThreshold] = useState(90); // 30, 60, 90, 180
    const [velocityFilter, setVelocityFilter] = useState('ALL'); // 'ALL' | 'FAST' | 'SLOW' | 'DEAD'
    const [productSalesSearch, setProductSalesSearch] = useState('');
    const [loading, setLoading] = useState(false);

    // 2. Report Data States
    const [salesProfitData, setSalesProfitData] = useState(null);
    const [fastDeadStockData, setFastDeadStockData] = useState(null);
    const [cashflowData, setCashflowData] = useState(null);

    const [submittingExpense, setSubmittingExpense] = useState(false);
    const [expenseForm, setExpenseForm] = useState({
        expense_date: new Date().toISOString().slice(0, 10),
        category: 'Shop Rent',
        title: '',
        amount: '',
        payment_source: 'cash_drawer',
        notes: ''
    });

    // Filtered Sold Products
    const filteredSoldProducts = useMemo(() => {
        const list = salesProfitData?.sold_products || [];
        if (!productSalesSearch.trim()) return list;
        const q = productSalesSearch.trim().toLowerCase();
        return list.filter(p =>
            (p.product_name || '').toLowerCase().includes(q) ||
            (p.part_number || '').toLowerCase().includes(q) ||
            (p.brand || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q)
        );
    }, [salesProfitData?.sold_products, productSalesSearch]);

    // Query string helper
    const queryParams = useMemo(() => {
        const p = new URLSearchParams();
        p.append('timeframe', timeframe);
        if (startDate) p.append('startDate', startDate);
        if (endDate) p.append('endDate', endDate);
        return p.toString();
    }, [timeframe, startDate, endDate]);

    // Data Fetchers
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

    const handleSetTimeframe = (tf) => {
        setTimeframe(tf);
        if (tf !== 'custom') {
            setStartDate('');
            setEndDate('');
        }
    };

    // Record Store Operating Expense
    const handleRecordExpense = async (e) => {
        e.preventDefault();
        if (!expenseForm.title.trim() || !expenseForm.amount || Number(expenseForm.amount) <= 0) {
            toast.error('Please enter a valid title and positive amount');
            return;
        }

        setSubmittingExpense(true);
        try {
            await api.post('/reports/expenses', expenseForm);
            toast.success(`Expense "${expenseForm.title}" recorded!`);
            setActiveTab('cashflow_report');
            setExpenseForm({
                expense_date: new Date().toISOString().slice(0, 10),
                category: 'Shop Rent',
                title: '',
                amount: '',
                payment_source: 'cash_drawer',
                notes: ''
            });
            fetchActiveReport();
        } catch (err) {
            console.error('Error recording expense:', err);
            toast.error(err.response?.data?.message || 'Failed to record expense');
        } finally {
            setSubmittingExpense(false);
        }
    };

    // Export Active Tab to CSV
    const handleExportCSV = () => {
        let filename = `report_${activeTab}_${timeframe}_${new Date().toISOString().slice(0, 10)}.csv`;
        let csvContent = 'data:text/csv;charset=utf-8,';

        if (activeTab === 'profit_report') {
            csvContent += 'P&L INCOME STATEMENT REPORT\n';
            csvContent += `Timeframe,${timeframe}\n`;
            csvContent += `Generated At,${new Date().toLocaleString()}\n\n`;
            csvContent += 'Financial Metric,Amount (PHP)\n';
            csvContent += `Gross Retail Sales,${salesProfitData?.financials?.gross_revenue || 0}\n`;
            csvContent += `Less: Voided / Cancelled Sales Reversals,-${salesProfitData?.financials?.sales_reversals || 0}\n`;
            csvContent += `Less: Approved Discounts,-${salesProfitData?.financials?.discounts || 0}\n`;
            csvContent += `= Net Retail Sales,${salesProfitData?.financials?.net_retail_sales || 0}\n`;
            csvContent += `Less: Total Puhunan (Supplier Cost of Items Sold),-${salesProfitData?.financials?.cost_of_goods_sold || 0}\n`;
            csvContent += `= Gross Margin,${salesProfitData?.financials?.gross_margin || 0}\n`;
            csvContent += `Less: In-Store Damaged Stock & Shrinkage Losses,-${salesProfitData?.financials?.shop_return_losses || 0}\n`;
            csvContent += `Less: Inventory Shrinkage Losses,-${salesProfitData?.financials?.shrinkage_losses || 0}\n`;
            csvContent += `Less: Store Operating Expenses,-${salesProfitData?.financials?.store_operating_expenses || 0}\n`;
            csvContent += `Less: Restock Shipping Fees,-${salesProfitData?.financials?.shipping_costs || 0}\n`;
            csvContent += `= True Net Profit,${salesProfitData?.financials?.true_net_profit || 0}\n`;
            csvContent += `Net Profit Margin (%),${salesProfitData?.financials?.profit_margin_pct || 0}%\n`;
        } else if (activeTab === 'sales_report') {
            csvContent += 'SALES BREAKDOWN REPORT\n';
            csvContent += `Timeframe,${timeframe}\n\n`;
            csvContent += 'Part Number,Product Name,Brand,Category,Qty Sold,Avg Unit Cost,Avg Retail Price,Total Revenue,Gross Profit,Margin Pct\n';
            (salesProfitData?.sold_products || []).forEach(p => {
                csvContent += `"${p.part_number}","${p.product_name}","${p.brand}","${p.category}",${p.total_qty_sold},${p.avg_unit_cost},${p.avg_unit_price},${p.total_revenue},${p.total_gross_profit},${p.margin_pct}%\n`;
            });
        } else if (activeTab === 'inventory_report') {
            csvContent += 'INVENTORY VELOCITY REPORT (FAST, SLOW, DEAD STOCK)\n';
            csvContent += `Threshold Days,${deadStockThreshold}\n\n`;
            csvContent += 'Classification,SKU,Part Name,Brand,Category,Sellable Stock,Supplier Cost,Retail Price,Net Sold,Capital Tied Up,Action Advice\n';
            (fastDeadStockData?.fast_moving?.items || []).forEach(p => {
                csvContent += `"FAST-MOVING","${p.sku}","${p.part_name}","${p.brand}","${p.category}",${p.sellable_stock},${p.supplier_cost},${p.retail_price},${p.net_qty_sold},0,"${p.action_advice}"\n`;
            });
            (fastDeadStockData?.slow_moving?.items || []).forEach(p => {
                csvContent += `"SLOW-MOVING","${p.sku}","${p.part_name}","${p.brand}","${p.category}",${p.sellable_stock},${p.supplier_cost},${p.retail_price},${p.net_qty_sold},0,"${p.action_advice}"\n`;
            });
            (fastDeadStockData?.dead_stock?.items || []).forEach(p => {
                csvContent += `"DEAD-STOCK","${p.sku}","${p.part_name}","${p.brand}","${p.category}",${p.sellable_stock},${p.supplier_cost},${p.retail_price},0,${p.capital_tied_up},"${p.clearance_recommendation}"\n`;
            });
        } else if (activeTab === 'cashflow_report') {
            csvContent += 'OPERATING EXPENSES & CASH FLOW REPORT\n\n';
            csvContent += 'CASH FLOW SUMMARY\n';
            csvContent += `Cash Drawer Total In,${cashflowData?.cash_flow?.drawer?.cash_in || 0}\n`;
            csvContent += `Cash Drawer Total Out,${cashflowData?.cash_flow?.drawer?.cash_out || 0}\n`;
            csvContent += `Cash Drawer Net Flow,${cashflowData?.cash_flow?.drawer?.net_flow || 0}\n`;
            csvContent += `GCash Wallet Total In,${cashflowData?.cash_flow?.gcash_bank?.cash_in || 0}\n`;
            csvContent += `GCash Wallet Total Out,${cashflowData?.cash_flow?.gcash_bank?.cash_out || 0}\n`;
            csvContent += `GCash Wallet Net Flow,${cashflowData?.cash_flow?.gcash_bank?.net_flow || 0}\n`;
            csvContent += `Store Total Combined Net Flow,${cashflowData?.cash_flow?.combined?.net_flow || 0}\n\n`;
            csvContent += 'OPERATING EXPENSES LEDGER\n';
            csvContent += 'Date,Category,Expense Title,Amount,Payment Source,Recorded By,Notes\n';
            (cashflowData?.expenses?.items || []).forEach(e => {
                csvContent += `"${e.expense_date}","${e.category}","${e.title}",${e.amount},"${e.payment_source}","${e.recorded_by}","${e.notes || ''}"\n`;
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${filename}`);
    };

    if (!isAdmin) {
        return (
            <div className="glass-panel" style={{ maxWidth: '480px', margin: '48px auto', padding: '36px 24px', textAlign: 'center', borderRadius: '16px' }}>
                <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: 'var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px auto',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                    <Lock size={24} />
                </div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                    Admin Access Required
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    Financial statements, sales velocity classifications, and store cash flow reports are restricted to Owner / Admin accounts.
                </p>
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', width: '100%', minWidth: 0, paddingBottom: '30px' }}>
            {/* Print Stylesheet */}
            <style>{`
                @media print {
                    body * { visibility: hidden !important; }
                    #report-print-container, #report-print-container * { visibility: visible !important; }
                    #report-print-container { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #ffffff !important; color: #000000 !important; }
                    .no-print { display: none !important; }
                }
            `}</style>

            {/* Top Bar Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
                flexWrap: 'wrap',
                gap: '14px',
                width: '100%'
            }} className="no-print">
                <div style={{ minWidth: 0, flex: 1 }}>
                    <h1 style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        margin: 0,
                        fontSize: '1.35rem',
                        fontWeight: 800,
                        color: 'var(--text-main)'
                    }}>
                        <TrendingUp size={24} color="var(--primary)" />
                        <span>Financial, Inventory & Cash Flow Reports</span>
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Complete financial statements, sales velocity classifications, and cash flow tracking for smart buying and pricing decisions.
                    </p>
                </div>

                {/* Print & Export Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                    <button
                        type="button"
                        onClick={handleExportCSV}
                        className="btn-secondary"
                        style={{
                            height: '36px',
                            padding: '0 14px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            cursor: 'pointer'
                        }}
                        title="Export Active Report to Excel / CSV"
                    >
                        <FileSpreadsheet size={15} color="var(--primary)" />
                        <span>Export CSV</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="btn-primary"
                        style={{
                            height: '36px',
                            padding: '0 14px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            cursor: 'pointer'
                        }}
                        title="Print or Save Report as PDF"
                    >
                        <Printer size={15} />
                        <span>Print / PDF</span>
                    </button>
                </div>
            </div>

            {/* Top Toggle Tabs */}
            <div style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '12px',
                marginBottom: '18px',
                overflowX: 'auto',
                width: '100%',
                minWidth: 0
            }} className="no-print">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            className={isActive ? 'btn-primary' : 'btn-secondary'}
                            style={{
                                height: '36px',
                                padding: '0 14px',
                                borderRadius: '8px',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px',
                                flexShrink: 0,
                                whiteSpace: 'nowrap',
                                background: isActive ? 'var(--primary)' : 'var(--surface)',
                                color: isActive ? '#ffffff' : 'var(--text-muted)',
                                border: isActive ? 'none' : '1.5px solid var(--border)',
                                boxShadow: isActive ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none'
                            }}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <Icon size={15} />
                            <span>{tab.name}</span>
                        </button>
                    );
                })}
            </div>

            {/* Date Range Filters Bar */}
            <div className="glass-panel no-print" style={{
                padding: '12px 16px',
                borderRadius: '12px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                width: '100%',
                minWidth: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }}>
                        <Calendar size={16} color="var(--primary)" /> Timeframe:
                    </span>

                    {[
                        { id: 'today', label: 'Today' },
                        { id: 'week', label: 'This Week' },
                        { id: 'month', label: 'This Month' },
                        { id: 'all', label: 'All-Time' },
                        { id: 'custom', label: 'Custom' }
                    ].map((btn) => {
                        const active = timeframe === btn.id;
                        return (
                            <button
                                key={btn.id}
                                type="button"
                                onClick={() => handleSetTimeframe(btn.id)}
                                style={{
                                    padding: '6px 14px',
                                    fontSize: '0.82rem',
                                    fontWeight: active ? 700 : 500,
                                    borderRadius: '8px',
                                    border: active ? 'none' : '1px solid var(--border)',
                                    background: active ? 'var(--primary)' : 'var(--surface)',
                                    color: active ? '#ffffff' : 'var(--text-main)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    boxShadow: active ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none'
                                }}
                            >
                                {btn.label}
                            </button>
                        );
                    })}
                </div>

                {/* Custom Date Pickers */}
                {timeframe === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="input-premium"
                            style={{ height: '34px', padding: '4px 10px', fontSize: '0.82rem', fontFamily: 'monospace' }}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>to</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="input-premium"
                            style={{ height: '34px', padding: '4px 10px', fontSize: '0.82rem', fontFamily: 'monospace' }}
                        />
                        <button
                            type="button"
                            onClick={fetchActiveReport}
                            className="btn-secondary"
                            style={{ height: '34px', padding: '0 14px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                        >
                            Filter
                        </button>
                    </div>
                )}
            </div>

            {/* Main Report Container */}
            <div id="report-print-container">
                {loading ? (
                    <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '14px', color: 'var(--text-muted)' }}>
                        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: 'var(--primary)' }} />
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>Compiling financial and inventory ledger reports...</div>
                    </div>
                ) : (
                    <>
                        {/* ========================================================= */}
                        {/* 0. ADD STORE OPERATING EXPENSE INLINE FORM                */}
                        {/* ========================================================= */}
                        {activeTab === 'add_expense' && (
                            <div className="glass-panel" style={{ maxWidth: '580px', margin: '16px auto', padding: '24px', borderRadius: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                                    <div style={{
                                        width: '42px',
                                        height: '42px',
                                        borderRadius: '10px',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        color: 'var(--danger)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <Truck size={22} />
                                    </div>
                                    <div>
                                        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                                            Record Store Operating Expense
                                        </h2>
                                        <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            Track shop rent, electricity, courier, packaging, and store supplies in the P&L ledger.
                                        </p>
                                    </div>
                                </div>

                                <form onSubmit={handleRecordExpense} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                                            Expense Category *
                                        </label>
                                        <select
                                            value={expenseForm.category}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                                            className="input-premium"
                                            style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
                                        >
                                            <option value="Shop Rent">Shop Rent (Space Lease)</option>
                                            <option value="Electricity / Utilities">Electricity / Utilities</option>
                                            <option value="Shipping & Courier Fees">Shipping & Courier Fees (J&T, LBC, Lalamove)</option>
                                            <option value="Packaging & Bags">Packaging, Boxes & Plastic Bags</option>
                                            <option value="Staff Allowance / Food">Staff Allowance & Meals</option>
                                            <option value="Maintenance & Tools">Shop Maintenance & Tools</option>
                                            <option value="Other Operating Expense">Other Operating Expense</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                                            Expense Title / Item *
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Meralco Electricity Bill Oct 2026 / J&T Restock Shipping"
                                            value={expenseForm.title}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                                            className="input-premium"
                                            style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
                                            required
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                                                Amount (₱) *
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                placeholder="0.00"
                                                value={expenseForm.amount}
                                                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                                className="input-premium"
                                                style={{ width: '100%', height: '38px', fontSize: '0.95rem', fontWeight: 800, fontFamily: 'monospace' }}
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                                                Paid From *
                                            </label>
                                            <select
                                                value={expenseForm.payment_source}
                                                onChange={(e) => setExpenseForm({ ...expenseForm, payment_source: e.target.value })}
                                                className="input-premium"
                                                style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
                                            >
                                                <option value="cash_drawer">Cash Drawer (Petty Cash)</option>
                                                <option value="gcash_bank">GCash / Bank Transfer</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                                            Expense Date *
                                        </label>
                                        <input
                                            type="date"
                                            value={expenseForm.expense_date}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                                            className="input-premium"
                                            style={{ width: '100%', height: '38px', fontSize: '0.85rem', fontFamily: 'monospace' }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                                            Notes / Official Receipt #
                                        </label>
                                        <textarea
                                            rows="2"
                                            placeholder="Reference receipt number or details..."
                                            value={expenseForm.notes}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                                            className="input-premium"
                                            style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('cashflow_report')}
                                            className="btn-secondary"
                                            style={{ height: '38px', padding: '0 18px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submittingExpense}
                                            className="btn-primary"
                                            style={{ height: '38px', padding: '0 22px', fontSize: '0.85rem', fontWeight: 700, cursor: submittingExpense ? 'not-allowed' : 'pointer' }}
                                        >
                                            {submittingExpense ? 'Recording...' : 'Record Store Expense'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* ========================================================= */}
                        {/* 1. PROFIT REPORT (INCOME STATEMENT WATERFALL)             */}
                        {/* ========================================================= */}
                        {activeTab === 'profit_report' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', minWidth: 0 }}>
                                {/* 4 Main Financial KPI Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', width: '100%', minWidth: 0 }}>
                                    {/* 1. Gross Retail Sales */}
                                    <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                Gross Retail Sales
                                            </span>
                                            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <DollarSign size={15} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '6px', fontFamily: 'monospace' }}>
                                            {formatCurrency(salesProfitData?.financials?.gross_revenue || 0)}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                            Total checkout counter earnings
                                        </div>
                                    </div>

                                    {/* 2. Total Puhunan (Product Cost) */}
                                    <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                Total Puhunan (Cost)
                                            </span>
                                            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Boxes size={15} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#3b82f6', marginTop: '6px', fontFamily: 'monospace' }}>
                                            {formatCurrency(salesProfitData?.financials?.cost_of_goods_sold || 0)}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                            Original supplier cost of sold parts
                                        </div>
                                    </div>

                                    {/* 3. Operating Expenses */}
                                    <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                Operating Expenses
                                            </span>
                                            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Truck size={15} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b', marginTop: '6px', fontFamily: 'monospace' }}>
                                            {formatCurrency(salesProfitData?.financials?.total_operating_expenses || 0)}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                            Rent, electric, packaging & shipping
                                        </div>
                                    </div>

                                    {/* 4. True Net Profit */}
                                    {(() => {
                                        const netProfit = Number(salesProfitData?.financials?.true_net_profit || 0);
                                        const isNegative = netProfit < 0;
                                        return (
                                            <div className="glass-panel" style={{
                                                padding: '16px 18px',
                                                borderRadius: '12px',
                                                border: isNegative ? '1.5px solid rgba(239, 68, 68, 0.4)' : '1.5px solid rgba(16, 185, 129, 0.4)',
                                                boxShadow: isNegative ? '0 4px 14px rgba(239, 68, 68, 0.12)' : '0 4px 14px rgba(16, 185, 129, 0.12)'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                    <span style={{
                                                        fontSize: '0.76rem',
                                                        fontWeight: 700,
                                                        color: isNegative ? 'var(--danger)' : 'var(--primary)',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.4px'
                                                    }}>
                                                        True Net Profit
                                                    </span>
                                                    <div style={{
                                                        width: '30px',
                                                        height: '30px',
                                                        borderRadius: '8px',
                                                        background: isNegative ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                        color: isNegative ? 'var(--danger)' : 'var(--primary)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}>
                                                        <TrendingUp size={15} style={{ transform: isNegative ? 'rotate(180deg)' : 'none' }} />
                                                    </div>
                                                </div>
                                                <div style={{
                                                    fontSize: '1.6rem',
                                                    fontWeight: 900,
                                                    color: isNegative ? 'var(--danger)' : 'var(--primary)',
                                                    marginTop: '6px',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    {formatCurrency(netProfit)}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 600,
                                                    color: isNegative ? 'var(--danger)' : 'var(--primary)',
                                                    marginTop: '3px'
                                                }}>
                                                    Margin: {salesProfitData?.financials?.profit_margin_pct || 0}%
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Step-by-Step Income Statement Waterfall & Operating Expense Breakdown */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', alignItems: 'start', width: '100%', minWidth: 0 }}>
                                    {/* Detailed Income Statement Waterfall */}
                                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                            <DollarSign size={18} color="var(--primary)" />
                                            <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                                Detailed Income Statement (P&L Waterfall)
                                            </h3>
                                        </div>

                                        <div style={{
                                            border: '1px solid var(--border)',
                                            borderRadius: '10px',
                                            padding: '12px 16px',
                                            background: 'var(--surface-hover)',
                                            fontSize: '0.83rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-main)' }}>
                                                <span style={{ fontWeight: 600 }}>Gross Retail Sales:</span>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-main)' }}>
                                                    {formatCurrency(salesProfitData?.financials?.gross_revenue || 0)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', color: '#a855f7' }}>
                                                <span>Less: Voided / Cancelled Sales:</span>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                    -{formatCurrency(salesProfitData?.financials?.sales_reversals || 0)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', color: '#a855f7' }}>
                                                <span>Less: Approved Cashier Discounts:</span>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                    -{formatCurrency(salesProfitData?.financials?.discounts || 0)}
                                                </span>
                                            </div>
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                padding: '8px 10px',
                                                borderRadius: '6px',
                                                background: 'rgba(16, 185, 129, 0.08)',
                                                fontWeight: 800,
                                                color: 'var(--primary)'
                                            }}>
                                                <span>= Net Retail Sales:</span>
                                                <span style={{ fontFamily: 'monospace' }}>
                                                    {formatCurrency(salesProfitData?.financials?.net_retail_sales || 0)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', color: '#3b82f6' }}>
                                                <span>Less: Total Puhunan (Supplier Cost of Items Sold):</span>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                    -{formatCurrency(salesProfitData?.financials?.cost_of_goods_sold || 0)}
                                                </span>
                                            </div>
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                padding: '8px 10px',
                                                borderRadius: '6px',
                                                background: 'rgba(6, 182, 212, 0.08)',
                                                fontWeight: 800,
                                                color: '#06b6d4'
                                            }}>
                                                <span>= Gross Margin:</span>
                                                <span style={{ fontFamily: 'monospace' }}>
                                                    {formatCurrency(salesProfitData?.financials?.gross_margin || 0)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--danger)' }}>
                                                <span>Less: In-Store Damaged Stock & Shrinkage Losses:</span>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                    -{formatCurrency(salesProfitData?.financials?.combined_shop_losses || salesProfitData?.financials?.shop_return_losses || 0)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', color: '#f59e0b' }}>
                                                <span>Less: Operating Expenses (Rent, power, courier, bags):</span>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                    -{formatCurrency(salesProfitData?.financials?.total_operating_expenses || 0)}
                                                </span>
                                            </div>
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 14px',
                                                borderRadius: '8px',
                                                border: '1.5px solid var(--primary)',
                                                background: 'rgba(16, 185, 129, 0.12)',
                                                color: 'var(--primary)',
                                                fontWeight: 900
                                            }}>
                                                <span style={{ fontSize: '0.88rem' }}>= True Net Profit (Malinis na Kita):</span>
                                                <span style={{ fontFamily: 'monospace', fontSize: '1.05rem' }}>
                                                    {formatCurrency(salesProfitData?.financials?.true_net_profit || 0)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Side: Operating Expense Breakdown & Payment Channels */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        {/* Operating Expenses Breakdown Card */}
                                        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Truck size={18} color="#f59e0b" />
                                                    <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                                        Operating Expenses Breakdown
                                                    </h3>
                                                </div>
                                                <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', fontWeight: 700, color: '#f59e0b' }}>
                                                    Total: {formatCurrency(salesProfitData?.financials?.total_operating_expenses || 0)}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                                                {[
                                                    { label: 'Shop Rent (Prorated Monthly Lease)', val: salesProfitData?.financials?.expense_breakdown?.rent || 0 },
                                                    { label: 'Electricity & Shop Utilities', val: salesProfitData?.financials?.expense_breakdown?.electricity || 0 },
                                                    { label: 'Shipping Fees (J&T, Lalamove, Flash)', val: salesProfitData?.financials?.expense_breakdown?.shipping_courier || 0 },
                                                    { label: 'Packaging Materials & Plastic Bags', val: salesProfitData?.financials?.expense_breakdown?.packaging || 0 },
                                                    { label: 'Staff Snacks & Allowances', val: salesProfitData?.financials?.expense_breakdown?.staff_allowance || 0 },
                                                    { label: 'Store Maintenance & Upkeep', val: salesProfitData?.financials?.expense_breakdown?.maintenance || 0 }
                                                ].map(item => (
                                                    <div key={item.label} style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        padding: '8px 12px',
                                                        background: 'var(--surface-hover)',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border)'
                                                    }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>{item.label}:</span>
                                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-main)' }}>
                                                            {formatCurrency(item.val)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Payment Channels (Cash vs GCash) */}
                                        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                                <CreditCard size={18} color="var(--primary)" />
                                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                                    Payment Channels (Cash vs. GCash)
                                                </h3>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' }}>
                                                <div style={{
                                                    padding: '14px',
                                                    borderRadius: '10px',
                                                    background: 'var(--surface-hover)',
                                                    border: '1px solid var(--border)'
                                                }}>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Cash Drawer</div>
                                                    <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)', marginTop: '4px' }}>
                                                        {formatCurrency(salesProfitData?.payment_channels?.cash?.amount || 0)}
                                                    </div>
                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                        {salesProfitData?.payment_channels?.cash?.count || 0} orders ({salesProfitData?.payment_channels?.cash?.percentage || 0}%)
                                                    </div>
                                                </div>
                                                <div style={{
                                                    padding: '14px',
                                                    borderRadius: '10px',
                                                    background: 'var(--surface-hover)',
                                                    border: '1px solid var(--border)'
                                                }}>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>GCash Wallet</div>
                                                    <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'monospace', color: '#3b82f6', marginTop: '4px' }}>
                                                        {formatCurrency(salesProfitData?.payment_channels?.gcash?.amount || 0)}
                                                    </div>
                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                        {salesProfitData?.payment_channels?.gcash?.count || 0} orders ({salesProfitData?.payment_channels?.gcash?.percentage || 0}%)
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ========================================================= */}
                        {/* 2. SALES REPORT (BY CATEGORY, BRAND, CASHIER, RECEIPTS)  */}
                        {/* ========================================================= */}
                        {activeTab === 'sales_report' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Cashier Performance Ranking */}
                                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                        <UsersIcon size={18} color="var(--primary)" />
                                        <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                            Cashier Performance & Sales Volume
                                        </h3>
                                    </div>

                                    <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Cashier</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Transactions</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Cash Collected</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>GCash Collected</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Total Sales Issued</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {salesProfitData?.cashier_shifts?.map((c) => (
                                                    <tr key={c.cashier_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                            {c.cashier_name} <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 400 }}>({c.role})</span>
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                                            {c.transaction_count}
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--primary)', fontWeight: 700, fontFamily: 'monospace' }}>
                                                            {formatCurrency(c.cash_collected)}
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#3b82f6', fontWeight: 700, fontFamily: 'monospace' }}>
                                                            {formatCurrency(c.gcash_collected)}
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                                            {formatCurrency(c.total_sales)}
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                padding: '3px 8px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(16, 185, 129, 0.1)',
                                                                color: 'var(--primary)',
                                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                                                fontWeight: 700
                                                            }}>
                                                                Balanced
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Category Performance */}
                                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                        <Layers size={18} color="var(--primary)" />
                                        <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                            Sales by Category & Profit Margins
                                        </h3>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                                        {salesProfitData?.category_sales?.map(cat => (
                                            <div key={cat.category} style={{
                                                padding: '14px 16px',
                                                borderRadius: '10px',
                                                background: 'var(--surface-hover)',
                                                border: '1px solid var(--border)'
                                            }}>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>{cat.category}</div>
                                                <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>
                                                    {formatCurrency(cat.total_revenue)}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    {cat.total_qty_sold} units sold • Margin: <strong style={{ color: 'var(--primary)' }}>{cat.margin_pct}%</strong>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Itemized Sold Parts Table */}
                                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Package size={18} color="var(--primary)" />
                                            <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                                Itemized Motorparts Sold ({filteredSoldProducts.length} items)
                                            </h3>
                                        </div>
                                        <div style={{ position: 'relative', width: '280px' }}>
                                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                            <input
                                                type="text"
                                                placeholder="Search part name, brand, or SKU..."
                                                value={productSalesSearch}
                                                onChange={(e) => setProductSalesSearch(e.target.value)}
                                                className="input-premium"
                                                style={{ width: '100%', height: '34px', paddingLeft: '32px', fontSize: '0.82rem' }}
                                            />
                                        </div>
                                    </div>

                                    <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Item Code</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Part Name & Brand</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Category</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Qty Sold</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Avg Cost</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Avg Retail</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Revenue</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Gross Profit</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Margin</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredSoldProducts.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                            No motorparts sales found for this filter criteria.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredSoldProducts.map(p => (
                                                        <tr key={p.product_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.part_number}</td>
                                                            <td style={{ padding: '10px 14px' }}>
                                                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{p.product_name}</div>
                                                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{p.brand}</div>
                                                            </td>
                                                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{p.category}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-main)' }}>{p.total_qty_sold}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{formatCurrency(p.avg_unit_cost)}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-main)' }}>{formatCurrency(p.avg_unit_price)}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(p.total_revenue)}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--text-main)' }}>{formatCurrency(p.total_gross_profit)}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--primary)' }}>{p.margin_pct}%</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ========================================================= */}
                        {/* 3. INVENTORY REPORT (FAST, SLOW, DEAD STOCK)              */}
                        {/* ========================================================= */}
                        {activeTab === 'inventory_report' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Velocity Summary Alert */}
                                <div className="glass-panel" style={{
                                    padding: '18px 20px',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '14px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '10px',
                                            background: 'rgba(245, 158, 11, 0.1)',
                                            color: '#f59e0b',
                                            border: '1px solid rgba(245, 158, 11, 0.25)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <AlertOctagon size={22} />
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                                                Inventory Velocity & Shelf Capital Analysis
                                            </h3>
                                            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                Dead stock tied-up capital: <strong style={{ color: '#f59e0b', fontFamily: 'monospace' }}>{formatCurrency(fastDeadStockData?.dead_stock?.total_capital_tied_up || 0)}</strong> across <strong style={{ color: '#f59e0b', fontFamily: 'monospace' }}>{fastDeadStockData?.dead_stock?.total_units || 0}</strong> unsold shelf units.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Velocity Filter Buttons */}
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {[
                                            { id: 'ALL', label: 'All Items' },
                                            { id: 'FAST', label: `🚀 Fast-Moving (${fastDeadStockData?.fast_moving?.count || 0})` },
                                            { id: 'SLOW', label: `🐢 Slow-Moving (${fastDeadStockData?.slow_moving?.count || 0})` },
                                            { id: 'DEAD', label: `🛑 Dead Stock (${fastDeadStockData?.dead_stock?.count || 0})` },
                                        ].map(btn => {
                                            const active = velocityFilter === btn.id;
                                            return (
                                                <button
                                                    key={btn.id}
                                                    type="button"
                                                    onClick={() => setVelocityFilter(btn.id)}
                                                    style={{
                                                        padding: '6px 14px',
                                                        fontSize: '0.82rem',
                                                        fontWeight: active ? 700 : 500,
                                                        borderRadius: '8px',
                                                        border: active ? 'none' : '1px solid var(--border)',
                                                        background: active ? 'var(--primary)' : 'var(--surface)',
                                                        color: active ? '#ffffff' : 'var(--text-main)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                        boxShadow: active ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none'
                                                    }}
                                                >
                                                    {btn.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Fast-Moving Stock Section */}
                                {(velocityFilter === 'ALL' || velocityFilter === 'FAST') && (
                                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <TrendingUp size={18} color="var(--primary)" />
                                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--primary)', margin: 0 }}>
                                                    Fast-Moving Stock (High Weekly Turnover • Never Run Out)
                                                </h3>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                {fastDeadStockData?.fast_moving?.count || 0} Parts
                                            </span>
                                        </div>

                                        <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Rank</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Part Name & SKU</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Category</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Net Sold</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Sellable Stock</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Revenue</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Profit</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Restock Action Advice</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fastDeadStockData?.fast_moving?.items?.map(p => (
                                                        <tr key={p.product_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--primary)' }}>#{p.rank}</td>
                                                            <td style={{ padding: '10px 14px' }}>
                                                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{p.part_name}</div>
                                                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{p.sku} • {p.brand}</div>
                                                            </td>
                                                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{p.category}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>{p.net_qty_sold}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>{p.sellable_stock}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>{formatCurrency(p.revenue_generated)}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>{formatCurrency(p.estimated_profit)}</td>
                                                            <td style={{ padding: '10px 14px' }}>
                                                                <span style={{
                                                                    fontSize: '0.72rem',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '6px',
                                                                    background: 'rgba(16, 185, 129, 0.1)',
                                                                    color: 'var(--primary)',
                                                                    border: '1px solid rgba(16, 185, 129, 0.25)',
                                                                    fontWeight: 700
                                                                }}>
                                                                    {p.action_advice}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Slow-Moving Stock Section */}
                                {(velocityFilter === 'ALL' || velocityFilter === 'SLOW') && (
                                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Clock size={18} color="#f59e0b" />
                                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#f59e0b', margin: 0 }}>
                                                    Slow-Moving Stock (Sold only 1–2 times in last 30–60 days)
                                                </h3>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                {fastDeadStockData?.slow_moving?.count || 0} Parts
                                            </span>
                                        </div>

                                        <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Part Name & SKU</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Category</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Net Sold</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Shelf Stock</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Supplier Cost</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Retail Price</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Action Advice</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fastDeadStockData?.slow_moving?.items?.map(p => (
                                                        <tr key={p.product_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '10px 14px' }}>
                                                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{p.part_name}</div>
                                                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{p.sku} • {p.brand}</div>
                                                            </td>
                                                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{p.category}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace' }}>{p.net_qty_sold}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>{p.sellable_stock}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{formatCurrency(p.supplier_cost)}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-main)' }}>{formatCurrency(p.retail_price)}</td>
                                                            <td style={{ padding: '10px 14px' }}>
                                                                <span style={{
                                                                    fontSize: '0.72rem',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '6px',
                                                                    background: 'rgba(245, 158, 11, 0.1)',
                                                                    color: '#f59e0b',
                                                                    border: '1px solid rgba(245, 158, 11, 0.25)',
                                                                    fontWeight: 700
                                                                }}>
                                                                    {p.action_advice}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Dead Stock Section */}
                                {(velocityFilter === 'ALL' || velocityFilter === 'DEAD') && (
                                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <AlertOctagon size={18} color="var(--danger)" />
                                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--danger)', margin: 0 }}>
                                                    Dead Stock (Zero Sales in 90+ Days • Puhunan Tied Up)
                                                </h3>
                                            </div>
                                            <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', fontWeight: 800, color: 'var(--danger)' }}>
                                                Tied Up: {formatCurrency(fastDeadStockData?.dead_stock?.total_capital_tied_up || 0)}
                                            </span>
                                        </div>

                                        <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Part Name & SKU</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Category</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Unsold Units</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Supplier Cost (Puhunan)</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Capital Tied Up</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'center' }}>Days Inactive</th>
                                                        <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Clearance Recommendation</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fastDeadStockData?.dead_stock?.items?.map(p => (
                                                        <tr key={p.product_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '10px 14px' }}>
                                                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{p.part_name}</div>
                                                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{p.sku} • {p.brand}</div>
                                                            </td>
                                                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{p.category}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--danger)', fontFamily: 'monospace' }}>{p.sellable_stock}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{formatCurrency(p.supplier_cost)}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--danger)' }}>{formatCurrency(p.capital_tied_up)}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.days_inactive} days</td>
                                                            <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600 }}>
                                                                {p.clearance_recommendation}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ========================================================= */}
                        {/* 4. EXPENSES & CASH FLOW REPORT                             */}
                        {/* ========================================================= */}
                        {activeTab === 'cashflow_report' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', minWidth: 0 }}>
                                {/* Cash Flow Comparison Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', width: '100%', minWidth: 0 }}>
                                    {/* Cash Drawer Flow */}
                                    <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                Cash Drawer Flow
                                            </span>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Wallet size={16} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--primary)' }}>
                                                <span>Total Cash In:</span>
                                                <span style={{ fontWeight: 700 }}>+{formatCurrency(cashflowData?.cash_flow?.drawer?.cash_in || 0)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                                                <span>Total Cash Out:</span>
                                                <span style={{ fontWeight: 700 }}>-{formatCurrency(cashflowData?.cash_flow?.drawer?.cash_out || 0)}</span>
                                            </div>
                                            <div style={{
                                                borderTop: '1px solid var(--border)',
                                                paddingTop: '8px',
                                                marginTop: '4px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                fontWeight: 800,
                                                fontSize: '0.92rem'
                                            }}>
                                                <span style={{ color: 'var(--text-main)', fontFamily: 'sans-serif' }}>Net Drawer Flow:</span>
                                                <span style={{ color: Number(cashflowData?.cash_flow?.drawer?.net_flow || 0) >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                                                    {formatCurrency(cashflowData?.cash_flow?.drawer?.net_flow || 0)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* GCash / Bank Flow */}
                                    <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                GCash / Bank Flow
                                            </span>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Landmark size={16} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3b82f6' }}>
                                                <span>Total GCash In:</span>
                                                <span style={{ fontWeight: 700 }}>+{formatCurrency(cashflowData?.cash_flow?.gcash_bank?.cash_in || 0)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                                                <span>Total GCash Out:</span>
                                                <span style={{ fontWeight: 700 }}>-{formatCurrency(cashflowData?.cash_flow?.gcash_bank?.cash_out || 0)}</span>
                                            </div>
                                            <div style={{
                                                borderTop: '1px solid var(--border)',
                                                paddingTop: '8px',
                                                marginTop: '4px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                fontWeight: 800,
                                                fontSize: '0.92rem'
                                            }}>
                                                <span style={{ color: 'var(--text-main)', fontFamily: 'sans-serif' }}>Net GCash Flow:</span>
                                                <span style={{ color: Number(cashflowData?.cash_flow?.gcash_bank?.net_flow || 0) >= 0 ? '#3b82f6' : 'var(--danger)' }}>
                                                    {formatCurrency(cashflowData?.cash_flow?.gcash_bank?.net_flow || 0)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Overall Store Net Cash Flow */}
                                    <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                Combined Business Net Flow
                                            </span>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.1)', color: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <TrendingUp size={16} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
                                                <span>Total In (All Channels):</span>
                                                <span style={{ fontWeight: 700 }}>+{formatCurrency(cashflowData?.cash_flow?.combined?.total_in || 0)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                                                <span>Total Out (All Channels):</span>
                                                <span style={{ fontWeight: 700 }}>-{formatCurrency(cashflowData?.cash_flow?.combined?.total_out || 0)}</span>
                                            </div>
                                            <div style={{
                                                borderTop: '1px solid var(--border)',
                                                paddingTop: '8px',
                                                marginTop: '4px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                fontWeight: 800,
                                                fontSize: '0.92rem'
                                            }}>
                                                <span style={{ color: 'var(--text-main)', fontFamily: 'sans-serif' }}>Total Net Cash Flow:</span>
                                                <span style={{ color: Number(cashflowData?.cash_flow?.combined?.net_flow || 0) >= 0 ? 'var(--primary)' : 'var(--danger)', fontWeight: 900 }}>
                                                    {formatCurrency(cashflowData?.cash_flow?.combined?.net_flow || 0)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Operating Expenses Ledger Table */}
                                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Truck size={18} color="#f59e0b" />
                                            <h3 style={{ fontSize: '0.88rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)', margin: 0 }}>
                                                Store Operating Expenses Ledger
                                            </h3>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', fontWeight: 700, color: '#f59e0b' }}>
                                                Total: {formatCurrency(cashflowData?.expenses?.total_amount || 0)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('add_expense')}
                                                className="btn-primary"
                                                style={{
                                                    height: '34px',
                                                    padding: '0 14px',
                                                    borderRadius: '8px',
                                                    fontSize: '0.82rem',
                                                    fontWeight: 700,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <Plus size={15} />
                                                <span>+ Add Store Expense</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="table-container" style={{ margin: 0, borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Date</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Category</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Expense Title / Item</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Payment Source</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'right' }}>Amount</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Recorded By</th>
                                                    <th style={{ background: 'var(--th-bg)', color: 'var(--th-color)', padding: '10px 14px', textAlign: 'left' }}>Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(!cashflowData?.expenses?.items || cashflowData.expenses.items.length === 0) ? (
                                                    <tr>
                                                        <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                            No operating expenses recorded in this period.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    cashflowData.expenses.items.map(e => (
                                                        <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                                                {e.expense_date}
                                                            </td>
                                                            <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                                {e.category}
                                                            </td>
                                                            <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                                {e.title}
                                                            </td>
                                                            <td style={{ padding: '10px 14px' }}>
                                                                <span style={{
                                                                    fontSize: '0.72rem',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '6px',
                                                                    fontWeight: 700,
                                                                    textTransform: 'uppercase',
                                                                    background: e.payment_source === 'cash_drawer' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(37, 99, 235, 0.1)',
                                                                    color: e.payment_source === 'cash_drawer' ? 'var(--primary)' : '#3b82f6',
                                                                    border: e.payment_source === 'cash_drawer' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(37, 99, 235, 0.25)'
                                                                }}>
                                                                    {e.payment_source === 'cash_drawer' ? 'Cash Drawer' : 'GCash / Bank'}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--danger)', fontFamily: 'monospace' }}>
                                                                {formatCurrency(e.amount)}
                                                            </td>
                                                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                                                                {e.recorded_by}
                                                            </td>
                                                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                                                {e.notes || '—'}
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
                    </>
                )}
            </div>
        </div>
    );
};

export default Reports;
