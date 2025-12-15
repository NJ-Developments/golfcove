/**
 * Golf Cove - API Layer
 * Unified API calls with error handling, retries, and caching
 */

const GolfCoveAPI = (function() {
    'use strict';
    
    const Core = GolfCoveCore;
    
    // ============ CONFIGURATION ============
    const config = {
        baseUrl: '', // Will be set from environment/GolfCoveConfig
        apiKey: '', // Will be set from environment/GolfCoveConfig
        timeout: 30000,
        maxTimeout: 120000, // Maximum allowed timeout
        retryAttempts: 3,
        maxRetryAttempts: 10,
        retryDelay: 1000,
        maxRetryDelay: 30000,
        cacheEnabled: true,
        maxQueueSize: 100, // Maximum pending requests to store
        cacheTTL: {
            short: 30000,      // 30 seconds
            medium: 300000,    // 5 minutes
            long: 3600000      // 1 hour
        }
    };
    
    // Employee context for permission-based requests
    let currentEmployee = null;
    
    function setEmployee(employee) {
        currentEmployee = employee;
        if (employee) {
            localStorage.setItem('gc_current_employee', JSON.stringify(employee));
        } else {
            localStorage.removeItem('gc_current_employee');
        }
    }
    
    function getEmployee() {
        if (currentEmployee) return currentEmployee;
        try {
            const saved = localStorage.getItem('gc_current_employee');
            if (saved) {
                currentEmployee = JSON.parse(saved);
                return currentEmployee;
            }
        } catch (e) {}
        return null;
    }
    
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
        // Validate request structure
        if (!request || !request.method || !request.url) {
            Core.log('warn', 'Invalid request queued, skipping', { request });
            return false;
        }
        
        // Check queue size limit
        if (pendingQueue.length >= config.maxQueueSize) {
            Core.log('warn', 'Pending queue full, dropping oldest request');
            pendingQueue.shift(); // Remove oldest
        }
        
        // Sanitize before storing
        const sanitized = {
            method: String(request.method).toUpperCase(),
            url: String(request.url),
            data: request.data,
            options: request.options || {},
            queuedAt: Date.now()
        };
        
        pendingQueue.push(sanitized);
        savePendingQueue();
        Core.emit('api:queued', { request: sanitized });
        return true;
    }
    
    function savePendingQueue() {
        localStorage.setItem('gc_pending_requests', JSON.stringify(pendingQueue));
    }
    
    function loadPendingQueue() {
        try {
            const saved = localStorage.getItem('gc_pending_requests');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    // Validate and filter queue entries
                    const valid = parsed.filter(item => 
                        item && 
                        typeof item.method === 'string' && 
                        typeof item.url === 'string' &&
                        item.queuedAt > Date.now() - 86400000 // Only keep last 24 hours
                    );
                    pendingQueue.push(...valid.slice(0, config.maxQueueSize));
                }
            }
        } catch (e) {
            Core.log('warn', 'Failed to load pending queue', { error: e.message });
            localStorage.removeItem('gc_pending_requests'); // Clear corrupted data
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
            
            // Add API key for backend authentication
            if (config.apiKey) {
                headers['X-API-Key'] = config.apiKey;
            }
            
            // Add employee context for permission-based requests
            const employee = getEmployee();
            if (employee) {
                headers['X-Employee-Id'] = employee.id;
                if (employee.pin) {
                    headers['X-Employee-Pin'] = employee.pin;
                }
                headers['X-User-Id'] = employee.id; // For audit logging
            }
            
            // Add auth token if available (for Firebase Auth)
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
        // Validate URL
        if (!url || typeof url !== 'string') {
            return Core.failure(Core.ErrorCodes.VALIDATION_ERROR, 'Invalid URL');
        }
        
        // Validate method
        const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        const normalizedMethod = String(method).toUpperCase();
        if (!validMethods.includes(normalizedMethod)) {
            return Core.failure(Core.ErrorCodes.VALIDATION_ERROR, 'Invalid HTTP method');
        }
        
        const fullUrl = url.startsWith('http') ? url : `${config.baseUrl}${url}`;
        
        // Validate constructed URL
        try {
            new URL(fullUrl);
        } catch (e) {
            return Core.failure(Core.ErrorCodes.VALIDATION_ERROR, 'Malformed URL');
        }
        
        // Bound timeout and retry values
        const timeout = Math.min(options.timeout || config.timeout, config.maxTimeout);
        const retryAttempts = Math.min(options.retryAttempts || config.retryAttempts, config.maxRetryAttempts);
        const retryDelay = Math.min(options.retryDelay || config.retryDelay, config.maxRetryDelay);
        
        // Check cache for GET requests
        if (normalizedMethod === 'GET' && config.cacheEnabled && !options.noCache) {
            const cached = Core.cache.get(fullUrl);
            if (cached) {
                return Core.success(cached);
            }
        }
        
        // Check if offline
        if (!isOnline && !options.skipQueue) {
            if (normalizedMethod !== 'GET') {
                queueRequest({ method: normalizedMethod, url: fullUrl, data, options });
                return Core.success(null, 'Request queued for when online');
            }
            return Core.failure(Core.ErrorCodes.NETWORK_ERROR, 'You are offline');
        }
        
        try {
            const result = await Core.retry(
                () => executeRequest(normalizedMethod, fullUrl, data, { ...options, timeout }),
                retryAttempts,
                retryDelay
            );
            
            // Cache GET responses
            if (normalizedMethod === 'GET' && config.cacheEnabled && !options.noCache) {
                Core.cache.set(fullUrl, result, options.cacheTTL || config.cacheTTL.medium);
            }
            
            // Invalidate related caches on mutations
            if (normalizedMethod !== 'GET' && options.invalidateCache) {
                if (Array.isArray(options.invalidateCache)) {
                    options.invalidateCache.forEach(pattern => Core.cache.clear(pattern));
                }
            }
            
            return Core.success(result);
        } catch (error) {
            Core.log('error', `API ${normalizedMethod} ${url} failed`, { error: error.message });
            
            // Queue failed mutations for retry
            if (normalizedMethod !== 'GET' && !options.skipQueue && error.code === Core.ErrorCodes.NETWORK_ERROR) {
                queueRequest({ method: normalizedMethod, url: fullUrl, data, options });
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
        getSales: (startDate, endDate, options = {}) => get(`/api/salesReport?startDate=${startDate}&endDate=${endDate}&groupBy=${options.groupBy || 'day'}`),
        getBookings: (startDate, endDate) => get(`/api/bookingsReport?startDate=${startDate}&endDate=${endDate}`),
        getCustomers: (startDate, endDate) => get(`/api/customersReport?startDate=${startDate}&endDate=${endDate}`),
        getInventory: () => get('/api/inventoryReport'),
        getEmployees: (startDate, endDate) => get(`/api/employeeReport?startDate=${startDate}&endDate=${endDate}`),
        getDashboard: () => get('/api/reports/dashboard', { cacheTTL: config.cacheTTL.short }),
        exportData: (type, format, startDate, endDate) => 
            get(`/api/exportData?type=${type}&format=${format}&startDate=${startDate}&endDate=${endDate}`)
    };
    
    const inventory = {
        getLevels: (category) => get(`/api/inventoryLevels${category ? `?category=${category}` : ''}`),
        sync: (items) => post('/api/inventorySync', { items }),
        adjust: (itemId, quantity, reason) => post('/api/inventoryAdjustment', { itemId, quantity, reason }),
        getLowStock: () => get('/api/inventoryReport?lowStockOnly=true')
    };
    
    const transactions = {
        record: (data) => post('/api/recordTransaction', data),
        validate: (data) => post('/api/validateTransaction', data),
        getRecent: (limit = 50) => get(`/api/transactions?limit=${limit}`),
        getById: (id) => get(`/api/transactions/${id}`)
    };
    
    const system = {
        health: () => get('/api/health', { noCache: true }),
        backup: () => post('/api/backupData', {}),
        restore: (backup, overwrite = false) => post('/api/restoreData', { backup, overwrite }),
        getAuditLog: (filters = {}) => {
            const params = new URLSearchParams(filters).toString();
            return get(`/api/auditLog${params ? `?${params}` : ''}`);
        },
        validatePermission: (permission) => get(`/api/validatePermission?permission=${permission}`),
        getRoles: () => get('/api/getRoles', { cacheTTL: config.cacheTTL.long })
    };
    
    const cashDrawer = {
        open: (employeeId, expectedAmount) => 
            post('/api/cashDrawer', { action: 'open', employeeId, expectedAmount }),
        close: (employeeId, expectedAmount, actualAmount, notes) => 
            post('/api/cashDrawer', { action: 'close', employeeId, expectedAmount, actualAmount, notes }),
        drop: (employeeId, amount, notes) => 
            post('/api/cashDrawer', { action: 'drop', employeeId, amount, notes }),
        adjust: (employeeId, amount, reason) => 
            post('/api/cashDrawer', { action: 'adjustment', employeeId, amount, reason })
    };
    
    const alerts = {
        getUnread: () => get('/api/alerts?status=unread'),
        markRead: (alertId) => put(`/api/alerts/${alertId}`, { status: 'read' }),
        getAll: (limit = 50) => get(`/api/alerts?limit=${limit}`)
    };
    
    const notifications = {
        getUnread: () => get('/api/notifications?status=unread'),
        markRead: (notificationId) => put(`/api/notifications/${notificationId}`, { status: 'read' }),
        getAll: (limit = 50) => get(`/api/notifications?limit=${limit}`)
    };
    
    // ============ SHIFT MANAGEMENT ============
    const shifts = {
        clockIn: (employeeId, notes) => 
            post('/api/shiftManagement', { action: 'clockIn', employeeId, notes }),
        clockOut: (employeeId, notes) => 
            post('/api/shiftManagement', { action: 'clockOut', employeeId, notes }),
        startBreak: (employeeId, breakType = 'regular') => 
            post('/api/shiftManagement', { action: 'startBreak', employeeId, breakType }),
        endBreak: (employeeId) => 
            post('/api/shiftManagement', { action: 'endBreak', employeeId }),
        getActive: (employeeId) => 
            post('/api/shiftManagement', { action: 'getActiveShift', employeeId }),
        getHistory: (filters = {}) => {
            const params = new URLSearchParams(filters).toString();
            return get(`/api/getShifts${params ? `?${params}` : ''}`);
        }
    };
    
    // ============ RECEIPTS ============
    const receipts = {
        generate: (transactionData) => post('/api/generateReceipt', transactionData),
        get: (receiptNumber) => get(`/api/getReceipt?receiptNumber=${receiptNumber}`),
        getByTransaction: (transactionId) => get(`/api/getReceipt?transactionId=${transactionId}`),
        emailToCustomer: (receiptNumber, email) => 
            post('/api/emailReceipt', { receiptNumber, email })
    };
    
    // ============ DISCOUNTS & LOYALTY ============
    const discounts = {
        getActive: () => get('/api/discounts'),
        create: (discountData) => post('/api/discounts', discountData),
        validate: (code, subtotal, items) => 
            post('/api/validateDiscount', { code, subtotal, items }),
        deactivate: (discountId) => 
            put(`/api/discounts/${discountId}`, { active: false })
    };
    
    const loyalty = {
        getBalance: (customerId) => 
            post('/api/loyaltyPoints', { action: 'balance', customerId }),
        earnPoints: (customerId, amount, transactionId) => 
            post('/api/loyaltyPoints', { action: 'earn', customerId, amount, transactionId }),
        redeemPoints: (customerId, points, description) => 
            post('/api/loyaltyPoints', { action: 'redeem', customerId, points, description })
    };
    
    // ============ SYNC ============
    const sync = {
        getChanges: (lastSyncTime, collections) => 
            post('/api/syncChanges', { lastSyncTime, collections }),
        pushChanges: (changes) => 
            post('/api/pushChanges', { changes })
    };
    
    // ============ VOID TRANSACTIONS ============
    const voids = {
        voidTransaction: (transactionId, reason) => 
            post('/api/voidTransaction', { transactionId, reason })
    };
    
    // ============ INITIALIZATION ============
    function init(options = {}) {
        Object.assign(config, options);
        
        // Auto-configure from GolfCoveConfig if available
        if (typeof GolfCoveConfig !== 'undefined') {
            if (GolfCoveConfig.api) {
                config.baseUrl = config.baseUrl || GolfCoveConfig.api.baseUrl || '';
                config.apiKey = config.apiKey || GolfCoveConfig.api.key || '';
            }
        }
        
        loadPendingQueue();
        
        // Restore employee session
        getEmployee();
        
        if (isOnline && pendingQueue.length > 0) {
            setTimeout(processPendingQueue, 2000);
        }
        
        Core.log('info', 'API layer initialized', { 
            pendingRequests: pendingQueue.length,
            isOnline,
            hasApiKey: !!config.apiKey,
            hasEmployee: !!currentEmployee
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
        inventory,
        transactions,
        system,
        cashDrawer,
        alerts,
        notifications,
        
        // New endpoints
        shifts,
        receipts,
        discounts,
        loyalty,
        sync,
        voids,
        
        // Employee context
        setEmployee,
        getEmployee,
        clearEmployee: () => setEmployee(null),
        
        // State
        get isOnline() { return isOnline; },
        get pendingCount() { return pendingQueue.length; },
        get currentEmployee() { return getEmployee(); },
        
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
