// ============================================================
// GOLF COVE POS - TEE SHEET MODULE
// Tee time scheduling and management
// Now uses unified BookingSystem for Firebase sync
// ============================================================

const TeeSheet = {
    // Default tee times (every 10 minutes from 6am to 6pm)
    timeSlots: [],
    
    // Get bookings from unified system
    get bookings() {
        if (typeof BookingSystem !== 'undefined') {
            return BookingSystem.getAll();
        }
        return JSON.parse(localStorage.getItem('gc_bookings') || '[]');
    },
    
    // Generate time slots
    init() {
        this.generateTimeSlots();
        
        // Subscribe to booking changes from unified system
        if (typeof BookingSystem !== 'undefined') {
            BookingSystem.on('booking:created', () => this.render());
            BookingSystem.on('booking:updated', () => this.render());
            BookingSystem.on('booking:checkedIn', () => this.render());
            BookingSystem.on('sync', () => this.render());
        }
    },
    
    // Generate time slots for the day
    generateTimeSlots() {
        this.timeSlots = [];
        const startHour = 6; // 6 AM
        const endHour = 18; // 6 PM
        const interval = 10; // 10 minutes
        
        for (let hour = startHour; hour < endHour; hour++) {
            for (let min = 0; min < 60; min += interval) {
                const time = new Date();
                time.setHours(hour, min, 0, 0);
                this.timeSlots.push({
                    time: time,
                    formatted: time.toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit',
                        hour12: true 
                    })
                });
            }
        }
    },
    
    // Load bookings from localStorage
    loadBookings() {
        this.bookings = JSON.parse(localStorage.getItem('gc_bookings') || '[]');
    },
    
    // Save bookings
    saveBookings() {
        localStorage.setItem('gc_bookings', JSON.stringify(this.bookings));
    },
    
    // Render tee sheet
    render() {
        const container = document.getElementById('teeSheetGrid');
        if (!container) return;
        
        const dateStr = POS.state.currentDate.toISOString().split('T')[0];
        const dayBookings = this.bookings.filter(b => b.date === dateStr);
        
        container.innerHTML = this.timeSlots.map(slot => {
            const booking = dayBookings.find(b => b.time === slot.formatted);
            const isPast = this.isTimePast(slot.time);
            
            return `
                <div class="tee-slot ${booking ? 'booked' : ''} ${isPast ? 'past' : ''}"
                     onclick="TeeSheet.handleSlotClick('${slot.formatted}', ${booking ? `'${booking.id}'` : 'null'})">
                    <div class="slot-time">${slot.formatted}</div>
                    ${booking ? `
                        <div class="slot-booking">
                            <div class="booking-name">${booking.customerName}</div>
                            <div class="booking-players">${booking.players} player${booking.players > 1 ? 's' : ''}</div>
                            <div class="booking-type">${booking.holes} holes</div>
                        </div>
                    ` : `
                        <div class="slot-available">
                            <i class="fas fa-plus"></i>
                            <span>Available</span>
                        </div>
                    `}
                </div>
            `;
        }).join('');
    },
    
    // Check if time is past
    isTimePast(slotTime) {
        const now = new Date();
        const today = new Date().toDateString();
        const currentDay = POS.state.currentDate.toDateString();
        
        if (today !== currentDay) return false;
        
        return slotTime.getHours() < now.getHours() || 
               (slotTime.getHours() === now.getHours() && slotTime.getMinutes() < now.getMinutes());
    },
    
    // Handle slot click
    handleSlotClick(time, bookingId) {
        if (bookingId) {
            this.showBookingDetails(bookingId);
        } else {
            this.showNewBookingModal(time);
        }
    },
    
    // Show new booking modal
    showNewBookingModal(time) {
        const modal = document.getElementById('bookingModal');
        if (!modal) return;
        
        document.getElementById('bookingTime').textContent = time;
        document.getElementById('bookingDate').textContent = POS.state.currentDate.toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric'
        });
        
        // Reset form
        document.getElementById('bookingCustomerName').value = '';
        document.getElementById('bookingPlayers').value = '1';
        document.getElementById('bookingHoles').value = '9';
        document.getElementById('bookingPhone').value = '';
        document.getElementById('bookingEmail').value = '';
        document.getElementById('bookingNotes').value = '';
        
        modal.dataset.time = time;
        modal.style.display = 'flex';
    },
    
    // Save booking from modal
    saveBooking() {
        const modal = document.getElementById('bookingModal');
        const time = modal.dataset.time;
        
        const booking = {
            id: Date.now().toString(),
            date: POS.state.currentDate.toISOString().split('T')[0],
            time: time,
            customerName: document.getElementById('bookingCustomerName').value || 'Walk-in',
            players: parseInt(document.getElementById('bookingPlayers').value) || 1,
            holes: parseInt(document.getElementById('bookingHoles').value) || 9,
            phone: document.getElementById('bookingPhone').value,
            email: document.getElementById('bookingEmail').value,
            notes: document.getElementById('bookingNotes').value,
            createdAt: new Date().toISOString(),
            createdBy: POS.state.currentUser?.name
        };
        
        this.bookings.push(booking);
        this.saveBookings();
        
        modal.style.display = 'none';
        this.render();
        
        POS.toast(`Booking saved for ${booking.customerName}`, 'success');
    },
    
    // Show booking details
    showBookingDetails(bookingId) {
        const booking = this.bookings.find(b => b.id === bookingId);
        if (!booking) return;
        
        const modal = document.getElementById('bookingDetailsModal');
        if (!modal) return;
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Booking Details</h2>
                    <button class="modal-close" onclick="this.closest('.modal').style.display='none'">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="booking-detail-row">
                        <label>Customer</label>
                        <span>${booking.customerName}</span>
                    </div>
                    <div class="booking-detail-row">
                        <label>Date & Time</label>
                        <span>${new Date(booking.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${booking.time}</span>
                    </div>
                    <div class="booking-detail-row">
                        <label>Players</label>
                        <span>${booking.players}</span>
                    </div>
                    <div class="booking-detail-row">
                        <label>Holes</label>
                        <span>${booking.holes}</span>
                    </div>
                    ${booking.phone ? `
                        <div class="booking-detail-row">
                            <label>Phone</label>
                            <span>${POS.formatPhone(booking.phone)}</span>
                        </div>
                    ` : ''}
                    ${booking.email ? `
                        <div class="booking-detail-row">
                            <label>Email</label>
                            <span>${booking.email}</span>
                        </div>
                    ` : ''}
                    ${booking.notes ? `
                        <div class="booking-detail-row">
                            <label>Notes</label>
                            <span>${booking.notes}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="TeeSheet.checkIn('${booking.id}')">
                        <i class="fas fa-check"></i> Check In
                    </button>
                    <button class="btn-primary" onclick="TeeSheet.addToCart('${booking.id}')">
                        <i class="fas fa-cart-plus"></i> Add to Cart
                    </button>
                    <button class="btn-danger" onclick="TeeSheet.cancelBooking('${booking.id}')">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
    },
    
    // Check in booking
    checkIn(bookingId) {
        const booking = this.bookings.find(b => b.id === bookingId);
        if (!booking) return;
        
        booking.checkedIn = true;
        booking.checkedInAt = new Date().toISOString();
        this.saveBookings();
        
        document.getElementById('bookingDetailsModal').style.display = 'none';
        this.render();
        
        POS.toast(`${booking.customerName} checked in`, 'success');
    },
    
    // Add booking to cart
    addToCart(bookingId) {
        const booking = this.bookings.find(b => b.id === bookingId);
        if (!booking) return;
        
        // Determine price based on holes and time
        const isPM = parseInt(booking.time.split(':')[0]) >= 12 || booking.time.includes('PM');
        let price;
        
        if (booking.holes === 9) {
            price = isPM ? 15 : 18;
        } else {
            price = isPM ? 26 : 32;
        }
        
        // Add to cart for each player
        for (let i = 0; i < booking.players; i++) {
            Cart.add({
                id: `booking_${booking.id}_${i}`,
                name: `${booking.holes} Holes ${isPM ? '(PM)' : '(AM)'}`,
                price: price,
                type: 'tee-time'
            });
        }
        
        document.getElementById('bookingDetailsModal').style.display = 'none';
    },
    
    // Cancel booking
    cancelBooking(bookingId) {
        if (!confirm('Cancel this booking?')) return;
        
        this.bookings = this.bookings.filter(b => b.id !== bookingId);
        this.saveBookings();
        
        document.getElementById('bookingDetailsModal').style.display = 'none';
        this.render();
        
        POS.toast('Booking cancelled', 'success');
    }
};

// Initialize tee sheet on load
document.addEventListener('DOMContentLoaded', () => {
    TeeSheet.init();
});
