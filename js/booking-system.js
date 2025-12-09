/**
 * Golf Cove - Full Booking System
 * Comprehensive room/bay reservation management
 */

const GolfCoveBooking = (function() {
    'use strict';
    
    // ============ CONFIGURATION ============
    const config = {
        rooms: [
            { id: 1, name: 'Room 1', type: 'simulator', capacity: 4, hourlyRate: 45 },
            { id: 2, name: 'Room 2', type: 'simulator', capacity: 4, hourlyRate: 45 },
            { id: 3, name: 'Room 3', type: 'simulator', capacity: 4, hourlyRate: 45 }
        ],
        pricing: {
            1: { price: 45, label: '1 Hour' },
            2: { price: 80, label: '2 Hours' },
            3: { price: 110, label: '3 Hours' },
            4: { price: 140, label: '4 Hours' }
        },
        peakHours: {
            weekday: { start: 17, end: 21 }, // 5pm-9pm
            weekend: { start: 10, end: 21 }  // 10am-9pm
        },
        peakSurcharge: 10, // $10 extra during peak
        memberDiscounts: {
            eagle: 0.20,      // 20% off
            family_eagle: 0.20,
            birdie: 0.15,     // 15% off
            family_birdie: 0.15,
            par: 0.10,        // 10% off
            family_par: 0.10
        },
        operatingHours: {
            open: 9,   // 9 AM
            close: 22  // 10 PM
        },
        slotDuration: 60, // minutes
        depositRequired: false,
        depositAmount: 20,
        cancellationPolicy: {
            fullRefundHours: 24,
            partialRefundHours: 12,
            partialRefundPercent: 50
        }
    };
    
    // ============ BOOKING STATUS TYPES ============
    const BookingStatus = {
        PENDING: 'pending',
        CONFIRMED: 'confirmed',
        CHECKED_IN: 'checked_in',
        COMPLETED: 'completed',
        NO_SHOW: 'no_show',
        CANCELLED: 'cancelled'
    };
    
    // ============ DATA MANAGEMENT ============
    function getBookings() {
        return JSON.parse(localStorage.getItem('gc_bookings') || '[]');
    }
    
    function saveBookings(bookings) {
        localStorage.setItem('gc_bookings', JSON.stringify(bookings));
    }
    
    function getWaitlist() {
        return JSON.parse(localStorage.getItem('gc_waitlist') || '[]');
    }
    
    function saveWaitlist(waitlist) {
        localStorage.setItem('gc_waitlist', JSON.stringify(waitlist));
    }
    
    // ============ AVAILABILITY CHECKING ============
    function getTimeSlots(date) {
        const slots = [];
        const d = new Date(date);
        for (let hour = config.operatingHours.open; hour < config.operatingHours.close; hour++) {
            const timeStr = formatTime(hour);
            slots.push({
                hour: hour,
                time: timeStr,
                time24: `${hour.toString().padStart(2, '0')}:00`
            });
        }
        return slots;
    }
    
    function formatTime(hour) {
        const h = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        const ampm = hour >= 12 ? 'pm' : 'am';
        return `${h}:00${ampm}`;
    }
    
    function parseTime(timeStr) {
        // Handle "10:00am", "1:00pm", etc.
        const match = timeStr.match(/(\d+):(\d+)(am|pm)/i);
        if (!match) return null;
        let hour = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const ampm = match[3].toLowerCase();
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        return { hour, minutes };
    }
    
    function isSlotAvailable(roomId, date, time, duration, excludeBookingId = null) {
        const bookings = getBookings();
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        const startTime = parseTime(time);
        if (!startTime) return false;
        
        const startHour = startTime.hour;
        const endHour = startHour + duration;
        
        // Check if within operating hours
        if (startHour < config.operatingHours.open || endHour > config.operatingHours.close) {
            return false;
        }
        
        // Check for conflicts
        for (const booking of bookings) {
            if (booking.id === excludeBookingId) continue;
            if (booking.status === BookingStatus.CANCELLED) continue;
            if (booking.room !== roomId) continue;
            
            const bookingDate = booking.date || new Date().toISOString().split('T')[0];
            if (bookingDate !== dateStr) continue;
            
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
    
    function getAvailableSlots(date, duration = 1) {
        const slots = getTimeSlots(date);
        const availability = {};
        
        for (const room of config.rooms) {
            availability[room.id] = slots.map(slot => ({
                ...slot,
                available: isSlotAvailable(room.id, date, slot.time, duration),
                roomId: room.id,
                roomName: room.name
            }));
        }
        
        return availability;
    }
    
    function getRoomBookings(roomId, date) {
        const bookings = getBookings();
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        
        return bookings.filter(b => {
            const bookingDate = b.date || new Date().toISOString().split('T')[0];
            return b.room === roomId && bookingDate === dateStr && b.status !== BookingStatus.CANCELLED;
        });
    }
    
    function getDayBookings(date) {
        const bookings = getBookings();
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        
        return bookings.filter(b => {
            const bookingDate = b.date || new Date().toISOString().split('T')[0];
            return bookingDate === dateStr && b.status !== BookingStatus.CANCELLED;
        });
    }
    
    // ============ PRICING ============
    function isPeakTime(date, hour) {
        const d = new Date(date);
        const dayOfWeek = d.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        const peak = isWeekend ? config.peakHours.weekend : config.peakHours.weekday;
        return hour >= peak.start && hour < peak.end;
    }
    
    function calculatePrice(duration, date, time, memberType = null) {
        let basePrice = config.pricing[duration]?.price || (duration * 45);
        
        // Peak surcharge
        const timeInfo = parseTime(time);
        if (timeInfo && isPeakTime(date, timeInfo.hour)) {
            basePrice += config.peakSurcharge;
        }
        
        // Member discount
        let discount = 0;
        if (memberType && config.memberDiscounts[memberType]) {
            discount = basePrice * config.memberDiscounts[memberType];
        }
        
        return {
            basePrice,
            peakSurcharge: isPeakTime(date, timeInfo?.hour || 12) ? config.peakSurcharge : 0,
            memberDiscount: discount,
            finalPrice: basePrice - discount,
            memberType
        };
    }
    
    // ============ BOOKING CRUD ============
    function createBooking(data) {
        const bookings = getBookings();
        
        // Validate required fields
        if (!data.customer || !data.room || !data.time || !data.date) {
            return { success: false, error: 'Missing required fields' };
        }
        
        const duration = data.duration || 1;
        
        // Check availability
        if (!isSlotAvailable(data.room, data.date, data.time, duration)) {
            return { success: false, error: 'Time slot not available' };
        }
        
        // Get customer member info
        let memberType = data.memberType || null;
        if (!memberType && typeof GolfCoveMembership !== 'undefined') {
            const customer = GolfCoveMembership.findCustomerByName(data.customer);
            if (customer && GolfCoveMembership.isActiveMember(customer)) {
                memberType = customer.memberType;
            }
        }
        
        // Calculate pricing
        const pricing = calculatePrice(duration, data.date, data.time, memberType);
        
        const booking = {
            id: Date.now(),
            customer: data.customer,
            room: parseInt(data.room),
            time: data.time,
            date: data.date,
            duration: duration,
            players: data.players || 1,
            phone: data.phone || '',
            email: data.email || '',
            notes: data.notes || '',
            
            // Pricing
            price: pricing.finalPrice,
            basePrice: pricing.basePrice,
            memberDiscount: pricing.memberDiscount,
            isPeak: pricing.peakSurcharge > 0,
            
            // Member info
            memberType: memberType,
            isVIP: memberType && (memberType.includes('eagle') || memberType.includes('birdie')),
            
            // Status
            status: BookingStatus.CONFIRMED,
            checkedIn: false,
            checkedInAt: null,
            checkedOutAt: null,
            
            // Payment
            depositPaid: data.depositPaid || false,
            depositAmount: config.depositRequired ? config.depositAmount : 0,
            paidInFull: data.paidInFull || false,
            paymentMethod: data.paymentMethod || null,
            
            // Tracking
            createdAt: new Date().toISOString(),
            createdBy: data.createdBy || 'POS',
            source: data.source || 'walk-in', // 'walk-in', 'phone', 'online', 'member-portal'
            
            // Recurring
            isRecurring: data.isRecurring || false,
            recurringId: data.recurringId || null
        };
        
        bookings.push(booking);
        saveBookings(bookings);
        
        // Check waitlist for this slot (shouldn't have any if we're booking)
        processWaitlist(data.room, data.date, data.time);
        
        return { success: true, booking };
    }
    
    function updateBooking(bookingId, updates) {
        const bookings = getBookings();
        const index = bookings.findIndex(b => b.id === bookingId);
        
        if (index === -1) {
            return { success: false, error: 'Booking not found' };
        }
        
        // If changing time/date/duration, check availability
        if (updates.time || updates.date || updates.duration) {
            const newTime = updates.time || bookings[index].time;
            const newDate = updates.date || bookings[index].date;
            const newDuration = updates.duration || bookings[index].duration;
            const newRoom = updates.room || bookings[index].room;
            
            if (!isSlotAvailable(newRoom, newDate, newTime, newDuration, bookingId)) {
                return { success: false, error: 'New time slot not available' };
            }
        }
        
        bookings[index] = { ...bookings[index], ...updates, updatedAt: new Date().toISOString() };
        saveBookings(bookings);
        
        return { success: true, booking: bookings[index] };
    }
    
    function getBooking(bookingId) {
        const bookings = getBookings();
        return bookings.find(b => b.id === bookingId);
    }
    
    function cancelBooking(bookingId, reason = '') {
        const bookings = getBookings();
        const booking = bookings.find(b => b.id === bookingId);
        
        if (!booking) {
            return { success: false, error: 'Booking not found' };
        }
        
        // Calculate refund based on policy
        let refundAmount = 0;
        if (booking.paidInFull) {
            const hoursUntil = (new Date(booking.date + 'T' + booking.time) - new Date()) / (1000 * 60 * 60);
            if (hoursUntil >= config.cancellationPolicy.fullRefundHours) {
                refundAmount = booking.price;
            } else if (hoursUntil >= config.cancellationPolicy.partialRefundHours) {
                refundAmount = booking.price * (config.cancellationPolicy.partialRefundPercent / 100);
            }
        }
        
        const result = updateBooking(bookingId, {
            status: BookingStatus.CANCELLED,
            cancelledAt: new Date().toISOString(),
            cancellationReason: reason,
            refundAmount
        });
        
        // Process waitlist - someone might want this slot
        if (result.success) {
            processWaitlist(booking.room, booking.date, booking.time);
        }
        
        return { ...result, refundAmount };
    }
    
    // ============ CHECK-IN / CHECK-OUT ============
    function checkIn(bookingId) {
        return updateBooking(bookingId, {
            status: BookingStatus.CHECKED_IN,
            checkedIn: true,
            checkedInAt: new Date().toISOString()
        });
    }
    
    function checkOut(bookingId) {
        return updateBooking(bookingId, {
            status: BookingStatus.COMPLETED,
            checkedOutAt: new Date().toISOString()
        });
    }
    
    function markNoShow(bookingId) {
        return updateBooking(bookingId, {
            status: BookingStatus.NO_SHOW,
            noShowAt: new Date().toISOString()
        });
    }
    
    // ============ WAITLIST ============
    function addToWaitlist(data) {
        const waitlist = getWaitlist();
        
        const entry = {
            id: Date.now(),
            customer: data.customer,
            phone: data.phone || '',
            email: data.email || '',
            preferredRoom: data.room || null, // null = any room
            preferredDate: data.date,
            preferredTime: data.time || null, // null = any time
            duration: data.duration || 1,
            players: data.players || 1,
            notes: data.notes || '',
            createdAt: new Date().toISOString(),
            notified: false,
            status: 'waiting' // 'waiting', 'notified', 'booked', 'expired'
        };
        
        waitlist.push(entry);
        saveWaitlist(waitlist);
        
        return { success: true, entry };
    }
    
    function processWaitlist(roomId, date, time) {
        const waitlist = getWaitlist();
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        
        // Find matching waitlist entries
        const matches = waitlist.filter(w => {
            if (w.status !== 'waiting') return false;
            if (w.preferredDate !== dateStr) return false;
            if (w.preferredRoom && w.preferredRoom !== roomId) return false;
            if (w.preferredTime && w.preferredTime !== time) return false;
            return true;
        });
        
        // Mark first match as notified (would send notification in real system)
        if (matches.length > 0) {
            const entry = matches[0];
            entry.status = 'notified';
            entry.notifiedAt = new Date().toISOString();
            saveWaitlist(waitlist);
            
            return { hasWaitlist: true, entry };
        }
        
        return { hasWaitlist: false };
    }
    
    // ============ RECURRING BOOKINGS ============
    function createRecurringBooking(data, pattern) {
        // pattern: { type: 'weekly', count: 4 } or { type: 'weekly', endDate: '2025-03-01' }
        const recurringId = Date.now();
        const bookings = [];
        const startDate = new Date(data.date);
        let count = pattern.count || 52;
        const endDate = pattern.endDate ? new Date(pattern.endDate) : null;
        
        for (let i = 0; i < count; i++) {
            const bookingDate = new Date(startDate);
            
            if (pattern.type === 'weekly') {
                bookingDate.setDate(bookingDate.getDate() + (i * 7));
            } else if (pattern.type === 'biweekly') {
                bookingDate.setDate(bookingDate.getDate() + (i * 14));
            } else if (pattern.type === 'monthly') {
                bookingDate.setMonth(bookingDate.getMonth() + i);
            }
            
            if (endDate && bookingDate > endDate) break;
            
            const dateStr = bookingDate.toISOString().split('T')[0];
            
            // Check availability
            if (isSlotAvailable(data.room, dateStr, data.time, data.duration || 1)) {
                const result = createBooking({
                    ...data,
                    date: dateStr,
                    isRecurring: true,
                    recurringId
                });
                
                if (result.success) {
                    bookings.push(result.booking);
                }
            }
        }
        
        return { success: true, recurringId, bookings, created: bookings.length };
    }
    
    function cancelRecurringSeries(recurringId) {
        const bookings = getBookings();
        const seriesBookings = bookings.filter(b => b.recurringId === recurringId && b.status !== BookingStatus.CANCELLED);
        
        let cancelled = 0;
        for (const booking of seriesBookings) {
            // Only cancel future bookings
            if (new Date(booking.date) >= new Date().setHours(0,0,0,0)) {
                cancelBooking(booking.id, 'Series cancelled');
                cancelled++;
            }
        }
        
        return { success: true, cancelled };
    }
    
    // ============ STATISTICS ============
    function getDayStats(date) {
        const bookings = getDayBookings(date);
        const slots = getTimeSlots(date);
        const totalSlots = slots.length * config.rooms.length;
        
        return {
            totalBookings: bookings.length,
            checkedIn: bookings.filter(b => b.checkedIn).length,
            noShows: bookings.filter(b => b.status === BookingStatus.NO_SHOW).length,
            cancelled: getBookings().filter(b => {
                const d = b.date || new Date().toISOString().split('T')[0];
                return d === date && b.status === BookingStatus.CANCELLED;
            }).length,
            revenue: bookings.reduce((sum, b) => sum + (b.price || 0), 0),
            occupancy: Math.round((bookings.reduce((sum, b) => sum + (b.duration || 1), 0) / totalSlots) * 100),
            members: bookings.filter(b => b.memberType).length,
            vips: bookings.filter(b => b.isVIP).length
        };
    }
    
    function getCustomerBookings(customerName) {
        const bookings = getBookings();
        return bookings.filter(b => 
            b.customer.toLowerCase() === customerName.toLowerCase()
        ).sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    
    // ============ HELPER FUNCTIONS FOR ADMIN-POS ============
    function getRoomName(roomId) {
        const room = config.rooms.find(r => r.id === parseInt(roomId));
        return room ? room.name : 'Room ' + roomId;
    }
    
    function get(bookingId) {
        return getBooking(bookingId);
    }
    
    function getAll() {
        return getBookings();
    }
    
    function getForDate(date) {
        const bookings = getBookings();
        return bookings.filter(b => {
            const bookingDate = b.date || new Date().toISOString().split('T')[0];
            return bookingDate === date && b.status !== BookingStatus.CANCELLED;
        });
    }
    
    function create(data) {
        // Map roomId to room for compatibility
        if (data.roomId && !data.room) {
            data.room = data.roomId;
        }
        return createBooking(data);
    }
    
    function update(bookingId, updates) {
        return updateBooking(bookingId, updates);
    }
    
    function cancel(bookingId, reason) {
        return cancelBooking(bookingId, reason);
    }
    
    // ============ EXPORT PUBLIC API ============
    return {
        // Config
        config,
        BookingStatus,
        
        // Availability
        getTimeSlots,
        isSlotAvailable,
        getAvailableSlots,
        getRoomBookings,
        getDayBookings,
        
        // Pricing
        calculatePrice,
        isPeakTime,
        
        // CRUD
        createBooking,
        updateBooking,
        getBooking,
        cancelBooking,
        
        // Shorthand aliases for admin-pos.html compatibility
        get,
        getAll,
        getForDate,
        create,
        update,
        cancel,
        getRoomName,
        
        // Status changes
        checkIn,
        checkOut,
        markNoShow,
        
        // Waitlist
        addToWaitlist,
        getWaitlist,
        processWaitlist,
        
        // Recurring
        createRecurringBooking,
        cancelRecurringSeries,
        
        // Stats
        getDayStats,
        getCustomerBookings,
        
        // Utils
        formatTime,
        parseTime
    };
})();

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveBooking;
}
