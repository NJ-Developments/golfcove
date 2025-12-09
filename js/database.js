/**
 * Golf Cove - Database/Storage Layer
 * Unified data access layer for all modules
 * Handles localStorage now, can be extended to IndexedDB or Firebase
 */

const GolfCoveDB = (function() {
    'use strict';
    
    const PREFIX = 'gc_';
    
    // ============ BASIC OPERATIONS ============
    function get(key) {
        try {
            const data = localStorage.getItem(PREFIX + key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('DB get error:', key, e);
            return null;
        }
    }
    
    function set(key, value) {
        try {
            localStorage.setItem(PREFIX + key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('DB set error:', key, e);
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
        return get(collection) || [];
    }
    
    function saveCollection(collection, data) {
        return set(collection, data);
    }
    
    function addToCollection(collection, item) {
        const data = getCollection(collection);
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
        if (query.where) {
            Object.entries(query.where).forEach(([field, value]) => {
                if (typeof value === 'function') {
                    results = results.filter(item => value(item[field]));
                } else {
                    results = results.filter(item => item[field] === value);
                }
            });
        }
        
        // Sort
        if (query.orderBy) {
            const [field, direction] = query.orderBy.split(':');
            results.sort((a, b) => {
                if (direction === 'desc') {
                    return a[field] > b[field] ? -1 : 1;
                }
                return a[field] > b[field] ? 1 : -1;
            });
        }
        
        // Limit
        if (query.limit) {
            results = results.slice(0, query.limit);
        }
        
        // Skip/Offset
        if (query.skip) {
            results = results.slice(query.skip);
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
            data[key] = get(key.replace(PREFIX, ''));
        });
        
        return {
            version: '1.0',
            timestamp: new Date().toISOString(),
            data
        };
    }
    
    function restore(backupData) {
        if (!backupData || !backupData.data) {
            throw new Error('Invalid backup data');
        }
        
        Object.entries(backupData.data).forEach(([key, value]) => {
            set(key.replace(PREFIX, ''), value);
        });
        
        return true;
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
