/**
 * Golf Cove - PIN Lock System
 * Employee authentication via PIN codes
 * Now with Firebase sync for global PIN management
 */

const GolfCovePIN = (function() {
    'use strict';
    
    // Configuration
    const config = {
        pinLength: 4,
        lockoutAttempts: 5,
        lockoutDuration: 300000, // 5 minutes
        sessionTimeout: 28800000, // 8 hours
        useFirebase: true // Enable Firebase sync
    };
    
    // State
    let currentPin = '';
    let attempts = 0;
    let lockoutUntil = null;
    let currentEmployee = null;
    let sessionStart = null;
    let onSuccessCallback = null;
    
    // Default employees (fallback if no data in localStorage or Firebase)
    const defaultEmployees = [
        { id: 'EMP-DEFAULT-1', name: 'Manager', pin: '9999', role: 'manager', isActive: true },
        { id: 'EMP-DEFAULT-2', name: 'Staff', pin: '8888', role: 'staff', isActive: true }
    ];
    
    // ============ FIREBASE INTEGRATION ============
    
    /**
     * Validate PIN against Firebase (with local fallback)
     */
    async function validatePinAsync(pin) {
        // Check if Firebase sync module is available
        if (config.useFirebase && typeof GolfCoveFirebase !== 'undefined') {
            try {
                const employee = await GolfCoveFirebase.validatePIN(pin);
                return employee;
            } catch (error) {
                console.warn('Firebase PIN validation failed, using local:', error);
            }
        }
        
        // Fallback to local validation
        const employees = getEmployees();
        return employees.find(e => e.pin === pin && e.isActive !== false) || null;
    }
    
    /**
     * Sync employees to Firebase
     */
    async function syncToFirebase() {
        if (config.useFirebase && typeof GolfCoveFirebase !== 'undefined') {
            try {
                const employees = getEmployees();
                await GolfCoveFirebase.syncEmployees(employees);
                console.log('PIN System: Synced employees to Firebase');
            } catch (error) {
                console.error('PIN System: Firebase sync failed:', error);
            }
        }
    }
    
    /**
     * Pull latest employees from Firebase
     */
    async function pullFromFirebase() {
        if (config.useFirebase && typeof GolfCoveFirebase !== 'undefined') {
            try {
                const employees = await GolfCoveFirebase.getEmployees();
                if (employees && employees.length > 0) {
                    saveEmployees(employees);
                    console.log('PIN System: Pulled employees from Firebase');
                }
            } catch (error) {
                console.error('PIN System: Firebase pull failed:', error);
            }
        }
    }
    
    // ============ LOCAL STORAGE ============
    
    function getEmployees() {
        try {
            const data = localStorage.getItem('gc_employees');
            if (data) {
                const employees = JSON.parse(data);
                // Ensure we have valid employees
                if (Array.isArray(employees) && employees.length > 0) {
                    return employees.filter(e => e.isActive !== false);
                }
            }
        } catch (e) {
            console.error('Error reading employees:', e);
        }
        
        // Initialize with defaults if empty
        saveEmployees(defaultEmployees);
        return defaultEmployees;
    }
    
    function saveEmployees(employees) {
        localStorage.setItem('gc_employees', JSON.stringify(employees));
    }
    
    // ============ MIGRATION ============
    
    function migrateOldPins() {
        const insecurePins = ['1234', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777'];
        let employees = JSON.parse(localStorage.getItem('gc_employees') || '[]');
        let updated = false;
        
        employees.forEach((emp, index) => {
            // Ensure each employee has required fields
            if (!emp.id) {
                emp.id = 'EMP-MIGRATED-' + index;
                updated = true;
            }
            if (emp.isActive === undefined) {
                emp.isActive = true;
                updated = true;
            }
            if (insecurePins.includes(emp.pin)) {
                // Generate a new random PIN
                emp.pin = generateSecurePIN(employees);
                updated = true;
                console.log(`Migrated insecure PIN for ${emp.name} to ${emp.pin}`);
            }
        });
        
        if (updated) {
            localStorage.setItem('gc_employees', JSON.stringify(employees));
            console.log('PIN System: Migrated insecure PINs');
            // Sync migrated data to Firebase
            syncToFirebase();
        }
    }
    
    function generateSecurePIN(existingEmployees) {
        const insecure = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1010', '2020'];
        const existing = new Set(existingEmployees.map(e => e.pin));
        
        let pin;
        let attempts = 0;
        
        do {
            pin = Math.floor(1000 + Math.random() * 9000).toString();
            attempts++;
        } while ((existing.has(pin) || insecure.includes(pin)) && attempts < 100);
        
        return pin;
    }
    
    // ============ INITIALIZATION ============
    
    async function init(onSuccess) {
        onSuccessCallback = onSuccess;
        
        // Migrate old pins first
        migrateOldPins();
        
        // Try to pull latest from Firebase
        await pullFromFirebase();
        
        // Check if already authenticated
        const session = JSON.parse(localStorage.getItem('gc_session') || 'null');
        if (session && session.employee && (Date.now() - session.start) < config.sessionTimeout) {
            currentEmployee = session.employee;
            sessionStart = session.start;
            if (onSuccess) onSuccess(currentEmployee);
            return;
        }
        
        // Show PIN screen
        showPinScreen(onSuccess);
    }
    
    // ============ PIN SCREEN UI ============
    
    function showPinScreen(onSuccess) {
        onSuccessCallback = onSuccess || onSuccessCallback;
        
        // Create overlay if not exists
        let overlay = document.getElementById('pinOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'pinOverlay';
            overlay.className = 'pin-overlay';
            overlay.innerHTML = createPinScreenHTML();
            document.body.appendChild(overlay);
            
            // Add styles
            addPinStyles();
            
            // Bind keypad events
            overlay.querySelectorAll('.pin-key').forEach(key => {
                key.addEventListener('click', () => handleKeyPress(key.dataset.key));
            });
            
            // Keyboard support
            document.addEventListener('keydown', handleKeyboardInput);
        }
        
        overlay.style.display = 'flex';
        currentPin = '';
        updatePinDisplay();
        clearError();
    }
    
    function createPinScreenHTML() {
        return `
            <div class="pin-container">
                <div class="pin-logo">
                    <i class="fas fa-golf-ball-tee"></i>
                </div>
                <h2 class="pin-title">Golf Cove POS</h2>
                <p class="pin-subtitle">Enter your PIN to continue</p>
                
                <div class="pin-display" id="pinDisplay">
                    <span class="pin-digit">_</span>
                    <span class="pin-digit">_</span>
                    <span class="pin-digit">_</span>
                    <span class="pin-digit">_</span>
                </div>
                
                <div class="pin-error" id="pinError"></div>
                
                <div class="pin-keypad" id="pinKeypad">
                    <button class="pin-key" data-key="1">1</button>
                    <button class="pin-key" data-key="2">2</button>
                    <button class="pin-key" data-key="3">3</button>
                    <button class="pin-key" data-key="4">4</button>
                    <button class="pin-key" data-key="5">5</button>
                    <button class="pin-key" data-key="6">6</button>
                    <button class="pin-key" data-key="7">7</button>
                    <button class="pin-key" data-key="8">8</button>
                    <button class="pin-key" data-key="9">9</button>
                    <button class="pin-key pin-key-clear" data-key="clear">Clear</button>
                    <button class="pin-key" data-key="0">0</button>
                    <button class="pin-key pin-key-back" data-key="back">
                        <i class="fas fa-backspace"></i>
                    </button>
                </div>
                
                <div class="pin-footer">
                    <span class="sync-status" id="syncStatus">
                        <i class="fas fa-cloud"></i> <span id="syncStatusText">Online</span>
                    </span>
                </div>
            </div>
        `;
    }
    
    function addPinStyles() {
        if (document.getElementById('pin-system-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'pin-system-styles';
        style.textContent = `
            .pin-overlay {
                position: fixed;
                inset: 0;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            
            .pin-container {
                background: #fff;
                padding: 40px;
                border-radius: 20px;
                text-align: center;
                box-shadow: 0 25px 80px rgba(0,0,0,0.4);
                max-width: 360px;
                width: 90%;
            }
            
            .pin-logo {
                font-size: 48px;
                color: #4a90a4;
                margin-bottom: 15px;
            }
            
            .pin-title {
                font-size: 24px;
                font-weight: 700;
                color: #333;
                margin-bottom: 5px;
            }
            
            .pin-subtitle {
                color: #888;
                font-size: 14px;
                margin-bottom: 25px;
            }
            
            .pin-display {
                display: flex;
                justify-content: center;
                gap: 12px;
                margin-bottom: 10px;
            }
            
            .pin-digit {
                width: 50px;
                height: 60px;
                border: 2px solid #e0e0e0;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 28px;
                font-weight: 700;
                color: #333;
                transition: all 0.15s ease;
            }
            
            .pin-digit.filled {
                background: #4a90a4;
                border-color: #4a90a4;
                color: #fff;
            }
            
            .pin-error {
                color: #e74c3c;
                font-size: 13px;
                min-height: 24px;
                margin-bottom: 15px;
            }
            
            .pin-keypad {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
                max-width: 280px;
                margin: 0 auto;
            }
            
            .pin-key {
                width: 80px;
                height: 60px;
                border: none;
                background: #f5f5f5;
                border-radius: 12px;
                font-size: 24px;
                font-weight: 600;
                color: #333;
                cursor: pointer;
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .pin-key:hover {
                background: #e8e8e8;
            }
            
            .pin-key:active {
                background: #4a90a4;
                color: #fff;
                transform: scale(0.95);
            }
            
            .pin-key-clear, .pin-key-back {
                font-size: 14px;
                color: #666;
            }
            
            .pin-footer {
                margin-top: 20px;
                font-size: 12px;
                color: #aaa;
            }
            
            .sync-status {
                display: inline-flex;
                align-items: center;
                gap: 5px;
            }
            
            .sync-status.online { color: #27ae60; }
            .sync-status.offline { color: #e74c3c; }
            .sync-status.syncing { color: #f39c12; }
            
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                20%, 40%, 60%, 80% { transform: translateX(5px); }
            }
            
            .pin-container.shake {
                animation: shake 0.4s ease;
            }
        `;
        document.head.appendChild(style);
    }
    
    function handleKeyboardInput(e) {
        const overlay = document.getElementById('pinOverlay');
        if (!overlay || overlay.style.display === 'none') return;
        
        if (e.key >= '0' && e.key <= '9') {
            e.preventDefault();
            handleKeyPress(e.key);
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            handleKeyPress('back');
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleKeyPress('clear');
        }
    }
    
    // ============ PIN INPUT HANDLING ============
    
    function handleKeyPress(key) {
        // Check lockout
        if (lockoutUntil && Date.now() < lockoutUntil) {
            const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
            showError(`Locked out. Try again in ${remaining}s`);
            return;
        }
        
        if (key === 'clear') {
            currentPin = '';
        } else if (key === 'back') {
            currentPin = currentPin.slice(0, -1);
        } else if (currentPin.length < config.pinLength) {
            currentPin += key;
        }
        
        updatePinDisplay();
        clearError();
        
        // Check PIN when complete
        if (currentPin.length === config.pinLength) {
            validatePin();
        }
    }
    
    function updatePinDisplay() {
        const digits = document.querySelectorAll('.pin-digit');
        digits.forEach((digit, i) => {
            if (i < currentPin.length) {
                digit.textContent = '●';
                digit.classList.add('filled');
            } else {
                digit.textContent = '_';
                digit.classList.remove('filled');
            }
        });
    }
    
    // ============ PIN VALIDATION ============
    
    async function validatePin() {
        // Show loading state
        updateSyncStatus('syncing', 'Validating...');
        
        // Validate against Firebase (or local fallback)
        const employee = await validatePinAsync(currentPin);
        
        if (employee) {
            handleSuccess(employee);
        } else {
            handleFailure();
        }
        
        // Reset sync status
        updateSyncStatus(navigator.onLine ? 'online' : 'offline');
    }
    
    function handleSuccess(employee) {
        currentEmployee = employee;
        sessionStart = Date.now();
        attempts = 0;
        lockoutUntil = null;
        
        // Save session
        localStorage.setItem('gc_session', JSON.stringify({
            employee: employee,
            start: sessionStart
        }));
        
        // Hide overlay
        document.getElementById('pinOverlay').style.display = 'none';
        
        // Callback
        if (onSuccessCallback) {
            onSuccessCallback(employee);
        }
    }
    
    function handleFailure() {
        attempts++;
        showError(`Invalid PIN (${attempts}/${config.lockoutAttempts})`);
        currentPin = '';
        updatePinDisplay();
        
        // Shake animation
        const container = document.querySelector('.pin-container');
        container.classList.add('shake');
        setTimeout(() => container.classList.remove('shake'), 400);
        
        // Lockout check
        if (attempts >= config.lockoutAttempts) {
            lockoutUntil = Date.now() + config.lockoutDuration;
            showError(`Too many attempts. Locked for 5 minutes.`);
        }
    }
    
    function showError(message) {
        const errorEl = document.getElementById('pinError');
        if (errorEl) errorEl.textContent = message;
    }
    
    function clearError() {
        const errorEl = document.getElementById('pinError');
        if (errorEl) errorEl.textContent = '';
    }
    
    function updateSyncStatus(status, text) {
        const statusEl = document.getElementById('syncStatus');
        const textEl = document.getElementById('syncStatusText');
        
        if (statusEl) {
            statusEl.className = 'sync-status ' + status;
        }
        
        if (textEl) {
            textEl.textContent = text || (status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Syncing...');
        }
    }
    
    // ============ SESSION MANAGEMENT ============
    
    function lock() {
        localStorage.removeItem('gc_session');
        currentEmployee = null;
        sessionStart = null;
        showPinScreen();
    }
    
    function getCurrentEmployee() {
        return currentEmployee;
    }
    
    function isManager() {
        return currentEmployee && (currentEmployee.role === 'manager' || currentEmployee.role === 'admin');
    }
    
    function isAdmin() {
        return currentEmployee && currentEmployee.role === 'admin';
    }
    
    // ============ EMPLOYEE MANAGEMENT ============
    
    async function addEmployee(name, pin, role = 'staff') {
        const employees = getEmployees();
        
        // Check for duplicate PIN
        if (employees.some(e => e.pin === pin && e.isActive !== false)) {
            throw new Error('PIN already in use');
        }
        
        const newEmployee = {
            id: 'EMP-' + Date.now().toString(36).toUpperCase(),
            name,
            pin,
            role,
            isActive: true,
            createdAt: new Date().toISOString()
        };
        
        employees.push(newEmployee);
        saveEmployees(employees);
        
        // Sync to Firebase
        if (config.useFirebase && typeof GolfCoveFirebase !== 'undefined') {
            await GolfCoveFirebase.saveEmployee(newEmployee);
        }
        
        return newEmployee;
    }
    
    async function updateEmployee(id, updates) {
        const employees = JSON.parse(localStorage.getItem('gc_employees') || '[]');
        const index = employees.findIndex(e => e.id === id);
        
        if (index === -1) return null;
        
        // Check for duplicate PIN if changing
        if (updates.pin && updates.pin !== employees[index].pin) {
            if (employees.some(e => e.pin === updates.pin && e.isActive !== false && e.id !== id)) {
                throw new Error('PIN already in use');
            }
        }
        
        employees[index] = { 
            ...employees[index], 
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        saveEmployees(employees);
        
        // Sync to Firebase
        if (config.useFirebase && typeof GolfCoveFirebase !== 'undefined') {
            await GolfCoveFirebase.saveEmployee(employees[index]);
        }
        
        return employees[index];
    }
    
    async function deleteEmployee(id) {
        const employees = JSON.parse(localStorage.getItem('gc_employees') || '[]');
        const index = employees.findIndex(e => e.id === id);
        
        if (index !== -1) {
            employees[index].isActive = false;
            employees[index].deletedAt = new Date().toISOString();
            saveEmployees(employees);
            
            // Sync to Firebase
            if (config.useFirebase && typeof GolfCoveFirebase !== 'undefined') {
                await GolfCoveFirebase.deleteEmployee(id);
            }
        }
        
        return true;
    }
    
    function generatePIN() {
        const employees = getEmployees();
        return generateSecurePIN(employees);
    }
    
    // Public API
    return {
        init,
        lock,
        showPinScreen,
        getCurrentEmployee,
        isManager,
        isAdmin,
        getEmployees,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        generatePIN,
        syncToFirebase,
        pullFromFirebase
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCovePIN;
}
