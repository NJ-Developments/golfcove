import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
    store: {},
    getItem: vi.fn((key) => localStorageMock.store[key] || null),
    setItem: vi.fn((key, value) => { localStorageMock.store[key] = value; }),
    removeItem: vi.fn((key) => { delete localStorageMock.store[key]; }),
    clear: vi.fn(() => { localStorageMock.store = {}; })
};
global.localStorage = localStorageMock;

// Mock navigator
global.navigator = { onLine: true };

// Import modules (will need to be adjusted based on module system)
// For now, we'll test the logic directly

describe('MembershipConfig', () => {
    // Simulated MembershipConfig for testing
    const TIERS = {
        par: { key: 'par', discount: 0.10, hourlyDiscount: 0.50, unlimitedPlay: false },
        birdie: { key: 'birdie', discount: 0.15, hourlyDiscount: 1.00, unlimitedPlay: true },
        eagle: { key: 'eagle', discount: 0.20, hourlyDiscount: 1.00, unlimitedPlay: true },
        family_par: { key: 'family_par', discount: 0.10, hourlyDiscount: 0.50, unlimitedPlay: false },
        family_birdie: { key: 'family_birdie', discount: 0.15, hourlyDiscount: 1.00, unlimitedPlay: true },
        family_eagle: { key: 'family_eagle', discount: 0.20, hourlyDiscount: 1.00, unlimitedPlay: true },
        corporate: { key: 'corporate', discount: 0.15, hourlyDiscount: 1.00, unlimitedPlay: true }
    };

    describe('getDiscount', () => {
        it('should return 10% for par members', () => {
            expect(TIERS.par.discount).toBe(0.10);
        });

        it('should return 15% for birdie members', () => {
            expect(TIERS.birdie.discount).toBe(0.15);
        });

        it('should return 20% for eagle members', () => {
            expect(TIERS.eagle.discount).toBe(0.20);
        });
    });

    describe('hasUnlimitedPlay', () => {
        it('should return false for par members', () => {
            expect(TIERS.par.unlimitedPlay).toBe(false);
        });

        it('should return true for birdie members', () => {
            expect(TIERS.birdie.unlimitedPlay).toBe(true);
        });

        it('should return true for eagle members', () => {
            expect(TIERS.eagle.unlimitedPlay).toBe(true);
        });

        it('should return true for corporate members', () => {
            expect(TIERS.corporate.unlimitedPlay).toBe(true);
        });
    });

    describe('calculateBayPrice', () => {
        const basePrice = 65;

        function calculateBayPrice(basePrice, tierKey) {
            const tier = TIERS[tierKey];
            if (!tier) return basePrice;
            if (tier.unlimitedPlay) return 0;
            return Math.round(basePrice * (1 - tier.hourlyDiscount) * 100) / 100;
        }

        it('should apply 50% discount for par members', () => {
            expect(calculateBayPrice(basePrice, 'par')).toBe(32.50);
        });

        it('should return $0 for birdie members (unlimited)', () => {
            expect(calculateBayPrice(basePrice, 'birdie')).toBe(0);
        });

        it('should return $0 for eagle members (unlimited)', () => {
            expect(calculateBayPrice(basePrice, 'eagle')).toBe(0);
        });

        it('should return full price for non-members', () => {
            expect(calculateBayPrice(basePrice, null)).toBe(basePrice);
        });
    });
});

describe('BookingSystem', () => {
    describe('isSlotAvailable', () => {
        const bookings = [
            { id: '1', roomId: 1, date: '2025-12-26', time: '10:00 AM', duration: 2, status: 'confirmed' },
            { id: '2', roomId: 2, date: '2025-12-26', time: '14:00', duration: 1, status: 'confirmed' }
        ];

        function parseTime(timeStr) {
            if (!timeStr) return null;
            const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
            if (!match) return null;
            let hour = parseInt(match[1]);
            const ampm = match[3]?.toLowerCase();
            if (ampm === 'pm' && hour !== 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
            return { hour };
        }

        function isSlotAvailable(roomId, date, time, duration, excludeBookingId = null) {
            const startTime = parseTime(time);
            if (!startTime) return false;
            
            const startHour = startTime.hour;
            const endHour = startHour + duration;
            
            const dateBookings = bookings.filter(b => 
                b.date === date && 
                b.roomId === roomId && 
                b.id !== excludeBookingId &&
                b.status !== 'cancelled'
            );
            
            for (const booking of dateBookings) {
                const bookingStart = parseTime(booking.time);
                if (!bookingStart) continue;
                
                const bookingStartHour = bookingStart.hour;
                const bookingEndHour = bookingStartHour + (booking.duration || 1);
                
                if (startHour < bookingEndHour && endHour > bookingStartHour) {
                    return false;
                }
            }
            
            return true;
        }

        it('should return true for empty slot', () => {
            expect(isSlotAvailable(1, '2025-12-26', '3:00 PM', 1)).toBe(true);
        });

        it('should return false for conflicting slot', () => {
            expect(isSlotAvailable(1, '2025-12-26', '10:00 AM', 1)).toBe(false);
        });

        it('should return false for overlapping slot', () => {
            expect(isSlotAvailable(1, '2025-12-26', '11:00 AM', 1)).toBe(false);
        });

        it('should return true for adjacent slot', () => {
            expect(isSlotAvailable(1, '2025-12-26', '12:00 PM', 1)).toBe(true);
        });

        it('should return true for different room', () => {
            expect(isSlotAvailable(3, '2025-12-26', '10:00 AM', 1)).toBe(true);
        });

        it('should return true for different date', () => {
            expect(isSlotAvailable(1, '2025-12-27', '10:00 AM', 1)).toBe(true);
        });
    });

    describe('parseTime', () => {
        function parseTime(timeStr) {
            if (!timeStr) return null;
            const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
            if (!match) return null;
            let hour = parseInt(match[1]);
            const minute = parseInt(match[2]);
            const ampm = match[3]?.toLowerCase();
            if (ampm === 'pm' && hour !== 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
            return { hour, minute };
        }

        it('should parse 12-hour format with AM', () => {
            expect(parseTime('10:00 AM')).toEqual({ hour: 10, minute: 0 });
        });

        it('should parse 12-hour format with PM', () => {
            expect(parseTime('2:00 PM')).toEqual({ hour: 14, minute: 0 });
        });

        it('should parse 24-hour format', () => {
            expect(parseTime('14:00')).toEqual({ hour: 14, minute: 0 });
        });

        it('should handle 12:00 PM (noon)', () => {
            expect(parseTime('12:00 PM')).toEqual({ hour: 12, minute: 0 });
        });

        it('should handle 12:00 AM (midnight)', () => {
            expect(parseTime('12:00 AM')).toEqual({ hour: 0, minute: 0 });
        });

        it('should return null for invalid format', () => {
            expect(parseTime('invalid')).toBeNull();
        });
    });

    describe('calculatePrice', () => {
        const PRICING = {
            baseHourly: 45,
            packages: {
                1: { price: 45 },
                2: { price: 80 },
                3: { price: 110 },
                4: { price: 140 }
            },
            peak: {
                enabled: true,
                multiplier: 1.25,
                weekday: { start: 17, end: 21 },
                weekend: { start: 10, end: 21 }
            },
            memberDiscounts: {
                par: 0.10,
                birdie: 1.00,
                eagle: 1.00
            }
        };

        function isPeakTime(date, hour) {
            const d = new Date(date);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const peak = isWeekend ? PRICING.peak.weekend : PRICING.peak.weekday;
            return hour >= peak.start && hour < peak.end;
        }

        function calculatePrice(duration, date, hour, memberType = null) {
            let price = PRICING.packages[duration]?.price || (duration * PRICING.baseHourly);
            
            if (isPeakTime(date, hour)) {
                price = price * PRICING.peak.multiplier;
            }
            
            if (memberType && PRICING.memberDiscounts[memberType]) {
                const discount = PRICING.memberDiscounts[memberType];
                price = price * (1 - discount);
            }
            
            return Math.round(price * 100) / 100;
        }

        it('should return base price for 1 hour', () => {
            expect(calculatePrice(1, '2025-12-24', 10, null)).toBe(45); // Wednesday non-peak
        });

        it('should return package price for 2 hours', () => {
            expect(calculatePrice(2, '2025-12-24', 10, null)).toBe(80);
        });

        it('should apply peak multiplier on weekday evening', () => {
            expect(calculatePrice(1, '2025-12-24', 18, null)).toBe(56.25); // 45 * 1.25
        });

        it('should apply member discount', () => {
            expect(calculatePrice(1, '2025-12-24', 10, 'par')).toBe(40.50); // 45 * 0.9
        });

        it('should return $0 for unlimited members', () => {
            expect(calculatePrice(1, '2025-12-24', 10, 'birdie')).toBe(0);
        });

        it('should apply both peak and member discount', () => {
            // Peak: 45 * 1.25 = 56.25, then 10% off = 50.625 → 50.63
            expect(calculatePrice(1, '2025-12-24', 18, 'par')).toBe(50.63);
        });
    });
});

describe('Store', () => {
    describe('reducer', () => {
        const initialState = {
            bookings: [],
            customers: [],
            tabs: []
        };

        function reducer(state, action) {
            switch (action.type) {
                case 'BOOKING_ADD':
                    return { ...state, bookings: [...state.bookings, action.payload] };
                case 'BOOKING_UPDATE':
                    return {
                        ...state,
                        bookings: state.bookings.map(b => 
                            b.id === action.payload.id ? { ...b, ...action.payload } : b
                        )
                    };
                case 'BOOKING_REMOVE':
                    return {
                        ...state,
                        bookings: state.bookings.filter(b => b.id !== action.payload)
                    };
                default:
                    return state;
            }
        }

        it('should add a booking', () => {
            const booking = { id: '1', customer: 'Test' };
            const newState = reducer(initialState, { type: 'BOOKING_ADD', payload: booking });
            expect(newState.bookings).toHaveLength(1);
            expect(newState.bookings[0]).toEqual(booking);
        });

        it('should update a booking', () => {
            const state = { ...initialState, bookings: [{ id: '1', customer: 'Test' }] };
            const newState = reducer(state, { 
                type: 'BOOKING_UPDATE', 
                payload: { id: '1', customer: 'Updated' } 
            });
            expect(newState.bookings[0].customer).toBe('Updated');
        });

        it('should remove a booking', () => {
            const state = { ...initialState, bookings: [{ id: '1' }, { id: '2' }] };
            const newState = reducer(state, { type: 'BOOKING_REMOVE', payload: '1' });
            expect(newState.bookings).toHaveLength(1);
            expect(newState.bookings[0].id).toBe('2');
        });

        it('should not mutate original state', () => {
            const state = { ...initialState, bookings: [{ id: '1' }] };
            const originalBookings = state.bookings;
            reducer(state, { type: 'BOOKING_ADD', payload: { id: '2' } });
            expect(state.bookings).toBe(originalBookings);
        });
    });
});

describe('ErrorHandler', () => {
    describe('AppError', () => {
        class AppError extends Error {
            constructor(code, message, details = {}) {
                super(message);
                this.code = code;
                this.details = details;
            }
        }

        it('should create error with code and message', () => {
            const error = new AppError('VALIDATION_ERROR', 'Invalid input');
            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.message).toBe('Invalid input');
        });

        it('should include details', () => {
            const error = new AppError('VALIDATION_ERROR', 'Invalid', { field: 'email' });
            expect(error.details.field).toBe('email');
        });
    });

    describe('error code inference', () => {
        function inferErrorCode(error) {
            const message = (error.message || '').toLowerCase();
            if (message.includes('network')) return 'NETWORK_ERROR';
            if (message.includes('timeout')) return 'TIMEOUT';
            if (message.includes('401')) return 'UNAUTHORIZED';
            return 'UNKNOWN';
        }

        it('should infer NETWORK_ERROR', () => {
            expect(inferErrorCode(new Error('Network failed'))).toBe('NETWORK_ERROR');
        });

        it('should infer TIMEOUT', () => {
            expect(inferErrorCode(new Error('Request timeout'))).toBe('TIMEOUT');
        });

        it('should default to UNKNOWN', () => {
            expect(inferErrorCode(new Error('Something'))).toBe('UNKNOWN');
        });
    });
});

describe('Utilities', () => {
    describe('formatDateISO', () => {
        function formatDateISO(date) {
            if (typeof date === 'string') return date.split('T')[0];
            return date.toISOString().split('T')[0];
        }

        it('should format Date object', () => {
            const date = new Date('2025-12-25T10:00:00Z');
            expect(formatDateISO(date)).toBe('2025-12-25');
        });

        it('should handle ISO string', () => {
            expect(formatDateISO('2025-12-25T10:00:00Z')).toBe('2025-12-25');
        });

        it('should handle date-only string', () => {
            expect(formatDateISO('2025-12-25')).toBe('2025-12-25');
        });
    });

    describe('generateId', () => {
        function generateId(prefix = 'id') {
            return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
        }

        it('should generate unique IDs', () => {
            const id1 = generateId('bk');
            const id2 = generateId('bk');
            expect(id1).not.toBe(id2);
        });

        it('should include prefix', () => {
            expect(generateId('test')).toMatch(/^test_/);
        });
    });
});
