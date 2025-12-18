// ============================================================
// GOLF COVE POS - CORE MODULE
// Core state, utilities, and initialization
// ============================================================

const POS = {
    // State
    state: {
        currentUser: null,
        currentDate: new Date(),
        cart: [],
        selectedCustomer: null,
        isLocked: true,
        activeView: 'sales', // 'sales', 'teesheet', 'tabs'
        
        // Cash drawer state
        drawer: {
            isOpen: false,
            openedAt: null,
            openedBy: null,
            startingCash: 0,
            currentCash: 0,
            expectedCash: 0
        },
        
        // Shift state
        shift: {
            id: null,
            startedAt: null,
            employeeId: null,
            transactions: 0,
            totalSales: 0,
            cashSales: 0,
            cardSales: 0,
            refunds: 0,
            voids: 0
        },
        
        // Connection status
        isOnline: navigator.onLine,
        pendingSyncs: 0
    },
    
    // Configuration - Uses unified config with fallbacks
    get config() {
        const unified = window.GolfCoveConfig;
        return {
            // Tax rate as percentage (6.35) - convert from decimal if using unified config
            taxRate: unified?.pricing?.taxRate 
                ? unified.pricing.taxRate * 100 
                : (parseFloat(localStorage.getItem('gc_tax_rate')) || 6.35),
            businessName: unified?.business?.name 
                || localStorage.getItem('gc_business_name') 
                || 'Golf Cove',
            registerId: unified?.pos?.registerId 
                || localStorage.getItem('gc_register_id') 
                || 'POS-1'
        };
    },
    
    // Get employees from centralized storage (synced with Firebase)
    getEmployees() {
        // Use GolfCovePIN if available (preferred - has Firebase sync)
        if (typeof GolfCovePIN !== 'undefined') {
            return GolfCovePIN.getEmployees();
        }
        // Fallback to localStorage
        return JSON.parse(localStorage.getItem('gc_employees') || '[]');
    },
    
    // Initialize
    async init() {
        // Initialize Firebase sync if available
        if (typeof GolfCoveFirebase !== 'undefined') {
            GolfCoveFirebase.startAutoSync();
        }
        
        // Pull latest employees from Firebase
        if (typeof GolfCovePIN !== 'undefined') {
            await GolfCovePIN.pullFromFirebase();
        }
        
        // Get employees
        this.employees = this.getEmployees();
        
        // Check if should show lock screen
        if (this.employees.length > 0) {
            this.showLockScreen();
        } else {
            this.state.isLocked = false;
            this.state.currentUser = { name: 'Admin', role: 'manager' };
        }
        
        // Start clock
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        
        // Initialize date
        this.updateDateDisplay();
        
        console.log('POS Core initialized');
    },
    
    // Clock
    updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
        const el = document.getElementById('currentTime');
        if (el) el.textContent = timeStr;
    },
    
    // Date display
    updateDateDisplay() {
        const options = { weekday: 'short', month: 'short', day: 'numeric' };
        const dateStr = this.state.currentDate.toLocaleDateString('en-US', options);
        const el = document.getElementById('currentDateDisplay');
        if (el) el.textContent = dateStr;
    },
    
    // Change date
    changeDate(delta) {
        this.state.currentDate.setDate(this.state.currentDate.getDate() + delta);
        this.updateDateDisplay();
        if (typeof renderTeeSheet === 'function') renderTeeSheet();
    },
    
    // Go to today
    goToToday() {
        this.state.currentDate = new Date();
        this.updateDateDisplay();
        if (typeof renderTeeSheet === 'function') renderTeeSheet();
    },
    
    // Lock screen
    showLockScreen() {
        this.state.isLocked = true;
        const lockScreen = document.getElementById('lockScreen');
        if (lockScreen) {
            lockScreen.style.display = 'flex';
            this.renderEmployeeButtons();
        }
    },
    
    // Render employee selection buttons
    renderEmployeeButtons() {
        const container = document.getElementById('employeeButtons');
        if (!container) return;
        
        container.innerHTML = this.employees.map(emp => `
            <button class="employee-btn" onclick="POS.selectEmployee('${emp.name}')">
                <i class="fas fa-user-circle"></i>
                <span>${emp.name}</span>
            </button>
        `).join('');
    },
    
    // Select employee for PIN entry
    selectedEmployee: null,
    currentPin: '',
    pinAttempts: 0,
    pinLockout: null,
    MAX_PIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 300000, // 5 minutes
    
    selectEmployee(name) {
        // Validate name
        if (!name || typeof name !== 'string') return;
        
        // Check lockout
        if (this.pinLockout && Date.now() < this.pinLockout) {
            const remaining = Math.ceil((this.pinLockout - Date.now()) / 60000);
            this.toast(`Too many failed attempts. Try again in ${remaining} minutes.`, 'error');
            return;
        }
        
        this.selectedEmployee = name;
        this.currentPin = '';
        document.getElementById('employeeSelect').style.display = 'none';
        document.getElementById('pinEntry').style.display = 'block';
        document.getElementById('selectedEmployeeName').textContent = name;
        this.updatePinDots();
    },
    
    // Back to employee select
    backToEmployees() {
        this.selectedEmployee = null;
        this.currentPin = '';
        document.getElementById('employeeSelect').style.display = 'block';
        document.getElementById('pinEntry').style.display = 'none';
    },
    
    // Enter PIN digit
    enterPin(digit) {
        // Validate digit is 0-9
        if (!/^[0-9]$/.test(String(digit))) return;
        
        // Check lockout
        if (this.pinLockout && Date.now() < this.pinLockout) {
            return;
        }
        
        if (this.currentPin.length < 4) {
            this.currentPin += digit;
            this.updatePinDots();
            
            if (this.currentPin.length === 4) {
                this.verifyPin();
            }
        }
    },
    
    // Clear PIN
    clearPin() {
        this.currentPin = '';
        this.updatePinDots();
    },
    
    // Update PIN display dots
    updatePinDots() {
        const dots = document.querySelectorAll('.pin-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('filled', i < this.currentPin.length);
        });
    },
    
    // Verify PIN - now uses Firebase validation
    async verifyPin() {
        // Refresh employees list
        this.employees = this.getEmployees();
        const employee = this.employees.find(e => e.name === this.selectedEmployee);
        
        if (!employee) {
            this.showPinError();
            return;
        }
        
        // Try Firebase validation first if available
        if (typeof GolfCoveFirebase !== 'undefined') {
            try {
                const validEmployee = await GolfCoveFirebase.validatePIN(this.currentPin);
                if (validEmployee && validEmployee.name === this.selectedEmployee) {
                    this.unlock(validEmployee);
                    return;
                }
            } catch (error) {
                console.warn('Firebase PIN validation failed, using local:', error);
            }
        }
        
        // Fallback to local validation
        if (employee.pin === this.currentPin) {
            this.unlock(employee);
        } else {
            this.showPinError();
        }
    },
    
    // Show PIN error
    showPinError() {
        this.pinAttempts++;
        
        // Check for lockout
        if (this.pinAttempts >= this.MAX_PIN_ATTEMPTS) {
            this.pinLockout = Date.now() + this.LOCKOUT_DURATION;
            this.toast(`Too many failed attempts. Locked for 5 minutes.`, 'error');
            this.backToEmployees();
            
            // Log security event
            if (typeof GolfCoveCore !== 'undefined') {
                GolfCoveCore.log('warn', 'PIN lockout triggered', { 
                    employee: this.selectedEmployee,
                    attempts: this.pinAttempts 
                });
            }
            return;
        }
        
        const remaining = this.MAX_PIN_ATTEMPTS - this.pinAttempts;
        const pinPad = document.querySelector('.pin-pad');
        if (pinPad) {
            pinPad.classList.add('shake');
            setTimeout(() => pinPad.classList.remove('shake'), 500);
        }
        this.currentPin = '';
        this.updatePinDots();
        
        if (remaining <= 2) {
            this.toast(`Incorrect PIN. ${remaining} attempts remaining.`, 'error');
        }
    },
    
    // Unlock POS
    unlock(employee) {
        // Reset PIN security state
        this.pinAttempts = 0;
        this.pinLockout = null;
        
        this.state.isLocked = false;
        this.state.currentUser = employee;
        
        // Update UI
        const lockScreen = document.getElementById('lockScreen');
        if (lockScreen) lockScreen.style.display = 'none';
        
        const userNameEl = document.getElementById('currentUserName');
        if (userNameEl) userNameEl.textContent = employee.name;
        
        // Log clock-in
        this.logClockIn(employee.name);
        
        this.toast(`Welcome, ${employee.name}!`, 'success');
    },
    
    // Lock POS
    lock() {
        this.showLockScreen();
        this.backToEmployees();
    },
    
    // Log clock in - DISABLED: Timeclock feature temporarily removed
    logClockIn(name) {
        // TODO: Re-enable when timeclock is moved to Firebase
        console.log('Timeclock disabled - clock in:', name);
    },
    
    // Toast notification
    toast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `pos-toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },
    
    // Format currency
    formatCurrency(amount) {
        return '$' + (amount || 0).toFixed(2);
    },
    
    // Format phone
    formatPhone(phone) {
        if (!phone) return '';
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
        }
        return phone;
    },
    
    // ============ CASH DRAWER OPERATIONS ============
    async openDrawer(startingCash = 200) {
        if (this.state.drawer.isOpen) {
            this.toast('Drawer already open', 'error');
            return { success: false, error: 'Drawer already open' };
        }
        
        if (!this.state.currentUser) {
            this.toast('Must be logged in to open drawer', 'error');
            return { success: false, error: 'Not logged in' };
        }
        
        // Validate starting cash
        startingCash = parseFloat(startingCash) || 0;
        if (startingCash < 0 || startingCash > 10000) {
            this.toast('Invalid starting cash amount', 'error');
            return { success: false, error: 'Invalid amount' };
        }
        
        this.state.drawer = {
            isOpen: true,
            openedAt: new Date().toISOString(),
            openedBy: this.state.currentUser.id || this.state.currentUser.name,
            startingCash: startingCash,
            currentCash: startingCash,
            expectedCash: startingCash
        };
        
        // Log drawer open
        this.logDrawerEvent('open', { startingCash });
        
        // Start new shift
        await this.startShift();
        
        // Kick physical USB drawer if connected
        if (window.CashDrawer) {
            await CashDrawer.kick();
        }
        
        this.toast('Cash drawer opened', 'success');
        return { success: true };
    },
    
    async closeDrawer(countedCash) {
        if (!this.state.drawer.isOpen) {
            this.toast('Drawer not open', 'error');
            return { success: false, error: 'Drawer not open' };
        }
        
        countedCash = parseFloat(countedCash) || 0;
        const expected = this.state.drawer.expectedCash;
        const variance = countedCash - expected;
        
        const closeSummary = {
            openedAt: this.state.drawer.openedAt,
            closedAt: new Date().toISOString(),
            openedBy: this.state.drawer.openedBy,
            closedBy: this.state.currentUser?.id || this.state.currentUser?.name,
            startingCash: this.state.drawer.startingCash,
            expectedCash: expected,
            countedCash: countedCash,
            variance: variance,
            variancePercent: expected > 0 ? ((variance / expected) * 100).toFixed(2) : 0
        };
        
        // Log drawer close
        this.logDrawerEvent('close', closeSummary);
        
        // End shift
        await this.endShift(closeSummary);
        
        // Reset drawer state
        this.state.drawer = {
            isOpen: false,
            openedAt: null,
            openedBy: null,
            startingCash: 0,
            currentCash: 0,
            expectedCash: 0
        };
        
        if (Math.abs(variance) > 5) {
            this.toast(`Drawer closed. Variance: ${this.formatCurrency(variance)}`, variance > 0 ? 'success' : 'error');
        } else {
            this.toast('Drawer closed successfully', 'success');
        }
        
        return { success: true, summary: closeSummary };
    },
    
    // Record cash transaction for drawer tracking
    recordCashTransaction(amount, type = 'sale') {
        if (!this.state.drawer.isOpen) return;
        
        if (type === 'sale' || type === 'in') {
            this.state.drawer.currentCash += amount;
            this.state.drawer.expectedCash += amount;
        } else if (type === 'refund' || type === 'out') {
            this.state.drawer.currentCash -= amount;
            this.state.drawer.expectedCash -= amount;
        }
    },
    
    // Cash drop (remove cash for safe)
    async cashDrop(amount, reason = '') {
        if (!this.state.drawer.isOpen) {
            this.toast('Drawer not open', 'error');
            return { success: false };
        }
        
        amount = parseFloat(amount) || 0;
        if (amount <= 0 || amount > this.state.drawer.currentCash) {
            this.toast('Invalid drop amount', 'error');
            return { success: false };
        }
        
        this.state.drawer.currentCash -= amount;
        this.state.drawer.expectedCash -= amount;
        
        this.logDrawerEvent('drop', { amount, reason });
        this.toast(`$${amount.toFixed(2)} dropped to safe`, 'success');
        
        return { success: true };
    },
    
    // Paid in (add cash to drawer)
    async paidIn(amount, reason = '') {
        if (!this.state.drawer.isOpen) {
            this.toast('Drawer not open', 'error');
            return { success: false };
        }
        
        amount = parseFloat(amount) || 0;
        if (amount <= 0 || amount > 10000) {
            this.toast('Invalid paid in amount', 'error');
            return { success: false };
        }
        
        this.state.drawer.currentCash += amount;
        this.state.drawer.expectedCash += amount;
        
        this.logDrawerEvent('paid_in', { amount, reason });
        this.toast(`$${amount.toFixed(2)} added to drawer`, 'success');
        
        return { success: true };
    },
    
    // Paid out (remove cash from drawer for expense)
    async paidOut(amount, reason = '', vendor = '') {
        if (!this.state.drawer.isOpen) {
            this.toast('Drawer not open', 'error');
            return { success: false };
        }
        
        amount = parseFloat(amount) || 0;
        if (amount <= 0 || amount > this.state.drawer.currentCash) {
            this.toast('Invalid paid out amount', 'error');
            return { success: false };
        }
        
        this.state.drawer.currentCash -= amount;
        this.state.drawer.expectedCash -= amount;
        
        this.logDrawerEvent('paid_out', { amount, reason, vendor });
        this.toast(`$${amount.toFixed(2)} paid out`, 'success');
        
        return { success: true };
    },
    
    logDrawerEvent(eventType, data) {
        const events = JSON.parse(localStorage.getItem('gc_drawer_events') || '[]');
        events.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            type: eventType,
            ...data,
            employeeId: this.state.currentUser?.id,
            employeeName: this.state.currentUser?.name,
            registerId: this.config.registerId,
            timestamp: new Date().toISOString()
        });
        
        // Keep last 500 events
        if (events.length > 500) events.splice(0, events.length - 500);
        localStorage.setItem('gc_drawer_events', JSON.stringify(events));
    },
    
    // ============ SHIFT MANAGEMENT ============
    async startShift() {
        const shiftId = 'SH' + Date.now().toString(36).toUpperCase();
        
        this.state.shift = {
            id: shiftId,
            startedAt: new Date().toISOString(),
            employeeId: this.state.currentUser?.id,
            employeeName: this.state.currentUser?.name,
            registerId: this.config.registerId,
            transactions: 0,
            totalSales: 0,
            cashSales: 0,
            cardSales: 0,
            giftCardSales: 0,
            tabSales: 0,
            refunds: 0,
            voids: 0,
            discounts: 0,
            tips: 0
        };
        
        // Save shift start
        const shifts = JSON.parse(localStorage.getItem('gc_shifts') || '[]');
        shifts.unshift({ ...this.state.shift, status: 'active' });
        localStorage.setItem('gc_shifts', JSON.stringify(shifts));
        
        // Sync if available
        if (typeof GolfCoveAPI !== 'undefined') {
            try {
                await GolfCoveAPI.shifts.start(this.state.shift);
            } catch (e) {
                console.warn('Failed to sync shift start:', e);
            }
        }
        
        return this.state.shift;
    },
    
    async endShift(drawerSummary = null) {
        if (!this.state.shift.id) return null;
        
        const shiftSummary = {
            ...this.state.shift,
            endedAt: new Date().toISOString(),
            status: 'completed',
            drawer: drawerSummary
        };
        
        // Update saved shift
        const shifts = JSON.parse(localStorage.getItem('gc_shifts') || '[]');
        const idx = shifts.findIndex(s => s.id === shiftSummary.id);
        if (idx !== -1) {
            shifts[idx] = shiftSummary;
        }
        localStorage.setItem('gc_shifts', JSON.stringify(shifts));
        
        // Sync if available
        if (typeof GolfCoveAPI !== 'undefined') {
            try {
                await GolfCoveAPI.shifts.end(shiftSummary);
            } catch (e) {
                console.warn('Failed to sync shift end:', e);
            }
        }
        
        // Reset shift state
        this.state.shift = {
            id: null,
            startedAt: null,
            employeeId: null,
            transactions: 0,
            totalSales: 0,
            cashSales: 0,
            cardSales: 0,
            refunds: 0,
            voids: 0
        };
        
        return shiftSummary;
    },
    
    // Update shift stats after transaction
    updateShiftStats(transaction) {
        if (!this.state.shift.id) return;
        
        this.state.shift.transactions++;
        this.state.shift.totalSales += transaction.total || 0;
        
        if (transaction.paymentMethod === 'cash') {
            this.state.shift.cashSales += transaction.total || 0;
        } else if (transaction.paymentMethod === 'card') {
            this.state.shift.cardSales += transaction.total || 0;
        } else if (transaction.paymentMethod === 'giftcard') {
            this.state.shift.giftCardSales += transaction.total || 0;
        } else if (transaction.paymentMethod === 'tab') {
            this.state.shift.tabSales += transaction.total || 0;
        }
        
        if (transaction.discount) {
            this.state.shift.discounts += transaction.discount;
        }
        
        if (transaction.paymentDetails?.tip) {
            this.state.shift.tips += transaction.paymentDetails.tip;
        }
    },
    
    // Generate transaction ID
    generateTransactionId() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `TX${timestamp}${random}`;
    },
    
    // Record transaction to backend
    async recordTransaction(transactionData) {
        // Validate input
        if (!transactionData || typeof transactionData !== 'object') {
            console.error('Invalid transaction data');
            return null;
        }
        
        // Validate required fields
        if (typeof transactionData.total !== 'number' || isNaN(transactionData.total)) {
            console.error('Transaction must have valid total');
            return null;
        }
        
        // Validate drawer is open for cash transactions
        if (transactionData.paymentMethod === 'cash' && !this.state.drawer.isOpen) {
            this.toast('Open cash drawer first', 'error');
            throw new Error('Cash drawer not open');
        }
        
        const transaction = {
            id: this.generateTransactionId(),
            storeId: 'golfcove',
            ...transactionData,
            total: Math.round(transactionData.total * 100) / 100, // Round to cents
            employeeId: this.state.currentUser?.id || 'unknown',
            employeeName: this.state.currentUser?.name || 'Unknown',
            registerId: this.config.registerId,
            shiftId: this.state.shift?.id || null,
            createdAt: new Date().toISOString()
        };
        
        // Update cash drawer for cash transactions
        if (transaction.paymentMethod === 'cash' && this.state.drawer.isOpen) {
            this.recordCashTransaction(transaction.total, 'sale');
        }
        
        // Update shift statistics
        this.updateShiftStats(transaction);
        
        // Save locally first (with size check)
        try {
            const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
            transactions.unshift(transaction); // Add to front for recent-first
            
            // Keep only last 1000 transactions locally
            if (transactions.length > 1000) {
                transactions.length = 1000;
            }
            
            localStorage.setItem('gc_transactions', JSON.stringify(transactions));
            
            // Update daily sales tracking for analytics
            const today = new Date().toDateString();
            const dailySales = JSON.parse(localStorage.getItem('gc_daily_sales') || '{}');
            if (!dailySales[today]) {
                dailySales[today] = { total: 0, count: 0, cash: 0, card: 0, giftcard: 0 };
            }
            dailySales[today].total += transaction.total;
            dailySales[today].count += 1;
            const method = transaction.paymentMethod || 'card';
            if (method === 'cash') {
                dailySales[today].cash = (dailySales[today].cash || 0) + transaction.total;
            } else if (method === 'card' || method === 'stripe') {
                dailySales[today].card = (dailySales[today].card || 0) + transaction.total;
            } else if (method === 'giftcard') {
                dailySales[today].giftcard = (dailySales[today].giftcard || 0) + transaction.total;
            }
            localStorage.setItem('gc_daily_sales', JSON.stringify(dailySales));
        } catch (e) {
            console.error('Failed to save transaction locally:', e);
        }
        
        // Sync with backend
        if (typeof GolfCoveAPI !== 'undefined') {
            try {
                await GolfCoveAPI.transactions.record(transaction);
                
                // Generate receipt
                if (transactionData.generateReceipt !== false) {
                    await GolfCoveAPI.receipts.generate({
                        transactionId: transaction.id,
                        ...transaction
                    });
                }
                
                // Award loyalty points if customer attached
                if (transaction.customerId && transaction.total > 0) {
                    await GolfCoveAPI.loyalty.earnPoints(
                        transaction.customerId, 
                        transaction.total, 
                        transaction.id
                    );
                }
            } catch (err) {
                console.warn('Failed to sync transaction:', err);
                // Will be synced later by offline queue
            }
        }
        
        return transaction;
    },
    
    // Void transaction
    async voidTransaction(transactionId, reason) {
        if (!this.state.currentUser || this.state.currentUser.role !== 'manager') {
            this.toast('Manager approval required', 'error');
            return { success: false, error: 'Insufficient permissions' };
        }
        
        if (typeof GolfCoveAPI !== 'undefined') {
            try {
                const result = await GolfCoveAPI.voids.voidTransaction(transactionId, reason);
                if (result.success) {
                    this.toast('Transaction voided', 'success');
                    return { success: true };
                }
                return result;
            } catch (err) {
                this.toast('Failed to void transaction', 'error');
                return { success: false, error: err.message };
            }
        }
        
        // Fallback to local
        const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
        const tx = transactions.find(t => t.id === transactionId);
        if (tx) {
            tx.status = 'voided';
            tx.voidReason = reason;
            tx.voidedBy = this.state.currentUser.name;
            tx.voidedAt = new Date().toISOString();
            localStorage.setItem('gc_transactions', JSON.stringify(transactions));
            this.toast('Transaction voided', 'success');
            return { success: true };
        }
        
        return { success: false, error: 'Transaction not found' };
    },
    
    // Apply discount
    async applyDiscount(code, subtotal, items) {
        if (typeof GolfCoveAPI !== 'undefined') {
            try {
                const result = await GolfCoveAPI.discounts.validate(code, subtotal, items);
                if (result.success && result.data.valid) {
                    return result.data.discount;
                }
                this.toast(result.data?.error || 'Invalid discount code', 'error');
                return null;
            } catch (err) {
                this.toast('Failed to validate discount', 'error');
                return null;
            }
        }
        
        // Fallback - check local discounts
        const discounts = JSON.parse(localStorage.getItem('gc_discounts') || '[]');
        const discount = discounts.find(d => d.code === code.toUpperCase() && d.active);
        if (discount) {
            let discountAmount = 0;
            if (discount.type === 'percent') {
                discountAmount = subtotal * (discount.value / 100);
            } else {
                discountAmount = discount.value;
            }
            return { ...discount, discountAmount: Math.min(discountAmount, subtotal) };
        }
        
        this.toast('Invalid discount code', 'error');
        return null;
    },
    
    // Get customer loyalty info
    async getCustomerLoyalty(customerId) {
        if (typeof GolfCoveAPI !== 'undefined') {
            try {
                const result = await GolfCoveAPI.loyalty.getBalance(customerId);
                if (result.success) {
                    return result.data;
                }
            } catch (err) {
                console.warn('Failed to get loyalty info:', err);
            }
        }
        return { points: 0, tier: 'bronze', lifetimePoints: 0 };
    }
};

// Profile dropdown functionality
const ProfileMenu = {
    isOpen: false,
    
    toggle() {
        this.isOpen = !this.isOpen;
        const menu = document.getElementById('profileDropdown');
        if (menu) {
            menu.classList.toggle('open', this.isOpen);
        }
    },
    
    close() {
        this.isOpen = false;
        const menu = document.getElementById('profileDropdown');
        if (menu) {
            menu.classList.remove('open');
        }
    },
    
    switchUser() {
        this.close();
        POS.lock();
    },
    
    async clockOut() {
        if (!POS.state.currentUser) return;
        
        // TODO: Re-enable when timeclock is moved to Firebase
        console.log('Timeclock disabled - clock out:', POS.state.currentUser.name);
        
        POS.toast(`${POS.state.currentUser.name} clocked out`, 'success');
        this.switchUser();
    },
    
    async startBreak() {
        if (!POS.state.currentUser) return;
        
        if (typeof GolfCoveAPI !== 'undefined') {
            try {
                await GolfCoveAPI.shifts.startBreak(POS.state.currentUser.id);
                POS.toast('Break started', 'success');
            } catch (err) {
                POS.toast('Failed to start break', 'error');
            }
        }
    },
    
    async endBreak() {
        if (!POS.state.currentUser) return;
        
        if (typeof GolfCoveAPI !== 'undefined') {
            try {
                await GolfCoveAPI.shifts.endBreak(POS.state.currentUser.id);
                POS.toast('Break ended', 'success');
            } catch (err) {
                POS.toast('Failed to end break', 'error');
            }
        }
    },
    
    openSettings() {
        this.close();
        if (typeof showSettings === 'function') showSettings();
    },
    
    openAdmin() {
        this.close();
        window.open('league-admin.html', '_blank');
    }
};

// Close profile menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-wrapper')) {
        ProfileMenu.close();
    }
});

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    POS.init();
});
