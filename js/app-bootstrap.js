/**
 * Golf Cove - Application Bootstrap
 * Initializes all modules and provides a unified application interface
 */

const GolfCoveApp = (function() {
    'use strict';
    
    // ============ CONFIGURATION ============
    const config = {
        version: '2.0.0',
        environment: 'production',
        debug: false,
        modules: [
            'Config',           // Unified config - load first!
            'Core',
            'ValidationSchemas',
            'Services',         // Unified services layer
            'API',
            'State',
            'Notifications',
            'SyncManager',
            'TransactionManager',
            'BookingManager',
            'CustomerManager'
        ]
    };
    
    let initialized = false;
    const loadedModules = new Map();
    
    // ============ MODULE REGISTRY ============
    const moduleMap = {
        'Config': () => window.GolfCoveConfig,
        'Core': () => window.GolfCoveCore,
        'Services': () => window.GolfCoveServices,
        'ValidationSchemas': () => window.ValidationSchemas,
        'API': () => window.GolfCoveAPI,
        'State': () => window.GolfCoveState,
        'Notifications': () => window.GolfCoveNotifications,
        'SyncManager': () => window.GolfCoveSyncManager,
        'TransactionManager': () => window.GolfCoveTransactionManager,
        'BookingManager': () => window.GolfCoveBookingManager,
        'CustomerManager': () => window.GolfCoveCustomerManager,
        
        // Legacy module compatibility
        'Database': () => window.GolfCoveDB,
        'Customers': () => window.GolfCoveCustomers,
        'Booking': () => window.GolfCoveBooking,
        'GiftCards': () => window.GolfCoveGiftCards,
        'Inventory': () => window.GolfCoveInventory,
        'Reports': () => window.GolfCoveReports
    };
    
    // ============ INITIALIZATION ============
    async function init(options = {}) {
        if (initialized) {
            console.warn('Golf Cove App already initialized');
            return;
        }
        
        Object.assign(config, options);
        
        console.log(`🏌️ Golf Cove v${config.version} initializing...`);
        
        const startTime = performance.now();
        
        try {
            // Helper to safely initialize a module with error boundary
            const safeInit = (name, initFn) => {
                try {
                    const result = initFn();
                    if (result) loadedModules.set(name, result);
                    return true;
                } catch (error) {
                    console.error(`[${name}] Module initialization failed:`, error);
                    // Continue with other modules
                    return false;
                }
            };
            
            // 1. Initialize core first
            safeInit('Core', () => {
                if (window.GolfCoveCore) {
                    window.GolfCoveCore.config.debug = config.debug;
                    return window.GolfCoveCore;
                }
            });
            
            // 2. Initialize validation schemas
            safeInit('ValidationSchemas', () => window.ValidationSchemas);
            
            // 3. Initialize API layer
            safeInit('API', () => {
                if (window.GolfCoveAPI) {
                    window.GolfCoveAPI.init({ baseUrl: config.apiUrl || '' });
                    return window.GolfCoveAPI;
                }
            });
            
            // 4. Initialize state management
            safeInit('State', () => {
                if (window.GolfCoveState) {
                    window.GolfCoveState.init();
                    return window.GolfCoveState;
                }
            });
            
            // 5. Initialize notifications
            safeInit('Notifications', () => {
                if (window.GolfCoveNotifications) {
                    window.GolfCoveNotifications.init();
                    return window.GolfCoveNotifications;
                }
            });
            
            // 6. Initialize sync manager
            safeInit('SyncManager', () => {
                if (window.GolfCoveSyncManager) {
                    window.GolfCoveSyncManager.init({
                        collections: ['customers', 'bookings', 'tabs', 'transactions', 'inventory']
                    });
                    return window.GolfCoveSyncManager;
                }
            });
            
            // 7. Initialize booking manager
            safeInit('BookingManager', () => {
                if (window.GolfCoveBookingManager) {
                    window.GolfCoveBookingManager.init();
                    return window.GolfCoveBookingManager;
                }
            });
            
            // Load other modules
            for (const [name, getter] of Object.entries(moduleMap)) {
                if (!loadedModules.has(name)) {
                    const module = getter();
                    if (module) {
                        loadedModules.set(name, module);
                    }
                }
            }
            
            // Set up global event listeners
            setupGlobalListeners();
            
            // Set up keyboard shortcuts
            setupKeyboardShortcuts();
            
            // Check for updates
            checkForUpdates();
            
            initialized = true;
            
            const loadTime = Math.round(performance.now() - startTime);
            console.log(`✅ Golf Cove initialized in ${loadTime}ms`);
            console.log(`📦 Loaded modules: ${Array.from(loadedModules.keys()).join(', ')}`);
            
            // Emit ready event
            if (window.GolfCoveCore) {
                window.GolfCoveCore.emit('app:ready', { 
                    version: config.version,
                    modules: Array.from(loadedModules.keys()),
                    loadTime
                });
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Golf Cove initialization failed:', error);
            
            if (window.GolfCoveNotifications) {
                window.GolfCoveNotifications.error(
                    'Application failed to initialize. Please refresh the page.',
                    { title: 'Initialization Error', duration: 0 }
                );
            }
            
            throw error;
        }
    }
    
    // ============ GLOBAL EVENT LISTENERS ============
    function setupGlobalListeners() {
        // Handle online/offline
        window.addEventListener('online', () => {
            if (window.GolfCoveNotifications) {
                window.GolfCoveNotifications.success('Connection restored', {
                    title: 'Online'
                });
            }
        });
        
        window.addEventListener('offline', () => {
            if (window.GolfCoveNotifications) {
                window.GolfCoveNotifications.warning(
                    'Working offline. Changes will sync when connected.',
                    { title: 'Offline', duration: 0 }
                );
            }
        });
        
        // Handle unhandled errors
        window.addEventListener('error', (event) => {
            if (window.GolfCoveCore) {
                window.GolfCoveCore.log('error', 'Unhandled error', {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno
                });
            }
        });
        
        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            if (window.GolfCoveCore) {
                window.GolfCoveCore.log('error', 'Unhandled promise rejection', {
                    reason: event.reason?.message || event.reason
                });
            }
        });
        
        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Sync when tab becomes visible
                if (window.GolfCoveSyncManager && window.GolfCoveSyncManager.isOnline) {
                    window.GolfCoveSyncManager.syncAll();
                }
            }
        });
        
        // Warn before unload if there are pending changes
        window.addEventListener('beforeunload', (event) => {
            const pendingCount = window.GolfCoveSyncManager?.pendingCount || 0;
            if (pendingCount > 0) {
                event.preventDefault();
                event.returnValue = '';
            }
        });
    }
    
    // ============ KEYBOARD SHORTCUTS ============
    function setupKeyboardShortcuts() {
        const shortcuts = {
            'ctrl+k': () => openQuickSearch(),
            'ctrl+b': () => openBookingModal(),
            'ctrl+t': () => openNewTab(),
            'ctrl+p': () => openPaymentModal(),
            'ctrl+shift+s': () => forceSyncAll(),
            'escape': () => closeAllModals(),
            'f1': () => showHelp()
        };
        
        document.addEventListener('keydown', (event) => {
            // Build key combo string
            let combo = '';
            if (event.ctrlKey) combo += 'ctrl+';
            if (event.shiftKey) combo += 'shift+';
            if (event.altKey) combo += 'alt+';
            combo += event.key.toLowerCase();
            
            const handler = shortcuts[combo];
            if (handler) {
                event.preventDefault();
                handler();
            }
        });
    }
    
    function openQuickSearch() {
        if (window.GolfCoveCore) {
            window.GolfCoveCore.emit('ui:openQuickSearch');
        }
    }
    
    function openBookingModal() {
        if (window.GolfCoveCore) {
            window.GolfCoveCore.emit('ui:openBookingModal');
        }
    }
    
    function openNewTab() {
        if (window.GolfCoveCore) {
            window.GolfCoveCore.emit('ui:openNewTab');
        }
    }
    
    function openPaymentModal() {
        if (window.GolfCoveCore) {
            window.GolfCoveCore.emit('ui:openPaymentModal');
        }
    }
    
    function closeAllModals() {
        if (window.GolfCoveCore) {
            window.GolfCoveCore.emit('ui:closeAllModals');
        }
    }
    
    function forceSyncAll() {
        if (window.GolfCoveSyncManager) {
            window.GolfCoveSyncManager.syncAll();
            if (window.GolfCoveNotifications) {
                window.GolfCoveNotifications.info('Syncing...', { duration: 2000 });
            }
        }
    }
    
    function showHelp() {
        if (window.GolfCoveNotifications) {
            window.GolfCoveNotifications.info(
                'Ctrl+K: Search | Ctrl+B: New Booking | Ctrl+T: New Tab | Ctrl+P: Payment | Esc: Close',
                { title: 'Keyboard Shortcuts', duration: 5000 }
            );
        }
    }
    
    // ============ VERSION CHECK ============
    async function checkForUpdates() {
        // Could check a version endpoint here
        if (config.debug) {
            console.log('Version check: Running v' + config.version);
        }
    }
    
    // ============ UTILITY METHODS ============
    function getModule(name) {
        return loadedModules.get(name);
    }
    
    function hasModule(name) {
        return loadedModules.has(name);
    }
    
    function getStatus() {
        return {
            initialized,
            version: config.version,
            environment: config.environment,
            debug: config.debug,
            modules: Array.from(loadedModules.keys()),
            online: navigator.onLine,
            pendingSync: window.GolfCoveSyncManager?.pendingCount || 0
        };
    }
    
    // ============ QUICK ACCESS METHODS ============
    // These provide convenient access to common operations
    
    const quick = {
        // Customer operations
        findCustomer: (query) => {
            const cm = getModule('CustomerManager');
            if (!cm) return null;
            return cm.searchCustomers(query).customers[0];
        },
        
        // Booking operations
        getAvailability: (date, duration) => {
            const bm = getModule('BookingManager');
            if (!bm) return [];
            return bm.getAvailability(date, duration);
        },
        
        createBooking: (data) => {
            const bm = getModule('BookingManager');
            if (!bm) return null;
            return bm.createBooking(data);
        },
        
        // Transaction operations
        createTransaction: (items, customer, options) => {
            const tm = getModule('TransactionManager');
            if (!tm) return null;
            return tm.createTransaction(items, customer, options);
        },
        
        // Notification shortcuts
        notify: {
            success: (msg) => window.GolfCoveNotifications?.success(msg),
            error: (msg) => window.GolfCoveNotifications?.error(msg),
            warning: (msg) => window.GolfCoveNotifications?.warning(msg),
            info: (msg) => window.GolfCoveNotifications?.info(msg)
        },
        
        // Format shortcuts
        format: window.GolfCoveCore?.Format || {}
    };
    
    // ============ DEBUG TOOLS ============
    function enableDebug() {
        config.debug = true;
        if (window.GolfCoveCore) {
            window.GolfCoveCore.config.debug = true;
        }
        localStorage.setItem('gc_debug', 'true');
        console.log('🐛 Debug mode enabled');
    }
    
    function disableDebug() {
        config.debug = false;
        if (window.GolfCoveCore) {
            window.GolfCoveCore.config.debug = false;
        }
        localStorage.removeItem('gc_debug');
        console.log('Debug mode disabled');
    }
    
    function exportAllData() {
        const data = {
            exportedAt: new Date().toISOString(),
            version: config.version,
            customers: JSON.parse(localStorage.getItem('gc_customers') || '[]'),
            bookings: JSON.parse(localStorage.getItem('gc_bookings') || '[]'),
            transactions: JSON.parse(localStorage.getItem('gc_transactions') || '[]'),
            tabs: JSON.parse(localStorage.getItem('gc_tabs') || '[]'),
            inventory: JSON.parse(localStorage.getItem('gc_inventory') || '[]'),
            giftCards: JSON.parse(localStorage.getItem('gc_gift_cards') || '[]')
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `golfcove-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        return data;
    }
    
    function clearAllData() {
        if (!confirm('This will delete all local data. Are you sure?')) return;
        
        const keys = [
            'gc_customers', 'gc_bookings', 'gc_transactions', 'gc_tabs',
            'gc_inventory', 'gc_gift_cards', 'gc_pending_sync', 'gc_analytics'
        ];
        
        keys.forEach(key => localStorage.removeItem(key));
        
        console.log('All data cleared');
        window.location.reload();
    }
    
    // ============ PUBLIC API ============
    return {
        init,
        config,
        
        // Module access
        getModule,
        hasModule,
        getStatus,
        
        // Quick access
        quick,
        
        // Shortcuts to common modules
        get Core() { return getModule('Core'); },
        get State() { return getModule('State'); },
        get API() { return getModule('API'); },
        get Notify() { return getModule('Notifications'); },
        get Sync() { return getModule('SyncManager'); },
        get Transactions() { return getModule('TransactionManager'); },
        get Bookings() { return getModule('BookingManager'); },
        get Customers() { return getModule('CustomerManager'); },
        
        // Debug tools
        debug: {
            enable: enableDebug,
            disable: disableDebug,
            exportData: exportAllData,
            clearData: clearAllData
        }
    };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Check for debug mode
        const debugMode = localStorage.getItem('gc_debug') === 'true';
        GolfCoveApp.init({ debug: debugMode });
    });
} else {
    // DOM already loaded
    const debugMode = localStorage.getItem('gc_debug') === 'true';
    GolfCoveApp.init({ debug: debugMode });
}

// Make available globally
if (typeof window !== 'undefined') {
    window.GolfCoveApp = GolfCoveApp;
    window.$app = GolfCoveApp; // Short alias
}
