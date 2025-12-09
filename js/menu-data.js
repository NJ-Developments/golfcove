/**
 * Golf Cove - Menu Items Configuration
 * F&B menu data for the POS system
 */

const GolfCoveMenu = (function() {
    'use strict';
    
    // Menu categories
    const categories = [
        { id: 'food', name: 'Food', icon: 'fa-utensils' },
        { id: 'beer', name: 'Beer', icon: 'fa-beer' },
        { id: 'wine', name: 'Wine', icon: 'fa-wine-glass-alt' },
        { id: 'cocktails', name: 'Cocktails', icon: 'fa-cocktail' },
        { id: 'beverages', name: 'Beverages', icon: 'fa-coffee' },
        { id: 'merch', name: 'Merch', icon: 'fa-tshirt' },
        { id: 'rentals', name: 'Rentals', icon: 'fa-golf-ball' }
    ];
    
    // Menu items
    const items = [
        // Food
        { id: 1, name: 'Cheeseburger', price: 14.00, category: 'food' },
        { id: 2, name: 'Chicken Wrap', price: 13.00, category: 'food' },
        { id: 3, name: 'Club Sandwich', price: 14.00, category: 'food' },
        { id: 4, name: 'Caesar Salad', price: 12.00, category: 'food' },
        { id: 5, name: 'Wings (10pc)', price: 15.00, category: 'food' },
        { id: 6, name: 'Nachos', price: 13.00, category: 'food' },
        { id: 7, name: 'Quesadilla', price: 12.00, category: 'food' },
        { id: 8, name: 'Hot Dog', price: 8.00, category: 'food' },
        { id: 9, name: 'Fries', price: 6.00, category: 'food' },
        { id: 10, name: 'Onion Rings', price: 7.00, category: 'food' },
        { id: 11, name: 'Mozzarella Sticks', price: 10.00, category: 'food' },
        { id: 12, name: 'Pretzel Bites', price: 9.00, category: 'food' },
        
        // Beer
        { id: 20, name: 'Bud Light', price: 5.00, category: 'beer' },
        { id: 21, name: 'Coors Light', price: 5.00, category: 'beer' },
        { id: 22, name: 'Miller Lite', price: 5.00, category: 'beer' },
        { id: 23, name: 'Sam Adams', price: 6.00, category: 'beer' },
        { id: 24, name: 'Blue Moon', price: 6.00, category: 'beer' },
        { id: 25, name: 'Stella Artois', price: 7.00, category: 'beer' },
        { id: 26, name: 'Guinness', price: 7.00, category: 'beer' },
        { id: 27, name: 'IPA (Draft)', price: 7.00, category: 'beer' },
        { id: 28, name: 'Craft Beer', price: 8.00, category: 'beer' },
        { id: 29, name: 'Beer Bucket (5)', price: 22.00, category: 'beer' },
        
        // Wine
        { id: 40, name: 'House Red', price: 8.00, category: 'wine' },
        { id: 41, name: 'House White', price: 8.00, category: 'wine' },
        { id: 42, name: 'Chardonnay', price: 10.00, category: 'wine' },
        { id: 43, name: 'Pinot Grigio', price: 10.00, category: 'wine' },
        { id: 44, name: 'Cabernet', price: 11.00, category: 'wine' },
        { id: 45, name: 'Merlot', price: 10.00, category: 'wine' },
        { id: 46, name: 'Prosecco', price: 9.00, category: 'wine' },
        { id: 47, name: 'Wine Bottle', price: 35.00, category: 'wine' },
        
        // Cocktails
        { id: 60, name: 'Margarita', price: 11.00, category: 'cocktails' },
        { id: 61, name: 'Old Fashioned', price: 12.00, category: 'cocktails' },
        { id: 62, name: 'Mojito', price: 11.00, category: 'cocktails' },
        { id: 63, name: 'Whiskey Sour', price: 11.00, category: 'cocktails' },
        { id: 64, name: 'Vodka Soda', price: 9.00, category: 'cocktails' },
        { id: 65, name: 'Rum & Coke', price: 9.00, category: 'cocktails' },
        { id: 66, name: 'Gin & Tonic', price: 10.00, category: 'cocktails' },
        { id: 67, name: 'Long Island', price: 13.00, category: 'cocktails' },
        { id: 68, name: 'Moscow Mule', price: 11.00, category: 'cocktails' },
        { id: 69, name: 'Bloody Mary', price: 11.00, category: 'cocktails' },
        
        // Beverages
        { id: 80, name: 'Soda', price: 3.00, category: 'beverages' },
        { id: 81, name: 'Iced Tea', price: 3.00, category: 'beverages' },
        { id: 82, name: 'Lemonade', price: 4.00, category: 'beverages' },
        { id: 83, name: 'Coffee', price: 3.50, category: 'beverages' },
        { id: 84, name: 'Energy Drink', price: 5.00, category: 'beverages' },
        { id: 85, name: 'Bottled Water', price: 2.50, category: 'beverages' },
        { id: 86, name: 'Gatorade', price: 4.00, category: 'beverages' },
        
        // Merch
        { id: 100, name: 'Golf Cove Hat', price: 28.00, category: 'merch' },
        { id: 101, name: 'Golf Cove Polo', price: 55.00, category: 'merch' },
        { id: 102, name: 'Golf Cove T-Shirt', price: 32.00, category: 'merch' },
        { id: 103, name: 'Golf Balls (Dozen)', price: 45.00, category: 'merch' },
        { id: 104, name: 'Golf Glove', price: 22.00, category: 'merch' },
        { id: 105, name: 'Golf Towel', price: 18.00, category: 'merch' },
        
        // Rentals
        { id: 120, name: 'Club Rental', price: 15.00, category: 'rentals' },
        { id: 121, name: 'Premium Club Rental', price: 25.00, category: 'rentals' },
        { id: 122, name: 'Shoes Rental', price: 8.00, category: 'rentals' }
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
            isCustom: true
        };
        items.push(newItem);
        return newItem;
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
        searchItems,
        addCustomItem,
        getCategoryName,
        getCategoryIcon,
        items,
        categories
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveMenu;
}
