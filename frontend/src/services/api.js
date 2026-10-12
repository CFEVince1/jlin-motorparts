import axios from 'axios';

const isLocalOrLanHost = (hostname) => {
    if (!hostname) return true;
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname.endsWith('.local') ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
};

const getBaseURL = () => {
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }
    if (typeof window !== 'undefined' && window.location.hostname) {
        const hostname = window.location.hostname;
        if (import.meta.env.DEV || isLocalOrLanHost(hostname)) {
            return `http://${hostname}:5000/api`;
        }
        return 'https://jlin-motorparts.onrender.com/api';
    }
    return 'http://localhost:5000/api';
};

const api = axios.create({
    baseURL: getBaseURL(),
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000 // 30s to allow Render cold-start wake-up
});

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

let isLoggingOut = false;

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const url = error.config?.url || '';

        // If unauthorized and not an intentional login attempt, clear session and redirect
        if (status === 401 && !url.includes('/auth/login')) {
            if (!isLoggingOut) {
                isLoggingOut = true;
                localStorage.removeItem('token');
                if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
                    window.location.href = '/login';
                }
                setTimeout(() => {
                    isLoggingOut = false;
                }, 1000);
            }
        }
        return Promise.reject(error);
    }
);

export default api;
