/**
 * Golf Cove - Core Application Framework
 * Provides unified utilities, validation, events, and error handling
 */

const GolfCoveCore = (function() {
    'use strict';
    
    // ============ CONFIGURATION ============
    // Use unified config if available, otherwise fallback to defaults
    const getConfig = () => window.GolfCoveConfig || null;
    
    const config = {
        appName: 'Golf Cove',
        version: '2.0.0',
        debug: localStorage.getItem('gc_debug') === 'true',
        // Tax rate should come from unified config
        get taxRate() { 
            return getConfig()?.pricing?.taxRate ?? 0.0635; 
        },
        get currency() { 
            return getConfig()?.pricing?.currency ?? 'USD'; 
        },
        get timezone() { 
            return getConfig()?.business?.timezone ?? 'America/New_York'; 
        }
    };
    
    // ============ ERROR TYPES ============
    const ErrorCodes = {
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        NOT_FOUND: 'NOT_FOUND',
        DUPLICATE: 'DUPLICATE',
        UNAUTHORIZED: 'UNAUTHORIZED',
        NETWORK_ERROR: 'NETWORK_ERROR',
        STORAGE_ERROR: 'STORAGE_ERROR',
        PAYMENT_ERROR: 'PAYMENT_ERROR',
        BOOKING_CONFLICT: 'BOOKING_CONFLICT',
        INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
        INVALID_STATE: 'INVALID_STATE'
    };
    
    class AppError extends Error {
        constructor(code, message, details = {}) {
            super(message);
            this.name = 'AppError';
            this.code = code;
            this.details = details;
            this.timestamp = new Date().toISOString();
        }
        
        toJSON() {
            return {
                code: this.code,
                message: this.message,
                details: this.details,
                timestamp: this.timestamp
            };
        }
    }
    
    // ============ RESULT TYPE ============
    // Consistent return type for all operations
    function success(data = null, message = '') {
        return { success: true, data, message, error: null };
    }
    
    function failure(code, message, details = {}) {
        return { 
            success: false, 
            data: null, 
            message,
            error: new AppError(code, message, details)
        };
    }
    
    // ============ VALIDATION ============
    const Validators = {
        required: (value, field) => {
            if (value === null || value === undefined || value === '') {
                return `${field} is required`;
            }
            return null;
        },
        
        email: (value, field) => {
            if (!value) return null;
            const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!regex.test(value)) {
                return `${field} must be a valid email`;
            }
            return null;
        },
        
        phone: (value, field) => {
            if (!value) return null;
            const cleaned = value.replace(/\D/g, '');
            if (cleaned.length < 10 || cleaned.length > 11) {
                return `${field} must be a valid phone number`;
            }
            return null;
        },
        
        minLength: (min) => (value, field) => {
            if (!value) return null;
            if (value.length < min) {
                return `${field} must be at least ${min} characters`;
            }
            return null;
        },
        
        maxLength: (max) => (value, field) => {
            if (!value) return null;
            if (value.length > max) {
                return `${field} must be no more than ${max} characters`;
            }
            return null;
        },
        
        min: (min) => (value, field) => {
            if (value === null || value === undefined) return null;
            if (value < min) {
                return `${field} must be at least ${min}`;
            }
            return null;
        },
        
        max: (max) => (value, field) => {
            if (value === null || value === undefined) return null;
            if (value > max) {
                return `${field} must be no more than ${max}`;
            }
            return null;
        },
        
        date: (value, field) => {
            if (!value) return null;
            const d = new Date(value);
            if (isNaN(d.getTime())) {
                return `${field} must be a valid date`;
            }
            return null;
        },
        
        futureDate: (value, field) => {
            if (!value) return null;
            const d = new Date(value);
            if (isNaN(d.getTime()) || d < new Date()) {
                return `${field} must be a future date`;
            }
            return null;
        },
        
        pattern: (regex, message) => (value, field) => {
            if (!value) return null;
            if (!regex.test(value)) {
                return message || `${field} format is invalid`;
            }
            return null;
        },
        
        oneOf: (options) => (value, field) => {
            if (!value) return null;
            if (!options.includes(value)) {
                return `${field} must be one of: ${options.join(', ')}`;
            }
            return null;
        }
    };
    
    function validate(data, schema) {
        const errors = {};
        let isValid = true;
        
        for (const [field, rules] of Object.entries(schema)) {
            const value = data[field];
            const fieldErrors = [];
            
            for (const rule of rules) {
                const error = rule(value, field);
                if (error) {
                    fieldErrors.push(error);
                    isValid = false;
                }
            }
            
            if (fieldErrors.length > 0) {
                errors[field] = fieldErrors;
            }
        }
        
        return { isValid, errors };
    }
    
    // ============ EVENT BUS ============
    const eventListeners = new Map();
    
    function on(event, callback, options = {}) {
        if (!eventListeners.has(event)) {
            eventListeners.set(event, []);
        }
        
        const listener = { callback, once: options.once || false };
        eventListeners.get(event).push(listener);
        
        // Return unsubscribe function
        return () => {
            const listeners = eventListeners.get(event);
            const idx = listeners.indexOf(listener);
            if (idx !== -1) listeners.splice(idx, 1);
        };
    }
    
    function once(event, callback) {
        return on(event, callback, { once: true });
    }
    
    function emit(event, data = {}) {
        const listeners = eventListeners.get(event) || [];
        const payload = { event, data, timestamp: Date.now() };
        
        if (config.debug) {
            console.log(`[Event] ${event}`, data);
        }
        
        listeners.forEach((listener, idx) => {
            try {
                listener.callback(payload);
            } catch (e) {
                console.error(`Error in event handler for ${event}:`, e);
            }
            
            if (listener.once) {
                listeners.splice(idx, 1);
            }
        });
        
        // Track analytics events
        trackEvent(event, data);
    }
    
    // ============ ANALYTICS ============
    const analyticsQueue = [];
    let analyticsTimer = null;
    
    function trackEvent(event, data = {}) {
        const entry = {
            event,
            data,
            timestamp: new Date().toISOString(),
            user: getCurrentUser(),
            session: getSessionId()
        };
        
        analyticsQueue.push(entry);
        
        // Batch send analytics
        if (!analyticsTimer) {
            analyticsTimer = setTimeout(flushAnalytics, 5000);
        }
        
        // Store locally
        const events = JSON.parse(localStorage.getItem('gc_analytics') || '[]');
        events.push(entry);
        
        // Keep last 1000 events
        if (events.length > 1000) {
            events.splice(0, events.length - 1000);
        }
        
        localStorage.setItem('gc_analytics', JSON.stringify(events));
    }
    
    async function flushAnalytics() {
        analyticsTimer = null;
        
        if (analyticsQueue.length === 0) return;
        
        const events = [...analyticsQueue];
        analyticsQueue.length = 0;
        
        try {
            // Send to Firebase
            if (typeof GolfCoveFirebase !== 'undefined') {
                await GolfCoveFirebase.trackEvents(events);
            }
        } catch (e) {
            // Re-queue on failure
            analyticsQueue.push(...events);
            console.warn('Failed to flush analytics:', e);
        }
    }
    
    function getCurrentUser() {
        const user = localStorage.getItem('gc_current_user');
        return user ? JSON.parse(user) : null;
    }
    
    function getSessionId() {
        let sessionId = sessionStorage.getItem('gc_session_id');
        if (!sessionId) {
            sessionId = 'sess_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
            sessionStorage.setItem('gc_session_id', sessionId);
        }
        return sessionId;
    }
    
    // ============ CACHING ============
    const cache = new Map();
    const cacheTTL = new Map();
    const cacheAccess = new Map(); // Track access for LRU
    const MAX_CACHE_SIZE = 500;
    
    function cacheGet(key) {
        if (typeof key !== 'string' || !key) return null;
        
        const ttl = cacheTTL.get(key);
        if (ttl && Date.now() > ttl) {
            cache.delete(key);
            cacheTTL.delete(key);
            cacheAccess.delete(key);
            return null;
        }
        
        if (cache.has(key)) {
            cacheAccess.set(key, Date.now()); // Update access time
        }
        return cache.get(key);
    }
    
    function cacheSet(key, value, ttlMs = 60000) {
        if (typeof key !== 'string' || !key) return;
        if (ttlMs < 0 || ttlMs > 86400000) ttlMs = 60000; // Max 24 hours
        
        // Evict old entries if at capacity
        if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
            evictLRU();
        }
        
        cache.set(key, value);
        cacheTTL.set(key, Date.now() + ttlMs);
        cacheAccess.set(key, Date.now());
    }
    
    function evictLRU() {
        let oldestKey = null;
        let oldestTime = Infinity;
        
        for (const [key, time] of cacheAccess) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            cache.delete(oldestKey);
            cacheTTL.delete(oldestKey);
            cacheAccess.delete(oldestKey);
        }
    }
    
    function cacheClear(pattern = null) {
        if (pattern) {
            for (const key of cache.keys()) {
                if (key.includes(pattern)) {
                    cache.delete(key);
                    cacheTTL.delete(key);
                }
            }
        } else {
            cache.clear();
            cacheTTL.clear();
        }
    }
    
    // ============ FORMATTING ============
    const Format = {
        currency: (amount, showSymbol = true) => {
            const num = parseFloat(amount);
            if (isNaN(num) || !isFinite(num)) {
                return showSymbol ? '$0.00' : '0.00';
            }
            // Clamp to reasonable range to prevent display issues
            const clamped = Math.max(-999999999, Math.min(999999999, num));
            const formatted = clamped.toFixed(2);
            return showSymbol ? `$${formatted}` : formatted;
        },
        
        phone: (phone) => {
            if (!phone) return '';
            const cleaned = phone.replace(/\D/g, '');
            if (cleaned.length === 10) {
                return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
            }
            if (cleaned.length === 11) {
                return `+${cleaned[0]} (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
            }
            return phone;
        },
        
        date: (date, format = 'short') => {
            const d = new Date(date);
            if (isNaN(d.getTime())) return '';
            
            const formats = {
                short: { month: 'numeric', day: 'numeric' },
                medium: { month: 'short', day: 'numeric', year: 'numeric' },
                long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
                iso: null
            };
            
            if (format === 'iso') return d.toISOString().split('T')[0];
            return d.toLocaleDateString('en-US', formats[format] || formats.short);
        },
        
        time: (date, use24 = false) => {
            const d = new Date(date);
            if (isNaN(d.getTime())) return '';
            
            return d.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: !use24
            });
        },
        
        relativeTime: (date) => {
            const d = new Date(date);
            const now = new Date();
            const diffMs = now - d;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return Format.date(date, 'medium');
        },
        
        name: (first, last) => {
            const f = (first || '').trim();
            const l = (last || '').trim();
            return [f, l].filter(Boolean).join(' ') || 'Unknown';
        },
        
        initials: (first, last) => {
            const f = (first || '')[0] || '';
            const l = (last || '')[0] || '';
            return (f + l).toUpperCase() || '?';
        },
        
        percentage: (value, decimals = 0) => {
            return `${parseFloat(value * 100).toFixed(decimals)}%`;
        },
        
        truncate: (str, length = 50) => {
            if (!str || str.length <= length) return str;
            return str.substring(0, length - 3) + '...';
        }
    };
    
    // ============ DEBOUNCE/THROTTLE ============
    function debounce(fn, wait = 300) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), wait);
        };
    }
    
    function throttle(fn, limit = 300) {
        let lastCall = 0;
        return function(...args) {
            const now = Date.now();
            if (now - lastCall >= limit) {
                lastCall = now;
                return fn.apply(this, args);
            }
        };
    }
    
    // ============ ASYNC UTILITIES ============
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async function retry(fn, attempts = 3, delay = 1000, options = {}) {
        const { exponentialBackoff = true, maxDelay = 30000, onRetry = null } = options;
        let lastError;
        
        if (typeof fn !== 'function') {
            throw new AppError(ErrorCodes.INVALID_REQUEST, 'retry requires a function');
        }
        
        for (let i = 0; i < attempts; i++) {
            try {
                return await fn();
            } catch (e) {
                lastError = e;
                if (i < attempts - 1) {
                    const waitTime = exponentialBackoff 
                        ? Math.min(delay * Math.pow(2, i), maxDelay)
                        : delay;
                    
                    if (onRetry) {
                        onRetry({ attempt: i + 1, error: e, nextDelay: waitTime });
                    }
                    
                    log('warn', `Retry attempt ${i + 1}/${attempts}`, { error: e.message, waitTime });
                    await sleep(waitTime);
                }
            }
        }
        log('error', `All ${attempts} retry attempts failed`, { error: lastError?.message });
        throw lastError;
    }
    
    function timeout(promise, ms, message = 'Operation timed out') {
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(message)), ms)
            )
        ]);
    }
    
    // ============ ID GENERATION ============
    function generateId(prefix = '') {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 8);
        return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
    }
    
    function generateCode(length = 8, chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') {
        let code = '';
        for (let i = 0; i < length; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    // ============ DEEP CLONE/MERGE ============
    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (Array.isArray(obj)) return obj.map(deepClone);
        
        const clone = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clone[key] = deepClone(obj[key]);
            }
        }
        return clone;
    }
    
    function deepMerge(target, source) {
        const output = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    output[key] = deepMerge(output[key] || {}, source[key]);
                } else {
                    output[key] = source[key];
                }
            }
        }
        
        return output;
    }
    
    // ============ LOGGING ============
    const logRateLimiter = new Map();
    const LOG_RATE_LIMIT = 10; // Max logs per key per minute
    
    function serializeError(obj) {
        if (obj instanceof Error) {
            return { message: obj.message, stack: obj.stack, name: obj.name };
        }
        if (typeof obj === 'object' && obj !== null) {
            const result = {};
            for (const key of Object.keys(obj)) {
                result[key] = serializeError(obj[key]);
            }
            return result;
        }
        return obj;
    }
    
    function isRateLimited(key) {
        const now = Date.now();
        const window = 60000; // 1 minute
        
        if (!logRateLimiter.has(key)) {
            logRateLimiter.set(key, { count: 1, resetAt: now + window });
            return false;
        }
        
        const entry = logRateLimiter.get(key);
        if (now > entry.resetAt) {
            entry.count = 1;
            entry.resetAt = now + window;
            return false;
        }
        
        entry.count++;
        return entry.count > LOG_RATE_LIMIT;
    }
    
    function log(level, message, data = {}) {
        if (!config.debug && level === 'debug') return;
        
        // Rate limit repeated log messages
        const rateKey = `${level}:${message}`;
        if (isRateLimited(rateKey)) return;
        
        const serializedData = serializeError(data);
        const entry = {
            level,
            message: String(message).substring(0, 500), // Truncate long messages
            data: serializedData,
            timestamp: new Date().toISOString()
        };
        
        const prefix = `[${config.appName}]`;
        
        switch (level) {
            case 'error':
                console.error(prefix, message, serializedData);
                break;
            case 'warn':
                console.warn(prefix, message, serializedData);
                break;
            case 'info':
                console.info(prefix, message, serializedData);
                break;
            case 'debug':
                console.log(prefix, message, serializedData);
                break;
        }
        
        // Store errors with size limit check
        if (level === 'error') {
            try {
                const errors = JSON.parse(localStorage.getItem('gc_error_log') || '[]');
                errors.unshift(entry);
                if (errors.length > 100) errors.length = 100;
                
                const errorJson = JSON.stringify(errors);
                if (errorJson.length < 500000) { // 500KB limit
                    localStorage.setItem('gc_error_log', errorJson);
                }
            } catch (e) {
                console.error('Failed to store error log', e);
            }
        }
    }
    
    // ============ PUBLIC API ============
    return {
        // Config
        config,
        
        // Errors
        ErrorCodes,
        AppError,
        
        // Results
        success,
        failure,
        
        // Validation
        Validators,
        validate,
        
        // Events
        on,
        once,
        emit,
        
        // Analytics
        trackEvent,
        flushAnalytics,
        
        // Caching
        cache: { get: cacheGet, set: cacheSet, clear: cacheClear },
        
        // Formatting
        Format,
        
        // Utilities
        debounce,
        throttle,
        sleep,
        retry,
        timeout,
        generateId,
        generateCode,
        deepClone,
        deepMerge,
        
        // Logging
        log,
        
        // Convenience
        getCurrentUser,
        getSessionId
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.GolfCoveCore = GolfCoveCore;
    window.$gc = GolfCoveCore; // Short alias
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveCore;
}
