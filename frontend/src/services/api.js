import axios from 'axios';
import { isMockModeActive, handleMockRequest } from './mockEngine';

const getBaseURL = () => {
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }
    if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return 'https://jlin-motorparts.onrender.com/api';
    }
    return 'http://localhost:5000/api';
};

const api = axios.create({
    baseURL: getBaseURL(),
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 15000 // 15s to allow Render cold-start wake-up
});

// Custom adapter to intercept requests in Mock Mode before hitting network
const defaultAdapter = api.defaults.adapter;
api.defaults.adapter = async (config) => {
    if (isMockModeActive()) {
        return handleMockRequest(config);
    }
    
    try {
        if (typeof defaultAdapter === 'function') {
            return await defaultAdapter(config);
        }
        return await axios.defaults.adapter(config);
    } catch (error) {
        // Automatic Fallback: If backend is completely offline or unreachable (e.g., cold start, network failure on Vercel)
        const isNetworkErr = !error.response || error.code === 'ERR_NETWORK' || error.message?.includes('Network Error');
        const isColdStart503 = error.response && (error.response.status === 503 || error.response.status === 504 || error.response.status === 502);
        
        if (isNetworkErr || isColdStart503) {
            console.warn('[JLIN API] Cloud backend unreachable. Falling back to Demo/Mock Engine:', config.url);
            return handleMockRequest(config);
        }
        throw error;
    }
};

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

export default api;
