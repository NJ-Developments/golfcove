/**
 * Golf Cove - PIN Lock System
 * Employee authentication via PIN codes
 */

const GolfCovePIN = (function() {
    'use strict';
    
    // Configuration
    const config = {
        pinLength: 4,
        lockoutAttempts: 5,
        lockoutDuration: 300000, // 5 minutes
        sessionTimeout: 28800000 // 8 hours
    };
    
    // State
    let currentPin = '';
    let attempts = 0;
    let lockoutUntil = null;
    let currentEmployee = null;
    let sessionStart = null;
    
    // Default employees (can be loaded from localStorage)
    const defaultEmployees = [
        { id: 1, name: 'Manager', pin: '9999', role: 'manager' },
        { id: 2, name: 'Staff', pin: '9999', role: 'staff' }
    ];
    
    // Migrate old/insecure PINs to new secure default
    function migrateOldPins() {
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
            console.log('PIN System: Migrated insecure PINs to 9999');
        }
    }
    
    function getEmployees() {
        return JSON.parse(localStorage.getItem('gc_employees') || JSON.stringify(defaultEmployees));
    }
    
    function saveEmployees(employees) {
        localStorage.setItem('gc_employees', JSON.stringify(employees));
    }
    
    // Initialize PIN lock screen
    function init(onSuccess) {
        // Migrate old insecure PINs first
        migrateOldPins();
        
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
    
    function showPinScreen(onSuccess) {
        // Create overlay if not exists
        let overlay = document.getElementById('pinOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'pinOverlay';
            overlay.className = 'pin-overlay';
            overlay.innerHTML = `
                <div class="pin-container">
                    <div style="margin-bottom:20px;">
                        <i class="fas fa-lock" style="font-size:48px;color:#4a90a4;"></i>
                    </div>
                    <h2 style="margin-bottom:10px;">Golf Cove POS</h2>
                    <p style="color:#888;font-size:14px;margin-bottom:20px;">Enter your PIN to continue</p>
                    <div class="pin-display" id="pinDisplay">____</div>
                    <div id="pinError" style="color:#e74c3c;font-size:12px;height:20px;margin-bottom:10px;"></div>
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
                        <button class="pin-key" data-key="clear" style="font-size:14px;">Clear</button>
                        <button class="pin-key" data-key="0">0</button>
                        <button class="pin-key" data-key="back"><i class="fas fa-backspace"></i></button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            
            // Bind keypad events
            overlay.querySelectorAll('.pin-key').forEach(key => {
                key.addEventListener('click', () => handleKeyPress(key.dataset.key, onSuccess));
            });
            
            // Keyboard support
            document.addEventListener('keydown', (e) => {
                if (!overlay.style.display || overlay.style.display !== 'none') {
                    if (e.key >= '0' && e.key <= '9') {
                        handleKeyPress(e.key, onSuccess);
                    } else if (e.key === 'Backspace') {
                        handleKeyPress('back', onSuccess);
                    } else if (e.key === 'Escape') {
                        handleKeyPress('clear', onSuccess);
                    }
                }
            });
        }
        
        overlay.style.display = 'flex';
        currentPin = '';
        updatePinDisplay();
    }
    
    function handleKeyPress(key, onSuccess) {
        // Check lockout
        if (lockoutUntil && Date.now() < lockoutUntil) {
            const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
            document.getElementById('pinError').textContent = `Locked out. Try again in ${remaining}s`;
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
        
        // Check PIN when complete
        if (currentPin.length === config.pinLength) {
            validatePin(onSuccess);
        }
    }
    
    function updatePinDisplay() {
        const display = document.getElementById('pinDisplay');
        if (!display) return;
        
        let displayText = '';
        for (let i = 0; i < config.pinLength; i++) {
            displayText += i < currentPin.length ? '●' : '_';
        }
        display.textContent = displayText;
    }
    
    function validatePin(onSuccess) {
        const employees = getEmployees();
        const employee = employees.find(e => e.pin === currentPin);
        
        if (employee) {
            // Success
            currentEmployee = employee;
            sessionStart = Date.now();
            attempts = 0;
            
            // Save session
            localStorage.setItem('gc_session', JSON.stringify({
                employee: employee,
                start: sessionStart
            }));
            
            // Hide overlay
            document.getElementById('pinOverlay').style.display = 'none';
            
            if (onSuccess) onSuccess(employee);
        } else {
            // Failed
            attempts++;
            document.getElementById('pinError').textContent = `Invalid PIN (${attempts}/${config.lockoutAttempts})`;
            currentPin = '';
            updatePinDisplay();
            
            // Shake animation
            const container = document.querySelector('.pin-container');
            container.style.animation = 'shake 0.5s';
            setTimeout(() => container.style.animation = '', 500);
            
            // Lockout check
            if (attempts >= config.lockoutAttempts) {
                lockoutUntil = Date.now() + config.lockoutDuration;
                document.getElementById('pinError').textContent = `Too many attempts. Locked for 5 minutes.`;
            }
        }
    }
    
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
        return currentEmployee && currentEmployee.role === 'manager';
    }
    
    function addEmployee(name, pin, role = 'staff') {
        const employees = getEmployees();
        const newEmployee = {
            id: Date.now(),
            name,
            pin,
            role
        };
        employees.push(newEmployee);
        saveEmployees(employees);
        return newEmployee;
    }
    
    function updateEmployee(id, updates) {
        const employees = getEmployees();
        const index = employees.findIndex(e => e.id === id);
        if (index !== -1) {
            employees[index] = { ...employees[index], ...updates };
            saveEmployees(employees);
            return employees[index];
        }
        return null;
    }
    
    function deleteEmployee(id) {
        const employees = getEmployees();
        const filtered = employees.filter(e => e.id !== id);
        saveEmployees(filtered);
    }
    
    // Add shake animation CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
        }
    `;
    document.head.appendChild(style);
    
    // Public API
    return {
        init,
        lock,
        getCurrentEmployee,
        isManager,
        getEmployees,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        showPinScreen
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCovePIN;
}
