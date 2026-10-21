// Cross-tab and live synchronization dispatcher
const CHANNEL_NAME = 'inventory_live_sync';
let channel = null;

try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        channel = new BroadcastChannel(CHANNEL_NAME);
    }
} catch {
    channel = null;
}

export const notifyInventoryChange = (actionType = 'update') => {
    try {
        const payload = {
            type: actionType,
            timestamp: Date.now()
        };

        // 1. BroadcastChannel for instant cross-tab sync (0ms latency)
        if (channel) {
            channel.postMessage(payload);
        }

        // 2. Storage event fallback
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('inventory_last_sync', JSON.stringify(payload));
        }

        // 3. Custom DOM event for current window
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('inventory_live_sync', { detail: payload }));
        }
    } catch {
        // Safe fallback
    }
};

export const subscribeToInventoryChange = (callback) => {
    if (typeof window === 'undefined') return () => {};

    const handleMessage = () => {
        try {
            callback();
        } catch (err) {
            console.error('Error handling live sync message', err);
        }
    };

    // 1. Listen on BroadcastChannel
    if (channel) {
        channel.addEventListener('message', handleMessage);
    }

    // 2. Listen on window storage events
    const handleStorage = (e) => {
        if (e.key === 'inventory_last_sync') {
            handleMessage();
        }
    };
    window.addEventListener('storage', handleStorage);

    // 3. Listen on local window custom event
    window.addEventListener('inventory_live_sync', handleMessage);

    return () => {
        if (channel) {
            channel.removeEventListener('message', handleMessage);
        }
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener('inventory_live_sync', handleMessage);
    };
};
