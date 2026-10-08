/**
 * JLIN Motorcycle Parts - In-Browser Mock & Demo Data Engine
 * 
 * Provides an offline/demo mock backend allowing instant evaluation on Vercel
 * or during presentations without requiring a live database connection.
 */

const STORAGE_KEYS = {
    PRODUCTS: 'jlin_mock_products',
    TRANSACTIONS: 'jlin_mock_transactions',
    SUPPLIERS: 'jlin_mock_suppliers',
    ADJUSTMENTS: 'jlin_mock_adjustments',
    USE_MOCK: 'jlin_use_mock'
};

const DEFAULT_PRODUCTS = [
    {
        id: 1,
        item_id: 1,
        sku: 'BLT-M8-001',
        part_number: 'BLT-M8-001',
        product_name: 'Bolt M8',
        name: 'Bolt M8',
        brand: 'JRP',
        category: 'Bolts',
        size: 'M8 x 20mm',
        is_serialized: 0,
        current_stock: 153,
        stock: 153,
        reorder_level: 10,
        cost_price: '8.00',
        retail_price: '15.00',
        price: '15.00',
        compatibility_display: 'Raider 150 2022'
    },
    {
        id: 2,
        item_id: 2,
        sku: 'SP-001',
        part_number: 'SP-001',
        product_name: 'Spark Plug',
        name: 'Spark Plug',
        brand: 'NGK',
        category: 'Ignition',
        size: 'Standard',
        is_serialized: 0,
        current_stock: 27,
        stock: 27,
        reorder_level: 8,
        cost_price: '75.00',
        retail_price: '120.00',
        price: '120.00',
        compatibility_display: 'Click 125, Mio i125 2023'
    },
    {
        id: 3,
        item_id: 3,
        sku: 'ECU-RAIDER-01',
        part_number: 'ECU-RAIDER-01',
        product_name: 'ECU',
        name: 'ECU',
        brand: 'Suzuki',
        category: 'Electrical',
        size: 'Raider FI ECU',
        is_serialized: 1,
        current_stock: 1,
        stock: 1,
        reorder_level: 1,
        cost_price: '1500.00',
        retail_price: '2500.00',
        price: '2500.00',
        compatibility_display: 'Raider 150 2022'
    },
    {
        id: 4,
        item_id: 4,
        sku: '0A123D21',
        part_number: '0A123D21',
        product_name: 'block',
        name: 'block',
        brand: 'jvt',
        category: 'engine',
        size: '66mm',
        is_serialized: 0,
        current_stock: 14,
        stock: 14,
        reorder_level: 1,
        cost_price: '6500.00',
        retail_price: '7500.00',
        price: '7500.00',
        compatibility_display: 'Raider 150 2012'
    },
    {
        id: 5,
        item_id: 5,
        sku: 'JLR-BP-AEROX',
        part_number: 'JLR-BP-AEROX',
        product_name: 'Aerox Front Brake Pad Set',
        name: 'Aerox Front Brake Pad Set',
        brand: 'Yamaha',
        category: 'Brakes',
        size: 'Standard',
        is_serialized: 0,
        current_stock: 0,
        stock: 0,
        reorder_level: 5,
        cost_price: '250.00',
        retail_price: '450.00',
        price: '450.00',
        compatibility_display: 'Aerox 155 V1'
    },
    {
        id: 6,
        item_id: 6,
        sku: 'JLR-OF-AEROX',
        part_number: 'JLR-OF-AEROX',
        product_name: 'Aerox Engine Oil Filter Element',
        name: 'Aerox Engine Oil Filter Element',
        brand: 'Yamaha',
        category: 'Maintenance',
        size: 'Standard',
        is_serialized: 0,
        current_stock: 0,
        stock: 0,
        reorder_level: 5,
        cost_price: '120.00',
        retail_price: '220.00',
        price: '220.00',
        compatibility_display: 'Aerox 155 V1, Aerox 155 V3'
    }
];

const DEFAULT_SUPPLIERS = [
    {
        id: 1,
        name: 'Yamaha Motor Philippines',
        contact_person: 'Carlos Mendoza',
        email: 'sales@yamaha-motor.com.ph',
        phone: '0917-555-1234',
        address: 'Lima Technology Center, Malvar, Batangas',
        is_active: 1
    },
    {
        id: 2,
        name: 'Suzuki Philippines Inc.',
        contact_person: 'Maria Santos',
        email: 'parts@suzuki.com.ph',
        phone: '0918-444-5678',
        address: 'Canlubang Industrial Estate, Calamba, Laguna',
        is_active: 1
    },
    {
        id: 3,
        name: 'NGK Spark Plugs Phils.',
        contact_person: 'Roberto Cruz',
        email: 'orders@ngkntk.ph',
        phone: '0922-333-7890',
        address: 'Makati City, Metro Manila',
        is_active: 1
    }
];

const DEFAULT_TRANSACTIONS = [
    {
        id: 'SO-1001',
        order_number: 'SO-1001',
        total_amount: '120.00',
        payment_method: 'Cash',
        tendered_amount: '200.00',
        change_due: '80.00',
        cashier: 'admin',
        customer_name: 'Walk-in Customer',
        sale_date: new Date(Date.now() - 3600000 * 2).toISOString(),
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        items: [
            {
                product_id: 2,
                name: 'Spark Plug',
                part_number: 'SP-001',
                brand: 'NGK',
                quantity: 1,
                unit_price: 120.00,
                price: 120.00,
                subtotal: 120.00
            }
        ]
    },
    {
        id: 'SO-1002',
        order_number: 'SO-1002',
        total_amount: '7500.00',
        payment_method: 'GCash',
        tendered_amount: '7500.00',
        change_due: '0.00',
        cashier: 'staff',
        customer_name: 'Juan Dela Cruz',
        gcash_reference_no: 'GCASH-98471203',
        sale_date: new Date(Date.now() - 3600000 * 24).toISOString(),
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        items: [
            {
                product_id: 4,
                name: 'block',
                part_number: '0A123D21',
                brand: 'jvt',
                quantity: 1,
                unit_price: 7500.00,
                price: 7500.00,
                subtotal: 7500.00
            }
        ]
    }
];

const VEHICLE_OPTIONS = [
    {
        brand: 'Yamaha',
        models: [
            { id: 1, model: 'Aerox 155', versions: ['Aerox 155 V1', 'Aerox 155 V2', 'Aerox 155 V3'] },
            { id: 2, model: 'Mio i125', versions: ['2020', '2021', '2022', '2023'] },
            { id: 3, model: 'NMAX 155', versions: ['V1', 'V2'] }
        ]
    },
    {
        brand: 'Suzuki',
        models: [
            { id: 4, model: 'Raider 150', versions: ['Raider 150 2012', 'Raider 150 Carb', 'Raider 150 2022 FI'] }
        ]
    },
    {
        brand: 'Honda',
        models: [
            { id: 5, model: 'Click 125', versions: ['V1 Game Changer', 'V2', 'V3'] },
            { id: 6, model: 'XRM 125', versions: ['Standard', 'Motard'] }
        ]
    }
];

// In-memory or localStorage initializers
function getStored(key, defaultVal) {
    try {
        const item = localStorage.getItem(key);
        if (item) return JSON.parse(item);
    } catch (e) {
        // Fallback
    }
    return defaultVal;
}

function setStored(key, val) {
    try {
        localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
        // Fallback
    }
}

export function isMockModeActive() {
    if (import.meta.env.VITE_USE_MOCK === 'true') return true;
    return localStorage.getItem(STORAGE_KEYS.USE_MOCK) === 'true';
}

export function setMockModeActive(active) {
    localStorage.setItem(STORAGE_KEYS.USE_MOCK, active ? 'true' : 'false');
}

/**
 * Handles mock requests and returns an Axios-compatible response
 */
export async function handleMockRequest(config) {
    const method = (config.method || 'get').toLowerCase();
    const url = config.url || '';
    
    // Simulate slight network latency (50ms - 150ms) for realistic UX
    await new Promise(r => setTimeout(r, 60));

    let data = config.data;
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { /* ignore */ }
    }

    // 1. Auth: /auth/login
    if (url.includes('/auth/login') && method === 'post') {
        const { username, password } = data || {};
        const isAdmin = username?.toLowerCase().includes('admin');
        const role = isAdmin ? 'admin' : 'staff';
        const user = {
            id: isAdmin ? 1 : 2,
            username: username || (isAdmin ? 'admin' : 'staff'),
            role: role
        };
        const token = `mock-token-${role}-${Date.now()}`;
        return {
            status: 200,
            statusText: 'OK',
            data: { token, user, message: 'Logged in successfully (Demo Mode)' }
        };
    }

    // 2. Auth: /auth/verify
    if (url.includes('/auth/verify') && method === 'get') {
        const storedUser = JSON.parse(localStorage.getItem('user') || 'null') || {
            id: 1,
            username: 'admin',
            role: 'admin'
        };
        return {
            status: 200,
            statusText: 'OK',
            data: { user: storedUser }
        };
    }

    // 3. Products & Inventory: /inventory or /products
    if (url.includes('/inventory') || url.includes('/products')) {
        let products = getStored(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);

        // Adjust stock: PATCH /inventory/:id
        if (method === 'patch' || (method === 'post' && url.includes('/adjust'))) {
            const id = parseInt(url.split('/').pop(), 10);
            const { quantity, reason, notes } = data || {};
            const product = products.find(p => p.id === id);
            if (product) {
                product.stock = (product.stock || 0) + (Number(quantity) || 0);
                product.current_stock = product.stock;
                setStored(STORAGE_KEYS.PRODUCTS, products);

                // Record adjustment
                const adjustments = getStored(STORAGE_KEYS.ADJUSTMENTS, []);
                adjustments.unshift({
                    id: Date.now(),
                    product_id: id,
                    product_name: product.name,
                    part_number: product.part_number,
                    quantity_adjusted: quantity,
                    reason: reason || 'Audit Adjustment',
                    notes: notes || '',
                    adjusted_by: 'admin',
                    created_at: new Date().toISOString()
                });
                setStored(STORAGE_KEYS.ADJUSTMENTS, adjustments);
            }
            return {
                status: 200,
                statusText: 'OK',
                data: { success: true, message: 'Stock updated', product }
            };
        }

        // Add Product: POST /products
        if (method === 'post') {
            const newProduct = {
                id: Date.now(),
                item_id: Date.now(),
                ...data,
                stock: Number(data.stock || 0),
                current_stock: Number(data.stock || 0),
                price: Number(data.price || data.selling_price || 0),
                selling_price: Number(data.price || data.selling_price || 0)
            };
            products.unshift(newProduct);
            setStored(STORAGE_KEYS.PRODUCTS, products);
            return { status: 201, statusText: 'Created', data: newProduct };
        }

        return {
            status: 200,
            statusText: 'OK',
            data: products
        };
    }

    // 4. POS Checkout: POST /sales/checkout
    if (url.includes('/sales/checkout') && method === 'post') {
        const products = getStored(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
        const transactions = getStored(STORAGE_KEYS.TRANSACTIONS, DEFAULT_TRANSACTIONS);

        const items = data.items || [];
        let totalAmount = 0;
        const processedItems = items.map(item => {
            const prod = products.find(p => p.id === (item.product_id || item.variant_id)) || {};
            const qty = item.quantity || 1;
            const price = Number(prod.price || prod.selling_price || 100);
            const subtotal = qty * price;
            totalAmount += subtotal;

            // Decrement stock
            if (prod.stock !== undefined) {
                prod.stock = Math.max(0, prod.stock - qty);
                prod.current_stock = prod.stock;
            }

            return {
                product_id: prod.id,
                name: prod.name || prod.product_name,
                part_number: prod.part_number,
                brand: prod.brand,
                quantity: qty,
                unit_price: price,
                price: price,
                subtotal
            };
        });

        setStored(STORAGE_KEYS.PRODUCTS, products);

        const orderNumber = `SO-${Date.now().toString().slice(-6)}`;
        const newSale = {
            id: orderNumber,
            order_number: orderNumber,
            total_amount: totalAmount.toFixed(2),
            payment_method: data.payment_method || data.paymentMethod || 'Cash',
            tendered_amount: data.tendered_amount || data.tenderedAmount || totalAmount,
            change_due: Math.max(0, (data.tendered_amount || totalAmount) - totalAmount).toFixed(2),
            cashier: 'admin',
            gcash_reference_no: data.gcash_reference_no,
            sale_date: new Date().toISOString(),
            created_at: new Date().toISOString(),
            items: processedItems
        };

        transactions.unshift(newSale);
        setStored(STORAGE_KEYS.TRANSACTIONS, transactions);

        return {
            status: 200,
            statusText: 'OK',
            data: {
                success: true,
                order_number: orderNumber,
                sale_id: orderNumber,
                tendered_amount: newSale.tendered_amount,
                change_due: newSale.change_due
            }
        };
    }

    // 5. Sales / Transactions: /sales
    if (url.includes('/sales') && method === 'get') {
        const transactions = getStored(STORAGE_KEYS.TRANSACTIONS, DEFAULT_TRANSACTIONS);
        return {
            status: 200,
            statusText: 'OK',
            data: transactions
        };
    }

    // 6. Suppliers: /suppliers
    if (url.includes('/suppliers')) {
        let suppliers = getStored(STORAGE_KEYS.SUPPLIERS, DEFAULT_SUPPLIERS);
        if (method === 'post') {
            const newSup = {
                id: Date.now(),
                ...data,
                is_active: 1
            };
            suppliers.push(newSup);
            setStored(STORAGE_KEYS.SUPPLIERS, suppliers);
            return { status: 201, statusText: 'Created', data: newSup };
        }
        return {
            status: 200,
            statusText: 'OK',
            data: suppliers
        };
    }

    // 7. Reports: /reports
    if (url.includes('/reports/admin-stats')) {
        return {
            status: 200,
            statusText: 'OK',
            data: {
                total_sales: 8470.00,
                total_transactions: 14,
                total_profit: 2150.00
            }
        };
    }

    if (url.includes('/reports/best-selling')) {
        return {
            status: 200,
            statusText: 'OK',
            data: [
                { name: 'Bolt M8', part_number: 'BLT-M8-001', brand: 'JRP', total_sold: 45, total_revenue: 675.00 },
                { name: 'Spark Plug', part_number: 'SP-001', brand: 'NGK', total_sold: 18, total_revenue: 2160.00 },
                { name: 'block', part_number: '0A123D21', brand: 'jvt', total_sold: 3, total_revenue: 22500.00 }
            ]
        };
    }

    if (url.includes('/reports/sales-by-motorcycle')) {
        return {
            status: 200,
            statusText: 'OK',
            data: [
                { model: 'Raider 150 FI 2022', total_sales: 9500.00, items_sold: 8 },
                { model: 'Click 125', total_sales: 1200.00, items_sold: 10 },
                { model: 'Aerox 155', total_sales: 890.00, items_sold: 4 }
            ]
        };
    }

    if (url.includes('/reports/low-stock')) {
        const products = getStored(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
        const low = products.filter(p => p.stock <= p.reorder_level);
        return {
            status: 200,
            statusText: 'OK',
            data: low
        };
    }

    if (url.includes('/reports/by-cashier')) {
        return {
            status: 200,
            statusText: 'OK',
            data: [
                { cashier: 'admin', transactions: 10, total_sales: 6850.00 },
                { cashier: 'staff', transactions: 4, total_sales: 1620.00 }
            ]
        };
    }

    if (url.includes('/reports/categories')) {
        return {
            status: 200,
            statusText: 'OK',
            data: ['Bolts', 'Ignition', 'Electrical', 'engine', 'Brakes', 'Maintenance']
        };
    }

    if (url.includes('/reports/brands')) {
        return {
            status: 200,
            statusText: 'OK',
            data: ['JRP', 'NGK', 'Suzuki', 'jvt', 'Yamaha']
        };
    }

    if (url.includes('/reports/adjustments')) {
        const adjustments = getStored(STORAGE_KEYS.ADJUSTMENTS, []);
        return {
            status: 200,
            statusText: 'OK',
            data: adjustments
        };
    }

    // 8. Compatibility: /compatibility/options & /compatibility/search
    if (url.includes('/compatibility/options')) {
        return {
            status: 200,
            statusText: 'OK',
            data: VEHICLE_OPTIONS
        };
    }

    if (url.includes('/compatibility/search')) {
        const products = getStored(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
        return {
            status: 200,
            statusText: 'OK',
            data: {
                compatible: products.slice(0, 3).map(p => ({
                    ...p,
                    compatibility_status: 'Direct Fit',
                    notes: 'Verified OEM & aftermarket compatibility'
                })),
                incompatible: products.slice(3).map(p => ({
                    ...p,
                    compatibility_status: 'Not Compatible',
                    notes: 'Different thread pitch or bolt spacing'
                }))
            }
        };
    }

    // 9. Users: /users
    if (url.includes('/users')) {
        return {
            status: 200,
            statusText: 'OK',
            data: [
                { id: 1, username: 'admin', role: 'admin', created_at: new Date().toISOString() },
                { id: 2, username: 'staff', role: 'staff', created_at: new Date().toISOString() }
            ]
        };
    }

    // Default Fallback
    return {
        status: 200,
        statusText: 'OK',
        data: []
    };
}
