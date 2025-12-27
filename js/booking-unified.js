/**
 * Golf Cove - Unified Booking System
 * Single source of truth for all booking operations
 * Firebase-first with localStorage fallback for offline support
 * 
 * This module replaces:
 * - booking-system.js (GolfCoveBooking)
 * - booking-manager.js (GolfCoveBookingManager)
 * - bay-booking.js (BayBooking)
 * - teesheet-manager.js (TeeSheetManager)
 * 
 * @version 3.0.0
 */

const BookingSystem = (function() {
    'use strict';
    
    // ============ CONFIGURATION ============
    const FIREBASE_URL = 'https://golfcove-default-rtdb.firebaseio.com';
    const STORAGE_KEY = 'gc_bookings'; // Unified storage key
    const WAITLIST_KEY = 'gc_waitlist';
    const LEGACY_KEYS = ['gc_bookings_v3', 'bb_bookings']; // Keys to migrate from
    
    // Room/Bay configuration - 6 rooms as per actual setup
    const ROOMS = [
        { id: 1, name: 'Room 1', type: 'members', label: 'Members Only', capacity: 4, color: '#3b82f6' },
        { id: 2, name: 'Room 2', type: 'members', label: 'Members Only', capacity: 4, color: '#10b981' },
        { id: 3, name: 'Room 3', type: 'golf_menu', label: 'Golf & Menu', capacity: 4, color: '#f59e0b' },
        { id: 4, name: 'Room 4', type: 'golf_menu', label: 'Golf + Menu', capacity: 4, color: '#8b5cf6' },
        { id: 5, name: 'Room 5', type: 'golf_music', label: 'Golf + Music', capacity: 4, color: '#ec4899' },
        { id: 6, name: 'Room 6', type: 'members', label: 'Members Only', capacity: 4, color: '#06b6d4' }
    ];
    
    // Operating hours
    const HOURS = {
        default: { open: 9, close: 22 },
        byDay: {
            0: { open: 10, close: 20 }, // Sunday
            1: { open: 9, close: 22 },  // Monday
            2: { open: 9, close: 22 },  // Tuesday
            3: { open: 9, close: 22 },  // Wednesday
            4: { open: 9, close: 22 },  // Thursday
            5: { open: 9, close: 23 },  // Friday
            6: { open: 9, close: 23 }   // Saturday
        }
    };
    
    // Pricing configuration
    // UNIFIED with GolfCoveMembership and GolfCoveConfig
    const PRICING = {
        baseHourly: 65, // $65/hour - MUST match booking.html
        packages: {
            1: { price: 65, label: '1 Hour' },
            2: { price: 120, label: '2 Hours' },
            3: { price: 170, label: '3 Hours' },
            4: { price: 220, label: '4 Hours' }
        },
        peak: {
            enabled: true,
            multiplier: 1.25,
            weekday: { start: 17, end: 21 },   // 5pm - 9pm
            weekend: { start: 10, end: 21 }    // 10am - 9pm
        },
        // Member discounts - matches GolfCoveMembership.tiers
        // Note: birdie/eagle/family_birdie/family_eagle/corporate have unlimitedPlay
        // which means FREE bay time (handled in calculatePrice with special logic)
        memberDiscounts: {
            par: 0.10,           // 10% off hourly rates
            birdie: 1.00,        // 100% off (unlimited play)
            eagle: 1.00,         // 100% off (unlimited play)
            family_par: 0.10,    // 10% off hourly rates
            family_birdie: 1.00, // 100% off (unlimited play)
            family_eagle: 1.00,  // 100% off (unlimited play)
            corporate: 1.00,     // 100% off (unlimited play)
            league_player: 0.05, // 5% off
            league_team: 0.10,   // 10% off
            // Legacy types
            monthly: 0.10,
            annual: 0.10
        }
    };
    
    // Booking status enum
    const Status = {
        PENDING: 'pending',
        CONFIRMED: 'confirmed',
        CHECKED_IN: 'checked_in',
        COMPLETED: 'completed',
        NO_SHOW: 'no_show',
        CANCELLED: 'cancelled'
    };
    
    // ============ STATE ============
    let bookingsCache = [];
    let lastSync = null;
    let syncListeners = [];
    let isOnline = navigator.onLine;
    let realtimeUnsubscribe = null;
    
    // ============ INITIALIZATION ============
    async function init() {
        console.log('[BookingSystem] Initializing...');
        
        // Migrate from legacy storage keys
        migrateLegacyStorage();
        
        // Load from localStorage first (fast)
        bookingsCache = loadFromStorage();
        
        // Set up online/offline detection
        window.addEventListener('online', () => {
            isOnline = true;
            console.log('[BookingSystem] Back online, syncing...');
            syncToFirebase();
        });
        
        window.addEventListener('offline', () => {
            isOnline = false;
            console.log('[BookingSystem] Offline mode');
        });
        
        // Sync from Firebase
        await syncFromFirebase();
        
        // Also sync waitlist from Firebase
        await loadWaitlistFromFirebase();
        
        // Set up real-time listener
        setupRealtimeSync();
        
        console.log('[BookingSystem] Ready with', bookingsCache.length, 'bookings');
        emit('ready', { bookings: bookingsCache.length });
        
        return true;
    }
    
    // ============ STORAGE MIGRATION ============
    function migrateLegacyStorage() {
        try {
            const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            let migrated = [...existing];
            
            for (const legacyKey of LEGACY_KEYS) {
                const legacyData = JSON.parse(localStorage.getItem(legacyKey) || '[]');
                if (legacyData.length > 0) {
                    console.log(`[BookingSystem] Migrating ${legacyData.length} bookings from ${legacyKey}`);
                    
                    // Merge without duplicates (by id)
                    const existingIds = new Set(migrated.map(b => b.id));
                    for (const booking of legacyData) {
                        if (!existingIds.has(booking.id)) {
                            migrated.push(booking);
                            existingIds.add(booking.id);
                        }
                    }
                    
                    // Clear legacy key after migration
                    localStorage.removeItem(legacyKey);
                }
            }
            
            if (migrated.length > existing.length) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
                console.log(`[BookingSystem] Migration complete: ${migrated.length} total bookings`);
            }
        } catch (e) {
            console.warn('[BookingSystem] Migration error:', e);
        }
    }
    
    // ============ STORAGE ============
    function loadFromStorage() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            console.error('[BookingSystem] Storage load failed:', e);
            return [];
        }
    }
    
    function saveToStorage(bookings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
            localStorage.setItem(STORAGE_KEY + '_lastSync', new Date().toISOString());
        } catch (e) {
            console.error('[BookingSystem] Storage save failed:', e);
        }
    }
    
    // ============ FIREBASE SYNC ============
    async function syncFromFirebase() {
        if (!isOnline) return bookingsCache;
        
        try {
            const response = await fetch(`${FIREBASE_URL}/bookings.json`);
            if (response.ok) {
                const data = await response.json();
                if (data) {
                    // Convert Firebase object to array
                    const firebaseBookings = Object.entries(data).map(([key, value]) => ({
                        ...value,
                        _firebaseKey: key
                    }));
                    
                    // Merge with local (prefer Firebase for synced, local for pending)
                    bookingsCache = mergeBookings(bookingsCache, firebaseBookings);
                    saveToStorage(bookingsCache);
                    lastSync = new Date();
                    
                    console.log('[BookingSystem] Synced from Firebase:', firebaseBookings.length, 'bookings');
                    emit('sync', { source: 'firebase', count: firebaseBookings.length });
                }
            }
        } catch (e) {
            console.warn('[BookingSystem] Firebase sync failed:', e);
        }
        
        return bookingsCache;
    }
    
    async function syncToFirebase() {
        if (!isOnline) return false;
        
        try {
            // Get pending local bookings (created offline)
            const pendingBookings = bookingsCache.filter(b => b._pendingSync);
            
            for (const booking of pendingBookings) {
                const { _pendingSync, _firebaseKey, ...bookingData } = booking;
                
                if (_firebaseKey) {
                    // Update existing
                    await fetch(`${FIREBASE_URL}/bookings/${_firebaseKey}.json`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(bookingData)
                    });
                } else {
                    // Create new
                    const response = await fetch(`${FIREBASE_URL}/bookings.json`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(bookingData)
                    });
                    
                    if (response.ok) {
                        const { name } = await response.json();
                        booking._firebaseKey = name;
                    }
                }
                
                delete booking._pendingSync;
            }
            
            if (pendingBookings.length > 0) {
                saveToStorage(bookingsCache);
                console.log('[BookingSystem] Synced', pendingBookings.length, 'bookings to Firebase');
            }
            
            return true;
        } catch (e) {
            console.warn('[BookingSystem] Firebase push failed:', e);
            return false;
        }
    }
    
    async function saveBookingToFirebase(booking) {
        if (!isOnline) {
            booking._pendingSync = true;
            return null;
        }
        
        try {
            const { _pendingSync, _firebaseKey, ...bookingData } = booking;
            
            const response = await fetch(`${FIREBASE_URL}/bookings.json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });
            
            if (response.ok) {
                const { name } = await response.json();
                return name;
            }
        } catch (e) {
            console.warn('[BookingSystem] Firebase save failed:', e);
            booking._pendingSync = true;
        }
        
        return null;
    }
    
    async function updateBookingInFirebase(booking) {
        if (!isOnline || !booking._firebaseKey) {
            booking._pendingSync = true;
            return false;
        }
        
        try {
            const { _pendingSync, _firebaseKey, ...bookingData } = booking;
            
            await fetch(`${FIREBASE_URL}/bookings/${_firebaseKey}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });
            
            return true;
        } catch (e) {
            console.warn('[BookingSystem] Firebase update failed:', e);
            booking._pendingSync = true;
            return false;
        }
    }
    
    function setupRealtimeSync() {
        // Use Server-Sent Events for real-time updates
        if (!isOnline) return;
        
        try {
            const eventSource = new EventSource(`${FIREBASE_URL}/bookings.json`);
            
            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data && data.data) {
                    handleRealtimeUpdate(data);
                }
            };
            
            eventSource.onerror = () => {
                console.warn('[BookingSystem] Realtime connection error');
                eventSource.close();
                // Retry after 5 seconds
                setTimeout(setupRealtimeSync, 5000);
            };
            
            realtimeUnsubscribe = () => eventSource.close();
        } catch (e) {
            console.warn('[BookingSystem] Realtime sync not available');
        }
    }
    
    function handleRealtimeUpdate(data) {
        // Refresh from Firebase
        syncFromFirebase();
    }
    
    function mergeBookings(local, remote) {
        const bookingsMap = new Map();
        
        // Add local bookings
        local.forEach(b => bookingsMap.set(b.id, b));
        
        // Merge remote (prefer newer)
        remote.forEach(b => {
            const existing = bookingsMap.get(b.id);
            if (!existing) {
                bookingsMap.set(b.id, b);
            } else if (existing._pendingSync) {
                // Keep local pending changes
                bookingsMap.set(b.id, existing);
            } else {
                // Compare timestamps, prefer newer
                const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
                const remoteTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
                if (remoteTime > existingTime) {
                    bookingsMap.set(b.id, b);
                }
            }
        });
        
        return Array.from(bookingsMap.values());
    }
    
    // ============ DATE/TIME UTILITIES ============
    function formatDateISO(date) {
        if (typeof date === 'string') return date.split('T')[0];
        return date.toISOString().split('T')[0];
    }
    
    function getHoursForDate(date) {
        const d = new Date(date);
        const dayOfWeek = d.getDay();
        return HOURS.byDay[dayOfWeek] || HOURS.default;
    }
    
    function getTimeSlots(date) {
        const hours = getHoursForDate(date);
        const slots = [];
        
        for (let hour = hours.open; hour < hours.close; hour++) {
            const h = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            
            slots.push({
                hour,
                time: `${h}:00 ${ampm}`,
                time24: `${hour.toString().padStart(2, '0')}:00`,
                isPeak: isPeakTime(date, hour)
            });
        }
        
        return slots;
    }
    
    function isPeakTime(date, hour) {
        if (!PRICING.peak.enabled) return false;
        
        const d = new Date(date);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const peak = isWeekend ? PRICING.peak.weekend : PRICING.peak.weekday;
        
        return hour >= peak.start && hour < peak.end;
    }
    
    function parseTime(timeStr) {
        if (!timeStr) return null;
        
        // Handle "10:00 AM", "1:00 PM", "10:00", "1:00pm" formats
        const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
        if (!match) return null;
        
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        const ampm = match[3]?.toLowerCase();
        
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        
        return { hour, minute, totalMinutes: hour * 60 + minute };
    }
    
    function formatTime(hour, minute = 0) {
        const h = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const m = minute.toString().padStart(2, '0');
        return `${h}:${m} ${ampm}`;
    }
    
    // ============ ROOM MANAGEMENT ============
    function getRooms() {
        return [...ROOMS];
    }
    
    function getRoom(roomId) {
        return ROOMS.find(r => r.id === parseInt(roomId)) || null;
    }
    
    function getRoomName(roomId) {
        const room = getRoom(roomId);
        return room ? room.name : `Room ${roomId}`;
    }
    
    // ============ PRICING ============
    function calculatePrice(duration, date, time, memberType = null) {
        // Get base price from packages
        let price = PRICING.packages[duration]?.price || (duration * PRICING.baseHourly);
        
        // Peak surcharge
        const timeInfo = parseTime(time);
        const isPeak = timeInfo && isPeakTime(date, timeInfo.hour);
        if (isPeak) {
            price = price * PRICING.peak.multiplier;
        }
        
        // Member discount
        let discount = 0;
        if (memberType && PRICING.memberDiscounts[memberType]) {
            discount = price * PRICING.memberDiscounts[memberType];
        }
        
        return {
            basePrice: PRICING.packages[duration]?.price || (duration * PRICING.baseHourly),
            isPeak,
            peakMultiplier: isPeak ? PRICING.peak.multiplier : 1,
            memberDiscount: discount,
            memberType,
            finalPrice: Math.round((price - discount) * 100) / 100
        };
    }
    
    // ============ AVAILABILITY ============
    function getBookingsForDate(date) {
        const dateStr = formatDateISO(date);
        return bookingsCache.filter(b => 
            b.date === dateStr && 
            b.status !== Status.CANCELLED
        );
    }
    
    function isSlotAvailable(roomId, date, time, duration, excludeBookingId = null) {
        const dateStr = formatDateISO(date);
        const startTime = parseTime(time);
        if (!startTime) return false;
        
        const startHour = startTime.hour;
        const endHour = startHour + duration;
        
        // Check operating hours
        const hours = getHoursForDate(date);
        if (startHour < hours.open || endHour > hours.close) {
            return false;
        }
        
        // Check conflicts
        const bookings = getBookingsForDate(date).filter(b => 
            b.roomId === parseInt(roomId) &&
            b.id !== excludeBookingId
        );
        
        for (const booking of bookings) {
            const bookingStart = parseTime(booking.time);
            if (!bookingStart) continue;
            
            const bookingStartHour = bookingStart.hour;
            const bookingEndHour = bookingStartHour + (booking.duration || 1);
            
            // Check overlap
            if (startHour < bookingEndHour && endHour > bookingStartHour) {
                return false;
            }
        }
        
        return true;
    }
    
    function getAvailability(date, duration = 1) {
        const slots = getTimeSlots(date);
        const availability = {};
        
        for (const room of ROOMS) {
            availability[room.id] = slots.map(slot => ({
                ...slot,
                roomId: room.id,
                roomName: room.name,
                available: isSlotAvailable(room.id, date, slot.time, duration),
                booking: getBookingAt(room.id, date, slot.time)
            }));
        }
        
        return availability;
    }
    
    function getBookingAt(roomId, date, time) {
        const dateStr = formatDateISO(date);
        const timeInfo = parseTime(time);
        if (!timeInfo) return null;
        
        return bookingsCache.find(b => {
            if (b.date !== dateStr) return false;
            if (b.roomId !== parseInt(roomId)) return false;
            if (b.status === Status.CANCELLED) return false;
            
            const bookingTime = parseTime(b.time);
            if (!bookingTime) return false;
            
            const bookingStart = bookingTime.hour;
            const bookingEnd = bookingStart + (b.duration || 1);
            
            return timeInfo.hour >= bookingStart && timeInfo.hour < bookingEnd;
        }) || null;
    }
    
    // ============ BOOKING CRUD ============
    function generateId() {
        return 'bk_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
    }
    
    async function createBooking(data) {
        // Validate required fields
        if (!data.customer && !data.customerName) {
            return { success: false, error: 'Customer name is required' };
        }
        if (!data.roomId && !data.room) {
            return { success: false, error: 'Room is required' };
        }
        if (!data.time) {
            return { success: false, error: 'Time is required' };
        }
        if (!data.date) {
            return { success: false, error: 'Date is required' };
        }
        
        const roomId = parseInt(data.roomId || data.room);
        const duration = data.duration || 1;
        const dateStr = formatDateISO(data.date);
        
        // Check availability
        if (!isSlotAvailable(roomId, dateStr, data.time, duration)) {
            return { success: false, error: 'Time slot not available' };
        }
        
        // Get member info
        let memberType = data.memberType || null;
        if (!memberType && typeof GolfCoveMembership !== 'undefined' && data.customer) {
            const member = GolfCoveMembership.findCustomerByName(data.customer || data.customerName);
            if (member && GolfCoveMembership.isActiveMember(member)) {
                memberType = member.memberType;
            }
        }
        
        // Calculate pricing
        const pricing = calculatePrice(duration, dateStr, data.time, memberType);
        
        const now = new Date().toISOString();
        const booking = {
            id: generateId(),
            
            // Room/Time
            roomId: roomId,
            date: dateStr,
            time: data.time,
            duration: duration,
            
            // Customer info
            customer: data.customer || data.customerName,
            customerName: data.customerName || data.customer,
            customerId: data.customerId || null,
            phone: data.phone || '',
            email: data.email || '',
            players: data.players || data.guests || 1,
            
            // Pricing
            price: pricing.finalPrice,
            basePrice: pricing.basePrice,
            isPeak: pricing.isPeak,
            memberDiscount: pricing.memberDiscount,
            memberType: memberType,
            
            // Status
            status: Status.CONFIRMED,
            
            // Flags
            isMember: !!memberType,
            isVIP: memberType && (memberType.includes('eagle') || memberType.includes('birdie')),
            
            // Notes
            notes: data.notes || '',
            specialRequests: data.specialRequests || '',
            
            // Source tracking
            source: data.source || 'online', // 'online', 'pos', 'phone', 'walkin'
            createdBy: data.createdBy || 'system',
            
            // Timestamps
            createdAt: now,
            updatedAt: now
        };
        
        // Save to Firebase
        const firebaseKey = await saveBookingToFirebase(booking);
        if (firebaseKey) {
            booking._firebaseKey = firebaseKey;
        }
        
        // Add to local cache
        bookingsCache.push(booking);
        saveToStorage(bookingsCache);
        
        // Emit event
        emit('booking:created', booking);
        
        console.log('[BookingSystem] Created booking:', booking.id);
        return { success: true, booking };
    }
    
    async function updateBooking(bookingId, updates) {
        const index = bookingsCache.findIndex(b => b.id === bookingId);
        if (index === -1) {
            return { success: false, error: 'Booking not found' };
        }
        
        const booking = bookingsCache[index];
        
        // If changing time/date/room/duration, check availability
        if (updates.time || updates.date || updates.roomId || updates.duration) {
            const newRoom = updates.roomId || booking.roomId;
            const newDate = updates.date || booking.date;
            const newTime = updates.time || booking.time;
            const newDuration = updates.duration || booking.duration;
            
            if (!isSlotAvailable(newRoom, newDate, newTime, newDuration, bookingId)) {
                return { success: false, error: 'New time slot not available' };
            }
        }
        
        // Apply updates
        Object.assign(booking, updates, {
            updatedAt: new Date().toISOString()
        });
        
        // Sync to Firebase
        await updateBookingInFirebase(booking);
        
        // Save locally
        saveToStorage(bookingsCache);
        
        emit('booking:updated', booking);
        
        return { success: true, booking };
    }
    
    function getBooking(bookingId) {
        return bookingsCache.find(b => b.id === bookingId) || null;
    }
    
    function getAll() {
        return [...bookingsCache];
    }
    
    async function cancelBooking(bookingId, reason = '') {
        return updateBooking(bookingId, {
            status: Status.CANCELLED,
            cancelledAt: new Date().toISOString(),
            cancellationReason: reason
        });
    }
    
    async function checkIn(bookingId) {
        const result = await updateBooking(bookingId, {
            status: Status.CHECKED_IN,
            checkedInAt: new Date().toISOString()
        });
        
        if (result.success) {
            emit('booking:checkedIn', result.booking);
        }
        
        return result;
    }
    
    async function checkOut(bookingId) {
        return updateBooking(bookingId, {
            status: Status.COMPLETED,
            completedAt: new Date().toISOString()
        });
    }
    
    async function markNoShow(bookingId) {
        return updateBooking(bookingId, {
            status: Status.NO_SHOW,
            noShowAt: new Date().toISOString()
        });
    }
    
    // ============ WAITLIST ============
    function getWaitlist() {
        try {
            return JSON.parse(localStorage.getItem(WAITLIST_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }
    
    function saveWaitlist(waitlist) {
        localStorage.setItem(WAITLIST_KEY, JSON.stringify(waitlist));
    }
    
    async function syncWaitlistToFirebase(entry) {
        if (!isOnline) {
            entry._pendingSync = true;
            return null;
        }
        
        try {
            const { _pendingSync, _firebaseKey, ...entryData } = entry;
            
            if (_firebaseKey) {
                // Update existing
                await fetch(`${FIREBASE_URL}/waitlist/${_firebaseKey}.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entryData)
                });
                return _firebaseKey;
            } else {
                // Create new
                const response = await fetch(`${FIREBASE_URL}/waitlist.json`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entryData)
                });
                
                if (response.ok) {
                    const { name } = await response.json();
                    entry._firebaseKey = name;
                    return name;
                }
            }
        } catch (e) {
            console.warn('[BookingSystem] Waitlist sync failed:', e);
            entry._pendingSync = true;
        }
        return null;
    }
    
    async function loadWaitlistFromFirebase() {
        if (!isOnline) return;
        
        try {
            const response = await fetch(`${FIREBASE_URL}/waitlist.json`);
            if (response.ok) {
                const data = await response.json();
                if (data) {
                    const entries = Object.entries(data).map(([key, val]) => ({
                        ...val,
                        _firebaseKey: key
                    }));
                    // Merge with local
                    const local = getWaitlist();
                    const merged = mergeWaitlistData(local, entries);
                    saveWaitlist(merged);
                    console.log('[BookingSystem] Loaded', entries.length, 'waitlist entries from Firebase');
                }
            }
        } catch (e) {
            console.warn('[BookingSystem] Failed to load waitlist from Firebase:', e);
        }
    }
    
    function mergeWaitlistData(local, remote) {
        const map = new Map();
        
        // Add remote entries first
        for (const entry of remote) {
            map.set(entry._firebaseKey || entry.id, entry);
        }
        
        // Merge local entries (pending sync takes priority)
        for (const entry of local) {
            const key = entry._firebaseKey || entry.id;
            if (entry._pendingSync || !map.has(key)) {
                map.set(key, entry);
            }
        }
        
        return Array.from(map.values());
    }

    async function addToWaitlist(data) {
        const entry = {
            id: 'wl_' + Date.now().toString(36),
            customer: data.customer || data.customerName,
            phone: data.phone || '',
            email: data.email || '',
            date: formatDateISO(data.date),
            preferredTime: data.preferredTime || null,
            preferredRoom: data.preferredRoom || null,
            duration: data.duration || 1,
            players: data.players || 1,
            notes: data.notes || '',
            createdAt: new Date().toISOString(),
            notified: false,
            status: 'waiting'
        };
        
        // Sync to Firebase first
        await syncWaitlistToFirebase(entry);
        
        const waitlist = getWaitlist();
        waitlist.push(entry);
        saveWaitlist(waitlist);
        
        emit('waitlist:added', entry);
        
        return { success: true, entry };
    }
    
    async function removeFromWaitlist(entryId) {
        const waitlist = getWaitlist();
        const entry = waitlist.find(e => e.id === entryId || e._firebaseKey === entryId);
        
        // Delete from Firebase if it has a key
        if (entry?._firebaseKey && isOnline) {
            try {
                await fetch(`${FIREBASE_URL}/waitlist/${entry._firebaseKey}.json`, {
                    method: 'DELETE'
                });
            } catch (e) {
                console.warn('[BookingSystem] Failed to delete waitlist entry from Firebase:', e);
            }
        }
        
        const filtered = waitlist.filter(e => e.id !== entryId && e._firebaseKey !== entryId);
        saveWaitlist(filtered);
        return { success: true };
    }
    
    function getWaitlistForDate(date) {
        const dateStr = formatDateISO(date);
        return getWaitlist().filter(e => e.date === dateStr && e.status === 'waiting');
    }
    
    // ============ STATISTICS ============
    function getDayStats(date) {
        const bookings = getBookingsForDate(date);
        const slots = getTimeSlots(date);
        const totalSlots = slots.length * ROOMS.length;
        
        return {
            totalBookings: bookings.length,
            confirmed: bookings.filter(b => b.status === Status.CONFIRMED).length,
            checkedIn: bookings.filter(b => b.status === Status.CHECKED_IN).length,
            completed: bookings.filter(b => b.status === Status.COMPLETED).length,
            noShows: bookings.filter(b => b.status === Status.NO_SHOW).length,
            revenue: bookings.reduce((sum, b) => sum + (b.price || 0), 0),
            occupancy: Math.round((bookings.reduce((sum, b) => sum + (b.duration || 1), 0) / totalSlots) * 100),
            members: bookings.filter(b => b.isMember).length,
            vips: bookings.filter(b => b.isVIP).length,
            byRoom: ROOMS.map(room => ({
                roomId: room.id,
                roomName: room.name,
                bookings: bookings.filter(b => b.roomId === room.id).length
            }))
        };
    }
    
    // ============ TEE SHEET GRID RENDERING ============
    function renderTeeSheet(containerId, date, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const dateStr = formatDateISO(date);
        const slots = getTimeSlots(dateStr);
        const bookings = getBookingsForDate(dateStr);
        
        const onSlotClick = options.onSlotClick || (() => {});
        const onBookingClick = options.onBookingClick || (() => {});
        const showAvailable = options.showAvailable !== false;
        
        let html = `
            <div class="teesheet-grid">
                <div class="teesheet-header">
                    <div class="teesheet-time-col"></div>
                    ${ROOMS.map(room => `
                        <div class="teesheet-room-col" style="background-color: ${room.color}15;">
                            <div class="room-name">PICK: ${room.name}</div>
                            <div class="room-label">(${room.label})</div>
                        </div>
                    `).join('')}
                </div>
                <div class="teesheet-body">
        `;
        
        slots.forEach(slot => {
            html += `<div class="teesheet-row" data-hour="${slot.hour}">`;
            html += `<div class="teesheet-time">${slot.time}</div>`;
            
            ROOMS.forEach(room => {
                // Find booking for this slot
                const booking = bookings.find(b => {
                    if (b.roomId !== room.id) return false;
                    const bt = parseTime(b.time);
                    if (!bt) return false;
                    const bookingEnd = bt.hour + (b.duration || 1);
                    return slot.hour >= bt.hour && slot.hour < bookingEnd;
                });
                
                // Check if this is the start of a booking
                const isBookingStart = booking && parseTime(booking.time)?.hour === slot.hour;
                
                // Check if this slot is part of a multi-hour booking but not the start
                const isBookingContinuation = booking && !isBookingStart;
                
                if (isBookingContinuation) {
                    // Skip - already rendered as part of rowspan
                    html += `<div class="teesheet-cell continuation"></div>`;
                } else if (booking) {
                    // Booking cell
                    const statusClass = booking.status === Status.CHECKED_IN ? 'checked-in' : '';
                    const duration = booking.duration || 1;
                    const endHour = parseTime(booking.time).hour + duration;
                    const endTime = formatTime(endHour);
                    
                    html += `
                        <div class="teesheet-cell booked ${statusClass}" 
                             data-booking-id="${booking.id}"
                             data-duration="${duration}"
                             onclick="BookingSystem._handleBookingClick('${booking.id}')"
                             style="background-color: #c0392b;">
                            <div class="booking-status">Reserved</div>
                            <div class="booking-time">${slot.time} - ${endTime}</div>
                        </div>
                    `;
                } else if (showAvailable) {
                    // Available cell
                    html += `
                        <div class="teesheet-cell available" 
                             data-room="${room.id}" 
                             data-time="${slot.time}"
                             data-date="${dateStr}"
                             onclick="BookingSystem._handleSlotClick(${room.id}, '${slot.time}', '${dateStr}')">
                            <span class="available-text">Available</span>
                        </div>
                    `;
                } else {
                    html += `<div class="teesheet-cell empty"></div>`;
                }
            });
            
            html += '</div>';
        });
        
        html += '</div></div>';
        
        // Add styles if not already present
        if (!document.getElementById('teesheet-styles')) {
            const style = document.createElement('style');
            style.id = 'teesheet-styles';
            style.textContent = getTeeSheetStyles();
            document.head.appendChild(style);
        }
        
        container.innerHTML = html;
        
        // Store handlers for click events
        BookingSystem._slotClickHandler = onSlotClick;
        BookingSystem._bookingClickHandler = onBookingClick;
    }
    
    function _handleSlotClick(roomId, time, date) {
        if (BookingSystem._slotClickHandler) {
            BookingSystem._slotClickHandler(roomId, time, date);
        }
    }
    
    function _handleBookingClick(bookingId) {
        const booking = getBooking(bookingId);
        if (booking && BookingSystem._bookingClickHandler) {
            BookingSystem._bookingClickHandler(booking);
        }
    }
    
    function getTeeSheetStyles() {
        return `
            .teesheet-grid {
                background: #fff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .teesheet-header {
                display: grid;
                grid-template-columns: 80px repeat(${ROOMS.length}, 1fr);
                background: #1a365d;
                color: #fff;
            }
            .teesheet-time-col {
                padding: 10px;
                background: #1a365d;
            }
            .teesheet-room-col {
                padding: 10px;
                text-align: center;
                border-left: 1px solid rgba(255,255,255,0.1);
            }
            .room-name {
                font-weight: 600;
                font-size: 13px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .room-label {
                font-size: 11px;
                opacity: 0.8;
            }
            .teesheet-body {
                max-height: 60vh;
                overflow-y: auto;
            }
            .teesheet-row {
                display: grid;
                grid-template-columns: 80px repeat(${ROOMS.length}, 1fr);
                border-bottom: 1px solid #eee;
            }
            .teesheet-row:hover {
                background: #f8fafc;
            }
            .teesheet-time {
                padding: 12px 10px;
                font-size: 13px;
                font-weight: 500;
                color: #666;
                background: #f8fafc;
                border-right: 1px solid #eee;
            }
            .teesheet-cell {
                padding: 8px;
                border-left: 1px solid #eee;
                min-height: 50px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                cursor: pointer;
                transition: all 0.2s;
            }
            .teesheet-cell.available {
                background: #f0fdf4;
            }
            .teesheet-cell.available:hover {
                background: #dcfce7;
            }
            .teesheet-cell.available .available-text {
                color: #16a34a;
                font-size: 12px;
            }
            .teesheet-cell.booked {
                background: #c0392b;
                color: #fff;
            }
            .teesheet-cell.booked:hover {
                filter: brightness(1.1);
            }
            .teesheet-cell.booked .booking-status {
                font-weight: 600;
                font-size: 13px;
            }
            .teesheet-cell.booked .booking-time {
                font-size: 11px;
                opacity: 0.9;
            }
            .teesheet-cell.checked-in {
                background: #27ae60;
            }
            .teesheet-cell.continuation {
                display: none;
            }
            .teesheet-cell.empty {
                background: #f8fafc;
            }
        `;
    }
    
    // ============ EVENT SYSTEM ============
    const eventListeners = {};
    
    function emit(eventName, data) {
        const listeners = eventListeners[eventName] || [];
        listeners.forEach(cb => {
            try { cb(data); } catch (e) { console.error('[BookingSystem] Event error:', e); }
        });
        
        // Also emit to sync listeners
        syncListeners.forEach(cb => {
            try { cb(eventName, data); } catch (e) { console.error('[BookingSystem] Sync listener error:', e); }
        });
    }
    
    function on(eventName, callback) {
        if (!eventListeners[eventName]) {
            eventListeners[eventName] = [];
        }
        eventListeners[eventName].push(callback);
        
        return () => {
            eventListeners[eventName] = eventListeners[eventName].filter(cb => cb !== callback);
        };
    }
    
    function onSync(callback) {
        syncListeners.push(callback);
        return () => {
            syncListeners = syncListeners.filter(cb => cb !== callback);
        };
    }
    
    // ============ COMPATIBILITY ALIASES ============
    // For backward compatibility with existing code
    const compatAliases = {
        // From GolfCoveBooking
        get: getBooking,
        getForDate: getBookingsForDate,
        create: createBooking,
        update: updateBooking,
        cancel: cancelBooking,
        
        // From BayBooking
        getBookingsForDate,
        isSlotAvailable,
        
        // From TeeSheetManager
        render: renderTeeSheet
    };
    
    // ============ PUBLIC API ============
    return {
        // Initialization
        init,
        
        // Configuration
        Status,
        ROOMS,
        PRICING,
        getRooms,
        getRoom,
        getRoomName,
        
        // Date/Time
        getTimeSlots,
        formatDateISO,
        parseTime,
        formatTime,
        isPeakTime,
        getHoursForDate,
        
        // Availability
        getAvailability,
        isSlotAvailable,
        getBookingAt,
        
        // Pricing
        calculatePrice,
        
        // CRUD
        createBooking,
        updateBooking,
        getBooking,
        getBookingsForDate,
        getAll,
        cancelBooking,
        
        // Status changes
        checkIn,
        checkOut,
        markNoShow,
        
        // Waitlist
        addToWaitlist,
        removeFromWaitlist,
        getWaitlist,
        getWaitlistForDate,
        
        // Statistics
        getDayStats,
        
        // UI Rendering
        renderTeeSheet,
        
        // Events
        on,
        onSync,
        
        // Sync
        syncFromFirebase,
        syncToFirebase,
        
        // Internal handlers (for onclick)
        _handleSlotClick,
        _handleBookingClick,
        _slotClickHandler: null,
        _bookingClickHandler: null,
        
        // Compatibility aliases
        ...compatAliases
    };
})();

// ============ LEGACY COMPATIBILITY LAYER ============
// Create aliases for existing code that uses old module names

// GolfCoveBooking compatibility
const GolfCoveBooking = {
    get config() { return { rooms: BookingSystem.ROOMS, pricing: BookingSystem.PRICING }; },
    BookingStatus: BookingSystem.Status,
    getTimeSlots: BookingSystem.getTimeSlots,
    isSlotAvailable: BookingSystem.isSlotAvailable,
    getAvailableSlots: (date, duration) => BookingSystem.getAvailability(date, duration),
    getRoomBookings: (roomId, date) => BookingSystem.getBookingsForDate(date).filter(b => b.roomId === roomId),
    getDayBookings: BookingSystem.getBookingsForDate,
    calculatePrice: BookingSystem.calculatePrice,
    isPeakTime: BookingSystem.isPeakTime,
    createBooking: BookingSystem.createBooking,
    updateBooking: BookingSystem.updateBooking,
    getBooking: BookingSystem.getBooking,
    cancelBooking: BookingSystem.cancelBooking,
    get: BookingSystem.getBooking,
    getAll: BookingSystem.getAll,
    getForDate: BookingSystem.getBookingsForDate,
    create: BookingSystem.createBooking,
    update: BookingSystem.updateBooking,
    cancel: BookingSystem.cancelBooking,
    getRoomName: BookingSystem.getRoomName,
    checkIn: BookingSystem.checkIn,
    checkOut: BookingSystem.checkOut,
    markNoShow: BookingSystem.markNoShow,
    addToWaitlist: BookingSystem.addToWaitlist,
    getWaitlist: BookingSystem.getWaitlist,
    getDayStats: BookingSystem.getDayStats,
    syncFromCloud: BookingSystem.syncFromFirebase,
    formatTime: BookingSystem.formatTime,
    parseTime: BookingSystem.parseTime,
    onSync: BookingSystem.onSync,
    on: BookingSystem.on
};

// BayBooking compatibility
const BayBooking = {
    Status: BookingSystem.Status,
    init: BookingSystem.init,
    getTimeSlots: BookingSystem.getTimeSlots,
    parseTime: BookingSystem.parseTime,
    formatTime: BookingSystem.formatTime,
    isSlotAvailable: BookingSystem.isSlotAvailable,
    getAvailability: BookingSystem.getAvailability,
    getBookingsForDate: BookingSystem.getBookingsForDate,
    calculatePrice: BookingSystem.calculatePrice,
    createBooking: BookingSystem.createBooking,
    getBooking: BookingSystem.getBooking,
    updateBooking: BookingSystem.updateBooking,
    cancelBooking: BookingSystem.cancelBooking,
    checkIn: BookingSystem.checkIn,
    checkOut: BookingSystem.checkOut,
    markNoShow: BookingSystem.markNoShow,
    addToWaitlist: BookingSystem.addToWaitlist,
    removeFromWaitlist: BookingSystem.removeFromWaitlist,
    getWaitlist: BookingSystem.getWaitlist,
    getWaitlistForDate: BookingSystem.getWaitlistForDate,
    getDayStats: BookingSystem.getDayStats,
    on: BookingSystem.on,
    syncFromCloud: BookingSystem.syncFromFirebase,
    getAll: BookingSystem.getAll
};

// TeeSheetManager compatibility
const TeeSheetManager = {
    render: BookingSystem.renderTeeSheet,
    createBooking: BookingSystem.createBooking,
    updateBooking: BookingSystem.updateBooking,
    cancelBooking: BookingSystem.cancelBooking,
    checkIn: BookingSystem.checkIn,
    markNoShow: BookingSystem.markNoShow,
    getBookingsForDate: BookingSystem.getBookingsForDate,
    getDayStats: BookingSystem.getDayStats,
    get config() { return { rooms: BookingSystem.ROOMS, timeSlots: BookingSystem.getTimeSlots(new Date()).map(s => s.time) }; }
};

// GolfCoveBookingManager compatibility
const GolfCoveBookingManager = {
    init: BookingSystem.init,
    config: { bays: {}, hours: {} },
    pricing: BookingSystem.PRICING,
    generateTimeSlots: BookingSystem.getTimeSlots,
    getAvailability: BookingSystem.getAvailability,
    calculatePrice: BookingSystem.calculatePrice,
    createBooking: BookingSystem.createBooking,
    updateBooking: BookingSystem.updateBooking,
    cancelBooking: BookingSystem.cancelBooking,
    getBooking: BookingSystem.getBooking,
    getBookingsForDate: BookingSystem.getBookingsForDate,
    checkIn: BookingSystem.checkIn,
    checkOut: BookingSystem.checkOut,
    markNoShow: BookingSystem.markNoShow,
    waitlist: {
        add: BookingSystem.addToWaitlist,
        remove: BookingSystem.removeFromWaitlist,
        getAll: BookingSystem.getWaitlist,
        getForDate: BookingSystem.getWaitlistForDate
    },
    getBookingStats: BookingSystem.getDayStats
};

// Auto-initialize when DOM ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        BookingSystem.init().catch(console.error);
    });
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BookingSystem, GolfCoveBooking, BayBooking, TeeSheetManager, GolfCoveBookingManager };
}
