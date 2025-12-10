/**
 * Golf Cove - Tee Sheet Manager
 * Handles bay/room bookings and tee sheet display
 */

const TeeSheetManager = (function() {
    'use strict';
    
    // Configuration
    const config = {
        rooms: [
            { id: 1, name: 'Room 1', type: 'simulator' },
            { id: 2, name: 'Room 2', type: 'simulator' },
            { id: 3, name: 'Room 3', type: 'simulator' }
        ],
        timeSlots: [
            '9:00am', '10:00am', '11:00am', '12:00pm',
            '1:00pm', '2:00pm', '3:00pm', '4:00pm',
            '5:00pm', '6:00pm', '7:00pm', '8:00pm', '9:00pm'
        ],
        pricing: {
            1: { price: 45, label: '1 Hour' },
            2: { price: 80, label: '2 Hours' },
            3: { price: 110, label: '3 Hours' },
            4: { price: 140, label: '4 Hours' }
        }
    };
    
    // State
    let currentDate = new Date();
    let selectedBookingId = null;
    
    // ============ DATA ============
    function getBookings() {
        return JSON.parse(localStorage.getItem('gc_bookings') || '[]');
    }
    
    function saveBookings(bookings) {
        localStorage.setItem('gc_bookings', JSON.stringify(bookings));
    }
    
    function getBookingsForDate(date) {
        const dateStr = formatDateISO(date);
        return getBookings().filter(b => b.date === dateStr);
    }
    
    // ============ RENDERING ============
    function render(containerId, date) {
        currentDate = date || new Date();
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const dateStr = formatDateISO(currentDate);
        const bookings = getBookingsForDate(currentDate);
        
        let html = `
            <table class="tee-sheet-table">
                <thead>
                    <tr>
                        <th class="time-column">Time</th>
                        ${config.rooms.map(r => `<th>${r.name}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
        `;
        
        config.timeSlots.forEach(slot => {
            html += `<tr data-time="${slot}">`;
            html += `<td class="time-cell">${slot}</td>`;
            
            config.rooms.forEach(room => {
                const booking = bookings.find(b => 
                    b.roomId === room.id && b.time === slot
                );
                
                if (booking) {
                    const isMember = booking.isMember || false;
                    const isVIP = booking.isVIP || false;
                    const status = booking.status || 'confirmed';
                    
                    let statusClass = '';
                    if (status === 'checked_in') statusClass = 'checked-in';
                    if (status === 'no_show') statusClass = 'no-show';
                    if (isMember) statusClass += ' member';
                    if (isVIP) statusClass += ' vip';
                    
                    html += `
                        <td class="booking-cell ${statusClass}" onclick="TeeSheetManager.selectBooking(${booking.id})">
                            <div class="booking-name">${booking.customer}</div>
                            <div class="booking-duration">${booking.duration}hr</div>
                            ${isMember ? '<i class="fas fa-star member-icon"></i>' : ''}
                            ${isVIP ? '<i class="fas fa-crown vip-icon"></i>' : ''}
                        </td>
                    `;
                } else {
                    html += `
                        <td class="empty-cell" onclick="TeeSheetManager.newBooking(${room.id}, '${slot}')">
                            <span class="add-booking">+</span>
                        </td>
                    `;
                }
            });
            
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
    }
    
    // ============ BOOKING ACTIONS ============
    function selectBooking(bookingId) {
        selectedBookingId = bookingId;
        const booking = getBookings().find(b => b.id === bookingId);
        
        if (booking && typeof showBookingDetail === 'function') {
            showBookingDetail(booking);
        }
    }
    
    function newBooking(roomId, time) {
        if (typeof showNewBookingModal === 'function') {
            showNewBookingModal(roomId, time, formatDateISO(currentDate));
        }
    }
    
    function createBooking(data) {
        const bookings = getBookings();
        
        // Check for conflicts
        const conflict = bookings.find(b => 
            b.date === data.date && 
            b.roomId === data.roomId && 
            b.time === data.time &&
            b.status !== 'cancelled'
        );
        
        if (conflict) {
            return { success: false, error: 'Time slot already booked' };
        }
        
        const booking = {
            id: Date.now(),
            ...data,
            status: 'confirmed',
            createdAt: new Date().toISOString()
        };
        
        // Look up customer for member status
        if (typeof GolfCoveCustomers !== 'undefined' && data.customer) {
            const parts = data.customer.split(' ');
            if (parts.length >= 2) {
                const customer = GolfCoveCustomers.getByName(parts[0], parts.slice(1).join(' '));
                if (customer) {
                    booking.customerId = customer.id;
                    booking.isMember = GolfCoveCustomers.isActiveMember(customer);
                    booking.isVIP = GolfCoveCustomers.isVIP(customer);
                    booking.memberType = customer.memberType;
                }
            }
        }
        
        bookings.push(booking);
        saveBookings(bookings);
        
        return { success: true, booking };
    }
    
    function updateBooking(bookingId, updates) {
        const bookings = getBookings();
        const index = bookings.findIndex(b => b.id === bookingId);
        
        if (index === -1) {
            return { success: false, error: 'Booking not found' };
        }
        
        bookings[index] = { ...bookings[index], ...updates };
        saveBookings(bookings);
        
        return { success: true, booking: bookings[index] };
    }
    
    function cancelBooking(bookingId) {
        return updateBooking(bookingId, { status: 'cancelled' });
    }
    
    function checkIn(bookingId) {
        return updateBooking(bookingId, { 
            status: 'checked_in', 
            checkedInAt: new Date().toISOString() 
        });
    }
    
    function markNoShow(bookingId) {
        return updateBooking(bookingId, { status: 'no_show' });
    }
    
    // ============ UTILITIES ============
    function formatDateISO(date) {
        return date.toISOString().split('T')[0];
    }
    
    function setDate(date) {
        currentDate = date;
    }
    
    function getSelectedBooking() {
        if (!selectedBookingId) return null;
        return getBookings().find(b => b.id === selectedBookingId);
    }
    
    // ============ STATS ============
    function getDayStats(date) {
        const bookings = getBookingsForDate(date);
        const active = bookings.filter(b => b.status !== 'cancelled');
        
        return {
            totalBookings: active.length,
            checkedIn: active.filter(b => b.status === 'checked_in').length,
            pending: active.filter(b => b.status === 'confirmed').length,
            noShows: active.filter(b => b.status === 'no_show').length,
            revenue: active.reduce((sum, b) => sum + (b.total || 0), 0)
        };
    }
    
    // ============ PUBLIC API ============
    return {
        render,
        selectBooking,
        newBooking,
        createBooking,
        updateBooking,
        cancelBooking,
        checkIn,
        markNoShow,
        setDate,
        getSelectedBooking,
        getDayStats,
        getBookingsForDate,
        config
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TeeSheetManager;
}
