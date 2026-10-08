import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ShoppingCart, Printer, Search, Plus, Minus, Trash2, CheckCircle2, X, AlertCircle, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { filterProducts, isSerializedProduct, normalizePartNumberSearch } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import { calculateCartTotals, calculateItemSubtotal, calculatePaymentDetails } from '../utils/calculations';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import ThermalReceipt from '../components/ThermalReceipt';
import ReceiptPrint from '../components/ReceiptPrint';
import CheckoutModal from '../components/CheckoutModal';

const formatSerialNumbers = (serialNumbers) => {
    if (Array.isArray(serialNumbers)) return serialNumbers.join(', ');
    return serialNumbers || '';
};

const POS = () => {
    const { user } = useContext(AuthContext);
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);

    const filterProductsFn = useCallback((items, query, f) => {
        return filterProducts(items, query, {
            category: f.category,
            brand: f.brand,
            type: f.type
        });
    }, []);

    const {
        searchQuery,
        setSearchQuery,
        filters,
        setFilter,
        filteredItems: filteredProducts
    } = useTableFilter({
        items: products,
        initialFilters: { category: 'All', brand: 'All', type: 'All' },
        filterFn: filterProductsFn
    });

    const category = filters.category;
    const brandFilter = filters.brand;
    const typeFilter = filters.type;
    const setCategory = (val) => setFilter('category', val);
    const setBrandFilter = (val) => setFilter('brand', val);
    const setTypeFilter = (val) => setFilter('type', val);

    // Receipt & Confirmation Modal State
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastTransaction, setLastTransaction] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [tenderedAmount, setTenderedAmount] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [serialPicker, setSerialPicker] = useState({
        open: false,
        product: null,
        serials: [],
        selectedIds: [],
        loading: false
    });

    const productsRef = useRef(products);
    productsRef.current = products;

    const cartRef = useRef(cart);
    cartRef.current = cart;

    const serialPickerRef = useRef(serialPicker);
    serialPickerRef.current = serialPicker;

    const showConfirmModalRef = useRef(showConfirmModal);
    showConfirmModalRef.current = showConfirmModal;

    const showReceiptRef = useRef(showReceipt);
    showReceiptRef.current = showReceipt;

    const scannerBufferRef = useRef('');
    const lastKeyTimeRef = useRef(0);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await api.get('/products');
                const activeProducts = res.data.filter(p => p.stock > 0);
                setProducts(activeProducts);
            } catch {
                toast.error('Failed to load products');
            }
        };
        fetchProducts();
    }, []);

    const uniqueCategories = [...new Set(products.map(product => product.category))];
    const uniqueBrands = ['All', ...new Set(products.map(product => product.brand).filter(Boolean))];

    const openSerialPicker = useCallback(async (product) => {
        if (!product) return;
        const productId = product.id || product.product_id;
        setSerialPicker({
            open: true,
            product,
            serials: [],
            selectedIds: [],
            loading: true
        });

        try {
            const res = await api.get(`/products/${productId}/serials`);
            const existing = cartRef.current.find(item => item.product_id === productId);
            setSerialPicker({
                open: true,
                product,
                serials: res.data,
                selectedIds: (existing?.serial_ids || []).map(Number),
                loading: false
            });
        } catch {
            toast.error('Failed to load available serials');
            setSerialPicker({
                open: false,
                product: null,
                serials: [],
                selectedIds: [],
                loading: false
            });
        }
    }, []);

    const closeSerialPicker = () => {
        setSerialPicker({
            open: false,
            product: null,
            serials: [],
            selectedIds: [],
            loading: false
        });
    };

    const toggleSerialSelection = useCallback((serialId) => {
        const numericId = Number(serialId);
        setSerialPicker(prev => ({
            ...prev,
            selectedIds: prev.selectedIds.includes(numericId)
                ? prev.selectedIds.filter(id => id !== numericId)
                : [...prev.selectedIds, numericId]
        }));
    }, []);

    const confirmSerialSelection = () => {
        const product = serialPicker.product;
        if (!product) return;

        if (serialPicker.selectedIds.length === 0) {
            toast.error('Select at least one serial number');
            return;
        }

        const selectedSerials = serialPicker.serials.filter(serial =>
            serialPicker.selectedIds.includes(Number(serial.id))
        );

        const cartItem = {
            product_id: product.id || product.product_id,
            part_number: product.part_number,
            name: product.product_name || product.name,
            brand: product.brand,
            size: product.size,
            compatibility_display: product.compatibility_display,
            is_serialized: true,
            serial_ids: selectedSerials.map(serial => Number(serial.id)),
            serial_numbers: selectedSerials.map(serial => serial.serial_number),
            price: Number(product.price),
            quantity: selectedSerials.length,
            subtotal: calculateItemSubtotal(selectedSerials.length, product.price),
            maxStock: product.stock
        };

        setCart(currentCart => {
            const exists = currentCart.some(item => item.product_id === product.id);
            return exists
                ? currentCart.map(item => item.product_id === product.id ? cartItem : item)
                : [...currentCart, cartItem];
        });

        closeSerialPicker();
    };

    const addToCart = useCallback((product) => {
        if (!product) return;
        if (isSerializedProduct(product)) {
            openSerialPicker(product);
            return;
        }

        setCart(currentCart => {
            const existing = currentCart.find(item => item.product_id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock) {
                    toast.error('Cannot exceed available stock');
                    return currentCart;
                }
                return currentCart.map(item =>
                    item.product_id === product.id
                        ? { ...item, quantity: item.quantity + 1, subtotal: calculateItemSubtotal(item.quantity + 1, item.price) }
                        : item
                );
            } else {
                return [...currentCart, {
                    product_id: product.id,
                    part_number: product.part_number,
                    name: product.product_name || product.name,
                    brand: product.brand,
                    size: product.size,
                    compatibility_display: product.compatibility_display,
                    is_serialized: false,
                    serial_ids: [],
                    serial_numbers: [],
                    price: Number(product.price),
                    quantity: 1,
                    subtotal: calculateItemSubtotal(1, product.price),
                    maxStock: product.stock
                }];
            }
        });
    }, [openSerialPicker]);

    const updateQuantity = (id, delta) => {
        setCart(cart.map(item => {
            if (item.product_id === id) {
                if (item.is_serialized) {
                    toast.error('Edit selected serials to change quantity');
                    return item;
                }
                const newQuantity = item.quantity + delta;
                if (newQuantity <= 0) return item;
                if (newQuantity > item.maxStock) {
                    toast.error('Cannot exceed available stock');
                    return item;
                }
                return { ...item, quantity: newQuantity, subtotal: calculateItemSubtotal(newQuantity, item.price) };
            }
            return item;
        }));
    };

    const setQuantityDirect = (id, newQuantity) => {
        setCart(cart.map(item => {
            if (item.product_id === id) {
                if (item.is_serialized) {
                    toast.error('Edit selected serials to change quantity');
                    return item;
                }
                let qty = parseInt(newQuantity);
                if (isNaN(qty) || qty < 1) qty = 1;
                if (qty > item.maxStock) {
                    toast.error('Cannot exceed available stock');
                    qty = item.maxStock;
                }
                return { ...item, quantity: qty, subtotal: calculateItemSubtotal(qty, item.price) };
            }
            return item;
        }));
    };

    const removeFromCart = (id) => setCart(cart.filter(item => item.product_id !== id));

    const { totalAmount } = calculateCartTotals(cart);
    const paymentDetails = calculatePaymentDetails(totalAmount, tenderedAmount, paymentMethod);

    // 1. Trigger the confirmation modal
    const handleCheckoutClick = () => {
        if (cart.length === 0) return toast.error('Cart is empty');
        const missingSerialItem = cart.find(item => item.is_serialized && (!item.serial_ids || item.serial_ids.length === 0));
        if (missingSerialItem) return toast.error(`Select a serial number for ${missingSerialItem.name}`);
        setShowConfirmModal(true);
    };

    // 2. Process payment from CheckoutModal
    const [submittingPayment, setSubmittingPayment] = useState(false);
    const processPayment = async ({ paymentMethod: method, tenderedAmount: amount, changeDue: change, gcashReference: gcashRef }) => {
        const missingSerialItem = cart.find(item => item.is_serialized && (!item.serial_ids || item.serial_ids.length === 0));
        if (missingSerialItem) {
            toast.error(`Select a serial number for ${missingSerialItem.name}`);
            return;
        }

        setSubmittingPayment(true);
        try {
            const payload = {
                items: cart.map(item => ({
                    variant_id: item.product_id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    serial_ids: item.serial_ids || []
                })),
                payment_method: method,
                paymentMethod: method,
                tendered_amount: Number(amount) || 0,
                tenderedAmount: Number(amount) || 0,
                gcash_reference_no: gcashRef || undefined
            };

            const res = await api.post('/sales/checkout', payload);
            toast.success('Transaction Completed!');

            // Save details for the receipt modal
            setLastTransaction({
                id: res.data.order_number || res.data.sale_id || `SO-${Date.now()}`,
                orderNumber: res.data.order_number,
                date: new Date(),
                items: [...cart],
                total: totalAmount,
                paymentMethod: method,
                tenderedAmount: res.data.tendered_amount ?? amount,
                changeDue: res.data.change_due ?? change,
                gcashReference: gcashRef,
                customerName,
                customerAddress,
                cashier: user.username
            });

            // Close modal & clear cart
            setShowConfirmModal(false);
            setCart([]);

            // Refresh products catalog
            const resProducts = await api.get('/products');
            const activeProducts = resProducts.data.filter(p => p.stock > 0);
            setProducts(activeProducts);

            // Display receipt & auto-trigger print
            setShowReceipt(true);
            setTimeout(() => {
                window.print();
            }, 300);

        } catch (err) {
            toast.error(err.response?.data?.message || err.response?.data?.error || 'Transaction failed');
        } finally {
            setSubmittingPayment(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const closeReceipt = () => {
        setShowReceipt(false);
        setLastTransaction(null);
        setPaymentMethod('Cash');
        setTenderedAmount('');
        setCustomerName('');
        setCustomerAddress('');
    };

    const processBarcodeScan = useCallback((scannedCode) => {
        const trimmed = (scannedCode || '').trim();
        if (!trimmed) return;

        // Ignore scans if modal or receipt is open
        if (showConfirmModalRef.current || showReceiptRef.current) return;

        const currentPicker = serialPickerRef.current;
        // 1. If Serial Picker is open, match against available serial numbers
        if (currentPicker.open && currentPicker.serials.length > 0) {
            const matchingSerial = currentPicker.serials.find(
                s => s.serial_number.toLowerCase() === trimmed.toLowerCase()
            );
            if (matchingSerial) {
                toggleSerialSelection(matchingSerial.id);
                toast.success(`Selected serial: ${matchingSerial.serial_number}`);
                return;
            }
        }

        // 2. Search against catalog
        const currentProducts = productsRef.current;
        const exactMatch = currentProducts.find(
            p => p.part_number.toLowerCase() === trimmed.toLowerCase() ||
                 normalizePartNumberSearch(p.part_number) === normalizePartNumberSearch(trimmed)
        );

        const targetProduct = exactMatch || filterProducts(currentProducts, trimmed)[0];

        if (targetProduct) {
            if (isSerializedProduct(targetProduct)) {
                openSerialPicker(targetProduct);
                toast.success(`Scanned: ${targetProduct.product_name} - Select Serial`);
            } else {
                addToCart(targetProduct);
                toast.success(`Scanned: ${targetProduct.product_name} (${targetProduct.part_number})`);
            }
            setSearchQuery('');
        } else {
            toast.error(`No product matches barcode: ${trimmed}`);
        }
    }, [openSerialPicker, addToCart, toggleSerialSelection]);

    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            const activeEl = document.activeElement;
            const isOtherInput = activeEl &&
                (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT') &&
                !activeEl.classList.contains('pos-search-input');

            const now = performance.now();
            const timeDiff = now - lastKeyTimeRef.current;
            lastKeyTimeRef.current = now;

            // Handle carriage return / enter from scanner
            if (e.key === 'Enter') {
                const buffer = scannerBufferRef.current.trim();
                // A hardware scanner emits rapid characters followed by Enter
                if (buffer.length >= 2) {
                    e.preventDefault();
                    e.stopPropagation();
                    processBarcodeScan(buffer);
                    scannerBufferRef.current = '';
                    return;
                }
                scannerBufferRef.current = '';
                return;
            }

            // Capture single printable characters
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                // If focus is inside a non-search input, only buffer if keystrokes are scanner-fast (< 40ms)
                if (isOtherInput) {
                    if (timeDiff > 40) {
                        scannerBufferRef.current = '';
                        return;
                    }
                    scannerBufferRef.current += e.key;
                } else {
                    // Not in another input: reset buffer if pause > 55ms
                    if (timeDiff > 55) {
                        scannerBufferRef.current = e.key;
                    } else {
                        scannerBufferRef.current += e.key;
                    }
                }
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleGlobalKeyDown, true);
        };
    }, [processBarcodeScan]);

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const trimmed = searchQuery.trim();
            if (!trimmed) return;
            processBarcodeScan(trimmed);
        }
    };

    return (
        <div className="main-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', height: '100%', gap: '16px', position: 'relative' }}>

            {/* PRODUCT SELECTION AREA (8 of 12 columns on desktop) */}
            <div className="no-print pos-catalog-wrapper" style={{ gridColumn: 'span 12 / span 12', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <style>{`
                    .pos-catalog-wrapper { grid-column: span 12 / span 12; }
                    .pos-cart-wrapper { grid-column: span 12 / span 12; }
                    @media (min-width: 1024px) {
                        .pos-catalog-wrapper { grid-column: span 8 / span 12 !important; }
                        .pos-cart-wrapper { grid-column: span 4 / span 12 !important; }
                    }
                `}</style>
                <h1>Point of Sale</h1>

                {/* Filter bar on a single compact row: grid-cols-2 md:grid-cols-4 gap-2.5 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'center', width: '100%', marginBottom: '12px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search or scan part # (Enter to add)..."
                            className="input-premium pos-search-input"
                            style={{ paddingLeft: '32px', width: '100%' }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            autoFocus
                        />
                    </div>
                    <div style={{ width: '100%' }}>
                        <select className="input-premium" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                            {uniqueBrands.map(brand => (
                                <option key={brand} value={brand}>{brand === 'All' ? 'All Brands' : brand}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ width: '100%' }}>
                        <select value={category} onChange={e => setCategory(e.target.value)} className="input-premium" style={{ width: '100%', cursor: 'pointer' }}>
                            <option value="All">All Categories</option>
                            {uniqueCategories.map((cat, index) => (
                                cat ? <option key={index} value={cat}>{cat}</option> : null
                            ))}
                        </select>
                    </div>
                    <div style={{ width: '100%' }}>
                        <select className="input-premium" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                            <option value="All">All Types</option>
                            <option value="Non-Serialized">Non-Serialized Only</option>
                            <option value="Serialized">Serialized Only</option>
                        </select>
                    </div>
                </div>

                <div className="table-container" style={{ width: '100%', overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Part Number</th>
                                <th>Product Name</th>
                                <th>Brand</th>
                                <th>Size</th>
                                <th style={{ textAlign: 'right' }}>Stock</th>
                                <th style={{ textAlign: 'right' }}>Price</th>
                                <th>Compatibility</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.length > 0 ? filteredProducts.map(p => (
                                <tr key={p.id} onClick={() => addToCart(p)} style={{ cursor: 'pointer' }}>
                                    <td style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{p.part_number}</td>
                                    <td style={{ fontWeight: '600' }}>{p.product_name}</td>
                                    <td>{p.brand}</td>
                                    <td>{p.size}</td>
                                    <td style={{ textAlign: 'right', color: p.stock <= 5 ? 'var(--danger)' : 'var(--success)', fontWeight: 'bold' }}>{p.stock}</td>
                                    <td style={{ textAlign: 'right', color: 'var(--primary)', fontWeight: 'bold' }}>{formatCurrency(p.price)}</td>
                                    <td>{p.compatibility_display || '-'}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={7} className="table-empty-state">
                                        No matching products found. Try scanning another part number or clearing filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* CART AREA (4 of 12 columns on desktop) */}
            <div className="glass-panel no-print cart-container pos-cart-wrapper" style={{ display: 'flex', flexDirection: 'column', padding: '0', minHeight: '480px', height: 'fit-content' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '12px 12px 0 0' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1rem', fontWeight: 600 }}><ShoppingCart size={18} /> Current Order</h3>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px', maxHeight: '420px' }}>
                    {cart.length === 0 ? (
                        <div style={{ height: '100%', minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Order is empty</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {cart.map(item => (
                                <div key={item.product_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-hover)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                                        <div style={{ fontWeight: '600', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name} <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>({item.brand})</span></div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.part_number} | {formatCurrency(item.price)}</div>
                                        {item.is_serialized && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '2px' }}>
                                                Serials: {item.serial_numbers?.join(', ') || 'None selected'}
                                            </div>
                                        )}
                                    </div>
                                    {item.is_serialized ? (
                                        <button onClick={() => openSerialPicker(products.find(product => product.id === item.product_id) || item)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                                            Serials ({item.quantity})
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <button onClick={() => updateQuantity(item.product_id, -1)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'white', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                                            <input type="number" min="1" max={item.maxStock} value={item.quantity} onChange={(e) => setQuantityDirect(item.product_id, e.target.value)} style={{ width: '40px', height: '26px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', color: 'white', borderRadius: '4px', padding: '2px', fontSize: '0.8rem' }} />
                                            <button onClick={() => updateQuantity(item.product_id, 1)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'white', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
                                        </div>
                                    )}
                                    <div style={{ width: '80px', textAlign: 'right', fontWeight: 'bold', fontSize: '0.85rem' }}>{formatCurrency(item.subtotal)}</div>
                                    <button onClick={() => removeFromCart(item.product_id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '6px' }}><Trash2 size={15} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '0 0 12px 12px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total Amount</span>
                        <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '1.4rem' }}>{formatCurrency(totalAmount)}</span>
                    </div>
                    <button className="btn-primary" style={{ width: '100%', padding: '10px 14px', fontSize: '0.9rem' }} onClick={handleCheckoutClick} disabled={cart.length === 0}>
                        <CheckCircle2 size={16} /> Complete Payment
                    </button>
                </div>
            </div>

            {serialPicker.open && (
                <div className="receipt-overlay no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="glass-panel" style={{ background: 'var(--surface)', padding: '24px', width: '440px', maxWidth: 'calc(100vw - 32px)', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>Select Serials</h3>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                                    {serialPicker.product?.part_number} | {serialPicker.product?.product_name || serialPicker.product?.name}
                                </div>
                            </div>
                            <button onClick={closeSerialPicker} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={22} />
                            </button>
                        </div>

                        <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                            {serialPicker.loading ? (
                                <div style={{ color: 'var(--text-muted)', padding: '16px', textAlign: 'center' }}>Loading serials...</div>
                            ) : serialPicker.serials.length > 0 ? (
                                serialPicker.serials.map(serial => {
                                    const serialId = Number(serial.id);
                                    return (
                                        <label key={serial.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-hover)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={serialPicker.selectedIds.includes(serialId)}
                                                onChange={() => toggleSerialSelection(serialId)}
                                                style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                                            />
                                            <span style={{ fontWeight: '600' }}>{serial.serial_number}</span>
                                        </label>
                                    );
                                })
                            ) : (
                                <div style={{ color: 'var(--danger)', padding: '16px', textAlign: 'center' }}>No available serials</div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                Selected: {serialPicker.selectedIds.length}
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="btn-secondary" onClick={closeSerialPicker}>Cancel</button>
                                <button className="btn-primary" onClick={confirmSerialSelection} disabled={serialPicker.loading || serialPicker.selectedIds.length === 0}>
                                    Use Serials
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CHECKOUT MODAL */}
            <CheckoutModal
                isOpen={showConfirmModal}
                onClose={() => setShowConfirmModal(false)}
                totalAmount={totalAmount}
                cart={cart}
                customerName={customerName}
                customerAddress={customerAddress}
                onCustomerNameChange={setCustomerName}
                onCustomerAddressChange={setCustomerAddress}
                onProcessPayment={processPayment}
                loading={submittingPayment}
            />

            {/* RECEIPT MODAL */}
            {showReceipt && lastTransaction && (
                <div className="receipt-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '50px', overflowY: 'auto' }}>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <button className="no-print" onClick={closeReceipt} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#666666' }}>
                            <X size={24} />
                        </button>

                        <div className="receipt-container" style={{ display: 'block' }}>
                            <ReceiptPrint
                                orderNumber={lastTransaction.orderNumber || lastTransaction.id}
                                date={lastTransaction.date}
                                cashier={lastTransaction.cashier}
                                customerName={lastTransaction.customerName}
                                customerAddress={lastTransaction.customerAddress}
                                items={lastTransaction.items}
                                totalAmount={lastTransaction.total}
                                paymentMethod={lastTransaction.paymentMethod}
                                amountTendered={lastTransaction.tenderedAmount}
                                changeDue={lastTransaction.changeDue}
                                gcashReference={lastTransaction.gcashReference}
                            />
                        </div>

                        <div className="no-print" style={{ marginTop: '20px', display: 'flex', gap: '12px', width: '100%', maxWidth: '300px' }}>
                            <button className="btn-primary" style={{ flex: 1, padding: '12px' }} onClick={handlePrint}>
                                <Printer size={20} /> Print Receipt
                            </button>
                            <button className="btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={closeReceipt}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default POS;
