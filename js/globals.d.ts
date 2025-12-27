/**
 * TypeScript declarations for global variables
 * This file silences TypeScript errors for globals used across the codebase
 */

// Firebase SDK
declare const firebase: {
    apps: any[];
    initializeApp: (config: any) => any;
    database: () => any;
    auth?: () => any;
    functions?: () => any;
} | undefined;

// GolfCove custom globals
declare const GolfCoveMembership: {
    findCustomerByName: (name: string) => any;
    isActiveMember: (customer: any) => boolean;
    calculateDiscount: (customer: any) => number;
    calculateBayPrice: (customer: any, basePrice?: number) => number;
    hasUnlimitedPlay: (customer: any) => boolean;
    TIERS: Record<string, any>;
} | undefined;

declare const GolfCoveConfig: {
    pricing?: {
        taxRate?: number;
        hourlyRate?: number;
    };
    firebase?: any;
} | undefined;

declare const GolfCoveAPI: {
    get: (endpoint: string) => Promise<any>;
    post: (endpoint: string, data: any) => Promise<any>;
    put: (endpoint: string, data: any) => Promise<any>;
    delete: (endpoint: string) => Promise<any>;
} | undefined;

declare const GolfCoveCheckout: any | undefined;
declare const GolfCoveToast: {
    show: (message: string, type?: string) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
} | undefined;

declare const MembershipConfig: {
    TIERS: Record<string, any>;
    [key: string]: any;
} | undefined;

declare const Store: {
    Actions: {
        notify: (notification: { type: string; message: string }) => void;
        [key: string]: any;
    };
    [key: string]: any;
} | undefined;

declare const ErrorHandler: {
    handle: (error: any, context?: any) => void;
    wrap: (fn: Function, context?: any) => Function;
    AppError: any;
    ErrorCodes: Record<string, string>;
    [key: string]: any;
} | undefined;

declare const CacheManager: {
    init: () => Promise<void>;
    get: (key: string) => any;
    set: (key: string, value: any, ttl?: number) => void;
    delete: (key: string) => void;
    clear: (pattern?: string) => void;
    clearAll: () => void;
    [key: string]: any;
} | undefined;

declare const BookingSystem: {
    init: () => void;
    createBooking: (data: any) => Promise<any>;
    getBookings: (date?: string) => Promise<any[]>;
    cancelBooking: (id: string) => Promise<void>;
    checkIn: (id: string) => Promise<void>;
} | undefined;

// Global functions that may be defined in various scripts
declare function showToast(message: string, type?: string): void;

// Extend Window interface
interface Window {
    GolfCoveMembership?: typeof GolfCoveMembership;
    GolfCoveConfig?: typeof GolfCoveConfig;
    GolfCoveAPI?: typeof GolfCoveAPI;
    GolfCoveCheckout?: typeof GolfCoveCheckout;
    GolfCoveToast?: typeof GolfCoveToast;
    MembershipConfig?: typeof MembershipConfig;
    Store?: typeof Store;
    ErrorHandler?: typeof ErrorHandler;
    CacheManager?: typeof CacheManager;
    BookingSystem?: typeof BookingSystem;
    showToast?: typeof showToast;
}

// Extend Error constructor for V8's captureStackTrace
interface ErrorConstructor {
    captureStackTrace?: (targetObject: object, constructorOpt?: Function) => void;
}

// IndexedDB event target with result
interface IDBOpenDBRequestEventTarget extends EventTarget {
    result?: IDBDatabase;
}
