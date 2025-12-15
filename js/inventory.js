/**
 * Golf Cove - Inventory Management System
 * Tracks stock levels, alerts, and purchase orders
 */

const GolfCoveInventory = (function() {
    'use strict';
    
    const STORAGE_KEY = 'gc_inventory';
    const ORDERS_KEY = 'gc_purchase_orders';
    const MOVEMENTS_KEY = 'gc_inventory_movements';
    
    // Production limits
    const MAX_ITEMS = 5000;
    const MAX_MOVEMENTS = 5000;
    const MAX_ORDERS = 1000;
    const MAX_QUANTITY = 99999;
    const MAX_PRICE = 99999.99;
    
    // Validation helpers
    function sanitizeString(str, maxLen = 200) {
        if (typeof str !== 'string') return '';
        return str.trim().substring(0, maxLen);
    }
    
    function validateNumber(val, min = 0, max = MAX_QUANTITY) {
        const num = parseFloat(val);
        if (isNaN(num)) return null;
        return Math.max(min, Math.min(max, num));
    }
    
    function validatePrice(val) {
        const num = parseFloat(val);
        if (isNaN(num) || num < 0 || num > MAX_PRICE) return 0;
        return Math.round(num * 100) / 100;
    }
    
    // ============ DATA ACCESS ============
    function getItems() {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }
    
    function saveItems(items) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
    
    function getOrders() {
        return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    }
    
    function saveOrders(orders) {
        localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }
    
    function getMovements() {
        return JSON.parse(localStorage.getItem(MOVEMENTS_KEY) || '[]');
    }
    
    function saveMovements(movements) {
        localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(movements));
    }
    
    // ============ ITEM MANAGEMENT ============
    function createItem(data) {
        if (!data || typeof data !== 'object') {
            console.error('Invalid item data');
            return null;
        }
        
        const items = getItems();
        
        // Check storage limit
        if (items.length >= MAX_ITEMS) {
            console.error('Inventory storage limit reached');
            return null;
        }
        
        // Validate required name
        const name = sanitizeString(data.name, 100);
        if (!name) {
            console.error('Item name is required');
            return null;
        }
        
        // Check for duplicate SKU
        const sku = data.sku ? sanitizeString(data.sku, 50) : generateSKU(data.category, name);
        if (items.find(i => i.sku === sku && i.isActive)) {
            console.error('SKU already exists:', sku);
            return null;
        }
        
        const item = {
            id: 'INV-' + Date.now().toString(36).toUpperCase(),
            sku: sku,
            name: name,
            category: sanitizeString(data.category, 50) || 'general',
            description: sanitizeString(data.description, 500),
            unit: sanitizeString(data.unit, 20) || 'each',
            quantity: validateNumber(data.quantity, 0) || 0,
            minQuantity: validateNumber(data.minQuantity, 0) || 5,
            maxQuantity: validateNumber(data.maxQuantity, 1) || 100,
            reorderPoint: validateNumber(data.reorderPoint, 0) || 10,
            reorderQuantity: validateNumber(data.reorderQuantity, 1) || 20,
            cost: validatePrice(data.cost),
            price: validatePrice(data.price),
            vendor: sanitizeString(data.vendor, 100),
            vendorSKU: sanitizeString(data.vendorSKU, 50),
            location: sanitizeString(data.location, 50),
            expirationDate: data.expirationDate || null,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        items.push(item);
        saveItems(items);
        
        // Record initial stock
        if (item.quantity > 0) {
            recordMovement(item.id, 'initial', item.quantity, 'Initial stock');
        }
        
        return item;
    }
    
    function generateSKU(category, name) {
        const catCode = (category || 'GEN').substring(0, 3).toUpperCase();
        const nameCode = (name || '').substring(0, 3).toUpperCase();
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        return `${catCode}-${nameCode}-${random}`;
    }
    
    function updateItem(id, updates) {
        const items = getItems();
        const index = items.findIndex(i => i.id === id);
        
        if (index === -1) return null;
        
        items[index] = {
            ...items[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        saveItems(items);
        return items[index];
    }
    
    function getItem(id) {
        return getItems().find(i => i.id === id);
    }
    
    function getItemBySKU(sku) {
        return getItems().find(i => i.sku === sku);
    }
    
    function getAll() {
        return getItems().filter(i => i.isActive);
    }
    
    function deleteItem(id) {
        const items = getItems();
        const index = items.findIndex(i => i.id === id);
        
        if (index === -1) return false;
        
        // Soft delete
        items[index].isActive = false;
        items[index].updatedAt = new Date().toISOString();
        saveItems(items);
        
        return true;
    }
    
    // ============ STOCK MANAGEMENT ============
    function adjustStock(id, quantity, reason = '', type = 'adjustment') {
        // Validate inputs
        if (!id || typeof id !== 'string') {
            console.error('Invalid item ID');
            return null;
        }
        
        const validQty = validateNumber(quantity, -MAX_QUANTITY, MAX_QUANTITY);
        if (validQty === null) {
            console.error('Invalid quantity:', quantity);
            return null;
        }
        
        const items = getItems();
        const index = items.findIndex(i => i.id === id);
        
        if (index === -1) {
            console.error('Item not found:', id);
            return null;
        }
        
        const oldQty = items[index].quantity;
        let newQty = oldQty + validQty;
        
        // Prevent negative stock
        if (newQty < 0) {
            console.warn(`Stock would go negative. Adjusting to 0. Requested: ${validQty}, Available: ${oldQty}`);
            newQty = 0;
        }
        
        // Prevent overflow
        if (newQty > MAX_QUANTITY) {
            console.warn(`Stock exceeds maximum. Capping at ${MAX_QUANTITY}`);
            newQty = MAX_QUANTITY;
        }
        
        items[index].quantity = newQty;
        items[index].updatedAt = new Date().toISOString();
        
        saveItems(items);
        recordMovement(id, type, validQty, sanitizeString(reason, 200), oldQty, newQty);
        
        // Check for low stock alert
        if (items[index].quantity <= items[index].reorderPoint) {
            triggerLowStockAlert(items[index]);
        }
        
        return items[index];
    }
    
    function addStock(id, quantity, reason = 'Stock received') {
        return adjustStock(id, Math.abs(quantity), reason, 'receive');
    }
    
    function removeStock(id, quantity, reason = 'Sold') {
        return adjustStock(id, -Math.abs(quantity), reason, 'sale');
    }
    
    function transferStock(fromId, toId, quantity, reason = 'Transfer') {
        removeStock(fromId, quantity, `Transfer to ${toId}: ${reason}`);
        addStock(toId, quantity, `Transfer from ${fromId}: ${reason}`);
    }
    
    function recordWaste(id, quantity, reason = 'Waste/Spoilage') {
        return adjustStock(id, -Math.abs(quantity), reason, 'waste');
    }
    
    function recordMovement(itemId, type, quantity, reason, oldQty = null, newQty = null) {
        const movements = getMovements();
        const item = getItem(itemId);
        
        movements.push({
            id: 'MOV-' + Date.now().toString(36).toUpperCase(),
            itemId,
            itemName: item?.name || 'Unknown',
            sku: item?.sku || '',
            type, // initial, receive, sale, adjustment, waste, transfer
            quantity,
            oldQuantity: oldQty,
            newQuantity: newQty,
            reason,
            employee: typeof GolfCovePIN !== 'undefined' ? GolfCovePIN.getCurrentEmployee()?.name : 'System',
            timestamp: new Date().toISOString()
        });
        
        // Keep last 1000 movements
        if (movements.length > 1000) {
            movements.shift();
        }
        
        saveMovements(movements);
    }
    
    // ============ QUERIES ============
    function getByCategory(category) {
        return getAll().filter(i => i.category === category);
    }
    
    function getLowStock() {
        return getAll().filter(i => i.quantity <= i.reorderPoint);
    }
    
    function getOutOfStock() {
        return getAll().filter(i => i.quantity === 0);
    }
    
    function getOverstock() {
        return getAll().filter(i => i.quantity > i.maxQuantity);
    }
    
    function getExpiringSoon(days = 7) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + days);
        
        return getAll().filter(i => 
            i.expirationDate && new Date(i.expirationDate) <= cutoff
        ).sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));
    }
    
    function getExpired() {
        const now = new Date();
        return getAll().filter(i => 
            i.expirationDate && new Date(i.expirationDate) < now
        );
    }
    
    function search(query) {
        const q = query.toLowerCase();
        return getAll().filter(i => 
            i.name.toLowerCase().includes(q) ||
            i.sku.toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q) ||
            (i.description && i.description.toLowerCase().includes(q))
        );
    }
    
    // ============ PURCHASE ORDERS ============
    function createPurchaseOrder(data) {
        const orders = getOrders();
        
        const order = {
            id: 'PO-' + Date.now().toString(36).toUpperCase(),
            vendor: data.vendor,
            status: 'draft', // draft, submitted, partial, received, cancelled
            items: data.items || [], // [{ itemId, sku, name, quantity, cost }]
            subtotal: 0,
            tax: data.tax || 0,
            shipping: data.shipping || 0,
            total: 0,
            notes: data.notes || '',
            expectedDate: data.expectedDate || null,
            receivedDate: null,
            createdBy: typeof GolfCovePIN !== 'undefined' ? GolfCovePIN.getCurrentEmployee()?.name : 'System',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Calculate totals
        order.subtotal = order.items.reduce((sum, i) => sum + (i.cost * i.quantity), 0);
        order.total = order.subtotal + order.tax + order.shipping;
        
        orders.push(order);
        saveOrders(orders);
        
        return order;
    }
    
    function updatePurchaseOrder(id, updates) {
        const orders = getOrders();
        const index = orders.findIndex(o => o.id === id);
        
        if (index === -1) return null;
        
        orders[index] = {
            ...orders[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        // Recalculate totals if items changed
        if (updates.items) {
            orders[index].subtotal = orders[index].items.reduce((sum, i) => sum + (i.cost * i.quantity), 0);
            orders[index].total = orders[index].subtotal + (orders[index].tax || 0) + (orders[index].shipping || 0);
        }
        
        saveOrders(orders);
        return orders[index];
    }
    
    function getPurchaseOrder(id) {
        return getOrders().find(o => o.id === id);
    }
    
    function receivePurchaseOrder(id, receivedItems = null) {
        const order = getPurchaseOrder(id);
        if (!order) return null;
        
        const itemsToReceive = receivedItems || order.items;
        
        // Add stock for each item
        itemsToReceive.forEach(item => {
            addStock(item.itemId, item.quantity, `PO: ${id}`);
        });
        
        // Update order status
        const allReceived = !receivedItems || receivedItems.length === order.items.length;
        return updatePurchaseOrder(id, {
            status: allReceived ? 'received' : 'partial',
            receivedDate: new Date().toISOString()
        });
    }
    
    function cancelPurchaseOrder(id, reason = '') {
        return updatePurchaseOrder(id, {
            status: 'cancelled',
            notes: reason ? `Cancelled: ${reason}` : 'Cancelled'
        });
    }
    
    function getPendingOrders() {
        return getOrders().filter(o => ['draft', 'submitted', 'partial'].includes(o.status));
    }
    
    // ============ ALERTS ============
    function triggerLowStockAlert(item) {
        // Would integrate with notification system
        console.log(`Low stock alert: ${item.name} (${item.quantity} remaining)`);
        
        // Could trigger toast notification
        if (typeof GolfCoveToast !== 'undefined') {
            GolfCoveToast.warning(`Low stock: ${item.name} - ${item.quantity} remaining`);
        }
    }
    
    function getAlerts() {
        const alerts = [];
        
        const lowStock = getLowStock();
        lowStock.forEach(item => {
            alerts.push({
                type: 'low-stock',
                severity: item.quantity === 0 ? 'critical' : 'warning',
                item: item.name,
                sku: item.sku,
                message: `${item.name} is low on stock (${item.quantity} remaining)`,
                quantity: item.quantity,
                reorderPoint: item.reorderPoint
            });
        });
        
        const expiring = getExpiringSoon(7);
        expiring.forEach(item => {
            alerts.push({
                type: 'expiring',
                severity: 'warning',
                item: item.name,
                sku: item.sku,
                message: `${item.name} expires on ${new Date(item.expirationDate).toLocaleDateString()}`,
                expirationDate: item.expirationDate
            });
        });
        
        const expired = getExpired();
        expired.forEach(item => {
            alerts.push({
                type: 'expired',
                severity: 'critical',
                item: item.name,
                sku: item.sku,
                message: `${item.name} has expired!`,
                expirationDate: item.expirationDate
            });
        });
        
        return alerts;
    }
    
    // ============ REPORTS ============
    function getValueReport() {
        const items = getAll();
        
        const totalCost = items.reduce((sum, i) => sum + (i.cost * i.quantity), 0);
        const totalRetail = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        
        // By category
        const byCategory = {};
        items.forEach(item => {
            if (!byCategory[item.category]) {
                byCategory[item.category] = { items: 0, quantity: 0, cost: 0, retail: 0 };
            }
            byCategory[item.category].items++;
            byCategory[item.category].quantity += item.quantity;
            byCategory[item.category].cost += item.cost * item.quantity;
            byCategory[item.category].retail += item.price * item.quantity;
        });
        
        return {
            summary: {
                totalItems: items.length,
                totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
                totalCost,
                totalRetail,
                potentialProfit: totalRetail - totalCost
            },
            byCategory
        };
    }
    
    function getMovementReport(days = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        
        const movements = getMovements().filter(m => new Date(m.timestamp) >= cutoff);
        
        // Group by type
        const byType = {};
        movements.forEach(m => {
            if (!byType[m.type]) {
                byType[m.type] = { count: 0, quantity: 0 };
            }
            byType[m.type].count++;
            byType[m.type].quantity += Math.abs(m.quantity);
        });
        
        // Top moving items
        const itemMovements = {};
        movements.forEach(m => {
            if (!itemMovements[m.itemId]) {
                itemMovements[m.itemId] = { name: m.itemName, movements: 0, quantity: 0 };
            }
            itemMovements[m.itemId].movements++;
            itemMovements[m.itemId].quantity += Math.abs(m.quantity);
        });
        
        const topMoving = Object.values(itemMovements)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);
        
        return {
            period: `Last ${days} days`,
            totalMovements: movements.length,
            byType,
            topMoving,
            recentMovements: movements.slice(-20).reverse()
        };
    }
    
    // ============ AUTO REORDER ============
    function generateReorderList() {
        return getLowStock().map(item => ({
            itemId: item.id,
            sku: item.sku,
            name: item.name,
            currentQty: item.quantity,
            reorderPoint: item.reorderPoint,
            suggestedQty: item.reorderQuantity,
            vendor: item.vendor,
            estimatedCost: item.cost * item.reorderQuantity
        }));
    }
    
    function createAutoReorder() {
        const reorderList = generateReorderList();
        
        // Group by vendor
        const byVendor = {};
        reorderList.forEach(item => {
            const vendor = item.vendor || 'Unknown';
            if (!byVendor[vendor]) {
                byVendor[vendor] = [];
            }
            byVendor[vendor].push({
                itemId: item.itemId,
                sku: item.sku,
                name: item.name,
                quantity: item.suggestedQty,
                cost: item.estimatedCost / item.suggestedQty
            });
        });
        
        // Create PO for each vendor
        const orders = [];
        Object.entries(byVendor).forEach(([vendor, items]) => {
            const order = createPurchaseOrder({
                vendor,
                items,
                notes: 'Auto-generated reorder'
            });
            orders.push(order);
        });
        
        return orders;
    }
    
    // ============ INTEGRATION WITH POS ============
    function onSale(items) {
        // Called when a sale is completed to reduce stock
        items.forEach(item => {
            const invItem = getItemBySKU(item.sku);
            if (invItem) {
                removeStock(invItem.id, item.qty, `Sale: ${item.name}`);
            }
        });
    }
    
    // Public API
    return {
        // Item CRUD
        createItem,
        updateItem,
        getItem,
        getItemBySKU,
        getAll,
        deleteItem,
        
        // Stock management
        addStock,
        removeStock,
        adjustStock,
        transferStock,
        recordWaste,
        
        // Queries
        getByCategory,
        getLowStock,
        getOutOfStock,
        getOverstock,
        getExpiringSoon,
        getExpired,
        search,
        
        // Purchase orders
        createPurchaseOrder,
        updatePurchaseOrder,
        getPurchaseOrder,
        receivePurchaseOrder,
        cancelPurchaseOrder,
        getPendingOrders,
        
        // Alerts
        getAlerts,
        
        // Reports
        getValueReport,
        getMovementReport,
        
        // Auto reorder
        generateReorderList,
        createAutoReorder,
        
        // POS integration
        onSale
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveInventory;
}
