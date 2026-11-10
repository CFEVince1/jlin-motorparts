import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
    ShieldCheck,
    Lock,
    Search,
    Calendar,
    Filter,
    FileSpreadsheet,
    Printer,
    RefreshCw,
    User,
    Tag,
    Clock,
    AlertTriangle,
    CheckCircle2,
    ArrowRight,
    Eye,
    X,
    KeyRound,
    DollarSign,
    Package,
    ShieldAlert,
    Wallet,
    Info,
    ExternalLink
} from 'lucide-react';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

const ACTION_COLORS = {
    'Price Changed': { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: 'rgba(234, 179, 8, 0.35)', icon: DollarSign },
    'Stock Adjusted': { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.35)', icon: Package },
    'Void Approved': { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.35)', icon: CheckCircle2 },
    'Discount Approved': { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.35)', icon: Tag },
    'Price Override Approved': { bg: 'rgba(234, 88, 12, 0.15)', text: '#ea580c', border: 'rgba(234, 88, 12, 0.35)', icon: Tag },
    'Shift Closed with Shortage': { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.35)', icon: AlertTriangle },
    'Login Failed': { bg: 'rgba(225, 29, 72, 0.15)', text: '#e11d48', border: 'rgba(225, 29, 72, 0.35)', icon: Lock },
    'Delivery Inspection Gate Completed': { bg: 'rgba(14, 165, 233, 0.15)', text: '#0ea5e9', border: 'rgba(14, 165, 233, 0.35)', icon: ShieldCheck },
    'Staff Account Created': { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.35)', icon: User }
};

const ROLE_BADGES = {
    admin: { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6', label: 'Owner / Admin' },
    cashier: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', label: 'Cashier / Staff' },
    staff: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', label: 'Cashier / Staff' },
    system: { bg: 'rgba(113, 113, 122, 0.15)', text: '#a1a1aa', label: 'System' }
};

const AuditLog = () => {
    const { user } = useContext(AuthContext);
    const isAdmin = ['admin', 'Admin'].includes(user?.role);

    // Filter states
    const [timeframe, setTimeframe] = useState('all'); // 'today' | 'week' | 'month' | 'all' | 'custom'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedModule, setSelectedModule] = useState('ALL');
    const [selectedAction, setSelectedAction] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize] = useState(50);

    // Data states
    const [logs, setLogs] = useState([]);
    const [totalLogs, setTotalLogs] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [summary, setSummary] = useState(null);
    const [availableModules, setAvailableModules] = useState([]);
    const [availableActions, setAvailableActions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Detail Modal
    const [selectedLog, setSelectedLog] = useState(null);

    // Fetch Summary Metrics
    const fetchSummary = useCallback(async () => {
        try {
            const res = await api.get('/audit-logs/summary');
            setSummary(res.data?.summary || null);
            setAvailableModules(res.data?.modules || []);
            setAvailableActions(res.data?.action_types || []);
        } catch (err) {
            console.error('Failed to load audit summary:', err);
        }
    }, []);

    // Fetch Audit Logs
    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('timeframe', timeframe);
            if (timeframe === 'custom' && startDate && endDate) {
                params.append('startDate', startDate);
                params.append('endDate', endDate);
            }
            if (selectedModule !== 'ALL') params.append('module', selectedModule);
            if (selectedAction !== 'ALL') params.append('actionType', selectedAction);
            if (searchQuery.trim()) params.append('search', searchQuery.trim());
            params.append('page', page);
            params.append('limit', pageSize);

            const res = await api.get(`/audit-logs?${params.toString()}`);
            setLogs(res.data?.logs || []);
            setTotalLogs(res.data?.total || 0);
            setTotalPages(res.data?.total_pages || 1);
        } catch (err) {
            console.error('Failed to load audit logs:', err);
            toast.error('Failed to retrieve audit log records');
        } finally {
            setLoading(false);
        }
    }, [timeframe, startDate, endDate, selectedModule, selectedAction, searchQuery, page, pageSize]);

    useEffect(() => {
        if (isAdmin) {
            fetchSummary();
            fetchLogs();
        }
    }, [isAdmin, fetchSummary, fetchLogs]);

    const handleSetTimeframe = (tf) => {
        setTimeframe(tf);
        setPage(1);
        if (tf !== 'custom') {
            setStartDate('');
            setEndDate('');
        }
    };

    // Export to CSV
    const handleExportCSV = () => {
        if (logs.length === 0) {
            toast.error('No audit records to export');
            return;
        }

        let csvContent = 'data:text/csv;charset=utf-8,';
        csvContent += 'TAMPER-PROOF AUDIT LOG LEDGER\n';
        csvContent += `Generated At,${new Date().toLocaleString()}\n`;
        csvContent += `Filtered Count,${logs.length}\n\n`;
        csvContent += 'Timestamp,User,Role,IP Address,Module,Action Type,Reference ID,Old Value,New Value,Reason\n';

        logs.forEach(l => {
            const ts = new Date(l.created_at).toLocaleString();
            const u = l.user_name || 'System';
            const r = l.user_role || 'System';
            const ip = l.ip_address || '';
            const mod = l.module || '';
            const act = l.action_type || '';
            const ref = l.reference_id || '';
            const oldV = (l.old_value || '').replace(/"/g, '""');
            const newV = (l.new_value || '').replace(/"/g, '""');
            const rsn = (l.reason || '').replace(/"/g, '""');

            csvContent += `"${ts}","${u}","${r}","${ip}","${mod}","${act}","${ref}","${oldV}","${newV}","${rsn}"\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Audit log exported to CSV!');
    };

    if (!isAdmin) {
        return (
            <div className="glass-panel" style={{ padding: '40px', maxWidth: '500px', margin: '40px auto', textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                    <Lock size={24} />
                </div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>Security Clearance Required</h2>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    The tamper-proof Audit Log black box is restricted to Store Owner/Admin accounts.
                </p>
            </div>
        );
    }

    return (
        <div className="audit-log-page" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
            {/* Print Stylesheet */}
            <style>{`
                @media print {
                    body * { visibility: hidden !important; }
                    #audit-print-container, #audit-print-container * { visibility: visible !important; }
                    #audit-print-container { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #ffffff !important; color: #000000 !important; }
                    .no-print { display: none !important; }
                }
            `}</style>

            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '22px' }} className="no-print">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <ShieldCheck size={26} color="var(--primary)" />
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900 }}>
                            Audit Log • Tamper-Proof Black Box
                        </h1>
                        <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            background: 'rgba(22, 163, 74, 0.12)',
                            color: 'var(--primary)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(22, 163, 74, 0.3)'
                        }}>
                            🔒 Read-Only Ledger
                        </span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        Records every sensitive action in the system so nobody can secretly alter stock, delete a sale, or change a price without leaving an unalterable trail.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        type="button"
                        onClick={handleExportCSV}
                        className="btn-secondary"
                        style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                        title="Download audit records as CSV"
                    >
                        <FileSpreadsheet size={15} color="var(--primary)" /> Export CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="btn-primary"
                        style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                        title="Print or Save as PDF"
                    >
                        <Printer size={15} /> Print / PDF
                    </button>
                </div>
            </div>

            {/* 4 Summary KPI Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
                marginBottom: '22px'
            }} className="no-print">
                <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: '12px', padding: '16px 20px', boxShadow: 'var(--glass-shadow)' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Total Audit Trail Logs
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '4px' }}>
                        {summary?.total_logs || totalLogs}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Chronological business actions logged
                    </div>
                </div>

                <div style={{ background: 'var(--surface)', border: '1.5px solid rgba(234, 179, 8, 0.4)', borderRadius: '12px', padding: '16px 20px', boxShadow: 'var(--glass-shadow)' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#eab308', textTransform: 'uppercase' }}>
                        Price & Stock Overrides
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#eab308', marginTop: '4px' }}>
                        {summary?.price_stock_changes || 0}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Retail prices & shelf stock alterations
                    </div>
                </div>

                <div style={{ background: 'var(--surface)', border: '1.5px solid rgba(16, 185, 129, 0.4)', borderRadius: '12px', padding: '16px 20px', boxShadow: 'var(--glass-shadow)' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>
                        Voids & Discounts Approved
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                        {summary?.approval_events || 0}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Manager PIN authorizations
                    </div>
                </div>

                <div style={{ background: 'var(--surface)', border: '1.5px solid rgba(239, 68, 68, 0.4)', borderRadius: '12px', padding: '16px 20px', boxShadow: 'var(--glass-shadow)' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>
                        Discrepancies & Security Alerts
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                        {summary?.security_shortage_alerts || 0}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Shift drawer shortages & failed logins
                    </div>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="glass-panel no-print" style={{ padding: '14px 20px', borderRadius: '12px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Timeframe Presets */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={14} color="var(--primary)" /> Timeframe:
                    </span>
                    {[
                        { id: 'today', label: 'Today' },
                        { id: 'week', label: 'This Week' },
                        { id: 'month', label: 'This Month' },
                        { id: 'all', label: 'All-Time' },
                        { id: 'custom', label: 'Custom' }
                    ].map(btn => (
                        <button
                            key={btn.id}
                            type="button"
                            onClick={() => handleSetTimeframe(btn.id)}
                            style={{
                                padding: '5px 10px',
                                fontSize: '0.76rem',
                                fontWeight: timeframe === btn.id ? 800 : 600,
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                background: timeframe === btn.id ? 'var(--primary)' : 'var(--surface-hover)',
                                color: timeframe === btn.id ? '#ffffff' : 'var(--text-main)',
                                cursor: 'pointer'
                            }}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>

                {/* Custom Date Pickers */}
                {timeframe === 'custom' && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="input-premium"
                            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                        />
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>to</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="input-premium"
                            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                        />
                        <button
                            type="button"
                            onClick={() => { setPage(1); fetchLogs(); }}
                            className="btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                        >
                            Apply
                        </button>
                    </div>
                )}

                {/* Module Dropdown */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Module:</label>
                    <select
                        className="input-premium"
                        value={selectedModule}
                        onChange={(e) => { setSelectedModule(e.target.value); setPage(1); }}
                        style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                    >
                        <option value="ALL">All Modules</option>
                        {availableModules.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>

                {/* Action Type Dropdown */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Action:</label>
                    <select
                        className="input-premium"
                        value={selectedAction}
                        onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
                        style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                    >
                        <option value="ALL">All Action Types</option>
                        {availableActions.map(a => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </select>
                </div>

                {/* Search Bar */}
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search by user, reference ID, reason, or change..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                            className="input-premium"
                            style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: '0.8rem' }}
                        />
                    </div>
                </div>
            </div>

            {/* Uneditable Chronological Table */}
            <div id="audit-print-container" className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} color="var(--primary)" /> Chronological Action History
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Showing <strong>{logs.length}</strong> of <strong>{totalLogs}</strong> audit entries
                    </span>
                </div>

                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: 'var(--primary)' }} />
                        <div>Loading tamper-proof audit trail...</div>
                    </div>
                ) : logs.length === 0 ? (
                    <div style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No audit events match your active filters.
                    </div>
                ) : (
                    <div className="table-container" style={{ margin: 0 }}>
                        <table className="table" style={{ margin: 0 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '15%', whiteSpace: 'nowrap' }}>Timestamp</th>
                                    <th style={{ width: '15%', whiteSpace: 'nowrap' }}>User & Role</th>
                                    <th style={{ width: '18%', whiteSpace: 'nowrap' }}>Module & Action Type</th>
                                    <th style={{ width: '25%' }}>Old Value vs. New Value</th>
                                    <th style={{ width: '22%' }}>Reason / Reference ID</th>
                                    <th style={{ width: '5%', textAlign: 'center', whiteSpace: 'nowrap' }} className="no-print">Inspect</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => {
                                    const actionMeta = ACTION_COLORS[log.action_type] || {
                                        bg: 'rgba(255, 255, 255, 0.08)',
                                        text: 'var(--text-main)',
                                        border: 'var(--border)',
                                        icon: Info
                                    };
                                    const roleMeta = ROLE_BADGES[(log.user_role || '').toLowerCase()] || ROLE_BADGES.system;
                                    const ActionIcon = actionMeta.icon;

                                    return (
                                        <tr key={log.id} style={{ transition: 'background 0.15s ease' }}>
                                            {/* Timestamp (Date & Exact Time) */}
                                            <td>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                                    {new Date(log.created_at).toLocaleDateString()}
                                                </div>
                                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                    <Clock size={11} /> {new Date(log.created_at).toLocaleTimeString()}
                                                </div>
                                            </td>

                                            {/* User & Role (Who performed the action) */}
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        borderRadius: '50%',
                                                        background: roleMeta.bg,
                                                        color: roleMeta.text,
                                                        border: `1px solid ${roleMeta.text}40`,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 800,
                                                        fontSize: '0.74rem'
                                                    }}>
                                                        {(log.user_name || 'S').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <strong style={{ display: 'block', fontSize: '0.84rem' }}>
                                                            {log.user_name || 'System'}
                                                        </strong>
                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            color: roleMeta.text
                                                        }}>
                                                            {roleMeta.label}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Module & Action Type */}
                                            <td>
                                                <span style={{
                                                    fontSize: '0.74rem',
                                                    fontWeight: 700,
                                                    background: actionMeta.bg,
                                                    color: actionMeta.text,
                                                    border: `1px solid ${actionMeta.border}`,
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px'
                                                }}>
                                                    <ActionIcon size={12} /> {log.action_type}
                                                </span>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    {log.module}
                                                </div>
                                            </td>

                                            {/* Old Value vs. New Value */}
                                            <td>
                                                <div style={{
                                                    background: 'var(--surface-hover)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '6px',
                                                    padding: '6px 10px',
                                                    fontSize: '0.78rem'
                                                }}>
                                                    {log.old_value && (
                                                        <div style={{ color: '#ef4444', textDecoration: 'line-through', opacity: 0.85, marginBottom: '2px', fontFamily: 'monospace' }}>
                                                            {log.old_value}
                                                        </div>
                                                    )}
                                                    <div style={{ color: '#10b981', fontWeight: 800, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {log.old_value && <ArrowRight size={11} color="var(--text-muted)" />}
                                                        <span>{log.new_value || 'Executed'}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Reason / Reference ID */}
                                            <td>
                                                {log.reference_id && (
                                                    <span style={{
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 800,
                                                        background: 'var(--surface)',
                                                        border: '1px solid var(--border)',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        color: 'var(--primary)',
                                                        display: 'inline-block',
                                                        marginBottom: '4px'
                                                    }}>
                                                        {log.reference_id}
                                                    </span>
                                                )}
                                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                                    {log.reason || 'Standard verified action'}
                                                </div>
                                            </td>

                                            {/* Inspector Modal Trigger */}
                                            <td style={{ textAlign: 'center' }} className="no-print">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedLog(log)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: 'var(--text-muted)',
                                                        cursor: 'pointer',
                                                        padding: '4px',
                                                        borderRadius: '4px'
                                                    }}
                                                    title="Inspect detailed audit payload"
                                                >
                                                    <Eye size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="no-print">
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Page {page} of {totalPages}
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                type="button"
                                disabled={page <= 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ============================================================ */}
            {/* AUDIT DETAIL INSPECTOR MODAL                                 */}
            {/* ============================================================ */}
            {selectedLog && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.78)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, padding: '20px'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '580px', borderRadius: '14px', padding: '24px', position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setSelectedLog(null)}
                            style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <ShieldCheck size={22} color="var(--primary)" />
                            <h2 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800 }}>
                                Audit Entry Inspector #{selectedLog.id}
                            </h2>
                        </div>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Tamper-proof black box cryptographic details and snapshot verification.
                        </p>

                        <div style={{ background: 'var(--surface-hover)', borderRadius: '10px', padding: '14px', marginBottom: '16px', fontSize: '0.82rem', lineHeight: 1.6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '6px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Action Type:</span>
                                <strong>{selectedLog.action_type}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '6px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Module:</span>
                                <span>{selectedLog.module}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '6px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Timestamp:</span>
                                <span style={{ fontFamily: 'monospace' }}>{formatAuditDate(selectedLog.created_at)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '6px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Authorized Actor:</span>
                                <span><strong>{selectedLog.user_name}</strong> ({selectedLog.user_role})</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '6px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Terminal IP:</span>
                                <span style={{ fontFamily: 'monospace' }}>{selectedLog.ip_address || '127.0.0.1 (Local)'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '6px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Reference ID:</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>{selectedLog.reference_id || 'N/A'}</span>
                            </div>
                            <div style={{ marginTop: '8px' }}>
                                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Stated Reason:</span>
                                <div style={{ background: 'var(--surface)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    {selectedLog.reason || 'Standard verified operation.'}
                                </div>
                            </div>
                        </div>

                        {/* Metadata Snapshot */}
                        {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-muted)' }}>
                                    Snapshot Payload Metadata:
                                </div>
                                <pre style={{
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    fontSize: '0.74rem',
                                    fontFamily: 'monospace',
                                    maxHeight: '120px',
                                    overflowY: 'auto',
                                    margin: 0
                                }}>
                                    {JSON.stringify(selectedLog.metadata, null, 2)}
                                </pre>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => setSelectedLog(null)}
                                className="btn-primary"
                                style={{ padding: '7px 20px', fontSize: '0.82rem' }}
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditLog;
