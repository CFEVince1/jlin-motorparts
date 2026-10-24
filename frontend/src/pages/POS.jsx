import { useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ShoppingCart, ChevronDown, Check, Printer, Search, Plus, Minus, Trash2, CheckCircle2, X, AlertCircle, Banknote, CreditCard, Smartphone, History, RotateCcw } from 'lucide-react';
import { filterProducts, isSerializedProduct, normalizePartNumberSearch } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import { calculateCartTotals, calculateItemSubtotal, calculatePaymentDetails } from '../utils/calculations';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import ThermalReceipt from '../components/ThermalReceipt';
import ReceiptPrint from '../components/ReceiptPrint';
import CheckoutModal from '../components/CheckoutModal';
import { notifyInventoryChange } from '../utils/syncEvents';

const formatSerialNumbers = (serialNumbers) => {
    if (Array.isArray(serialNumbers)) return serialNumbers.join(', ');
    return serialNumbers || '';
};

const getPageNumbers = (current, total) => {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 3) {
        return [1, 2, 3, 4, '...', total];
    }
    if (current >= total - 2) {
        return [1, '...', total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
};

const POS = () => {
    const navigate = useNavigate();
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

    const [pageSize, setPageSize] = useState(25);

    // Expand serialized products: 1 row per available serial lot with quantity > 0, sorted by serial.
    // Non-serialized products remain as single rows with total stock.
    const catalogRows = useMemo(() => {
        const rows = [];
        const sortedProducts = [...products].sort((a, b) =>
            (a.product_name || a.name || '').localeCompare(b.product_name || b.name || '')
        );

        for (const p of sortedProducts) {
            if (p.is_serialized) {
                const availSerials = (p.serials || []).filter(s => 
                    s && s.serial_number && 
                    (s.status === 'available' || s.status === null || !s.status) && 
                    Number(s.quantity || 0) > 0
                );
                const sortedSerials = [...availSerials].sort((s1, s2) =>
                    String(s1.serial_number).localeCompare(String(s2.serial_number), undefined, { numeric: true, sensitivity: 'base' })
                );

                for (const s of sortedSerials) {
                    const lotStock = Number(s.quantity || 1);
                    rows.push({
                        ...p,
                        row_key: `${p.id}_${s.id}`,
                        product_id: p.id,
                        serial_id: Number(s.id),
                        serial_number: s.serial_number,
                        is_serialized: true,
                        stock: lotStock,
                        stock_display: `In stock (${lotStock})`
                    });
                }
            } else {
                rows.push({
                    ...p,
                    row_key: String(p.id),
                    product_id: p.id,
                    serial_id: null,
                    serial_number: '—',
                    is_serialized: false,
                    stock: p.stock ?? p.current_stock ?? 0,
                    stock_display: `In stock (${p.stock ?? p.current_stock ?? 0})`
                });
            }
        }
        return rows;
    }, [products]);

    const {
        searchQuery,
        setSearchQuery,
        filters,
        setFilter,
        filteredItems: filteredProducts,
        paginatedItems: paginatedProducts,
        currentPage,
        totalPages,
        paginate,
        filteredCount
    } = useTableFilter({
        items: catalogRows,
        initialSearch: typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('q') || '') : '',
        initialFilters: { category: 'All', brand: 'All', type: 'All' },
        filterFn: filterProductsFn,
        itemsPerPage: pageSize
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
    const [selectedTableSerials, setSelectedTableSerials] = useState({});
    const [openSerialDropdownId, setOpenSerialDropdownId] = useState(null);
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
                const initialSerials = {};
                activeProducts.forEach(p => {
                    if (p.is_serialized && p.serials && p.serials.length > 0) {
                        initialSerials[p.id] = Number(p.serials[0].id);
                    }
                });
                setSelectedTableSerials(prev => ({ ...initialSerials, ...prev }));

                const urlParams = new URLSearchParams(window.location.search);
                const addSerial = urlParams.get('add_serial');
                if (addSerial) {
                    for (const p of activeProducts) {
                        const s = (p.serials || []).find(ser => ser.serial_number === addSerial);
                        if (s) {
                            const cartKey = `${p.id}_${s.id}`;
                            const productPrice = Number(p.price ?? p.selling_price ?? 0);
                            const lotStock = Number(s.quantity || 1);
                            setCart([{
                                cart_key: cartKey,
                                product_id: p.id,
                                part_number: p.part_number,
                                name: p.product_name || p.name,
                                brand: p.brand,
                                size: p.size,
                                compatibility_display: p.compatibility_display,
                                is_serialized: true,
                                serial_id: s.id,
                                selected_serial_id: s.id,
                                serial_number: s.serial_number,
                                selected_serial_number: s.serial_number,
                                serial_ids: [s.id],
                                serial_numbers: [s.serial_number],
                                quantity: lotStock,
                                price: productPrice,
                                subtotal: lotStock * productPrice,
                                maxStock: lotStock
                            }]);
                            break;
                        }
                    }
                }
            } catch {
                toast.error('Failed to load products');
            }
        };
        fetchProducts();
    }, []);

    const uniqueCategories = [...new Set(catalogRows.map(product => product.category).filter(Boolean))];
    const uniqueBrands = ['All', ...new Set(catalogRows.map(product => product.brand).filter(Boolean))];

    const catalogRowsRef = useRef(catalogRows);
    catalogRowsRef.current = catalogRows;

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

        setCart(currentCart => {
            let nextCart = [...currentCart];
            selectedSerials.forEach(serial => {
                const targetKey = `${product.id}_${serial.id}`;
                const existingIdx = nextCart.findIndex(it => (it.cart_key || String(it.product_id)) === targetKey);
                if (existingIdx >= 0) {
                    // Already in cart
                } else {
                    nextCart.push({
                        cart_key: targetKey,
                        product_id: product.id || product.product_id,
                        part_number: product.part_number,
                        name: product.product_name || product.name,
                        brand: product.brand,
                        size: product.size,
                        compatibility_display: product.compatibility_display,
                        is_serialized: true,
                        selected_serial_id: Number(serial.id),
                        selected_serial_number: serial.serial_number,
                        serial_ids: [Number(serial.id)],
                        serial_numbers: [serial.serial_number],
                        price: Number(product.price),
                        quantity: 1,
                        subtotal: calculateItemSubtotal(1, product.price),
                        maxStock: product.stock
                    });
                }
            });
            return nextCart;
        });

        closeSerialPicker();
    };

    const addSerializedToCart = useCallback((product, serialObj) => {
        if (!product || !serialObj) return;
        const chosenSerialId = (serialObj.id !== undefined && serialObj.id !== null) ? Number(serialObj.id) : null;
        const chosenSerialNum = serialObj.serial_number || (product.serial_display || 'SN-DEFAULT');

        if (chosenSerialId !== null) {
            setSelectedTableSerials(prev => ({ ...prev, [product.id]: chosenSerialId }));
        }

        const currentCart = cartRef.current;
        const targetCartKey = chosenSerialId !== null ? `${product.id}_${chosenSerialId}` : `${product.id}_${chosenSerialNum}`;
        const existing = currentCart.find(item => (item.cart_key || String(item.product_id)) === targetCartKey);

        const totalInCartForProduct = currentCart
            .filter(item => Number(item.product_id) === Number(product.id))
            .reduce((sum, item) => sum + item.quantity, 0);

        const maxStock = Number(product.stock ?? product.current_stock ?? 0);
        if (totalInCartForProduct >= maxStock) {
            toast.error(`Cannot exceed available stock (${maxStock}) for ${product.product_name || product.name}`);
            return;
        }

        const productPrice = Number(product.price ?? product.selling_price ?? product.retail_price ?? 0);

        if (existing) {
            const newQty = existing.quantity + 1;
            setCart(prev => prev.map(item => (item.cart_key || String(item.product_id)) === targetCartKey ? {
                ...item,
                quantity: newQty,
                subtotal: calculateItemSubtotal(newQty, item.price)
            } : item));
            toast.success(`Updated ${product.product_name || product.name} (${chosenSerialNum}) [Qty: ${newQty}]`);
        } else {
            const newItem = {
                cart_key: targetCartKey,
                product_id: product.id,
                part_number: product.part_number,
                name: product.product_name || product.name,
                brand: product.brand,
                size: product.size,
                compatibility_display: product.compatibility_display,
                is_serialized: true,
                selected_serial_id: chosenSerialId,
                selected_serial_number: chosenSerialNum,
                serial_ids: chosenSerialId !== null ? [chosenSerialId] : [],
                serial_numbers: chosenSerialNum ? [chosenSerialNum] : [],
                quantity: 1,
                price: productPrice,
                subtotal: calculateItemSubtotal(1, productPrice),
                maxStock: maxStock
            };
            setCart(prev => [...prev, newItem]);
            toast.success(`Added ${product.product_name || product.name} (${chosenSerialNum})`);
        }
    }, []);

    const handleRowClick = useCallback((item) => {
        if (!item) return;

        if (item.is_serialized) {
            const serialId = item.serial_id;
            const serialNum = item.serial_number;
            const cartKey = `${item.product_id}_${serialId}`;
            const existing = cartRef.current.find(cItem => (cItem.cart_key || String(cItem.product_id)) === cartKey);

            if (existing) {
                toast.error(`Serial ${serialNum} is already in the cart`);
                return;
            }

            const productPrice = Number(item.price ?? item.selling_price ?? item.retail_price ?? 0);
            const newItem = {
                cart_key: cartKey,
                product_id: item.product_id,
                part_number: item.part_number,
                name: item.product_name || item.name,
                brand: item.brand,
                size: item.size,
                compatibility_display: item.compatibility_display,
                is_serialized: true,
                serial_id: serialId,
                selected_serial_id: serialId,
                serial_number: serialNum,
                selected_serial_number: serialNum,
                serial_ids: [serialId],
                serial_numbers: [serialNum],
                quantity: 1,
                price: productPrice,
                subtotal: calculateItemSubtotal(1, productPrice),
                maxStock: Number(item.stock || 1)
            };
            setCart(prev => [...prev, newItem]);
            toast.success(`Added ${item.product_name || item.name} (${serialNum})`);
            return;
        }

        // Non-serialized item handling:
        const currentCart = cartRef.current;
        const targetCartKey = String(item.product_id);
        const existing = currentCart.find(cItem => (cItem.cart_key || String(cItem.product_id)) === targetCartKey);
        const maxStock = Number(item.stock ?? item.current_stock ?? 0);

        if (existing && existing.quantity >= maxStock) {
            toast.error(`Cannot exceed available stock (${maxStock})`);
            return;
        }

        const productPrice = Number(item.price ?? item.selling_price ?? item.retail_price ?? 0);

        if (existing) {
            const newQty = existing.quantity + 1;
            setCart(prev => prev.map(cItem =>
                (cItem.cart_key || String(cItem.product_id)) === targetCartKey
                    ? { ...cItem, quantity: newQty, subtotal: calculateItemSubtotal(newQty, cItem.price) }
                    : cItem
            ));
            toast.success(`Updated ${item.product_name || item.name} quantity to ${newQty}`);
        } else {
            const newItem = {
                cart_key: targetCartKey,
                product_id: item.product_id,
                part_number: item.part_number,
                name: item.product_name || item.name,
                brand: item.brand,
                size: item.size,
                compatibility_display: item.compatibility_display,
                is_serialized: false,
                serial_ids: [],
                serial_numbers: [],
                price: productPrice,
                quantity: 1,
                subtotal: calculateItemSubtotal(1, productPrice),
                maxStock: maxStock
            };
            setCart(prev => [...prev, newItem]);
            toast.success(`Added ${item.product_name || item.name}`);
        }
    }, []);

    const addToCart = handleRowClick;

    const updateQuantity = (cartKey, delta) => {
        setCart(currentCart => {
            const target = currentCart.find(item => (item.cart_key || String(item.product_id)) === String(cartKey));
            if (!target) return currentCart;

            const newQty = target.quantity + delta;
            if (newQty < 1) return currentCart;

            if (target.is_serialized) {
                if (newQty > target.maxStock) {
                    toast.error(`Cannot exceed available stock (${target.maxStock}) for serial ${target.serial_number}`);
                    return currentCart;
                }
            } else {
                const otherLinesQty = currentCart
                    .filter(item => !item.is_serialized && item.product_id === target.product_id && (item.cart_key || String(item.product_id)) !== String(cartKey))
                    .reduce((sum, item) => sum + item.quantity, 0);

                if (newQty + otherLinesQty > target.maxStock) {
                    toast.error(`Cannot exceed available stock (${target.maxStock}) for ${target.name}`);
                    return currentCart;
                }
            }

            return currentCart.map(item => {
                if ((item.cart_key || String(item.product_id)) === String(cartKey)) {
                    return {
                        ...item,
                        quantity: newQty,
                        subtotal: calculateItemSubtotal(newQty, item.price)
                    };
                }
                return item;
            });
        });
    };

    const setQuantityDirect = (cartKey, newQuantity) => {
        setCart(currentCart => {
            const target = currentCart.find(item => (item.cart_key || String(item.product_id)) === String(cartKey));
            if (!target) return currentCart;

            let qty = parseInt(newQuantity);
            if (isNaN(qty) || qty < 1) qty = 1;

            let maxAllowed = target.maxStock;
            if (!target.is_serialized) {
                const otherLinesQty = currentCart
                    .filter(item => !item.is_serialized && item.product_id === target.product_id && (item.cart_key || String(item.product_id)) !== String(cartKey))
                    .reduce((sum, item) => sum + item.quantity, 0);
                maxAllowed = Math.max(1, target.maxStock - otherLinesQty);
            }

            if (qty > maxAllowed) {
                toast.error(`Cannot exceed available stock (${maxAllowed}) for ${target.name}`);
                qty = maxAllowed;
            }

            return currentCart.map(item => {
                if ((item.cart_key || String(item.product_id)) === String(cartKey)) {
                    return { ...item, quantity: qty, subtotal: calculateItemSubtotal(qty, item.price) };
                }
                return item;
            });
        });
    };

    const removeFromCart = (cartKey) => {
        setCart(currentCart => currentCart.filter(item => (item.cart_key || String(item.product_id)) !== String(cartKey)));
    };

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
    const processPayment = async ({ paymentMethod: method, tenderedAmount: amount, changeDue: change, gcashReference: gcashRef, cashAmount, gcashAmount }) => {
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
                    price: item.price,
                    unit_price: item.price,
                    serial_ids: item.serial_ids || []
                })),
                payment_method: method,
                paymentMethod: method,
                tendered_amount: Number(amount) || 0,
                tenderedAmount: Number(amount) || 0,
                cash_amount: cashAmount !== undefined ? Number(cashAmount) : undefined,
                gcash_amount: gcashAmount !== undefined ? Number(gcashAmount) : undefined,
                customer_name: customerName || 'Walk-in Customer',
                customer_address: customerAddress || undefined,
                gcash_reference_no: gcashRef || undefined
            };

            const res = await api.post('/sales/checkout', payload);
            notifyInventoryChange('sale');
            toast.success('Transaction Completed!');

            // Save details for the receipt modal
            setLastTransaction({
                id: res.data.sale_id || res.data.id || res.data.order_number || `SO-${Date.now()}`,
                saleId: res.data.sale_id || res.data.id,
                orderNumber: res.data.order_number,
                date: new Date(),
                items: [...cart],
                total: res.data.total_amount ?? totalAmount,
                paymentMethod: res.data.payment_method ?? method,
                tenderedAmount: res.data.tendered_amount ?? amount,
                changeDue: res.data.change_due !== undefined ? res.data.change_due : change,
                gcashReference: gcashRef,
                cashAmount: res.data.cash_amount ?? cashAmount,
                gcashAmount: res.data.gcash_amount ?? gcashAmount,
                customerName: customerName || 'Walk-in Customer',
                customerAddress,
                cashier: user.username
            });

            // Close modal & clear cart and inputs
            setShowConfirmModal(false);
            setCart([]);
            setTenderedAmount('');
            setCustomerName('');
            setCustomerAddress('');

            // Refresh products catalog
            const resProducts = await api.get('/products');
            const activeProducts = resProducts.data.filter(p => p.stock > 0);
            setProducts(activeProducts);

            // Display receipt modal on screen for review before printing
            setShowReceipt(true);

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

    // Void recent sale and restore its items to the cart (if customer forgot an item)
    const [voidingSale, setVoidingSale] = useState(false);
    const handleVoidAndReopen = async () => {
        if (!lastTransaction) return;
        const targetId = lastTransaction.saleId || lastTransaction.id;
        const orderNo = lastTransaction.orderNumber || targetId;

        const confirmMsg = `Void order ${orderNo} and return all its items to the cart so the customer can add forgotten items?`;
        if (!window.confirm(confirmMsg)) return;

        setVoidingSale(true);
        try {
            const res = await api.post(`/sales/${targetId}/void-and-reopen`, {
                reason: 'Customer forgot items, reopened to add more'
            });

            // Restore items into cart
            const restoredItems = (lastTransaction.items && lastTransaction.items.length > 0)
                ? lastTransaction.items
                : (res.data?.items || []);
            setCart([...restoredItems]);
            if (lastTransaction.customerName && lastTransaction.customerName !== 'Walk-in Customer') {
                setCustomerName(lastTransaction.customerName);
            }
            if (lastTransaction.customerAddress) {
                setCustomerAddress(lastTransaction.customerAddress);
            }

            // Close receipt modal
            setShowReceipt(false);
            setLastTransaction(null);

            // Refresh products catalog so available stock counts are restored
            const resProducts = await api.get('/products');
            const activeProducts = resProducts.data.filter(p => p.stock > 0);
            setProducts(activeProducts);

            toast.success(`Order ${orderNo} voided! Items returned to cart — you can now add forgotten items and checkout again.`);
        } catch (err) {
            toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to void and reopen sale');
        } finally {
            setVoidingSale(false);
        }
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

        const currentRows = catalogRowsRef.current;
        // 1. Direct serial number match:
        const serialMatch = currentRows.find(
            r => r.is_serialized && (r.serial_number || '').toLowerCase() === trimmed.toLowerCase()
        );
        if (serialMatch) {
            handleRowClick(serialMatch);
            setSearchQuery('');
            return;
        }

        // 2. Part number match:
        const exactMatch = currentRows.find(
            r => r.part_number.toLowerCase() === trimmed.toLowerCase() ||
                 normalizePartNumberSearch(r.part_number) === normalizePartNumberSearch(trimmed)
        );

        const targetRow = exactMatch || filterProducts(currentRows, trimmed)[0];

        if (targetRow) {
            handleRowClick(targetRow);
            setSearchQuery('');
        } else {
            toast.error(`No product matches barcode: ${trimmed}`);
        }
    }, [openSerialPicker, addToCart, addSerializedToCart, toggleSerialSelection]);

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
                    .pos-filters-grid {
                        display: grid;
                        grid-template-columns: repeat(4, minmax(0, 1fr));
                        gap: 8px;
                        align-items: center;
                        width: 100%;
                        margin-bottom: 12px;
                    }
                    @media (max-width: 900px) {
                        .pos-filters-grid {
                            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                        }
                    }
                    @media (max-width: 480px) {
                        .pos-filters-grid {
                            grid-template-columns: 1fr !important;
                        }
                    }
                    @media (max-width: 768px) {
                        .pos-qty-btn {
                            width: 32px !important;
                            height: 32px !important;
                        }
                        .pos-qty-input {
                            width: 46px !important;
                            height: 32px !important;
                            font-size: 14px !important;
                        }
                    }
                `}</style>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{ margin: 0 }}>Point of Sale</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={() => navigate('/transactions')}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '6px 14px' }}
                            title={user?.role === 'staff' ? 'View My Transactions' : 'View All Transaction History'}
                        >
                            <History size={16} />
                            <span>{user?.role === 'staff' ? 'Transactions' : 'Recent Sales'}</span>
                        </button>
                    </div>
                </div>

                {/* Filter bar on a single compact row: 4 columns on desktop */}
                <div className="pos-filters-grid">
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
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '130px', whiteSpace: 'nowrap' }}>Part Number</th>
                                <th>Product Name</th>
                                <th style={{ width: '130px', whiteSpace: 'nowrap' }}>Serial</th>
                                <th style={{ width: '90px', whiteSpace: 'nowrap' }}>Brand</th>
                                <th style={{ width: '80px', whiteSpace: 'nowrap' }}>Size</th>
                                <th style={{ width: '110px', textAlign: 'right', whiteSpace: 'nowrap' }}>Stock</th>
                                {user?.role === 'admin' && (
                                    <th style={{ width: '90px', textAlign: 'right', whiteSpace: 'nowrap' }}>Cost Price</th>
                                )}
                                <th style={{ width: '90px', textAlign: 'right', whiteSpace: 'nowrap' }}>Price</th>
                                <th style={{ width: '170px', whiteSpace: 'nowrap' }}>Compatibility</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedProducts.length > 0 ? paginatedProducts.map(p => (
                                <tr
                                    key={p.row_key || `${p.id}_${p.serial_id || 'noserial'}`}
                                    onClick={() => handleRowClick(p)}
                                    style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                                    title="Click row to add to cart"
                                >
                                    <td style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                        {p.part_number}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{p.product_name || p.name}</span>
                                            {p.is_serialized ? (
                                                <span className="badge-pill badge-serialized" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                                                    Serialized
                                                </span>
                                            ) : null}
                                        </div>
                                        {p.category && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                {p.category}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                        {p.is_serialized ? (
                                            <span style={{
                                                fontFamily: 'monospace',
                                                fontWeight: 700,
                                                color: 'var(--primary)',
                                                background: 'rgba(22, 163, 74, 0.1)',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                border: '1px solid rgba(22, 163, 74, 0.2)'
                                            }}>
                                                {p.serial_number}
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                                        )}
                                    </td>
                                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p.brand || '-'}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{p.size || '-'}</td>
                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {p.is_serialized ? (
                                            <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                                                In stock ({p.stock})
                                            </span>
                                        ) : (
                                            <span style={{
                                                color: p.stock <= (p.reorder_level || 5) ? 'var(--danger)' : 'var(--success)',
                                                fontWeight: 'bold'
                                            }}>
                                                In stock ({p.stock})
                                            </span>
                                        )}
                                    </td>
                                    {user?.role === 'admin' && (
                                        <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                            {formatCurrency(p.cost_price || 0)}
                                        </td>
                                    )}
                                    <td style={{ textAlign: 'right', color: 'var(--primary)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                        {formatCurrency(p.price)}
                                    </td>
                                    <td>
                                        <div
                                            style={{
                                                maxWidth: '190px',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                fontSize: '0.8rem',
                                                color: 'var(--text-muted)'
                                            }}
                                            title={p.compatibility_display || 'Universal / All models'}
                                        >
                                            {p.compatibility_display || 'Universal'}
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={9} className="table-empty-state">
                                        No matching products found. Try scanning another part number or clearing filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* POS Catalog Pagination Controls */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <span>
                                Showing <strong>{((currentPage - 1) * pageSize) + 1}</strong> - <strong>{Math.min(currentPage * pageSize, filteredCount)}</strong> of <strong>{filteredCount}</strong> products
                            </span>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="input-premium"
                                style={{ padding: '2px 8px', fontSize: '0.75rem', width: 'auto', cursor: 'pointer' }}
                                title="Products per page"
                            >
                                <option value={25}>25 / page</option>
                                <option value={50}>50 / page</option>
                                <option value={100}>100 / page</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() => paginate(currentPage - 1)}
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.8rem', opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                            >
                                Prev
                            </button>

                            {getPageNumbers(currentPage, totalPages).map((pageNum, idx) => (
                                pageNum === '...' ? (
                                    <span key={`dots-${idx}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>...</span>
                                ) : (
                                    <button
                                        key={pageNum}
                                        type="button"
                                        onClick={() => paginate(pageNum)}
                                        className={currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}
                                        style={{ padding: '4px 10px', fontSize: '0.8rem', minWidth: '30px', textAlign: 'center' }}
                                    >
                                        {pageNum}
                                    </button>
                                )
                            ))}

                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => paginate(currentPage + 1)}
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.8rem', opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* CART AREA (4 of 12 columns on desktop) */}
            <div className="glass-panel no-print cart-container pos-cart-wrapper" style={{ display: 'flex', flexDirection: 'column', padding: '0', minHeight: '480px', height: 'fit-content' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1rem', fontWeight: 600 }}><ShoppingCart size={18} /> Current Order</h3>
                    {cart.length > 0 && (
                        <span style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary)', border: '1px solid rgba(99, 102, 241, 0.4)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                            {cart.reduce((sum, item) => sum + item.quantity, 0)} {cart.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'item' : 'items'}
                        </span>
                    )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px', maxHeight: '420px' }}>
                    {cart.length === 0 ? (
                        <div style={{ height: '100%', minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Order is empty</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {cart.map(item => {
                                const itemKey = item.cart_key || String(item.product_id);
                                return (
                                <div
                                    key={itemKey}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                        background: 'var(--surface-hover)',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)'
                                    }}
                                >
                                    {/* Top Row: Item Details & Remove Button */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontWeight: 600,
                                                fontSize: '0.88rem',
                                                color: 'var(--text-main)',
                                                lineHeight: 1.35,
                                                wordBreak: 'break-word'
                                            }}>
                                                {item.name}
                                                {item.brand && (
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        color: 'var(--text-muted)',
                                                        fontWeight: 'normal',
                                                        marginLeft: '6px'
                                                    }}>
                                                        ({item.brand})
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--text-muted)',
                                                marginTop: '3px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                flexWrap: 'wrap'
                                            }}>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{item.part_number}</span>
                                                <span>•</span>
                                                <span>{formatCurrency(item.price)} each</span>
                                            </div>
                                            {item.is_serialized && (
                                                <div style={{ fontSize: '0.75rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Serial:</span>
                                                    <span style={{
                                                        fontFamily: 'monospace',
                                                        fontWeight: 700,
                                                        fontSize: '0.78rem',
                                                        background: 'rgba(22, 163, 74, 0.12)',
                                                        color: 'var(--primary)',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        border: '1px solid rgba(22, 163, 74, 0.25)'
                                                    }}>
                                                        {item.selected_serial_number || (item.serial_numbers?.length > 0 ? item.serial_numbers.join(', ') : 'Selected')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => removeFromCart(itemKey)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-muted)',
                                                cursor: 'pointer',
                                                padding: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: '4px',
                                                flexShrink: 0
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.color = 'var(--danger)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.color = 'var(--text-muted)';
                                            }}
                                            title="Remove item"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {/* Bottom Row: Quantity Controls & Subtotal */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        paddingTop: '6px',
                                        borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <button
                                                type="button"
                                                onClick={() => updateQuantity(itemKey, -1)}
                                                className="btn-secondary"
                                                style={{
                                                    width: '28px',
                                                    height: '28px',
                                                    padding: 0,
                                                    borderRadius: '6px',
                                                    cursor: item.quantity <= 1 ? 'not-allowed' : 'pointer',
                                                    opacity: item.quantity <= 1 ? 0.5 : 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}
                                                disabled={item.quantity <= 1}
                                                title="Decrease quantity"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <input
                                                type="number"
                                                min="1"
                                                max={item.maxStock}
                                                value={item.quantity}
                                                onChange={(e) => setQuantityDirect(itemKey, e.target.value)}
                                                className="input-premium"
                                                style={{
                                                    width: '42px',
                                                    height: '28px',
                                                    textAlign: 'center',
                                                    padding: '0 2px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: '600',
                                                    borderRadius: '6px'
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => updateQuantity(itemKey, 1)}
                                                className="btn-secondary"
                                                style={{
                                                    width: '28px',
                                                    height: '28px',
                                                    padding: 0,
                                                    borderRadius: '6px',
                                                    cursor: item.quantity >= item.maxStock ? 'not-allowed' : 'pointer',
                                                    opacity: item.quantity >= item.maxStock ? 0.5 : 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}
                                                disabled={item.quantity >= item.maxStock}
                                                title={item.quantity >= item.maxStock ? `Max available (${item.maxStock})` : "Increase quantity"}
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>

                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{
                                                fontWeight: 700,
                                                fontSize: '0.95rem',
                                                color: 'var(--text-main)'
                                            }}>
                                                {formatCurrency(item.subtotal)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                            })}
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

                        {/* CHECKOUT MODAL */}
            {showConfirmModal && (
                <CheckoutModal
                    isOpen={showConfirmModal}
                    onClose={() => {
                        setShowConfirmModal(false);
                        setTenderedAmount('');
                    }}
                    totalAmount={totalAmount}
                    cart={cart}
                    customerName={customerName}
                    customerAddress={customerAddress}
                    onCustomerNameChange={setCustomerName}
                    onCustomerAddressChange={setCustomerAddress}
                    onProcessPayment={processPayment}
                    loading={submittingPayment}
                />
            )}

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
                                cashAmount={lastTransaction.cashAmount}
                                gcashAmount={lastTransaction.gcashAmount}
                            />
                        </div>

                        <div className="no-print" style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '340px' }}>
                            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                <button className="btn-primary" style={{ flex: 1, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={handlePrint}>
                                    <Printer size={16} /> Print Receipt
                                </button>
                                <button className="btn-secondary" style={{ flex: 1, padding: '10px 14px' }} onClick={closeReceipt}>
                                    Done / Close
                                </button>
                            </div>
                            <button
                                type="button"
                                className="btn-secondary"
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    color: '#e11d48',
                                    borderColor: 'rgba(225, 29, 72, 0.35)',
                                    background: 'rgba(225, 29, 72, 0.05)',
                                    fontWeight: '600',
                                    fontSize: '0.82rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                                onClick={handleVoidAndReopen}
                                disabled={voidingSale}
                                title="Customer forgot something? Void this transaction and return items to cart to add more items."
                            >
                                <RotateCcw size={15} />
                                {voidingSale ? 'Voiding & Restoring Cart...' : '↩ Void & Return to Cart'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default POS;
