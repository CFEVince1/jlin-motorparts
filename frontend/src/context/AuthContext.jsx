const normalizeRole = (role) => (String(role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'cashier');
import { useState, useEffect } from 'react';
import api from '../services/api';
import { AuthContext } from './AuthContextValue';

const decodeToken = (token) => {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        if (payload && payload.exp && payload.exp * 1000 > Date.now()) {
            return {
                id: payload.id,
                username: payload.username,
                role: normalizeRole(payload.role)
            };
        }
        return null;
    } catch {
        return null;
    }
};

const getStoredToken = () => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('token') || localStorage.getItem('token');
};

const setStoredToken = (token) => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('token', token);
    localStorage.setItem('token', token);
};

const clearStoredToken = () => {
    if (typeof window === 'undefined') return;
    const thisToken = sessionStorage.getItem('token');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    // Only clear localStorage token if it matches this session's token to avoid wiping other active users
    if (!thisToken || localStorage.getItem('token') === thisToken) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        if (typeof window === 'undefined') return null;
        const urlParams = new URLSearchParams(window.location.search);
        const paramToken = urlParams.get('auth_token');
        if (paramToken) {
            setStoredToken(paramToken);
            return decodeToken(paramToken);
        }
        const t = getStoredToken();
        if (t && !sessionStorage.getItem('token')) {
            sessionStorage.setItem('token', t);
        }
        return t ? decodeToken(t) : null;
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const initAuth = async () => {
            const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const paramToken = urlParams?.get('auth_token');
            if (paramToken) {
                setStoredToken(paramToken);
            }
            const token = getStoredToken();
            if (token) {
                const decodedUser = decodeToken(token);
                if (decodedUser) {
                    setUser(decodedUser);
                } else {
                    clearStoredToken();
                    setUser(null);
                    setLoading(false);
                    return;
                }

                try {
                    const res = await api.get('/auth/verify');
                    const verifiedUser = res.data.user;
                    const role = normalizeRole(verifiedUser.role);
                    setUser({ ...verifiedUser, role });
                } catch (error) {
                    const status = error.response?.status;
                    if (status === 401) {
                        console.warn('Session expired or invalidated by server. Logging out.');
                        clearStoredToken();
                        setUser(null);
                    } else {
                        console.warn('Auth verification encountered network or server delay. Retaining active session:', error.message);
                    }
                }
            }
            setLoading(false);
        };
        initAuth();
    }, []);

    const login = async (username, password) => {
        const res = await api.post('/auth/login', { username, password });
        const loggedInUser = res.data.user;
        const normalizedRole = normalizeRole(loggedInUser?.role);

        // Strict Shift-Locked Gate: Staff / Cashiers CANNOT log in without an active shift opened by Admin
        if (normalizedRole !== 'admin') {
            try {
                const floatRes = await api.get('/cash-float/my-float', {
                    headers: { Authorization: `Bearer ${res.data.token}` }
                });
                const shiftData = floatRes.data;
                const activeFloat = shiftData?.activeFloat;
                const shiftStatus = activeFloat?.status || shiftData?.status;
                const hasValidActiveShift = Boolean(activeFloat && shiftStatus === 'ACTIVE');

                if (!hasValidActiveShift) {
                    clearStoredToken();
                    setUser(null);
                    const msg = shiftStatus === 'PENDING_REMIT'
                        ? 'Shift Closing in Progress: Your preliminary count has been submitted and is awaiting Admin verification.'
                        : 'Login Restricted: No active shift has been opened by the Admin.';
                    const err = new Error(msg);
                    err.response = { data: { message: msg } };
                    throw err;
                }
            } catch (floatErr) {
                clearStoredToken();
                setUser(null);
                const errMsg = floatErr.response?.data?.message || floatErr.message || 'Login Restricted: No active shift has been opened by the Admin.';
                const err = new Error(errMsg);
                err.response = floatErr.response || { data: { message: errMsg } };
                throw err;
            }
        }

        setStoredToken(res.data.token);
        setUser({ ...loggedInUser, role: normalizedRole });
        return res.data;
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (err) {
            console.warn('Backend logout notification failed or session already invalid:', err.message);
        } finally {
            clearStoredToken();
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
