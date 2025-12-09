/**
 * Golf Cove - Utility Functions
 * Common helper functions used across the application
 */

const GolfCoveUtils = (function() {
    'use strict';
    
    // ============ DATE/TIME FORMATTING ============
    function formatDate(date, format = 'short') {
        const d = new Date(date);
        
        const formats = {
            short: { month: 'short', day: 'numeric' },
            medium: { month: 'short', day: 'numeric', year: 'numeric' },
            long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
            iso: null // Returns ISO string
        };
        
        if (format === 'iso') {
            return d.toISOString().split('T')[0];
        }
        
        return d.toLocaleDateString('en-US', formats[format] || formats.short);
    }
    
    function formatTime(date, format = '12h') {
        const d = new Date(date);
        
        if (format === '24h') {
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    
    function formatDateTime(date) {
        return `${formatDate(date, 'medium')} at ${formatTime(date)}`;
    }
    
    function getRelativeTime(date) {
        const now = new Date();
        const d = new Date(date);
        const diff = now - d;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        
        return formatDate(date, 'short');
    }
    
    function getTodayISO() {
        return new Date().toISOString().split('T')[0];
    }
    
    function isToday(date) {
        return new Date(date).toDateString() === new Date().toDateString();
    }
    
    function isWeekend(date) {
        const d = new Date(date);
        return d.getDay() === 0 || d.getDay() === 6;
    }
    
    // ============ CURRENCY FORMATTING ============
    function formatCurrency(amount, showCents = true) {
        const num = parseFloat(amount) || 0;
        if (showCents) {
            return '$' + num.toFixed(2);
        }
        return '$' + Math.round(num);
    }
    
    function parseCurrency(str) {
        return parseFloat(str.replace(/[$,]/g, '')) || 0;
    }
    
    // ============ STRING HELPERS ============
    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
    
    function titleCase(str) {
        return str.split(' ').map(word => capitalize(word)).join(' ');
    }
    
    function truncate(str, length = 50, suffix = '...') {
        if (str.length <= length) return str;
        return str.substring(0, length - suffix.length) + suffix;
    }
    
    function slugify(str) {
        return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    
    function getInitials(name, maxLength = 2) {
        return name.split(' ')
            .map(word => word.charAt(0).toUpperCase())
            .slice(0, maxLength)
            .join('');
    }
    
    // ============ PHONE FORMATTING ============
    function formatPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
        }
        if (cleaned.length === 11 && cleaned.startsWith('1')) {
            return `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
        }
        return phone;
    }
    
    function cleanPhone(phone) {
        return phone.replace(/\D/g, '');
    }
    
    // ============ VALIDATION ============
    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    
    function isValidPhone(phone) {
        const cleaned = cleanPhone(phone);
        return cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'));
    }
    
    function isValidPin(pin) {
        return /^\d{4}$/.test(pin);
    }
    
    // ============ ARRAY HELPERS ============
    function groupBy(array, key) {
        return array.reduce((groups, item) => {
            const value = typeof key === 'function' ? key(item) : item[key];
            groups[value] = groups[value] || [];
            groups[value].push(item);
            return groups;
        }, {});
    }
    
    function sortBy(array, key, direction = 'asc') {
        return [...array].sort((a, b) => {
            const aVal = typeof key === 'function' ? key(a) : a[key];
            const bVal = typeof key === 'function' ? key(b) : b[key];
            const compare = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return direction === 'asc' ? compare : -compare;
        });
    }
    
    function uniqueBy(array, key) {
        const seen = new Set();
        return array.filter(item => {
            const value = typeof key === 'function' ? key(item) : item[key];
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
        });
    }
    
    // ============ OBJECT HELPERS ============
    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    
    function isEmpty(obj) {
        if (obj == null) return true;
        if (Array.isArray(obj)) return obj.length === 0;
        if (typeof obj === 'object') return Object.keys(obj).length === 0;
        if (typeof obj === 'string') return obj.trim() === '';
        return false;
    }
    
    function pick(obj, keys) {
        return keys.reduce((acc, key) => {
            if (obj.hasOwnProperty(key)) acc[key] = obj[key];
            return acc;
        }, {});
    }
    
    function omit(obj, keys) {
        const result = { ...obj };
        keys.forEach(key => delete result[key]);
        return result;
    }
    
    // ============ DOM HELPERS ============
    function $(selector) {
        return document.querySelector(selector);
    }
    
    function $$(selector) {
        return document.querySelectorAll(selector);
    }
    
    function createElement(tag, attributes = {}, children = []) {
        const el = document.createElement(tag);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                el.className = value;
            } else if (key === 'style' && typeof value === 'object') {
                Object.assign(el.style, value);
            } else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else {
                el.setAttribute(key, value);
            }
        });
        
        children.forEach(child => {
            if (typeof child === 'string') {
                el.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                el.appendChild(child);
            }
        });
        
        return el;
    }
    
    // ============ DEBOUNCE/THROTTLE ============
    function debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    function throttle(func, limit = 300) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    // ============ LOCAL STORAGE ============
    function getStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    }
    
    function setStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }
    
    function removeStorage(key) {
        localStorage.removeItem(key);
    }
    
    // ============ ID GENERATION ============
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    function generateNumericId() {
        return Date.now();
    }
    
    // Public API
    return {
        // Date/Time
        formatDate,
        formatTime,
        formatDateTime,
        getRelativeTime,
        getTodayISO,
        isToday,
        isWeekend,
        
        // Currency
        formatCurrency,
        parseCurrency,
        
        // Strings
        capitalize,
        titleCase,
        truncate,
        slugify,
        getInitials,
        
        // Phone
        formatPhone,
        cleanPhone,
        
        // Validation
        isValidEmail,
        isValidPhone,
        isValidPin,
        
        // Arrays
        groupBy,
        sortBy,
        uniqueBy,
        
        // Objects
        deepClone,
        isEmpty,
        pick,
        omit,
        
        // DOM
        $,
        $$,
        createElement,
        
        // Timing
        debounce,
        throttle,
        
        // Storage
        getStorage,
        setStorage,
        removeStorage,
        
        // IDs
        generateId,
        generateNumericId
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveUtils;
}
