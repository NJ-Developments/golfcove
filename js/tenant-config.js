/**
 * Multi-Tenant Configuration System
 * Enables SaaS deployment with per-tenant customization
 * 
 * Supports two venue types:
 * 1. SIMULATOR - Indoor golf simulator bays (Golf Cove, TopGolf, etc.)
 * 2. COURSE - Outdoor golf courses with tee times
 * 
 * Architecture:
 * - Each tenant has unique ID (e.g., "golfcove", "topgolf-nyc", "pebblebeach")
 * - Config loaded from Firebase: tenants/{tenantId}/config
 * - Falls back to default config if Firebase unavailable
 * - Caches config in localStorage for offline use
 * 
 * @version 2.0.0
 */

const TenantConfig = (function() {
    'use strict';
    
    // ============ VENUE TYPES ============
    const VENUE_TYPES = {
        SIMULATOR: 'simulator',  // Indoor bays with hourly booking
        COURSE: 'course'         // Outdoor course with tee times
    };
    
    // ============ DEFAULT CONFIG (Template for new tenants) ============
    const defaultConfig = {
        // Tenant identification
        tenant: {
            id: 'default',
            name: 'Bay Booking',
            logo: '/images/logo.png',
            venueType: VENUE_TYPES.SIMULATOR, // 'simulator' or 'course'
            theme: {
                primary: '#4a9eb4',
                secondary: '#27ae60',
                accent: '#f39c12'
            }
        },
        
        // Business information
        business: {
            name: 'Your Business Name',
            address: {
                street: '123 Main Street',
                city: 'Anytown',
                state: 'ST',
                zip: '00000',
                country: 'US'
            },
            phone: '(555) 555-5555',
            email: 'info@example.com',
            website: 'https://example.com',
            timezone: 'America/New_York'
        },
        
        // Tax & pricing defaults
        pricing: {
            taxRate: 0.0635,
            currency: 'USD',
            currencySymbol: '$',
            
            // Tip settings
            tipsEnabled: true,
            tipPresets: [15, 18, 20, 25],
            
            // Transaction limits
            minimumCardTransaction: 0.50,
            minimumGiftCard: 5,
            maximumGiftCard: 500
        },
        
        // Operating hours (24-hour format)
        hours: {
            default: { open: 9, close: 22 },
            byDay: {
                0: { open: 8, close: 22 },   // Sunday
                1: { open: 9, close: 22 },   // Monday
                2: { open: 9, close: 22 },   // Tuesday
                3: { open: 9, close: 22 },   // Wednesday
                4: { open: 9, close: 22 },   // Thursday
                5: { open: 9, close: 23 },   // Friday
                6: { open: 8, close: 23 }    // Saturday
            },
            holidays: { open: 10, close: 20 },
            closedDates: [] // Array of ISO date strings
        },
        
        // Peak pricing
        peak: {
            enabled: true,
            multiplier: 1.25,
            weekday: { start: 17, end: 21 },   // 5pm - 9pm
            weekend: { start: 10, end: 21 }    // 10am - 9pm
        },
        
        // Bay/Room configuration
        bays: [
            { 
                id: 'bay-1',
                type: 'standard',
                name: 'Bay 1',
                capacity: 4,
                pricing: { weekday: 45, weekend: 55 },
                color: '#3b82f6',
                amenities: ['simulator', 'trackman'],
                active: true
            },
            { 
                id: 'bay-2',
                type: 'standard',
                name: 'Bay 2',
                capacity: 4,
                pricing: { weekday: 45, weekend: 55 },
                color: '#10b981',
                amenities: ['simulator', 'trackman'],
                active: true
            },
            { 
                id: 'bay-3',
                type: 'premium',
                name: 'Bay 3',
                capacity: 6,
                pricing: { weekday: 65, weekend: 80 },
                color: '#f59e0b',
                amenities: ['simulator', 'trackman', 'lounge'],
                active: true
            }
        ],
        
        // ============ COURSE-SPECIFIC CONFIG (for venueType: 'course') ============
        course: {
            holes: 18,                  // 9 or 18
            par: 72,
            slope: 113,
            rating: 72.0,
            
            // Tee boxes available
            tees: [
                { id: 'black', name: 'Black', yards: 7200, color: '#000000' },
                { id: 'blue', name: 'Blue', yards: 6700, color: '#3b82f6' },
                { id: 'white', name: 'White', yards: 6200, color: '#ffffff' },
                { id: 'gold', name: 'Gold', yards: 5700, color: '#d4a017' },
                { id: 'red', name: 'Red', yards: 5200, color: '#ef4444' }
            ],
            
            // Tee time settings
            teeTimes: {
                interval: 10,           // minutes between tee times
                playersPerGroup: 4,     // max golfers per tee time
                firstTee: '06:30',      // first tee time (24hr)
                lastTee: '17:00',       // last tee time
                nineHoleAllowed: true,
                walkingAllowed: true,
                twilightStart: 15       // 3pm - twilight rates start
            },
            
            // Green fees (per player)
            greenFees: {
                weekday: { walking: 45, riding: 65 },
                weekend: { walking: 65, riding: 85 },
                twilight: { walking: 30, riding: 45 },
                nineHole: { walking: 25, riding: 35 }
            },
            
            // Cart settings
            carts: {
                included: false,        // cart included in green fee?
                available: 60,          // total carts available
                gpsEnabled: true
            }
        },
        
        // Booking settings (works for both simulators and courses)
        booking: {
            slotDuration: 30,           // minutes (simulators) or tee interval (courses)
            minDuration: 30,            // minutes (simulators only)
            maxDuration: 240,           // minutes (4 hours, simulators only)
            bufferTime: 0,              // minutes between bookings
            advanceBookingDays: 30,     // how far ahead can book
            sameDayBooking: true,       // allow same-day bookings
            
            // Guest count settings
            guests: {
                min: 0,                 // minimum guests (not including booker)
                max: 8,                 // maximum guests
                countBookerAsGuest: false
            },
            
            // Cancellation policy
            cancellation: {
                fullRefundHours: 24,
                partialRefundHours: 12,
                partialRefundPercent: 50,
                noRefundHours: 0
            },
            
            // Deposit settings
            deposit: {
                required: false,
                type: 'fixed',          // 'fixed' or 'percent'
                amount: 20,
                percentOfTotal: 25
            },
            
            // No-show handling
            noShowWindow: 15,           // minutes after start time
            noShowFee: 0,               // additional fee for no-shows
            
            // Waitlist
            waitlistEnabled: true,
            waitlistMaxPerSlot: 5
        },
        
        // Membership tiers (optional)
        memberships: {
            enabled: true,
            tiers: {
                basic: {
                    name: 'Basic',
                    discount: 0.10,
                    color: '#22c55e',
                    priorityBooking: false
                },
                premium: {
                    name: 'Premium',
                    discount: 0.15,
                    color: '#9b59b6',
                    priorityBooking: true
                },
                vip: {
                    name: 'VIP',
                    discount: 0.20,
                    color: '#d4a017',
                    priorityBooking: true
                }
            }
        },
        
        // Feature flags
        features: {
            pos: true,
            booking: true,
            memberships: true,
            giftCards: true,
            leagues: false,
            lessons: false,
            inventory: true,
            reports: true,
            customerPortal: false,
            mobileApp: false
        },
        
        // Integrations
        integrations: {
            stripe: {
                enabled: true,
                terminalEnabled: false
            },
            firebase: {
                enabled: true,
                projectId: null  // Set per-tenant
            },
            email: {
                enabled: false,
                provider: null   // 'sendgrid', 'mailgun', etc.
            },
            sms: {
                enabled: false,
                provider: null   // 'twilio', etc.
            }
        }
    };
    
    // ============ STATE ============
    let currentTenantId = null;
    let config = null;
    let configLoaded = false;
    let configListeners = [];
    
    // ============ TENANT DETECTION ============
    /**
     * Detect tenant from URL or default
     * Supports: subdomain, path, or query param
     */
    function detectTenant() {
        const hostname = window.location.hostname;
        const pathname = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        
        // Check query param first (for development/testing)
        if (params.has('tenant')) {
            return params.get('tenant');
        }
        
        // Check subdomain (e.g., golfcove.baybooking.com)
        const parts = hostname.split('.');
        if (parts.length >= 3 && parts[0] !== 'www') {
            return parts[0];
        }
        
        // Check path (e.g., /t/golfcove/...)
        const pathMatch = pathname.match(/^\/t\/([^\/]+)/);
        if (pathMatch) {
            return pathMatch[1];
        }
        
        // Check localStorage for last tenant
        const savedTenant = localStorage.getItem('bb_tenant_id');
        if (savedTenant) {
            return savedTenant;
        }
        
        // Default to golfcove for now (will be 'demo' in production)
        return 'golfcove';
    }
    
    // ============ CONFIG LOADING ============
    /**
     * Load tenant configuration from Firebase
     */
    async function loadFromFirebase(tenantId) {
        try {
            // Use Firebase REST API or SDK
            const FIREBASE_URL = 'https://golfcove-default-rtdb.firebaseio.com';
            const response = await fetch(`${FIREBASE_URL}/tenants/${tenantId}/config.json`);
            
            if (response.ok) {
                const data = await response.json();
                if (data) {
                    console.log(`[TenantConfig] Loaded config for tenant: ${tenantId}`);
                    return data;
                }
            }
        } catch (e) {
            console.warn('[TenantConfig] Firebase load failed:', e);
        }
        return null;
    }
    
    /**
     * Load tenant configuration from localStorage cache
     */
    function loadFromCache(tenantId) {
        try {
            const cached = localStorage.getItem(`bb_config_${tenantId}`);
            if (cached) {
                const data = JSON.parse(cached);
                console.log(`[TenantConfig] Loaded from cache for tenant: ${tenantId}`);
                return data;
            }
        } catch (e) {
            console.warn('[TenantConfig] Cache load failed:', e);
        }
        return null;
    }
    
    /**
     * Save configuration to localStorage cache
     */
    function saveToCache(tenantId, config) {
        try {
            localStorage.setItem(`bb_config_${tenantId}`, JSON.stringify(config));
            localStorage.setItem('bb_tenant_id', tenantId);
        } catch (e) {
            console.warn('[TenantConfig] Cache save failed:', e);
        }
    }
    
    /**
     * Deep merge two objects
     */
    function deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }
    
    /**
     * Initialize and load tenant configuration
     */
    async function init(tenantId = null) {
        currentTenantId = tenantId || detectTenant();
        console.log(`[TenantConfig] Initializing for tenant: ${currentTenantId}`);
        
        // Try loading from Firebase first
        let tenantConfig = await loadFromFirebase(currentTenantId);
        
        // Fall back to cache
        if (!tenantConfig) {
            tenantConfig = loadFromCache(currentTenantId);
        }
        
        // Merge with defaults (ensures all fields exist)
        if (tenantConfig) {
            config = deepMerge(defaultConfig, tenantConfig);
        } else {
            // Use Golf Cove config as default for now
            config = getGolfCoveConfig();
        }
        
        // Update tenant ID in config
        config.tenant.id = currentTenantId;
        
        // Cache the merged config
        saveToCache(currentTenantId, config);
        
        configLoaded = true;
        
        // Notify listeners
        configListeners.forEach(cb => {
            try { cb(config); } catch (e) { console.error(e); }
        });
        
        return config;
    }
    
    /**
     * Get Golf Cove specific config (for backward compatibility)
     */
    function getGolfCoveConfig() {
        return deepMerge(defaultConfig, {
            tenant: {
                id: 'golfcove',
                name: 'Golf Cove',
                logo: '/images/golfCoveLogo6.png',
                venueType: VENUE_TYPES.SIMULATOR, // Indoor simulator bays
                theme: {
                    primary: '#4a9eb4',
                    secondary: '#27ae60',
                    accent: '#37b24a'
                }
            },
            business: {
                name: 'Golf Cove',
                address: {
                    street: '336 State Street',
                    city: 'North Haven',
                    state: 'CT',
                    zip: '06473'
                },
                phone: '(203) 555-0100',
                email: 'info@golfcove.com',
                website: 'https://golfcove.web.app',
                timezone: 'America/New_York'
            },
            pricing: {
                taxRate: 0.0635  // CT sales tax
            },
            hours: {
                default: { open: 9, close: 22 },
                byDay: {
                    0: { open: 8, close: 22 },
                    5: { open: 9, close: 23 },
                    6: { open: 8, close: 23 }
                }
            },
            bays: [
                { id: 'single-1', type: 'single', name: 'Bay 1', capacity: 2, pricing: { weekday: 30, weekend: 40 }, color: '#3b82f6', active: true },
                { id: 'single-2', type: 'single', name: 'Bay 2', capacity: 2, pricing: { weekday: 30, weekend: 40 }, color: '#3b82f6', active: true },
                { id: 'single-3', type: 'single', name: 'Bay 3', capacity: 2, pricing: { weekday: 30, weekend: 40 }, color: '#3b82f6', active: true },
                { id: 'single-4', type: 'single', name: 'Bay 4', capacity: 2, pricing: { weekday: 30, weekend: 40 }, color: '#3b82f6', active: true },
                { id: 'single-5', type: 'single', name: 'Bay 5', capacity: 2, pricing: { weekday: 30, weekend: 40 }, color: '#3b82f6', active: true },
                { id: 'single-6', type: 'single', name: 'Bay 6', capacity: 2, pricing: { weekday: 30, weekend: 40 }, color: '#3b82f6', active: true },
                { id: 'double-1', type: 'double', name: 'Double Bay 1', capacity: 4, pricing: { weekday: 50, weekend: 65 }, color: '#10b981', active: true },
                { id: 'double-2', type: 'double', name: 'Double Bay 2', capacity: 4, pricing: { weekday: 50, weekend: 65 }, color: '#10b981', active: true },
                { id: 'double-3', type: 'double', name: 'Double Bay 3', capacity: 4, pricing: { weekday: 50, weekend: 65 }, color: '#10b981', active: true },
                { id: 'double-4', type: 'double', name: 'Double Bay 4', capacity: 4, pricing: { weekday: 50, weekend: 65 }, color: '#10b981', active: true },
                { id: 'triple-1', type: 'triple', name: 'Triple Bay 1', capacity: 6, pricing: { weekday: 70, weekend: 90 }, color: '#f59e0b', active: true },
                { id: 'triple-2', type: 'triple', name: 'Triple Bay 2', capacity: 6, pricing: { weekday: 70, weekend: 90 }, color: '#f59e0b', active: true },
                { id: 'lounge-1', type: 'lounge', name: 'Lounge 1', capacity: 8, pricing: { weekday: 100, weekend: 130 }, color: '#8b5cf6', active: true },
                { id: 'lounge-2', type: 'lounge', name: 'Lounge 2', capacity: 8, pricing: { weekday: 100, weekend: 130 }, color: '#8b5cf6', active: true },
                { id: 'party-1', type: 'party', name: 'Party Room', capacity: 12, pricing: { weekday: 200, weekend: 250 }, color: '#ec4899', active: true }
            ],
            memberships: {
                enabled: true,
                tiers: {
                    par: { name: 'Par', discount: 0.10, color: '#22c55e', priorityBooking: false },
                    birdie: { name: 'Birdie', discount: 0.15, color: '#9b59b6', priorityBooking: true },
                    eagle: { name: 'Eagle', discount: 0.20, color: '#d4a017', priorityBooking: true },
                    family_par: { name: 'Family Par', discount: 0.10, color: '#22c55e', priorityBooking: false },
                    family_birdie: { name: 'Family Birdie', discount: 0.15, color: '#9b59b6', priorityBooking: true },
                    family_eagle: { name: 'Family Eagle', discount: 0.20, color: '#d4a017', priorityBooking: true }
                }
            },
            features: {
                pos: true,
                booking: true,
                memberships: true,
                giftCards: true,
                leagues: true,
                lessons: true,
                inventory: true,
                reports: true
            }
        });
    }
    
    // ============ CONFIG ACCESS METHODS ============
    
    function get(path, defaultValue = null) {
        if (!config) {
            console.warn('[TenantConfig] Config not loaded yet');
            return defaultValue;
        }
        
        const parts = path.split('.');
        let value = config;
        
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }
    
    function getAll() {
        return config;
    }
    
    function getTenantId() {
        return currentTenantId;
    }
    
    function isLoaded() {
        return configLoaded;
    }
    
    // ============ HELPER METHODS ============
    
    function getBays(type = null) {
        const bays = get('bays', []).filter(b => b.active);
        if (type) {
            return bays.filter(b => b.type === type);
        }
        return bays;
    }
    
    function getBay(bayId) {
        return get('bays', []).find(b => b.id === bayId);
    }
    
    function getHours(date = new Date()) {
        const dayOfWeek = date.getDay();
        const dateStr = date.toISOString().split('T')[0];
        
        // Check closed dates
        const closedDates = get('hours.closedDates', []);
        if (closedDates.includes(dateStr)) {
            return null; // Closed
        }
        
        // Check day-specific hours
        const byDay = get('hours.byDay', {});
        if (byDay[dayOfWeek]) {
            return byDay[dayOfWeek];
        }
        
        // Return default hours
        return get('hours.default', { open: 9, close: 22 });
    }
    
    function isPeakTime(date, hour) {
        if (!get('peak.enabled', false)) return false;
        
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        const peakConfig = isWeekend ? get('peak.weekend') : get('peak.weekday');
        if (!peakConfig) return false;
        
        return hour >= peakConfig.start && hour < peakConfig.end;
    }
    
    function calculatePrice(bayId, durationMinutes, date = new Date()) {
        const bay = getBay(bayId);
        if (!bay) return 0;
        
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const basePrice = isWeekend ? bay.pricing.weekend : bay.pricing.weekday;
        
        // Price per hour
        const hours = durationMinutes / 60;
        let price = basePrice * hours;
        
        // Apply peak multiplier if applicable
        const hour = date.getHours();
        if (isPeakTime(date, hour)) {
            price *= get('peak.multiplier', 1.25);
        }
        
        return Math.round(price * 100) / 100; // Round to cents
    }
    
    function getMemberDiscount(tierKey) {
        return get(`memberships.tiers.${tierKey}.discount`, 0);
    }
    
    function formatCurrency(amount) {
        const symbol = get('pricing.currencySymbol', '$');
        return `${symbol}${parseFloat(amount).toFixed(2)}`;
    }
    
    function calculateTax(subtotal) {
        return subtotal * get('pricing.taxRate', 0);
    }
    
    function isFeatureEnabled(feature) {
        return get(`features.${feature}`, false);
    }
    
    // ============ VENUE TYPE HELPERS ============
    
    function getVenueType() {
        return get('tenant.venueType', VENUE_TYPES.SIMULATOR);
    }
    
    function isSimulator() {
        return getVenueType() === VENUE_TYPES.SIMULATOR;
    }
    
    function isCourse() {
        return getVenueType() === VENUE_TYPES.COURSE;
    }
    
    // ============ COURSE-SPECIFIC HELPERS ============
    
    function getTees() {
        return get('course.tees', []);
    }
    
    function getTeeTimeSettings() {
        return get('course.teeTimes', {
            interval: 10,
            playersPerGroup: 4,
            firstTee: '06:30',
            lastTee: '17:00'
        });
    }
    
    function getGreenFee(type, isWeekend = false) {
        // type: 'walking', 'riding', 'twilight', 'nineHole'
        const fees = get('course.greenFees', {});
        
        if (type === 'twilight' || type === 'nineHole') {
            return fees[type]?.walking || 0;
        }
        
        const dayType = isWeekend ? 'weekend' : 'weekday';
        return fees[dayType]?.[type] || 0;
    }
    
    function getTeeTimes(date = new Date()) {
        if (!isCourse()) return [];
        
        const settings = getTeeTimeSettings();
        const times = [];
        
        const [firstH, firstM] = settings.firstTee.split(':').map(Number);
        const [lastH, lastM] = settings.lastTee.split(':').map(Number);
        
        let currentH = firstH;
        let currentM = firstM;
        
        while (currentH < lastH || (currentH === lastH && currentM <= lastM)) {
            const time24 = `${currentH.toString().padStart(2, '0')}:${currentM.toString().padStart(2, '0')}`;
            const hour12 = currentH > 12 ? currentH - 12 : (currentH === 0 ? 12 : currentH);
            const ampm = currentH >= 12 ? 'PM' : 'AM';
            
            times.push({
                time24,
                time: `${hour12}:${currentM.toString().padStart(2, '0')} ${ampm}`,
                isTwilight: currentH >= settings.twilightStart
            });
            
            // Add interval
            currentM += settings.interval;
            if (currentM >= 60) {
                currentH += Math.floor(currentM / 60);
                currentM = currentM % 60;
            }
        }
        
        return times;
    }
    
    function calculateCoursePrice(players, isRiding, date = new Date()) {
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const hour = date.getHours();
        const twilightStart = get('course.teeTimes.twilightStart', 15);
        
        let feeType = isRiding ? 'riding' : 'walking';
        let pricePerPlayer;
        
        if (hour >= twilightStart) {
            pricePerPlayer = getGreenFee('twilight', isWeekend);
            if (isRiding) {
                const cartFee = get('course.greenFees.riding', 20) - get('course.greenFees.walking', 0);
                pricePerPlayer += cartFee > 0 ? cartFee / 2 : 10; // Add cart portion
            }
        } else {
            pricePerPlayer = getGreenFee(feeType, isWeekend);
        }
        
        return Math.round(pricePerPlayer * players * 100) / 100;
    }
    
    // ============ LISTENERS ============
    
    function onConfigLoaded(callback) {
        if (configLoaded) {
            callback(config);
        } else {
            configListeners.push(callback);
        }
    }
    
    // ============ PUBLIC API ============
    return {
        // Constants
        VENUE_TYPES,
        
        // Initialization
        init,
        detectTenant,
        isLoaded,
        
        // Config access
        get,
        getAll,
        getTenantId,
        
        // Venue type
        getVenueType,
        isSimulator,
        isCourse,
        
        // Bay helpers (for simulators)
        getBays,
        getBay,
        
        // Course helpers (for golf courses)
        getTees,
        getTeeTimeSettings,
        getTeeTimes,
        getGreenFee,
        calculateCoursePrice,
        
        // Time helpers
        getHours,
        isPeakTime,
        
        // Pricing helpers
        calculatePrice,
        getMemberDiscount,
        formatCurrency,
        calculateTax,
        
        // Feature flags
        isFeatureEnabled,
        
        // Events
        onConfigLoaded,
        
        // For debugging
        _getDefaultConfig: () => defaultConfig,
        _getGolfCoveConfig: getGolfCoveConfig
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TenantConfig;
}
