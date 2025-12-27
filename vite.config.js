import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Root directory
  root: '.',
  
  // Base public path
  base: '/',
  
  // Development server
  server: {
    port: 3000,
    open: true,
    cors: true
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    
    // Generate source maps for debugging
    sourcemap: true,
    
    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console.log in production for now
        drop_debugger: true
      }
    },
    
    // Rollup options for multi-page app
    rollupOptions: {
      input: {
        // Main pages
        main: resolve(__dirname, 'index.html'),
        booking: resolve(__dirname, 'booking.html'),
        bookingConfirmed: resolve(__dirname, 'booking-confirmed.html'),
        pos: resolve(__dirname, 'pos.html'),
        adminPos: resolve(__dirname, 'admin-pos.html'),
        
        // Customer-facing
        menu: resolve(__dirname, 'menu.html'),
        memberships: resolve(__dirname, 'memberships.html'),
        membershipSignup: resolve(__dirname, 'membership-signup.html'),
        membershipSuccess: resolve(__dirname, 'membership-success.html'),
        pricing: resolve(__dirname, 'pricing.html'),
        
        // Features
        giftCards: resolve(__dirname, 'gift-cards.html'),
        lessonsLeagues: resolve(__dirname, 'lessons-leagues.html'),
        leagueStandings: resolve(__dirname, 'league-standings.html'),
        leagueAdmin: resolve(__dirname, 'league-admin.html'),
        tournaments: resolve(__dirname, 'tournaments.html'),
        privateEvents: resolve(__dirname, 'private-events.html'),
        multisport: resolve(__dirname, 'multisport.html'),
        pinseeker: resolve(__dirname, 'pinseeker.html'),
        
        // Admin
        customers: resolve(__dirname, 'customers.html'),
        schedule: resolve(__dirname, 'schedule.html'),
        sales: resolve(__dirname, 'sales.html'),
        concierge: resolve(__dirname, 'concierge.html'),
        billing: resolve(__dirname, 'billing.html'),
        
        // Utility
        contact: resolve(__dirname, 'contact.html'),
        terms: resolve(__dirname, 'terms.html'),
        qrPoster: resolve(__dirname, 'qr-poster.html')
      },
      
      output: {
        // Chunk naming
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        
        // Manual chunks for code splitting
        manualChunks: {
          // Core modules bundled together
          'core': [
            './js/types.js',
            './js/membership-config.js',
            './js/error-handler.js',
            './js/store.js',
            './js/api-layer.js'
          ],
          // Booking system
          'booking': [
            './js/booking-unified.js'
          ],
          // POS system
          'pos': [
            './js/pos-core.js',
            './js/pos-cart.js',
            './js/pos-menu.js',
            './js/pos-customers.js',
            './js/pos-teesheet.js',
            './js/tabs-manager.js',
            './js/tabs-sync.js'
          ],
          // Payment processing
          'payments': [
            './js/stripe-checkout.js',
            './js/stripe-terminal.js',
            './js/payment-processor.js',
            './js/payment-service.js',
            './js/gift-cards.js'
          ],
          // Membership & customers
          'members': [
            './js/membership-system.js',
            './js/customer-manager.js'
          ]
        }
      }
    }
  },
  
  // Resolve aliases
  resolve: {
    alias: {
      '@': resolve(__dirname, './js'),
      '@css': resolve(__dirname, './css'),
      '@images': resolve(__dirname, './images')
    }
  },
  
  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify('2.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  }
});
