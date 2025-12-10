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
        return JSON.parse(localStorage.getItem('gc_tabs') || '[]')
            .filter(t => t.status === 'open' || !t.status);
    }
    
    function getTab(tabId) {
        if (typeof TabsSync !== 'undefined') {
            return TabsSync.getTab(tabId);
        }
        return getTabs().find(t => t.id === tabId);
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
        
        container.innerHTML = tabs.map(tab => {
            const isMember = tab.isMember || false;
            const isVIP = tab.isVIP || false;
            const itemCount = (tab.items || []).length;
            const total = tab.total || 0;
            
            let tabClass = 'tab-item';
            if (isVIP) tabClass += ' vip';
            else if (isMember) tabClass += ' member';
            if (tab.id === selectedTabId) tabClass += ' selected';
            
            const tierColors = {
                'par': '#3498db', 
                'birdie': '#9b59b6', 
                'eagle': '#f1c40f',
                'family_par': '#3498db', 
                'family_birdie': '#9b59b6', 
                'family_eagle': '#f1c40f',
                'corporate': '#2c3e50'
            };
            const tierColor = tierColors[tab.memberType] || '#27ae60';
            
            let memberBadge = '';
            if (isMember && tab.memberType) {
                memberBadge = `
                    <span class="tab-member-badge" style="background:${tierColor};">
                        <i class="fas fa-crown"></i> ${tab.memberType.replace('_', ' ')}
                    </span>
                `;
            }
            
            const timeOpen = getTimeOpen(tab.openedAt);
            
            return `
                <div class="${tabClass}" onclick="TabsManager.selectTab('${tab.id}')" style="${isMember ? 'border-left:3px solid ' + tierColor : ''}">
                    <div class="tab-left">
                        <div class="tab-customer">
                            ${tab.customer}
                            ${memberBadge}
                        </div>
                        <div class="tab-info">
                            ${itemCount} item${itemCount !== 1 ? 's' : ''} • ${timeOpen}
                        </div>
                        ${tab.memberDiscount ? `<div class="tab-discount">${tab.memberDiscount}% member discount</div>` : ''}
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
        newTab.tax = newTab.subtotal * 0.0635;
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
        tabs[idx].tax = tabs[idx].subtotal * 0.0635;
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
