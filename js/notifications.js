/**
 * Golf Cove - Notification System
 * Toast notifications, alerts, and confirmation dialogs
 */

const GolfCoveNotifications = (function() {
    'use strict';
    
    const Core = GolfCoveCore;
    
    // ============ CONFIGURATION ============
    const config = {
        position: 'top-right', // top-left, top-right, bottom-left, bottom-right, top-center, bottom-center
        maxToasts: 5,
        defaultDuration: 4000,
        animationDuration: 300
    };
    
    let container = null;
    const toasts = [];
    
    // ============ STYLES ============
    const styles = `
        .gc-notification-container {
            position: fixed;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 16px;
            pointer-events: none;
            max-height: 100vh;
            overflow: hidden;
        }
        
        .gc-notification-container.top-left { top: 0; left: 0; }
        .gc-notification-container.top-right { top: 0; right: 0; }
        .gc-notification-container.top-center { top: 0; left: 50%; transform: translateX(-50%); }
        .gc-notification-container.bottom-left { bottom: 0; left: 0; flex-direction: column-reverse; }
        .gc-notification-container.bottom-right { bottom: 0; right: 0; flex-direction: column-reverse; }
        .gc-notification-container.bottom-center { bottom: 0; left: 50%; transform: translateX(-50%); flex-direction: column-reverse; }
        
        .gc-toast {
            min-width: 320px;
            max-width: 420px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
            padding: 16px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            pointer-events: auto;
            transform: translateX(120%);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .gc-notification-container.top-left .gc-toast,
        .gc-notification-container.bottom-left .gc-toast {
            transform: translateX(-120%);
        }
        
        .gc-notification-container.top-center .gc-toast,
        .gc-notification-container.bottom-center .gc-toast {
            transform: translateY(-20px);
        }
        
        .gc-toast.gc-toast-visible {
            transform: translateX(0) translateY(0);
            opacity: 1;
        }
        
        .gc-toast.gc-toast-removing {
            transform: translateX(120%);
            opacity: 0;
        }
        
        .gc-toast-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 14px;
        }
        
        .gc-toast-success .gc-toast-icon { background: #dcfce7; color: #16a34a; }
        .gc-toast-error .gc-toast-icon { background: #fee2e2; color: #dc2626; }
        .gc-toast-warning .gc-toast-icon { background: #fef3c7; color: #d97706; }
        .gc-toast-info .gc-toast-icon { background: #dbeafe; color: #2563eb; }
        
        .gc-toast-content {
            flex: 1;
            min-width: 0;
        }
        
        .gc-toast-title {
            font-weight: 600;
            font-size: 14px;
            color: #1f2937;
            margin-bottom: 2px;
        }
        
        .gc-toast-message {
            font-size: 13px;
            color: #6b7280;
            line-height: 1.4;
        }
        
        .gc-toast-close {
            width: 24px;
            height: 24px;
            border: none;
            background: none;
            cursor: pointer;
            color: #9ca3af;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.2s;
            flex-shrink: 0;
        }
        
        .gc-toast-close:hover {
            background: #f3f4f6;
            color: #4b5563;
        }
        
        .gc-toast-progress {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: currentColor;
            border-radius: 0 0 12px 12px;
            opacity: 0.3;
            transition: width linear;
        }
        
        .gc-toast-actions {
            display: flex;
            gap: 8px;
            margin-top: 10px;
        }
        
        .gc-toast-action {
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
        }
        
        .gc-toast-action-primary {
            background: #3b82f6;
            color: white;
        }
        
        .gc-toast-action-primary:hover {
            background: #2563eb;
        }
        
        .gc-toast-action-secondary {
            background: #f3f4f6;
            color: #374151;
        }
        
        .gc-toast-action-secondary:hover {
            background: #e5e7eb;
        }
        
        /* Modal Styles */
        .gc-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            opacity: 0;
            transition: opacity 0.2s;
            backdrop-filter: blur(4px);
        }
        
        .gc-modal-overlay.gc-modal-visible {
            opacity: 1;
        }
        
        .gc-modal {
            background: white;
            border-radius: 16px;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            transform: scale(0.95) translateY(10px);
            transition: transform 0.2s;
        }
        
        .gc-modal-overlay.gc-modal-visible .gc-modal {
            transform: scale(1) translateY(0);
        }
        
        .gc-modal-header {
            padding: 20px 24px 0;
            display: flex;
            align-items: center;
            gap: 16px;
        }
        
        .gc-modal-icon {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            flex-shrink: 0;
        }
        
        .gc-modal-confirm .gc-modal-icon { background: #dbeafe; color: #2563eb; }
        .gc-modal-danger .gc-modal-icon { background: #fee2e2; color: #dc2626; }
        .gc-modal-warning .gc-modal-icon { background: #fef3c7; color: #d97706; }
        .gc-modal-success .gc-modal-icon { background: #dcfce7; color: #16a34a; }
        
        .gc-modal-body {
            padding: 20px 24px;
        }
        
        .gc-modal-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 8px;
        }
        
        .gc-modal-message {
            font-size: 14px;
            color: #6b7280;
            line-height: 1.5;
        }
        
        .gc-modal-input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 14px;
            margin-top: 16px;
            transition: border-color 0.2s;
        }
        
        .gc-modal-input:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
        }
        
        .gc-modal-footer {
            padding: 16px 24px 20px;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        }
        
        .gc-modal-btn {
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
        }
        
        .gc-modal-btn-cancel {
            background: #f3f4f6;
            color: #374151;
        }
        
        .gc-modal-btn-cancel:hover {
            background: #e5e7eb;
        }
        
        .gc-modal-btn-confirm {
            background: #3b82f6;
            color: white;
        }
        
        .gc-modal-btn-confirm:hover {
            background: #2563eb;
        }
        
        .gc-modal-btn-danger {
            background: #dc2626;
            color: white;
        }
        
        .gc-modal-btn-danger:hover {
            background: #b91c1c;
        }
        
        @media (max-width: 480px) {
            .gc-notification-container {
                padding: 12px;
            }
            
            .gc-toast {
                min-width: calc(100vw - 24px);
            }
        }
    `;
    
    // ============ ICONS ============
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ',
        question: '?',
        close: '×'
    };
    
    // ============ INITIALIZATION ============
    function init() {
        if (container) return;
        
        // Inject styles
        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
        
        // Create container
        container = document.createElement('div');
        container.className = `gc-notification-container ${config.position}`;
        document.body.appendChild(container);
    }
    
    // ============ TOAST FUNCTIONS ============
    function createToast(options) {
        const {
            type = 'info',
            title = '',
            message = '',
            duration = config.defaultDuration,
            closable = true,
            actions = [],
            progress = true
        } = options;
        
        const id = Core.generateId('toast');
        
        const toast = document.createElement('div');
        toast.className = `gc-toast gc-toast-${type}`;
        toast.id = id;
        
        let html = `
            <div class="gc-toast-icon">${icons[type]}</div>
            <div class="gc-toast-content">
                ${title ? `<div class="gc-toast-title">${title}</div>` : ''}
                <div class="gc-toast-message">${message}</div>
                ${actions.length > 0 ? `
                    <div class="gc-toast-actions">
                        ${actions.map((action, i) => `
                            <button class="gc-toast-action gc-toast-action-${i === 0 ? 'primary' : 'secondary'}"
                                    data-action="${i}">${action.label}</button>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            ${closable ? `<button class="gc-toast-close" aria-label="Close">${icons.close}</button>` : ''}
        `;
        
        if (progress && duration > 0) {
            html += `<div class="gc-toast-progress" style="width: 100%; transition-duration: ${duration}ms;"></div>`;
        }
        
        toast.innerHTML = html;
        
        // Event listeners
        if (closable) {
            toast.querySelector('.gc-toast-close').addEventListener('click', () => {
                removeToast(id);
            });
        }
        
        actions.forEach((action, i) => {
            const btn = toast.querySelector(`[data-action="${i}"]`);
            if (btn) {
                btn.addEventListener('click', () => {
                    if (action.onClick) action.onClick();
                    if (action.closeOnClick !== false) removeToast(id);
                });
            }
        });
        
        return { id, element: toast, duration };
    }
    
    function showToast(options) {
        init();
        
        // Limit visible toasts
        while (toasts.length >= config.maxToasts) {
            removeToast(toasts[0].id);
        }
        
        const toast = createToast(options);
        toasts.push(toast);
        container.appendChild(toast.element);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.element.classList.add('gc-toast-visible');
            
            // Start progress bar
            const progressBar = toast.element.querySelector('.gc-toast-progress');
            if (progressBar) {
                requestAnimationFrame(() => {
                    progressBar.style.width = '0%';
                });
            }
        });
        
        // Auto-remove
        if (toast.duration > 0) {
            toast.timeout = setTimeout(() => {
                removeToast(toast.id);
            }, toast.duration);
        }
        
        Core.emit('notification:show', { id: toast.id, type: options.type });
        
        return toast.id;
    }
    
    function removeToast(id) {
        const index = toasts.findIndex(t => t.id === id);
        if (index === -1) return;
        
        const toast = toasts[index];
        
        if (toast.timeout) {
            clearTimeout(toast.timeout);
        }
        
        toast.element.classList.remove('gc-toast-visible');
        toast.element.classList.add('gc-toast-removing');
        
        setTimeout(() => {
            toast.element.remove();
            toasts.splice(index, 1);
        }, config.animationDuration);
        
        Core.emit('notification:hide', { id });
    }
    
    function clearAll() {
        toasts.forEach(toast => removeToast(toast.id));
    }
    
    // ============ CONVENIENCE METHODS ============
    const success = (message, options = {}) => 
        showToast({ type: 'success', message, title: options.title || 'Success', ...options });
    
    const error = (message, options = {}) => 
        showToast({ type: 'error', message, title: options.title || 'Error', duration: 6000, ...options });
    
    const warning = (message, options = {}) => 
        showToast({ type: 'warning', message, title: options.title || 'Warning', ...options });
    
    const info = (message, options = {}) => 
        showToast({ type: 'info', message, ...options });
    
    // ============ MODAL DIALOGS ============
    function showModal(options) {
        return new Promise((resolve) => {
            const {
                type = 'confirm',
                title = '',
                message = '',
                input = null,
                confirmText = 'Confirm',
                cancelText = 'Cancel',
                showCancel = true,
                danger = false
            } = options;
            
            const overlay = document.createElement('div');
            overlay.className = `gc-modal-overlay gc-modal-${type}`;
            
            overlay.innerHTML = `
                <div class="gc-modal">
                    <div class="gc-modal-header">
                        <div class="gc-modal-icon">${icons[type] || icons.question}</div>
                    </div>
                    <div class="gc-modal-body">
                        <div class="gc-modal-title">${title}</div>
                        <div class="gc-modal-message">${message}</div>
                        ${input ? `
                            <input type="${input.type || 'text'}" 
                                   class="gc-modal-input" 
                                   placeholder="${input.placeholder || ''}"
                                   value="${input.value || ''}">
                        ` : ''}
                    </div>
                    <div class="gc-modal-footer">
                        ${showCancel ? `
                            <button class="gc-modal-btn gc-modal-btn-cancel">${cancelText}</button>
                        ` : ''}
                        <button class="gc-modal-btn ${danger ? 'gc-modal-btn-danger' : 'gc-modal-btn-confirm'}">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            
            // Focus input if present
            const inputEl = overlay.querySelector('.gc-modal-input');
            if (inputEl) {
                setTimeout(() => inputEl.focus(), 100);
            }
            
            // Animate in
            requestAnimationFrame(() => {
                overlay.classList.add('gc-modal-visible');
            });
            
            // Handle close
            const closeModal = (result) => {
                overlay.classList.remove('gc-modal-visible');
                setTimeout(() => overlay.remove(), 200);
                resolve(result);
            };
            
            // Event listeners
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal({ confirmed: false });
                }
            });
            
            const cancelBtn = overlay.querySelector('.gc-modal-btn-cancel');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => closeModal({ confirmed: false }));
            }
            
            const confirmBtn = overlay.querySelector('.gc-modal-btn-confirm, .gc-modal-btn-danger');
            confirmBtn.addEventListener('click', () => {
                const value = inputEl ? inputEl.value : null;
                closeModal({ confirmed: true, value });
            });
            
            // Handle Enter key
            if (inputEl) {
                inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        closeModal({ confirmed: true, value: inputEl.value });
                    }
                });
            }
            
            // Handle Escape
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    closeModal({ confirmed: false });
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }
    
    // ============ MODAL CONVENIENCE METHODS ============
    const confirm = (title, message, options = {}) =>
        showModal({ type: 'confirm', title, message, ...options });
    
    const alert = (title, message, options = {}) =>
        showModal({ type: 'warning', title, message, showCancel: false, confirmText: 'OK', ...options });
    
    const prompt = (title, message, options = {}) =>
        showModal({ 
            type: 'info', 
            title, 
            message, 
            input: { type: 'text', ...options.input },
            ...options 
        });
    
    const danger = (title, message, options = {}) =>
        showModal({ type: 'danger', title, message, danger: true, ...options });
    
    // ============ PUBLIC API ============
    return {
        init,
        show: showToast,
        success,
        error,
        warning,
        info,
        remove: removeToast,
        clearAll,
        
        // Modals
        modal: showModal,
        confirm,
        alert,
        prompt,
        danger,
        
        // Config
        setPosition: (position) => {
            config.position = position;
            if (container) {
                container.className = `gc-notification-container ${position}`;
            }
        }
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.GolfCoveNotifications = GolfCoveNotifications;
    window.$notify = GolfCoveNotifications; // Short alias
}
