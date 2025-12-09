/**
 * Golf Cove - Firebase Sync Module
 * Centralized Firebase communication for all data sync
 * Handles employees, PINs, customers, transactions, etc.
 */

const GolfCoveFirebase = (function() {
    'use strict';
    
    // Configuration
    const config = {
        baseUrl: window.location.hostname === 'localhost' 
            ? 'http://localhost:5001/golfcove-d3c46/us-central1'
            : '/api',
        storeId: 'golfcove',
        syncInterval: 30000, // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000
    };
    
    // State
    let syncInProgress = false;
    let lastSync = null;
    let syncListeners = [];
    let isOnline = navigator.onLine;
    
    // Track online/offline status
    window.addEventListener('online', () => {
        isOnline = true;
        console.log('Firebase: Back online, syncing...');
        syncAll();
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        console.log('Firebase: Offline mode');
    });
    
    // ============ HTTP HELPERS ============
    async function apiRequest(endpoint, method = 'GET', data = null) {
        const url = `${config.baseUrl}/${endpoint}`;
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        
        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }
        
        let lastError;
        for (let i = 0; i < config.retryAttempts; i++) {
            try {
                const response = await fetch(url, options);
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `HTTP ${response.status}`);
                }
                
                return await response.json();
            } catch (error) {
                lastError = error;
                console.warn(`Firebase: Request failed (attempt ${i + 1}):`, error.message);
                
                if (i < config.retryAttempts - 1) {
                    await new Promise(r => setTimeout(r, config.retryDelay * (i + 1)));
                }
            }
        }
        
        throw lastError;
    }
    
    // ============ EMPLOYEE/PIN MANAGEMENT ============
    
    /**
     * Fetch all employees from Firebase
     * Falls back to localStorage if offline
     */
    async function getEmployees() {
        if (!isOnline) {
            return getLocalEmployees();
        }
        
        try {
            const result = await apiRequest(`employees?storeId=${config.storeId}`);
            
            // Cache to localStorage
            if (result.employees) {
                localStorage.setItem('gc_employees', JSON.stringify(result.employees));
            }
            
            return result.employees || [];
        } catch (error) {
            console.error('Firebase: Failed to fetch employees:', error);
            return getLocalEmployees();
        }
    }
    
    /**
     * Sync employees to Firebase
     */
    async function syncEmployees(employees) {
        if (!isOnline) {
            // Queue for later sync
            queueSync('employees', employees);
            return { success: false, queued: true };
        }
        
        try {
            const result = await apiRequest('employees', 'POST', {
                storeId: config.storeId,
                employees
            });
            
            // Update local cache
            localStorage.setItem('gc_employees', JSON.stringify(employees));
            
            return { success: true, ...result };
        } catch (error) {
            console.error('Firebase: Failed to sync employees:', error);
            queueSync('employees', employees);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Validate PIN against Firebase
     * Returns employee if valid, null if invalid
     */
    async function validatePIN(pin) {
        // Always check locally first for speed
        const localEmployee = getLocalEmployees().find(e => e.pin === pin && e.isActive !== false);
        
        if (!isOnline) {
            return localEmployee || null;
        }
        
        try {
            const result = await apiRequest('employees/validate', 'POST', {
                storeId: config.storeId,
                pin
            });
            
            if (result.valid && result.employee) {
                // Update local cache with latest employee data
                updateLocalEmployee(result.employee);
                return result.employee;
            }
            
            return null;
        } catch (error) {
            console.error('Firebase: PIN validation failed:', error);
            // Fall back to local validation
            return localEmployee || null;
        }
    }
    
    /**
     * Add or update an employee
     */
    async function saveEmployee(employee) {
        // Generate ID if new
        if (!employee.id) {
            employee.id = 'EMP-' + Date.now().toString(36).toUpperCase();
        }
        
        employee.updatedAt = new Date().toISOString();
        
        // Save locally first
        const employees = getLocalEmployees();
        const index = employees.findIndex(e => e.id === employee.id);
        
        if (index !== -1) {
            employees[index] = { ...employees[index], ...employee };
        } else {
            employee.createdAt = employee.createdAt || new Date().toISOString();
            employees.push(employee);
        }
        
        localStorage.setItem('gc_employees', JSON.stringify(employees));
        
        // Sync to Firebase
        if (isOnline) {
            try {
                await apiRequest('employees/save', 'POST', {
                    storeId: config.storeId,
                    employee
                });
            } catch (error) {
                console.error('Firebase: Failed to save employee:', error);
                queueSync('employee', employee);
            }
        } else {
            queueSync('employee', employee);
        }
        
        return employee;
    }
    
    /**
     * Delete an employee (soft delete)
     */
    async function deleteEmployee(employeeId) {
        const employees = getLocalEmployees();
        const employee = employees.find(e => e.id === employeeId);
        
        if (employee) {
            employee.isActive = false;
            employee.deletedAt = new Date().toISOString();
            localStorage.setItem('gc_employees', JSON.stringify(employees));
            
            if (isOnline) {
                try {
                    await apiRequest('employees/delete', 'POST', {
                        storeId: config.storeId,
                        employeeId
                    });
                } catch (error) {
                    console.error('Firebase: Failed to delete employee:', error);
                }
            }
        }
        
        return true;
    }
    
    /**
     * Generate unique PIN
     */
    function generateUniquePIN() {
        const employees = getLocalEmployees();
        const existingPins = new Set(employees.filter(e => e.isActive !== false).map(e => e.pin));
        
        let pin;
        let attempts = 0;
        
        do {
            // Generate 4-digit PIN, avoiding common patterns
            pin = Math.floor(1000 + Math.random() * 9000).toString();
            attempts++;
        } while (
            (existingPins.has(pin) || isWeakPIN(pin)) && 
            attempts < 100
        );
        
        return pin;
    }
    
    /**
     * Check if PIN is weak/common
     */
    function isWeakPIN(pin) {
        const weakPins = [
            '0000', '1111', '2222', '3333', '4444', 
            '5555', '6666', '7777', '8888', '9999',
            '1234', '4321', '1212', '2121', '1010',
            '0123', '3210', '1357', '2468', '9876'
        ];
        return weakPins.includes(pin);
    }
    
    // ============ LOCAL STORAGE HELPERS ============
    
    function getLocalEmployees() {
        try {
            const data = localStorage.getItem('gc_employees');
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('Error reading local employees:', e);
        }
        
        // Return defaults if nothing stored
        return [
            { id: 'EMP-DEFAULT-1', name: 'Manager', pin: '9999', role: 'manager', isActive: true },
            { id: 'EMP-DEFAULT-2', name: 'Staff', pin: '8888', role: 'staff', isActive: true }
        ];
    }
    
    function updateLocalEmployee(employee) {
        const employees = getLocalEmployees();
        const index = employees.findIndex(e => e.id === employee.id);
        
        if (index !== -1) {
            employees[index] = { ...employees[index], ...employee };
        } else {
            employees.push(employee);
        }
        
        localStorage.setItem('gc_employees', JSON.stringify(employees));
    }
    
    // ============ SYNC QUEUE ============
    
    function queueSync(type, data) {
        const queue = JSON.parse(localStorage.getItem('gc_sync_queue') || '[]');
        queue.push({
            type,
            data,
            timestamp: Date.now()
        });
        localStorage.setItem('gc_sync_queue', JSON.stringify(queue));
    }
    
    async function processQueue() {
        if (!isOnline) return;
        
        const queue = JSON.parse(localStorage.getItem('gc_sync_queue') || '[]');
        if (queue.length === 0) return;
        
        console.log(`Firebase: Processing ${queue.length} queued items`);
        
        const remaining = [];
        
        for (const item of queue) {
            try {
                switch (item.type) {
                    case 'employees':
                        await syncEmployees(item.data);
                        break;
                    case 'employee':
                        await saveEmployee(item.data);
                        break;
                    case 'customers':
                        await syncCustomers(item.data);
                        break;
                    case 'transactions':
                        await syncTransactions(item.data);
                        break;
                    default:
                        console.warn('Unknown sync type:', item.type);
                }
            } catch (error) {
                console.error('Failed to process queue item:', error);
                remaining.push(item);
            }
        }
        
        localStorage.setItem('gc_sync_queue', JSON.stringify(remaining));
    }
    
    // ============ GENERAL SYNC ============
    
    async function syncCustomers(customers) {
        if (!isOnline) {
            queueSync('customers', customers);
            return { success: false, queued: true };
        }
        
        try {
            const result = await apiRequest('syncCustomers', 'POST', {
                storeId: config.storeId,
                customers
            });
            return { success: true, ...result };
        } catch (error) {
            console.error('Firebase: Failed to sync customers:', error);
            queueSync('customers', customers);
            return { success: false, error: error.message };
        }
    }
    
    async function syncTransactions(transactions) {
        if (!isOnline) {
            queueSync('transactions', transactions);
            return { success: false, queued: true };
        }
        
        try {
            const result = await apiRequest('syncTransactions', 'POST', {
                storeId: config.storeId,
                transactions
            });
            return { success: true, ...result };
        } catch (error) {
            console.error('Firebase: Failed to sync transactions:', error);
            queueSync('transactions', transactions);
            return { success: false, error: error.message };
        }
    }
    
    async function syncAll() {
        if (syncInProgress || !isOnline) return;
        
        syncInProgress = true;
        
        try {
            // Process any queued items first
            await processQueue();
            
            // Pull latest data from Firebase
            const result = await apiRequest(`fullPull?storeId=${config.storeId}`);
            
            if (result) {
                // Update local storage with pulled data
                if (result.customers?.length) {
                    localStorage.setItem('gc_customers', JSON.stringify(result.customers));
                }
                if (result.employees?.length) {
                    localStorage.setItem('gc_employees', JSON.stringify(result.employees));
                }
                
                lastSync = new Date();
                notifyListeners('sync', { success: true, data: result });
            }
            
            return result;
        } catch (error) {
            console.error('Firebase: Full sync failed:', error);
            notifyListeners('sync', { success: false, error: error.message });
            return null;
        } finally {
            syncInProgress = false;
        }
    }
    
    async function fullPush() {
        if (!isOnline) {
            console.warn('Firebase: Cannot push while offline');
            return { success: false, error: 'Offline' };
        }
        
        try {
            const data = {
                storeId: config.storeId,
                data: {
                    customers: JSON.parse(localStorage.getItem('gc_customers') || '[]'),
                    employees: JSON.parse(localStorage.getItem('gc_employees') || '[]'),
                    transactions: JSON.parse(localStorage.getItem('gc_transactions') || '[]'),
                    bookings: JSON.parse(localStorage.getItem('gc_bookings') || '[]')
                }
            };
            
            const result = await apiRequest('fullSync', 'POST', data);
            
            lastSync = new Date();
            notifyListeners('push', { success: true, result });
            
            return { success: true, ...result };
        } catch (error) {
            console.error('Firebase: Full push failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ============ LISTENERS ============
    
    function addSyncListener(callback) {
        syncListeners.push(callback);
        return () => {
            syncListeners = syncListeners.filter(cb => cb !== callback);
        };
    }
    
    function notifyListeners(event, data) {
        syncListeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (e) {
                console.error('Sync listener error:', e);
            }
        });
    }
    
    // ============ AUTO SYNC ============
    
    let syncIntervalId = null;
    
    function startAutoSync() {
        if (syncIntervalId) return;
        
        syncIntervalId = setInterval(() => {
            if (isOnline && !syncInProgress) {
                syncAll();
            }
        }, config.syncInterval);
        
        // Initial sync
        setTimeout(() => syncAll(), 1000);
    }
    
    function stopAutoSync() {
        if (syncIntervalId) {
            clearInterval(syncIntervalId);
            syncIntervalId = null;
        }
    }
    
    // ============ STATUS ============
    
    function getStatus() {
        return {
            online: isOnline,
            lastSync,
            syncInProgress,
            queueLength: JSON.parse(localStorage.getItem('gc_sync_queue') || '[]').length
        };
    }
    
    // Public API
    return {
        // Employee/PIN management
        getEmployees,
        syncEmployees,
        validatePIN,
        saveEmployee,
        deleteEmployee,
        generateUniquePIN,
        isWeakPIN,
        
        // General sync
        syncCustomers,
        syncTransactions,
        syncAll,
        fullPush,
        
        // Listeners
        addSyncListener,
        
        // Auto sync
        startAutoSync,
        stopAutoSync,
        
        // Status
        getStatus,
        
        // Config access
        getConfig: () => ({ ...config }),
        setStoreId: (id) => { config.storeId = id; }
    };
})();

// Auto-start sync when loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        GolfCoveFirebase.startAutoSync();
    });
} else {
    GolfCoveFirebase.startAutoSync();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveFirebase;
}
