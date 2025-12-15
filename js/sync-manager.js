/**
 * Golf Cove - Data Sync Manager
 * Handles synchronization between local storage, Firebase, and server
 * With conflict resolution and offline support
 */

const GolfCoveSyncManager = (function() {
    'use strict';
    
    const Core = GolfCoveCore;
    
    // ============ CONFIGURATION ============
    const config = {
        syncInterval: 30000, // 30 seconds
        retryDelay: 5000,
        maxRetries: 3,
        conflictResolution: 'server-wins', // 'server-wins', 'client-wins', 'merge', 'manual'
        collections: ['customers', 'bookings', 'tabs', 'transactions', 'inventory', 'employees']
    };
    
    // ============ STATE ============
    let isOnline = navigator.onLine;
    let isSyncing = false;
    let syncTimer = null;
    const pendingChanges = new Map(); // collection -> changes[]
    const lastSyncTime = new Map(); // collection -> timestamp
    const syncListeners = new Set();
    
    // ============ INITIALIZATION ============
    function init(options = {}) {
        Object.assign(config, options);
        
        // Load pending changes from storage
        loadPendingChanges();
        
        // Listen for online/offline
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        // Start sync timer
        startSyncTimer();
        
        // Initial sync if online
        if (isOnline) {
            setTimeout(() => syncAll(), 2000);
        }
        
        Core.log('info', 'Sync manager initialized', { isOnline, pendingCount: getTotalPendingCount() });
        Core.emit('sync:initialized');
    }
    
    function handleOnline() {
        isOnline = true;
        Core.emit('sync:online');
        Core.log('info', 'Connection restored');
        
        // Sync pending changes
        syncPendingChanges();
    }
    
    function handleOffline() {
        isOnline = false;
        Core.emit('sync:offline');
        Core.log('warn', 'Connection lost - changes will be queued');
    }
    
    // ============ SYNC TIMER ============
    function startSyncTimer() {
        if (syncTimer) clearInterval(syncTimer);
        
        syncTimer = setInterval(() => {
            if (isOnline && !isSyncing) {
                syncAll();
            }
        }, config.syncInterval);
    }
    
    function stopSyncTimer() {
        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = null;
        }
    }
    
    // ============ CHANGE TRACKING ============
    function trackChange(collection, operation, data, localId = null) {
        const change = {
            id: Core.generateId('change'),
            collection,
            operation, // 'create', 'update', 'delete'
            data,
            localId,
            timestamp: Date.now(),
            retries: 0
        };
        
        if (!pendingChanges.has(collection)) {
            pendingChanges.set(collection, []);
        }
        
        // Check for duplicate/superseding changes
        const changes = pendingChanges.get(collection);
        const existingIndex = changes.findIndex(c => 
            c.localId === localId || 
            (c.data?.id && c.data.id === data?.id)
        );
        
        if (existingIndex !== -1) {
            // Replace with newer change
            if (operation === 'delete') {
                // Delete supersedes all
                changes[existingIndex] = change;
            } else if (changes[existingIndex].operation !== 'delete') {
                // Update supersedes create/update
                changes[existingIndex] = change;
            }
        } else {
            changes.push(change);
        }
        
        savePendingChanges();
        Core.emit('sync:changePending', { collection, operation, count: getTotalPendingCount() });
        
        // Try to sync immediately if online
        if (isOnline && !isSyncing) {
            syncPendingChanges();
        }
        
        return change.id;
    }
    
    function savePendingChanges() {
        const data = {};
        pendingChanges.forEach((changes, collection) => {
            data[collection] = changes;
        });
        localStorage.setItem('gc_pending_sync', JSON.stringify(data));
    }
    
    function loadPendingChanges() {
        try {
            const saved = localStorage.getItem('gc_pending_sync');
            if (saved) {
                const data = JSON.parse(saved);
                for (const [collection, changes] of Object.entries(data)) {
                    pendingChanges.set(collection, changes);
                }
            }
        } catch (e) {
            Core.log('warn', 'Failed to load pending changes', e);
        }
    }
    
    function getTotalPendingCount() {
        let count = 0;
        pendingChanges.forEach(changes => count += changes.length);
        return count;
    }
    
    // ============ SYNC OPERATIONS ============
    async function syncAll() {
        if (isSyncing || !isOnline) return;
        
        isSyncing = true;
        Core.emit('sync:started');
        
        try {
            // First push pending changes
            await syncPendingChanges();
            
            // Then pull updates from server
            for (const collection of config.collections) {
                await pullCollection(collection);
            }
            
            Core.emit('sync:completed', { timestamp: Date.now() });
        } catch (error) {
            Core.log('error', 'Sync failed', error);
            Core.emit('sync:error', { error });
        } finally {
            isSyncing = false;
        }
    }
    
    async function syncPendingChanges() {
        const now = Date.now();
        
        for (const [collection, changes] of pendingChanges) {
            const remaining = [];
            
            for (const change of changes) {
                // Skip if not ready for retry yet
                if (change.nextRetryAt && now < change.nextRetryAt) {
                    remaining.push(change);
                    continue;
                }
                
                try {
                    await pushChange(change);
                    Core.emit('sync:changeSynced', { change });
                } catch (error) {
                    change.retries++;
                    change.lastError = error.message || 'Unknown error';
                    
                    if (change.retries < config.maxRetries) {
                        // Exponential backoff with jitter
                        const backoff = Math.min(
                            config.baseRetryDelay * Math.pow(2, change.retries),
                            config.maxRetryDelay
                        );
                        const jitter = Math.random() * 0.3 * backoff;
                        change.nextRetryAt = now + backoff + jitter;
                        
                        remaining.push(change);
                        Core.log('warn', `Sync retry scheduled`, { 
                            change: change.id, 
                            retries: change.retries,
                            nextRetryIn: Math.round((change.nextRetryAt - now) / 1000) + 's'
                        });
                    } else {
                        Core.log('error', 'Change exceeded max retries, moving to dead letter queue', { change });
                        Core.emit('sync:changeFailed', { change, error });
                        
                        // Store failed changes in dead letter queue
                        storeFailedChange(change);
                    }
                }
            }
            
            pendingChanges.set(collection, remaining);
        }
        
        savePendingChanges();
    }
    
    function storeFailedChange(change) {
        try {
            const failedChanges = JSON.parse(localStorage.getItem('gc_failed_changes') || '[]');
            failedChanges.push({
                ...change,
                failedAt: new Date().toISOString()
            });
            // Keep only last 100 failed changes
            if (failedChanges.length > 100) {
                failedChanges.splice(0, failedChanges.length - 100);
            }
            localStorage.setItem('gc_failed_changes', JSON.stringify(failedChanges));
        } catch (e) {
            Core.log('error', 'Failed to store failed change', { error: e.message });
        }
    }
    
    async function pushChange(change) {
        const { collection, operation, data } = change;
        
        // Validate change structure
        if (!collection || !operation || !data) {
            throw new Error('Invalid change structure');
        }
        
        // Get Firebase reference
        const db = getFirestore();
        if (!db) {
            throw new Error('Firestore not available');
        }
        
        const timeout = 30000; // 30 second timeout
        
        try {
            switch (operation) {
                case 'create':
                    await Core.timeout(
                        db.collection(collection).add({
                            ...data,
                            createdAt: new Date().toISOString(),
                            syncedAt: new Date().toISOString()
                        }),
                        timeout,
                        `Create operation timed out for ${collection}`
                    );
                    break;
                    
                case 'update':
                    if (!data.id) throw new Error('Update requires id');
                    await Core.timeout(
                        db.collection(collection).doc(data.id).update({
                            ...data,
                            updatedAt: new Date().toISOString(),
                            syncedAt: new Date().toISOString()
                        }),
                        timeout,
                        `Update operation timed out for ${collection}/${data.id}`
                    );
                    break;
                    
                case 'delete':
                    if (!data.id) throw new Error('Delete requires id');
                    await Core.timeout(
                        db.collection(collection).doc(data.id).delete(),
                        timeout,
                        `Delete operation timed out for ${collection}/${data.id}`
                    );
                    break;
                    
                default:
                    throw new Error(`Unknown operation: ${operation}`);
            }
            
            Core.log('info', `Synced ${operation} to ${collection}`, { id: data.id });
        } catch (error) {
            Core.log('error', `Push change failed: ${operation} ${collection}`, { 
                id: data.id, 
                error: error.message 
            });
            throw error;
        }
    }
    
    async function pullCollection(collection) {
        const db = getFirestore();
        if (!db) return;
        
        const lastSync = lastSyncTime.get(collection) || 0;
        
        try {
            let query = db.collection(collection);
            
            // Only fetch changes since last sync
            if (lastSync > 0) {
                const lastSyncDate = new Date(lastSync).toISOString();
                query = query.where('updatedAt', '>', lastSyncDate);
            }
            
            const snapshot = await query.get();
            const updates = [];
            
            snapshot.forEach(doc => {
                updates.push({ id: doc.id, ...doc.data() });
            });
            
            if (updates.length > 0) {
                // Apply updates to local storage
                await applyServerUpdates(collection, updates);
                Core.emit('sync:dataReceived', { collection, count: updates.length });
            }
            
            lastSyncTime.set(collection, Date.now());
            localStorage.setItem('gc_last_sync', JSON.stringify(Object.fromEntries(lastSyncTime)));
            
        } catch (error) {
            Core.log('error', `Failed to pull ${collection}`, error);
            throw error;
        }
    }
    
    async function applyServerUpdates(collection, updates) {
        const localKey = `gc_${collection}`;
        const localData = JSON.parse(localStorage.getItem(localKey) || '[]');
        const localMap = new Map(localData.map(item => [item.id, item]));
        
        for (const update of updates) {
            const local = localMap.get(update.id);
            
            if (!local) {
                // New item from server
                localMap.set(update.id, update);
            } else {
                // Conflict resolution
                const resolved = resolveConflict(local, update);
                localMap.set(update.id, resolved);
            }
        }
        
        localStorage.setItem(localKey, JSON.stringify(Array.from(localMap.values())));
    }
    
    function resolveConflict(local, server) {
        switch (config.conflictResolution) {
            case 'server-wins':
                return server;
                
            case 'client-wins':
                return local;
                
            case 'merge':
                // Deep merge preferring newer values
                const localTime = new Date(local.updatedAt || 0).getTime();
                const serverTime = new Date(server.updatedAt || 0).getTime();
                
                return Core.deepMerge(
                    serverTime > localTime ? local : server,
                    serverTime > localTime ? server : local
                );
                
            case 'manual':
                // Emit event for manual resolution
                Core.emit('sync:conflict', { local, server });
                return local; // Keep local until resolved
                
            default:
                return server;
        }
    }
    
    function getFirestore() {
        // Check for Firebase
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            return firebase.firestore();
        }
        return null;
    }
    
    // ============ REAL-TIME LISTENERS ============
    function subscribeToCollection(collection, callback) {
        const db = getFirestore();
        if (!db) {
            Core.log('warn', 'Firestore not available for real-time sync');
            return () => {};
        }
        
        const unsubscribe = db.collection(collection).onSnapshot(
            snapshot => {
                const changes = [];
                snapshot.docChanges().forEach(change => {
                    changes.push({
                        type: change.type, // 'added', 'modified', 'removed'
                        data: { id: change.doc.id, ...change.doc.data() }
                    });
                });
                
                if (changes.length > 0) {
                    callback(changes);
                    Core.emit('sync:realtime', { collection, changes });
                }
            },
            error => {
                Core.log('error', `Real-time listener error for ${collection}`, error);
            }
        );
        
        syncListeners.add(unsubscribe);
        return unsubscribe;
    }
    
    function unsubscribeAll() {
        syncListeners.forEach(unsubscribe => unsubscribe());
        syncListeners.clear();
    }
    
    // ============ EXPORT/IMPORT ============
    async function exportData(collections = config.collections) {
        const data = {
            exportedAt: new Date().toISOString(),
            version: Core.config.version,
            collections: {}
        };
        
        for (const collection of collections) {
            const localKey = `gc_${collection}`;
            data.collections[collection] = JSON.parse(localStorage.getItem(localKey) || '[]');
        }
        
        return data;
    }
    
    async function importData(data, options = { merge: true }) {
        if (!data.collections) {
            throw new Error('Invalid import data format');
        }
        
        for (const [collection, items] of Object.entries(data.collections)) {
            const localKey = `gc_${collection}`;
            
            if (options.merge) {
                const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
                const merged = mergeCollections(existing, items);
                localStorage.setItem(localKey, JSON.stringify(merged));
            } else {
                localStorage.setItem(localKey, JSON.stringify(items));
            }
            
            // Track for sync
            items.forEach(item => {
                trackChange(collection, item.id ? 'update' : 'create', item);
            });
        }
        
        Core.emit('sync:imported', { collections: Object.keys(data.collections) });
    }
    
    function mergeCollections(existing, incoming) {
        const map = new Map(existing.map(item => [item.id, item]));
        
        for (const item of incoming) {
            if (item.id && map.has(item.id)) {
                map.set(item.id, Core.deepMerge(map.get(item.id), item));
            } else {
                map.set(item.id || Core.generateId(), item);
            }
        }
        
        return Array.from(map.values());
    }
    
    // ============ STATUS ============
    function getStatus() {
        return {
            isOnline,
            isSyncing,
            pendingCount: getTotalPendingCount(),
            lastSync: Object.fromEntries(lastSyncTime),
            pendingByCollection: Object.fromEntries(
                Array.from(pendingChanges).map(([k, v]) => [k, v.length])
            )
        };
    }
    
    // ============ CLEANUP ============
    function destroy() {
        stopSyncTimer();
        unsubscribeAll();
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    }
    
    // ============ PUBLIC API ============
    return {
        init,
        destroy,
        
        // Sync operations
        syncAll,
        syncPendingChanges,
        
        // Change tracking
        trackChange,
        create: (collection, data) => trackChange(collection, 'create', data),
        update: (collection, data) => trackChange(collection, 'update', data),
        delete: (collection, id) => trackChange(collection, 'delete', { id }),
        
        // Real-time
        subscribe: subscribeToCollection,
        unsubscribeAll,
        
        // Data management
        exportData,
        importData,
        
        // Status
        getStatus,
        get isOnline() { return isOnline; },
        get isSyncing() { return isSyncing; },
        get pendingCount() { return getTotalPendingCount(); },
        
        // Config
        setConflictResolution: (mode) => { config.conflictResolution = mode; }
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.GolfCoveSyncManager = GolfCoveSyncManager;
}
