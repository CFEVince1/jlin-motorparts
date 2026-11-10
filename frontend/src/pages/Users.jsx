import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
    UserPlus, Shield, Trash2, Edit2, Eye, EyeOff, Check, X,
    Users as UsersIcon, KeyRound, CheckCircle2, XCircle, AlertCircle,
    Sliders, RefreshCw, Save, Lock, ArrowRight, Info
} from 'lucide-react';
import Spinner from '../components/Spinner';

const ROLE_LABELS = {
    admin: { label: 'Owner / Admin', badge: '#8b5cf6', desc: 'Full control over pricing, inventory, approvals & financials' },
    cashier: { label: 'Cashier / Staff', badge: '#10b981', desc: 'POS counter sales checkout, shift cash register & receipt issuing' },
    staff: { label: 'Cashier / Staff', badge: '#10b981', desc: 'POS counter sales checkout, shift cash register & receipt issuing' }
};

const MODULE_DESCRIPTIONS = {
    dashboard: 'Command Center, sales summary & low stock indicators',
    pos: 'POS counter sales, barcode scanning & cart checkout',
    sales_history: 'Sales transaction history & receipt reprints',
    approvals: 'Review & approve cashier voids & discounts',
    inventory: 'Products catalog, categories, brands & physical counts',
    purchasing: 'Facebook supplier purchase orders & delivery receiving gate',
    suppliers: 'Supplier directory, Messenger quotes & supplier ledger',
    customers: 'Customer directory & purchase order history',
    shifts: 'Shift starting float, blind cash count & cashier accountability',
    reports: 'Financial P&L income statement, inventory velocity & cash flow',
    users: 'Staff accounts management & security permissions matrix'
};

const Users = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'staff';

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Modals
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [revealedPins, setRevealedPins] = useState({});

    // Form state
    const [userForm, setUserForm] = useState({
        full_name: '',
        username: '',
        password: '',
        confirmPassword: '',
        role: 'cashier',
        pin: '1234',
        is_active: 1
    });

    // Permissions state
    const [permissionsMatrix, setPermissionsMatrix] = useState([]);
    const [loadingPermissions, setLoadingPermissions] = useState(false);
    const [savingPermissions, setSavingPermissions] = useState(false);

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

    const fetchPermissions = async () => {
        setLoadingPermissions(true);
        try {
            const res = await api.get('/users/roles/permissions');
            setPermissionsMatrix(res.data?.modules || []);
        } catch (err) {
            console.error('Failed to load permissions:', err);
            toast.error('Failed to load permissions matrix');
        } finally {
            setLoadingPermissions(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchPermissions();
    }, []);

    const togglePinReveal = (id) => {
        setRevealedPins(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleOpenAddModal = () => {
        setEditingUser(null);
        setUserForm({
            full_name: '',
            username: '',
            password: '',
            confirmPassword: '',
            role: 'cashier',
            pin: '1234',
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
            pin: u.pin || '1234',
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

        if (userForm.role === 'admin') {
            if (!/^\d{4,6}$/.test((userForm.pin || '').toString().trim())) {
                toast.error('Admin Approval PIN must be 4 to 6 numeric digits');
                return;
            }
        }

        try {
            const payload = {
                full_name: userForm.full_name.trim(),
                username: userForm.username.trim(),
                role: userForm.role,
                pin: userForm.role === 'admin' ? (userForm.pin || '').toString().trim() : '1234',
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

            handleTabChange('staff');
            fetchUsers();
        } catch (err) {
            console.error('Error saving user:', err);
            toast.error(err.response?.data?.message || 'Failed to save staff account');
        }
    };

    const handleToggleStatus = async (user) => {
        try {
            const res = await api.put(`/users/${user.id}/toggle-status`);
            toast.success(res.data?.message || 'Status updated');
            fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to toggle status');
        }
    };

    const handleDeleteUser = async (user) => {
        if (!window.confirm(`Are you sure you want to delete or deactivate account "${user.username}"?`)) return;
        try {
            const res = await api.delete(`/users/${user.id}`);
            toast.success(res.data?.message || 'User removed');
            fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete user');
        }
    };

    // Permission Checkbox Toggle
    const handlePermissionToggle = (moduleKey, roleKey, permissionField) => {
        setPermissionsMatrix(prev => prev.map(mod => {
            if (mod.module === moduleKey) {
                const currentPerm = mod.permissions[roleKey] || { can_view: false, can_create: false, can_edit: false, can_delete: false, can_approve: false };
                return {
                    ...mod,
                    permissions: {
                        ...mod.permissions,
                        [roleKey]: {
                            ...currentPerm,
                            [permissionField]: !currentPerm[permissionField]
                        }
                    }
                };
            }
            return mod;
        }));
    };

    const handleSavePermissions = async () => {
        setSavingPermissions(true);
        try {
            const payloadList = [];
            permissionsMatrix.forEach(mod => {
                ['admin', 'cashier'].forEach(role => {
                    const p = mod.permissions[role] || {};
                    payloadList.push({
                        role,
                        module: mod.module,
                        module_name: mod.module_name,
                        can_view: !!p.can_view,
                        can_create: !!p.can_create,
                        can_edit: !!p.can_edit,
                        can_delete: !!p.can_delete,
                        can_approve: !!p.can_approve
                    });
                });
            });

            await api.put('/users/roles/permissions', { permissions: payloadList });
            toast.success('Roles and permissions matrix updated successfully!');
            fetchPermissions();
        } catch (err) {
            console.error('Error saving permissions:', err);
            toast.error(err.response?.data?.message || 'Failed to save permissions');
        } finally {
            setSavingPermissions(false);
        }
    };

    // Filtered users
    const filteredUsers = users.filter(u => {
        const matchesSearch = (u.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (u.username || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = roleFilter === 'ALL' ||
            (roleFilter === 'cashier' ? ['cashier', 'staff'].includes((u.role || '').toLowerCase()) : (u.role || '').toLowerCase() === roleFilter.toLowerCase());
        const matchesStatus = statusFilter === 'ALL' ||
            (statusFilter === 'ACTIVE' && (u.is_active === 1 || u.is_active === undefined)) ||
            (statusFilter === 'DEACTIVATED' && u.is_active === 0);
        return matchesSearch && matchesRole && matchesStatus;
    });

    const activeCount = users.filter(u => u.is_active === 1 || u.is_active === undefined).length;
    const deactivatedCount = users.filter(u => u.is_active === 0).length;

    return (
        <div className="users-page" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ margin: '0 0 6px 0', fontSize: '1.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <UsersIcon size={26} color="var(--primary)" /> Staff Accounts & Access Control
                    </h1>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Secures the store so cashiers only see what they need to sell, while the Owner/Admin controls pricing, inventory adjustments, approvals, and financial reports.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleOpenAddModal}
                    className="btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700 }}
                >
                    <UserPlus size={18} /> Add New Staff Account
                </button>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
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
                    onClick={() => handleTabChange('permissions')}
                    style={{
                        padding: '12px 20px',
                        fontSize: '0.92rem',
                        fontWeight: activeTab === 'permissions' ? 800 : 600,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'permissions' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'permissions' ? 'var(--text-main)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <Shield size={18} color={activeTab === 'permissions' ? 'var(--primary)' : 'inherit'} /> Roles & Permissions Matrix
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
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>
                                Active Accounts
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                                {activeCount}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Can log in and operate
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
                                <option value="admin">Owner / Admin</option>
                                <option value="cashier">Cashier / Staff</option>
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
                                <option value="ACTIVE">Active Only</option>
                                <option value="DEACTIVATED">Deactivated Only</option>
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
                                            <th style={{ whiteSpace: 'nowrap' }}>Manager Approval PIN</th>
                                            <th style={{ whiteSpace: 'nowrap' }}>Account Status</th>
                                            <th style={{ whiteSpace: 'nowrap' }}>Created Date</th>
                                            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map(u => {
                                            const roleMeta = ROLE_LABELS[(u.role || '').toLowerCase()] || ROLE_LABELS.cashier;
                                            const isActive = u.is_active === 1 || u.is_active === undefined;
                                            const pinRevealed = !!revealedPins[u.id];

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
                                                        {(u.role || '').toLowerCase() === 'admin' ? (
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--surface-hover)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                                                <KeyRound size={13} color="var(--primary)" />
                                                                <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.88rem', letterSpacing: pinRevealed ? '0.1em' : '0.2em' }}>
                                                                    {pinRevealed ? (u.pin || '1234') : '••••'}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => togglePinReveal(u.id)}
                                                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                                                                    title={pinRevealed ? 'Hide PIN' : 'Reveal PIN'}
                                                                >
                                                                    {pinRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>— (N/A)</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleStatus(u)}
                                                            style={{
                                                                background: isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                                color: isActive ? '#10b981' : '#ef4444',
                                                                border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                                                borderRadius: '12px',
                                                                padding: '3px 10px',
                                                                fontSize: '0.74rem',
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                            title="Click to toggle account status"
                                                        >
                                                            {isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                                            {isActive ? 'Active' : 'Deactivated'}
                                                        </button>
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
            {/* TAB 2: ROLES & PERMISSIONS MATRIX                            */}
            {/* ============================================================ */}
            {activeTab === 'permissions' && (
                <div>
                    <div style={{
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1.5px solid rgba(59, 130, 246, 0.25)',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginBottom: '20px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '0.96rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Shield size={18} color="#3b82f6" /> Roles & Module Execution Access Matrix
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                Check or uncheck capabilities across the 11 shop modules for Owner/Admin and Cashier/Staff.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={handleSavePermissions}
                            disabled={savingPermissions}
                            className="btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 20px', fontWeight: 800 }}
                        >
                            <Save size={16} /> {savingPermissions ? 'Saving Matrix...' : 'Save Permissions Matrix'}
                        </button>
                    </div>

                    {loadingPermissions ? (
                        <div style={{ padding: '40px', textAlign: 'center' }}><Spinner /></div>
                    ) : (
                        <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                            <div className="table-container" style={{ margin: 0 }}>
                                <table className="table" style={{ margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '40%' }}>Store Module</th>
                                            <th style={{ width: '30%', textAlign: 'center' }}>
                                                <div style={{ fontWeight: 800, color: '#8b5cf6' }}>Owner / Admin</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Full System Control</div>
                                            </th>
                                            <th style={{ width: '30%', textAlign: 'center' }}>
                                                <div style={{ fontWeight: 800, color: '#10b981' }}>Cashier / Staff</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Counter Selling, Drawer & Operations</div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {permissionsMatrix.map(mod => {
                                            const desc = MODULE_DESCRIPTIONS[mod.module] || 'Module functionality';
                                            return (
                                                <tr key={mod.module}>
                                                    <td>
                                                        <strong style={{ fontSize: '0.88rem', display: 'block' }}>
                                                             {mod.module_name}
                                                        </strong>
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                            {desc}
                                                        </span>
                                                    </td>

                                                    {/* Admin Column */}
                                                    <td style={{ textAlign: 'center' }}>
                                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.76rem' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!mod.permissions?.admin?.can_view}
                                                                onChange={() => handlePermissionToggle(mod.module, 'admin', 'can_view')}
                                                                style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                                                            />
                                                            <span style={{ fontWeight: 700, color: '#8b5cf6' }}>Full Access</span>
                                                        </label>
                                                    </td>

                                                    {/* Cashier / Staff Column */}
                                                    <td style={{ textAlign: 'center' }}>
                                                        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.76rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!mod.permissions?.cashier?.can_view}
                                                                    onChange={() => handlePermissionToggle(mod.module, 'cashier', 'can_view')}
                                                                    style={{ width: '15px', height: '15px', accentColor: '#10b981' }}
                                                                />
                                                                <span>Access Screen</span>
                                                            </label>
                                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.76rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!mod.permissions?.cashier?.can_create}
                                                                    onChange={() => handlePermissionToggle(mod.module, 'cashier', 'can_create')}
                                                                    style={{ width: '15px', height: '15px', accentColor: '#10b981' }}
                                                                />
                                                                <span style={{ color: mod.permissions?.cashier?.can_create ? '#10b981' : 'var(--text-muted)' }}>
                                                                    Perform Operations
                                                                </span>
                                                            </label>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
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
                                        Configure credentials, assign sell / approval permissions, and set manager PIN.
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

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                                {userForm.role === 'admin' ? (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                                            Admin Approval PIN (4-6 digits) *:
                                        </label>
                                        <input
                                            type="password"
                                            maxLength={6}
                                            className="input-premium"
                                            placeholder="1234"
                                            value={userForm.pin}
                                            onChange={(e) => setUserForm({ ...userForm, pin: e.target.value.replace(/\D/g, '') })}
                                            style={{ width: '100%', padding: '8px 12px', fontSize: '0.95rem', fontFamily: 'monospace', letterSpacing: '0.2em' }}
                                            required
                                        />
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                                            For instant overrides in Approvals, voids, discounts & price overrides.
                                        </span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-muted)' }}>
                                            Admin Approval PIN:
                                        </label>
                                        <div style={{ fontSize: '0.80rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 12px', background: 'var(--surface-hover)', borderRadius: '6px' }}>
                                            N/A — Cashier/Staff submits requests for Admin approval.
                                        </div>
                                    </div>
                                )}

                                <div>
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
