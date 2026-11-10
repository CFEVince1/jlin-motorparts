import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
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
    Truck
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
        { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={19} />, roles: ['admin', 'cashier'] },
        { name: 'Sale (POS)', path: '/pos', icon: <ShoppingCart size={19} />, roles: ['admin', 'cashier'] },
        { name: 'Inventory', path: '/inventory', icon: <Archive size={19} />, roles: ['admin', 'cashier'] },
        { name: 'Purchasing', path: '/purchasing', icon: <Truck size={19} />, roles: ['admin'] },
        { name: 'Receive Delivery', path: '/purchasing?tab=receive_orders', icon: <Truck size={19} />, roles: ['cashier'] },
        { name: 'Suppliers', path: '/suppliers', icon: <Building2 size={19} />, roles: ['admin'] },
    ];

    const secondaryLinks = [
        { name: 'Shifts & Cash Drawer', path: '/shifts', icon: <Banknote size={19} />, roles: ['admin'] },
        { name: 'Reports', path: '/reports', icon: <TrendingUp size={19} />, roles: ['admin'] },
        { name: 'Staff & Users', path: '/users', icon: <Users size={19} />, roles: ['admin'] },
        { name: 'Audit Log', path: '/audit-log', icon: <ShieldCheck size={19} />, roles: ['admin'] },
    ];

    const handleLinkClick = () => {
        if (onCloseMobile) {
            onCloseMobile();
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
                            onClick={handleLinkClick}
                            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            title={isCollapsed ? link.name : undefined}
                        >
                            <span className="link-icon">{link.icon}</span>
                            {!isCollapsed && <span className="link-text">{link.name}</span>}
                        </NavLink>
                    ))}

                {secondaryLinks
                    .filter(link => hasRoleAccess(link.roles, user?.role))
                    .map(link => (
                        <NavLink
                            key={link.path}
                            to={link.path}
                            end
                            onClick={handleLinkClick}
                            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            title={isCollapsed ? link.name : undefined}
                        >
                            <span className="link-icon">{link.icon}</span>
                            {!isCollapsed && <span className="link-text">{link.name}</span>}
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
                            <div className="sidebar-username">{currentUser.username || 'admin'}</div>
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
