/**
 * Golf Cove - Enhanced Booking Manager
 * Complete booking lifecycle management with waitlist, reminders, and analytics
 */

const GolfCoveBookingManager = (function() {
    'use strict';
    
    const Core = GolfCoveCore;
    
    // ============ CONFIGURATION ============
    const config = {
        bays: {
            single: { count: 6, capacity: 2, color: '#3b82f6' },
            double: { count: 4, capacity: 4, color: '#10b981' },
            triple: { count: 2, capacity: 6, color: '#f59e0b' },
            lounge: { count: 2, capacity: 8, color: '#8b5cf6' },
            party: { count: 1, capacity: 12, color: '#ec4899' }
        },
        hours: {
            weekday: { open: 9, close: 22 },
            weekend: { open: 8, close: 23 }
        },
        slotDuration: 30, // minutes
        minDuration: 30,
        maxDuration: 240,
        bufferTime: 15, // minutes between bookings
        advanceBookingDays: 30,
        cancellationWindow: 24, // hours
        noShowWindow: 15 // minutes past start time
    };
    
    // ============ PRICING ============
    const pricing = {
        base: {
            single: { weekday: 30, weekend: 40 },
            double: { weekday: 50, weekend: 65 },
            triple: { weekday: 70, weekend: 90 },
            lounge: { weekday: 100, weekend: 130 },
            party: { weekday: 200, weekend: 250 }
        },
        peakHours: {
            start: 17,
            end: 21,
            multiplier: 1.25
        },
        memberDiscounts: {
            par: 0.10,
            birdie: 0.15,
            eagle: 0.20,
            family_par: 0.10,
            family_birdie: 0.15,
            family_eagle: 0.20
        }
    };
    
    // ============ AVAILABILITY ============
    function generateTimeSlots(date) {
        const d = new Date(date);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const hours = isWeekend ? config.hours.weekend : config.hours.weekday;
        
        const slots = [];
        let currentTime = hours.open * 60; // Convert to minutes
        const endTime = hours.close * 60;
        
        while (currentTime < endTime) {
            const hour = Math.floor(currentTime / 60);
            const minute = currentTime % 60;
            
            slots.push({
                time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                minutes: currentTime,
                isPeak: hour >= pricing.peakHours.start && hour < pricing.peakHours.end
            });
            
            currentTime += config.slotDuration;
        }
        
        return slots;
    }
    
    function getAvailability(date, duration = 60, bayType = null) {
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        const bookings = getBookingsForDate(dateStr);
        const slots = generateTimeSlots(dateStr);
        
        const availability = [];
        
        for (const [type, bayConfig] of Object.entries(config.bays)) {
            if (bayType && type !== bayType) continue;
            
            for (let bayNum = 1; bayNum <= bayConfig.count; bayNum++) {
                const bayId = `${type}-${bayNum}`;
                
                const bayBookings = bookings.filter(b => 
                    b.bayId === bayId && 
                    b.status !== 'cancelled' && 
                    b.status !== 'no_show'
                );
                
                for (const slot of slots) {
                    const slotEndMinutes = slot.minutes + duration;
                    
                    // Check if this slot conflicts with existing bookings
                    const isAvailable = !bayBookings.some(booking => {
                        const bookingStart = timeToMinutes(booking.startTime);
                        const bookingEnd = bookingStart + booking.duration + config.bufferTime;
                        
                        return (slot.minutes < bookingEnd && slotEndMinutes > bookingStart);
                    });
                    
                    if (isAvailable) {
                        availability.push({
                            bayId,
                            bayType: type,
                            bayNumber: bayNum,
                            date: dateStr,
                            time: slot.time,
                            duration,
                            isPeak: slot.isPeak,
                            price: calculatePrice(type, duration, dateStr, slot.isPeak)
                        });
                    }
                }
            }
        }
        
        return availability;
    }
    
    function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }
    
    // ============ PRICING CALCULATION ============
    function calculatePrice(bayType, duration, date, isPeak = false, membership = null) {
        const d = new Date(date);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        
        const basePrice = pricing.base[bayType];
        if (!basePrice) return 0;
        
        const hourlyRate = isWeekend ? basePrice.weekend : basePrice.weekday;
        let price = (hourlyRate / 60) * duration;
        
        // Peak hour multiplier
        if (isPeak) {
            price *= pricing.peakHours.multiplier;
        }
        
        // Member discount
        if (membership && pricing.memberDiscounts[membership]) {
            price *= (1 - pricing.memberDiscounts[membership]);
        }
        
        return Math.round(price * 100) / 100;
    }
    
    // ============ BOOKING CRUD ============
    function createBooking(data) {
        // Validate required fields
        const validation = ValidationSchemas.validate('booking', 'create', data);
        if (!validation.success) {
            return validation;
        }
        
        // Check availability
        const dateStr = data.date || new Date(data.startTime).toISOString().split('T')[0];
        const available = getAvailability(dateStr, data.duration, data.bayType);
        
        const isSlotAvailable = available.some(slot => 
            slot.bayId === data.bayId && 
            slot.time === data.startTime.split('T')[1]?.substring(0, 5) ||
            slot.time === data.startTime
        );
        
        if (!isSlotAvailable && !data.override) {
            return Core.failure(Core.ErrorCodes.BOOKING_CONFLICT, 'Selected time slot is not available');
        }
        
        const booking = {
            id: Core.generateId('bkg'),
            bayId: data.bayId,
            bayType: data.bayType || data.bayId.split('-')[0],
            date: dateStr,
            startTime: data.startTime,
            duration: data.duration,
            endTime: calculateEndTime(data.startTime, data.duration),
            customer: data.customer ? {
                id: data.customer.id,
                name: Core.Format.name(data.customer.firstName, data.customer.lastName),
                email: data.customer.email,
                phone: data.customer.phone,
                membership: data.customer.membership?.type
            } : null,
            guestCount: data.guestCount || 1,
            price: calculatePrice(
                data.bayType || data.bayId.split('-')[0],
                data.duration,
                dateStr,
                isTimeInPeakHours(data.startTime),
                data.customer?.membership?.type
            ),
            status: 'confirmed',
            source: data.source || 'pos',
            paymentStatus: data.prepaid ? 'paid' : 'pending',
            paymentId: data.paymentId,
            notes: data.notes,
            addOns: data.addOns || [],
            reminderSent: false,
            createdAt: new Date().toISOString(),
            createdBy: data.employeeId
        };
        
        // Calculate add-on costs
        if (booking.addOns.length > 0) {
            booking.addOnsTotal = booking.addOns.reduce((sum, addon) => sum + (addon.price || 0), 0);
            booking.totalPrice = booking.price + booking.addOnsTotal;
        } else {
            booking.totalPrice = booking.price;
        }
        
        // Save booking
        saveBooking(booking);
        
        // Schedule reminder
        scheduleReminder(booking);
        
        // Sync
        if (typeof GolfCoveSyncManager !== 'undefined') {
            GolfCoveSyncManager.create('bookings', booking);
        }
        
        Core.emit('booking:created', { booking });
        
        return Core.success(booking);
    }
    
    function calculateEndTime(startTime, duration) {
        // Handle both full datetime and time-only formats
        const timeOnly = startTime.includes('T') 
            ? startTime.split('T')[1].substring(0, 5)
            : startTime;
        
        const [hours, minutes] = timeOnly.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes + duration;
        
        const endHours = Math.floor(totalMinutes / 60) % 24;
        const endMinutes = totalMinutes % 60;
        
        return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
    }
    
    function isTimeInPeakHours(timeStr) {
        const timeOnly = timeStr.includes('T') 
            ? timeStr.split('T')[1].substring(0, 5)
            : timeStr;
        
        const hour = parseInt(timeOnly.split(':')[0], 10);
        return hour >= pricing.peakHours.start && hour < pricing.peakHours.end;
    }
    
    function updateBooking(bookingId, updates) {
        const bookings = getAllBookings();
        const index = bookings.findIndex(b => b.id === bookingId);
        
        if (index === -1) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Booking not found');
        }
        
        const booking = bookings[index];
        
        // Check if modification is allowed
        if (['completed', 'cancelled', 'no_show'].includes(booking.status)) {
            return Core.failure(Core.ErrorCodes.INVALID_STATE, 'Booking cannot be modified');
        }
        
        // Apply updates
        Object.assign(booking, updates, {
            updatedAt: new Date().toISOString()
        });
        
        // Recalculate price if duration or time changed
        if (updates.duration || updates.startTime) {
            booking.price = calculatePrice(
                booking.bayType,
                booking.duration,
                booking.date,
                isTimeInPeakHours(booking.startTime),
                booking.customer?.membership
            );
            booking.totalPrice = booking.price + (booking.addOnsTotal || 0);
        }
        
        bookings[index] = booking;
        localStorage.setItem('gc_bookings', JSON.stringify(bookings));
        
        if (typeof GolfCoveSyncManager !== 'undefined') {
            GolfCoveSyncManager.update('bookings', booking);
        }
        
        Core.emit('booking:updated', { booking });
        
        return Core.success(booking);
    }
    
    function cancelBooking(bookingId, reason, refund = true) {
        const result = updateBooking(bookingId, {
            status: 'cancelled',
            cancelReason: reason,
            cancelledAt: new Date().toISOString()
        });
        
        if (!result.success) return result;
        
        const booking = result.data;
        
        // Process refund if prepaid
        if (refund && booking.paymentStatus === 'paid' && booking.paymentId) {
            if (typeof GolfCoveTransactionManager !== 'undefined') {
                GolfCoveTransactionManager.createRefund(booking.paymentId, {
                    amount: booking.totalPrice,
                    reason: `Booking cancelled: ${reason}`
                });
            }
        }
        
        Core.emit('booking:cancelled', { booking, reason });
        
        return result;
    }
    
    function checkIn(bookingId) {
        const result = updateBooking(bookingId, {
            status: 'checked_in',
            checkedInAt: new Date().toISOString()
        });
        
        if (result.success) {
            Core.emit('booking:checkedIn', { booking: result.data });
        }
        
        return result;
    }
    
    function checkOut(bookingId) {
        const result = updateBooking(bookingId, {
            status: 'completed',
            checkedOutAt: new Date().toISOString()
        });
        
        if (result.success) {
            Core.emit('booking:completed', { booking: result.data });
        }
        
        return result;
    }
    
    function markNoShow(bookingId) {
        const result = updateBooking(bookingId, {
            status: 'no_show',
            markedNoShowAt: new Date().toISOString()
        });
        
        if (result.success) {
            // Update customer no-show count
            const booking = result.data;
            if (booking.customer?.id && typeof GolfCoveCustomers !== 'undefined') {
                GolfCoveCustomers.recordNoShow(booking.customer.id, bookingId);
            }
            
            Core.emit('booking:noShow', { booking });
        }
        
        return result;
    }
    
    // ============ STORAGE ============
    function saveBooking(booking) {
        const bookings = getAllBookings();
        const index = bookings.findIndex(b => b.id === booking.id);
        
        if (index !== -1) {
            bookings[index] = booking;
        } else {
            bookings.push(booking);
        }
        
        localStorage.setItem('gc_bookings', JSON.stringify(bookings));
    }
    
    function getAllBookings() {
        return JSON.parse(localStorage.getItem('gc_bookings') || '[]');
    }
    
    function getBooking(bookingId) {
        return getAllBookings().find(b => b.id === bookingId);
    }
    
    function getBookingsForDate(date) {
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        return getAllBookings().filter(b => b.date === dateStr);
    }
    
    function getUpcomingBookings(customerId) {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        return getAllBookings()
            .filter(b => 
                b.customer?.id === customerId &&
                b.date >= today &&
                !['cancelled', 'no_show'].includes(b.status)
            )
            .sort((a, b) => a.date.localeCompare(b.date));
    }
    
    // ============ WAITLIST ============
    const waitlist = {
        add: function(data) {
            const entry = {
                id: Core.generateId('wl'),
                customer: data.customer,
                date: data.date,
                preferredTime: data.preferredTime,
                duration: data.duration,
                bayType: data.bayType,
                flexibleTime: data.flexibleTime || false,
                notified: false,
                createdAt: new Date().toISOString()
            };
            
            const waitlistData = this.getAll();
            waitlistData.push(entry);
            localStorage.setItem('gc_waitlist', JSON.stringify(waitlistData));
            
            Core.emit('waitlist:added', { entry });
            
            return Core.success(entry);
        },
        
        remove: function(entryId) {
            const waitlistData = this.getAll();
            const index = waitlistData.findIndex(e => e.id === entryId);
            
            if (index === -1) {
                return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Waitlist entry not found');
            }
            
            waitlistData.splice(index, 1);
            localStorage.setItem('gc_waitlist', JSON.stringify(waitlistData));
            
            return Core.success();
        },
        
        getAll: function() {
            return JSON.parse(localStorage.getItem('gc_waitlist') || '[]');
        },
        
        getForDate: function(date) {
            const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
            return this.getAll().filter(e => e.date === dateStr);
        },
        
        checkAndNotify: function(date, bayType = null) {
            const entries = this.getForDate(date).filter(e => !e.notified);
            const availability = getAvailability(date, 60, bayType);
            
            const notified = [];
            
            for (const entry of entries) {
                const match = availability.find(slot => 
                    (!entry.bayType || slot.bayType === entry.bayType) &&
                    (entry.flexibleTime || slot.time === entry.preferredTime)
                );
                
                if (match) {
                    // Send notification
                    this.notifyCustomer(entry, match);
                    entry.notified = true;
                    notified.push(entry);
                }
            }
            
            if (notified.length > 0) {
                localStorage.setItem('gc_waitlist', JSON.stringify(this.getAll()));
            }
            
            return notified;
        },
        
        notifyCustomer: function(entry, availableSlot) {
            Core.emit('waitlist:notified', { entry, slot: availableSlot });
            
            // Send email/SMS if available
            if (entry.customer?.email && typeof GolfCoveAPI !== 'undefined') {
                GolfCoveAPI.callFunction('sendWaitlistNotification', {
                    email: entry.customer.email,
                    slot: availableSlot
                });
            }
        }
    };
    
    // ============ REMINDERS ============
    function scheduleReminder(booking) {
        // Schedule reminder for 24 hours before
        const bookingDateTime = new Date(`${booking.date}T${booking.startTime}`);
        const reminderTime = new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000);
        
        if (reminderTime > new Date()) {
            const reminders = JSON.parse(localStorage.getItem('gc_reminders') || '[]');
            reminders.push({
                bookingId: booking.id,
                scheduledFor: reminderTime.toISOString(),
                sent: false
            });
            localStorage.setItem('gc_reminders', JSON.stringify(reminders));
        }
    }
    
    function processReminders() {
        const reminders = JSON.parse(localStorage.getItem('gc_reminders') || '[]');
        const now = new Date();
        let updated = false;
        
        for (const reminder of reminders) {
            if (reminder.sent) continue;
            
            const scheduledTime = new Date(reminder.scheduledFor);
            if (scheduledTime <= now) {
                const booking = getBooking(reminder.bookingId);
                
                if (booking && booking.status === 'confirmed') {
                    sendReminder(booking);
                    reminder.sent = true;
                    updated = true;
                }
            }
        }
        
        if (updated) {
            localStorage.setItem('gc_reminders', JSON.stringify(reminders));
        }
    }
    
    function sendReminder(booking) {
        if (!booking.customer?.email) return;
        
        if (typeof GolfCoveAPI !== 'undefined') {
            GolfCoveAPI.callFunction('sendBookingReminder', {
                email: booking.customer.email,
                booking: {
                    id: booking.id,
                    date: booking.date,
                    time: booking.startTime,
                    duration: booking.duration,
                    bayType: booking.bayType
                }
            });
        }
        
        booking.reminderSent = true;
        saveBooking(booking);
        
        Core.emit('booking:reminderSent', { booking });
    }
    
    // ============ ANALYTICS ============
    function getBookingStats(startDate, endDate) {
        let bookings = getAllBookings();
        
        if (startDate) {
            bookings = bookings.filter(b => b.date >= startDate);
        }
        if (endDate) {
            bookings = bookings.filter(b => b.date <= endDate);
        }
        
        const stats = {
            total: bookings.length,
            byStatus: {},
            byBayType: {},
            revenue: 0,
            avgDuration: 0,
            avgPartySize: 0,
            peakHours: {},
            utilization: 0
        };
        
        let totalDuration = 0;
        let totalGuests = 0;
        
        bookings.forEach(booking => {
            // By status
            stats.byStatus[booking.status] = (stats.byStatus[booking.status] || 0) + 1;
            
            // By bay type
            stats.byBayType[booking.bayType] = (stats.byBayType[booking.bayType] || 0) + 1;
            
            // Revenue (only completed bookings)
            if (booking.status === 'completed' || booking.status === 'checked_in') {
                stats.revenue += booking.totalPrice || booking.price || 0;
            }
            
            // Duration
            totalDuration += booking.duration;
            
            // Guests
            totalGuests += booking.guestCount || 1;
            
            // Peak hours
            const hour = parseInt(booking.startTime.split(':')[0], 10);
            stats.peakHours[hour] = (stats.peakHours[hour] || 0) + 1;
        });
        
        stats.avgDuration = bookings.length > 0 ? totalDuration / bookings.length : 0;
        stats.avgPartySize = bookings.length > 0 ? totalGuests / bookings.length : 0;
        
        // Calculate utilization
        if (startDate && endDate) {
            const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (24 * 60 * 60 * 1000));
            const totalBays = Object.values(config.bays).reduce((sum, b) => sum + b.count, 0);
            const avgDailyHours = (config.hours.weekday.close - config.hours.weekday.open);
            const totalAvailableMinutes = days * totalBays * avgDailyHours * 60;
            const bookedMinutes = bookings.reduce((sum, b) => sum + b.duration, 0);
            stats.utilization = totalAvailableMinutes > 0 ? bookedMinutes / totalAvailableMinutes : 0;
        }
        
        return stats;
    }
    
    // ============ INITIALIZATION ============
    function init() {
        // Process reminders every minute
        setInterval(processReminders, 60000);
        
        // Check for no-shows every 5 minutes
        setInterval(checkForNoShows, 300000);
        
        // Check waitlist when bookings change
        Core.on('booking:cancelled', () => {
            const today = new Date().toISOString().split('T')[0];
            waitlist.checkAndNotify(today);
        });
        
        Core.log('info', 'Booking manager initialized');
    }
    
    function checkForNoShows() {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        const bookings = getBookingsForDate(today).filter(b => 
            b.status === 'confirmed'
        );
        
        for (const booking of bookings) {
            const bookingMinutes = timeToMinutes(booking.startTime);
            
            if (currentMinutes > bookingMinutes + config.noShowWindow) {
                markNoShow(booking.id);
            }
        }
    }
    
    // ============ PUBLIC API ============
    return {
        init,
        config,
        pricing,
        
        // Availability
        generateTimeSlots,
        getAvailability,
        calculatePrice,
        
        // CRUD
        createBooking,
        updateBooking,
        cancelBooking,
        getBooking,
        getBookingsForDate,
        getUpcomingBookings,
        
        // Status changes
        checkIn,
        checkOut,
        markNoShow,
        
        // Waitlist
        waitlist,
        
        // Analytics
        getBookingStats
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.GolfCoveBookingManager = GolfCoveBookingManager;
}
