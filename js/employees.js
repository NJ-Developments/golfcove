/**
 * Golf Cove - Employee Management System
 * Manages employee records, schedules, and permissions
 */

const GolfCoveEmployees = (function() {
    'use strict';
    
    const STORAGE_KEY = 'gc_employees';
    const SHIFTS_KEY = 'gc_shifts';
    const TIMECLOCK_KEY = 'gc_timeclock';
    
    // Permission levels
    const ROLES = {
        admin: {
            name: 'Administrator',
            level: 100,
            permissions: ['all']
        },
        manager: {
            name: 'Manager',
            level: 80,
            permissions: ['pos', 'bookings', 'reports', 'refunds', 'discounts', 'employees', 'inventory', 'customers']
        },
        supervisor: {
            name: 'Supervisor',
            level: 60,
            permissions: ['pos', 'bookings', 'reports', 'refunds', 'discounts']
        },
        staff: {
            name: 'Staff',
            level: 40,
            permissions: ['pos', 'bookings']
        },
        cashier: {
            name: 'Cashier',
            level: 20,
            permissions: ['pos']
        }
    };
    
    // ============ DATA ACCESS ============
    function getEmployees() {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }
    
    function saveEmployees(employees) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(employees));
    }
    
    function getShifts() {
        return JSON.parse(localStorage.getItem(SHIFTS_KEY) || '[]');
    }
    
    function saveShifts(shifts) {
        localStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts));
    }
    
    function getTimeclock() {
        return JSON.parse(localStorage.getItem(TIMECLOCK_KEY) || '[]');
    }
    
    function saveTimeclock(records) {
        localStorage.setItem(TIMECLOCK_KEY, JSON.stringify(records));
    }
    
    // ============ EMPLOYEE CRUD ============
    function create(data) {
        const employees = getEmployees();
        
        // Check for duplicate PIN
        if (data.pin && employees.some(e => e.pin === data.pin && e.isActive)) {
            throw new Error('PIN already in use');
        }
        
        const employee = {
            id: 'EMP-' + Date.now().toString(36).toUpperCase(),
            firstName: data.firstName,
            lastName: data.lastName,
            displayName: data.displayName || `${data.firstName} ${data.lastName}`,
            email: data.email || '',
            phone: data.phone || '',
            pin: data.pin || generatePIN(),
            role: data.role || 'staff',
            hourlyRate: data.hourlyRate || 0,
            hireDate: data.hireDate || new Date().toISOString().split('T')[0],
            emergencyContact: data.emergencyContact || '',
            emergencyPhone: data.emergencyPhone || '',
            notes: data.notes || '',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        employees.push(employee);
        saveEmployees(employees);
        
        return employee;
    }
    
    function generatePIN() {
        const employees = getEmployees();
        let pin;
        do {
            pin = Math.floor(1000 + Math.random() * 9000).toString();
        } while (employees.some(e => e.pin === pin));
        return pin;
    }
    
    function update(id, updates) {
        const employees = getEmployees();
        const index = employees.findIndex(e => e.id === id);
        
        if (index === -1) return null;
        
        // Check for duplicate PIN if changing
        if (updates.pin && updates.pin !== employees[index].pin) {
            if (employees.some(e => e.pin === updates.pin && e.isActive && e.id !== id)) {
                throw new Error('PIN already in use');
            }
        }
        
        employees[index] = {
            ...employees[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        saveEmployees(employees);
        return employees[index];
    }
    
    function get(id) {
        return getEmployees().find(e => e.id === id);
    }
    
    function getByPIN(pin) {
        return getEmployees().find(e => e.pin === pin && e.isActive);
    }
    
    function getAll() {
        return getEmployees().filter(e => e.isActive);
    }
    
    function deactivate(id) {
        return update(id, { isActive: false });
    }
    
    function reactivate(id) {
        return update(id, { isActive: true });
    }
    
    function resetPIN(id) {
        const newPIN = generatePIN();
        update(id, { pin: newPIN });
        return newPIN;
    }
    
    // ============ PERMISSIONS ============
    function getRole(roleName) {
        return ROLES[roleName] || ROLES.staff;
    }
    
    function hasPermission(employeeId, permission) {
        const employee = get(employeeId);
        if (!employee) return false;
        
        const role = getRole(employee.role);
        return role.permissions.includes('all') || role.permissions.includes(permission);
    }
    
    function canPerform(employeeId, action) {
        const permissionMap = {
            'process-refund': 'refunds',
            'apply-discount': 'discounts',
            'view-reports': 'reports',
            'manage-employees': 'employees',
            'manage-inventory': 'inventory',
            'manage-customers': 'customers',
            'process-sale': 'pos',
            'manage-bookings': 'bookings'
        };
        
        const permission = permissionMap[action] || action;
        return hasPermission(employeeId, permission);
    }
    
    function isManager(employeeId) {
        const employee = get(employeeId);
        if (!employee) return false;
        
        const role = getRole(employee.role);
        return role.level >= 60;
    }
    
    function isAdmin(employeeId) {
        const employee = get(employeeId);
        if (!employee) return false;
        return employee.role === 'admin';
    }
    
    // ============ TIME CLOCK ============
    function clockIn(employeeId) {
        const records = getTimeclock();
        const employee = get(employeeId);
        
        if (!employee) throw new Error('Employee not found');
        
        // Check if already clocked in
        const openShift = records.find(r => 
            r.employeeId === employeeId && !r.clockOut
        );
        
        if (openShift) {
            throw new Error('Already clocked in');
        }
        
        const record = {
            id: 'TC-' + Date.now().toString(36).toUpperCase(),
            employeeId,
            employeeName: employee.displayName,
            clockIn: new Date().toISOString(),
            clockOut: null,
            duration: null,
            notes: '',
            status: 'active'
        };
        
        records.push(record);
        saveTimeclock(records);
        
        return record;
    }
    
    function clockOut(employeeId, notes = '') {
        const records = getTimeclock();
        const index = records.findIndex(r => 
            r.employeeId === employeeId && !r.clockOut
        );
        
        if (index === -1) {
            throw new Error('Not clocked in');
        }
        
        const clockOut = new Date();
        const clockIn = new Date(records[index].clockIn);
        const duration = (clockOut - clockIn) / (1000 * 60 * 60); // Hours
        
        records[index] = {
            ...records[index],
            clockOut: clockOut.toISOString(),
            duration: duration.toFixed(2),
            notes,
            status: 'completed'
        };
        
        saveTimeclock(records);
        return records[index];
    }
    
    function getCurrentShift(employeeId) {
        return getTimeclock().find(r => 
            r.employeeId === employeeId && !r.clockOut
        );
    }
    
    function getTimeclockHistory(employeeId, days = 14) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        
        return getTimeclock().filter(r => 
            r.employeeId === employeeId && new Date(r.clockIn) >= cutoff
        ).sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
    }
    
    function getClockedInEmployees() {
        return getTimeclock()
            .filter(r => !r.clockOut)
            .map(r => ({
                ...r,
                employee: get(r.employeeId)
            }));
    }
    
    // ============ SCHEDULING ============
    function createShift(data) {
        const shifts = getShifts();
        
        const shift = {
            id: 'SH-' + Date.now().toString(36).toUpperCase(),
            employeeId: data.employeeId,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            position: data.position || 'general',
            notes: data.notes || '',
            status: 'scheduled', // scheduled, confirmed, completed, cancelled
            createdAt: new Date().toISOString()
        };
        
        shifts.push(shift);
        saveShifts(shifts);
        
        return shift;
    }
    
    function updateShift(id, updates) {
        const shifts = getShifts();
        const index = shifts.findIndex(s => s.id === id);
        
        if (index === -1) return null;
        
        shifts[index] = { ...shifts[index], ...updates };
        saveShifts(shifts);
        
        return shifts[index];
    }
    
    function deleteShift(id) {
        const shifts = getShifts();
        const index = shifts.findIndex(s => s.id === id);
        
        if (index === -1) return false;
        
        shifts.splice(index, 1);
        saveShifts(shifts);
        
        return true;
    }
    
    function getShiftsForDate(date) {
        return getShifts().filter(s => s.date === date);
    }
    
    function getShiftsForEmployee(employeeId, startDate = null, endDate = null) {
        let shifts = getShifts().filter(s => s.employeeId === employeeId);
        
        if (startDate) {
            shifts = shifts.filter(s => s.date >= startDate);
        }
        if (endDate) {
            shifts = shifts.filter(s => s.date <= endDate);
        }
        
        return shifts.sort((a, b) => a.date.localeCompare(b.date));
    }
    
    function getWeekSchedule(startDate) {
        const schedule = {};
        const start = new Date(startDate);
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(start);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            
            schedule[dateStr] = {
                dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
                shifts: getShiftsForDate(dateStr).map(s => ({
                    ...s,
                    employee: get(s.employeeId)
                }))
            };
        }
        
        return schedule;
    }
    
    // ============ REPORTS ============
    function getPayrollReport(startDate, endDate) {
        const records = getTimeclock().filter(r => 
            r.clockIn >= startDate && r.clockIn <= endDate && r.status === 'completed'
        );
        
        const byEmployee = {};
        records.forEach(r => {
            if (!byEmployee[r.employeeId]) {
                const emp = get(r.employeeId);
                byEmployee[r.employeeId] = {
                    employee: emp,
                    totalHours: 0,
                    shifts: 0,
                    regularHours: 0,
                    overtimeHours: 0,
                    grossPay: 0
                };
            }
            
            const hours = parseFloat(r.duration) || 0;
            byEmployee[r.employeeId].totalHours += hours;
            byEmployee[r.employeeId].shifts++;
        });
        
        // Calculate pay
        Object.values(byEmployee).forEach(data => {
            const rate = data.employee?.hourlyRate || 0;
            
            // Overtime after 40 hours/week
            if (data.totalHours > 40) {
                data.regularHours = 40;
                data.overtimeHours = data.totalHours - 40;
                data.grossPay = (40 * rate) + (data.overtimeHours * rate * 1.5);
            } else {
                data.regularHours = data.totalHours;
                data.overtimeHours = 0;
                data.grossPay = data.totalHours * rate;
            }
            
            data.totalHours = data.totalHours.toFixed(2);
            data.regularHours = data.regularHours.toFixed(2);
            data.overtimeHours = data.overtimeHours.toFixed(2);
            data.grossPay = data.grossPay.toFixed(2);
        });
        
        return {
            period: { startDate, endDate },
            employees: Object.values(byEmployee),
            totals: {
                totalHours: Object.values(byEmployee).reduce((sum, d) => sum + parseFloat(d.totalHours), 0).toFixed(2),
                totalPay: Object.values(byEmployee).reduce((sum, d) => sum + parseFloat(d.grossPay), 0).toFixed(2)
            }
        };
    }
    
    function getPerformanceReport(employeeId, days = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        
        const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
        const empTransactions = transactions.filter(t => 
            t.employeeId === employeeId && new Date(t.date) >= cutoff
        );
        
        return {
            employee: get(employeeId),
            period: `Last ${days} days`,
            sales: {
                count: empTransactions.length,
                total: empTransactions.reduce((sum, t) => sum + t.amount, 0),
                average: empTransactions.length > 0 
                    ? empTransactions.reduce((sum, t) => sum + t.amount, 0) / empTransactions.length 
                    : 0
            },
            hoursWorked: getTimeclockHistory(employeeId, days)
                .reduce((sum, r) => sum + (parseFloat(r.duration) || 0), 0)
        };
    }
    
    // ============ SEARCH ============
    function search(query) {
        const q = query.toLowerCase();
        return getAll().filter(e => 
            e.firstName.toLowerCase().includes(q) ||
            e.lastName.toLowerCase().includes(q) ||
            e.displayName.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q)
        );
    }
    
    // ============ SEED DATA ============
    function seedDefaultEmployees() {
        const existing = getEmployees();
        if (existing.length > 0) return existing;
        
        const defaults = [
            { firstName: 'Admin', lastName: 'User', pin: '9999', role: 'admin', hourlyRate: 0 },
            { firstName: 'Manager', lastName: 'One', pin: '9999', role: 'manager', hourlyRate: 25 },
            { firstName: 'Staff', lastName: 'Member', pin: '9999', role: 'staff', hourlyRate: 15 }
        ];
        
        return defaults.map(emp => create(emp));
    }
    
    // Public API
    return {
        // CRUD
        create,
        update,
        get,
        getByPIN,
        getAll,
        deactivate,
        reactivate,
        resetPIN,
        search,
        
        // Permissions
        getRole,
        hasPermission,
        canPerform,
        isManager,
        isAdmin,
        ROLES,
        
        // Time clock
        clockIn,
        clockOut,
        getCurrentShift,
        getTimeclockHistory,
        getClockedInEmployees,
        
        // Scheduling
        createShift,
        updateShift,
        deleteShift,
        getShiftsForDate,
        getShiftsForEmployee,
        getWeekSchedule,
        
        // Reports
        getPayrollReport,
        getPerformanceReport,
        
        // Setup
        seedDefaultEmployees
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveEmployees;
}
