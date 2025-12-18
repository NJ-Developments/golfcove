/**
 * Golf Cove - Saved Payment Methods
 * Allows members to save and use cards for seamless checkout
 */

const SavedCards = (function() {
    'use strict';
    
    const FUNCTIONS_URL = 'https://us-central1-golfcove.cloudfunctions.net';
    let stripe = null;
    
    // Initialize Stripe.js
    function init(publishableKey) {
        if (publishableKey && window.Stripe) {
            stripe = Stripe(publishableKey);
        }
    }
    
    /**
     * Get or create a Stripe customer for a member
     */
    async function getOrCreateStripeCustomer(customer) {
        try {
            const response = await fetch(`${FUNCTIONS_URL}/createStripeCustomer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: customer.id.toString(),
                    email: customer.email,
                    name: `${customer.firstName} ${customer.lastName}`,
                    phone: customer.phone
                })
            });
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            return data.stripeCustomerId;
        } catch (error) {
            console.error('Failed to create Stripe customer:', error);
            throw error;
        }
    }
    
    /**
     * Get saved payment methods for a customer
     */
    async function getSavedCards(stripeCustomerId) {
        try {
            const response = await fetch(
                `${FUNCTIONS_URL}/getSavedPaymentMethods?stripeCustomerId=${stripeCustomerId}`
            );
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            return data.paymentMethods || [];
        } catch (error) {
            console.error('Failed to get saved cards:', error);
            return [];
        }
    }
    
    /**
     * Show modal to add a new card
     */
    async function showAddCardModal(customer, onSuccess) {
        try {
            // Get or create Stripe customer
            const stripeCustomerId = await getOrCreateStripeCustomer(customer);
            
            // Create SetupIntent
            const response = await fetch(`${FUNCTIONS_URL}/createSetupIntent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stripeCustomerId })
            });
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            // Create modal with card element
            const modalHtml = `
                <div id="addCardModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
                    <div style="background:#fff;padding:25px;border-radius:12px;max-width:450px;width:90%;">
                        <h3 style="margin:0 0 20px;"><i class="fas fa-credit-card"></i> Add Payment Card</h3>
                        <p style="color:#666;margin-bottom:20px;">This card will be saved for future purchases.</p>
                        
                        <div id="card-element" style="padding:15px;border:1px solid #ddd;border-radius:8px;margin-bottom:15px;"></div>
                        <div id="card-errors" style="color:#e74c3c;font-size:13px;margin-bottom:15px;min-height:20px;"></div>
                        
                        <div style="display:flex;gap:10px;">
                            <button onclick="SavedCards.closeAddCardModal()" style="flex:1;padding:12px;border:none;background:#95a5a6;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">Cancel</button>
                            <button id="saveCardBtn" onclick="SavedCards.saveCard()" style="flex:1;padding:12px;border:none;background:#27ae60;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">
                                <i class="fas fa-save"></i> Save Card
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            // Create card element
            const elements = stripe.elements();
            const cardElement = elements.create('card', {
                style: {
                    base: {
                        fontSize: '16px',
                        color: '#333',
                        '::placeholder': { color: '#aab7c4' }
                    },
                    invalid: { color: '#e74c3c' }
                }
            });
            cardElement.mount('#card-element');
            
            // Handle errors
            cardElement.on('change', (event) => {
                const displayError = document.getElementById('card-errors');
                displayError.textContent = event.error ? event.error.message : '';
            });
            
            // Store data for save function
            window._addCardData = {
                stripe,
                cardElement,
                clientSecret: data.clientSecret,
                stripeCustomerId,
                customer,
                onSuccess
            };
            
        } catch (error) {
            console.error('Add card modal error:', error);
            if (typeof showToast === 'function') {
                showToast('Failed to open card form: ' + error.message, 'error');
            }
        }
    }
    
    /**
     * Save the card from the modal
     */
    async function saveCard() {
        const data = window._addCardData;
        if (!data) return;
        
        const saveBtn = document.getElementById('saveCardBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        try {
            const { setupIntent, error } = await data.stripe.confirmCardSetup(
                data.clientSecret,
                {
                    payment_method: {
                        card: data.cardElement,
                        billing_details: {
                            name: `${data.customer.firstName} ${data.customer.lastName}`,
                            email: data.customer.email
                        }
                    }
                }
            );
            
            if (error) {
                document.getElementById('card-errors').textContent = error.message;
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Card';
                return;
            }
            
            // Update local customer record with stripeCustomerId
            if (typeof GolfCoveCustomers !== 'undefined') {
                GolfCoveCustomers.update(data.customer.id, {
                    stripeCustomerId: data.stripeCustomerId
                });
            }
            
            closeAddCardModal();
            
            if (typeof showToast === 'function') {
                showToast('Card saved successfully!', 'success');
            }
            
            if (data.onSuccess) {
                data.onSuccess(setupIntent.payment_method);
            }
            
        } catch (error) {
            console.error('Save card error:', error);
            document.getElementById('card-errors').textContent = error.message;
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Card';
        }
    }
    
    function closeAddCardModal() {
        const modal = document.getElementById('addCardModal');
        if (modal) modal.remove();
        window._addCardData = null;
    }
    
    /**
     * Charge a saved card
     */
    async function chargeSavedCard(stripeCustomerId, paymentMethodId, amountCents, description) {
        try {
            const response = await fetch(`${FUNCTIONS_URL}/chargesSavedCard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stripeCustomerId,
                    paymentMethodId,
                    amount: amountCents,
                    description
                })
            });
            
            const data = await response.json();
            
            if (data.requiresAction) {
                // Card requires 3D Secure authentication
                const { paymentIntent, error } = await stripe.confirmCardPayment(data.clientSecret);
                if (error) throw new Error(error.message);
                return { success: true, paymentIntentId: paymentIntent.id };
            }
            
            if (data.error) throw new Error(data.error);
            
            return { success: true, paymentIntentId: data.paymentIntentId };
        } catch (error) {
            console.error('Charge saved card error:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Delete a saved card
     */
    async function deleteCard(paymentMethodId) {
        try {
            const response = await fetch(`${FUNCTIONS_URL}/deletePaymentMethod`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentMethodId })
            });
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            return { success: true };
        } catch (error) {
            console.error('Delete card error:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Show saved cards selection modal for checkout
     */
    async function showSavedCardsCheckout(customer, amount, onPaymentComplete) {
        if (!customer.stripeCustomerId) {
            if (typeof showToast === 'function') {
                showToast('No saved cards for this customer', 'info');
            }
            return false;
        }
        
        const cards = await getSavedCards(customer.stripeCustomerId);
        
        if (cards.length === 0) {
            if (typeof showToast === 'function') {
                showToast('No saved cards found', 'info');
            }
            return false;
        }
        
        const cardsHtml = cards.map(card => `
            <div class="saved-card-option" data-id="${card.id}" style="padding:15px;border:2px solid #ddd;border-radius:10px;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;gap:15px;transition:all 0.2s;" 
                 onclick="SavedCards.selectCard('${card.id}', this)"
                 onmouseover="this.style.borderColor='#27ae60'" 
                 onmouseout="this.style.borderColor=this.classList.contains('selected')?'#27ae60':'#ddd'">
                <i class="fab fa-cc-${card.brand.toLowerCase()}" style="font-size:32px;color:#333;"></i>
                <div style="flex:1;">
                    <strong style="text-transform:capitalize;">${card.brand}</strong> •••• ${card.last4}
                    <div style="font-size:12px;color:#888;">Expires ${card.expMonth}/${card.expYear}</div>
                </div>
                <i class="fas fa-check-circle" style="color:#27ae60;font-size:20px;opacity:0;" id="check-${card.id}"></i>
            </div>
        `).join('');
        
        const modalHtml = `
            <div id="savedCardsModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
                <div style="background:#fff;padding:25px;border-radius:12px;max-width:450px;width:90%;">
                    <h3 style="margin:0 0 5px;"><i class="fas fa-credit-card"></i> Pay with Saved Card</h3>
                    <p style="color:#666;margin-bottom:20px;">Total: <strong style="font-size:20px;color:#27ae60;">$${(amount/100).toFixed(2)}</strong></p>
                    
                    <div id="savedCardsList">
                        ${cardsHtml}
                    </div>
                    
                    <div style="display:flex;gap:10px;margin-top:20px;">
                        <button onclick="SavedCards.closeSavedCardsModal()" style="flex:1;padding:12px;border:none;background:#95a5a6;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">Cancel</button>
                        <button id="paySavedCardBtn" disabled style="flex:1;padding:12px;border:none;background:#27ae60;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;opacity:0.5;">
                            <i class="fas fa-lock"></i> Pay $${(amount/100).toFixed(2)}
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Store data for payment
        window._savedCardPayment = {
            customer,
            amount,
            selectedCardId: null,
            onPaymentComplete
        };
        
        return true;
    }
    
    function selectCard(cardId, element) {
        // Deselect all
        document.querySelectorAll('.saved-card-option').forEach(el => {
            el.classList.remove('selected');
            el.style.borderColor = '#ddd';
            el.querySelector('.fa-check-circle').style.opacity = '0';
        });
        
        // Select this one
        element.classList.add('selected');
        element.style.borderColor = '#27ae60';
        element.querySelector('.fa-check-circle').style.opacity = '1';
        
        // Enable pay button
        const btn = document.getElementById('paySavedCardBtn');
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.onclick = () => payWithSelectedCard(cardId);
        
        window._savedCardPayment.selectedCardId = cardId;
    }
    
    async function payWithSelectedCard(cardId) {
        const data = window._savedCardPayment;
        if (!data || !cardId) return;
        
        const btn = document.getElementById('paySavedCardBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        
        const result = await chargeSavedCard(
            data.customer.stripeCustomerId,
            cardId,
            data.amount,
            'Golf Cove POS Purchase'
        );
        
        if (result.success) {
            closeSavedCardsModal();
            if (typeof showToast === 'function') {
                showToast('Payment successful!', 'success');
            }
            if (data.onPaymentComplete) {
                data.onPaymentComplete(result);
            }
        } else {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-lock"></i> Pay $${(data.amount/100).toFixed(2)}`;
            if (typeof showToast === 'function') {
                showToast('Payment failed: ' + result.error, 'error');
            }
        }
    }
    
    function closeSavedCardsModal() {
        const modal = document.getElementById('savedCardsModal');
        if (modal) modal.remove();
        window._savedCardPayment = null;
    }
    
    // Public API
    return {
        init,
        getOrCreateStripeCustomer,
        getSavedCards,
        showAddCardModal,
        saveCard,
        closeAddCardModal,
        chargeSavedCard,
        deleteCard,
        showSavedCardsCheckout,
        selectCard,
        closeSavedCardsModal
    };
})();

// Auto-initialize with config if available
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        const pk = localStorage.getItem('gc_stripe_pk') || 
                   window.GolfCoveConfig?.STRIPE?.publishableKey;
        if (pk) {
            SavedCards.init(pk);
        }
    });
}
