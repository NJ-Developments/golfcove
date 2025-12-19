/**
 * Golf Cove - Unified Service Layer
 * Bridges old modules with new unified architecture
 * Provides consistent API for all data operations
 * @version 2.0.0
 */

const GolfCoveServices = (function() {
    'use strict';
    
    const Config = window.GolfCoveConfig;
    const Core = window.GolfCoveCore;
    
    // ============================================================
    // CUSTOMER SERVICE
    // Unifies GolfCoveCustomers and GolfCoveCustomerManager
    // ============================================================
    const CustomerService = {
        /**
         * Get all customers
         */
        getAll() {
            // Prefer CustomerManager if available (has more features)
            if (window.GolfCoveCustomerManager?.getAllCustomers) {
                return window.GolfCoveCustomerManager.getAllCustomers();
            }
            if (window.GolfCoveCustomers?.getAll) {
                return window.GolfCoveCustomers.getAll();
            }
            return JSON.parse(localStorage.getItem('gc_customers') || '[]');
        },
        
        /**
         * Get customer by ID
         */
        get(id) {
            if (window.GolfCoveCustomerManager?.getCustomer) {
                const result = window.GolfCoveCustomerManager.getCustomer(id);
                return result?.success ? result.data : null;
            }
            if (window.GolfCoveCustomers?.get) {
                return window.GolfCoveCustomers.get(id);
            }
            return this.getAll().find(c => c.id === id);
        },
        
        /**
         * Find customer by email
         */
        findByEmail(email) {
            if (window.GolfCoveCustomerManager?.findByEmail) {
                return window.GolfCoveCustomerManager.findByEmail(email);
            }
            if (window.GolfCoveCustomers?.getByEmail) {
                return window.GolfCoveCustomers.getByEmail(email);
            }
            return this.getAll().find(c => 
                c.email?.toLowerCase() === email.toLowerCase()
            );
        },
        
        /**
         * Find customer by phone
         */
        findByPhone(phone) {
            const cleaned = phone.replace(/\D/g, '');
            if (window.GolfCoveCustomerManager?.findByPhone) {
                return window.GolfCoveCustomerManager.findByPhone(phone);
            }
            if (window.GolfCoveCustomers?.getByPhone) {
                return window.GolfCoveCustomers.getByPhone(phone);
            }
            return this.getAll().find(c => 
                c.phone?.replace(/\D/g, '') === cleaned
            );
        },
        
        /**
         * Search customers
         */
        search(query, options = {}) {
            if (window.GolfCoveCustomerManager?.searchCustomers) {
                const result = window.GolfCoveCustomerManager.searchCustomers(query, options);
                return result?.success ? result.data : [];
            }
            if (window.GolfCoveCustomers?.search) {
                return window.GolfCoveCustomers.search(query, options);
            }
            
            const q = query.toLowerCase().trim();
            return this.getAll().filter(c => {
                const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
                return fullName.includes(q) || 
                       c.email?.toLowerCase().includes(q) ||
                       c.phone?.includes(q);
            }).slice(0, options.limit || 50);
        },
        
        /**
         * Create customer
         */
        create(data) {
            if (window.GolfCoveCustomerManager?.createCustomer) {
                return window.GolfCoveCustomerManager.createCustomer(data);
            }
            if (window.GolfCoveCustomers?.create) {
                return window.GolfCoveCustomers.create(data);
            }
            
            // Fallback implementation
            const customers = this.getAll();
            const customer = {
                id: Date.now(),
                ...data,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            customers.push(customer);
            localStorage.setItem('gc_customers', JSON.stringify(customers));
            
            // Emit event
            if (Core?.emit) Core.emit('customer:created', { customer });
            
            return { success: true, customer };
        },
        
        /**
         * Update customer
         */
        update(id, updates) {
            if (window.GolfCoveCustomerManager?.updateCustomer) {
                return window.GolfCoveCustomerManager.updateCustomer(id, updates);
            }
            if (window.GolfCoveCustomers?.update) {
                return window.GolfCoveCustomers.update(id, updates);
            }
            
            const customers = this.getAll();
            const index = customers.findIndex(c => c.id === id);
            if (index === -1) {
                return { success: false, error: 'Customer not found' };
            }
            
            customers[index] = {
                ...customers[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem('gc_customers', JSON.stringify(customers));
            
            if (Core?.emit) Core.emit('customer:updated', { customer: customers[index] });
            
            return { success: true, customer: customers[index] };
        },
        
        /**
         * Get member discount for customer
         */
        getMemberDiscount(customer) {
            if (!customer?.membership?.type && !customer?.memberType) {
                return 0;
            }
            const memberType = customer.membership?.type || customer.memberType;
            return Config.getMemberDiscount(memberType);
        },
        
        /**
         * Check if customer is a member
         */
        isMember(customer) {
            if (!customer) return false;
            if (customer.isMember === true) return true;
            if (customer.membership?.status === 'active') return true;
            return false;
        },
        
        /**
         * Sync customer to Stripe (creates/updates Stripe Customer)
         */
        async syncToStripe(customerId) {
            if (window.GolfCoveCustomerManager?.syncToStripe) {
                return window.GolfCoveCustomerManager.syncToStripe(customerId);
            }
            return { success: false, error: 'CustomerManager not available' };
        },
        
        /**
         * Get Stripe customer ID for a local customer
         */
        async getStripeCustomerId(customerId) {
            if (window.GolfCoveCustomerManager?.getStripeCustomerId) {
                return window.GolfCoveCustomerManager.getStripeCustomerId(customerId);
            }
            return null;
        },
        
        /**
         * Find local customer by Stripe customer ID
         */
        findByStripeId(stripeCustomerId) {
            if (window.GolfCoveCustomerManager?.findByStripeId) {
                return window.GolfCoveCustomerManager.findByStripeId(stripeCustomerId);
            }
            return this.getAll().find(c => c.stripeCustomerId === stripeCustomerId);
        }
    };
    
    // ============================================================
    // BOOKING SERVICE
    // Unifies GolfCoveBooking and GolfCoveBookingManager
    // ============================================================
    const BookingService = {
        /**
         * Get all bookings
         */
        getAll() {
            if (window.GolfCoveBookingManager?.getBookingsForDate) {
                // Manager stores by date, need to aggregate
                return JSON.parse(localStorage.getItem('gc_bookings') || '[]');
            }
            if (window.GolfCoveBooking?.getBookings) {
                return window.GolfCoveBooking.getBookings();
            }
            return JSON.parse(localStorage.getItem('gc_bookings') || '[]');
        },
        
        /**
         * Get bookings for a specific date
         */
        getForDate(date) {
            const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
            
            if (window.GolfCoveBookingManager?.getBookingsForDate) {
                return window.GolfCoveBookingManager.getBookingsForDate(dateStr);
            }
            
            return this.getAll().filter(b => {
                const bookingDate = b.date || new Date(b.startTime || b.createdAt).toISOString().split('T')[0];
                return bookingDate === dateStr;
            });
        },
        
        /**
         * Get available time slots
         */
        getAvailableSlots(date, duration = 60, bayType = null) {
            if (window.GolfCoveBookingManager?.getAvailability) {
                return window.GolfCoveBookingManager.getAvailability(date, duration, bayType);
            }
            if (window.GolfCoveBooking?.getAvailableSlots) {
                return window.GolfCoveBooking.getAvailableSlots(date, duration);
            }
            
            // Fallback: Generate slots and check availability
            const hours = Config.getOperatingHours(date);
            const slots = [];
            
            for (let hour = hours.open; hour < hours.close; hour++) {
                slots.push({
                    time: `${hour.toString().padStart(2, '0')}:00`,
                    available: true, // Would need to check against bookings
                    isPeak: Config.isPeakHour(date, hour)
                });
            }
            
            return slots;
        },
        
        /**
         * Check if a slot is available
         */
        isSlotAvailable(bayId, date, time, duration, excludeBookingId = null) {
            if (window.GolfCoveBooking?.isSlotAvailable) {
                return window.GolfCoveBooking.isSlotAvailable(bayId, date, time, duration, excludeBookingId);
            }
            
            const bookings = this.getForDate(date);
            const startMinutes = this.timeToMinutes(time);
            const endMinutes = startMinutes + duration;
            
            return !bookings.some(b => {
                if (b.id === excludeBookingId) return false;
                if (b.status === 'cancelled') return false;
                if (b.bayId !== bayId && b.room !== bayId) return false;
                
                const bStart = this.timeToMinutes(b.time || b.startTime);
                const bEnd = bStart + (b.duration || 60);
                
                return startMinutes < bEnd && endMinutes > bStart;
            });
        },
        
        /**
         * Calculate booking price
         */
        calculatePrice(bayType, duration, date, membership = null) {
            if (window.GolfCoveBookingManager?.calculatePrice) {
                return window.GolfCoveBookingManager.calculatePrice(bayType, duration, date, false, membership);
            }
            
            const bay = Config.bays[bayType];
            if (!bay) return 0;
            
            const isWeekend = Config.isWeekend(date);
            const hourlyRate = isWeekend ? bay.hourlyRate.weekend : bay.hourlyRate.weekday;
            let price = (hourlyRate / 60) * duration;
            
            // Apply member discount
            if (membership) {
                const discount = Config.getMemberDiscount(membership);
                price *= (1 - discount);
            }
            
            return Math.round(price * 100) / 100;
        },
        
        /**
         * Create a booking
         */
        create(data) {
            if (window.GolfCoveBookingManager?.createBooking) {
                return window.GolfCoveBookingManager.createBooking(data);
            }
            if (window.GolfCoveBooking?.create) {
                return window.GolfCoveBooking.create(data);
            }
            
            const bookings = this.getAll();
            const booking = {
                id: Date.now().toString(),
                ...data,
                status: 'confirmed',
                createdAt: new Date().toISOString()
            };
            
            bookings.push(booking);
            localStorage.setItem('gc_bookings', JSON.stringify(bookings));
            
            if (Core?.emit) Core.emit('booking:created', { booking });
            
            return { success: true, booking };
        },
        
        /**
         * Helper: Convert time string to minutes
         */
        timeToMinutes(timeStr) {
            if (!timeStr) return 0;
            
            // Handle "10:00am" format
            const match = timeStr.match(/(\d+):(\d+)(am|pm)?/i);
            if (!match) return 0;
            
            let hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            const ampm = match[3]?.toLowerCase();
            
            if (ampm === 'pm' && hours !== 12) hours += 12;
            if (ampm === 'am' && hours === 12) hours = 0;
            
            return hours * 60 + minutes;
        }
    };
    
    // ============================================================
    // TAB SERVICE
    // Uses TabsSync for Firebase-backed tab management
    // ============================================================
    const TabService = {
        /**
         * Get all open tabs
         */
        getAll() {
            if (window.TabsSync?.getAllTabs) {
                return window.TabsSync.getAllTabs();
            }
            return JSON.parse(localStorage.getItem('gc_tabs') || '[]')
                .filter(t => t.status === 'open' || !t.status);
        },
        
        /**
         * Get a specific tab
         */
        get(tabId) {
            if (window.TabsSync?.getTab) {
                return window.TabsSync.getTab(tabId);
            }
            return this.getAll().find(t => t.id === tabId || t.id === parseInt(tabId));
        },
        
        /**
         * Create a new tab
         */
        create(customer, table = 'Tab', employee = null) {
            if (window.TabsSync?.createTab) {
                // TabsSync.createTab(customerName, customerId, items, employeeName, options)
                return window.TabsSync.createTab(customer, null, [], employee || 'POS', { table });
            }
            
            const tabs = this.getAll();
            
            // Check for duplicate table
            if (table !== 'Tab') {
                const existing = tabs.find(t => t.table === table);
                if (existing) {
                    return { success: false, error: 'This table already has an open tab' };
                }
            }
            
            const tab = {
                id: Date.now(),
                customer,
                employee: employee || 'POS',
                table,
                items: [],
                subtotal: 0,
                tax: 0,
                total: 0,
                memberDiscount: 0,
                status: 'open',
                openedAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
            };
            
            tabs.push(tab);
            localStorage.setItem('gc_tabs', JSON.stringify(tabs));
            
            if (Core?.emit) Core.emit('tab:created', { tab });
            
            return { success: true, tab };
        },
        
        /**
         * Add item to tab
         */
        addItem(tabId, item) {
            if (window.TabsSync?.addItemToTab) {
                return window.TabsSync.addItemToTab(tabId, item);
            }
            
            const tabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
            const tab = tabs.find(t => t.id === tabId || t.id === parseInt(tabId));
            
            if (!tab) {
                return { success: false, error: 'Tab not found' };
            }
            
            // Check if item exists
            const existingIndex = tab.items.findIndex(i => 
                i.name === item.name && i.price === item.price
            );
            
            if (existingIndex !== -1) {
                tab.items[existingIndex].qty = (tab.items[existingIndex].qty || 1) + (item.qty || 1);
            } else {
                tab.items.push({
                    name: item.name,
                    price: item.price,
                    qty: item.qty || 1,
                    category: item.category || 'other'
                });
            }
            
            // Recalculate totals
            this.recalculateTab(tab);
            
            localStorage.setItem('gc_tabs', JSON.stringify(tabs));
            
            if (Core?.emit) Core.emit('tab:updated', { tab });
            
            return { success: true, tab };
        },
        
        /**
         * Recalculate tab totals
         */
        recalculateTab(tab) {
            tab.subtotal = tab.items.reduce((sum, item) => 
                sum + (item.price * (item.qty || 1)), 0
            );
            tab.tax = Config.calculateTax(tab.subtotal);
            tab.total = tab.subtotal + tab.tax - (tab.memberDiscount || 0);
            return tab;
        },
        
        /**
         * Close tab (complete payment)
         */
        close(tabId, paymentMethod = 'card') {
            if (window.TabsSync?.closeTab) {
                return window.TabsSync.closeTab(tabId, paymentMethod);
            }
            
            const tabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
            const tabIndex = tabs.findIndex(t => t.id === tabId || t.id === parseInt(tabId));
            
            if (tabIndex === -1) {
                return { success: false, error: 'Tab not found' };
            }
            
            const tab = tabs[tabIndex];
            
            // Create transaction
            const transaction = {
                id: Date.now(),
                type: 'tab_payment',
                customer: tab.customer,
                employee: tab.employee,
                items: tab.items,
                subtotal: tab.subtotal,
                tax: tab.tax,
                total: tab.total,
                memberDiscount: tab.memberDiscount,
                paymentMethod,
                tabId: tab.id,
                table: tab.table,
                date: new Date().toISOString()
            };
            
            // Save transaction
            const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
            transactions.unshift(transaction);
            localStorage.setItem('gc_transactions', JSON.stringify(transactions));
            
            // Remove tab
            tabs.splice(tabIndex, 1);
            localStorage.setItem('gc_tabs', JSON.stringify(tabs));
            
            if (Core?.emit) {
                Core.emit('tab:closed', { tab, transaction });
                Core.emit('transaction:created', { transaction });
            }
            
            return { success: true, transaction };
        }
    };
    
    // ============================================================
    // TRANSACTION SERVICE
    // Unified transaction handling
    // ============================================================
    const TransactionService = {
        /**
         * Get all transactions
         */
        getAll(options = {}) {
            let transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
            
            // Filter by date range
            if (options.startDate) {
                const start = new Date(options.startDate);
                transactions = transactions.filter(t => new Date(t.date) >= start);
            }
            if (options.endDate) {
                const end = new Date(options.endDate);
                transactions = transactions.filter(t => new Date(t.date) <= end);
            }
            
            // Filter by type
            if (options.type) {
                transactions = transactions.filter(t => t.type === options.type);
            }
            
            // Limit
            if (options.limit) {
                transactions = transactions.slice(0, options.limit);
            }
            
            return transactions;
        },
        
        /**
         * Get transaction by ID
         */
        get(id) {
            return this.getAll().find(t => t.id === id || t.id === parseInt(id));
        },
        
        /**
         * Create a transaction
         */
        create(data) {
            if (window.GolfCoveTransactionManager?.createTransaction) {
                return window.GolfCoveTransactionManager.createTransaction(
                    data.items, 
                    data.customer, 
                    data
                );
            }
            
            const transactions = this.getAll();
            const transaction = {
                id: Date.now(),
                ...data,
                date: new Date().toISOString()
            };
            
            transactions.unshift(transaction);
            localStorage.setItem('gc_transactions', JSON.stringify(transactions));
            
            if (Core?.emit) Core.emit('transaction:created', { transaction });
            
            return { success: true, transaction };
        },
        
        /**
         * Calculate totals
         */
        calculateTotals(items, discountPercent = 0, tipAmount = 0) {
            const subtotal = items.reduce((sum, item) => 
                sum + (item.price * (item.quantity || item.qty || 1)), 0
            );
            const discount = subtotal * (discountPercent / 100);
            const taxableAmount = subtotal - discount;
            const tax = Config.calculateTax(taxableAmount);
            const total = taxableAmount + tax + tipAmount;
            
            return {
                subtotal,
                discount,
                discountPercent,
                taxableAmount,
                tax,
                taxRate: Config.taxRate,
                tip: tipAmount,
                total
            };
        },
        
        /**
         * Get daily summary
         */
        getDailySummary(date = new Date()) {
            const dateStr = date.toISOString().split('T')[0];
            const transactions = this.getAll().filter(t => {
                const tDate = new Date(t.date).toISOString().split('T')[0];
                return tDate === dateStr;
            });
            
            return {
                date: dateStr,
                count: transactions.length,
                total: transactions.reduce((sum, t) => sum + (t.total || t.amount || 0), 0),
                subtotal: transactions.reduce((sum, t) => sum + (t.subtotal || 0), 0),
                tax: transactions.reduce((sum, t) => sum + (t.tax || 0), 0),
                tips: transactions.reduce((sum, t) => sum + (t.tip || 0), 0),
                byMethod: transactions.reduce((acc, t) => {
                    const method = t.paymentMethod || 'other';
                    acc[method] = (acc[method] || 0) + (t.total || t.amount || 0);
                    return acc;
                }, {})
            };
        }
    };
    
    // ============================================================
    // SYNC SERVICE
    // Coordinates all sync operations
    // ============================================================
    const SyncService = {
        /**
         * Initialize sync
         */
        init() {
            // Use SyncManager if available
            if (window.GolfCoveSyncManager?.init) {
                window.GolfCoveSyncManager.init(Config.sync);
            }
            // Or use Firebase sync
            if (window.GolfCoveFirebase?.startAutoSync) {
                window.GolfCoveFirebase.startAutoSync();
            }
        },
        
        /**
         * Sync all collections
         */
        async syncAll() {
            if (window.GolfCoveSyncManager?.syncAll) {
                return window.GolfCoveSyncManager.syncAll();
            }
            if (window.GolfCoveFirebase?.syncAll) {
                return window.GolfCoveFirebase.syncAll();
            }
            return { success: true, message: 'No sync manager available' };
        },
        
        /**
         * Sync specific collection
         */
        async syncCollection(collection) {
            if (window.GolfCoveSyncManager?.sync) {
                return window.GolfCoveSyncManager.sync(collection);
            }
            return { success: true };
        },
        
        /**
         * Track a change for later sync
         */
        trackChange(collection, operation, data) {
            if (window.GolfCoveSyncManager?.trackChange) {
                return window.GolfCoveSyncManager.trackChange(collection, operation, data);
            }
            // Queue locally if no sync manager
            const pending = JSON.parse(localStorage.getItem('gc_pending_sync') || '{}');
            if (!pending[collection]) pending[collection] = [];
            pending[collection].push({ operation, data, timestamp: Date.now() });
            localStorage.setItem('gc_pending_sync', JSON.stringify(pending));
        },
        
        /**
         * Check if online
         */
        isOnline() {
            return navigator.onLine;
        }
    };
    
    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        Customer: CustomerService,
        Booking: BookingService,
        Tab: TabService,
        Transaction: TransactionService,
        Sync: SyncService,
        
        // Quick access to config
        Config: Config,
        
        // Version
        version: '2.0.0'
    };
})();

// Make globally available
window.GolfCoveServices = GolfCoveServices;
