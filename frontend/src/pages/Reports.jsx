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
    { id: 'profit_report', name: 'Profit Report (P&L Income Statement)', icon: DollarSign },
    { id: 'sales_report', name: 'Sales Report & Breakdown', icon: TrendingUp },
    { id: 'inventory_report', name: 'Inventory Report (Fast, Slow, Dead Stock)', icon: Package },
    { id: 'cashflow_report', name: 'Expenses & Cash Flow', icon: Wallet },
    { id: 'add_expense', name: 'Add Store Expense', icon: Plus },
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
            fetchData();
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
            csvContent += `Less: Active COGS (Cost of Kept Sales),-${salesProfitData?.financials?.cost_of_goods_sold || 0}\n`;
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center max-w-lg mx-auto my-12 space-y-3">
                <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto border border-red-500/20">
                    <Lock size={22} />
                </div>
                <h2 className="text-base font-bold text-zinc-100">Admin Access Required</h2>
                <p className="text-xs text-zinc-400">
                    Financial and inventory reports are restricted to Owner/Admin accounts.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5 pb-12" style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px' }}>
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
                <div>
                    <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                        <TrendingUp size={20} className="text-emerald-400" />
                        <span>Financial, Inventory & Cash Flow Reports</span>
                    </h1>
                    <p className="text-xs text-zinc-400 mt-0.5">
                        Gives the store owner complete financial statements, sales velocity classifications, and cash flow tracking to make smart buying and pricing decisions.
                    </p>
                </div>

                {/* Print & Export Actions */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={handleExportCSV}
                        className="px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-2 transition-colors border border-zinc-700 shadow-sm"
                        title="Export Active Report to Excel / CSV"
                    >
                        <FileSpreadsheet size={15} className="text-emerald-400" />
                        <span>Export CSV / Excel</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-sm"
                        title="Print or Save Report as PDF"
                    >
                        <Printer size={15} />
                        <span>Print / PDF</span>
                    </button>
                </div>
            </div>

            {/* Top Toggle Tabs (The 4 Modules of Section 9) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 flex flex-wrap gap-2 shadow-sm no-print">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 min-w-[190px] px-4 py-2.5 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                                isActive
                                    ? 'bg-emerald-600 text-white shadow-sm font-bold'
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                            }`}
                        >
                            <Icon size={15} />
                            <span>{tab.name}</span>
                        </button>
                    );
                })}
            </div>

            {/* Date Range Filters Bar */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm no-print">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1 mr-1">
                        <Calendar size={13} className="text-emerald-400" />
                        <span>Timeframe:</span>
                    </span>

                    {[
                        { id: 'today', label: 'Today' },
                        { id: 'week', label: 'This Week' },
                        { id: 'month', label: 'This Month' },
                        { id: 'all', label: 'All-Time' },
                        { id: 'custom', label: 'Custom' }
                    ].map((btn) => (
                        <button
                            key={btn.id}
                            type="button"
                            onClick={() => handleSetTimeframe(btn.id)}
                            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                                timeframe === btn.id
                                    ? 'bg-emerald-600 text-white font-bold'
                                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                            }`}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>

                {/* Custom Date Pickers */}
                {timeframe === 'custom' && (
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-200 font-mono"
                        />
                        <span className="text-zinc-500 text-xs">to</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-200 font-mono"
                        />
                        <button
                            type="button"
                            onClick={fetchActiveReport}
                            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 rounded border border-zinc-700"
                        >
                            Filter
                        </button>
                    </div>
                )}
            </div>

            {/* Main Report Container */}
            <div id="report-print-container">
                {loading ? (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center text-zinc-400">
                        <RefreshCw size={24} className="animate-spin mx-auto text-emerald-400 mb-2" />
                        <span>Compiling financial and inventory ledger reports...</span>
                    </div>
                ) : (
                    <>
                        {/* ========================================================= */}
                        {/* 0. ADD STORE OPERATING EXPENSE INLINE FORM                */}
                        {/* ========================================================= */}
                        {activeTab === 'add_expense' && (
                            <div className="max-w-xl mx-auto my-4 bg-zinc-900 border border-zinc-700 rounded-xl p-6 shadow-xl">
                                <div className="flex items-center gap-3 mb-5 border-b border-zinc-800 pb-4">
                                    <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-lg">
                                        <Truck size={22} />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-zinc-100">Record Store Operating Expense</h2>
                                        <p className="text-xs text-zinc-400">
                                            Track shop rent, electricity, courier, packaging, and store supplies in the P&L ledger.
                                        </p>
                                    </div>
                                </div>

                                <form onSubmit={handleRecordExpense} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Expense Category *:</label>
                                        <select
                                            value={expenseForm.category}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200"
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
                                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Expense Title / Item *:</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Meralco Electricity Bill Oct 2026 / J&T Restock Shipping"
                                            value={expenseForm.title}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200"
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-300 mb-1">Amount (₱) *:</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                placeholder="0.00"
                                                value={expenseForm.amount}
                                                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono font-bold text-zinc-100"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-300 mb-1">Paid From *:</label>
                                            <select
                                                value={expenseForm.payment_source}
                                                onChange={(e) => setExpenseForm({ ...expenseForm, payment_source: e.target.value })}
                                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200"
                                            >
                                                <option value="cash_drawer">Cash Drawer (Petty Cash)</option>
                                                <option value="gcash_bank">GCash / Bank Transfer</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Expense Date:</label>
                                        <input
                                            type="date"
                                            value={expenseForm.expense_date}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Notes / Official Receipt #:</label>
                                        <textarea
                                            rows="2"
                                            placeholder="Reference receipt number or details..."
                                            value={expenseForm.notes}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200"
                                        />
                                    </div>

                                    <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('cashflow_report')}
                                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold"
                                            style={{ cursor: 'pointer' }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submittingExpense}
                                            style={{
                                                backgroundColor: '#10b981',
                                                color: '#ffffff',
                                                fontWeight: 800,
                                                fontSize: '13px',
                                                padding: '9px 24px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                cursor: submittingExpense ? 'not-allowed' : 'pointer',
                                                boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)'
                                            }}
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
                            <div className="flex flex-col gap-5">
                                {/* 4 Main Financial KPI Cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                        <div className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                                            <span>Gross Retail Sales</span>
                                            <DollarSign size={16} className="text-emerald-400" />
                                        </div>
                                        <div className="text-2xl font-extrabold text-zinc-100 mt-2 font-mono">
                                            {formatCurrency(salesProfitData?.financials?.gross_revenue || 0)}
                                        </div>
                                        <div className="text-[11px] text-zinc-500 mt-1">
                                            Total checkout counter earnings
                                        </div>
                                    </div>

                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                        <div className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                                            <span>Active COGS (Puhunan)</span>
                                            <Boxes size={16} className="text-blue-400" />
                                        </div>
                                        <div className="text-2xl font-extrabold text-blue-400 mt-2 font-mono">
                                            {formatCurrency(salesProfitData?.financials?.cost_of_goods_sold || 0)}
                                        </div>
                                        <div className="text-[11px] text-zinc-500 mt-1">
                                            Supplier cost of kept sales
                                        </div>
                                    </div>

                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                        <div className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                                            <span>Operating Expenses</span>
                                            <Truck size={16} className="text-amber-400" />
                                        </div>
                                        <div className="text-2xl font-extrabold text-amber-400 mt-2 font-mono">
                                            {formatCurrency(salesProfitData?.financials?.total_operating_expenses || 0)}
                                        </div>
                                        <div className="text-[11px] text-zinc-500 mt-1">
                                            Rent, electric, packaging & shipping
                                        </div>
                                    </div>

                                    {(() => {
                                        const netProfit = Number(salesProfitData?.financials?.true_net_profit || 0);
                                        const isNegative = netProfit < 0;
                                        return (
                                            <div className={`bg-zinc-900 rounded-lg p-5 shadow-sm border ring-1 ${
                                                isNegative
                                                    ? 'border-red-500/40 ring-red-500/20 text-red-500'
                                                    : 'border-emerald-500/40 ring-emerald-500/20'
                                            }`}>
                                                <div className={`text-[11px] font-bold flex items-center justify-between ${
                                                    isNegative ? 'text-red-400' : 'text-emerald-400'
                                                }`}>
                                                    <span>True Net Profit</span>
                                                    <TrendingUp size={16} className={isNegative ? 'text-red-400 rotate-180' : 'text-emerald-400'} />
                                                </div>
                                                <div className={`text-2xl font-black mt-2 font-mono ${
                                                    isNegative ? 'text-red-500' : 'text-emerald-400'
                                                }`}>
                                                    {formatCurrency(netProfit)}
                                                </div>
                                                <div className={`text-[11px] mt-1 font-medium ${
                                                    isNegative ? 'text-red-400' : 'text-emerald-500/80'
                                                }`}>
                                                    Margin: {salesProfitData?.financials?.profit_margin_pct || 0}%
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Step-by-Step Income Statement Waterfall & Operating Expense Breakdown */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                                    {/* Detailed Income Statement Waterfall */}
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                        <div className="flex items-center gap-2 mb-4">
                                            <DollarSign size={16} className="text-emerald-400" />
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                                                Detailed Income Statement (P&L Waterfall)
                                            </h3>
                                        </div>

                                        <div className="space-y-2 border border-zinc-800/80 rounded-lg px-4 py-3 bg-zinc-950/40 text-xs">
                                            <div className="flex justify-between py-2 px-2 border-b border-zinc-800/60 text-zinc-200">
                                                <span className="font-semibold">Gross Retail Sales:</span>
                                                <span className="font-mono font-bold text-zinc-100">
                                                    {formatCurrency(salesProfitData?.financials?.gross_revenue || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between py-2 px-2 border-b border-zinc-800/60 text-purple-400">
                                                <span>Less: Voided / Cancelled Sales:</span>
                                                <span className="font-mono font-bold">
                                                    -{formatCurrency(salesProfitData?.financials?.sales_reversals || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between py-2 px-2 border-b border-zinc-800/60 text-purple-400">
                                                <span>Less: Approved Cashier Discounts:</span>
                                                <span className="font-mono font-bold">
                                                    -{formatCurrency(salesProfitData?.financials?.discounts || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between py-2 px-2 border-b border-zinc-800 font-bold bg-zinc-900/60 text-emerald-400 rounded">
                                                <span>= Net Retail Sales:</span>
                                                <span className="font-mono">
                                                    {formatCurrency(salesProfitData?.financials?.net_retail_sales || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between py-2 px-2 border-b border-zinc-800/60 text-blue-400">
                                                <span>Less: Active COGS (Cost of Kept Sales):</span>
                                                <span className="font-mono font-bold">
                                                    -{formatCurrency(salesProfitData?.financials?.cost_of_goods_sold || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between py-2 px-2 border-b border-zinc-800 font-bold bg-zinc-900/60 text-cyan-400 rounded">
                                                <span>= Gross Margin:</span>
                                                <span className="font-mono">
                                                    {formatCurrency(salesProfitData?.financials?.gross_margin || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between py-2 px-2 border-b border-zinc-800/60 text-rose-400">
                                                <span>Less: In-Store Damaged Stock & Shrinkage Losses:</span>
                                                <span className="font-mono font-bold">
                                                    -{formatCurrency(salesProfitData?.financials?.combined_shop_losses || salesProfitData?.financials?.shop_return_losses || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between py-2 px-2 border-b border-zinc-800/60 text-amber-400">
                                                <span>Less: Operating Expenses (Rent, power, courier, bags):</span>
                                                <span className="font-mono font-bold">
                                                    -{formatCurrency(salesProfitData?.financials?.total_operating_expenses || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between py-3 px-3 border-t-2 border-emerald-500 bg-emerald-950/20 text-emerald-400 text-sm font-black rounded">
                                                <span className="text-emerald-300">= True Net Profit (Malinis na Kita):</span>
                                                <span className="font-mono text-base">
                                                    {formatCurrency(salesProfitData?.financials?.true_net_profit || 0)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Side: Operating Expense Breakdown & Payment Channels */}
                                    <div className="space-y-4">
                                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <Truck size={16} className="text-amber-400" />
                                                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                                                        Operating Expenses Breakdown
                                                    </h3>
                                                </div>
                                                <span className="text-xs font-mono font-bold text-amber-400">
                                                    Total: {formatCurrency(salesProfitData?.financials?.total_operating_expenses || 0)}
                                                </span>
                                            </div>

                                            <div className="space-y-2 text-xs">
                                                {[
                                                    { label: 'Shop Rent (Prorated Monthly Lease)', val: salesProfitData?.financials?.expense_breakdown?.rent || 0 },
                                                    { label: 'Electricity & Shop Utilities', val: salesProfitData?.financials?.expense_breakdown?.electricity || 0 },
                                                    { label: 'Shipping Fees (J&T, Lalamove, Flash)', val: salesProfitData?.financials?.expense_breakdown?.shipping_courier || 0 },
                                                    { label: 'Packaging Materials & Plastic Bags', val: salesProfitData?.financials?.expense_breakdown?.packaging || 0 },
                                                    { label: 'Staff Snacks & Allowances', val: salesProfitData?.financials?.expense_breakdown?.staff_allowance || 0 },
                                                    { label: 'Store Maintenance & Upkeep', val: salesProfitData?.financials?.expense_breakdown?.maintenance || 0 }
                                                ].map(item => (
                                                    <div key={item.label} className="flex justify-between py-1.5 px-3 bg-zinc-950 rounded border border-zinc-800/60">
                                                        <span className="text-zinc-400">{item.label}:</span>
                                                        <span className="font-mono font-bold text-zinc-200">{formatCurrency(item.val)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Payment Channels (Cash vs GCash) */}
                                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                            <div className="flex items-center gap-2 mb-3">
                                                <CreditCard size={16} className="text-emerald-400" />
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                                                    Payment Channels (Cash vs. GCash)
                                                </h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                                                    <div className="text-[11px] text-zinc-400">Cash Drawer</div>
                                                    <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                                                        {formatCurrency(salesProfitData?.payment_channels?.cash?.amount || 0)}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 mt-1">
                                                        {salesProfitData?.payment_channels?.cash?.count || 0} orders ({salesProfitData?.payment_channels?.cash?.percentage || 0}%)
                                                    </div>
                                                </div>
                                                <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                                                    <div className="text-[11px] text-zinc-400">GCash Wallet</div>
                                                    <div className="text-base font-bold font-mono text-blue-400 mt-1">
                                                        {formatCurrency(salesProfitData?.payment_channels?.gcash?.amount || 0)}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 mt-1">
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
                            <div className="flex flex-col gap-6">
                                {/* Cashier Performance Ranking */}
                                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <UsersIcon size={16} className="text-emerald-400" />
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                                                Cashier Performance & Sales Volume
                                            </h3>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto border border-zinc-800/80 rounded-lg">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-400 uppercase">
                                                    <th className="px-4 py-3">Cashier</th>
                                                    <th className="px-4 py-3 text-center">Transactions</th>
                                                    <th className="px-4 py-3 text-right">Cash Collected</th>
                                                    <th className="px-4 py-3 text-right">GCash Collected</th>
                                                    <th className="px-4 py-3 text-right">Total Sales Issued</th>
                                                    <th className="px-4 py-3 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800/60 font-mono">
                                                {salesProfitData?.cashier_shifts?.map((c) => (
                                                    <tr key={c.cashier_id} className="hover:bg-zinc-800/30">
                                                        <td className="px-4 py-3 font-sans font-semibold text-zinc-100">
                                                            {c.cashier_name} <span className="text-[10px] text-zinc-500 font-normal">({c.role})</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center font-bold text-zinc-200">{c.transaction_count}</td>
                                                        <td className="px-4 py-3 text-right text-emerald-400">{formatCurrency(c.cash_collected)}</td>
                                                        <td className="px-4 py-3 text-right text-blue-400">{formatCurrency(c.gcash_collected)}</td>
                                                        <td className="px-4 py-3 text-right font-bold text-zinc-100">{formatCurrency(c.total_sales)}</td>
                                                        <td className="px-4 py-3 text-center font-sans">
                                                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
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
                                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Layers size={16} className="text-emerald-400" />
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                                            Sales by Category & Profit Margins
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        {salesProfitData?.category_sales?.map(cat => (
                                            <div key={cat.category} className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                                                <div className="text-xs font-bold text-zinc-200">{cat.category}</div>
                                                <div className="text-lg font-mono font-bold text-emerald-400 mt-1">
                                                    {formatCurrency(cat.total_revenue)}
                                                </div>
                                                <div className="text-[11px] text-zinc-400 mt-1">
                                                    {cat.total_qty_sold} units sold • Margin: <strong className="text-emerald-400">{cat.margin_pct}%</strong>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Itemized Sold Parts Table */}
                                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                        <div className="flex items-center gap-2">
                                            <Package size={16} className="text-emerald-400" />
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                                                Itemized Motorparts Sold ({filteredSoldProducts.length} items)
                                            </h3>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Search by part name, brand, or SKU..."
                                            value={productSalesSearch}
                                            onChange={(e) => setProductSalesSearch(e.target.value)}
                                            className="bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 w-full sm:w-72"
                                        />
                                    </div>

                                    <div className="overflow-x-auto border border-zinc-800/80 rounded-lg">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-400 uppercase">
                                                    <th className="px-4 py-3">Item Code</th>
                                                    <th className="px-4 py-3">Part Name & Brand</th>
                                                    <th className="px-4 py-3">Category</th>
                                                    <th className="px-4 py-3 text-center">Qty Sold</th>
                                                    <th className="px-4 py-3 text-right">Avg Cost</th>
                                                    <th className="px-4 py-3 text-right">Avg Retail</th>
                                                    <th className="px-4 py-3 text-right">Revenue</th>
                                                    <th className="px-4 py-3 text-right">Gross Profit</th>
                                                    <th className="px-4 py-3 text-center">Margin</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800/60 font-mono">
                                                {filteredSoldProducts.map(p => (
                                                    <tr key={p.product_id} className="hover:bg-zinc-800/30">
                                                        <td className="px-4 py-3 text-zinc-400">{p.part_number}</td>
                                                        <td className="px-4 py-3 font-sans">
                                                            <div className="font-semibold text-zinc-100">{p.product_name}</div>
                                                            <div className="text-[10px] text-zinc-500">{p.brand}</div>
                                                        </td>
                                                        <td className="px-4 py-3 font-sans text-zinc-400">{p.category}</td>
                                                        <td className="px-4 py-3 text-center font-bold text-zinc-200">{p.total_qty_sold}</td>
                                                        <td className="px-4 py-3 text-right text-zinc-400">{formatCurrency(p.avg_unit_cost)}</td>
                                                        <td className="px-4 py-3 text-right text-zinc-200">{formatCurrency(p.avg_unit_price)}</td>
                                                        <td className="px-4 py-3 text-right text-emerald-400 font-bold">{formatCurrency(p.total_revenue)}</td>
                                                        <td className="px-4 py-3 text-right text-zinc-100 font-bold">{formatCurrency(p.total_gross_profit)}</td>
                                                        <td className="px-4 py-3 text-center font-bold text-emerald-400">{p.margin_pct}%</td>
                                                    </tr>
                                                ))}
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
                            <div className="space-y-5">
                                {/* Velocity Summary Alert */}
                                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                            <AlertOctagon size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-zinc-100">
                                                Inventory Velocity & Shelf Capital Analysis
                                            </h3>
                                            <p className="text-xs text-zinc-400 mt-0.5">
                                                Dead stock tied-up capital: <strong className="font-mono text-amber-300">{formatCurrency(fastDeadStockData?.dead_stock?.total_capital_tied_up || 0)}</strong> across <strong className="font-mono text-amber-300">{fastDeadStockData?.dead_stock?.total_units || 0}</strong> unsold shelf units.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Velocity Filter Buttons */}
                                    <div className="flex gap-2">
                                        {[
                                            { id: 'ALL', label: 'All Items' },
                                            { id: 'FAST', label: `🚀 Fast-Moving (${fastDeadStockData?.fast_moving?.count || 0})` },
                                            { id: 'SLOW', label: `🐢 Slow-Moving (${fastDeadStockData?.slow_moving?.count || 0})` },
                                            { id: 'DEAD', label: `🛑 Dead Stock (${fastDeadStockData?.dead_stock?.count || 0})` },
                                        ].map(btn => (
                                            <button
                                                key={btn.id}
                                                type="button"
                                                onClick={() => setVelocityFilter(btn.id)}
                                                className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-colors ${
                                                    velocityFilter === btn.id
                                                        ? 'bg-emerald-600 text-white'
                                                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                                                }`}
                                            >
                                                {btn.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Fast-Moving Stock Section */}
                                {(velocityFilter === 'ALL' || velocityFilter === 'FAST') && (
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp size={16} className="text-emerald-400" />
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                                                    Fast-Moving Stock (High Weekly Turnover • Never Run Out)
                                                </h3>
                                            </div>
                                            <span className="text-xs font-mono text-zinc-400">
                                                {fastDeadStockData?.fast_moving?.count || 0} Parts
                                            </span>
                                        </div>

                                        <div className="overflow-x-auto border border-zinc-800/80 rounded-lg">
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead>
                                                    <tr className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-400 uppercase">
                                                        <th className="px-4 py-2.5">Rank</th>
                                                        <th className="px-4 py-2.5">Part Name & SKU</th>
                                                        <th className="px-4 py-2.5">Category</th>
                                                        <th className="px-4 py-2.5 text-center">Net Sold</th>
                                                        <th className="px-4 py-2.5 text-center">Sellable Stock</th>
                                                        <th className="px-4 py-2.5 text-right">Revenue</th>
                                                        <th className="px-4 py-2.5 text-right">Profit</th>
                                                        <th className="px-4 py-2.5">Restock Action Advice</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-800/60 font-mono">
                                                    {fastDeadStockData?.fast_moving?.items?.map(p => (
                                                        <tr key={p.product_id} className="hover:bg-zinc-800/30">
                                                            <td className="px-4 py-3 font-bold text-emerald-400">#{p.rank}</td>
                                                            <td className="px-4 py-3 font-sans">
                                                                <div className="font-semibold text-zinc-100">{p.part_name}</div>
                                                                <div className="text-[10px] text-zinc-500">{p.sku} • {p.brand}</div>
                                                            </td>
                                                            <td className="px-4 py-3 font-sans text-zinc-400">{p.category}</td>
                                                            <td className="px-4 py-3 text-center font-bold text-emerald-400">{p.net_qty_sold}</td>
                                                            <td className="px-4 py-3 text-center font-bold text-zinc-200">{p.sellable_stock}</td>
                                                            <td className="px-4 py-3 text-right font-bold text-zinc-100">{formatCurrency(p.revenue_generated)}</td>
                                                            <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatCurrency(p.estimated_profit)}</td>
                                                            <td className="px-4 py-3 font-sans">
                                                                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
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
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
                                            <div className="flex items-center gap-2">
                                                <Clock size={16} className="text-amber-400" />
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                                                    Slow-Moving Stock (Sold only 1–2 times in last 30–60 days)
                                                </h3>
                                            </div>
                                            <span className="text-xs font-mono text-zinc-400">
                                                {fastDeadStockData?.slow_moving?.count || 0} Parts
                                            </span>
                                        </div>

                                        <div className="overflow-x-auto border border-zinc-800/80 rounded-lg">
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead>
                                                    <tr className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-400 uppercase">
                                                        <th className="px-4 py-2.5">Part Name & SKU</th>
                                                        <th className="px-4 py-2.5">Category</th>
                                                        <th className="px-4 py-2.5 text-center">Net Sold</th>
                                                        <th className="px-4 py-2.5 text-center">Shelf Stock</th>
                                                        <th className="px-4 py-2.5 text-right">Supplier Cost</th>
                                                        <th className="px-4 py-2.5 text-right">Retail Price</th>
                                                        <th className="px-4 py-2.5">Action Advice</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-800/60 font-mono">
                                                    {fastDeadStockData?.slow_moving?.items?.map(p => (
                                                        <tr key={p.product_id} className="hover:bg-zinc-800/30">
                                                            <td className="px-4 py-3 font-sans">
                                                                <div className="font-semibold text-zinc-100">{p.part_name}</div>
                                                                <div className="text-[10px] text-zinc-500">{p.sku} • {p.brand}</div>
                                                            </td>
                                                            <td className="px-4 py-3 font-sans text-zinc-400">{p.category}</td>
                                                            <td className="px-4 py-3 text-center font-bold text-amber-400">{p.net_qty_sold}</td>
                                                            <td className="px-4 py-3 text-center font-bold text-zinc-200">{p.sellable_stock}</td>
                                                            <td className="px-4 py-3 text-right text-zinc-400">{formatCurrency(p.supplier_cost)}</td>
                                                            <td className="px-4 py-3 text-right text-zinc-200">{formatCurrency(p.retail_price)}</td>
                                                            <td className="px-4 py-3 font-sans">
                                                                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
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
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
                                            <div className="flex items-center gap-2">
                                                <AlertOctagon size={16} className="text-rose-400" />
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                                                    Dead Stock (Zero Sales in 90+ Days • Puhunan Tied Up)
                                                </h3>
                                            </div>
                                            <span className="text-xs font-mono font-bold text-rose-400">
                                                Tied Up: {formatCurrency(fastDeadStockData?.dead_stock?.total_capital_tied_up || 0)}
                                            </span>
                                        </div>

                                        <div className="overflow-x-auto border border-zinc-800/80 rounded-lg">
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead>
                                                    <tr className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-400 uppercase">
                                                        <th className="px-4 py-2.5">Part Name & SKU</th>
                                                        <th className="px-4 py-2.5">Category</th>
                                                        <th className="px-4 py-2.5 text-center">Unsold Units</th>
                                                        <th className="px-4 py-2.5 text-right">Supplier Cost (Puhunan)</th>
                                                        <th className="px-4 py-2.5 text-right">Capital Tied Up</th>
                                                        <th className="px-4 py-2.5 text-center">Days Inactive</th>
                                                        <th className="px-4 py-2.5">Clearance Recommendation</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-800/60 font-mono">
                                                    {fastDeadStockData?.dead_stock?.items?.map(p => (
                                                        <tr key={p.product_id} className="hover:bg-zinc-800/30">
                                                            <td className="px-4 py-3 font-sans">
                                                                <div className="font-semibold text-zinc-100">{p.part_name}</div>
                                                                <div className="text-[10px] text-zinc-500">{p.sku} • {p.brand}</div>
                                                            </td>
                                                            <td className="px-4 py-3 font-sans text-zinc-400">{p.category}</td>
                                                            <td className="px-4 py-3 text-center font-bold text-rose-400">{p.sellable_stock}</td>
                                                            <td className="px-4 py-3 text-right text-zinc-400">{formatCurrency(p.supplier_cost)}</td>
                                                            <td className="px-4 py-3 text-right font-bold text-rose-400">{formatCurrency(p.capital_tied_up)}</td>
                                                            <td className="px-4 py-3 text-center text-zinc-400">{p.days_inactive} days</td>
                                                            <td className="px-4 py-3 font-sans text-amber-300 text-[11px]">
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
                            <div className="space-y-6">
                                {/* Cash Flow Comparison Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Cash Drawer Flow */}
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                        <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold mb-2">
                                            <span>Cash Drawer Flow</span>
                                            <Wallet size={16} className="text-emerald-400" />
                                        </div>
                                        <div className="space-y-1.5 text-xs font-mono">
                                            <div className="flex justify-between text-emerald-400">
                                                <span>Total Cash In:</span>
                                                <span className="font-bold">+{formatCurrency(cashflowData?.cash_flow?.drawer?.cash_in || 0)}</span>
                                            </div>
                                            <div className="flex justify-between text-rose-400">
                                                <span>Total Cash Out:</span>
                                                <span className="font-bold">-{formatCurrency(cashflowData?.cash_flow?.drawer?.cash_out || 0)}</span>
                                            </div>
                                            <div className="border-t border-zinc-800 pt-2 flex justify-between font-bold text-sm text-zinc-100">
                                                <span>Net Drawer Flow:</span>
                                                <span className={Number(cashflowData?.cash_flow?.drawer?.net_flow || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                    {formatCurrency(cashflowData?.cash_flow?.drawer?.net_flow || 0)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* GCash / Bank Flow */}
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                        <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold mb-2">
                                            <span>GCash / Bank Flow</span>
                                            <Landmark size={16} className="text-blue-400" />
                                        </div>
                                        <div className="space-y-1.5 text-xs font-mono">
                                            <div className="flex justify-between text-blue-400">
                                                <span>Total GCash In:</span>
                                                <span className="font-bold">+{formatCurrency(cashflowData?.cash_flow?.gcash_bank?.cash_in || 0)}</span>
                                            </div>
                                            <div className="flex justify-between text-rose-400">
                                                <span>Total GCash Out:</span>
                                                <span className="font-bold">-{formatCurrency(cashflowData?.cash_flow?.gcash_bank?.cash_out || 0)}</span>
                                            </div>
                                            <div className="border-t border-zinc-800 pt-2 flex justify-between font-bold text-sm text-zinc-100">
                                                <span>Net GCash Flow:</span>
                                                <span className={Number(cashflowData?.cash_flow?.gcash_bank?.net_flow || 0) >= 0 ? 'text-blue-400' : 'text-rose-400'}>
                                                    {formatCurrency(cashflowData?.cash_flow?.gcash_bank?.net_flow || 0)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Overall Store Net Cash Flow */}
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                        <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold mb-2">
                                            <span>Combined Business Net Flow</span>
                                            <TrendingUp size={16} className="text-cyan-400" />
                                        </div>
                                        <div className="space-y-1.5 text-xs font-mono">
                                            <div className="flex justify-between text-zinc-300">
                                                <span>Total In (All Channels):</span>
                                                <span className="font-bold">+{formatCurrency(cashflowData?.cash_flow?.combined?.total_in || 0)}</span>
                                            </div>
                                            <div className="flex justify-between text-rose-400">
                                                <span>Total Out (All Channels):</span>
                                                <span className="font-bold">-{formatCurrency(cashflowData?.cash_flow?.combined?.total_out || 0)}</span>
                                            </div>
                                            <div className="border-t border-zinc-800 pt-2 flex justify-between font-bold text-sm">
                                                <span className="text-zinc-200">Total Net Cash Flow:</span>
                                                <span className={Number(cashflowData?.cash_flow?.combined?.net_flow || 0) >= 0 ? 'text-emerald-400 font-extrabold' : 'text-rose-400 font-extrabold'}>
                                                    {formatCurrency(cashflowData?.cash_flow?.combined?.net_flow || 0)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Operating Expenses Ledger Table */}
                                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                        <div className="flex items-center gap-2">
                                            <Truck size={16} className="text-amber-400" />
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                                                Store Operating Expenses Ledger
                                            </h3>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-mono font-bold text-amber-400">
                                                Total: {formatCurrency(cashflowData?.expenses?.total_amount || 0)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('add_expense')}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    backgroundColor: '#10b981', color: '#ffffff',
                                                    fontSize: '11px', fontWeight: 'bold',
                                                    padding: '6px 14px', borderRadius: '6px',
                                                    border: 'none', cursor: 'pointer',
                                                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
                                                }}
                                            >
                                                <Plus size={14} />
                                                <span>+ Add Store Expense</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto border border-zinc-800/80 rounded-lg">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-400 uppercase">
                                                    <th className="px-4 py-3">Date</th>
                                                    <th className="px-4 py-3">Category</th>
                                                    <th className="px-4 py-3">Expense Title / Item</th>
                                                    <th className="px-4 py-3">Payment Source</th>
                                                    <th className="px-4 py-3 text-right">Amount</th>
                                                    <th className="px-4 py-3">Recorded By</th>
                                                    <th className="px-4 py-3">Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800/60 font-mono">
                                                {(!cashflowData?.expenses?.items || cashflowData.expenses.items.length === 0) ? (
                                                    <tr>
                                                        <td colSpan={7} className="px-4 py-8 text-center text-zinc-500 font-sans">
                                                            No operating expenses recorded in this period.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    cashflowData.expenses.items.map(e => (
                                                        <tr key={e.id} className="hover:bg-zinc-800/30">
                                                            <td className="px-4 py-3 font-sans text-zinc-300 text-[11px]">
                                                                {e.expense_date}
                                                            </td>
                                                            <td className="px-4 py-3 font-sans font-semibold text-zinc-200">
                                                                {e.category}
                                                            </td>
                                                            <td className="px-4 py-3 font-sans font-bold text-zinc-100">
                                                                {e.title}
                                                            </td>
                                                            <td className="px-4 py-3 font-sans">
                                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                                                    e.payment_source === 'cash_drawer'
                                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                                }`}>
                                                                    {e.payment_source === 'cash_drawer' ? 'Cash Drawer' : 'GCash / Bank'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-bold text-rose-400">
                                                                {formatCurrency(e.amount)}
                                                            </td>
                                                            <td className="px-4 py-3 font-sans text-zinc-400">
                                                                {e.recorded_by}
                                                            </td>
                                                            <td className="px-4 py-3 font-sans text-zinc-400 text-[11px]">
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
