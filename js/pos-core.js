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
        activeView: 'sales' // 'sales', 'teesheet', 'tabs'
    },
    
    // Configuration
    config: {
        taxRate: parseFloat(localStorage.getItem('gc_tax_rate')) || 6.35,
        businessName: localStorage.getItem('gc_business_name') || 'Golf Cove',
        registerId: localStorage.getItem('gc_register_id') || 'POS-1'
    },
    
    // Employees (loaded from localStorage or defaults)
    employees: JSON.parse(localStorage.getItem('gc_employees') || 'null') || [
        { name: 'EJ Sattelberger', pin: '9999', role: 'manager' },
        { name: 'Manager', pin: '9999', role: 'manager' },
        { name: 'Staff', pin: '9999', role: 'server' }
    ],
    
    // Migrate old/insecure PINs to new secure default
    migrateOldPins() {
        const insecurePins = ['1234', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888'];
        let employees = JSON.parse(localStorage.getItem('gc_employees') || '[]');
        let updated = false;
        
        employees.forEach(emp => {
            if (insecurePins.includes(emp.pin)) {
                emp.pin = '9999';
                updated = true;
            }
        });
        
        if (updated) {
            localStorage.setItem('gc_employees', JSON.stringify(employees));
            this.employees = employees;
            console.log('Migrated insecure PINs to 9999');
        }
    },
    
    // Initialize
    init() {
        // Migrate old insecure PINs first
        this.migrateOldPins();
        
        // Save default employees if not exist
        if (!localStorage.getItem('gc_employees')) {
            localStorage.setItem('gc_employees', JSON.stringify(this.employees));
        }
        
        // Reload employees after migration
        this.employees = JSON.parse(localStorage.getItem('gc_employees') || JSON.stringify(this.employees));
        
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
    
    selectEmployee(name) {
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
    
    // Verify PIN
    verifyPin() {
        const employee = this.employees.find(e => e.name === this.selectedEmployee);
        
        if (employee && employee.pin === this.currentPin) {
            this.unlock(employee);
        } else {
            this.showPinError();
        }
    },
    
    // Show PIN error
    showPinError() {
        const pinPad = document.querySelector('.pin-pad');
        if (pinPad) {
            pinPad.classList.add('shake');
            setTimeout(() => pinPad.classList.remove('shake'), 500);
        }
        this.currentPin = '';
        this.updatePinDots();
    },
    
    // Unlock POS
    unlock(employee) {
        this.state.isLocked = false;
        this.state.currentUser = employee;
        
        // Update UI
        document.getElementById('lockScreen').style.display = 'none';
        document.getElementById('currentUserName').textContent = employee.name;
        
        // Log clock-in
        this.logClockIn(employee.name);
        
        this.toast(`Welcome, ${employee.name}!`, 'success');
    },
    
    // Lock POS
    lock() {
        this.showLockScreen();
        this.backToEmployees();
    },
    
    // Log clock in
    logClockIn(name) {
        const clockIns = JSON.parse(localStorage.getItem('gc_clock_ins') || '[]');
        clockIns.push({
            employee: name,
            type: 'in',
            time: new Date().toISOString()
        });
        localStorage.setItem('gc_clock_ins', JSON.stringify(clockIns));
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
    
    clockOut() {
        if (!POS.state.currentUser) return;
        
        const clockIns = JSON.parse(localStorage.getItem('gc_clock_ins') || '[]');
        clockIns.push({
            employee: POS.state.currentUser.name,
            type: 'out',
            time: new Date().toISOString()
        });
        localStorage.setItem('gc_clock_ins', JSON.stringify(clockIns));
        
        POS.toast(`${POS.state.currentUser.name} clocked out`, 'success');
        this.switchUser();
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
