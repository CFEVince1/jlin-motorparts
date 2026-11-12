import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
    UserPlus, Trash2, Edit2, Eye, EyeOff,
    Users as UsersIcon, CheckCircle2, XCircle
} from 'lucide-react';
import Spinner from '../components/Spinner';

const ROLE_LABELS = {
    admin: { label: 'Owner / Admin', badge: '#8b5cf6', desc: 'Full control over pricing, inventory, approvals & financials' },
    cashier: { label: 'Cashier / Staff', badge: '#10b981', desc: 'POS counter sales checkout, shift cash register & receipt issuing' },
    staff: { label: 'Cashier / Staff', badge: '#10b981', desc: 'POS counter sales checkout, shift cash register & receipt issuing' }
};

const Users = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'staff';

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Modals & Form
    const [editingUser, setEditingUser] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    // Form state
    const [userForm, setUserForm] = useState({
        full_name: '',
        username: '',
        password: '',
        confirmPassword: '',
        role: 'cashier',
        is_active: 1
    });

    const handleTabChange = (tab) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            return next;
        });
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await api.get('/users');
            setUsers(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Failed to load users:', err);
            toast.error(err.response?.data?.message || 'Failed to load staff accounts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleOpenAddModal = () => {
        setEditingUser(null);
        setUserForm({
            full_name: '',
            username: '',
            password: '',
            confirmPassword: '',
            role: 'cashier',
            is_active: 1
        });
        setShowPassword(false);
        handleTabChange('add_staff');
    };

    const handleOpenEditModal = (u) => {
        setEditingUser(u);
        setUserForm({
            full_name: u.full_name || '',
            username: u.username || '',
            password: '',
            confirmPassword: '',
            role: (u.role || 'cashier').toLowerCase(),
            is_active: u.is_active !== undefined ? u.is_active : 1
        });
        setShowPassword(false);
        handleTabChange('add_staff');
    };

    const handleSaveUser = async (e) => {
        e.preventDefault();

        if (!userForm.username.trim() || userForm.username.trim().length < 3) {
            toast.error('Username must be at least 3 characters');
            return;
        }

        if (!editingUser && (!userForm.password || userForm.password.length < 6)) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        if (userForm.password && userForm.password !== userForm.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        try {
            const payload = {
                full_name: userForm.full_name.trim(),
                username: userForm.username.trim(),
                role: userForm.role,
                is_active: userForm.is_active ? 1 : 0
            };
            if (userForm.password) {
                payload.password = userForm.password;
            }

            if (editingUser) {
                await api.put(`/users/${editingUser.id}`, payload);
                toast.success(`User ${payload.username} updated successfully`);
            } else {
                await api.post('/users', payload);
                toast.success(`Staff account ${payload.username} created successfully`);
            }

            fetchUsers();
            handleTabChange('staff');
        } catch (err) {
            console.error('Failed to save staff account:', err);
            toast.error(err.response?.data?.message || 'Failed to save staff account');
        }
    };

    const handleToggleStatus = async (u) => {
        const nextStatus = u.is_active === 1 || u.is_active === undefined ? 0 : 1;
        const actionLabel = nextStatus === 1 ? 'activate' : 'deactivate';

        if (!window.confirm(`Are you sure you want to ${actionLabel} account @${u.username}?`)) {
            return;
        }

        try {
            await api.put(`/users/${u.id}`, { is_active: nextStatus });
            toast.success(`Account @${u.username} ${nextStatus === 1 ? 'activated' : 'deactivated'}`);
            fetchUsers();
        } catch (err) {
            console.error('Failed to toggle status:', err);
            toast.error(err.response?.data?.message || 'Failed to change account status');
        }
    };

    const handleDeleteUser = async (u) => {
        if (!window.confirm(`Delete staff account @${u.username}? This action cannot be undone.`)) {
            return;
        }

        try {
            await api.delete(`/users/${u.id}`);
            toast.success(`Account @${u.username} deleted`);
            fetchUsers();
        } catch (err) {
            console.error('Failed to delete user:', err);
            toast.error(err.response?.data?.message || 'Failed to delete staff account');
        }
    };

    // Filtered users list
    const filteredUsers = users.filter(u => {
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery = !q ||
            (u.full_name && u.full_name.toLowerCase().includes(q)) ||
            (u.username && u.username.toLowerCase().includes(q));

        const r = (u.role || '').toLowerCase();
        const matchesRole = roleFilter === 'ALL' ||
            (roleFilter === 'ADMIN' && r === 'admin') ||
            (roleFilter === 'CASHIER' && (r === 'cashier' || r === 'staff'));

        const isActive = u.is_active === 1 || u.is_active === undefined;
        const isOnline = Boolean(u.is_online);

        const matchesStatus = statusFilter === 'ALL' ||
            (statusFilter === 'ACTIVE' && isOnline) ||
            (statusFilter === 'OFFLINE' && isActive && !isOnline) ||
            (statusFilter === 'DEACTIVATED' && !isActive);

        return matchesQuery && matchesRole && matchesStatus;
    });

    const onlineCount = users.filter(u => u.is_online).length;
    const offlineCount = users.filter(u => (u.is_active === 1 || u.is_active === undefined) && !u.is_online).length;
    const deactivatedCount = users.filter(u => u.is_active === 0).length;

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.65rem', fontWeight: 800 }}>
                        <UsersIcon size={28} color="var(--primary)" /> Staff & Users Management
                    </h1>
                    <p style={{ margin: '4px 0 0 38px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Manage authorized shop staff accounts, assign roles, and control active login credentials.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={handleOpenAddModal}
                        className="btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontWeight: 700 }}
                    >
                        <UserPlus size={16} /> + Add New Staff Account
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border)',
                marginBottom: '22px',
                gap: '8px'
            }}>
                <button
                    type="button"
                    onClick={() => handleTabChange('staff')}
                    style={{
                        padding: '12px 20px',
                        fontSize: '0.92rem',
                        fontWeight: activeTab === 'staff' ? 800 : 600,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'staff' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'staff' ? 'var(--text-main)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <UsersIcon size={18} color={activeTab === 'staff' ? 'var(--primary)' : 'inherit'} /> Staff Accounts ({users.length})
                </button>

                <button
                    type="button"
                    onClick={() => {
                        handleOpenAddModal();
                        handleTabChange('add_staff');
                    }}
                    style={{
                        padding: '12px 20px',
                        fontSize: '0.92rem',
                        fontWeight: activeTab === 'add_staff' ? 800 : 600,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'add_staff' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'add_staff' ? 'var(--text-main)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <UserPlus size={18} color={activeTab === 'add_staff' ? 'var(--primary)' : 'inherit'} /> {editingUser ? 'Edit Staff Account' : '+ Add New Staff Account'}
                </button>
            </div>

            {/* ============================================================ */}
            {/* TAB 1: STAFF ACCOUNTS                                        */}
            {/* ============================================================ */}
            {activeTab === 'staff' && (
                <div>
                    {/* Summary KPI Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '14px',
                        marginBottom: '22px'
                    }}>
                        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: '12px', padding: '16px 20px' }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Total Staff Users
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '4px' }}>
                                {users.length}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Registered store logins
                            </div>
                        </div>

                        <div style={{ background: 'var(--surface)', border: '1.5px solid rgba(16, 185, 129, 0.4)', borderRadius: '12px', padding: '16px 20px' }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981', display: 'inline-block' }}></span>
                                Active (Logged In)
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                                {onlineCount}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Logged in right now
                            </div>
                        </div>

                        <div style={{ background: 'var(--surface)', border: '1.5px solid rgba(148, 163, 184, 0.35)', borderRadius: '12px', padding: '16px 20px' }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748b', display: 'inline-block' }}></span>
                                Offline Staff
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#94a3b8', marginTop: '4px' }}>
                                {offlineCount}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Not currently logged in
                            </div>
                        </div>

                        <div style={{ background: 'var(--surface)', border: '1.5px solid rgba(239, 68, 68, 0.4)', borderRadius: '12px', padding: '16px 20px' }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>
                                Deactivated Accounts
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                                {deactivatedCount}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Login access revoked
                            </div>
                        </div>

                        <div style={{ background: 'var(--surface)', border: '1.5px solid rgba(139, 92, 246, 0.4)', borderRadius: '12px', padding: '16px 20px' }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase' }}>
                                Role Tiers
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', marginTop: '8px', lineHeight: 1.4 }}>
                                👑 <strong>{users.filter(u => (u.role || '').toLowerCase() === 'admin').length}</strong> Admin • 
                                💵 <strong>{users.filter(u => (u.role || '').toLowerCase() !== 'admin').length}</strong> Cashier / Staff
                            </div>
                        </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="glass-panel" style={{ padding: '14px 20px', borderRadius: '12px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                            <input
                                type="text"
                                className="input-premium"
                                placeholder="Search by staff name or username..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Role:</label>
                            <select
                                className="input-premium"
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                                style={{ padding: '7px 10px', fontSize: '0.82rem' }}
                            >
                                <option value="ALL">All Roles</option>
                                <option value="ADMIN">Owner / Admin</option>
                                <option value="CASHIER">Cashier / Staff</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status:</label>
                            <select
                                className="input-premium"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                style={{ padding: '7px 10px', fontSize: '0.82rem' }}
                            >
                                <option value="ALL">All Status</option>
                                <option value="ACTIVE">Active (Logged In)</option>
                                <option value="OFFLINE">Offline</option>
                                <option value="DEACTIVATED">Deactivated</option>
                            </select>
                        </div>
                    </div>

                    {/* Staff Accounts Table */}
                    <div className="glass-panel" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: '40px', textAlign: 'center' }}><Spinner /></div>
                        ) : filteredUsers.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No staff accounts matched your filters.
                            </div>
                        ) : (
                            <div className="table-container" style={{ margin: 0 }}>
                                <table className="table" style={{ margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ whiteSpace: 'nowrap' }}>Staff Member</th>
                                            <th style={{ whiteSpace: 'nowrap' }}>Username</th>
                                            <th style={{ whiteSpace: 'nowrap' }}>Role & Duties</th>
                                            <th style={{ whiteSpace: 'nowrap' }}>Account & Login Status</th>
                                            <th style={{ whiteSpace: 'nowrap' }}>Created Date</th>
                                            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map(u => {
                                            const roleMeta = ROLE_LABELS[(u.role || '').toLowerCase()] || ROLE_LABELS.cashier;
                                            const isActive = u.is_active === 1 || u.is_active === undefined;
                                            const isOnline = Boolean(u.is_online);

                                            return (
                                                <tr key={u.id} style={{ opacity: isActive ? 1 : 0.65 }}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{
                                                                width: '34px',
                                                                height: '34px',
                                                                borderRadius: '50%',
                                                                background: roleMeta.badge,
                                                                color: '#ffffff',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontWeight: 800,
                                                                fontSize: '0.85rem'
                                                            }}>
                                                                {(u.full_name || u.username || 'U').charAt(0).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <strong style={{ display: 'block', fontSize: '0.88rem' }}>
                                                                    {u.full_name || u.username}
                                                                </strong>
                                                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                                    ID #{u.id}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)' }}>
                                                            @{u.username}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: '0.74rem',
                                                            fontWeight: 700,
                                                            background: `${roleMeta.badge}20`,
                                                            color: roleMeta.badge,
                                                            border: `1px solid ${roleMeta.badge}50`,
                                                            padding: '2px 8px',
                                                            borderRadius: '6px'
                                                        }}>
                                                            {roleMeta.label}
                                                        </span>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                            {roleMeta.desc}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {!isActive ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleStatus(u)}
                                                                style={{
                                                                    background: 'rgba(239, 68, 68, 0.12)',
                                                                    color: '#ef4444',
                                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                    borderRadius: '12px',
                                                                    padding: '3px 10px',
                                                                    fontSize: '0.74rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                                title="Account deactivated. Click to re-activate."
                                                            >
                                                                <XCircle size={12} />
                                                                Deactivated
                                                            </button>
                                                        ) : isOnline ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleStatus(u)}
                                                                style={{
                                                                    background: 'rgba(16, 185, 129, 0.12)',
                                                                    color: '#10b981',
                                                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                                                    borderRadius: '12px',
                                                                    padding: '3px 10px',
                                                                    fontSize: '0.74rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px'
                                                                }}
                                                                title="User is currently logged in. Click to deactivate account."
                                                            >
                                                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981', display: 'inline-block' }}></span>
                                                                Active
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleStatus(u)}
                                                                style={{
                                                                    background: 'rgba(148, 163, 184, 0.10)',
                                                                    color: '#94a3b8',
                                                                    border: '1px solid rgba(148, 163, 184, 0.25)',
                                                                    borderRadius: '12px',
                                                                    padding: '3px 10px',
                                                                    fontSize: '0.74rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px'
                                                                }}
                                                                title="User is offline (not logged in). Click to deactivate account."
                                                            >
                                                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#64748b', display: 'inline-block' }}></span>
                                                                Offline
                                                            </button>
                                                        )}
                                                        {u.active_shift_code && (
                                                            <div style={{ fontSize: '0.70rem', color: '#10b981', fontWeight: 600, marginTop: '2px' }}>
                                                                Shift: {u.active_shift_code}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                                                    </td>
                                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'inline-flex', gap: '5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenEditModal(u)}
                                                                className="btn-secondary"
                                                                style={{ padding: '4px 8px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                <Edit2 size={12} /> Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteUser(u)}
                                                                style={{
                                                                    background: 'rgba(239, 68, 68, 0.12)',
                                                                    color: '#ef4444',
                                                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                                                    borderRadius: '6px',
                                                                    padding: '4px 8px',
                                                                    fontSize: '0.74rem',
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* TAB: ADD / EDIT STAFF ACCOUNT FORM                           */}
            {/* ============================================================ */}
            {activeTab === 'add_staff' && (
                <div style={{ maxWidth: '620px', margin: '0 auto 24px auto' }}>
                    <div className="glass-panel" style={{ borderRadius: '14px', padding: '26px', border: '1.5px solid var(--primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <UserPlus size={24} color="var(--primary)" />
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                                        {editingUser ? `Edit Staff Account (@${editingUser.username})` : 'Create New Staff Account'}
                                    </h2>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                        Configure credentials, assign role, and manage staff account status.
                                    </p>
                                </div>
                            </div>
                            {editingUser && (
                                <button
                                    type="button"
                                    onClick={handleOpenAddModal}
                                    className="btn-secondary"
                                    style={{ fontSize: '0.76rem', padding: '4px 10px' }}
                                >
                                    Switch to New
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleSaveUser}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Full Name *:
                                </label>
                                <input
                                    type="text"
                                    className="input-premium"
                                    placeholder="e.g. Maria Santos"
                                    value={userForm.full_name}
                                    onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                                    required
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                        Username *:
                                    </label>
                                    <input
                                        type="text"
                                        className="input-premium"
                                        placeholder="mariasantos"
                                        value={userForm.username}
                                        onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                                        required
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                        Assigned Role *:
                                    </label>
                                    <select
                                        className="input-premium"
                                        value={userForm.role}
                                        onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                                    >
                                        <option value="cashier">Cashier / Staff</option>
                                        <option value="admin">Admin / Store Owner (Full Access)</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                        {editingUser ? 'New Password (Optional):' : 'Password *: *'}
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            className="input-premium"
                                            placeholder={editingUser ? 'Leave blank to keep current' : 'Min 6 characters'}
                                            value={userForm.password}
                                            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                                            style={{ width: '100%', padding: '8px 34px 8px 12px', fontSize: '0.88rem' }}
                                            required={!editingUser}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                        >
                                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                        Confirm Password:
                                    </label>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="input-premium"
                                        placeholder="Repeat password"
                                        value={userForm.confirmPassword}
                                        onChange={(e) => setUserForm({ ...userForm, confirmPassword: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                                        required={!!userForm.password}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                    Account Status:
                                </label>
                                <select
                                    className="input-premium"
                                    value={userForm.is_active ? 1 : 0}
                                    onChange={(e) => setUserForm({ ...userForm, is_active: parseInt(e.target.value, 10) })}
                                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                                >
                                    <option value={1}>Active (Can Log In)</option>
                                    <option value={0}>Disabled / Deactivated</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                                <button
                                    type="button"
                                    onClick={() => handleTabChange('staff')}
                                    className="btn-secondary"
                                    style={{ padding: '8px 18px', fontSize: '0.86rem' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    style={{ padding: '8px 24px', fontSize: '0.86rem', fontWeight: 700 }}
                                >
                                    {editingUser ? 'Save Staff Changes' : 'Create Staff Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Users;
