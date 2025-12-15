/**
 * Golf Cove - State Management
 * Centralized reactive state with subscription support
 */

const GolfCoveState = (function() {
    'use strict';
    
    const Core = GolfCoveCore;
    
    // ============ STATE STORE ============
    const stores = new Map();
    
    function createStore(name, initialState = {}, options = {}) {
        // Validate inputs
        if (!name || typeof name !== 'string') {
            throw new Error('Store name must be a non-empty string');
        }
        
        if (typeof initialState !== 'object' || initialState === null) {
            throw new Error('Initial state must be an object');
        }
        
        if (stores.has(name)) {
            Core.log('warn', `Store "${name}" already exists, returning existing`);
            return stores.get(name);
        }
        
        const state = Core.deepClone(initialState);
        const subscribers = new Set();
        const history = [];
        const maxHistory = Math.min(options.maxHistory || 50, 200); // Cap at 200
        const persist = options.persist || false;
        const persistKey = `gc_state_${name}`;
        const actionLog = []; // Track recent actions for debugging
        const MAX_ACTION_LOG = 50;
        
        // Load persisted state
        if (persist) {
            try {
                const saved = localStorage.getItem(persistKey);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    // Validate persisted state has expected shape
                    if (typeof parsed === 'object' && parsed !== null) {
                        Object.assign(state, parsed);
                    }
                }
            } catch (e) {
                Core.log('warn', `Failed to load persisted state for "${name}"`, { error: e.message });
            }
        }
        
        function getState() {
            return Core.deepClone(state);
        }
        
        function setState(updates, meta = {}) {
            const prevState = Core.deepClone(state);
            
            // Validate updates
            if (updates === null || updates === undefined) {
                Core.log('warn', `setState called with null/undefined in store "${name}"`);
                return;
            }
            
            try {
                // Apply updates
                if (typeof updates === 'function') {
                    const result = updates(Core.deepClone(state));
                    if (typeof result === 'object' && result !== null) {
                        Object.assign(state, result);
                    }
                } else if (typeof updates === 'object') {
                    Object.assign(state, updates);
                }
            } catch (e) {
                Core.log('error', `Error applying state update in "${name}"`, { error: e.message });
                return;
            }
            
            // Track action for debugging
            const actionEntry = {
                action: meta.action || 'unknown',
                timestamp: Date.now(),
                changedKeys: Object.keys(computePatch(prevState, state))
            };
            actionLog.push(actionEntry);
            if (actionLog.length > MAX_ACTION_LOG) {
                actionLog.shift();
            }
            
            // Track history
            if (options.trackHistory !== false) {
                history.push({
                    prevState,
                    nextState: Core.deepClone(state),
                    timestamp: Date.now(),
                    meta
                });
                
                if (history.length > maxHistory) {
                    history.shift();
                }
            }
            
            // Persist with error handling and size check
            if (persist) {
                try {
                    const json = JSON.stringify(state);
                    if (json.length > 1024 * 1024) { // 1MB limit per store
                        Core.log('warn', `State too large to persist for "${name}"`, { size: json.length });
                    } else {
                        localStorage.setItem(persistKey, json);
                    }
                } catch (e) {
                    Core.log('warn', `Failed to persist state for "${name}"`, { error: e.message });
                }
            }
            
            // Notify subscribers with error isolation
            const patch = computePatch(prevState, state);
            subscribers.forEach(callback => {
                try {
                    callback(Core.deepClone(state), prevState, patch);
                } catch (e) {
                    Core.log('error', 'State subscriber error', { store: name, error: e.message });
                }
            });
            
            // Emit event
            Core.emit(`state:${name}:change`, { state: Core.deepClone(state), prevState, patch, meta });
        }
        
        function subscribe(callback) {
            subscribers.add(callback);
            // Return unsubscribe function
            return () => subscribers.delete(callback);
        }
        
        function select(selector) {
            return selector(state);
        }
        
        function reset() {
            setState(Core.deepClone(initialState), { action: 'reset' });
            history.length = 0;
        }
        
        function undo() {
            if (history.length === 0) return false;
            const lastChange = history.pop();
            Object.assign(state, lastChange.prevState);
            
            subscribers.forEach(callback => {
                callback(state, lastChange.nextState, {});
            });
            
            return true;
        }
        
        const store = {
            name,
            getState,
            setState,
            subscribe,
            select,
            reset,
            undo,
            getHistory: () => [...history],
            getActionLog: () => [...actionLog],
            getSubscriberCount: () => subscribers.size
        };
        
        stores.set(name, store);
        Core.log('debug', `Store "${name}" created`);
        return store;
    }
    
    function getStore(name) {
        return stores.get(name);
    }
    
    function computePatch(prev, next) {
        const patch = {};
        const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
        
        allKeys.forEach(key => {
            if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
                patch[key] = { prev: prev[key], next: next[key] };
            }
        });
        
        return patch;
    }
    
    // ============ PRE-DEFINED STORES ============
    
    // Current session/user state
    const sessionStore = createStore('session', {
        isLoggedIn: false,
        employee: null,
        role: null,
        clockedIn: false,
        clockInTime: null,
        lastActivity: null
    }, { persist: true });
    
    // UI state
    const uiStore = createStore('ui', {
        activeView: 'teesheet',
        sidebarOpen: true,
        modals: [],
        notifications: [],
        loading: {},
        selectedDate: new Date().toISOString().split('T')[0]
    }, { persist: false });
    
    // Tabs state
    const tabsStore = createStore('tabs', {
        active: [],
        selectedId: null,
        searchQuery: ''
    }, { persist: true });
    
    // Cart state
    const cartStore = createStore('cart', {
        items: [],
        customer: null,
        discount: null,
        giftCard: null,
        notes: ''
    }, { persist: true });
    
    // Bookings state  
    const bookingsStore = createStore('bookings', {
        date: new Date().toISOString().split('T')[0],
        slots: [],
        selected: null,
        filters: {
            bayType: 'all',
            status: 'all'
        }
    }, { persist: false });
    
    // ============ SELECTORS ============
    const Selectors = {
        // Session
        isLoggedIn: () => sessionStore.select(s => s.isLoggedIn),
        currentEmployee: () => sessionStore.select(s => s.employee),
        currentRole: () => sessionStore.select(s => s.role),
        
        // UI
        activeView: () => uiStore.select(s => s.activeView),
        isLoading: (key) => uiStore.select(s => s.loading[key] || false),
        selectedDate: () => uiStore.select(s => s.selectedDate),
        
        // Tabs
        activeTabs: () => tabsStore.select(s => s.active),
        selectedTab: () => {
            const state = tabsStore.getState();
            return state.active.find(t => t.id === state.selectedId) || null;
        },
        tabCount: () => tabsStore.select(s => s.active.length),
        
        // Cart
        cartItems: () => cartStore.select(s => s.items),
        cartTotal: () => {
            const state = cartStore.getState();
            const subtotal = state.items.reduce((sum, item) => 
                sum + (item.price * item.quantity), 0
            );
            const discount = state.discount ? 
                (state.discount.type === 'percent' ? 
                    subtotal * (state.discount.value / 100) : 
                    state.discount.value
                ) : 0;
            return subtotal - discount;
        },
        cartItemCount: () => cartStore.select(s => 
            s.items.reduce((sum, item) => sum + item.quantity, 0)
        ),
        
        // Bookings
        bookingsForSlot: (bayId, time) => {
            return bookingsStore.select(s => 
                s.slots.find(slot => slot.bayId === bayId && slot.time === time)
            );
        },
        availableSlots: () => {
            return bookingsStore.select(s => 
                s.slots.filter(slot => slot.status === 'available')
            );
        }
    };
    
    // ============ ACTIONS ============
    const Actions = {
        // Session actions
        login: (employee) => {
            sessionStore.setState({
                isLoggedIn: true,
                employee,
                role: employee.role,
                lastActivity: Date.now()
            }, { action: 'login' });
            Core.emit('session:login', { employee });
        },
        
        logout: () => {
            const employee = sessionStore.select(s => s.employee);
            sessionStore.reset();
            Core.emit('session:logout', { employee });
        },
        
        clockIn: () => {
            sessionStore.setState({
                clockedIn: true,
                clockInTime: Date.now()
            }, { action: 'clockIn' });
        },
        
        clockOut: () => {
            sessionStore.setState({
                clockedIn: false,
                clockInTime: null
            }, { action: 'clockOut' });
        },
        
        // UI actions
        setActiveView: (view) => {
            uiStore.setState({ activeView: view }, { action: 'setView' });
            Core.emit('ui:viewChange', { view });
        },
        
        setLoading: (key, isLoading) => {
            uiStore.setState(s => ({
                loading: { ...s.loading, [key]: isLoading }
            }), { action: 'setLoading' });
        },
        
        setSelectedDate: (date) => {
            uiStore.setState({ selectedDate: date }, { action: 'setDate' });
            Core.emit('ui:dateChange', { date });
        },
        
        showModal: (modalConfig) => {
            const id = Core.generateId('modal');
            uiStore.setState(s => ({
                modals: [...s.modals, { id, ...modalConfig }]
            }), { action: 'showModal' });
            return id;
        },
        
        closeModal: (id) => {
            uiStore.setState(s => ({
                modals: s.modals.filter(m => m.id !== id)
            }), { action: 'closeModal' });
        },
        
        notify: (message, type = 'info', duration = 3000) => {
            const id = Core.generateId('notif');
            uiStore.setState(s => ({
                notifications: [...s.notifications, { id, message, type, timestamp: Date.now() }]
            }), { action: 'notify' });
            
            if (duration > 0) {
                setTimeout(() => {
                    uiStore.setState(s => ({
                        notifications: s.notifications.filter(n => n.id !== id)
                    }));
                }, duration);
            }
            
            return id;
        },
        
        // Cart actions
        addToCart: (item) => {
            cartStore.setState(s => {
                const existing = s.items.find(i => i.id === item.id);
                if (existing) {
                    return {
                        items: s.items.map(i => 
                            i.id === item.id 
                                ? { ...i, quantity: i.quantity + (item.quantity || 1) }
                                : i
                        )
                    };
                }
                return {
                    items: [...s.items, { ...item, quantity: item.quantity || 1 }]
                };
            }, { action: 'addToCart' });
            Core.emit('cart:itemAdded', { item });
        },
        
        removeFromCart: (itemId) => {
            cartStore.setState(s => ({
                items: s.items.filter(i => i.id !== itemId)
            }), { action: 'removeFromCart' });
            Core.emit('cart:itemRemoved', { itemId });
        },
        
        updateCartQuantity: (itemId, quantity) => {
            if (quantity <= 0) {
                Actions.removeFromCart(itemId);
                return;
            }
            cartStore.setState(s => ({
                items: s.items.map(i => 
                    i.id === itemId ? { ...i, quantity } : i
                )
            }), { action: 'updateQuantity' });
        },
        
        setCartCustomer: (customer) => {
            cartStore.setState({ customer }, { action: 'setCustomer' });
        },
        
        applyDiscount: (discount) => {
            cartStore.setState({ discount }, { action: 'applyDiscount' });
        },
        
        applyGiftCard: (giftCard) => {
            cartStore.setState({ giftCard }, { action: 'applyGiftCard' });
        },
        
        clearCart: () => {
            cartStore.reset();
            Core.emit('cart:cleared');
        },
        
        // Tab actions
        selectTab: (tabId) => {
            tabsStore.setState({ selectedId: tabId }, { action: 'selectTab' });
            Core.emit('tabs:selected', { tabId });
        },
        
        updateTabs: (tabs) => {
            tabsStore.setState({ active: tabs }, { action: 'updateTabs' });
        },
        
        // Booking actions
        setBookingDate: (date) => {
            bookingsStore.setState({ date }, { action: 'setDate' });
        },
        
        updateBookingSlots: (slots) => {
            bookingsStore.setState({ slots }, { action: 'updateSlots' });
        },
        
        selectBooking: (booking) => {
            bookingsStore.setState({ selected: booking }, { action: 'selectBooking' });
        }
    };
    
    // ============ MIDDLEWARE ============
    const middleware = [];
    
    function addMiddleware(fn) {
        middleware.push(fn);
        return () => {
            const idx = middleware.indexOf(fn);
            if (idx !== -1) middleware.splice(idx, 1);
        };
    }
    
    // Activity tracking middleware
    addMiddleware((store, prevState, nextState) => {
        if (store.name === 'session') {
            sessionStore.setState({ lastActivity: Date.now() });
        }
    });
    
    // ============ DEVTOOLS ============
    function enableDevtools() {
        if (typeof window === 'undefined') return;
        
        window.__GOLF_COVE_STATE__ = {
            stores: Object.fromEntries(stores),
            getState: (name) => stores.get(name)?.getState(),
            getAllState: () => {
                const all = {};
                stores.forEach((store, name) => {
                    all[name] = store.getState();
                });
                return all;
            },
            dispatch: (storeName, updates) => {
                const store = stores.get(storeName);
                if (store) store.setState(updates);
            }
        };
        
        Core.log('info', 'State devtools enabled. Access via window.__GOLF_COVE_STATE__');
    }
    
    // ============ INITIALIZATION ============
    function init() {
        if (Core.config.debug) {
            enableDevtools();
        }
        
        Core.log('info', 'State management initialized', {
            stores: Array.from(stores.keys())
        });
    }
    
    // ============ PUBLIC API ============
    return {
        init,
        createStore,
        getStore,
        
        // Pre-defined stores
        session: sessionStore,
        ui: uiStore,
        tabs: tabsStore,
        cart: cartStore,
        bookings: bookingsStore,
        
        // Helpers
        Selectors,
        Actions,
        addMiddleware
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.GolfCoveState = GolfCoveState;
    window.$state = GolfCoveState; // Short alias
}
