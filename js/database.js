/**
 * Golf Cove - Database/Storage Layer
 * Unified data access layer for all modules
 * Handles localStorage now, can be extended to IndexedDB or Firebase
 */

const GolfCoveDB = (function() {
    'use strict';
    
    const PREFIX = 'gc_';
    const MAX_KEY_LENGTH = 256;
    const MAX_VALUE_SIZE = 5 * 1024 * 1024; // 5MB per item
    const MAX_COLLECTION_SIZE = 10000; // Max items per collection
    
    // Input validation helpers
    function isValidKey(key) {
        return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH;
    }
    
    function sanitizeKey(key) {
        if (!isValidKey(key)) {
            throw new Error(`Invalid key: ${String(key).substring(0, 50)}`);
        }
        return key.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
    
    // ============ BASIC OPERATIONS ============
    function get(key) {
        try {
            if (!isValidKey(key)) return null;
            const data = localStorage.getItem(PREFIX + key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('DB get error:', key, e.message);
            return null;
        }
    }
    
    function set(key, value) {
        try {
            if (!isValidKey(key)) {
                console.error('DB set error: invalid key', key);
                return false;
            }
            
            const json = JSON.stringify(value);
            
            // Check size limits
            if (json.length > MAX_VALUE_SIZE) {
                console.error('DB set error: value too large', key, json.length);
                return false;
            }
            
            localStorage.setItem(PREFIX + key, json);
            return true;
        } catch (e) {
            // Handle quota exceeded
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                console.error('DB set error: storage quota exceeded', key);
                // Emit event for handling
                if (typeof window !== 'undefined' && window.GolfCoveCore) {
                    window.GolfCoveCore.emit('storage:quotaExceeded', { key });
                }
            } else {
                console.error('DB set error:', key, e.message);
            }
            return false;
        }
    }
    
    function remove(key) {
        try {
            localStorage.removeItem(PREFIX + key);
            return true;
        } catch (e) {
            console.error('DB remove error:', key, e);
            return false;
        }
    }
    
    function exists(key) {
        return localStorage.getItem(PREFIX + key) !== null;
    }
    
    // ============ COLLECTION OPERATIONS ============
    function getCollection(collection) {
        const data = get(collection);
        return Array.isArray(data) ? data : [];
    }
    
    function saveCollection(collection, data) {
        if (!Array.isArray(data)) {
            console.error('saveCollection requires array data');
            return false;
        }
        return set(collection, data);
    }
    
    function addToCollection(collection, item) {
        if (!item || typeof item !== 'object') {
            console.error('addToCollection requires object item');
            return false;
        }
        
        const data = getCollection(collection);
        
        // Check collection size limit
        if (data.length >= MAX_COLLECTION_SIZE) {
            console.error('Collection size limit reached:', collection);
            return false;
        }
        
        data.push(item);
        return saveCollection(collection, data);
    }
    
    function updateInCollection(collection, id, updates, idField = 'id') {
        const data = getCollection(collection);
        const index = data.findIndex(item => item[idField] === id);
        
        if (index === -1) return null;
        
        data[index] = { ...data[index], ...updates };
        saveCollection(collection, data);
        return data[index];
    }
    
    function removeFromCollection(collection, id, idField = 'id') {
        const data = getCollection(collection);
        const index = data.findIndex(item => item[idField] === id);
        
        if (index === -1) return false;
        
        data.splice(index, 1);
        saveCollection(collection, data);
        return true;
    }
    
    function findInCollection(collection, predicate) {
        return getCollection(collection).find(predicate);
    }
    
    function filterCollection(collection, predicate) {
        return getCollection(collection).filter(predicate);
    }
    
    function queryCollection(collection, query = {}) {
        let results = getCollection(collection);
        
        // Filter by field values
        if (query.where && typeof query.where === 'object') {
            Object.entries(query.where).forEach(([field, value]) => {
                if (typeof value === 'function') {
                    results = results.filter(item => {
                        try {
                            return value(item?.[field]);
                        } catch {
                            return false;
                        }
                    });
                } else {
                    results = results.filter(item => item?.[field] === value);
                }
            });
        }
        
        // Sort
        if (query.orderBy && typeof query.orderBy === 'string') {
            const [field, direction] = query.orderBy.split(':');
            results.sort((a, b) => {
                const aVal = a?.[field];
                const bVal = b?.[field];
                
                // Handle null/undefined
                if (aVal == null && bVal == null) return 0;
                if (aVal == null) return 1;
                if (bVal == null) return -1;
                
                if (direction === 'desc') {
                    return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
                }
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            });
        }
        
        // Limit (with bounds check)
        if (query.limit && typeof query.limit === 'number' && query.limit > 0) {
            results = results.slice(0, Math.min(query.limit, 10000));
        }
        
        // Skip/Offset (with bounds check)
        if (query.skip && typeof query.skip === 'number' && query.skip > 0) {
            results = results.slice(Math.min(query.skip, results.length));
        }
        
        return results;
    }
    
    // ============ TRANSACTION SUPPORT ============
    function transaction(operations) {
        // Simple transaction support - collect all operations and execute
        const backup = {};
        const keys = [...new Set(operations.map(op => op.collection))];
        
        // Backup current data
        keys.forEach(key => {
            backup[key] = get(key);
        });
        
        try {
            // Execute operations
            operations.forEach(op => {
                switch (op.type) {
                    case 'set':
                        set(op.collection, op.data);
                        break;
                    case 'add':
                        addToCollection(op.collection, op.data);
                        break;
                    case 'update':
                        updateInCollection(op.collection, op.id, op.data);
                        break;
                    case 'remove':
                        removeFromCollection(op.collection, op.id);
                        break;
                }
            });
            
            return { success: true };
        } catch (e) {
            // Rollback on error
            keys.forEach(key => {
                if (backup[key] !== undefined) {
                    set(key, backup[key]);
                }
            });
            
            return { success: false, error: e.message };
        }
    }
    
    // ============ BACKUP & RESTORE ============
    function backup() {
        const data = {};
        const keys = getAllKeys();
        
        keys.forEach(key => {
            try {
                data[key] = get(key.replace(PREFIX, ''));
            } catch (e) {
                console.error('Failed to backup key:', key, e.message);
            }
        });
        
        return {
            version: '1.0',
            timestamp: new Date().toISOString(),
            keyCount: Object.keys(data).length,
            data
        };
    }
    
    function restore(backupData) {
        if (!backupData || typeof backupData !== 'object') {
            throw new Error('Invalid backup data: not an object');
        }
        
        if (!backupData.data || typeof backupData.data !== 'object') {
            throw new Error('Invalid backup data: missing data property');
        }
        
        // Version compatibility check
        const version = backupData.version || '1.0';
        if (parseFloat(version) > 1.0) {
            console.warn('Backup version newer than supported, some data may not restore correctly');
        }
        
        let restoredCount = 0;
        let errorCount = 0;
        
        Object.entries(backupData.data).forEach(([key, value]) => {
            try {
                const cleanKey = key.replace(PREFIX, '');
                if (set(cleanKey, value)) {
                    restoredCount++;
                } else {
                    errorCount++;
                }
            } catch (e) {
                console.error('Failed to restore key:', key, e.message);
                errorCount++;
            }
        });
        
        console.log(`Restore complete: ${restoredCount} keys restored, ${errorCount} errors`);
        return { success: errorCount === 0, restoredCount, errorCount };
    }
    
    function exportToJSON() {
        return JSON.stringify(backup(), null, 2);
    }
    
    function importFromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            return restore(data);
        } catch (e) {
            throw new Error('Invalid JSON: ' + e.message);
        }
    }
    
    // ============ UTILITIES ============
    function getAllKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(PREFIX)) {
                keys.push(key);
            }
        }
        return keys;
    }
    
    function clear() {
        getAllKeys().forEach(key => {
            localStorage.removeItem(key);
        });
    }
    
    function getSize() {
        let total = 0;
        getAllKeys().forEach(key => {
            total += localStorage.getItem(key)?.length || 0;
        });
        return {
            bytes: total * 2, // UTF-16
            kb: ((total * 2) / 1024).toFixed(2),
            mb: ((total * 2) / (1024 * 1024)).toFixed(4)
        };
    }
    
    function getStats() {
        const keys = getAllKeys();
        const stats = {};
        
        keys.forEach(key => {
            const shortKey = key.replace(PREFIX, '');
            const data = get(shortKey);
            stats[shortKey] = {
                type: Array.isArray(data) ? 'array' : typeof data,
                count: Array.isArray(data) ? data.length : 1,
                size: (localStorage.getItem(key)?.length || 0) * 2
            };
        });
        
        return {
            collections: stats,
            totalKeys: keys.length,
            totalSize: getSize()
        };
    }
    
    // ============ INDEXING (for faster lookups) ============
    const indexes = {};
    
    function createIndex(collection, field) {
        const key = `${collection}:${field}`;
        indexes[key] = {};
        
        const data = getCollection(collection);
        data.forEach((item, i) => {
            const value = item[field];
            if (!indexes[key][value]) {
                indexes[key][value] = [];
            }
            indexes[key][value].push(i);
        });
    }
    
    function getByIndex(collection, field, value) {
        const key = `${collection}:${field}`;
        if (!indexes[key]) {
            createIndex(collection, field);
        }
        
        const indices = indexes[key][value] || [];
        const data = getCollection(collection);
        return indices.map(i => data[i]);
    }
    
    function clearIndex(collection, field = null) {
        if (field) {
            delete indexes[`${collection}:${field}`];
        } else {
            Object.keys(indexes).forEach(key => {
                if (key.startsWith(collection + ':')) {
                    delete indexes[key];
                }
            });
        }
    }
    
    // ============ MIGRATIONS ============
    const migrations = [];
    
    function registerMigration(version, migrateFn) {
        migrations.push({ version, migrate: migrateFn });
    }
    
    function runMigrations() {
        const currentVersion = get('db_version') || 0;
        
        const pendingMigrations = migrations
            .filter(m => m.version > currentVersion)
            .sort((a, b) => a.version - b.version);
        
        pendingMigrations.forEach(m => {
            try {
                m.migrate();
                set('db_version', m.version);
                console.log(`Migration ${m.version} completed`);
            } catch (e) {
                console.error(`Migration ${m.version} failed:`, e);
            }
        });
    }
    
    // ============ SYNC HELPERS (for future Firebase integration) ============
    function markForSync(collection, id, action) {
        const syncQueue = get('sync_queue') || [];
        syncQueue.push({
            collection,
            id,
            action,
            timestamp: new Date().toISOString()
        });
        set('sync_queue', syncQueue);
    }
    
    function getSyncQueue() {
        return get('sync_queue') || [];
    }
    
    function clearSyncQueue() {
        set('sync_queue', []);
    }
    
    // Public API
    return {
        // Basic
        get,
        set,
        remove,
        exists,
        
        // Collections
        getCollection,
        saveCollection,
        addToCollection,
        updateInCollection,
        removeFromCollection,
        findInCollection,
        filterCollection,
        queryCollection,
        
        // Transactions
        transaction,
        
        // Backup/Restore
        backup,
        restore,
        exportToJSON,
        importFromJSON,
        
        // Utilities
        getAllKeys,
        clear,
        getSize,
        getStats,
        
        // Indexing
        createIndex,
        getByIndex,
        clearIndex,
        
        // Migrations
        registerMigration,
        runMigrations,
        
        // Sync
        markForSync,
        getSyncQueue,
        clearSyncQueue
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveDB;
}
