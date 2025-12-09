// ============================================================
// GOLF COVE POS - MENU & PRODUCTS MODULE
// Menu items, categories, and product management
// ============================================================

const Menu = {
    // Categories
    categories: [
        { id: 'tee-times', name: 'Tee Times', icon: 'fa-golf-ball-tee' },
        { id: 'range', name: 'Range', icon: 'fa-bullseye' },
        { id: 'food', name: 'Food', icon: 'fa-utensils' },
        { id: 'drinks', name: 'Drinks', icon: 'fa-glass-water' },
        { id: 'alcohol', name: 'Alcohol', icon: 'fa-wine-glass' },
        { id: 'merch', name: 'Merch', icon: 'fa-shirt' },
        { id: 'rentals', name: 'Rentals', icon: 'fa-warehouse' }
    ],
    
    // Products by category
    products: {
        'tee-times': [
            { id: 'tt-9-am', name: '9 Holes (AM)', price: 18, type: 'tee-time' },
            { id: 'tt-9-pm', name: '9 Holes (PM)', price: 15, type: 'tee-time' },
            { id: 'tt-18-am', name: '18 Holes (AM)', price: 32, type: 'tee-time' },
            { id: 'tt-18-pm', name: '18 Holes (PM)', price: 26, type: 'tee-time' },
            { id: 'tt-replay', name: 'Replay', price: 15, type: 'tee-time' }
        ],
        'range': [
            { id: 'range-sm', name: 'Small Bucket (35)', price: 8, type: 'range' },
            { id: 'range-md', name: 'Medium Bucket (70)', price: 12, type: 'range' },
            { id: 'range-lg', name: 'Large Bucket (105)', price: 16, type: 'range' },
            { id: 'range-jumbo', name: 'Jumbo Bucket (150)', price: 20, type: 'range' }
        ],
        'food': [
            { id: 'f-hotdog', name: 'Hot Dog', price: 4.50, type: 'food' },
            { id: 'f-burger', name: 'Burger', price: 9.00, type: 'food' },
            { id: 'f-chicken', name: 'Chicken Sandwich', price: 10.00, type: 'food' },
            { id: 'f-fries', name: 'Fries', price: 4.00, type: 'food' },
            { id: 'f-nachos', name: 'Nachos', price: 8.00, type: 'food' },
            { id: 'f-pretzel', name: 'Soft Pretzel', price: 5.00, type: 'food' },
            { id: 'f-pizza', name: 'Pizza Slice', price: 4.50, type: 'food' },
            { id: 'f-wings', name: 'Wings (6)', price: 10.00, type: 'food' }
        ],
        'drinks': [
            { id: 'd-water', name: 'Water', price: 2.00, type: 'drink' },
            { id: 'd-soda', name: 'Soda', price: 2.50, type: 'drink' },
            { id: 'd-gatorade', name: 'Gatorade', price: 3.50, type: 'drink' },
            { id: 'd-coffee', name: 'Coffee', price: 3.00, type: 'drink' },
            { id: 'd-iced-tea', name: 'Iced Tea', price: 2.50, type: 'drink' },
            { id: 'd-lemonade', name: 'Lemonade', price: 3.00, type: 'drink' }
        ],
        'alcohol': [
            { id: 'a-domestic', name: 'Domestic Beer', price: 5.00, type: 'alcohol' },
            { id: 'a-craft', name: 'Craft Beer', price: 7.00, type: 'alcohol' },
            { id: 'a-seltzer', name: 'Hard Seltzer', price: 6.00, type: 'alcohol' },
            { id: 'a-wine', name: 'Wine', price: 8.00, type: 'alcohol' },
            { id: 'a-cocktail', name: 'Cocktail', price: 10.00, type: 'alcohol' },
            { id: 'a-shot', name: 'Shot', price: 6.00, type: 'alcohol' }
        ],
        'merch': [
            { id: 'm-balls', name: 'Golf Balls (3pk)', price: 12.00, type: 'merch' },
            { id: 'm-glove', name: 'Golf Glove', price: 18.00, type: 'merch' },
            { id: 'm-tees', name: 'Tees', price: 5.00, type: 'merch' },
            { id: 'm-hat', name: 'Golf Cove Hat', price: 25.00, type: 'merch' },
            { id: 'm-towel', name: 'Golf Towel', price: 15.00, type: 'merch' }
        ],
        'rentals': [
            { id: 'r-clubs', name: 'Club Rental', price: 25.00, type: 'rental' },
            { id: 'r-cart', name: 'Cart Rental', price: 20.00, type: 'rental' },
            { id: 'r-pushcart', name: 'Push Cart', price: 8.00, type: 'rental' }
        ]
    },
    
    // Current category
    activeCategory: 'tee-times',
    
    // Initialize menu
    init() {
        // Load custom products from localStorage
        const customProducts = JSON.parse(localStorage.getItem('gc_custom_products') || '{}');
        Object.keys(customProducts).forEach(cat => {
            if (!this.products[cat]) this.products[cat] = [];
            this.products[cat].push(...customProducts[cat]);
        });
        
        this.renderCategories();
        this.renderProducts('tee-times');
    },
    
    // Render category tabs
    renderCategories() {
        const container = document.getElementById('menuCategories');
        if (!container) return;
        
        container.innerHTML = this.categories.map(cat => `
            <button class="category-btn ${cat.id === this.activeCategory ? 'active' : ''}" 
                    onclick="Menu.selectCategory('${cat.id}')"
                    data-category="${cat.id}">
                <i class="fas ${cat.icon}"></i>
                <span>${cat.name}</span>
            </button>
        `).join('');
    },
    
    // Select category
    selectCategory(categoryId) {
        this.activeCategory = categoryId;
        
        // Update active state
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === categoryId);
        });
        
        this.renderProducts(categoryId);
    },
    
    // Render products grid
    renderProducts(categoryId) {
        const container = document.getElementById('menuProducts');
        if (!container) return;
        
        const products = this.products[categoryId] || [];
        
        if (products.length === 0) {
            container.innerHTML = `
                <div class="no-products">
                    <i class="fas fa-inbox"></i>
                    <p>No items in this category</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = products.map(product => `
            <button class="product-btn" onclick="Menu.addToCart('${product.id}')">
                <span class="product-name">${product.name}</span>
                <span class="product-price">${POS.formatCurrency(product.price)}</span>
            </button>
        `).join('');
    },
    
    // Add product to cart
    addToCart(productId) {
        // Find product across all categories
        let product = null;
        for (const cat in this.products) {
            product = this.products[cat].find(p => p.id === productId);
            if (product) break;
        }
        
        if (product) {
            Cart.add({
                id: product.id,
                name: product.name,
                price: product.price,
                type: product.type
            });
        }
    },
    
    // Quick add by name (for custom items)
    quickAdd(name, price) {
        Cart.add({
            id: 'custom_' + Date.now(),
            name: name,
            price: price,
            type: 'custom'
        });
    },
    
    // Search products
    search(query) {
        if (!query) {
            this.renderProducts(this.activeCategory);
            return;
        }
        
        query = query.toLowerCase();
        const results = [];
        
        for (const cat in this.products) {
            this.products[cat].forEach(product => {
                if (product.name.toLowerCase().includes(query)) {
                    results.push(product);
                }
            });
        }
        
        const container = document.getElementById('menuProducts');
        if (!container) return;
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="no-products">
                    <i class="fas fa-search"></i>
                    <p>No results for "${query}"</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = results.map(product => `
            <button class="product-btn" onclick="Menu.addToCart('${product.id}')">
                <span class="product-name">${product.name}</span>
                <span class="product-price">${POS.formatCurrency(product.price)}</span>
            </button>
        `).join('');
    }
};

// Initialize menu on load
document.addEventListener('DOMContentLoaded', () => {
    Menu.init();
});
