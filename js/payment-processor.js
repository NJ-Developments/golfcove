/**
 * Golf Cove - Payment Processor
 * Handles payment modal, calculations, and processing
 */

const PaymentProcessor = (function() {
    'use strict';
    
    // ============ CONSTANTS ============
    // Use unified config for tax rate
    const getTaxRate = () => window.GolfCoveConfig?.pricing?.taxRate ?? 0.0635;
    
    const PAYMENT_METHODS = [
        { id: 'card', name: 'Card', icon: 'fa-credit-card' },
        { id: 'cash', name: 'Cash', icon: 'fa-money-bill-wave' },
        { id: 'gift', name: 'Gift Card', icon: 'fa-gift' },
        { id: 'tab', name: 'Add to Tab', icon: 'fa-receipt' },
        { id: 'member', name: 'Member Charge', icon: 'fa-crown' },
        { id: 'split', name: 'Split Pay', icon: 'fa-divide' }
    ];
    
    // Use unified config for tip presets if available
    const getTipPresets = () => {
        const presets = window.GolfCoveConfig?.pricing?.tipPresets ?? [15, 18, 20, 25];
        return presets.map(p => ({ percent: p, label: `${p}%` }));
    };
    
    // Production limits
    const MAX_TRANSACTION = 50000; // $50,000 max single transaction
    const MIN_TRANSACTION = 0.01;
    const MAX_TIP_PERCENT = 100;
    const PAYMENT_TIMEOUT = 60000; // 60 second timeout
    
    // Validation helpers
    function validateAmount(amount, field = 'amount') {
        const num = parseFloat(amount);
        if (isNaN(num)) {
            console.error(`Invalid ${field}: not a number`);
            return null;
        }
        if (num < 0) {
            console.error(`Invalid ${field}: negative value`);
            return null;
        }
        if (num > MAX_TRANSACTION) {
            console.error(`${field} exceeds maximum: ${MAX_TRANSACTION}`);
            return null;
        }
        return Math.round(num * 100) / 100;
    }
    
    function sanitizeInput(str, maxLen = 100) {
        if (typeof str !== 'string') return '';
        return str.trim().substring(0, maxLen).replace(/[<>"']/g, '');
    }
    
    // State
    let paymentInProgress = false;
    let paymentTimeoutId = null;
    let currentTotal = 0;
    let currentSubtotal = 0;
    let currentTax = 0;
    let currentDiscount = 0;
    let selectedTip = 0;
    let selectedPaymentMethod = 'card';
    let onCompleteCallback = null;
    
    // ============ INITIALIZATION ============
    function init() {
        // Nothing needed at init
    }
    
    // ============ CALCULATIONS ============
    function calculateTotals(subtotal, discountPercent = 0, tipAmount = 0) {
        // Validate inputs
        const validSubtotal = validateAmount(subtotal, 'subtotal');
        if (validSubtotal === null || validSubtotal < MIN_TRANSACTION) {
            return { error: 'Invalid subtotal', subtotal: 0, total: 0 };
        }
        
        // Clamp discount to valid range
        let validDiscount = parseFloat(discountPercent) || 0;
        validDiscount = Math.max(0, Math.min(100, validDiscount));
        
        // Clamp tip to reasonable range
        let validTip = parseFloat(tipAmount) || 0;
        const maxTip = validSubtotal * (MAX_TIP_PERCENT / 100);
        validTip = Math.max(0, Math.min(maxTip, validTip));
        
        const taxRate = getTaxRate();
        const discount = validSubtotal * (validDiscount / 100);
        const taxableAmount = validSubtotal - discount;
        const tax = Math.round(taxableAmount * taxRate * 100) / 100; // Round to cents
        const total = Math.round((taxableAmount + tax + validTip) * 100) / 100;
        
        // Final validation
        if (total > MAX_TRANSACTION) {
            return { error: 'Transaction exceeds maximum limit', subtotal: validSubtotal, total: 0 };
        }
        
        return {
            subtotal: subtotal,
            discount: discount,
            discountPercent: discountPercent,
            taxableAmount: taxableAmount,
            tax: tax,
            taxRate: taxRate,
            tip: tipAmount,
            total: total
        };
    }
    
    // Use shared formatCurrency from GolfCoveUtils if available
    const formatCurrency = (amount) => typeof GolfCoveUtils !== 'undefined' 
        ? GolfCoveUtils.formatCurrency(amount) 
        : '$' + amount.toFixed(2);
    
    // ============ MODAL ============
    function showPaymentModal(subtotal, options = {}) {
        // Prevent duplicate modals
        if (paymentInProgress) {
            showToast('Payment already in progress', 'error');
            return;
        }
        
        // Validate subtotal
        const validSubtotal = validateAmount(subtotal, 'subtotal');
        if (validSubtotal === null || validSubtotal < MIN_TRANSACTION) {
            showToast('Invalid payment amount', 'error');
            return;
        }
        
        currentSubtotal = validSubtotal;
        currentDiscount = Math.max(0, Math.min(100, parseFloat(options.discountPercent) || 0));
        onCompleteCallback = typeof options.onComplete === 'function' ? options.onComplete : null;
        selectedTip = 0;
        selectedPaymentMethod = 'card';
        paymentInProgress = true;
        
        // Set payment timeout
        paymentTimeoutId = setTimeout(() => {
            showToast('Payment timed out', 'error');
            closeModal();
        }, PAYMENT_TIMEOUT);
        
        const totals = calculateTotals(subtotal, currentDiscount, 0);
        currentTax = totals.tax;
        currentTotal = totals.total;
        
        // Build modal HTML
        const modalHtml = `
            <div class="payment-modal-overlay" id="paymentModalOverlay" onclick="PaymentProcessor.closeModal()">
                <div class="payment-modal" onclick="event.stopPropagation()">
                    <button class="payment-modal-close" onclick="PaymentProcessor.closeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                    
                    <div class="payment-header">
                        <h2><i class="fas fa-cash-register"></i> Complete Payment</h2>
                    </div>
                    
                    <!-- Order Summary -->
                    <div class="payment-summary">
                        <div class="summary-row">
                            <span>Subtotal</span>
                            <span id="paySubtotal">${formatCurrency(subtotal)}</span>
                        </div>
                        ${currentDiscount > 0 ? `
                        <div class="summary-row discount">
                            <span>Discount (${currentDiscount}%)</span>
                            <span id="payDiscount">-${formatCurrency(totals.discount)}</span>
                        </div>
                        ` : ''}
                        <div class="summary-row">
                            <span>Tax (${((GolfCoveConfig?.pricing?.taxRate ?? 0.0635) * 100).toFixed(2).replace(/\.?0+$/, '')}%)</span>
                            <span id="payTax">${formatCurrency(totals.tax)}</span>
                        </div>
                        <div class="summary-row tip-row" id="tipRow" style="display:none;">
                            <span>Tip</span>
                            <span id="payTip">$0.00</span>
                        </div>
                        <div class="summary-row total">
                            <span>Total</span>
                            <span id="payTotal">${formatCurrency(totals.total)}</span>
                        </div>
                    </div>
                    
                    <!-- Tip Selection -->
                    <div class="tip-section" id="tipSection">
                        <label>Add Tip</label>
                        <div class="tip-buttons">
                            <button class="tip-btn" onclick="PaymentProcessor.setTipPercent(0)">No Tip</button>
                            ${getTipPresets().map(t => `
                                <button class="tip-btn" onclick="PaymentProcessor.setTipPercent(${t.percent})">${t.label}</button>
                            `).join('')}
                            <button class="tip-btn" onclick="PaymentProcessor.showCustomTip()">Custom</button>
                        </div>
                        <div class="custom-tip" id="customTipInput" style="display:none;">
                            <input type="number" id="customTipAmount" placeholder="Enter tip amount" min="0" step="0.01">
                            <button onclick="PaymentProcessor.applyCustomTip()">Apply</button>
                        </div>
                    </div>
                    
                    <!-- Payment Methods -->
                    <div class="payment-methods">
                        <label>Payment Method</label>
                        <div class="method-buttons">
                            ${PAYMENT_METHODS.map(m => `
                                <button class="method-btn ${m.id === 'card' ? 'active' : ''}" 
                                        data-method="${m.id}" 
                                        onclick="PaymentProcessor.selectMethod('${m.id}')">
                                    <i class="fas ${m.icon}"></i>
                                    <span>${m.name}</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Cash Tendered (for cash payments) -->
                    <div class="cash-section" id="cashSection" style="display:none;">
                        <label>Cash Tendered</label>
                        <div class="cash-input-row">
                            <input type="number" id="cashTendered" placeholder="0.00" min="0" step="0.01" oninput="PaymentProcessor.updateChange()">
                        </div>
                        <div class="quick-cash">
                            <button onclick="PaymentProcessor.setCashAmount(20)">$20</button>
                            <button onclick="PaymentProcessor.setCashAmount(50)">$50</button>
                            <button onclick="PaymentProcessor.setCashAmount(100)">$100</button>
                            <button onclick="PaymentProcessor.setExactCash()">Exact</button>
                        </div>
                        <div class="change-due" id="changeDue" style="display:none;">
                            Change Due: <span id="changeAmount">$0.00</span>
                        </div>
                    </div>
                    
                    <!-- Gift Card (for gift card payments) -->
                    <div class="gift-section" id="giftSection" style="display:none;">
                        <label>Gift Card Number</label>
                        <input type="text" id="giftCardNumber" placeholder="Enter gift card code">
                        <button onclick="PaymentProcessor.lookupGiftCard()">Look Up Balance</button>
                        <div id="giftCardBalance" style="display:none;"></div>
                    </div>
                    
                    <!-- Split Pay -->
                    <div class="split-section" id="splitSection" style="display:none;">
                        <label>Split Payment</label>
                        <div class="split-inputs">
                            <div class="split-row">
                                <span>Card 1:</span>
                                <input type="number" id="splitCard1" value="0" min="0" step="0.01">
                            </div>
                            <div class="split-row">
                                <span>Card 2:</span>
                                <input type="number" id="splitCard2" value="0" min="0" step="0.01">
                            </div>
                            <div class="split-row">
                                <span>Cash:</span>
                                <input type="number" id="splitCash" value="0" min="0" step="0.01">
                            </div>
                        </div>
                        <button onclick="PaymentProcessor.splitEvenly()">Split Evenly</button>
                    </div>
                    
                    <!-- Complete Button -->
                    <button class="complete-payment-btn" onclick="PaymentProcessor.processPayment()">
                        <i class="fas fa-check-circle"></i>
                        Complete Payment
                    </button>
                </div>
            </div>
        `;
        
        // Insert modal
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Add styles if not present
        if (!document.getElementById('payment-processor-styles')) {
            addStyles();
        }
    }
    
    function closeModal() {
        const overlay = document.getElementById('paymentModalOverlay');
        if (overlay) overlay.remove();
        
        // Clear timeout and state
        if (paymentTimeoutId) {
            clearTimeout(paymentTimeoutId);
            paymentTimeoutId = null;
        }
        paymentInProgress = false;
    }
    
    // ============ TIP HANDLING ============
    function setTipPercent(percent) {
        selectedTip = currentSubtotal * (percent / 100);
        updateTotals();
        
        // Update button states
        document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));
        event.target.classList.add('active');
    }
    
    function showCustomTip() {
        document.getElementById('customTipInput').style.display = 'flex';
    }
    
    function applyCustomTip() {
        const input = document.getElementById('customTipAmount');
        const amount = validateAmount(input?.value, 'tip');
        
        if (amount === null) {
            showToast('Invalid tip amount', 'error');
            return;
        }
        
        // Cap tip at 100% of subtotal
        const maxTip = currentSubtotal * (MAX_TIP_PERCENT / 100);
        if (amount > maxTip) {
            showToast(`Tip cannot exceed ${formatCurrency(maxTip)}`, 'error');
            return;
        }
        
        selectedTip = amount;
        updateTotals();
        document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));
    }
    
    // ============ PAYMENT METHOD ============
    function selectMethod(method) {
        selectedPaymentMethod = method;
        
        // Update button states
        document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`[data-method="${method}"]`).classList.add('active');
        
        // Show/hide relevant sections
        document.getElementById('cashSection').style.display = method === 'cash' ? 'block' : 'none';
        document.getElementById('giftSection').style.display = method === 'gift' ? 'block' : 'none';
        document.getElementById('splitSection').style.display = method === 'split' ? 'block' : 'none';
        document.getElementById('tipSection').style.display = (method === 'cash' || method === 'card') ? 'block' : 'none';
    }
    
    // ============ CASH HANDLING ============
    function setCashAmount(amount) {
        document.getElementById('cashTendered').value = amount.toFixed(2);
        updateChange();
    }
    
    function setExactCash() {
        document.getElementById('cashTendered').value = currentTotal.toFixed(2);
        updateChange();
    }
    
    function updateChange() {
        const tendered = parseFloat(document.getElementById('cashTendered').value) || 0;
        const change = tendered - currentTotal;
        
        const changeDue = document.getElementById('changeDue');
        const changeAmount = document.getElementById('changeAmount');
        
        if (tendered > 0 && change >= 0) {
            changeDue.style.display = 'block';
            changeAmount.textContent = formatCurrency(change);
            changeAmount.style.color = change > 0 ? '#27ae60' : '#333';
        } else {
            changeDue.style.display = 'none';
        }
    }
    
    // ============ GIFT CARD ============
    function lookupGiftCard() {
        const code = document.getElementById('giftCardNumber').value;
        if (!code) {
            showToast('Please enter a gift card code', 'error');
            return;
        }
        
        // Check localStorage for gift cards
        const giftCards = JSON.parse(localStorage.getItem('gc_giftcards') || '[]');
        const card = giftCards.find(g => g.code === code);
        
        const balanceDiv = document.getElementById('giftCardBalance');
        if (card && card.balance > 0) {
            balanceDiv.style.display = 'block';
            balanceDiv.innerHTML = `<span style="color:#27ae60;">Balance: ${formatCurrency(card.balance)}</span>`;
        } else {
            balanceDiv.style.display = 'block';
            balanceDiv.innerHTML = `<span style="color:#e74c3c;">Card not found or no balance</span>`;
        }
    }
    
    // ============ SPLIT PAY ============
    function splitEvenly() {
        const half = currentTotal / 2;
        document.getElementById('splitCard1').value = half.toFixed(2);
        document.getElementById('splitCard2').value = half.toFixed(2);
        document.getElementById('splitCash').value = '0';
    }
    
    // ============ UPDATE TOTALS ============
    function updateTotals() {
        const totals = calculateTotals(currentSubtotal, currentDiscount, selectedTip);
        currentTotal = totals.total;
        
        document.getElementById('payTotal').textContent = formatCurrency(totals.total);
        
        const tipRow = document.getElementById('tipRow');
        if (selectedTip > 0) {
            tipRow.style.display = 'flex';
            document.getElementById('payTip').textContent = formatCurrency(selectedTip);
        } else {
            tipRow.style.display = 'none';
        }
    }
    
    // ============ PROCESS PAYMENT ============
    async function processPayment() {
        // Prevent double-submit
        if (!paymentInProgress) {
            showToast('No payment in progress', 'error');
            return;
        }
        
        // Generate idempotency key
        const idempotencyKey = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Validate final amount
        if (currentTotal < MIN_TRANSACTION) {
            showToast('Invalid payment amount', 'error');
            return;
        }
        
        if (currentTotal > MAX_TRANSACTION) {
            showToast('Transaction exceeds maximum limit', 'error');
            return;
        }
        
        // Disable button to prevent double-clicks
        const completeBtn = document.querySelector('.complete-payment-btn');
        if (completeBtn) {
            completeBtn.disabled = true;
            completeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        }
        
        try {
            let paymentResult;
            
            // ============ CARD PAYMENT (STRIPE TERMINAL) ============
            if (selectedPaymentMethod === 'card') {
                // Check if GolfCovePayment service is available
                if (typeof GolfCovePayment !== 'undefined') {
                    paymentResult = await GolfCovePayment.processPayment(currentTotal, {
                        method: 'card_present',
                        items: currentItems || [],
                        metadata: {
                            subtotal: currentSubtotal,
                            tax: currentTax,
                            tip: selectedTip,
                            discount: currentDiscount,
                            idempotencyKey
                        }
                    });
                    
                    if (!paymentResult.success) {
                        showToast(paymentResult.error?.message || 'Card payment failed', 'error');
                        resetPaymentButton(completeBtn);
                        return;
                    }
                } else if (typeof GolfCoveStripe !== 'undefined' && GolfCoveStripe.isReaderConnected()) {
                    // Fallback to direct Stripe Terminal call
                    paymentResult = await GolfCoveStripe.collectPayment(currentTotal, {
                        tip: selectedTip,
                        subtotal: currentSubtotal,
                        tax: currentTax
                    });
                    
                    if (!paymentResult.success) {
                        showToast(paymentResult.error || 'Card payment failed', 'error');
                        resetPaymentButton(completeBtn);
                        return;
                    }
                }
                // If no terminal connected, continue with simulated success for testing
            }
            
            // ============ CASH PAYMENT ============
            if (selectedPaymentMethod === 'cash') {
                const tendered = parseFloat(document.getElementById('cashTendered')?.value) || 0;
                if (tendered < currentTotal) {
                    showToast('Insufficient cash tendered', 'error');
                    resetPaymentButton(completeBtn);
                    return;
                }
                // Validate reasonable cash amount
                if (tendered > currentTotal * 10) {
                    showToast('Cash amount seems incorrect. Please verify.', 'error');
                    resetPaymentButton(completeBtn);
                    return;
                }
                
                if (typeof GolfCovePayment !== 'undefined') {
                    paymentResult = await GolfCovePayment.processCashPayment(currentTotal, { tendered });
                } else {
                    paymentResult = { success: true, change: tendered - currentTotal };
                }
            }
            
            // ============ GIFT CARD PAYMENT ============
            if (selectedPaymentMethod === 'gift') {
                const code = document.getElementById('giftCardNumber').value;
                if (!code) {
                    showToast('Please enter gift card code', 'error');
                    resetPaymentButton(completeBtn);
                    return;
                }
                
                if (typeof GolfCovePayment !== 'undefined') {
                    paymentResult = await GolfCovePayment.processGiftCardPayment(currentTotal, {
                        giftCardCode: code
                    });
                    
                    if (!paymentResult.success) {
                        showToast(paymentResult.error?.message || 'Gift card payment failed', 'error');
                        resetPaymentButton(completeBtn);
                        return;
                    }
                } else {
                    // Fallback: Deduct from gift card directly
                    const giftCards = JSON.parse(localStorage.getItem('gc_giftcards') || '[]');
                    const cardIndex = giftCards.findIndex(g => g.code === code);
                    if (cardIndex >= 0 && giftCards[cardIndex].balance >= currentTotal) {
                        giftCards[cardIndex].balance -= currentTotal;
                        localStorage.setItem('gc_giftcards', JSON.stringify(giftCards));
                        paymentResult = { success: true };
                    } else {
                        showToast('Insufficient gift card balance', 'error');
                        resetPaymentButton(completeBtn);
                        return;
                    }
                }
            }
            
            // ============ TAB PAYMENT ============
            if (selectedPaymentMethod === 'tab') {
                if (typeof GolfCovePayment !== 'undefined') {
                    paymentResult = await GolfCovePayment.addToTab(currentTotal, {
                        customer: currentCustomer,
                        items: currentItems
                    });
                    
                    if (!paymentResult.success) {
                        showToast(paymentResult.error?.message || 'Failed to add to tab', 'error');
                        resetPaymentButton(completeBtn);
                        return;
                    }
                } else {
                    paymentResult = { success: true, method: 'tab' };
                }
            }
            
            // ============ MEMBER CHARGE ============
            if (selectedPaymentMethod === 'member') {
                if (!currentCustomer?.isMember && !currentCustomer?.memberType) {
                    showToast('Customer is not a member', 'error');
                    resetPaymentButton(completeBtn);
                    return;
                }
                
                if (typeof GolfCovePayment !== 'undefined') {
                    paymentResult = await GolfCovePayment.processMemberCharge(currentTotal, {
                        customer: currentCustomer
                    });
                    
                    if (!paymentResult.success) {
                        showToast(paymentResult.error?.message || 'Member charge failed', 'error');
                        resetPaymentButton(completeBtn);
                        return;
                    }
                } else {
                    paymentResult = { success: true, method: 'member' };
                }
            }
            
            // ============ SPLIT PAYMENT ============
            if (selectedPaymentMethod === 'split') {
                const card1 = parseFloat(document.getElementById('splitCard1').value) || 0;
                const card2 = parseFloat(document.getElementById('splitCard2').value) || 0;
                const cash = parseFloat(document.getElementById('splitCash').value) || 0;
                const splitTotal = card1 + card2 + cash;
                
                if (Math.abs(splitTotal - currentTotal) > 0.01) {
                    showToast('Split amounts must equal total', 'error');
                    resetPaymentButton(completeBtn);
                    return;
                }
                
                if (typeof GolfCovePayment !== 'undefined') {
                    const splits = [];
                    if (card1 > 0) splits.push({ method: 'card_present', amount: card1 });
                    if (card2 > 0) splits.push({ method: 'card_present', amount: card2 });
                    if (cash > 0) splits.push({ method: 'cash', amount: cash, tendered: cash });
                    
                    paymentResult = await GolfCovePayment.processSplitPayment(currentTotal, { splits });
                    
                    if (!paymentResult.success) {
                        showToast(paymentResult.error?.message || 'Split payment failed', 'error');
                        resetPaymentButton(completeBtn);
                        return;
                    }
                } else {
                    paymentResult = { success: true, method: 'split' };
                }
            }
            
            // Build final payment result
            const result = {
                success: true,
                method: selectedPaymentMethod,
                subtotal: currentSubtotal,
                discount: currentDiscount,
                tax: currentTax,
                tip: selectedTip,
                total: currentTotal,
                timestamp: new Date().toISOString(),
                paymentDetails: paymentResult,
                idempotencyKey
            };
            
            // Show success toast
            showToast(`Payment of ${formatCurrency(currentTotal)} completed`, 'success');
            
            // Close modal
            closeModal();
            
            // Call callback if provided
            if (onCompleteCallback) {
                onCompleteCallback(result);
            }
            
            return result;
            
        } catch (error) {
            console.error('Payment processing error:', error);
            showToast('Payment failed: ' + error.message, 'error');
            resetPaymentButton(completeBtn);
        }
    }
    
    function resetPaymentButton(btn) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Complete Payment';
        }
    }
    
    // Store current items and customer for payment processing
    let currentItems = [];
    let currentCustomer = null;
    
    function setPaymentContext(items, customer) {
        currentItems = items || [];
        currentCustomer = customer;
    }
    
    // ============ TOAST ============
    function showToast(message, type = 'success') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        
        // Fallback toast
        const existing = document.querySelector('.pp-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = `pp-toast ${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            padding: 12px 24px;
            background: ${type === 'error' ? '#e74c3c' : '#27ae60'};
            color: white;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10001;
            animation: fadeIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    
    // ============ STYLES ============
    function addStyles() {
        const styles = document.createElement('style');
        styles.id = 'payment-processor-styles';
        styles.textContent = `
            .payment-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            .payment-modal {
                background: white;
                border-radius: 16px;
                width: 100%;
                max-width: 450px;
                max-height: 90vh;
                overflow-y: auto;
                position: relative;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            .payment-modal-close {
                position: absolute;
                top: 15px;
                right: 15px;
                width: 32px;
                height: 32px;
                border: none;
                background: #f0f0f0;
                border-radius: 50%;
                cursor: pointer;
                font-size: 14px;
            }
            .payment-header {
                padding: 20px 25px;
                border-bottom: 1px solid #eee;
            }
            .payment-header h2 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }
            .payment-summary {
                padding: 15px 25px;
                background: #f8f9fa;
            }
            .summary-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                font-size: 14px;
            }
            .summary-row.discount {
                color: #27ae60;
            }
            .summary-row.tip-row {
                color: #9b59b6;
            }
            .summary-row.total {
                font-size: 18px;
                font-weight: 700;
                border-top: 2px solid #ddd;
                margin-top: 10px;
                padding-top: 15px;
            }
            .tip-section, .payment-methods, .cash-section, .gift-section, .split-section {
                padding: 15px 25px;
                border-top: 1px solid #eee;
            }
            .tip-section label, .payment-methods label, .cash-section label, .gift-section label, .split-section label {
                display: block;
                font-size: 12px;
                color: #666;
                margin-bottom: 10px;
                text-transform: uppercase;
            }
            .tip-buttons, .method-buttons {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .tip-btn, .method-btn {
                flex: 1 1 auto;
                min-width: 60px;
                padding: 10px 15px;
                border: 1px solid #ddd;
                background: white;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            }
            .tip-btn:hover, .method-btn:hover {
                border-color: #4a90a4;
                background: #f0f7fa;
            }
            .tip-btn.active, .method-btn.active {
                background: #4a90a4;
                color: white;
                border-color: #4a90a4;
            }
            .method-btn {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 5px;
                min-width: 70px;
            }
            .method-btn i {
                font-size: 18px;
            }
            .custom-tip {
                display: flex;
                gap: 10px;
                margin-top: 10px;
            }
            .custom-tip input {
                flex: 1;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 8px;
            }
            .custom-tip button {
                padding: 10px 20px;
                background: #4a90a4;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
            }
            .cash-input-row input {
                width: 100%;
                padding: 12px;
                font-size: 20px;
                text-align: center;
                border: 1px solid #ddd;
                border-radius: 8px;
            }
            .quick-cash {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }
            .quick-cash button {
                flex: 1;
                padding: 10px;
                border: 1px solid #ddd;
                background: white;
                border-radius: 8px;
                cursor: pointer;
            }
            .quick-cash button:hover {
                background: #f0f7fa;
            }
            .change-due {
                margin-top: 15px;
                padding: 15px;
                background: #e8f5e9;
                border-radius: 8px;
                text-align: center;
                font-size: 16px;
                font-weight: 600;
            }
            .gift-section input {
                width: 100%;
                padding: 12px;
                border: 1px solid #ddd;
                border-radius: 8px;
                margin-bottom: 10px;
            }
            .gift-section button {
                width: 100%;
                padding: 10px;
                background: #4a90a4;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
            }
            .split-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
            }
            .split-row span {
                width: 80px;
            }
            .split-row input {
                flex: 1;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 8px;
            }
            .split-section > button {
                width: 100%;
                padding: 10px;
                background: #f0f0f0;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                margin-top: 10px;
            }
            .complete-payment-btn {
                display: block;
                width: calc(100% - 50px);
                margin: 20px 25px;
                padding: 16px;
                background: linear-gradient(135deg, #27ae60, #2ecc71);
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .complete-payment-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 20px rgba(39, 174, 96, 0.3);
            }
            .complete-payment-btn:disabled {
                background: #95a5a6;
                cursor: not-allowed;
                transform: none;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(styles);
    }
    
    // ============ PUBLIC API ============
    return {
        init,
        showPaymentModal,
        closeModal,
        setTipPercent,
        showCustomTip,
        applyCustomTip,
        selectMethod,
        setCashAmount,
        setExactCash,
        updateChange,
        lookupGiftCard,
        splitEvenly,
        processPayment,
        calculateTotals,
        formatCurrency,
        setPaymentContext,
        getTaxRate,
        PAYMENT_METHODS,
        getTipPresets
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PaymentProcessor;
}
