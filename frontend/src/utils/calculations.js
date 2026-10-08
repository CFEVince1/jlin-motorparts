/**
 * Pure, unit-testable financial and inventory calculation utilities.
 */

/**
 * Safely parse any input to a valid floating point number.
 */
export const safeNumber = (val, fallback = 0) => {
    if (typeof val === 'number') {
        return Number.isFinite(val) ? val : fallback;
    }
    if (val === null || val === undefined || val === '') return fallback;
    const parsed = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Round a number to specified decimal places (default: 2).
 */
export const roundCurrency = (amount, decimals = 2) => {
    const factor = Math.pow(10, decimals);
    return Math.round((safeNumber(amount) + Number.EPSILON) * factor) / factor;
};

/**
 * Calculate item subtotal based on quantity and unit price.
 */
export const calculateItemSubtotal = (quantity, unitPrice) => {
    const qty = Math.max(0, parseInt(quantity, 10) || 0);
    const price = Math.max(0, safeNumber(unitPrice));
    return roundCurrency(qty * price);
};

/**
 * Calculate totals for a shopping cart with optional discount.
 * @param {Array} cart - Array of items with quantity, price, and subtotal
 * @param {number} discount - Optional flat discount amount
 */
export const calculateCartTotals = (cart = [], discount = 0) => {
    if (!Array.isArray(cart) || cart.length === 0) {
        return {
            itemCount: 0,
            totalQuantity: 0,
            subtotal: 0,
            discount: 0,
            totalAmount: 0
        };
    }

    const totalQuantity = cart.reduce((sum, item) => sum + (parseInt(item?.quantity, 10) || 0), 0);
    const subtotal = cart.reduce((sum, item) => {
        const itemSubtotal = item?.subtotal !== undefined
            ? safeNumber(item.subtotal)
            : calculateItemSubtotal(item?.quantity, item?.price);
        return sum + itemSubtotal;
    }, 0);

    const safeDiscount = Math.min(subtotal, Math.max(0, safeNumber(discount)));
    const totalAmount = Math.max(0, subtotal - safeDiscount);

    return {
        itemCount: cart.length,
        totalQuantity,
        subtotal: roundCurrency(subtotal),
        discount: roundCurrency(safeDiscount),
        totalAmount: roundCurrency(totalAmount)
    };
};

/**
 * Calculate change due and verified tendered amount for a checkout transaction.
 */
export const calculatePaymentDetails = (totalAmount, tenderedAmount, paymentMethod = 'Cash') => {
    const total = roundCurrency(totalAmount);
    const tendered = roundCurrency(tenderedAmount);

    if (paymentMethod !== 'Cash') {
        return {
            isValid: true,
            totalAmount: total,
            tenderedAmount: total,
            changeDue: 0,
            errorMessage: null
        };
    }

    if (tendered < total) {
        return {
            isValid: false,
            totalAmount: total,
            tenderedAmount: tendered,
            changeDue: 0,
            errorMessage: 'Tendered amount is insufficient'
        };
    }

    const changeDue = roundCurrency(tendered - total);
    return {
        isValid: true,
        totalAmount: total,
        tenderedAmount: tendered,
        changeDue,
        errorMessage: null
    };
};

/**
 * Calculate profit and profit margin percentage.
 */
export const calculateProfit = (sellingPrice, costPrice, quantity = 1) => {
    const sell = safeNumber(sellingPrice);
    const cost = safeNumber(costPrice);
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    const unitProfit = sell - cost;
    const totalProfit = unitProfit * qty;
    const marginPercent = sell > 0 ? (unitProfit / sell) * 100 : 0;
    const markupPercent = cost > 0 ? (unitProfit / cost) * 100 : 0;

    return {
        unitProfit: roundCurrency(unitProfit),
        totalProfit: roundCurrency(totalProfit),
        marginPercent: roundCurrency(marginPercent, 1),
        markupPercent: roundCurrency(markupPercent, 1)
    };
};

/**
 * Calculate report analytics summary from sales records.
 */
export const calculateSalesSummary = (sales = []) => {
    if (!Array.isArray(sales) || sales.length === 0) {
        return {
            totalSales: 0,
            totalTransactions: 0,
            averageTransaction: 0
        };
    }

    const totalTransactions = sales.length;
    const totalSales = sales.reduce((sum, s) => sum + safeNumber(s.total_amount), 0);
    const averageTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;

    return {
        totalSales: roundCurrency(totalSales),
        totalTransactions,
        averageTransaction: roundCurrency(averageTransaction)
    };
};
