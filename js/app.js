/**
 * Golf Cove - Admin POS Application Controller
 * Main application logic that ties all modules together
 */

const GolfCoveApp = (function() {
    'use strict';
    
    // State
    let currentPage = 'teesheet';
    let currentDate = new Date();
    let selectedBookingId = null;
    let selectedTabId = null;
    let payingTabId = null;
    
    // Configuration
    const rooms = [
        { id: 1, name: 'Room 1' },
        { id: 2, name: 'Room 2' },
        { id: 3, name: 'Room 3' }
    ];
    
    const timeSlots = [
        '9:00am', '10:00am', '11:00am', '12:00pm', 
        '1:00pm', '2:00pm', '3:00pm', '4:00pm', 
        '5:00pm', '6:00pm', '7:00pm', '8:00pm', '9:00pm'
    ];
    
    // ============ INITIALIZATION ============
    function init() {
        console.log('🏌️ Golf Cove POS Initializing...');
        
        // Initialize PIN lock
        if (typeof GolfCovePIN !== 'undefined') {
            GolfCovePIN.init(onAuthenticated);
        } else {
            onAuthenticated({ name: 'Staff', role: 'staff' });
        }
    }
    
    function onAuthenticated(employee) {
        console.log(`✅ Authenticated as ${employee.name}`);
        
        // Initialize date picker
        initDatePicker();
        
        // Render initial views
        renderTeeSheet();
        renderOpenTabs();
        renderCart();
        renderCalendar();
        updateStats();
        updateDailySummary();
        
        // Bind events
        bindEvents();
        
        // Update employee display
        const employeeEl = document.getElementById('currentEmployee');
        if (employeeEl) {
            employeeEl.textContent = employee.name;
        }
        
        showToast(`Welcome, ${employee.name}!`, 'success');
    }
    
    function initDatePicker() {
        const datePicker = document.getElementById('teeSheetDate');
        if (datePicker) {
            datePicker.value = GolfCoveUtils.getTodayISO();
        }
    }
    
    // ============ EVENT BINDING ============
    function bindEvents() {
        // Navigation
        document.querySelectorAll('[data-page]').forEach(el => {
            el.addEventListener('click', () => navigateTo(el.dataset.page));
        });
        
        // Modal close on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            });
        });
        
        // Date picker
        const datePicker = document.getElementById('teeSheetDate');
        if (datePicker) {
            datePicker.addEventListener('change', renderTeeSheet);
        }
        
        // Global search
        const searchInput = document.getElementById('globalSearch');
        if (searchInput) {
            searchInput.addEventListener('input', GolfCoveUtils.debounce((e) => {
                performGlobalSearch(e.target.value);
            }, 300));
        }
        
        // Category tabs
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderMenuItems(tab.dataset.category);
            });
        });
    }
    
    // ============ NAVIGATION ============
    function navigateTo(page) {
        currentPage = page;
        
        // Update nav
        document.querySelectorAll('[data-page]').forEach(el => {
            el.classList.toggle('active', el.dataset.page === page);
        });
        
        // Show/hide pages
        document.querySelectorAll('.page-content').forEach(el => {
            el.style.display = 'none';
        });
        
        const pageEl = document.getElementById(`page-${page}`);
        if (pageEl) {
            pageEl.style.display = 'block';
        }
    }
    
    // ============ TEE SHEET RENDERING ============
    function renderTeeSheet() {
        const container = document.getElementById('roomsContainer');
        if (!container) return;
        
        const selectedDate = document.getElementById('teeSheetDate')?.value || GolfCoveUtils.getTodayISO();
        const allBookings = typeof GolfCoveBooking !== 'undefined' 
            ? GolfCoveBooking.getForDate(selectedDate) 
            : [];
        const customers = GolfCoveUtils.getStorage('gc_customers', []);
        
        container.innerHTML = rooms.map(room => {
            const roomBookings = allBookings.filter(b => (b.roomId || b.room) === room.id);
            const checkedInCount = roomBookings.filter(b => b.status === 'checked-in' || b.checkedIn).length;
            
            let statusClass = 'available';
            if (roomBookings.length > 0 && checkedInCount === roomBookings.length) {
                statusClass = 'occupied';
            } else if (roomBookings.length > 0) {
                statusClass = 'partial';
            }
            
            return `
                <div class="room-column">
                    <div class="room-header">
                        <span class="status-dot ${statusClass}"></span>
                        <h3>${room.name}</h3>
                        <span style="font-size:11px;color:rgba(255,255,255,0.7);margin-left:auto;">${roomBookings.length} bookings</span>
                    </div>
                    <div class="room-slots">
                        ${timeSlots.map(time => renderTimeSlot(room, time, roomBookings, customers)).join('')}
                    </div>
                </div>
            `;
        }).join('');
        
        updateStats();
    }
    
    function renderTimeSlot(room, time, roomBookings, customers) {
        const booking = roomBookings.find(b => b.time === time);
        
        let memberBadge = '';
        let isVIP = false;
        
        if (booking) {
            if (booking.priority === 'vip') {
                isVIP = true;
                memberBadge = '<span class="vip-badge">⭐ VIP</span>';
            } else if (booking.priority === 'member') {
                memberBadge = '<span class="member-badge">M</span>';
            }
        }
        
        const isCheckedIn = booking && (booking.status === 'checked-in' || booking.checkedIn);
        const statusIcon = isCheckedIn ? ' <i class="fas fa-check-circle" style="color:#fff;"></i>' : '';
        
        const slotClass = booking 
            ? `booked ${isCheckedIn ? 'checked-in' : ''} ${isVIP ? 'vip-booking' : ''}`
            : 'available';
        
        const onClick = booking 
            ? `GolfCoveApp.selectBooking(${booking.id})`
            : `GolfCoveApp.quickBook(${room.id}, '${time}')`;
        
        return `
            <div class="time-slot">
                <div class="time-label">${time}</div>
                <div class="slot-content ${slotClass}" onclick="${onClick}">
                    ${booking ? `
                        <div class="booking-info">
                            <span class="customer-name">${booking.customer}${memberBadge}${statusIcon}</span>
                            <span class="booking-details">${booking.duration}hr</span>
                        </div>
                        <span class="player-count">${booking.players}<i class="fas fa-user"></i></span>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // ============ BOOKING FUNCTIONS ============
    function quickBook(roomId, time) {
        const bookingForm = document.getElementById('bookingForm');
        if (bookingForm) {
            bookingForm.reset();
        }
        
        document.getElementById('bookingRoom').value = roomId;
        document.getElementById('bookingTime').value = time;
        document.getElementById('bookingDate').value = document.getElementById('teeSheetDate')?.value || GolfCoveUtils.getTodayISO();
        
        updateBookingPrice();
        showModal('booking');
    }
    
    function selectBooking(id) {
        if (typeof GolfCoveBooking === 'undefined') return;
        
        const booking = GolfCoveBooking.get(id);
        if (!booking) return;
        
        selectedBookingId = id;
        
        // Populate detail modal
        document.getElementById('detailCustomer').textContent = booking.customer;
        document.getElementById('detailRoom').textContent = GolfCoveBooking.getRoomName(booking.roomId || booking.room);
        document.getElementById('detailTime').textContent = `${booking.time} - ${booking.date}`;
        document.getElementById('detailDuration').textContent = `${booking.duration} hour(s)`;
        document.getElementById('detailPlayers').textContent = `${booking.players} player(s)`;
        
        // Status
        const statusColors = {
            pending: '#f39c12',
            confirmed: '#3498db',
            'checked-in': '#27ae60',
            completed: '#95a5a6'
        };
        const statusEl = document.getElementById('detailStatus');
        if (statusEl) {
            statusEl.textContent = (booking.status || 'confirmed').replace('-', ' ');
            statusEl.style.color = statusColors[booking.status] || '#333';
        }
        
        // Price
        const priceEl = document.getElementById('detailPrice');
        if (priceEl) {
            priceEl.textContent = GolfCoveUtils.formatCurrency(booking.totalPrice || booking.price || 0);
        }
        
        // Update buttons based on status
        updateBookingDetailButtons(booking);
        
        showModal('bookingDetail');
    }
    
    function updateBookingDetailButtons(booking) {
        const btnCheckIn = document.getElementById('btnCheckIn');
        const btnCheckOut = document.getElementById('btnCheckOut');
        const btnNoShow = document.getElementById('btnNoShow');
        const btnCancel = document.getElementById('btnCancelBooking');
        
        if (btnCheckIn) btnCheckIn.style.display = 'none';
        if (btnCheckOut) btnCheckOut.style.display = 'none';
        if (btnNoShow) btnNoShow.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'none';
        
        if (booking.status === 'pending' || booking.status === 'confirmed' || !booking.status) {
            if (btnCheckIn) btnCheckIn.style.display = 'block';
            if (btnNoShow) btnNoShow.style.display = 'block';
            if (btnCancel) btnCancel.style.display = 'block';
        } else if (booking.status === 'checked-in') {
            if (btnCheckOut) btnCheckOut.style.display = 'block';
        }
    }
    
    function createBooking(e) {
        e.preventDefault();
        
        if (typeof GolfCoveBooking === 'undefined') {
            showToast('Booking system not loaded', 'error');
            return;
        }
        
        const formData = {
            customer: document.getElementById('bookingCustomer').value,
            roomId: parseInt(document.getElementById('bookingRoom').value),
            room: parseInt(document.getElementById('bookingRoom').value),
            time: document.getElementById('bookingTime').value,
            date: document.getElementById('bookingDate').value,
            duration: parseInt(document.getElementById('bookingDuration').value),
            players: parseInt(document.getElementById('bookingPlayers').value),
            phone: document.getElementById('bookingPhone')?.value || '',
            notes: document.getElementById('bookingNotes')?.value || '',
            depositAmount: parseFloat(document.getElementById('bookingDeposit')?.value) || 0
        };
        
        const result = GolfCoveBooking.create(formData);
        
        if (result.success) {
            hideModal('booking');
            renderTeeSheet();
            showToast(`Booking created for ${formData.customer}`, 'success');
        } else {
            showToast(result.error || 'Failed to create booking', 'error');
        }
    }
    
    function checkInBooking() {
        if (!selectedBookingId || typeof GolfCoveBooking === 'undefined') return;
        
        const result = GolfCoveBooking.checkIn(selectedBookingId);
        
        if (result.success) {
            hideModal('bookingDetail');
            renderTeeSheet();
            showToast(`${result.booking.customer} checked in!`, 'success');
        } else {
            showToast(result.error || 'Check-in failed', 'error');
        }
        
        selectedBookingId = null;
    }
    
    function checkOutBooking() {
        if (!selectedBookingId || typeof GolfCoveBooking === 'undefined') return;
        
        const result = GolfCoveBooking.checkOut(selectedBookingId);
        
        if (result.success) {
            hideModal('bookingDetail');
            renderTeeSheet();
            showToast('Checked out successfully', 'success');
        } else {
            showToast(result.error || 'Check-out failed', 'error');
        }
        
        selectedBookingId = null;
    }
    
    function cancelBooking() {
        if (!selectedBookingId || typeof GolfCoveBooking === 'undefined') return;
        
        const booking = GolfCoveBooking.get(selectedBookingId);
        if (!confirm(`Cancel booking for ${booking.customer}?`)) return;
        
        const result = GolfCoveBooking.cancel(selectedBookingId, 'Cancelled by admin');
        
        if (result.success) {
            hideModal('bookingDetail');
            renderTeeSheet();
            showToast('Booking cancelled', 'success');
        } else {
            showToast(result.error || 'Failed to cancel', 'error');
        }
        
        selectedBookingId = null;
    }
    
    function updateBookingPrice() {
        const duration = parseInt(document.getElementById('bookingDuration')?.value) || 1;
        const priceDisplay = document.getElementById('bookingPriceDisplay');
        
        if (priceDisplay && typeof GolfCoveBooking !== 'undefined') {
            const pricing = GolfCoveBooking.calculatePrice(duration);
            priceDisplay.textContent = GolfCoveUtils.formatCurrency(pricing.finalPrice);
        }
    }
    
    // ============ TAB FUNCTIONS ============
    function renderOpenTabs() {
        const tbody = document.getElementById('openTabsBody');
        if (!tbody) return;
        
        const tabs = typeof GolfCoveTabs !== 'undefined' ? GolfCoveTabs.getAllTabs() : [];
        
        if (tabs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted" style="padding:20px;">No open tabs</td></tr>';
        } else {
            tbody.innerHTML = tabs.map(tab => `
                <tr class="tab-row" onclick="GolfCoveApp.selectTab(${tab.id})">
                    <td>${tab.table || 'Tab'}</td>
                    <td>${tab.customer}</td>
                    <td class="text-success font-bold">${GolfCoveUtils.formatCurrency(tab.amount)}</td>
                    <td>
                        <button onclick="event.stopPropagation(); GolfCoveApp.selectTab(${tab.id})" class="btn btn-primary" style="padding:5px 10px;font-size:11px;">
                            <i class="fas fa-eye"></i> View
                        </button>
                    </td>
                </tr>
            `).join('');
        }
        
        // Update summary
        const openTabsCount = document.getElementById('summaryOpenTabs');
        if (openTabsCount) {
            openTabsCount.textContent = tabs.length;
        }
    }
    
    function createTab(e) {
        e.preventDefault();
        
        if (typeof GolfCoveTabs === 'undefined') {
            showToast('Tab system not loaded', 'error');
            return;
        }
        
        const customer = document.getElementById('tabCustomer').value;
        const table = document.getElementById('tabTable').value;
        
        const result = GolfCoveTabs.createTab(customer, table);
        
        if (result.success) {
            hideModal('newTab');
            renderOpenTabs();
            showToast(`Tab created for ${customer}`, 'success');
            e.target.reset();
        } else {
            showToast(result.error || 'Failed to create tab', 'error');
        }
    }
    
    function selectTab(tabId) {
        if (typeof GolfCoveTabs === 'undefined') return;
        
        const tab = GolfCoveTabs.getTab(tabId);
        if (!tab) return;
        
        selectedTabId = tabId;
        
        document.getElementById('tabDetailId').textContent = `#${tab.id}`;
        document.getElementById('tabDetailCustomer').textContent = tab.customer;
        document.getElementById('tabDetailTable').textContent = tab.table || 'Tab';
        document.getElementById('tabDetailSubtotal').textContent = GolfCoveUtils.formatCurrency(tab.subtotal);
        document.getElementById('tabDetailTax').textContent = GolfCoveUtils.formatCurrency(tab.tax);
        document.getElementById('tabDetailAmount').textContent = GolfCoveUtils.formatCurrency(tab.amount);
        
        // Items list
        const itemsList = document.getElementById('tabItemsList');
        if (itemsList) {
            itemsList.innerHTML = tab.items.length > 0 
                ? tab.items.map(item => `
                    <div style="display:flex;justify-content:space-between;padding:4px 0;">
                        <span>${item.qty}x ${item.name}</span>
                        <span>${GolfCoveUtils.formatCurrency(item.price * item.qty)}</span>
                    </div>
                `).join('')
                : '<div class="text-muted text-center">No items</div>';
        }
        
        showModal('tabDetail');
    }
    
    function closeTab() {
        if (!selectedTabId) return;
        
        payingTabId = selectedTabId;
        hideModal('tabDetail');
        
        // Set payment amount
        if (typeof GolfCoveTabs !== 'undefined') {
            const tab = GolfCoveTabs.getTab(selectedTabId);
            if (tab) {
                document.getElementById('paymentAmount').textContent = GolfCoveUtils.formatCurrency(tab.amount);
            }
        }
        
        showModal('payment');
    }
    
    // ============ CART FUNCTIONS ============
    function renderCart() {
        const container = document.getElementById('cartItems');
        if (!container) return;
        
        const cart = typeof GolfCoveTabs !== 'undefined' ? GolfCoveTabs.getCart() : [];
        
        if (cart.length === 0) {
            container.innerHTML = `
                <div class="cart-empty">
                    <i class="fas fa-shopping-cart" style="font-size:40px;margin-bottom:10px;opacity:0.3;"></i>
                    <p>No items in cart</p>
                </div>
            `;
        } else {
            container.innerHTML = cart.map((item, i) => `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-price">${GolfCoveUtils.formatCurrency(item.price)} each</div>
                    </div>
                    <div class="qty-controls">
                        <button class="qty-btn" onclick="GolfCoveApp.changeQty(${i}, -1)">-</button>
                        <span class="qty-value">${item.qty}</span>
                        <button class="qty-btn" onclick="GolfCoveApp.changeQty(${i}, 1)">+</button>
                    </div>
                </div>
            `).join('');
        }
        
        updateCartTotals();
    }
    
    function addToCart(item) {
        if (typeof GolfCoveTabs !== 'undefined') {
            GolfCoveTabs.addToCart(item);
            renderCart();
            showToast(`${item.name} added`, 'success');
        }
    }
    
    function changeQty(index, delta) {
        if (typeof GolfCoveTabs !== 'undefined') {
            GolfCoveTabs.updateCartQty(index, delta);
            renderCart();
        }
    }
    
    function clearCart() {
        if (typeof GolfCoveTabs !== 'undefined') {
            GolfCoveTabs.clearCart();
            renderCart();
        }
    }
    
    function updateCartTotals() {
        if (typeof GolfCoveTabs === 'undefined') return;
        
        const summary = GolfCoveTabs.getCartSummary();
        
        const subtotalEl = document.getElementById('cartSubtotal');
        const taxEl = document.getElementById('cartTax');
        const totalEl = document.getElementById('cartTotal');
        const discountEl = document.getElementById('cartDiscount');
        
        if (subtotalEl) subtotalEl.textContent = GolfCoveUtils.formatCurrency(summary.subtotal);
        if (taxEl) taxEl.textContent = GolfCoveUtils.formatCurrency(summary.tax);
        if (totalEl) totalEl.textContent = GolfCoveUtils.formatCurrency(summary.total);
        
        if (discountEl) {
            if (summary.memberDiscount > 0) {
                discountEl.parentElement.style.display = 'flex';
                discountEl.textContent = '-' + GolfCoveUtils.formatCurrency(summary.memberDiscount);
            } else {
                discountEl.parentElement.style.display = 'none';
            }
        }
    }
    
    // ============ MENU RENDERING ============
    function renderMenuItems(category = 'all') {
        const container = document.getElementById('menuGrid');
        if (!container) return;
        
        const items = typeof GolfCoveMenu !== 'undefined' 
            ? GolfCoveMenu.getItemsByCategory(category)
            : [];
        
        container.innerHTML = items.map(item => `
            <div class="menu-item" onclick="GolfCoveApp.addToCart({name:'${item.name}',price:${item.price},category:'${item.category}'})">
                <div class="menu-item-name">${item.name}</div>
                <div class="menu-item-price">${GolfCoveUtils.formatCurrency(item.price)}</div>
            </div>
        `).join('');
    }
    
    // ============ STATS & CALENDAR ============
    function updateStats() {
        const selectedDate = document.getElementById('teeSheetDate')?.value || GolfCoveUtils.getTodayISO();
        
        let bookings = [];
        if (typeof GolfCoveBooking !== 'undefined') {
            bookings = GolfCoveBooking.getForDate(selectedDate);
        }
        
        const statBookings = document.getElementById('statBookings');
        const statOccupancy = document.getElementById('statOccupancy');
        const statCheckedIn = document.getElementById('statCheckedIn');
        const statRevenue = document.getElementById('statRevenue');
        
        if (statBookings) statBookings.textContent = bookings.length;
        
        if (statOccupancy) {
            const totalSlots = rooms.length * timeSlots.length;
            statOccupancy.textContent = Math.round((bookings.length / totalSlots) * 100) + '%';
        }
        
        if (statCheckedIn) {
            const checkedIn = bookings.filter(b => b.status === 'checked-in' || b.checkedIn).length;
            statCheckedIn.textContent = checkedIn;
        }
        
        if (statRevenue) {
            const revenue = bookings.reduce((sum, b) => sum + (b.totalPrice || b.price || 0), 0);
            statRevenue.textContent = GolfCoveUtils.formatCurrency(revenue);
        }
    }
    
    function updateDailySummary() {
        if (typeof GolfCoveTabs === 'undefined') return;
        
        const todaysSales = GolfCoveTabs.getTodaysSales();
        const todaysTrans = GolfCoveTabs.getTodaysTransactions().length;
        const openTabs = GolfCoveTabs.getAllTabs().length;
        
        const salesEl = document.getElementById('summaryTodaySales');
        const transEl = document.getElementById('summaryTodayTrans');
        const tabsEl = document.getElementById('summaryOpenTabs');
        
        if (salesEl) salesEl.textContent = GolfCoveUtils.formatCurrency(todaysSales);
        if (transEl) transEl.textContent = todaysTrans;
        if (tabsEl) tabsEl.textContent = openTabs;
    }
    
    function renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        if (!grid) return;
        
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        
        // Update header
        const monthLabel = document.getElementById('calendarMonth');
        if (monthLabel) {
            monthLabel.textContent = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
        
        // Day headers
        let html = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
            .map(d => `<div class="calendar-day header">${d}</div>`)
            .join('');
        
        // Empty cells
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="calendar-day"></div>';
        }
        
        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            html += `
                <div class="calendar-day ${isToday ? 'today' : ''}" onclick="GolfCoveApp.selectDate(${day})">
                    ${day}
                </div>
            `;
        }
        
        grid.innerHTML = html;
    }
    
    function changeMonth(delta) {
        currentDate.setMonth(currentDate.getMonth() + delta);
        renderCalendar();
    }
    
    function selectDate(day) {
        currentDate.setDate(day);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        const datePicker = document.getElementById('teeSheetDate');
        if (datePicker) {
            datePicker.value = dateStr;
        }
        
        renderTeeSheet();
        renderCalendar();
    }
    
    function changeTeeSheetDate(delta) {
        const datePicker = document.getElementById('teeSheetDate');
        if (!datePicker) return;
        
        const current = new Date(datePicker.value);
        current.setDate(current.getDate() + delta);
        datePicker.value = current.toISOString().split('T')[0];
        
        renderTeeSheet();
    }
    
    function goToToday() {
        const datePicker = document.getElementById('teeSheetDate');
        if (datePicker) {
            datePicker.value = GolfCoveUtils.getTodayISO();
        }
        renderTeeSheet();
    }
    
    // ============ SEARCH ============
    function performGlobalSearch(query) {
        const resultsDiv = document.getElementById('globalSearchResults');
        if (!resultsDiv) return;
        
        if (!query || query.length < 2) {
            resultsDiv.innerHTML = '<div class="text-center text-muted" style="padding:40px;">Start typing to search...</div>';
            return;
        }
        
        const q = query.toLowerCase();
        let html = '';
        
        // Search customers
        const customers = GolfCoveUtils.getStorage('gc_customers', []);
        const matchedCustomers = customers.filter(c => 
            `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
            (c.email && c.email.toLowerCase().includes(q))
        ).slice(0, 5);
        
        if (matchedCustomers.length > 0) {
            html += '<div class="search-section-header"><i class="fas fa-users"></i> Customers</div>';
            matchedCustomers.forEach(c => {
                html += `
                    <div class="search-result-item">
                        <div class="search-avatar" style="background:#4a90a4;">${GolfCoveUtils.getInitials(`${c.firstName} ${c.lastName}`)}</div>
                        <div style="flex:1;">
                            <div class="font-bold">${c.firstName} ${c.lastName}</div>
                            <div class="text-muted" style="font-size:12px;">${c.email || ''}</div>
                        </div>
                    </div>
                `;
            });
        }
        
        // Search bookings
        if (typeof GolfCoveBooking !== 'undefined') {
            const allBookings = GolfCoveBooking.getAll();
            const matchedBookings = allBookings.filter(b => 
                b.customer.toLowerCase().includes(q)
            ).slice(0, 5);
            
            if (matchedBookings.length > 0) {
                html += '<div class="search-section-header"><i class="fas fa-calendar"></i> Bookings</div>';
                matchedBookings.forEach(b => {
                    html += `
                        <div class="search-result-item" onclick="GolfCoveApp.selectBooking(${b.id}); GolfCoveApp.hideModal('lookup');">
                            <div class="search-avatar" style="background:#27ae60;"><i class="fas fa-golf-ball"></i></div>
                            <div style="flex:1;">
                                <div class="font-bold">${b.customer}</div>
                                <div class="text-muted" style="font-size:12px;">${b.date} ${b.time}</div>
                            </div>
                        </div>
                    `;
                });
            }
        }
        
        if (!html) {
            html = '<div class="text-center text-muted" style="padding:40px;">No results found</div>';
        }
        
        resultsDiv.innerHTML = html;
    }
    
    // ============ MODAL HELPERS ============
    function showModal(name) {
        const modal = document.getElementById(`modal-${name}`);
        if (modal) {
            modal.classList.add('active');
        }
    }
    
    function hideModal(name) {
        const modal = document.getElementById(`modal-${name}`);
        if (modal) {
            modal.classList.remove('active');
        }
    }
    
    // ============ PAYMENT ============
    function processPayment(method) {
        if (payingTabId && typeof GolfCoveTabs !== 'undefined') {
            const result = GolfCoveTabs.closeTab(payingTabId, method);
            if (result.success) {
                hideModal('payment');
                renderOpenTabs();
                updateDailySummary();
                showToast('Payment complete!', 'success');
            } else {
                showToast(result.error || 'Payment failed', 'error');
            }
            payingTabId = null;
            selectedTabId = null;
        } else {
            // Cart checkout
            if (typeof GolfCoveTabs !== 'undefined') {
                const result = GolfCoveTabs.checkout(method);
                if (result.success) {
                    hideModal('payment');
                    renderCart();
                    updateDailySummary();
                    showToast('Payment complete!', 'success');
                } else {
                    showToast(result.error || 'Payment failed', 'error');
                }
            }
        }
    }
    
    function cancelPayment() {
        payingTabId = null;
        hideModal('payment');
    }
    
    // ============ LOCK ============
    function lockScreen() {
        if (typeof GolfCovePIN !== 'undefined') {
            GolfCovePIN.lock();
        }
    }
    
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Public API
    return {
        init,
        navigateTo,
        
        // Booking
        quickBook,
        selectBooking,
        createBooking,
        checkInBooking,
        checkOutBooking,
        cancelBooking,
        updateBookingPrice,
        
        // Tabs
        createTab,
        selectTab,
        closeTab,
        
        // Cart
        addToCart,
        changeQty,
        clearCart,
        renderCart,
        
        // Render
        renderTeeSheet,
        renderOpenTabs,
        renderMenuItems,
        renderCalendar,
        
        // Date
        changeMonth,
        selectDate,
        changeTeeSheetDate,
        goToToday,
        
        // Modal
        showModal,
        hideModal,
        
        // Payment
        processPayment,
        cancelPayment,
        
        // Lock
        lockScreen,
        
        // State
        getCurrentPage: () => currentPage
    };
})();
