/**
 * Golf Cove - Advanced Caching Layer
 * ===================================
 * Multi-tier caching with IndexedDB for large datasets.
 * 
 * Hierarchy:
 * 1. In-memory cache (fastest, limited size)
 * 2. localStorage (fast, ~5MB limit)
 * 3. IndexedDB (slower, but much larger capacity)
 * 4. Firebase (remote, source of truth)
 * 
 * @version 1.0.0
 */

const CacheManager = (function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const config = {
        dbName: 'GolfCoveCache',
        dbVersion: 1,
        defaultTTL: 5 * 60 * 1000,      // 5 minutes
        maxMemoryItems: 500,
        maxLocalStorageSize: 4 * 1024 * 1024, // 4MB (leave 1MB buffer)
        collections: ['bookings', 'customers', 'tabs', 'transactions', 'inventory']
    };

    // ============================================
    // STATE
    // ============================================
    let db = null;
    let isInitialized = false;
    const memoryCache = new Map();
    const cacheMetadata = new Map(); // Stores TTL info

    // ============================================
    // INDEXEDDB SETUP
    // ============================================

    /**
     * Initialize IndexedDB
     * @returns {Promise<IDBDatabase>}
     */
    function initDB() {
        return new Promise((resolve, reject) => {
            if (db) {
                resolve(db);
                return;
            }

            const request = indexedDB.open(config.dbName, config.dbVersion);

            request.onerror = () => {
                console.warn('[CacheManager] IndexedDB not available, using localStorage only');
                resolve(null);
            };

            request.onsuccess = (event) => {
                // @ts-ignore - IndexedDB event target has result property
                db = event.target.result;
                console.log('[CacheManager] IndexedDB initialized');
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                // @ts-ignore - IndexedDB event target has result property
                const database = event.target.result;

                // Create object stores for each collection
                for (const collection of config.collections) {
                    if (!database.objectStoreNames.contains(collection)) {
                        const store = database.createObjectStore(collection, { keyPath: 'id' });
                        store.createIndex('updatedAt', 'updatedAt', { unique: false });
                        store.createIndex('_syncedAt', '_syncedAt', { unique: false });
                    }
                }

                // Metadata store for cache info
                if (!database.objectStoreNames.contains('_metadata')) {
                    database.createObjectStore('_metadata', { keyPath: 'key' });
                }

                console.log('[CacheManager] IndexedDB schema created');
            };
        });
    }

    // ============================================
    // MEMORY CACHE
    // ============================================

    /**
     * Get from memory cache
     * @param {string} key 
     * @returns {*}
     */
    function getFromMemory(key) {
        const cached = memoryCache.get(key);
        if (!cached) return null;

        const metadata = cacheMetadata.get(key);
        if (metadata && metadata.expiresAt < Date.now()) {
            memoryCache.delete(key);
            cacheMetadata.delete(key);
            return null;
        }

        return cached;
    }

    /**
     * Set in memory cache
     * @param {string} key 
     * @param {*} value 
     * @param {number} ttl 
     */
    function setInMemory(key, value, ttl = config.defaultTTL) {
        // Evict oldest if at capacity
        if (memoryCache.size >= config.maxMemoryItems) {
            const firstKey = memoryCache.keys().next().value;
            memoryCache.delete(firstKey);
            cacheMetadata.delete(firstKey);
        }

        memoryCache.set(key, value);
        cacheMetadata.set(key, {
            cachedAt: Date.now(),
            expiresAt: Date.now() + ttl
        });
    }

    // ============================================
    // LOCALSTORAGE CACHE
    // ============================================

    /**
     * Check localStorage usage
     * @returns {number} Bytes used
     */
    function getLocalStorageSize() {
        let total = 0;
        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length * 2; // UTF-16
            }
        }
        return total;
    }

    /**
     * Get from localStorage
     * @param {string} key 
     * @returns {*}
     */
    function getFromLocalStorage(key) {
        try {
            const item = localStorage.getItem(`gc_cache_${key}`);
            if (!item) return null;

            const parsed = JSON.parse(item);
            if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
                localStorage.removeItem(`gc_cache_${key}`);
                return null;
            }

            return parsed.value;
        } catch (e) {
            return null;
        }
    }

    /**
     * Set in localStorage
     * @param {string} key 
     * @param {*} value 
     * @param {number} ttl 
     */
    function setInLocalStorage(key, value, ttl = config.defaultTTL) {
        try {
            const item = {
                value,
                cachedAt: Date.now(),
                expiresAt: Date.now() + ttl
            };

            const json = JSON.stringify(item);
            
            // Check size
            if (getLocalStorageSize() + json.length * 2 > config.maxLocalStorageSize) {
                // Evict old cache entries
                evictLocalStorage();
            }

            localStorage.setItem(`gc_cache_${key}`, json);
        } catch (e) {
            console.warn('[CacheManager] localStorage set failed:', e);
        }
    }

    /**
     * Evict old cache entries from localStorage
     */
    function evictLocalStorage() {
        const cacheKeys = [];
        
        for (const key in localStorage) {
            if (key.startsWith('gc_cache_')) {
                try {
                    const item = JSON.parse(localStorage[key]);
                    cacheKeys.push({
                        key,
                        cachedAt: item.cachedAt || 0
                    });
                } catch (e) {
                    // Invalid item, remove it
                    localStorage.removeItem(key);
                }
            }
        }

        // Sort by age (oldest first) and remove oldest 20%
        cacheKeys.sort((a, b) => a.cachedAt - b.cachedAt);
        const toRemove = Math.ceil(cacheKeys.length * 0.2);
        
        for (let i = 0; i < toRemove; i++) {
            localStorage.removeItem(cacheKeys[i].key);
        }

        console.log(`[CacheManager] Evicted ${toRemove} cache entries`);
    }

    // ============================================
    // INDEXEDDB CACHE
    // ============================================

    /**
     * Get from IndexedDB
     * @param {string} collection 
     * @param {string} id 
     * @returns {Promise<*>}
     */
    async function getFromIndexedDB(collection, id) {
        if (!db) return null;

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([collection], 'readonly');
                const store = transaction.objectStore(collection);
                const request = store.get(id);

                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    /**
     * Get all from IndexedDB collection
     * @param {string} collection 
     * @returns {Promise<Array>}
     */
    async function getAllFromIndexedDB(collection) {
        if (!db) return [];

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([collection], 'readonly');
                const store = transaction.objectStore(collection);
                const request = store.getAll();

                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => resolve([]);
            } catch (e) {
                resolve([]);
            }
        });
    }

    /**
     * Save to IndexedDB
     * @param {string} collection 
     * @param {Object|Array} data 
     * @returns {Promise<boolean>}
     */
    async function saveToIndexedDB(collection, data) {
        if (!db) return false;

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([collection], 'readwrite');
                const store = transaction.objectStore(collection);

                const items = Array.isArray(data) ? data : [data];
                
                for (const item of items) {
                    // Add cache metadata
                    item._syncedAt = Date.now();
                    store.put(item);
                }

                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => resolve(false);
            } catch (e) {
                console.warn('[CacheManager] IndexedDB save failed:', e);
                resolve(false);
            }
        });
    }

    /**
     * Delete from IndexedDB
     * @param {string} collection 
     * @param {string} id 
     * @returns {Promise<boolean>}
     */
    async function deleteFromIndexedDB(collection, id) {
        if (!db) return false;

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([collection], 'readwrite');
                const store = transaction.objectStore(collection);
                const request = store.delete(id);

                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    }

    /**
     * Clear collection in IndexedDB
     * @param {string} collection 
     * @returns {Promise<boolean>}
     */
    async function clearIndexedDBCollection(collection) {
        if (!db) return false;

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([collection], 'readwrite');
                const store = transaction.objectStore(collection);
                const request = store.clear();

                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    }

    // ============================================
    // UNIFIED CACHE API
    // ============================================

    /**
     * Get item from cache (tries all levels)
     * @param {string} key 
     * @returns {*}
     */
    function get(key) {
        // Try memory first
        const memValue = getFromMemory(key);
        if (memValue !== null) {
            return memValue;
        }

        // Try localStorage
        const lsValue = getFromLocalStorage(key);
        if (lsValue !== null) {
            // Promote to memory cache
            setInMemory(key, lsValue);
            return lsValue;
        }

        return null;
    }

    /**
     * Set item in cache (all levels)
     * @param {string} key 
     * @param {*} value 
     * @param {number} ttl 
     */
    function set(key, value, ttl = config.defaultTTL) {
        setInMemory(key, value, ttl);
        setInLocalStorage(key, value, ttl);
    }

    /**
     * Delete item from cache
     * @param {string} key 
     */
    function del(key) {
        memoryCache.delete(key);
        cacheMetadata.delete(key);
        localStorage.removeItem(`gc_cache_${key}`);
    }

    /**
     * Clear cache matching pattern
     * @param {string} pattern - Prefix to match
     */
    function clear(pattern) {
        // Clear memory cache
        for (const key of memoryCache.keys()) {
            if (key.startsWith(pattern)) {
                memoryCache.delete(key);
                cacheMetadata.delete(key);
            }
        }

        // Clear localStorage
        const keysToRemove = [];
        for (const key in localStorage) {
            if (key.startsWith(`gc_cache_${pattern}`)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    /**
     * Clear all cache
     */
    function clearAll() {
        memoryCache.clear();
        cacheMetadata.clear();

        const keysToRemove = [];
        for (const key in localStorage) {
            if (key.startsWith('gc_cache_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    // ============================================
    // COLLECTION CACHE (IndexedDB-based)
    // ============================================

    const collections = {
        /**
         * Get all items from a collection
         * @param {string} name 
         * @returns {Promise<Array>}
         */
        async getAll(name) {
            // Try memory first
            const memKey = `collection_${name}`;
            const cached = getFromMemory(memKey);
            if (cached) return cached;

            // Try IndexedDB
            const items = await getAllFromIndexedDB(name);
            if (items.length > 0) {
                setInMemory(memKey, items, config.defaultTTL);
            }
            return items;
        },

        /**
         * Get single item from collection
         * @param {string} name 
         * @param {string} id 
         * @returns {Promise<Object|null>}
         */
        async get(name, id) {
            // Check if we have the full collection cached
            const memKey = `collection_${name}`;
            const cached = getFromMemory(memKey);
            if (cached) {
                return cached.find(item => item.id === id) || null;
            }

            // Try IndexedDB directly
            return await getFromIndexedDB(name, id);
        },

        /**
         * Save items to collection
         * @param {string} name 
         * @param {Array|Object} items 
         * @returns {Promise<boolean>}
         */
        async save(name, items) {
            // Save to IndexedDB
            const success = await saveToIndexedDB(name, items);
            
            // Invalidate memory cache
            memoryCache.delete(`collection_${name}`);
            
            return success;
        },

        /**
         * Delete item from collection
         * @param {string} name 
         * @param {string} id 
         * @returns {Promise<boolean>}
         */
        async delete(name, id) {
            const success = await deleteFromIndexedDB(name, id);
            memoryCache.delete(`collection_${name}`);
            return success;
        },

        /**
         * Clear entire collection
         * @param {string} name 
         * @returns {Promise<boolean>}
         */
        async clear(name) {
            const success = await clearIndexedDBCollection(name);
            memoryCache.delete(`collection_${name}`);
            return success;
        },

        /**
         * Get items modified since timestamp
         * @param {string} name 
         * @param {number} since - Timestamp
         * @returns {Promise<Array>}
         */
        async getModifiedSince(name, since) {
            const items = await getAllFromIndexedDB(name);
            return items.filter(item => {
                const updatedAt = new Date(item.updatedAt || item.createdAt || 0).getTime();
                return updatedAt > since;
            });
        }
    };

    // ============================================
    // SYNC METADATA
    // ============================================

    /**
     * Get last sync time for a collection
     * @param {string} collection 
     * @returns {Promise<number|null>}
     */
    async function getLastSync(collection) {
        if (!db) {
            return parseInt(localStorage.getItem(`gc_lastSync_${collection}`)) || null;
        }

        return new Promise((resolve) => {
            try {
                const transaction = db.transaction(['_metadata'], 'readonly');
                const store = transaction.objectStore('_metadata');
                const request = store.get(`lastSync_${collection}`);

                request.onsuccess = () => {
                    resolve(request.result?.value || null);
                };
                request.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    /**
     * Set last sync time for a collection
     * @param {string} collection 
     * @param {number} timestamp 
     * @returns {Promise<boolean>}
     */
    async function setLastSync(collection, timestamp = Date.now()) {
        localStorage.setItem(`gc_lastSync_${collection}`, timestamp.toString());

        if (!db) return true;

        return new Promise((resolve) => {
            try {
                const transaction = db.transaction(['_metadata'], 'readwrite');
                const store = transaction.objectStore('_metadata');
                store.put({ key: `lastSync_${collection}`, value: timestamp });

                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    }

    // ============================================
    // STATS
    // ============================================

    /**
     * Get cache statistics
     * @returns {Object}
     */
    function getStats() {
        return {
            memory: {
                items: memoryCache.size,
                maxItems: config.maxMemoryItems
            },
            localStorage: {
                bytesUsed: getLocalStorageSize(),
                maxBytes: config.maxLocalStorageSize,
                percentUsed: Math.round((getLocalStorageSize() / config.maxLocalStorageSize) * 100)
            },
            indexedDB: {
                available: !!db,
                collections: config.collections
            }
        };
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    async function init() {
        if (isInitialized) return;

        await initDB();
        isInitialized = true;

        console.log('[CacheManager] Initialized', getStats());
    }

    // ============================================
    // PUBLIC API
    // ============================================
    return {
        // Initialize
        init,

        // Simple key-value cache
        get,
        set,
        delete: del,
        clear,
        clearAll,

        // Collection-based cache (IndexedDB)
        collections,

        // Sync metadata
        getLastSync,
        setLastSync,

        // Stats
        getStats,

        // Direct access (advanced)
        getFromMemory,
        setInMemory,
        getFromLocalStorage,
        setInLocalStorage,
        getFromIndexedDB,
        getAllFromIndexedDB,
        saveToIndexedDB,
        deleteFromIndexedDB
    };
})();

// Auto-init
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => CacheManager.init());
    } else {
        CacheManager.init();
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.CacheManager = CacheManager;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CacheManager;
}
