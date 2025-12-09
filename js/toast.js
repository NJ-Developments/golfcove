/**
 * Golf Cove - Toast Notification System
 * Simple, reusable toast notifications
 */

const GolfCoveToast = (function() {
    'use strict';
    
    // Configuration
    const config = {
        duration: 3000,
        position: 'top-right', // top-right, top-left, bottom-right, bottom-left
        maxVisible: 5
    };
    
    // Toast container
    let container = null;
    
    function init() {
        if (container) return;
        
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 350px;
        `;
        
        setPosition(config.position);
        document.body.appendChild(container);
    }
    
    function setPosition(position) {
        if (!container) return;
        
        const positions = {
            'top-right': 'top: 20px; right: 20px;',
            'top-left': 'top: 20px; left: 20px;',
            'bottom-right': 'bottom: 20px; right: 20px;',
            'bottom-left': 'bottom: 20px; left: 20px;',
            'top-center': 'top: 20px; left: 50%; transform: translateX(-50%);',
            'bottom-center': 'bottom: 20px; left: 50%; transform: translateX(-50%);'
        };
        
        container.style.cssText += positions[position] || positions['top-right'];
    }
    
    function show(message, type = 'info', duration = config.duration) {
        init();
        
        // Limit visible toasts
        while (container.children.length >= config.maxVisible) {
            container.removeChild(container.firstChild);
        }
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const colors = {
            success: { bg: '#27ae60', icon: 'fa-check-circle' },
            error: { bg: '#e74c3c', icon: 'fa-exclamation-circle' },
            warning: { bg: '#f39c12', icon: 'fa-exclamation-triangle' },
            info: { bg: '#3498db', icon: 'fa-info-circle' }
        };
        
        const color = colors[type] || colors.info;
        
        toast.style.cssText = `
            background: ${color.bg};
            color: #fff;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideIn 0.3s ease;
            cursor: pointer;
            min-width: 250px;
        `;
        
        toast.innerHTML = `
            <i class="fas ${color.icon}" style="font-size:18px;"></i>
            <span style="flex:1;font-size:14px;">${message}</span>
            <i class="fas fa-times" style="opacity:0.7;font-size:12px;"></i>
        `;
        
        // Click to dismiss
        toast.addEventListener('click', () => dismiss(toast));
        
        container.appendChild(toast);
        
        // Auto dismiss
        if (duration > 0) {
            setTimeout(() => dismiss(toast), duration);
        }
        
        return toast;
    }
    
    function dismiss(toast) {
        if (!toast || !toast.parentNode) return;
        
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }
    
    function success(message, duration) {
        return show(message, 'success', duration);
    }
    
    function error(message, duration) {
        return show(message, 'error', duration);
    }
    
    function warning(message, duration) {
        return show(message, 'warning', duration);
    }
    
    function info(message, duration) {
        return show(message, 'info', duration);
    }
    
    function clear() {
        if (container) {
            container.innerHTML = '';
        }
    }
    
    // Add required CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Public API
    return {
        show,
        success,
        error,
        warning,
        info,
        dismiss,
        clear,
        config
    };
})();

// Shorthand function for backward compatibility
function showToast(message, type = 'info') {
    return GolfCoveToast.show(message, type);
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveToast;
}
