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
                role: payload.role
            };
        }
        return null;
    } catch {
        return null;
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                const decodedUser = decodeToken(token);
                if (decodedUser) {
                    // Set active session from unexpired JWT payload immediately
                    // Prevents bouncing to login during slow Render cold starts or network delays
                    setUser(decodedUser);
                } else {
                    // Token is malformed or locally expired
                    localStorage.removeItem('token');
                    setUser(null);
                    setLoading(false);
                    return;
                }

                try {
                    const res = await api.get('/auth/verify');
                    setUser(res.data.user);
                } catch (error) {
                    const status = error.response?.status;
                    if (status === 401 || status === 403) {
                        // The server explicitly rejected the token (invalidated, revoked, or changed password)
                        console.warn('Session expired or invalidated by server. Logging out.');
                        localStorage.removeItem('token');
                        setUser(null);
                    } else {
                        // Network error, timeout (Render cold start wake-up), or 5xx server blip
                        // DO NOT delete the token! Keep the user logged in with the valid session.
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
        localStorage.setItem('token', res.data.token);
        setUser(res.data.user);
        return res.data;
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
