import { useContext, useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import {
    LayoutDashboard,
    Package,
    ShoppingCart,
    Archive,
    TrendingUp,
    Users,
    LogOut,
    History,
    Sun,
    Moon,
    Settings2,
    Truck,
    Search,
    AlertOctagon,
    UserCircle2,
    Building2,
    ChevronDown
} from 'lucide-react';

const Sidebar = () => {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    if (!user) return null;

    const currentUser = user || (() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || { username: 'admin', role: 'Admin' };
        } catch {
            return { username: 'admin', role: 'Admin' };
        }
    })();

    const location = useLocation();

    // Check if current route is part of Inventory group
    const inventoryRoutes = ['/inventory', '/transactions', '/products', '/suppliers', '/stock-receive'];
    const isInventoryRouteActive = inventoryRoutes.includes(location.pathname);
    const [inventoryOpen, setInventoryOpen] = useState(true);

    // Keep dropdown open if user navigates to an inventory sub-module
    useEffect(() => {
        if (isInventoryRouteActive) {
            setInventoryOpen(true);
        }
    }, [location.pathname, isInventoryRouteActive]);

    const primaryLinks = [
        { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} />, roles: ['admin', 'staff'] },
        { name: 'Sales (POS)', path: '/pos', icon: <ShoppingCart size={20} />, roles: ['admin', 'staff'] },
    ];

    const inventorySubLinks = [
        { name: 'Current Stock', path: '/inventory', icon: <Archive size={16} />, roles: ['admin', 'staff'] },
        { name: 'Transactions', path: '/transactions', icon: <History size={16} />, roles: ['admin', 'staff'] },
        { name: 'Product Directory', path: '/products', icon: <Package size={16} />, roles: ['admin'] },
        { name: 'Suppliers', path: '/suppliers', icon: <Building2 size={16} />, roles: ['admin'] },
        { name: 'Stock Receive', path: '/stock-receive', icon: <Truck size={16} />, roles: ['admin'] },
    ];

    const secondaryLinks = [
        { name: 'Fitment Search', path: '/compatibility-search', icon: <Search size={20} />, roles: ['admin'] },
        { name: 'Sales Reports', path: '/reports', icon: <TrendingUp size={20} />, roles: ['admin'] },
        { name: 'Discrepancy Audit', path: '/reports/adjustments', icon: <AlertOctagon size={20} />, roles: ['admin'] },
        { name: 'Compatibility Rules', path: '/manage-compatibility', icon: <Settings2 size={20} />, roles: ['admin'] },
        { name: 'Manage Users', path: '/users', icon: <Users size={20} />, roles: ['admin'] },
    ];

    return (
        <div className="sidebar" style={{
            width: '260px',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px 0',
            height: '100%'
        }}>
            <div className="sidebar-header" style={{
                padding: '0 16px',
                marginBottom: '10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                flexShrink: 0
            }}>
                <button
                    onClick={toggleTheme}
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: '12px',
                        background: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                        padding: '5px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                    }}
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>

                <img
                    src="/jlin-logo.png"
                    alt="JLIN Logo"
                    style={{
                        width: '70px',
                        height: '70px',
                        objectFit: 'contain',
                        borderRadius: '50%',
                        border: '2px solid rgba(16, 185, 129, 0.45)',
                        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4), 0 0 12px rgba(16, 185, 129, 0.18)',
                        backgroundColor: '#000000',
                        marginBottom: '6px'
                    }}
                />
                <div style={{
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    color: 'var(--text-main)',
                    letterSpacing: '0.5px',
                    textAlign: 'center',
                    lineHeight: 1.2
                }}>
                    JLIN MOTO PARTS
                </div>
                <div style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.64rem',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    textAlign: 'center',
                    marginTop: '2px'
                }}>
                    Inventory & Sales
                </div>
            </div>

            <nav className="sidebar-nav" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 10px', overflowY: 'auto' }}>
                {primaryLinks.filter(link => link.roles.includes(user.role)).map(link => (
                    <NavLink
                        key={link.path}
                        to={link.path}
                        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    >
                        {link.icon} <span className="link-text">{link.name}</span>
                    </NavLink>
                ))}

                {/* Inventory Expandable Dropdown Module */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div
                        onClick={() => setInventoryOpen(prev => !prev)}
                        className={`sidebar-link ${isInventoryRouteActive ? 'active' : ''}`}
                        style={{ cursor: 'pointer', justifyContent: 'space-between', userSelect: 'none' }}
                        title="Inventory Management & Related Modules"
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Archive size={18} />
                            <span className="link-text">Inventory</span>
                        </div>
                        <ChevronDown
                            size={15}
                            style={{
                                transform: inventoryOpen ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s ease',
                                color: 'var(--text-muted)'
                            }}
                        />
                    </div>

                    {inventoryOpen && (
                        <div className="sidebar-submenu">
                            {inventorySubLinks.filter(sub => sub.roles.includes(user.role)).map(sub => (
                                <NavLink
                                    key={sub.path}
                                    to={sub.path}
                                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                                >
                                    {sub.icon}
                                    <span>{sub.name}</span>
                                </NavLink>
                            ))}
                        </div>
                    )}
                </div>

                {secondaryLinks.filter(link => link.roles.includes(user.role)).map(link => (
                    <NavLink
                        key={link.path}
                        to={link.path}
                        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    >
                        {link.icon} <span className="link-text">{link.name}</span>
                    </NavLink>
                ))}
            </nav>

            {/* Compact Bottom User Profile & Logout Bar */}
            <div className="sidebar-user" style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexShrink: 0
            }}>
                <NavLink
                    to="/profile"
                    title="View & Edit Profile"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        textDecoration: 'none',
                        color: 'inherit',
                        flex: 1,
                        minWidth: 0,
                        padding: '4px 6px',
                        borderRadius: '6px',
                        transition: 'background-color 0.2s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                    <div
                        style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.35)',
                            color: 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontWeight: '600',
                            fontSize: '0.78rem'
                        }}
                    >
                        {currentUser.username?.[0]?.toUpperCase() || 'A'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <div
                            style={{
                                fontWeight: '600',
                                fontSize: '0.78rem',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                color: 'var(--text-main)',
                                lineHeight: 1.2
                            }}
                        >
                            {currentUser.username || 'admin'}
                        </div>
                        <div
                            style={{
                                fontSize: '0.66rem',
                                color: 'var(--text-muted)',
                                textTransform: 'capitalize'
                            }}
                        >
                            {currentUser.role || 'Admin'}
                        </div>
                    </div>
                </NavLink>

                {/* Compact Logout Button */}
                <button
                    onClick={handleLogout}
                    className="btn-secondary"
                    title="Logout"
                    style={{
                        height: '28px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        flexShrink: 0,
                        fontWeight: 500
                    }}
                >
                    <LogOut size={13} />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
