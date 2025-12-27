/**
 * Golf Cove - Tabs Manager
 * UI management for open tabs display and interaction
 */

const TabsManager = (function() {
    'use strict';
    
    // State
    let selectedTabId = null;
    let refreshInterval = null;
    
    // ============ INITIALIZATION ============
    function init() {
        // Initialize TabsSync if available
        if (typeof TabsSync !== 'undefined') {
            TabsSync.init();
            TabsSync.onUpdate(handleTabUpdate);
        }
        
        // Start auto-refresh
        startAutoRefresh();
        
        // Initial render
        render();
    }
    
    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(render, 30000); // Refresh every 30s
    }
    
    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }
    
    // ============ DATA ============
    function getTabs() {
        if (typeof TabsSync !== 'undefined') {
            return TabsSync.getAllTabs();
        }
        const tabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
        // Filter open tabs (no status means open, or status === 'open')
        // Also normalize the data structure for compatibility
        return tabs.filter(t => !t.status || t.status === 'open').map(normalizeTab);
    }
    
    function normalizeTab(tab) {
        if (!tab) return null;
        return {
            ...tab,
            // Ensure consistent ID format
            id: tab.id,
            // Normalize customer name
            customer: tab.customer || tab.customerName || 'Guest',
            // Normalize totals (amount vs total)
            total: tab.total ?? tab.amount ?? 0,
            amount: tab.amount ?? tab.total ?? 0,
            subtotal: tab.subtotal ?? 0,
            // Normalize timestamps
            openedAt: tab.openedAt || tab.createdAt,
            createdAt: tab.createdAt || tab.openedAt,
            // Ensure items array exists
            items: tab.items || [],
            // Member info
            isMember: tab.isMember || false,
            isLeague: tab.isLeague || false,
            memberType: tab.memberType || null,
            memberDiscount: tab.memberDiscount || 0
        };
    }
    
    function getTab(tabId) {
        if (typeof TabsSync !== 'undefined') {
            const tab = TabsSync.getTab(tabId);
            return normalizeTab(tab);
        }
        const tab = getTabs().find(t => t.id === tabId || t.id == tabId);
        return normalizeTab(tab);
    }
    
    // ============ RENDERING ============
    function render(containerId = 'openTabsList') {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const tabs = getTabs();
        
        // Update count badge
        const countEl = document.getElementById('tabCount');
        if (countEl) countEl.textContent = tabs.length;
        
        if (tabs.length === 0) {
            container.innerHTML = `
                <div class="empty-tabs">
                    <i class="fas fa-folder-open" style="font-size:24px;color:#ddd;margin-bottom:8px;"></i>
                    <p style="color:#999;font-size:12px;">No open tabs</p>
                </div>
            `;
            return;
        }
        
        // Member tier colors, names and discounts
        const tierColors = {
            'par': '#3498db', 
            'birdie': '#9b59b6', 
            'eagle': '#f1c40f',
            'family_par': '#3498db', 
            'family_birdie': '#9b59b6', 
            'family_eagle': '#f1c40f',
            'corporate': '#2c3e50'
        };
        const tierNames = {
            'par': 'PAR',
            'birdie': 'BIRDIE',
            'eagle': 'EAGLE',
            'family_par': 'FAM PAR',
            'family_birdie': 'FAM BIRDIE',
            'family_eagle': 'FAM EAGLE',
            'corporate': 'CORP'
        };
        const tierDiscounts = {
            'par': '10%',
            'birdie': '10%',
            'eagle': '15%',
            'family_par': '10%',
            'family_birdie': '10%',
            'family_eagle': '15%',
            'corporate': '20%'
        };
        
        container.innerHTML = tabs.map(tab => {
            const isMember = tab.isMember || false;
            const isLeague = tab.isLeague || false;
            const isVIP = tab.isVIP || false;
            const itemCount = (tab.items || []).length;
            const total = tab.total || tab.amount || 0;
            
            let tabClass = 'tab-item';
            if (isVIP) tabClass += ' vip';
            else if (isMember) tabClass += ' member';
            if (tab.id === selectedTabId) tabClass += ' selected';
            
            const tierColor = tierColors[tab.memberType] || '#27ae60';
            const tierName = tierNames[tab.memberType] || tab.memberType?.toUpperCase()?.replace('_', ' ') || 'MEMBER';
            const discount = tierDiscounts[tab.memberType] || '10%';
            
            // Build badges - show BOTH member tier AND league status
            let memberBadge = '';
            if (isMember && tab.memberType) {
                memberBadge = `
                    <span class="tab-member-badge" style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg, ${tierColor}, ${tierColor}cc);color:#fff;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.25);">
                        <i class="fas fa-crown" style="color:#f1c40f;font-size:10px;"></i> ${tierName}
                        <span style="background:rgba(255,255,255,0.25);padding:1px 5px;border-radius:8px;font-size:9px;">${discount}</span>
                    </span>
                `;
            }
            
            let leagueBadge = '';
            if (isLeague) {
                leagueBadge = `
                    <span class="tab-league-badge" style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg, #27ae60, #1e8449);color:#fff;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.25);margin-left:6px;">
                        <i class="fas fa-golf-ball" style="font-size:10px;"></i> LEAGUE
                    </span>
                `;
            }
            
            const timeOpen = getTimeOpen(tab.openedAt);
            
            // Card border color based on member or league
            let borderStyle = '';
            if (isMember) {
                borderStyle = `border-left:4px solid ${tierColor};background:linear-gradient(to right, ${tierColor}08, transparent);`;
            } else if (isLeague) {
                borderStyle = 'border-left:4px solid #27ae60;background:linear-gradient(to right, #27ae6008, transparent);';
            }
            
            return `
                <div class="${tabClass}" onclick="TabsManager.selectTab('${tab.id}')" style="${borderStyle}">
                    <div class="tab-left">
                        <div class="tab-customer">
                            ${tab.customer}
                        </div>
                        ${(memberBadge || leagueBadge) ? `<div style="margin:6px 0;">${memberBadge}${leagueBadge}</div>` : ''}
                        <div class="tab-info">
                            ${itemCount} item${itemCount !== 1 ? 's' : ''} • ${timeOpen}
                        </div>
                        ${tab.memberDiscount ? `<div class="tab-discount" style="color:#27ae60;font-size:11px;font-weight:600;"><i class="fas fa-tag"></i> ${tab.memberDiscount}% discount applied</div>` : ''}
                    </div>
                    <div class="tab-right">
                        <div class="tab-total">$${total.toFixed(2)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    function getTimeOpen(openedAt) {
        if (!openedAt) return '';
        
        const opened = new Date(openedAt);
        const now = new Date();
        const minutes = Math.floor((now - opened) / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m`;
        
        const hours = Math.floor(minutes / 60);
        const remainingMins = minutes % 60;
        return `${hours}h ${remainingMins}m`;
    }
    
    // ============ TAB ACTIONS ============
    function selectTab(tabId) {
        selectedTabId = tabId;
        const tab = getTab(tabId);
        
        if (tab && typeof showTabDetail === 'function') {
            showTabDetail(tab);
        }
        
        render();
    }
    
    async function createTab(customerName, customerId = null, items = [], options = {}) {
        if (typeof TabsSync !== 'undefined') {
            const tab = await TabsSync.createTab(
                customerName, 
                customerId, 
                items, 
                options.employee || 'Staff',
                options
            );
            render();
            return tab;
        }
        
        // Fallback to local
        const tabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
        const newTab = {
            id: 'TAB-' + Date.now(),
            customer: customerName,
            customerId: customerId,
            items: items,
            subtotal: items.reduce((sum, i) => sum + (i.price * (i.qty || 1)), 0),
            status: 'open',
            openedAt: new Date().toISOString(),
            openedBy: options.employee || 'Staff'
        };
        newTab.tax = newTab.subtotal * (window.GolfCoveConfig?.pricing?.taxRate ?? 0.0635);
        newTab.total = newTab.subtotal + newTab.tax;
        
        tabs.push(newTab);
        localStorage.setItem('gc_tabs', JSON.stringify(tabs));
        render();
        return newTab;
    }
    
    async function addItemsToTab(tabId, items, employee = 'Staff') {
        if (typeof TabsSync !== 'undefined') {
            await TabsSync.addItemsToTab(tabId, items, employee);
            render();
            return getTab(tabId);
        }
        
        // Fallback
        const tabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
        const idx = tabs.findIndex(t => t.id === tabId);
        if (idx === -1) return null;
        
        tabs[idx].items = [...(tabs[idx].items || []), ...items];
        tabs[idx].subtotal = tabs[idx].items.reduce((sum, i) => sum + (i.price * (i.qty || 1)), 0);
        tabs[idx].tax = tabs[idx].subtotal * (window.GolfCoveConfig?.pricing?.taxRate ?? 0.0635);
        tabs[idx].total = tabs[idx].subtotal + tabs[idx].tax;
        
        localStorage.setItem('gc_tabs', JSON.stringify(tabs));
        render();
        return tabs[idx];
    }
    
    async function closeTab(tabId, paymentMethod = 'card', tip = 0) {
        if (typeof TabsSync !== 'undefined') {
            await TabsSync.closeTab(tabId, paymentMethod, tip);
            selectedTabId = null;
            render();
            return true;
        }
        
        // Fallback
        let tabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
        tabs = tabs.filter(t => t.id !== tabId);
        localStorage.setItem('gc_tabs', JSON.stringify(tabs));
        selectedTabId = null;
        render();
        return true;
    }
    
    async function voidTab(tabId, reason = '') {
        if (typeof TabsSync !== 'undefined') {
            await TabsSync.voidTab(tabId, reason);
            selectedTabId = null;
            render();
            return true;
        }
        
        // Fallback
        let tabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
        tabs = tabs.filter(t => t.id !== tabId);
        localStorage.setItem('gc_tabs', JSON.stringify(tabs));
        selectedTabId = null;
        render();
        return true;
    }
    
    // ============ EVENT HANDLERS ============
    function handleTabUpdate(event, data) {
        console.log('[TabsManager] Tab update:', event, data);
        render();
    }
    
    // ============ PUBLIC API ============
    return {
        init,
        render,
        selectTab,
        createTab,
        addItemsToTab,
        closeTab,
        voidTab,
        getTabs,
        getTab,
        getSelectedTabId: () => selectedTabId
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TabsManager;
}
