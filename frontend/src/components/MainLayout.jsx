import { useState, useEffect, useContext } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom';
import Sidebar from './Sidebar';
import { AuthContext } from '../context/AuthContextValue';
import { Menu, X, Sun, Moon, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';

const MainLayout = () => {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();

    // Mobile / Tablet drawer state (< 1024px)
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

    // Desktop / Laptop collapsed sidebar state (>= 1024px)
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        return localStorage.getItem('jlin_sidebar_collapsed') === 'true';
    });

    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    // Automatically close mobile/tablet drawer whenever route changes
    useEffect(() => {
        setIsMobileNavOpen(false);
    }, [location.pathname]);

    // Handle escape key to close mobile drawer
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isMobileNavOpen) {
                setIsMobileNavOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isMobileNavOpen]);

    const toggleSidebarCollapse = () => {
        setIsSidebarCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('jlin_sidebar_collapsed', String(next));
            return next;
        });
    };

    const currentUser = user || (() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || { username: 'Staff', role: 'Staff' };
        } catch {
            return { username: 'Staff', role: 'Staff' };
        }
    })();

    return (
        <div className="app-container">
            {/* ======================================================== */}
            {/* MOBILE & TABLET TOP HEADER BAR (< 1024px)               */}
            {/* ======================================================== */}
            <header className="mobile-header print-hide">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={() => setIsMobileNavOpen(prev => !prev)}
                        className="btn-secondary"
                        style={{
                            width: '40px',
                            height: '40px',
                            padding: '0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}
                        aria-label="Toggle Navigation Menu"
                        title="Toggle Menu"
                    >
                        {isMobileNavOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img
                            src="/jlin-logo.png"
                            alt="JLIN Logo"
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                objectFit: 'contain',
                                border: '1.5px solid var(--primary)',
                                backgroundColor: '#000000'
                            }}
                        />
                        <div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1 }}>
                                JLIN MOTO PARTS
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Inventory & Sales
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right controls: Theme, User badge, Logout */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="btn-secondary"
                        style={{
                            width: '36px',
                            height: '36px',
                            padding: '0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                    </button>

                    <NavLink
                        to="/profile"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            textDecoration: 'none',
                            padding: '4px 8px',
                            borderRadius: '8px',
                            background: 'var(--surface-hover)',
                            border: '1px solid var(--border)'
                        }}
                        title="View Profile"
                    >
                        <div style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700
                        }}>
                            {currentUser.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            {currentUser.username || 'User'}
                        </span>
                    </NavLink>

                    <button
                        type="button"
                        onClick={handleLogout}
                        className="btn-secondary"
                        style={{
                            width: '36px',
                            height: '36px',
                            padding: '0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}
                        title="Logout"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </header>

            {/* ======================================================== */}
            {/* MOBILE & TABLET BACKDROP OVERLAY (< 1024px)              */}
            {/* ======================================================== */}
            {isMobileNavOpen && (
                <div
                    className="sidebar-backdrop print-hide"
                    onClick={() => setIsMobileNavOpen(false)}
                    aria-label="Close navigation overlay"
                />
            )}

            {/* ======================================================== */}
            {/* RESPONSIVE SIDEBAR (DRAWER ON TABLET, DOCKED ON DESKTOP) */}
            {/* ======================================================== */}
            <aside className={`sidebar-wrapper print-hide ${isMobileNavOpen ? 'mobile-open' : ''} ${isSidebarCollapsed ? 'desktop-collapsed' : 'desktop-expanded'}`}>
                <Sidebar
                    isCollapsed={isSidebarCollapsed}
                    onToggleCollapse={toggleSidebarCollapse}
                    isMobileNavOpen={isMobileNavOpen}
                    onCloseMobile={() => setIsMobileNavOpen(false)}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    onLogout={handleLogout}
                />
            </aside>

            {/* ======================================================== */}
            {/* MAIN CONTENT WORKSPACE                                  */}
            {/* ======================================================== */}
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
};

export default MainLayout;
