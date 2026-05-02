import { useContext, useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
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
    Moon
} from 'lucide-react';

const Sidebar = () => {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
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

    const links = [
        { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} />, roles: ['admin', 'staff'] },
        { name: 'Sales', path: '/pos', icon: <ShoppingCart size={20} />, roles: ['admin', 'staff'] },
        { name: 'Transactions', path: '/transactions', icon: <History size={20} />, roles: ['admin', 'staff'] },
        { name: 'Products', path: '/products', icon: <Package size={20} />, roles: ['admin'] },
        { name: 'Inventory', path: '/inventory', icon: <Archive size={20} />, roles: ['admin'] },
        { name: 'Reports', path: '/reports', icon: <TrendingUp size={20} />, roles: ['admin'] },
        { name: 'Manage Users', path: '/users', icon: <Users size={20} />, roles: ['admin'] },
    ];

    return (
        <div className="sidebar" style={{
            width: '260px',
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px 0'
        }}>
            <div className="sidebar-header" style={{ padding: '0 24px', marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <img src="/jlin-logo.png" alt="JLIN Logo" style={{ height: '32px', objectFit: 'contain', alignSelf: 'flex-start', marginBottom: '4px', borderRadius: '4px' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Inventory & Sales</span>
                </div>
                <button onClick={toggleTheme} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Toggle Theme">
                    {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>
            </div>

            <nav className="sidebar-nav" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 12px' }}>
                {links.filter(link => link.roles.includes(user.role)).map(link => (
                    <NavLink
                        key={link.path}
                        to={link.path}
                        style={({ isActive }) => ({
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                            background: isActive ? 'rgba(50, 215, 75, 0.15)' : 'transparent',
                            borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                            transition: 'all 0.2s',
                            fontWeight: isActive ? '600' : '400',
                            whiteSpace: 'nowrap'
                        })}
                    >
                        {link.icon} <span className="link-text">{link.name}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-user" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(50, 215, 75, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontWeight: 'bold' }}>{user.username.charAt(0).toUpperCase()}</span>
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontWeight: '600', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: 'var(--text-main)' }}>{user.username}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user.role}</div>
                    </div>
                </div>

                <button
                    onClick={handleLogout}
                    className="btn-secondary"
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}
                >
                    <LogOut size={16} /> Logout
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
