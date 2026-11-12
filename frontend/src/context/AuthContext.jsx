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

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        if (typeof window === 'undefined') return null;
        const urlParams = new URLSearchParams(window.location.search);
        const paramToken = urlParams.get('auth_token');
        if (paramToken) {
            localStorage.setItem('token', paramToken);
            return decodeToken(paramToken);
        }
        const t = localStorage.getItem('token');
        return t ? decodeToken(t) : null;
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const initAuth = async () => {
            const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const paramToken = urlParams?.get('auth_token');
            if (paramToken) {
                localStorage.setItem('token', paramToken);
            }
            const token = localStorage.getItem('token');
            if (token) {
                const decodedUser = decodeToken(token);
                if (decodedUser) {
                    setUser(decodedUser);
                } else {
                    localStorage.removeItem('token');
                    setUser(null);
                    setLoading(false);
                    return;
                }

                try {
                    const res = await api.get('/auth/verify');
                    const verifiedUser = res.data.user;
                    const role = normalizeRole(verifiedUser.role);

                    // Confidentiality & Shift-Lock Check for Staff
                    if (role !== 'admin') {
                        try {
                            const floatRes = await api.get('/cash-float/my-float');
                            const shiftData = floatRes.data;
                            if (!shiftData?.activeFloat || shiftData?.status !== 'ACTIVE') {
                                localStorage.removeItem('token');
                                sessionStorage.setItem('loginMessage', 'Login Restricted: No active shift has been opened by the Admin.');
                                setUser(null);
                                setLoading(false);
                                return;
                            }
                        } catch (floatErr) {
                            const status = floatErr.response?.status;
                            if (status === 401 || status === 403) {
                                localStorage.removeItem('token');
                                sessionStorage.setItem('loginMessage', 'Login Restricted: No active shift has been opened by the Admin.');
                                setUser(null);
                                setLoading(false);
                                return;
                            }
                            // On network error or cold-start, do not abruptly wipe session; wait for heartbeat
                        }
                    }

                    setUser({ ...verifiedUser, role });
                } catch (error) {
                    const status = error.response?.status;
                    if (status === 401 || status === 403) {
                        console.warn('Session expired or invalidated by server. Logging out.');
                        localStorage.removeItem('token');
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

    // Continuous 15-second heartbeat: Verify staff shift is actively open. If Admin ends shift or shifts someone else, kick out immediately.
    useEffect(() => {
        if (!user || user.role === 'admin') return;

        const interval = setInterval(async () => {
            try {
                const floatRes = await api.get('/cash-float/my-float');
                const shiftData = floatRes.data;
                if (!shiftData?.activeFloat || shiftData?.status !== 'ACTIVE') {
                    localStorage.removeItem('token');
                    sessionStorage.setItem('loginMessage', 'Your shift has ended. Logged out for system confidentiality.');
                    setUser(null);
                }
            } catch (err) {
                if (err.response?.status === 401 || err.response?.status === 403) {
                    localStorage.removeItem('token');
                    setUser(null);
                }
            }
        }, 15000);

        return () => clearInterval(interval);
    }, [user]);

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
                const status = shiftData?.status;

                if (!activeFloat || status !== 'ACTIVE') {
                    localStorage.removeItem('token');
                    setUser(null);
                    const msg = status === 'PENDING_REMIT'
                        ? 'Shift Closing in Progress: Your preliminary count has been submitted and is awaiting Admin verification.'
                        : 'Login Restricted: No active shift has been opened by the Admin.';
                    const err = new Error(msg);
                    err.response = { data: { message: msg } };
                    throw err;
                }
            } catch (floatErr) {
                localStorage.removeItem('token');
                setUser(null);
                const errMsg = floatErr.response?.data?.message || floatErr.message || 'Login Restricted: No active shift has been opened by the Admin.';
                const err = new Error(errMsg);
                err.response = floatErr.response || { data: { message: errMsg } };
                throw err;
            }
        }

        localStorage.setItem('token', res.data.token);
        setUser({ ...loggedInUser, role: normalizedRole });
        return res.data;
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (err) {
            console.warn('Backend logout notification failed or session already invalid:', err.message);
        } finally {
            localStorage.removeItem('token');
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
