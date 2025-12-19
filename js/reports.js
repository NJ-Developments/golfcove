/**
 * Golf Cove - Reporting & Analytics System
 * Generates reports for sales, bookings, and business metrics
 */

const GolfCoveReports = (function() {
    'use strict';
    
    // ============ DATE HELPERS ============
    function getDateRange(period) {
        const now = new Date();
        const ranges = {
            today: {
                start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                end: now
            },
            yesterday: {
                start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
                end: new Date(now.getFullYear(), now.getMonth(), now.getDate())
            },
            thisWeek: {
                start: new Date(now.setDate(now.getDate() - now.getDay())),
                end: new Date()
            },
            lastWeek: {
                start: new Date(new Date().setDate(new Date().getDate() - new Date().getDay() - 7)),
                end: new Date(new Date().setDate(new Date().getDate() - new Date().getDay()))
            },
            thisMonth: {
                start: new Date(now.getFullYear(), now.getMonth(), 1),
                end: new Date()
            },
            lastMonth: {
                start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
                end: new Date(now.getFullYear(), now.getMonth(), 0)
            },
            thisYear: {
                start: new Date(now.getFullYear(), 0, 1),
                end: new Date()
            },
            last30Days: {
                start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                end: new Date()
            },
            last90Days: {
                start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                end: new Date()
            }
        };
        
        return ranges[period] || ranges.today;
    }
    
    function isInRange(date, start, end) {
        const d = new Date(date);
        return d >= start && d <= end;
    }
    
    // ============ SALES REPORTS ============
    function getSalesReport(period = 'today') {
        const range = getDateRange(period);
        const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
        
        const filtered = transactions.filter(t => isInRange(t.date, range.start, range.end));
        
        // Calculate metrics
        const totalSales = filtered.reduce((sum, t) => sum + t.amount, 0);
        const totalTax = filtered.reduce((sum, t) => sum + (t.tax || 0), 0);
        const totalDiscounts = filtered.reduce((sum, t) => sum + (t.memberDiscount || 0), 0);
        const transactionCount = filtered.length;
        const avgTransaction = transactionCount > 0 ? totalSales / transactionCount : 0;
        
        // Payment methods breakdown
        const byPaymentMethod = {};
        filtered.forEach(t => {
            const method = t.paymentMethod || 'unknown';
            byPaymentMethod[method] = (byPaymentMethod[method] || 0) + t.amount;
        });
        
        // Category breakdown
        const byCategory = {};
        filtered.forEach(t => {
            (t.items || []).forEach(item => {
                const cat = item.category || 'other';
                byCategory[cat] = (byCategory[cat] || 0) + (item.price * item.qty);
            });
        });
        
        // Hourly breakdown
        const byHour = {};
        filtered.forEach(t => {
            const hour = new Date(t.date).getHours();
            byHour[hour] = (byHour[hour] || 0) + t.amount;
        });
        
        // Top items
        const itemCounts = {};
        filtered.forEach(t => {
            (t.items || []).forEach(item => {
                itemCounts[item.name] = (itemCounts[item.name] || 0) + item.qty;
            });
        });
        const topItems = Object.entries(itemCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, qty]) => ({ name, qty }));
        
        return {
            period,
            range: { start: range.start.toISOString(), end: range.end.toISOString() },
            summary: {
                totalSales,
                totalTax,
                totalDiscounts,
                netSales: totalSales - totalTax,
                transactionCount,
                avgTransaction
            },
            byPaymentMethod,
            byCategory,
            byHour,
            topItems,
            transactions: filtered
        };
    }
    
    function getDailySalesComparison(days = 7) {
        const results = [];
        const now = new Date();
        
        for (let i = 0; i < days; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
            const dayTrans = transactions.filter(t => 
                new Date(t.date).toISOString().split('T')[0] === dateStr
            );
            
            results.push({
                date: dateStr,
                dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
                sales: dayTrans.reduce((sum, t) => sum + t.amount, 0),
                transactions: dayTrans.length
            });
        }
        
        return results.reverse();
    }
    
    // ============ BOOKING REPORTS ============
    function getBookingReport(period = 'today') {
        const range = getDateRange(period);
        
        if (typeof GolfCoveBooking === 'undefined') {
            return { error: 'Booking system not available' };
        }
        
        const allBookings = GolfCoveBooking.getAll();
        const filtered = allBookings.filter(b => isInRange(b.date, range.start, range.end));
        
        // Status breakdown
        const byStatus = {};
        filtered.forEach(b => {
            const status = b.status || 'confirmed';
            byStatus[status] = (byStatus[status] || 0) + 1;
        });
        
        // Room utilization
        const byRoom = {};
        filtered.forEach(b => {
            const room = b.roomId || b.room;
            byRoom[room] = (byRoom[room] || 0) + 1;
        });
        
        // Time slot popularity
        const byTimeSlot = {};
        filtered.forEach(b => {
            byTimeSlot[b.time] = (byTimeSlot[b.time] || 0) + 1;
        });
        
        // Duration breakdown
        const byDuration = {};
        filtered.forEach(b => {
            const dur = b.duration || 1;
            byDuration[dur] = (byDuration[dur] || 0) + 1;
        });
        
        // Revenue
        const revenue = filtered.reduce((sum, b) => sum + (b.totalPrice || b.price || 0), 0);
        const deposits = filtered.reduce((sum, b) => sum + (b.depositAmount || 0), 0);
        
        // Member vs non-member
        const memberBookings = filtered.filter(b => b.memberType || b.isVIP).length;
        
        // No-shows
        const noShows = filtered.filter(b => b.status === 'no-show').length;
        const noShowRate = filtered.length > 0 ? (noShows / filtered.length * 100) : 0;
        
        return {
            period,
            range: { start: range.start.toISOString(), end: range.end.toISOString() },
            summary: {
                totalBookings: filtered.length,
                checkedIn: filtered.filter(b => b.status === 'checked-in').length,
                completed: filtered.filter(b => b.status === 'completed').length,
                cancelled: filtered.filter(b => b.status === 'cancelled').length,
                noShows,
                noShowRate: noShowRate.toFixed(1) + '%',
                revenue,
                deposits,
                memberBookings,
                memberRate: filtered.length > 0 ? (memberBookings / filtered.length * 100).toFixed(1) + '%' : '0%'
            },
            byStatus,
            byRoom,
            byTimeSlot,
            byDuration
        };
    }
    
    function getOccupancyReport(date = null) {
        if (typeof GolfCoveBooking === 'undefined') {
            return { error: 'Booking system not available' };
        }
        
        const targetDate = date || new Date().toISOString().split('T')[0];
        const bookings = GolfCoveBooking.getForDate(targetDate);
        
        const rooms = [1, 2, 3]; // Assuming 3 rooms
        const timeSlots = [
            '9:00am', '10:00am', '11:00am', '12:00pm',
            '1:00pm', '2:00pm', '3:00pm', '4:00pm',
            '5:00pm', '6:00pm', '7:00pm', '8:00pm', '9:00pm'
        ];
        
        const totalSlots = rooms.length * timeSlots.length;
        const bookedSlots = bookings.length;
        const occupancyRate = (bookedSlots / totalSlots * 100);
        
        // Peak hours (5pm-8pm)
        const peakBookings = bookings.filter(b => {
            const hour = parseInt(b.time);
            return hour >= 5 || (b.time.includes('pm') && hour < 9);
        }).length;
        const peakSlots = rooms.length * 4; // 4 peak hours
        const peakOccupancy = (peakBookings / peakSlots * 100);
        
        // Room-by-room
        const roomOccupancy = {};
        rooms.forEach(room => {
            const roomBookings = bookings.filter(b => (b.roomId || b.room) === room).length;
            roomOccupancy[room] = {
                booked: roomBookings,
                available: timeSlots.length - roomBookings,
                occupancy: (roomBookings / timeSlots.length * 100).toFixed(1) + '%'
            };
        });
        
        return {
            date: targetDate,
            totalSlots,
            bookedSlots,
            availableSlots: totalSlots - bookedSlots,
            occupancyRate: occupancyRate.toFixed(1) + '%',
            peakOccupancy: peakOccupancy.toFixed(1) + '%',
            roomOccupancy
        };
    }
    
    // ============ CUSTOMER REPORTS ============
    function getCustomerReport(period = 'thisMonth') {
        const range = getDateRange(period);
        
        if (typeof GolfCoveCustomers === 'undefined') {
            return { error: 'Customer system not available' };
        }
        
        const customers = GolfCoveCustomers.getAll();
        
        // New customers in period
        const newCustomers = customers.filter(c => isInRange(c.createdAt, range.start, range.end));
        
        // Active customers (visited in period)
        const activeCustomers = customers.filter(c => 
            c.lastVisit && isInRange(c.lastVisit, range.start, range.end)
        );
        
        // Member stats
        const members = customers.filter(c => GolfCoveCustomers.isActiveMember(c));
        const vips = members.filter(c => GolfCoveCustomers.isVIP(c));
        
        // Revenue per customer
        const totalRevenue = customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
        const avgRevenue = customers.length > 0 ? totalRevenue / customers.length : 0;
        
        // Visit frequency
        const totalVisits = customers.reduce((sum, c) => sum + (c.visitCount || 0), 0);
        const avgVisits = customers.length > 0 ? totalVisits / customers.length : 0;
        
        return {
            period,
            summary: {
                totalCustomers: customers.length,
                newCustomers: newCustomers.length,
                activeCustomers: activeCustomers.length,
                totalMembers: members.length,
                vipMembers: vips.length,
                totalRevenue,
                avgRevenuePerCustomer: avgRevenue.toFixed(2),
                totalVisits,
                avgVisitsPerCustomer: avgVisits.toFixed(1)
            },
            topSpenders: GolfCoveCustomers.getTopCustomers(10, 'spent'),
            frequentVisitors: GolfCoveCustomers.getTopCustomers(10, 'visits'),
            recentCustomers: newCustomers.slice(0, 10)
        };
    }
    
    // ============ GIFT CARD REPORTS ============
    function getGiftCardReport() {
        if (typeof GolfCoveGiftCards === 'undefined') {
            return { error: 'Gift card system not available' };
        }
        
        return GolfCoveGiftCards.getStats();
    }
    
    // ============ DASHBOARD METRICS ============
    function getDashboardMetrics() {
        const todaySales = getSalesReport('today');
        const yesterdaySales = getSalesReport('yesterday');
        const monthSales = getSalesReport('thisMonth');
        
        const todayBookings = getBookingReport('today');
        const occupancy = getOccupancyReport();
        
        // Calculate changes
        const salesChange = yesterdaySales.summary.totalSales > 0
            ? ((todaySales.summary.totalSales - yesterdaySales.summary.totalSales) / yesterdaySales.summary.totalSales * 100)
            : 0;
        
        return {
            today: {
                sales: todaySales.summary.totalSales,
                salesChange: salesChange.toFixed(1) + '%',
                transactions: todaySales.summary.transactionCount,
                avgTicket: todaySales.summary.avgTransaction
            },
            month: {
                sales: monthSales.summary.totalSales,
                transactions: monthSales.summary.transactionCount
            },
            bookings: {
                today: todayBookings.summary?.totalBookings || 0,
                checkedIn: todayBookings.summary?.checkedIn || 0,
                occupancy: occupancy.occupancyRate || '0%'
            },
            openTabs: typeof TabsSync !== 'undefined' ? TabsSync.getAllTabs().length : 0,
            activeMembers: typeof GolfCoveCustomers !== 'undefined' ? GolfCoveCustomers.getMembers().length : 0
        };
    }
    
    // ============ EXPORT FUNCTIONS ============
    function exportToCSV(report, filename) {
        let csv = '';
        
        if (report.transactions) {
            // Sales report
            csv = 'Date,Customer,Amount,Tax,Payment Method\n';
            report.transactions.forEach(t => {
                csv += `"${new Date(t.date).toLocaleString()}","${t.customer}",${t.amount.toFixed(2)},${(t.tax || 0).toFixed(2)},"${t.paymentMethod}"\n`;
            });
        }
        
        return csv;
    }
    
    function exportToPDF(report) {
        // Would integrate with a PDF library like jsPDF
        console.log('PDF export not implemented - would use jsPDF');
        return null;
    }
    
    // ============ SCHEDULED REPORTS ============
    function generateDailyReport() {
        return {
            date: new Date().toISOString().split('T')[0],
            sales: getSalesReport('today'),
            bookings: getBookingReport('today'),
            occupancy: getOccupancyReport(),
            generatedAt: new Date().toISOString()
        };
    }
    
    function generateWeeklyReport() {
        return {
            week: `Week of ${getDateRange('thisWeek').start.toLocaleDateString()}`,
            sales: getSalesReport('thisWeek'),
            bookings: getBookingReport('thisWeek'),
            dailyComparison: getDailySalesComparison(7),
            customers: typeof GolfCoveCustomers !== 'undefined' ? getCustomerReport('thisWeek') : null,
            generatedAt: new Date().toISOString()
        };
    }
    
    function generateMonthlyReport() {
        return {
            month: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            sales: getSalesReport('thisMonth'),
            bookings: getBookingReport('thisMonth'),
            customers: typeof GolfCoveCustomers !== 'undefined' ? getCustomerReport('thisMonth') : null,
            giftCards: typeof GolfCoveGiftCards !== 'undefined' ? getGiftCardReport() : null,
            generatedAt: new Date().toISOString()
        };
    }
    
    // Public API
    return {
        // Date helpers
        getDateRange,
        
        // Sales
        getSalesReport,
        getDailySalesComparison,
        
        // Bookings
        getBookingReport,
        getOccupancyReport,
        
        // Customers
        getCustomerReport,
        
        // Gift Cards
        getGiftCardReport,
        
        // Dashboard
        getDashboardMetrics,
        
        // Export
        exportToCSV,
        exportToPDF,
        
        // Scheduled
        generateDailyReport,
        generateWeeklyReport,
        generateMonthlyReport
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveReports;
}
