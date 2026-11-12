import React, { useContext, useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import { subscribeToInventoryChange, notifyInventoryChange } from '../utils/syncEvents';
import {
    LayoutDashboard,
    ShoppingCart,
    Archive,
    TrendingUp,
    Users,
    LogOut,
    Sun,
    Moon,
    Building2,
    ChevronLeft,
    ChevronRight,
    X,
    Banknote,
    ShieldCheck,
    Truck,
    ArrowLeftRight
} from 'lucide-react';

const Sidebar = ({
    isCollapsed = false,
    onToggleCollapse,
    isMobileNavOpen = false,
    onCloseMobile,
    theme = 'dark',
    onToggleTheme,
    onLogout
}) => {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();

    // Real-time live sidebar status indicators
    const [pendingShiftCount, setPendingShiftCount] = useState(0);
    const [hasActiveShift, setHasActiveShift] = useState(false);
    const [onlineStaffCount, setOnlineStaffCount] = useState(0);

    const fetchSidebarLiveMetrics = useCallback(async () => {
        try {
            const isAdminRole = (user?.role || '').toLowerCase() === 'admin';
            if (isAdminRole) {
                // 1. Shift sign-off / active drawer check
                const shiftRes = await api.get('/cash-float/active-shift').catch(() => null);
                if (shiftRes?.data) {
                    const status = shiftRes.data.status;
                    setPendingShiftCount(status === 'PENDING_REMIT' ? 1 : 0);
                    setHasActiveShift(status === 'ACTIVE');
                }

                // 2. Online staff count
                const usersRes = await api.get('/users').catch(() => null);
                if (Array.isArray(usersRes?.data)) {
                    const onlineCount = usersRes.data.filter(u => u.is_online).length;
                    setOnlineStaffCount(onlineCount);
                }
            } else {
                const floatRes = await api.get('/cash-float/my-float').catch(() => null);
                setHasActiveShift(Boolean(floatRes?.data?.activeFloat));
            }
        } catch (_) {}
    }, [user]);

    useEffect(() => {
        fetchSidebarLiveMetrics();

        const unsubscribe = subscribeToInventoryChange(() => {
            fetchSidebarLiveMetrics();
        });

        // 8-second live polling: keeps sidebar badges real-time without restarting
        const poll = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchSidebarLiveMetrics();
        }, 8000);

        return () => {
            unsubscribe();
            clearInterval(poll);
        };
    }, [fetchSidebarLiveMetrics]);

    const handleLogout = async () => {
        if (onLogout) {
            onLogout();
        } else {
            await logout();
            navigate('/login');
        }
    };

    if (!user) return null;

    const currentUser = user || (() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || { username: 'admin', role: 'Admin' };
        } catch {
            return { username: 'admin', role: 'Admin' };
        }
    })();

    const hasRoleAccess = (linkRoles, userRole) => {
        const r = (userRole || '').toLowerCase();
        return linkRoles.some(allowed => {
            const a = allowed.toLowerCase();
            if (a === r) return true;
            if (['cashier', 'staff'].includes(a) && ['cashier', 'staff'].includes(r)) return true;
            return false;
        });
    };

    const primaryLinks = [
        { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={19} />, roles: ['admin'] },
        { name: 'Sale (POS)', path: '/pos', icon: <ShoppingCart size={19} />, roles: ['admin', 'cashier'] },
        { name: 'Inventory', path: '/inventory', icon: <Archive size={19} />, roles: ['admin', 'cashier'] },
        { name: 'Purchasing', path: '/purchasing', icon: <Truck size={19} />, roles: ['admin'] },
        { name: 'Suppliers', path: '/suppliers', icon: <Building2 size={19} />, roles: ['admin'] },
    ];

    const secondaryLinks = [
        { name: 'Shifts & Cash Drawer', path: '/shifts', icon: <Banknote size={19} />, roles: ['admin'] },
        { name: 'Reports', path: '/reports', icon: <TrendingUp size={19} />, roles: ['admin'] },
        { name: 'Staff & Users', path: '/users', icon: <Users size={19} />, roles: ['admin'] },
        { name: 'Audit Log', path: '/audit-log', icon: <ShieldCheck size={19} />, roles: ['admin'] },
    ];

    const handleLinkClick = (e, targetPath) => {
        if (onCloseMobile) {
            onCloseMobile();
        }
        // When clicking the currently active page in the sidebar:
        if (location.pathname === targetPath) {
            e.preventDefault();
            // If currently on a sub-tab, filter, or query string (e.g. ?tab=categories_brands),
            // navigate back to the clean first tab without retaining clicked sub-tabs
            if (location.search || window.location.search) {
                navigate(targetPath, { replace: true });
                window.location.href = targetPath;
            } else {
                // Already on the first tab: reload to refresh data
                window.location.reload();
            }
        } else {
            notifyInventoryChange('sidebar_nav');
        }
    };

    return (
        <div className={`sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`}>
            {/* Header: Logo, Branding & Collapse/Close Controls */}
            <div className="sidebar-header">
                {/* Mobile Close Button */}
                {onCloseMobile && (
                    <button
                        type="button"
                        className="mobile-close-btn"
                        onClick={onCloseMobile}
                        aria-label="Close Navigation"
                        title="Close Menu"
                    >
                        <X size={20} />
                    </button>
                )}

                {/* Desktop Collapse Toggle */}
                {onToggleCollapse && (
                    <button
                        type="button"
                        className="desktop-collapse-btn"
                        onClick={onToggleCollapse}
                        title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                        aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                    >
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                )}

                {/* Shop Logo & Name */}
                <div className="sidebar-brand">
                    <img
                        src="/jlin-logo.png"
                        alt="JLIN Logo"
                        className="sidebar-logo"
                    />
                    {!isCollapsed && (
                        <div className="sidebar-brand-text">
                            <div className="sidebar-title">JLIN MOTO PARTS</div>
                            <div className="sidebar-subtitle">Inventory & Sales</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation Links */}
            <nav className="sidebar-nav">
                {primaryLinks
                    .filter(link => hasRoleAccess(link.roles, user?.role))
                    .map(link => (
                        <NavLink
                            key={link.path}
                            to={link.path}
                            end
                            onClick={(e) => handleLinkClick(e, link.path)}
                            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            title={isCollapsed ? link.name : undefined}
                        >
                            <span className="link-icon">{link.icon}</span>
                            {!isCollapsed && <span className="link-text">{link.name}</span>}
                            {!isCollapsed && link.path === '/pos' && hasActiveShift && (
                                <span style={{ marginLeft: 'auto', width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981', display: 'inline-block' }} title="Cash drawer active"></span>
                            )}
                        </NavLink>
                    ))}

                {secondaryLinks
                    .filter(link => hasRoleAccess(link.roles, user?.role))
                    .map(link => (
                        <NavLink
                            key={link.path}
                            to={link.path}
                            end
                            onClick={(e) => handleLinkClick(e, link.path)}
                            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            title={isCollapsed ? link.name : undefined}
                        >
                            <span className="link-icon">{link.icon}</span>
                            {!isCollapsed && <span className="link-text">{link.name}</span>}
                            {!isCollapsed && link.path === '/shifts' && (
                                pendingShiftCount > 0 ? (
                                    <span style={{ marginLeft: 'auto', background: '#f59e0b', color: '#000', fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px' }} title="Awaiting Admin Sign-Off">
                                        Sign-Off
                                    </span>
                                ) : hasActiveShift ? (
                                    <span style={{ marginLeft: 'auto', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '0.66rem', fontWeight: 700, padding: '1px 6px', borderRadius: '8px' }} title="Drawer Active">
                                        Active
                                    </span>
                                ) : null
                            )}
                            {!isCollapsed && link.path === '/users' && onlineStaffCount > 0 && (
                                <span style={{ marginLeft: 'auto', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={`${onlineStaffCount} users online`}>
                                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                                    {onlineStaffCount}
                                </span>
                            )}
                        </NavLink>
                    ))}
            </nav>

            {/* Bottom User Profile & Theme/Logout Bar */}
            <div className="sidebar-user">
                <NavLink
                    to="/profile"
                    onClick={handleLinkClick}
                    title={isCollapsed ? `${currentUser.username} (${currentUser.role})` : 'View Profile'}
                    className="sidebar-user-profile"
                >
                    <div className="sidebar-user-avatar">
                        {currentUser.username?.[0]?.toUpperCase() || 'A'}
                    </div>

                    {!isCollapsed && (
                        <div className="sidebar-user-info">
                            <div className="sidebar-username" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{currentUser.username || 'admin'}</span>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 5px #10b981', display: 'inline-block' }} title="Active & Online"></span>
                            </div>
                            <div className="sidebar-role">{(currentUser.role || '').toLowerCase() === 'admin' ? 'Owner / Admin' : 'Cashier / Staff'}</div>
                        </div>
                    )}
                </NavLink>

                <div className="sidebar-user-actions">
                    {onToggleTheme && (
                        <button
                            type="button"
                            onClick={onToggleTheme}
                            className="sidebar-theme-btn"
                            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        >
                            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleLogout}
                        className="sidebar-logout-btn"
                        title="Logout"
                        aria-label="Logout"
                    >
                        <LogOut size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
