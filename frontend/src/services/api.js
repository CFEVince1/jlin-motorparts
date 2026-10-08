import axios from 'axios';
import { isMockModeActive, handleMockRequest } from './mockEngine';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 10000 // 10s timeout to avoid hanging if free tier backend is sleeping
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
