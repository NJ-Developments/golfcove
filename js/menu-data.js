/**
 * Golf Cove - Unified Product Catalog
 * Single source of truth for all POS products, rentals, and services
 * Used by admin-pos.html, sales.html, and any POS terminal
 */

const GolfCoveMenu = (function() {
    'use strict';
    
    // Menu categories with icons
    const categories = [
        { id: 'all', name: 'All Items', icon: 'fa-th' },
        { id: 'rental', name: 'Rentals', icon: 'fa-golf-ball' },
        { id: 'food', name: 'Food', icon: 'fa-utensils' },
        { id: 'beer', name: 'Beer', icon: 'fa-beer' },
        { id: 'wine', name: 'Wine', icon: 'fa-wine-glass-alt' },
        { id: 'cocktails', name: 'Cocktails', icon: 'fa-cocktail' },
        { id: 'beverage', name: 'Beverages', icon: 'fa-coffee' },
        { id: 'merch', name: 'Merch', icon: 'fa-tshirt' },
        { id: 'giftcard', name: 'Gift Cards', icon: 'fa-gift' }
    ];
    
    // Complete product catalog with inventory tracking
    const items = [
        // === BAY RENTALS (Services - no inventory) ===
        { id: 1, name: '1 Hour Bay', price: 45, category: 'rental', icon: 'fa-door-open', trackInventory: false },
        { id: 2, name: '2 Hour Bay', price: 80, category: 'rental', icon: 'fa-door-open', trackInventory: false },
        { id: 3, name: '3 Hour Bay', price: 110, category: 'rental', icon: 'fa-door-open', trackInventory: false },
        { id: 4, name: 'Club Rental', price: 15, category: 'rental', icon: 'fa-golf-ball', trackInventory: false },
        { id: 5, name: 'Premium Club Rental', price: 25, category: 'rental', icon: 'fa-golf-ball', trackInventory: false },
        { id: 6, name: 'Shoe Rental', price: 8, category: 'rental', icon: 'fa-shoe-prints', trackInventory: false },
        { id: 7, name: '30 Min Lesson', price: 50, category: 'rental', icon: 'fa-chalkboard-teacher', trackInventory: false },
        { id: 8, name: '1 Hour Lesson', price: 90, category: 'rental', icon: 'fa-user-graduate', trackInventory: false },
        
        // === FOOD - THE BASICS ===
        { id: 10, name: 'Pretzel Bites', price: 10.00, category: 'food', icon: 'fa-cookie', trackInventory: true, defaultStock: 30 },
        { id: 11, name: 'Pickle Chips', price: 10.00, category: 'food', icon: 'fa-lemon', trackInventory: true, defaultStock: 30 },
        { id: 12, name: 'Chicken Tenders', price: 12.00, category: 'food', icon: 'fa-drumstick-bite', trackInventory: true, defaultStock: 40 },
        { id: 13, name: 'Fries', price: 6.00, category: 'food', icon: 'fa-french-fries', trackInventory: true, defaultStock: 60 },
        { id: 14, name: 'Tots', price: 6.00, category: 'food', icon: 'fa-circle', trackInventory: true, defaultStock: 60 },
        { id: 15, name: 'Truffle Fries/Tots Upgrade', price: 2.00, category: 'food', icon: 'fa-plus', trackInventory: false },
        { id: 16, name: 'Onion Rings', price: 6.00, category: 'food', icon: 'fa-ring', trackInventory: true, defaultStock: 30 },
        { id: 17, name: 'Cinnamon Sugar Bites', price: 10.00, category: 'food', icon: 'fa-cookie-bite', trackInventory: true, defaultStock: 20 },
        
        // === FOOD - ZUPPARDI'S PIZZA ===
        { id: 20, name: 'Pizza - Cheese', price: 11.00, category: 'food', icon: 'fa-pizza-slice', trackInventory: true, defaultStock: 20 },
        { id: 21, name: 'Pizza - Margherita', price: 11.00, category: 'food', icon: 'fa-pizza-slice', trackInventory: true, defaultStock: 20 },
        { id: 22, name: 'Pizza - Pepperoni', price: 13.00, category: 'food', icon: 'fa-pizza-slice', trackInventory: true, defaultStock: 20 },
        { id: 23, name: 'Pizza - Sausage', price: 13.00, category: 'food', icon: 'fa-pizza-slice', trackInventory: true, defaultStock: 20 },
        { id: 24, name: 'Pizza - Meatball', price: 13.00, category: 'food', icon: 'fa-pizza-slice', trackInventory: true, defaultStock: 20 },
        { id: 25, name: 'Pizza - Bacon & Onion', price: 13.00, category: 'food', icon: 'fa-pizza-slice', trackInventory: true, defaultStock: 20 },
        { id: 26, name: 'Pizza - Buffalo Chicken', price: 13.00, category: 'food', icon: 'fa-pizza-slice', trackInventory: true, defaultStock: 20 },
        { id: 27, name: 'Pizza - Gluten Free', price: 13.00, category: 'food', icon: 'fa-pizza-slice', trackInventory: true, defaultStock: 10 },
        
        // === FOOD - SALADS ===
        { id: 30, name: 'Caesar Salad', price: 10.00, category: 'food', icon: 'fa-leaf', trackInventory: true, defaultStock: 15 },
        { id: 31, name: 'Chef Salad', price: 10.00, category: 'food', icon: 'fa-leaf', trackInventory: true, defaultStock: 15 },
        { id: 32, name: 'Add Chicken to Salad', price: 2.00, category: 'food', icon: 'fa-plus', trackInventory: false },
        
        // === FOOD - EGG ROLLS ===
        { id: 35, name: 'Steak & Cheese Egg Roll', price: 12.00, category: 'food', icon: 'fa-burrito', trackInventory: true, defaultStock: 20 },
        { id: 36, name: 'Buffalo Chicken Egg Roll', price: 12.00, category: 'food', icon: 'fa-burrito', trackInventory: true, defaultStock: 20 },
        { id: 37, name: 'Vegetable Egg Roll', price: 11.00, category: 'food', icon: 'fa-burrito', trackInventory: true, defaultStock: 20 },
        
        // === FOOD - CHEESY CLASSICS ===
        { id: 40, name: 'Mozzarella Sticks', price: 11.00, category: 'food', icon: 'fa-cheese', trackInventory: true, defaultStock: 30 },
        { id: 41, name: 'Mac N Cheese Bites', price: 12.00, category: 'food', icon: 'fa-cheese', trackInventory: true, defaultStock: 25 },
        { id: 42, name: 'Quesadilla', price: 12.00, category: 'food', icon: 'fa-cheese', trackInventory: true, defaultStock: 20 },
        { id: 43, name: 'Add Chicken to Quesadilla', price: 2.00, category: 'food', icon: 'fa-plus', trackInventory: false },
        { id: 44, name: 'Add Steak to Quesadilla', price: 3.00, category: 'food', icon: 'fa-plus', trackInventory: false },
        
        // === FOOD - HOT DOGS & SLIDERS ===
        { id: 50, name: 'Cove Dog', price: 8.00, category: 'food', icon: 'fa-hotdog', trackInventory: true, defaultStock: 40 },
        { id: 51, name: 'Cove Dog (2)', price: 14.00, category: 'food', icon: 'fa-hotdog', trackInventory: false },
        { id: 52, name: 'Add Cheese to Dog', price: 1.00, category: 'food', icon: 'fa-plus', trackInventory: false },
        { id: 53, name: 'Cove Sliders', price: 13.00, category: 'food', icon: 'fa-hamburger', trackInventory: true, defaultStock: 25 },
        { id: 54, name: 'Steak & Cheese Sliders', price: 14.00, category: 'food', icon: 'fa-hamburger', trackInventory: true, defaultStock: 20 },
        { id: 55, name: 'Veggie Sliders', price: 12.00, category: 'food', icon: 'fa-hamburger', trackInventory: true, defaultStock: 15 },
        
        // === FOOD - WINGS ===
        { id: 60, name: 'Wings (6)', price: 11.00, category: 'food', icon: 'fa-drumstick-bite', trackInventory: true, defaultStock: 50 },
        { id: 61, name: 'Wings (12)', price: 22.00, category: 'food', icon: 'fa-drumstick-bite', trackInventory: true, defaultStock: 40 },
        { id: 62, name: 'Wings (24)', price: 35.00, category: 'food', icon: 'fa-drumstick-bite', trackInventory: true, defaultStock: 30 },
        
        // === COFFEE & MORE ===
        { id: 70, name: 'Coffee', price: 2.50, category: 'beverage', icon: 'fa-mug-hot', trackInventory: false },
        { id: 71, name: 'Espresso', price: 4.00, category: 'beverage', icon: 'fa-mug-hot', trackInventory: false },
        { id: 72, name: 'Cappuccino', price: 4.50, category: 'beverage', icon: 'fa-mug-hot', trackInventory: false },
        { id: 73, name: 'Fountain Soda', price: 3.00, category: 'beverage', icon: 'fa-glass-water', trackInventory: false },
        { id: 74, name: 'Bottled Water', price: 2.00, category: 'beverage', icon: 'fa-bottle-water', trackInventory: true, defaultStock: 48 },
        { id: 75, name: 'Juice', price: 3.00, category: 'beverage', icon: 'fa-glass-water', trackInventory: true, defaultStock: 24 },
        { id: 76, name: 'Cookies (3)', price: 5.00, category: 'food', icon: 'fa-cookie', trackInventory: true, defaultStock: 20 },
        
        // === BEER - DOMESTICS ===
        { id: 100, name: 'Budweiser', price: 5.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 48 },
        { id: 101, name: 'Bud Light', price: 5.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 48 },
        { id: 102, name: 'Michelob Ultra', price: 5.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 48 },
        { id: 103, name: 'Coors Light', price: 6.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 48 },
        { id: 104, name: 'Miller Lite', price: 6.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 48 },
        { id: 105, name: 'Narragansett', price: 6.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 24 },
        { id: 106, name: 'Shock Top', price: 7.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 24 },
        { id: 107, name: 'Heineken', price: 7.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 24 },
        { id: 108, name: 'Stella Artois', price: 7.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 24 },
        { id: 109, name: 'Corona', price: 7.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 24 },
        { id: 110, name: 'Corona Light', price: 7.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 24 },
        { id: 111, name: 'Modelo', price: 7.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 24 },
        { id: 112, name: 'Allagash', price: 7.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 24 },
        { id: 113, name: 'Guinness', price: 8.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 24 },
        { id: 114, name: 'Victory Monkey', price: 9.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 24 },
        
        // === BEER - ON TAP ===
        { id: 120, name: 'Sam Adams (Draft)', price: 6.00, category: 'beer', icon: 'fa-beer', trackInventory: false },
        { id: 121, name: 'Blue Moon (Draft)', price: 6.00, category: 'beer', icon: 'fa-beer', trackInventory: false },
        { id: 122, name: 'Headway (Draft)', price: 8.00, category: 'beer', icon: 'fa-beer', trackInventory: false },
        { id: 123, name: 'Baby Kittens (Draft)', price: 8.00, category: 'beer', icon: 'fa-beer', trackInventory: false },
        
        // === BEER - NON-ALCOHOLIC ===
        { id: 130, name: "O'Doul's", price: 6.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 12 },
        { id: 131, name: 'Heineken Zero', price: 7.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 12 },
        { id: 132, name: 'Athletic Brewing', price: 8.00, category: 'beer', icon: 'fa-beer', trackInventory: true, defaultStock: 12 },
        
        // === CIDER ===
        { id: 135, name: 'Angry Orchard', price: 8.00, category: 'beer', icon: 'fa-apple-whole', trackInventory: true, defaultStock: 12 },
        
        // === SELTZER & MORE ===
        { id: 140, name: 'Twisted Tea', price: 6.00, category: 'beer', icon: 'fa-glass-water', trackInventory: true, defaultStock: 24 },
        { id: 141, name: 'Bud Light Seltzer', price: 7.00, category: 'beer', icon: 'fa-glass-water', trackInventory: true, defaultStock: 24 },
        { id: 142, name: 'Long Drink', price: 8.00, category: 'beer', icon: 'fa-glass-water', trackInventory: true, defaultStock: 24 },
        { id: 143, name: 'Links Drinks Transfusion', price: 8.00, category: 'beer', icon: 'fa-glass-water', trackInventory: true, defaultStock: 24 },
        { id: 144, name: 'Sun Cruiser', price: 8.00, category: 'beer', icon: 'fa-glass-water', trackInventory: true, defaultStock: 24 },
        { id: 145, name: 'Surfside', price: 7.00, category: 'beer', icon: 'fa-glass-water', trackInventory: true, defaultStock: 24 },
        { id: 146, name: 'High Noon', price: 8.00, category: 'beer', icon: 'fa-glass-water', trackInventory: true, defaultStock: 24 },
        
        // === WINE ===
        { id: 150, name: 'Pinot Grigio', price: 10.00, category: 'wine', icon: 'fa-wine-glass-alt', trackInventory: false },
        { id: 151, name: 'Chardonnay', price: 10.00, category: 'wine', icon: 'fa-wine-glass-alt', trackInventory: false },
        { id: 152, name: 'Sauvignon Blanc', price: 10.00, category: 'wine', icon: 'fa-wine-glass-alt', trackInventory: false },
        { id: 153, name: 'Pinot Noir', price: 10.00, category: 'wine', icon: 'fa-wine-glass-alt', trackInventory: false },
        { id: 154, name: 'Cabernet Sauvignon', price: 10.00, category: 'wine', icon: 'fa-wine-glass-alt', trackInventory: false },
        { id: 155, name: 'Rose', price: 10.00, category: 'wine', icon: 'fa-wine-glass-alt', trackInventory: false },
        
        // === COCKTAILS ===
        { id: 160, name: 'John Daly', price: 11.00, category: 'cocktails', icon: 'fa-cocktail', trackInventory: false },
        { id: 161, name: 'Happy Gilmore', price: 13.00, category: 'cocktails', icon: 'fa-cocktail', trackInventory: false },
        { id: 162, name: 'The Bubba', price: 11.00, category: 'cocktails', icon: 'fa-cocktail', trackInventory: false },
        { id: 163, name: 'Mulligan Mule', price: 12.00, category: 'cocktails', icon: 'fa-cocktail', trackInventory: false },
        { id: 164, name: 'Par-loma', price: 12.00, category: 'cocktails', icon: 'fa-cocktail', trackInventory: false },
        { id: 165, name: 'Sinker', price: 11.00, category: 'cocktails', icon: 'fa-cocktail', trackInventory: false },
        { id: 166, name: 'Sand Trapper', price: 12.00, category: 'cocktails', icon: 'fa-glass-whiskey', trackInventory: false },
        { id: 167, name: 'Cove Tee', price: 11.00, category: 'cocktails', icon: 'fa-cocktail', trackInventory: false },
        { id: 168, name: 'Classic Negroni', price: 11.00, category: 'cocktails', icon: 'fa-glass-martini-alt', trackInventory: false },
        { id: 169, name: 'Skinny Transfusion', price: 11.00, category: 'cocktails', icon: 'fa-cocktail', trackInventory: false },
        { id: 170, name: 'Upside Down Pineapple', price: 11.00, category: 'cocktails', icon: 'fa-cocktail', trackInventory: false },
        { id: 171, name: 'Orange Crush', price: 11.00, category: 'cocktails', icon: 'fa-cocktail', trackInventory: false },
        { id: 172, name: 'Espresso Martini', price: 13.00, category: 'cocktails', icon: 'fa-glass-martini-alt', trackInventory: false },
        
        // === MERCHANDISE ===
        { id: 180, name: 'Golf Cove Hat', price: 28.00, category: 'merch', icon: 'fa-hat-cowboy', trackInventory: true, defaultStock: 20 },
        { id: 181, name: 'Golf Cove Polo', price: 55.00, category: 'merch', icon: 'fa-tshirt', trackInventory: true, defaultStock: 15 },
        { id: 182, name: 'Golf Cove T-Shirt', price: 32.00, category: 'merch', icon: 'fa-shirt', trackInventory: true, defaultStock: 20 },
        { id: 183, name: 'Golf Balls (Dozen)', price: 45.00, category: 'merch', icon: 'fa-golf-ball', trackInventory: true, defaultStock: 30 },
        { id: 184, name: 'Golf Balls (Sleeve)', price: 12.00, category: 'merch', icon: 'fa-golf-ball', trackInventory: true, defaultStock: 50 },
        { id: 185, name: 'Golf Glove', price: 22.00, category: 'merch', icon: 'fa-hand-paper', trackInventory: true, defaultStock: 12 },
        { id: 186, name: 'Golf Towel', price: 18.00, category: 'merch', icon: 'fa-scroll', trackInventory: true, defaultStock: 25 },
        
        // === GIFT CARDS (No inventory, special handling) ===
        { id: 190, name: 'Gift Card $25', price: 25.00, category: 'giftcard', icon: 'fa-gift', trackInventory: false, isGiftCard: true },
        { id: 191, name: 'Gift Card $50', price: 50.00, category: 'giftcard', icon: 'fa-gift', trackInventory: false, isGiftCard: true },
        { id: 192, name: 'Gift Card $100', price: 100.00, category: 'giftcard', icon: 'fa-gift', trackInventory: false, isGiftCard: true },
        { id: 193, name: 'Gift Card Custom', price: 0, category: 'giftcard', icon: 'fa-gift', trackInventory: false, isGiftCard: true, customPrice: true }
    ];
    
    // Get all categories
    function getCategories() {
        return categories;
    }
    
    // Get all items
    function getAllItems() {
        return items;
    }
    
    // Get items by category
    function getItemsByCategory(categoryId) {
        if (categoryId === 'all') return items;
        return items.filter(item => item.category === categoryId);
    }
    
    // Get item by ID
    function getItem(itemId) {
        return items.find(item => item.id === itemId);
    }
    
    // Get item by name (for cart matching)
    function getItemByName(name) {
        return items.find(item => item.name.toLowerCase() === name.toLowerCase());
    }
    
    // Search items
    function searchItems(query) {
        const q = query.toLowerCase();
        return items.filter(item => 
            item.name.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q)
        );
    }
    
    // Add custom item (for custom orders)
    function addCustomItem(name, price, category = 'food') {
        const newItem = {
            id: Date.now(),
            name,
            price: parseFloat(price),
            category,
            icon: 'fa-tag',
            isCustom: true,
            trackInventory: false
        };
        items.push(newItem);
        return newItem;
    }
    
    // Get category info
    function getCategory(categoryId) {
        return categories.find(c => c.id === categoryId);
    }
    
    // Get category name
    function getCategoryName(categoryId) {
        const category = categories.find(c => c.id === categoryId);
        return category ? category.name : categoryId;
    }
    
    // Get category icon
    function getCategoryIcon(categoryId) {
        const category = categories.find(c => c.id === categoryId);
        return category ? category.icon : 'fa-tag';
    }
    
    // Public API
    return {
        getCategories,
        getAllItems,
        getItemsByCategory,
        getItem,
        getItemByName,
        searchItems,
        addCustomItem,
        getCategory,
        getCategoryName,
        getCategoryIcon,
        items,
        categories
    };
})();

// Expose globally for compatibility
window.GolfCoveMenu = GolfCoveMenu;
