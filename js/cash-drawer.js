/**
 * Golf Cove - USB Cash Drawer Controller
 * Uses Web Serial API to send drawer kick commands
 * Compatible with most USB cash drawers (APG, Star, MMF, etc.)
 */

const CashDrawer = {
    port: null,
    writer: null,
    isConnected: false,
    
    // Standard ESC/POS drawer kick commands
    // Most USB drawers respond to these even without a printer
    KICK_COMMANDS: {
        // ESC p 0 - Drawer 1 kick (most common)
        standard: new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]),
        // ESC p 1 - Drawer 2 kick (alternate pin)
        alternate: new Uint8Array([0x1B, 0x70, 0x01, 0x19, 0xFA]),
        // DLE DC4 - Some drawers use this
        dle: new Uint8Array([0x10, 0x14, 0x01, 0x00, 0x05]),
        // Simple pulse for basic USB drawers
        pulse: new Uint8Array([0x07])
    },
    
    /**
     * Check if Web Serial API is supported
     */
    isSupported() {
        return 'serial' in navigator;
    },
    
    /**
     * Connect to USB cash drawer
     * Will prompt user to select the device
     */
    async connect() {
        if (!this.isSupported()) {
            throw new Error('Web Serial API not supported. Use Chrome, Edge, or Opera.');
        }
        
        try {
            // Request port from user
            this.port = await navigator.serial.requestPort();
            
            // Open connection with common baud rates for cash drawers
            await this.port.open({ 
                baudRate: 9600,
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            });
            
            this.writer = this.port.writable.getWriter();
            this.isConnected = true;
            
            // Save port info for reconnection
            const info = this.port.getInfo();
            localStorage.setItem('gc_drawer_connected', 'true');
            localStorage.setItem('gc_drawer_info', JSON.stringify(info));
            
            console.log('✅ Cash drawer connected:', info);
            this.showNotification('Cash drawer connected!', 'success');
            
            return true;
        } catch (error) {
            if (error.name === 'NotFoundError') {
                // User cancelled
                console.log('Drawer connection cancelled by user');
                return false;
            }
            console.error('Failed to connect drawer:', error);
            this.showNotification('Failed to connect drawer: ' + error.message, 'error');
            throw error;
        }
    },
    
    /**
     * Try to reconnect to previously used drawer
     */
    async reconnect() {
        if (!this.isSupported()) return false;
        
        try {
            const ports = await navigator.serial.getPorts();
            if (ports.length > 0) {
                // Try first available port
                this.port = ports[0];
                await this.port.open({ 
                    baudRate: 9600,
                    dataBits: 8,
                    stopBits: 1,
                    parity: 'none'
                });
                this.writer = this.port.writable.getWriter();
                this.isConnected = true;
                console.log('✅ Cash drawer reconnected');
                return true;
            }
        } catch (error) {
            console.log('Could not auto-reconnect drawer:', error.message);
        }
        return false;
    },
    
    /**
     * Disconnect from drawer
     */
    async disconnect() {
        try {
            if (this.writer) {
                await this.writer.close();
                this.writer = null;
            }
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            this.isConnected = false;
            localStorage.removeItem('gc_drawer_connected');
            console.log('Cash drawer disconnected');
        } catch (error) {
            console.error('Error disconnecting drawer:', error);
        }
    },
    
    /**
     * Kick open the cash drawer
     */
    async kick() {
        // If not connected, try to reconnect
        if (!this.isConnected) {
            const reconnected = await this.reconnect();
            if (!reconnected) {
                // Prompt user to connect
                const connect = confirm('Cash drawer not connected. Connect now?');
                if (connect) {
                    await this.connect();
                } else {
                    console.log('Drawer kick skipped - not connected');
                    return false;
                }
            }
        }
        
        if (!this.isConnected || !this.writer) {
            console.warn('Cannot kick drawer - not connected');
            return false;
        }
        
        try {
            // Try standard ESC/POS command first
            await this.writer.write(this.KICK_COMMANDS.standard);
            console.log('💰 Cash drawer kicked open!');
            return true;
        } catch (error) {
            console.error('Failed to kick drawer:', error);
            
            // Connection may have been lost
            this.isConnected = false;
            this.showNotification('Drawer connection lost. Please reconnect.', 'error');
            return false;
        }
    },
    
    /**
     * Show notification to user
     */
    showNotification(message, type = 'info') {
        // Use existing toast system if available
        if (typeof showToast === 'function') {
            showToast(message, type);
        } else if (typeof Toast !== 'undefined' && Toast.show) {
            Toast.show(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    },
    
    /**
     * Get connection status UI
     */
    getStatusHTML() {
        if (!this.isSupported()) {
            return '<span class="text-warning">⚠️ Browser not supported (use Chrome)</span>';
        }
        if (this.isConnected) {
            return '<span class="text-success">✅ Cash Drawer Connected</span>';
        }
        return '<span class="text-muted">⚪ Cash Drawer Not Connected</span>';
    }
};

// Auto-reconnect on page load if previously connected
document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('gc_drawer_connected') === 'true') {
        try {
            await CashDrawer.reconnect();
        } catch (e) {
            console.log('Auto-reconnect failed:', e.message);
        }
    }
});

// Make globally available
window.CashDrawer = CashDrawer;
