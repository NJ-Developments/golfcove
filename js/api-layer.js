/**
 * Golf Cove - API Layer
 * Unified API calls with error handling, retries, and caching
 */

const GolfCoveAPI = (function() {
    'use strict';
    
    const Core = GolfCoveCore;
    
    // ============ CONFIGURATION ============
    const config = {
        baseUrl: '', // Will be set from environment
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
        cacheEnabled: true,
        cacheTTL: {
            short: 30000,      // 30 seconds
            medium: 300000,    // 5 minutes
            long: 3600000      // 1 hour
        }
    };
    
    // ============ REQUEST STATE ============
    const pendingRequests = new Map();
    let isOnline = navigator.onLine;
    
    // Listen for online/offline
    window.addEventListener('online', () => {
        isOnline = true;
        Core.emit('network:online');
        processPendingQueue();
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        Core.emit('network:offline');
    });
    
    // ============ PENDING QUEUE ============
    const pendingQueue = [];
    
    function queueRequest(request) {
        pendingQueue.push({
            ...request,
            queuedAt: Date.now()
        });
        savePendingQueue();
        Core.emit('api:queued', { request });
    }
    
    function savePendingQueue() {
        localStorage.setItem('gc_pending_requests', JSON.stringify(pendingQueue));
    }
    
    function loadPendingQueue() {
        try {
            const saved = localStorage.getItem('gc_pending_requests');
            if (saved) {
                pendingQueue.push(...JSON.parse(saved));
            }
        } catch (e) {
            console.warn('Failed to load pending queue:', e);
        }
    }
    
    async function processPendingQueue() {
        if (pendingQueue.length === 0) return;
        
        Core.emit('api:processing_queue', { count: pendingQueue.length });
        
        while (pendingQueue.length > 0 && isOnline) {
            const request = pendingQueue[0];
            
            try {
                await executeRequest(request.method, request.url, request.data, {
                    ...request.options,
                    skipQueue: true
                });
                pendingQueue.shift();
                savePendingQueue();
            } catch (e) {
                // If still failing, stop processing
                Core.log('warn', 'Failed to process queued request', { request, error: e });
                break;
            }
        }
        
        Core.emit('api:queue_processed', { remaining: pendingQueue.length });
    }
    
    // ============ REQUEST HELPERS ============
    async function executeRequest(method, url, data = null, options = {}) {
        const requestKey = `${method}:${url}:${JSON.stringify(data)}`;
        
        // Dedupe identical concurrent requests
        if (pendingRequests.has(requestKey)) {
            return pendingRequests.get(requestKey);
        }
        
        const requestPromise = (async () => {
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers
            };
            
            // Add auth token if available
            const token = getAuthToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            const fetchOptions = {
                method,
                headers,
                credentials: 'same-origin'
            };
            
            if (data && method !== 'GET') {
                fetchOptions.body = JSON.stringify(data);
            }
            
            const response = await Core.timeout(
                fetch(url, fetchOptions),
                options.timeout || config.timeout
            );
            
            // Handle non-OK responses
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Core.AppError(
                    mapHttpError(response.status),
                    errorData.message || `HTTP ${response.status}`,
                    { status: response.status, ...errorData }
                );
            }
            
            // Parse response
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return await response.text();
        })();
        
        pendingRequests.set(requestKey, requestPromise);
        
        try {
            const result = await requestPromise;
            return result;
        } finally {
            pendingRequests.delete(requestKey);
        }
    }
    
    function mapHttpError(status) {
        const mapping = {
            400: Core.ErrorCodes.VALIDATION_ERROR,
            401: Core.ErrorCodes.UNAUTHORIZED,
            403: Core.ErrorCodes.UNAUTHORIZED,
            404: Core.ErrorCodes.NOT_FOUND,
            409: Core.ErrorCodes.DUPLICATE,
            500: Core.ErrorCodes.NETWORK_ERROR,
            502: Core.ErrorCodes.NETWORK_ERROR,
            503: Core.ErrorCodes.NETWORK_ERROR
        };
        return mapping[status] || Core.ErrorCodes.NETWORK_ERROR;
    }
    
    function getAuthToken() {
        return localStorage.getItem('gc_auth_token');
    }
    
    // ============ PUBLIC API METHODS ============
    async function request(method, url, data = null, options = {}) {
        const fullUrl = url.startsWith('http') ? url : `${config.baseUrl}${url}`;
        
        // Check cache for GET requests
        if (method === 'GET' && config.cacheEnabled && !options.noCache) {
            const cached = Core.cache.get(fullUrl);
            if (cached) {
                return Core.success(cached);
            }
        }
        
        // Check if offline
        if (!isOnline && !options.skipQueue) {
            if (method !== 'GET') {
                queueRequest({ method, url: fullUrl, data, options });
                return Core.success(null, 'Request queued for when online');
            }
            return Core.failure(Core.ErrorCodes.NETWORK_ERROR, 'You are offline');
        }
        
        try {
            const result = await Core.retry(
                () => executeRequest(method, fullUrl, data, options),
                options.retryAttempts || config.retryAttempts,
                options.retryDelay || config.retryDelay
            );
            
            // Cache GET responses
            if (method === 'GET' && config.cacheEnabled && !options.noCache) {
                Core.cache.set(fullUrl, result, options.cacheTTL || config.cacheTTL.medium);
            }
            
            // Invalidate related caches on mutations
            if (method !== 'GET' && options.invalidateCache) {
                options.invalidateCache.forEach(pattern => Core.cache.clear(pattern));
            }
            
            return Core.success(result);
        } catch (error) {
            Core.log('error', `API ${method} ${url} failed`, { error: error.message });
            
            // Queue failed mutations for retry
            if (method !== 'GET' && !options.skipQueue && error.code === Core.ErrorCodes.NETWORK_ERROR) {
                queueRequest({ method, url: fullUrl, data, options });
                return Core.failure(error.code, 'Request queued for retry');
            }
            
            return Core.failure(
                error.code || Core.ErrorCodes.NETWORK_ERROR,
                error.message,
                error.details
            );
        }
    }
    
    // Convenience methods
    const get = (url, options) => request('GET', url, null, options);
    const post = (url, data, options) => request('POST', url, data, options);
    const put = (url, data, options) => request('PUT', url, data, options);
    const patch = (url, data, options) => request('PATCH', url, data, options);
    const del = (url, options) => request('DELETE', url, null, options);
    
    // ============ FIREBASE FUNCTIONS ============
    async function callFunction(name, data = {}) {
        const url = `/api/${name}`;
        return post(url, data, { timeout: 60000 });
    }
    
    // ============ SPECIFIC API ENDPOINTS ============
    const customers = {
        getAll: (filters = {}) => get('/api/customers', { params: filters }),
        getById: (id) => get(`/api/customers/${id}`),
        create: (data) => post('/api/customers', data, { invalidateCache: ['customers'] }),
        update: (id, data) => put(`/api/customers/${id}`, data, { invalidateCache: ['customers'] }),
        delete: (id) => del(`/api/customers/${id}`, { invalidateCache: ['customers'] }),
        search: (query) => get(`/api/customers/search?q=${encodeURIComponent(query)}`)
    };
    
    const bookings = {
        getAll: (date) => get(`/api/bookings?date=${date}`),
        getById: (id) => get(`/api/bookings/${id}`),
        create: (data) => post('/api/bookings', data, { invalidateCache: ['bookings'] }),
        update: (id, data) => put(`/api/bookings/${id}`, data, { invalidateCache: ['bookings'] }),
        cancel: (id, reason) => post(`/api/bookings/${id}/cancel`, { reason }, { invalidateCache: ['bookings'] }),
        checkIn: (id) => post(`/api/bookings/${id}/checkin`, {}, { invalidateCache: ['bookings'] }),
        getAvailability: (date, duration) => get(`/api/bookings/availability?date=${date}&duration=${duration}`)
    };
    
    const tabs = {
        getActive: () => get('/api/tabs?status=active'),
        getById: (id) => get(`/api/tabs/${id}`),
        create: (data) => post('/api/tabs', data, { invalidateCache: ['tabs'] }),
        addItem: (id, item) => post(`/api/tabs/${id}/items`, item, { invalidateCache: ['tabs'] }),
        removeItem: (id, itemId) => del(`/api/tabs/${id}/items/${itemId}`, { invalidateCache: ['tabs'] }),
        close: (id, paymentData) => post(`/api/tabs/${id}/close`, paymentData, { invalidateCache: ['tabs'] })
    };
    
    const payments = {
        createIntent: (data) => callFunction('createPaymentIntent', data),
        capture: (intentId) => callFunction('capturePayment', { paymentIntentId: intentId }),
        refund: (intentId, amount, reason) => callFunction('createRefund', { paymentIntentId: intentId, amount, reason }),
        getConnectionToken: () => callFunction('createConnectionToken'),
        listReaders: () => callFunction('listReaders')
    };
    
    const giftCards = {
        validate: (code) => get(`/api/gift-cards/validate/${code}`),
        redeem: (code, amount) => post('/api/gift-cards/redeem', { code, amount }),
        purchase: (data) => post('/api/gift-cards/purchase', data),
        getBalance: (code) => get(`/api/gift-cards/balance/${code}`)
    };
    
    const employees = {
        getAll: () => get('/api/employees'),
        validatePin: (pin) => post('/api/employees/validate-pin', { pin }),
        clockIn: (id) => post(`/api/employees/${id}/clock-in`),
        clockOut: (id) => post(`/api/employees/${id}/clock-out`)
    };
    
    const reports = {
        getSales: (startDate, endDate) => get(`/api/reports/sales?start=${startDate}&end=${endDate}`),
        getBookings: (startDate, endDate) => get(`/api/reports/bookings?start=${startDate}&end=${endDate}`),
        getCustomers: (startDate, endDate) => get(`/api/reports/customers?start=${startDate}&end=${endDate}`),
        getDashboard: () => get('/api/reports/dashboard', { cacheTTL: config.cacheTTL.short })
    };
    
    // ============ INITIALIZATION ============
    function init(options = {}) {
        Object.assign(config, options);
        loadPendingQueue();
        
        if (isOnline && pendingQueue.length > 0) {
            setTimeout(processPendingQueue, 2000);
        }
        
        Core.log('info', 'API layer initialized', { 
            pendingRequests: pendingQueue.length,
            isOnline 
        });
    }
    
    // ============ PUBLIC API ============
    return {
        init,
        config,
        
        // Generic methods
        request,
        get,
        post,
        put,
        patch,
        delete: del,
        callFunction,
        
        // Specific endpoints
        customers,
        bookings,
        tabs,
        payments,
        giftCards,
        employees,
        reports,
        
        // State
        get isOnline() { return isOnline; },
        get pendingCount() { return pendingQueue.length; },
        
        // Queue management
        processPendingQueue,
        clearPendingQueue: () => {
            pendingQueue.length = 0;
            savePendingQueue();
        }
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.GolfCoveAPI = GolfCoveAPI;
}
