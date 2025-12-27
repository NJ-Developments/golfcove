/**
 * Golf Cove - Centralized Error Handler
 * ======================================
 * Unified error handling, logging, and reporting.
 * 
 * Features:
 * - Centralized error collection
 * - User-friendly error messages
 * - Error categorization
 * - Optional remote logging
 * - Toast notifications for user errors
 * - Console logging for dev errors
 * 
 * @version 1.0.0
 */

/// <reference path="./types.js" />

const ErrorHandler = (function() {
    'use strict';

    // ============================================
    // ERROR CODES
    // ============================================
    const ErrorCodes = {
        // Network & API
        NETWORK_ERROR: 'NETWORK_ERROR',
        TIMEOUT: 'TIMEOUT',
        API_ERROR: 'API_ERROR',
        UNAUTHORIZED: 'UNAUTHORIZED',
        FORBIDDEN: 'FORBIDDEN',
        NOT_FOUND: 'NOT_FOUND',
        SERVER_ERROR: 'SERVER_ERROR',
        
        // Validation
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        REQUIRED_FIELD: 'REQUIRED_FIELD',
        INVALID_FORMAT: 'INVALID_FORMAT',
        DUPLICATE: 'DUPLICATE',
        
        // Business Logic
        BOOKING_CONFLICT: 'BOOKING_CONFLICT',
        INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
        MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',
        INVENTORY_LOW: 'INVENTORY_LOW',
        PAYMENT_FAILED: 'PAYMENT_FAILED',
        REFUND_FAILED: 'REFUND_FAILED',
        
        // System
        STORAGE_FULL: 'STORAGE_FULL',
        SYNC_FAILED: 'SYNC_FAILED',
        PERMISSION_DENIED: 'PERMISSION_DENIED',
        SESSION_EXPIRED: 'SESSION_EXPIRED',
        
        // Generic
        UNKNOWN: 'UNKNOWN'
    };

    // ============================================
    // USER-FRIENDLY MESSAGES
    // ============================================
    const UserMessages = {
        [ErrorCodes.NETWORK_ERROR]: 'Unable to connect. Please check your internet connection.',
        [ErrorCodes.TIMEOUT]: 'The request took too long. Please try again.',
        [ErrorCodes.API_ERROR]: 'Something went wrong. Please try again.',
        [ErrorCodes.UNAUTHORIZED]: 'Please sign in to continue.',
        [ErrorCodes.FORBIDDEN]: 'You don\'t have permission to do this.',
        [ErrorCodes.NOT_FOUND]: 'The requested item was not found.',
        [ErrorCodes.SERVER_ERROR]: 'Server error. Our team has been notified.',
        
        [ErrorCodes.VALIDATION_ERROR]: 'Please check your input and try again.',
        [ErrorCodes.REQUIRED_FIELD]: 'Please fill in all required fields.',
        [ErrorCodes.INVALID_FORMAT]: 'Please check the format of your input.',
        [ErrorCodes.DUPLICATE]: 'This item already exists.',
        
        [ErrorCodes.BOOKING_CONFLICT]: 'This time slot is no longer available.',
        [ErrorCodes.INSUFFICIENT_FUNDS]: 'Insufficient balance for this transaction.',
        [ErrorCodes.MEMBERSHIP_EXPIRED]: 'Your membership has expired.',
        [ErrorCodes.INVENTORY_LOW]: 'This item is low in stock.',
        [ErrorCodes.PAYMENT_FAILED]: 'Payment failed. Please try another method.',
        [ErrorCodes.REFUND_FAILED]: 'Refund could not be processed.',
        
        [ErrorCodes.STORAGE_FULL]: 'Storage is full. Please clear some data.',
        [ErrorCodes.SYNC_FAILED]: 'Failed to sync data. Will retry automatically.',
        [ErrorCodes.PERMISSION_DENIED]: 'You don\'t have permission for this action.',
        [ErrorCodes.SESSION_EXPIRED]: 'Your session has expired. Please sign in again.',
        
        [ErrorCodes.UNKNOWN]: 'An unexpected error occurred.'
    };

    // ============================================
    // STATE
    // ============================================
    const errors = [];
    const MAX_ERRORS = 100;
    let listeners = [];
    let remoteLoggingEnabled = false;
    let remoteLoggingUrl = null;

    // ============================================
    // ERROR CLASS
    // ============================================
    class AppError extends Error {
        /**
         * @param {string} code - Error code from ErrorCodes
         * @param {string} [message] - Technical error message
         * @param {Object} [details] - Additional details
         */
        constructor(code, message, details = {}) {
            super(message || UserMessages[code] || 'An error occurred');
            this.name = 'AppError';
            this.code = code || ErrorCodes.UNKNOWN;
            this.details = details;
            this.timestamp = new Date().toISOString();
            this.userMessage = UserMessages[this.code] || this.message;
            this.id = `err_${Date.now().toString(36)}`;
            
            // Capture stack trace
            if (Error.captureStackTrace) {
                Error.captureStackTrace(this, AppError);
            }
        }

        toJSON() {
            return {
                id: this.id,
                code: this.code,
                message: this.message,
                userMessage: this.userMessage,
                details: this.details,
                timestamp: this.timestamp,
                stack: this.stack
            };
        }
    }

    // ============================================
    // CORE FUNCTIONS
    // ============================================

    /**
     * Handle an error
     * @param {Error|AppError|string} error 
     * @param {Object} context - Additional context
     * @returns {AppError}
     */
    function handle(error, context = {}) {
        // Normalize to AppError
        let appError;
        
        if (error instanceof AppError) {
            appError = error;
        } else if (error instanceof Error) {
            appError = new AppError(
                inferErrorCode(error),
                error.message,
                { originalError: error.name, ...context }
            );
            appError.stack = error.stack;
        } else if (typeof error === 'string') {
            appError = new AppError(ErrorCodes.UNKNOWN, error, context);
        } else {
            appError = new AppError(ErrorCodes.UNKNOWN, 'Unknown error', { error, ...context });
        }

        // Add context
        appError.details = { ...appError.details, ...context };

        // Store
        storeError(appError);

        // Log
        logError(appError);

        // Notify listeners
        notifyListeners(appError);

        // Remote logging
        if (remoteLoggingEnabled) {
            sendToRemote(appError);
        }

        return appError;
    }

    /**
     * Create and handle an error
     * @param {string} code 
     * @param {string} message 
     * @param {Object} details 
     * @returns {AppError}
     */
    function create(code, message, details = {}) {
        return handle(new AppError(code, message, details));
    }

    /**
     * Infer error code from standard Error
     * @param {Error} error 
     * @returns {string}
     */
    function inferErrorCode(error) {
        const message = (error.message || '').toLowerCase();
        const name = (error.name || '').toLowerCase();

        if (name === 'typeerror') return ErrorCodes.VALIDATION_ERROR;
        if (name === 'syntaxerror') return ErrorCodes.VALIDATION_ERROR;
        if (name === 'networkerror' || message.includes('network')) return ErrorCodes.NETWORK_ERROR;
        if (message.includes('timeout')) return ErrorCodes.TIMEOUT;
        if (message.includes('unauthorized') || message.includes('401')) return ErrorCodes.UNAUTHORIZED;
        if (message.includes('forbidden') || message.includes('403')) return ErrorCodes.FORBIDDEN;
        if (message.includes('not found') || message.includes('404')) return ErrorCodes.NOT_FOUND;
        if (message.includes('quota') || message.includes('storage')) return ErrorCodes.STORAGE_FULL;

        return ErrorCodes.UNKNOWN;
    }

    /**
     * Store error in history
     * @param {AppError} error 
     */
    function storeError(error) {
        errors.unshift(error.toJSON());
        
        // Trim to max size
        while (errors.length > MAX_ERRORS) {
            errors.pop();
        }

        // Persist recent errors
        try {
            localStorage.setItem('gc_errors', JSON.stringify(errors.slice(0, 20)));
        } catch (e) {
            // Storage might be full, ignore
        }
    }

    /**
     * Log error to console
     * @param {AppError} error 
     */
    function logError(error) {
        const style = 'color: #e74c3c; font-weight: bold;';
        
        console.group(`%c[Error] ${error.code}`, style);
        console.error(error.message);
        if (Object.keys(error.details).length > 0) {
            console.log('Details:', error.details);
        }
        if (error.stack) {
            console.log('Stack:', error.stack);
        }
        console.groupEnd();
    }

    /**
     * Notify error listeners
     * @param {AppError} error 
     */
    function notifyListeners(error) {
        for (const listener of listeners) {
            try {
                listener(error);
            } catch (e) {
                console.error('[ErrorHandler] Listener error:', e);
            }
        }
    }

    /**
     * Send error to remote logging service
     * @param {AppError} error 
     */
    async function sendToRemote(error) {
        if (!remoteLoggingUrl) return;

        try {
            await fetch(remoteLoggingUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...error.toJSON(),
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                })
            });
        } catch (e) {
            // Ignore remote logging failures
        }
    }

    // ============================================
    // LISTENER MANAGEMENT
    // ============================================

    /**
     * Subscribe to errors
     * @param {Function} callback 
     * @returns {Function} Unsubscribe function
     */
    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        listeners.push(callback);
        return () => {
            listeners = listeners.filter(l => l !== callback);
        };
    }

    // ============================================
    // USER NOTIFICATION
    // ============================================

    /**
     * Show error to user (integrates with toast system)
     * @param {AppError|string} error 
     */
    function showToUser(error) {
        const message = error instanceof AppError 
            ? error.userMessage 
            : (typeof error === 'string' ? error : 'An error occurred');

        // Try to use existing toast system
        if (typeof showToast === 'function') {
            showToast(message, 'error');
        } else if (typeof GolfCoveToast !== 'undefined') {
            GolfCoveToast.error(message);
        } else if (typeof Store !== 'undefined') {
            Store.Actions.notify({ type: 'error', message });
        } else {
            // Fallback to alert
            console.error('[User Error]', message);
            // Don't alert in production, just log
        }
    }

    /**
     * Handle error and show to user
     * @param {Error} error 
     * @param {Object} context 
     */
    function handleAndShow(error, context = {}) {
        const appError = handle(error, context);
        showToUser(appError);
        return appError;
    }

    // ============================================
    // GLOBAL ERROR HANDLERS
    // ============================================

    /**
     * Install global error handlers
     */
    function installGlobalHandlers() {
        // Uncaught errors
        window.addEventListener('error', (event) => {
            handle(event.error || new Error(event.message), {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                source: 'global'
            });
        });

        // Unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            handle(event.reason || new Error('Unhandled promise rejection'), {
                source: 'promise'
            });
        });

        console.log('[ErrorHandler] Global handlers installed');
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Wrap a function to catch and handle errors
     * @param {Function} fn 
     * @param {Object} context 
     * @returns {Function}
     */
    function wrap(fn, context = {}) {
        return function(...args) {
            try {
                const result = fn.apply(this, args);
                
                // Handle async functions
                if (result && typeof result.catch === 'function') {
                    return result.catch(error => {
                        handle(error, context);
                        throw error;
                    });
                }
                
                return result;
            } catch (error) {
                handle(error, context);
                throw error;
            }
        };
    }

    /**
     * Try-catch wrapper that returns result or error
     * @param {Function} fn 
     * @returns {Promise<{success: boolean, data?: any, error?: AppError}>}
     */
    async function tryCatch(fn) {
        try {
            const result = await fn();
            return { success: true, data: result };
        } catch (error) {
            const appError = handle(error);
            return { success: false, error: appError };
        }
    }

    /**
     * Assert a condition, throw if false
     * @param {boolean} condition 
     * @param {string} code 
     * @param {string} message 
     */
    function assert(condition, code, message) {
        if (!condition) {
            throw new AppError(code, message);
        }
    }

    // ============================================
    // QUERY & MANAGEMENT
    // ============================================

    /**
     * Get all errors
     * @returns {Object[]}
     */
    function getAll() {
        return [...errors];
    }

    /**
     * Get recent errors
     * @param {number} count 
     * @returns {Object[]}
     */
    function getRecent(count = 10) {
        return errors.slice(0, count);
    }

    /**
     * Get errors by code
     * @param {string} code 
     * @returns {Object[]}
     */
    function getByCode(code) {
        return errors.filter(e => e.code === code);
    }

    /**
     * Clear all errors
     */
    function clear() {
        errors.length = 0;
        localStorage.removeItem('gc_errors');
    }

    // ============================================
    // CONFIGURATION
    // ============================================

    /**
     * Enable remote logging
     * @param {string} url - Endpoint to send errors to
     */
    function enableRemoteLogging(url) {
        remoteLoggingUrl = url;
        remoteLoggingEnabled = true;
    }

    /**
     * Disable remote logging
     */
    function disableRemoteLogging() {
        remoteLoggingEnabled = false;
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    function init(options = {}) {
        if (options.installGlobalHandlers !== false) {
            installGlobalHandlers();
        }

        if (options.remoteLoggingUrl) {
            enableRemoteLogging(options.remoteLoggingUrl);
        }

        // Load persisted errors
        try {
            const saved = localStorage.getItem('gc_errors');
            if (saved) {
                const parsed = JSON.parse(saved);
                errors.push(...parsed);
            }
        } catch (e) {
            // Ignore
        }

        console.log('[ErrorHandler] Initialized');
    }

    // ============================================
    // PUBLIC API
    // ============================================
    return {
        // Error class
        AppError,
        
        // Error codes
        ErrorCodes,
        
        // User messages
        UserMessages,
        
        // Core functions
        handle,
        create,
        handleAndShow,
        showToUser,
        
        // Listeners
        subscribe,
        
        // Utilities
        wrap,
        tryCatch,
        assert,
        
        // Query
        getAll,
        getRecent,
        getByCode,
        clear,
        
        // Configuration
        enableRemoteLogging,
        disableRemoteLogging,
        installGlobalHandlers,
        
        // Initialize
        init
    };
})();

// Auto-init with global handlers
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ErrorHandler.init());
    } else {
        ErrorHandler.init();
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.ErrorHandler = ErrorHandler;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}
