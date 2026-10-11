import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, Settings2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';

const FitmentHeaderTabs = () => {
    const { user } = useContext(AuthContext);

    // Only render tabs for admin since staff doesn't manage compatibility rules
    if (user?.role !== 'admin') return null;

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'var(--surface-hover)',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            marginBottom: '16px',
            width: 'fit-content'
        }}>
            <NavLink
                to="/compatibility-search"
                style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 16px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                    transition: 'all 0.15s ease'
                })}
            >
                <Search size={15} />
                <span>Fitment Search</span>
            </NavLink>
            <NavLink
                to="/manage-compatibility"
                style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 16px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                    transition: 'all 0.15s ease'
                })}
            >
                <Settings2 size={15} />
                <span>Compatibility Rules</span>
            </NavLink>
        </div>
    );
};

export default FitmentHeaderTabs;
