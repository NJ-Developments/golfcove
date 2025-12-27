import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Test environment
        environment: 'jsdom',
        
        // Include patterns
        include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],
        
        // Exclude patterns
        exclude: ['node_modules', 'dist', 'functions'],
        
        // Global test timeout
        testTimeout: 10000,
        
        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            reportsDirectory: './coverage',
            include: ['js/**/*.js'],
            exclude: [
                'js/types.js',  // Type definitions
                'js/**/*.test.js'
            ]
        },
        
        // Global setup
        globals: true,
        
        // Reporter
        reporters: ['default'],
        
        // Watch mode
        watch: false
    }
});
