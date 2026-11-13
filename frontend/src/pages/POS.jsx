import { useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ShoppingCart, ChevronDown, Check, Printer, Search, Plus, Minus, Trash2, CheckCircle2, X, AlertCircle, Banknote, CreditCard, Smartphone, History, RotateCcw, Tag, Lock, Pause, Play, ShieldAlert, Key, Clock, Layers, Mail, Send, RefreshCw, ArrowLeftRight, TrendingUp } from 'lucide-react';
import { filterProducts, isSerializedProduct, normalizePartNumberSearch } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import { calculateCartTotals, calculateItemSubtotal, calculatePaymentDetails, roundCurrency } from '../utils/calculations';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import ThermalReceipt from '../components/ThermalReceipt';
import ReceiptPrint from '../components/ReceiptPrint';
import CheckoutModal from '../components/CheckoutModal';
import ExchangeSlipModal from '../components/ExchangeSlipModal';
import { notifyInventoryChange, subscribeToInventoryChange } from '../utils/syncEvents';
import Transactions from './Transactions';

const formatSerialNumbers = (serialNumbers) => {
    if (Array.isArray(serialNumbers)) return serialNumbers.join(', ');
    return serialNumbers || '';
};

const getPageNumbers = (current, total) => {
    if (total <= 1) return [1];
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 4) {
        return [1, 2, 3, 4, 5, '...', total];
    }
    if (current >= total - 3) {
        return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
};

const POS = ({ defaultTab }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, logout } = useContext(AuthContext);

    const initialTab = useMemo(() => {
        const qTab = searchParams.get('tab');
        if (qTab === 'history' || qTab === 'transactions' || qTab === 'sales' || defaultTab === 'history') {
            return 'history';
        }
        if (qTab === 'held' || qTab === 'held_carts') {
            return 'held';
        }
        return 'register';
    }, [searchParams, defaultTab]);

    const [activeTab, setActiveTab] = useState(initialTab);
    const activeTabRef = useRef(activeTab);
    activeTabRef.current = activeTab;

    useEffect(() => {
        const qTab = searchParams.get('tab');
        if (qTab === 'history' || qTab === 'transactions' || qTab === 'sales') {
            setActiveTab('history');
        } else if (qTab === 'held' || qTab === 'held_carts') {
            setActiveTab('held');
        } else if (qTab === 'register' || qTab === 'pos') {
            setActiveTab('register');
        } else {
            setActiveTab('register');
        }
    }, [searchParams]);

    const handleTabChange = (newTab) => {
        setActiveTab(newTab);
        if (newTab === 'history') {
            setSearchParams({ tab: 'history' });
        } else if (newTab === 'held') {
            setSearchParams({ tab: 'held' });
        } else {
            const p = new URLSearchParams(searchParams);
            p.delete('tab');
            setSearchParams(p);
        }
    };

    const [products, setProducts] = useState([]);
    const [activeCashFloat, setActiveCashFloat] = useState(null);
    const [shiftStatus, setShiftStatus] = useState('ACTIVE');
    const [pendingRemitShift, setPendingRemitShift] = useState(null);

    const fetchActiveCashFloat = useCallback(async () => {
        try {
            const res = await api.get('/cash-float/my-float');
            const data = res.data;
            const currentStatus = data?.status || (data?.activeFloat ? 'ACTIVE' : 'NO_SHIFT');
            setShiftStatus(currentStatus);

            if (currentStatus === 'ACTIVE') {
                setActiveCashFloat(data.activeFloat || null);
                setPendingRemitShift(null);
            } else if (currentStatus === 'PENDING_REMIT') {
                setActiveCashFloat(null);
                setPendingRemitShift(data.shiftRecord || null);
            } else {
                setActiveCashFloat(null);
                setPendingRemitShift(null);
                const isStaff = user && (user.role || '').toLowerCase() !== 'admin';
                if (isStaff) {
                    sessionStorage.setItem('loginMessage', 'Your shift has been ended by the Admin.');
                    logout();
                }
            }
        } catch (err) {
            console.error('Failed to load active cash float in POS:', err);
        }
    }, [user]);

    const fetchProducts = useCallback(async (silent = false) => {
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
        } catch {
            if (!silent) toast.error('Failed to load products');
        }
    }, []);

    useEffect(() => {
        fetchActiveCashFloat();
        fetchProducts();

        const unsubscribe = subscribeToInventoryChange(() => {
            fetchActiveCashFloat();
            fetchProducts(true);
        });

        // 6-second heartbeat for staff shift status + real-time stock & float sync
        const poll = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchActiveCashFloat();
            fetchProducts(true);
        }, 6000);

        return () => {
            if (unsubscribe) unsubscribe();
            clearInterval(poll);
        };
    }, [fetchActiveCashFloat, fetchProducts]);

    const [cart, setCart] = useState([]);

    const CATEGORY_GROUPS = {
        'ENG': ['Engine', 'Engine Parts', 'Filters', 'Exhaust', 'Piston', 'Cylinder', 'Camshaft', 'Valve'],
        'BRK': ['Brakes', 'Brake', 'Pads', 'Caliper', 'Rotor', 'Shoe'],
        'ELEC': ['Electrical', 'Electronics', 'Ignition', 'Lights & Mirrors', 'Lighting', 'Battery', 'ECU', 'CDI'],
        'CVT': ['CVT & Pulleys', 'CVT', 'Transmission', 'Drive', 'Chains & Sprockets', 'Belt', 'Roller', 'Flyball'],
        'CHAS': ['Chassis', 'Suspension', 'Tires', 'Wheels & Hubs', 'Wheels', 'Handlebars & Controls', 'Body & Seats', 'Riding Gear & Luggage', 'Bolts & Accessories', 'Shock', 'Fork'],
        'OIL': ['Oils & Lubricants', 'Oils', 'Lubricants', 'Fluids', 'Brake Fluid', 'Gear Oil', 'Coolant']
    };

    const filterProductsFn = useCallback((items, query, f) => {
        let candidateItems = items;
        if (f.category && f.category !== 'All') {
            const mappedList = CATEGORY_GROUPS[f.category];
            if (mappedList) {
                candidateItems = items.filter(item => {
                    const cat = (item.category || '').toLowerCase();
                    return mappedList.some(m => cat.includes(m.toLowerCase()) || m.toLowerCase().includes(cat));
                });
            } else {
                candidateItems = items.filter(item => (item.category || '').toLowerCase() === f.category.toLowerCase());
            }
        }
        return filterProducts(candidateItems, query, {
            category: 'All',
            brand: f.brand,
            type: f.type
        });
    }, []);

    const [pageSize, setPageSize] = useState(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('pos_page_size') : null;
        return saved ? Number(saved) : 10;
    });

    const handlePageSizeChange = useCallback((newSize) => {
        const size = Number(newSize);
        setPageSize(size);
        if (typeof window !== 'undefined') {
            localStorage.setItem('pos_page_size', String(size));
        }
    }, []);

    // Catalog rows: 1 entry per product with unified stock and available serial lots
    const catalogRows = useMemo(() => {
        const sortedProducts = [...products].sort((a, b) =>
            (a.product_name || a.name || '').localeCompare(b.product_name || b.name || '')
        );

        return sortedProducts.map(p => {
            const availSerials = (p.serials || []).filter(s => 
                s && s.serial_number && 
                (s.status === 'available' || s.status === null || !s.status) && 
                Number(s.quantity || 0) > 0
            );
            const totalStock = p.is_serialized
                ? (availSerials.length > 0 ? availSerials.reduce((sum, s) => sum + Number(s.quantity || 0), 0) : Number(p.stock ?? p.current_stock ?? 0))
                : Number(p.stock ?? p.current_stock ?? 0);

            return {
                ...p,
                row_key: String(p.id),
                product_id: p.id,
                availSerials,
                stock: totalStock,
                stock_display: String(totalStock),
                max_discount: Number(p.max_discount ?? Math.max(0, (Number(p.price || p.selling_price || 0) - Number(p.cost_price || 0))))
            };
        });
    }, [products]);

    const {
        searchQuery,
        setSearchQuery,
        handleSearchChange,
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
        initialPage: typeof window !== 'undefined' ? Math.max(1, Number(new URLSearchParams(window.location.search).get('page')) || 1) : 1,
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

    const handlePageChange = useCallback((newPage) => {
        paginate(newPage);
        const catalogEl = document.querySelector('.pos-catalog-wrapper');
        if (catalogEl && typeof catalogEl.scrollIntoView === 'function') {
            catalogEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [paginate]);

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
        const checkAddSerialParam = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const addSerial = urlParams.get('add_serial');
            if (!addSerial) return;
            try {
                const res = await api.get('/products');
                const activeProducts = res.data.filter(p => p.stock > 0);
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
                            cost_price: Number(p.cost_price ?? p.cost ?? 0),
                            max_discount: Number(p.max_discount ?? Math.max(0, (productPrice - (Number(p.cost_price || 0))))),
                            subtotal: lotStock * productPrice,
                            maxStock: lotStock
                        }]);
                        break;
                    }
                }
            } catch (_) {}
        };
        checkAddSerialParam();
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
                        cost_price: Number(product.cost_price ?? product.cost ?? 0),
                        max_discount: Number(product.max_discount ?? Math.max(0, (Number(product.price) - (Number(product.cost_price || 0))))),
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

        const lotStock = Number(serialObj.quantity || product.stock || 1);
        if (existing && existing.quantity >= lotStock) {
            toast.error(`Cannot exceed available stock (${lotStock}) for serial ${chosenSerialNum}`);
            return;
        }

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
                serial_number: chosenSerialNum,
                serial_ids: chosenSerialId !== null ? [chosenSerialId] : [],
                serial_numbers: chosenSerialNum ? [chosenSerialNum] : [],
                quantity: 1,
                price: productPrice,
                cost_price: Number(product.cost_price ?? product.cost ?? 0),
                max_discount: Number(product.max_discount ?? Math.max(0, (productPrice - (Number(product.cost_price || 0))))),
                subtotal: calculateItemSubtotal(1, productPrice),
                maxStock: lotStock
            };
            setCart(prev => [...prev, newItem]);
            toast.success(`Added ${product.product_name || product.name} (${chosenSerialNum})`);
        }
    }, []);

    const handleRowClick = useCallback((item) => {
        if (!item) return;

        if (item.is_serialized) {
            const availSerials = item.availSerials || (item.serials || []).filter(s =>
                s && s.serial_number &&
                (s.status === 'available' || s.status === null || !s.status) &&
                Number(s.quantity || 0) > 0
            );

            if (!availSerials || availSerials.length === 0) {
                toast.error(`No available serial numbers for ${item.product_name || item.name}`);
                return;
            }

            const selectedId = selectedTableSerials[item.id || item.product_id];
            const chosenSerial = availSerials.find(s => Number(s.id) === Number(selectedId)) || availSerials[0];

            if (!chosenSerial) {
                toast.error(`Please select a valid serial number for ${item.product_name || item.name}`);
                return;
            }

            addSerializedToCart(item, chosenSerial);
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
                cost_price: Number(item.cost_price ?? item.cost ?? 0),
                max_discount: Number(item.max_discount ?? Math.max(0, (productPrice - (Number(item.cost_price || 0))))),
                quantity: 1,
                subtotal: calculateItemSubtotal(1, productPrice),
                maxStock: maxStock
            };
            setCart(prev => [...prev, newItem]);
            toast.success(`Added ${item.product_name || item.name}`);
        }
    }, [selectedTableSerials, addSerializedToCart]);

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

    // Held Transactions State (Persisted in localStorage)
    const [heldTransactions, setHeldTransactions] = useState(() => {
        try {
            const saved = localStorage.getItem('pos_held_transactions');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const saveHeldTransactions = (list) => {
        setHeldTransactions(list);
        try {
            localStorage.setItem('pos_held_transactions', JSON.stringify(list));
        } catch (e) {
            console.error('Failed to save held transactions', e);
        }
    };

    const [showHoldModal, setShowHoldModal] = useState(false);
    const [holdCustomerName, setHoldCustomerName] = useState('');
    const [holdNote, setHoldNote] = useState('Checking motorcycle outside');
    const [showHeldQueueModal, setShowHeldQueueModal] = useState(false);

    // In-Line Cart Discount State
    const [showDiscountRequestModal, setShowDiscountRequestModal] = useState(false);
    const [reqDiscountType, setReqDiscountType] = useState('fixed');
    const [reqDiscountVal, setReqDiscountVal] = useState('');
    const [reqDiscountReason, setReqDiscountReason] = useState('');
    const [reqDiscountPin, setReqDiscountPin] = useState('');
    const [verifyingDiscountPin, setVerifyingDiscountPin] = useState(false);
    // Email OTP Approval State (Admin Gmail)
    const [isOtpRequested, setIsOtpRequested] = useState(false);
    const [adminMaskedEmail, setAdminMaskedEmail] = useState('ic***@gmail.com');
    const [discountOtp, setDiscountOtp] = useState('');
    const [sendingDiscountOtp, setSendingDiscountOtp] = useState(false);
    const [verifyingDiscountOtp, setVerifyingDiscountOtp] = useState(false);

    // Manual Discount State (supports fixed ₱ amount or percentage %)
    const [discountType, setDiscountType] = useState('fixed'); // 'fixed' | 'percent'
    const [discountValue, setDiscountValue] = useState('');

    const cartGrossSubtotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + (Number(item.subtotal) || (Number(item.price || 0) * Number(item.quantity || 1))), 0);
    }, [cart]);

    const maxAllowableDiscount = useMemo(() => {
        return cart.reduce((sum, item) => {
            let itemMax = item.max_discount;
            if (itemMax === undefined || itemMax === null || !Number.isFinite(Number(itemMax))) {
                const prod = products.find(p => Number(p.id) === Number(item.product_id));
                itemMax = prod?.max_discount;
            }
            const unitDisc = Number.isFinite(Number(itemMax)) 
                ? Number(itemMax) 
                : Math.max(0, (Number(item.price || 0) - Number(item.cost_price || 0)));
            const qty = Number(item.quantity) || 1;
            return sum + (unitDisc * qty);
        }, 0);
    }, [cart, products]);

    const cartTotalCost = useMemo(() => {
        return Math.max(0, roundCurrency(cartGrossSubtotal - maxAllowableDiscount));
    }, [cartGrossSubtotal, maxAllowableDiscount]);

    const calculatedDiscount = useMemo(() => {
        const val = parseFloat(discountValue);
        if (!Number.isFinite(val) || val <= 0 || cartGrossSubtotal <= 0) return 0;
        if (discountType === 'percent') {
            const pct = Math.min(100, Math.max(0, val));
            return Math.min(cartGrossSubtotal, Math.round((cartGrossSubtotal * (pct / 100)) * 100) / 100);
        } else {
            return Math.min(cartGrossSubtotal, Math.round(Math.max(0, val) * 100) / 100);
        }
    }, [discountType, discountValue, cartGrossSubtotal]);

    const isDiscountExceedingCost = useMemo(() => {
        if (calculatedDiscount <= 0) return false;
        return (calculatedDiscount - maxAllowableDiscount) > 0.005;
    }, [calculatedDiscount, maxAllowableDiscount]);

    const { totalAmount, subtotal, discount, vatableSales, vatAmount } = calculateCartTotals(cart, calculatedDiscount);
    const paymentDetails = calculatePaymentDetails(totalAmount, tenderedAmount, paymentMethod);

    // ==========================================
    // ITEM REPLACEMENT / EXCHANGE STATE
    // ==========================================
    const [replacementMode, setReplacementMode] = useState(() => {
        try {
            const saved = sessionStorage.getItem('pos_replacement_mode');
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });

    const saveReplacementMode = (mode) => {
        setReplacementMode(mode);
        try {
            if (mode) {
                sessionStorage.setItem('pos_replacement_mode', JSON.stringify(mode));
            } else {
                sessionStorage.removeItem('pos_replacement_mode');
            }
        } catch (e) {
            console.error('Failed to save replacement mode in session:', e);
        }
    };

    const [showReplacementCheckoutModal, setShowReplacementCheckoutModal] = useState(false);
    const [swapPaymentMethod, setSwapPaymentMethod] = useState('Cash');
    const [swapTendered, setSwapTendered] = useState('');
    const [swapReason, setSwapReason] = useState('Fitment / Wrong Part Purchased');
    const [swapNotes, setSwapNotes] = useState('');
    const [submittingSwap, setSubmittingSwap] = useState(false);
    const [completedSwap, setCompletedSwap] = useState(null);
    const [showSwapSlipModal, setShowSwapSlipModal] = useState(false);

    // Replacement Math & Policy Checks
    const isReplacementActive = Boolean(replacementMode);
    const replacementCredit = replacementMode ? Number(replacementMode.creditAmount || 0) : 0;
    const replacementDiff = cartGrossSubtotal - replacementCredit;
    const isUnderReplacementCredit = isReplacementActive && replacementDiff < -0.001;
    const replacementRemainingCredit = isReplacementActive ? Math.max(0, replacementCredit - cartGrossSubtotal) : 0;
    const replacementTopUpDue = isReplacementActive ? Math.max(0, replacementDiff) : 0;

    const handleStartReplacementFromSale = async (sale, specificItem = null) => {
        try {
            let fullSale = sale;
            if (!fullSale.items && !fullSale.sale_items) {
                const res = await api.get(`/sales/${sale.id}`);
                fullSale = res.data;
            }

            const saleItems = fullSale.items || fullSale.sale_items || [];
            if (saleItems.length === 0) {
                toast.error('This receipt has no swappable items.');
                return;
            }

            const targetItem = specificItem || saleItems.find(it => {
                const soldQty = Number(it.qty_sold ?? it.quantity ?? 1);
                const swappedQty = Number(it.qty_swapped || 0);
                return (soldQty - swappedQty) > 0;
            }) || saleItems[0];

            // If current cart has items, automatically park them into Held Carts
            if (cart.length > 0) {
                const autoHeld = {
                    id: `HELD-${Date.now().toString().slice(-6)}`,
                    held_at: new Date().toISOString(),
                    customer_name: customerName?.trim() || 'Auto-Saved Cart (Prior to Exchange)',
                    cashier: user?.full_name || user?.username || 'Cashier',
                    items: cart,
                    total_amount: totalAmount,
                    discount_amount: calculatedDiscount,
                    discount_type: discountType,
                    discount_value: discountValue,
                    notes: 'Auto-paused when entering Item Replacement mode'
                };
                const updated = [autoHeld, ...heldTransactions];
                saveHeldTransactions(updated);
                toast.info('Existing cart was paused and saved to Held Carts.');
            }

            const itemPrice = Number(targetItem.price || targetItem.unit_price || 0);
            const mode = {
                originalSale: fullSale,
                saleItem: targetItem,
                allSaleItems: saleItems,
                returnedProduct: {
                    id: targetItem.product_id || targetItem.id,
                    name: targetItem.product_name || targetItem.name,
                    part_number: targetItem.part_number,
                    brand: targetItem.brand,
                    cost_price: targetItem.cost_price,
                    price: itemPrice
                },
                creditAmount: itemPrice,
                returnedQty: 1
            };

            saveReplacementMode(mode);
            setCart([]);
            setActiveTab('register');
            setSearchParams({ tab: 'register' });
            toast.success(`Item Replacement Mode active! ₱${itemPrice.toFixed(2)} credit applied from #${fullSale.order_number || fullSale.id}.`);
        } catch (err) {
            console.error('Failed to start replacement mode:', err);
            toast.error('Failed to start item replacement');
        }
    };

    const handleSelectItemForReplacement = (item) => {
        if (!replacementMode?.originalSale) return;
        const currentSale = replacementMode.originalSale;
        const itemPrice = Number(item.price || item.unit_price || 0);
        const mode = {
            originalSale: currentSale,
            saleItem: item,
            allSaleItems: currentSale.items || currentSale.sale_items || [item],
            returnedProduct: {
                id: item.product_id || item.id,
                name: item.product_name || item.name,
                part_number: item.part_number,
                brand: item.brand,
                cost_price: item.cost_price,
                price: itemPrice
            },
            creditAmount: itemPrice,
            returnedQty: 1
        };

        saveReplacementMode(mode);
        toast.success(`Switched replacement item to ${item.product_name || item.name} (Credit: ₱${itemPrice.toFixed(2)})`);
    };

    const handleCancelReplacement = () => {
        if (cart.length > 0) {
            if (!window.confirm('Cancel item replacement mode? Your replacement selections will be cleared.')) {
                return;
            }
        }
        saveReplacementMode(null);
        setCart([]);
        toast('Item replacement mode cancelled.');
    };

    const handleOpenReplacementCheckout = () => {
        if (isUnderReplacementCredit) {
            toast.error(`Zero Cash Refund Policy: Please add at least ${formatCurrency(replacementRemainingCredit)} more in replacement items.`);
            return;
        }
        setSwapPaymentMethod('Cash');
        setSwapTendered(replacementTopUpDue > 0 ? String(replacementTopUpDue) : '');
        setShowReplacementCheckoutModal(true);
    };

    const handleConfirmProcessSwap = async () => {
        if (!replacementMode) return;
        if (replacementTopUpDue > 0 && swapPaymentMethod === 'Cash') {
            const tenderedNum = Number(swapTendered) || replacementTopUpDue;
            if (tenderedNum < replacementTopUpDue) {
                toast.error(`Amount tendered (₱${tenderedNum.toFixed(2)}) is less than top-up due (₱${replacementTopUpDue.toFixed(2)})`);
                return;
            }
        }

        setSubmittingSwap(true);
        try {
            const payload = {
                sale_id: replacementMode.originalSale.id,
                sale_item_id: replacementMode.saleItem.id || replacementMode.saleItem.sale_item_id,
                order_number: replacementMode.originalSale.order_number,
                customer_name: customerName.trim() || replacementMode.originalSale.customer_name || 'Walk-in Customer',
                returned_product_id: replacementMode.returnedProduct.id,
                returned_qty: 1,
                returned_unit_price: replacementMode.creditAmount,
                counter_condition_verified: true,
                replacement_items: cart.map(item => ({
                    product_id: item.id || item.product_id,
                    qty: Number(item.quantity || 1)
                })),
                new_product_id: cart[0].id || cart[0].product_id,
                new_qty: cart.reduce((s, it) => s + Number(it.quantity || 1), 0),
                payment_method: replacementTopUpDue > 0 ? swapPaymentMethod : 'None',
                amount_tendered: replacementTopUpDue > 0
                    ? (swapPaymentMethod === 'Cash' ? (Number(swapTendered) || replacementTopUpDue) : replacementTopUpDue)
                    : 0,
                reason: swapReason,
                notes: swapNotes.trim()
            };

            const res = await api.post('/swaps', payload);
            if (res.data.success) {
                toast.success(res.data.message || 'Item replacement completed successfully!');
                setCompletedSwap(res.data.swap);
                setShowSwapSlipModal(true);
                saveReplacementMode(null);
                setCart([]);
                setShowReplacementCheckoutModal(false);
                setSwapTendered('');
                setSwapNotes('');
                notifyInventoryChange('item_replacement');
                fetchActiveCashFloat(true);
            }
        } catch (err) {
            console.error('Failed to process replacement swap:', err);
            toast.error(err.response?.data?.message || 'Failed to process item replacement');
        } finally {
            setSubmittingSwap(false);
        }
    };

    useEffect(() => {
        const replaceSaleId = searchParams.get('replaceSaleId');
        if (replaceSaleId) {
            api.get(`/sales/${replaceSaleId}`)
                .then(res => {
                    if (res.data) {
                        handleStartReplacementFromSale(res.data);
                    }
                })
                .catch(err => {
                    console.error('Failed to load sale for replacement:', err);
                });
        }
    }, [searchParams]);

    // Held Transactions Handlers
    const handleOpenHoldModal = () => {
        if (cart.length === 0) {
            toast.error('Cart is empty. Nothing to hold.');
            return;
        }
        setHoldCustomerName(customerName || '');
        setHoldNote('Checking motorcycle outside');
        setShowHoldModal(true);
    };

    const handleConfirmHold = () => {
        if (cart.length === 0) return;
        const newHeld = {
            id: `HELD-${Date.now().toString().slice(-6)}`,
            held_at: new Date().toISOString(),
            customer_name: holdCustomerName.trim() || 'Walk-in Customer',
            note: holdNote.trim() || 'Checking motorcycle outside',
            items: [...cart],
            item_count: cart.reduce((sum, item) => sum + item.quantity, 0),
            subtotal: subtotal,
            discount: calculatedDiscount,
            discount_type: discountType,
            discount_value: discountValue,
            total: totalAmount
        };

        const updated = [newHeld, ...heldTransactions];
        saveHeldTransactions(updated);
        setCart([]);
        setDiscountValue('');
        setDiscountType('fixed');
        setTenderedAmount('');
        setCustomerName('');
        setCustomerAddress('');
        setShowHoldModal(false);
        toast.success(`Cart held for ${newHeld.customer_name}. Counter ready for next sale!`);
    };

    const handleResumeCart = (heldItem) => {
        if (cart.length > 0) {
            if (!window.confirm('Active cart contains items. Resuming this held cart will replace active cart items. Continue?')) {
                return;
            }
        }
        setCart(heldItem.items || []);
        setCustomerName(heldItem.customer_name !== 'Walk-in Customer' ? heldItem.customer_name : '');
        if (heldItem.discount_value) {
            setDiscountValue(heldItem.discount_value);
            setDiscountType(heldItem.discount_type || 'fixed');
        }
        const updated = heldTransactions.filter(h => h.id !== heldItem.id);
        saveHeldTransactions(updated);
        setShowHeldQueueModal(false);
        setActiveTab('register');
        toast.success(`Resumed cart for ${heldItem.customer_name} (${heldItem.items?.length || 0} items)`);
    };

    const handleDeleteHeldCart = (heldId) => {
        if (!window.confirm('Are you sure you want to discard this held cart?')) return;
        const updated = heldTransactions.filter(h => h.id !== heldId);
        saveHeldTransactions(updated);
        toast.success('Held cart discarded');
    };

    // Direct Admin / Verified Cashier Discount Handlers
    const handleApplyDiscountDirect = () => {
        const val = parseFloat(reqDiscountVal);
        if (!Number.isFinite(val) || val <= 0) {
            toast.error('Enter a valid discount amount or percentage');
            return;
        }
        setDiscountType(reqDiscountType);
        setDiscountValue(String(val));
        toast.success(`Discount applied to cart (${reqDiscountType === 'percent' ? val + '%' : formatCurrency(val)})!`);
        setShowDiscountRequestModal(false);
        setIsOtpRequested(false);
        setDiscountOtp('');
    };

    // Request 6-digit OTP code sent to Admin Gmail
    const handleRequestDiscountOtp = async () => {
        const val = parseFloat(reqDiscountVal);
        if (!Number.isFinite(val) || val <= 0) {
            toast.error('Enter a valid discount amount or percentage');
            return;
        }

        setSendingDiscountOtp(true);
        try {
            const res = await api.post('/approvals/discount-otp/request', {
                discount_type: reqDiscountType,
                discount_value: val,
                reason: reqDiscountReason.trim() || 'Customer Discount Request',
                cart_retail: cartGrossSubtotal,
                cart_cost: cartTotalCost
            });

            setIsOtpRequested(true);
            setAdminMaskedEmail(res.data.adminEmail || 'Admin Gmail');
            setDiscountOtp('');
            toast.success(res.data.message || 'OTP code sent to Admin Gmail!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to send OTP to Admin Gmail');
        } finally {
            setSendingDiscountOtp(false);
        }
    };

    // Verify 6-digit OTP code received from Admin Gmail
    const handleVerifyDiscountOtp = async () => {
        const otp = discountOtp.trim();
        if (!otp || otp.length !== 6) {
            toast.error('Please enter the 6-digit OTP code sent to Admin Gmail');
            return;
        }

        setVerifyingDiscountOtp(true);
        try {
            const res = await api.post('/approvals/discount-otp/verify', {
                otp,
                discount_type: reqDiscountType,
                discount_value: parseFloat(reqDiscountVal)
            });

            const val = res.data.discountValue || parseFloat(reqDiscountVal);
            const type = res.data.discountType || reqDiscountType;

            setDiscountType(type);
            setDiscountValue(String(val));
            toast.success(res.data.message || 'Admin OTP verified! Discount applied to cart.');
            setShowDiscountRequestModal(false);
            setIsOtpRequested(false);
            setDiscountOtp('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Invalid OTP code from Admin Gmail');
        } finally {
            setVerifyingDiscountOtp(false);
        }
    };

    const handleVerifyDiscountPin = async () => {
        if (!reqDiscountPin.trim()) {
            toast.error('Enter Admin PIN');
            return;
        }
        const val = parseFloat(reqDiscountVal);
        if (!Number.isFinite(val) || val <= 0) {
            toast.error('Enter a valid discount amount or percentage');
            return;
        }

        setVerifyingDiscountPin(true);
        try {
            await api.post('/approvals/verify-pin', {
                pin: reqDiscountPin.trim(),
                action_type: 'DISCOUNT',
                reason: reqDiscountReason.trim() || 'Instant Admin PIN Discount'
            });

            // Apply directly to cart discount state
            setDiscountType(reqDiscountType);
            setDiscountValue(String(val));
            toast.success(`Admin PIN verified! Discount applied to cart (${reqDiscountType === 'percent' ? val + '%' : formatCurrency(val)}).`);
            setShowDiscountRequestModal(false);
            setReqDiscountPin('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Invalid Admin PIN');
        } finally {
            setVerifyingDiscountPin(false);
        }
    };

    const handleClearDiscount = () => {
        setDiscountValue('');
        setReqDiscountVal('');
        setReqDiscountReason('');
        setReqDiscountPin('');
        setIsOtpRequested(false);
        setDiscountOtp('');
        toast.info('Discount removed from cart');
        setShowDiscountRequestModal(false);
    };

    // 1. Trigger the confirmation modal
    const handleCheckoutClick = () => {
        if (cart.length === 0) return toast.error('Cart is empty');
        if (shiftStatus === 'PENDING_REMIT') {
            return toast.error('POS Locked: Preliminary closing count has been submitted and is awaiting Admin verification.');
        }
        if (user && String(user.role).toLowerCase() !== 'admin' && !activeCashFloat) {
            return toast.error('Cannot process sale: No active cash float assigned by Admin for this shift. Starting cash is ₱0.00.');
        }
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
                discount_amount: calculatedDiscount,
                discount_type: discountType,
                discount_value: parseFloat(discountValue) || 0,
                cash_amount: cashAmount !== undefined ? Number(cashAmount) : undefined,
                gcash_amount: gcashAmount !== undefined ? Number(gcashAmount) : undefined,
                customer_name: customerName || 'Walk-in Customer',
                customer_address: customerAddress || undefined,
                gcash_reference_no: gcashRef || undefined
            };

            const res = await api.post('/sales/checkout', payload);
            notifyInventoryChange('sale');
            toast.success('Transaction Completed!');
            fetchActiveCashFloat();

            // Save details for the receipt modal with Philippine 12% VAT and discount breakdown
            setLastTransaction({
                id: res.data.sale_id || res.data.id || res.data.order_number || `SO-${Date.now()}`,
                saleId: res.data.sale_id || res.data.id,
                orderNumber: res.data.order_number,
                date: new Date(),
                items: [...cart],
                subtotal: res.data.subtotal_amount ?? subtotal,
                discount: res.data.discount_amount ?? calculatedDiscount,
                discountAmount: res.data.discount_amount ?? calculatedDiscount,
                total: res.data.total_amount ?? totalAmount,
                totalAmount: res.data.total_amount ?? totalAmount,
                vatableAmount: res.data.vatable_amount ?? vatableSales,
                vatAmount: res.data.vat_amount ?? res.data.tax_amount ?? vatAmount,
                taxAmount: res.data.tax_amount ?? vatAmount,
                vatExemptAmount: res.data.vat_exempt_amount ?? 0,
                zeroRatedAmount: res.data.zero_rated_amount ?? 0,
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
            setDiscountValue('');
            setDiscountType('fixed');
            setReqDiscountVal('');
            setReqDiscountReason('');
            setIsOtpRequested(false);
            setDiscountOtp('');
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
        setShowVoidConfirm(false);
        setLastTransaction(null);
        setPaymentMethod('Cash');
        setTenderedAmount('');
        setCustomerName('');
        setCustomerAddress('');
    };

    // Void recent sale and restore its items to the cart (if customer forgot an item)
    const [voidingSale, setVoidingSale] = useState(false);
    const [showVoidConfirm, setShowVoidConfirm] = useState(false);

    const executeVoidAndReopen = async () => {
        if (!lastTransaction) return;
        const targetId = lastTransaction.saleId || lastTransaction.id;
        const orderNo = lastTransaction.orderNumber || targetId;

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

            // Close receipt modal & reset confirmation
            setShowReceipt(false);
            setLastTransaction(null);
            setShowVoidConfirm(false);

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
        // 1. Direct serial number match across available serial lots:
        for (const r of currentRows) {
            if (r.is_serialized) {
                const avail = r.availSerials || (r.serials || []).filter(s =>
                    s && s.serial_number &&
                    (s.status === 'available' || s.status === null || !s.status) &&
                    Number(s.quantity || 0) > 0
                );
                const matchingSerial = avail.find(s => (s.serial_number || '').toLowerCase() === trimmed.toLowerCase());
                if (matchingSerial) {
                    addSerializedToCart(r, matchingSerial);
                    setSearchQuery('');
                    return;
                }
            }
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
            if (activeTabRef.current === 'history' || activeTabRef.current === 'held') return;
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
        <div className="pos-root-container" style={{ position: 'relative', width: '100%', minHeight: '100%' }}>
            {/* Top Navigation Tabs for POS: Register, Held Carts, Sales History */}
            <div className="pos-nav-tabs no-print" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '12px',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className={activeTab === 'register' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => handleTabChange('register')}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', fontSize: '0.88rem', fontWeight: 600, borderRadius: '8px', cursor: 'pointer' }}
                    >
                        <ShoppingCart size={17} />
                        <span>New Sale (Register)</span>
                    </button>
                    <button
                        type="button"
                        className={activeTab === 'held' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => handleTabChange('held')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            padding: '8px 16px',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            borderColor: heldTransactions.length > 0 ? 'var(--warning-border)' : 'var(--border)'
                        }}
                        title="View paused customer transactions & hold active cart form"
                    >
                        <Pause size={16} color={activeTab === 'held' ? 'currentColor' : 'var(--warning-text)'} />
                        <span style={{ color: (heldTransactions.length > 0 && activeTab !== 'held') ? 'var(--warning-text)' : 'inherit' }}>Held Carts</span>
                        {heldTransactions.length > 0 && (
                            <span style={{
                                background: activeTab === 'held' ? 'var(--surface)' : 'var(--warning-text)',
                                color: activeTab === 'held' ? 'var(--text-main)' : '#fff',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                marginLeft: '4px'
                            }}>
                                {heldTransactions.length}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        className={activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => handleTabChange('history')}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', fontSize: '0.88rem', fontWeight: 600, borderRadius: '8px', cursor: 'pointer' }}
                    >
                        <History size={17} />
                        <span>Sales History</span>
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {activeCashFloat ? (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '8px',
                            padding: '6px 12px'
                        }}>
                            <Banknote size={16} color="var(--primary)" />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {activeCashFloat.isStoreDrawer ? `Store Drawer (@${activeCashFloat.staff_username}):` : 'Drawer Cash:'}
                            </span>
                            <strong style={{ fontSize: '0.92rem', color: 'var(--primary)', fontFamily: 'monospace' }}>
                                {formatCurrency(activeCashFloat.current_cash_balance)}
                            </strong>
                        </div>
                    ) : shiftStatus === 'PENDING_REMIT' ? (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid rgba(245, 158, 11, 0.35)',
                            borderRadius: '8px',
                            padding: '6px 14px',
                            fontSize: '0.78rem',
                            color: '#f59e0b',
                            fontWeight: 700
                        }}>
                            <Lock size={14} />
                            <span>Drawer Locked: Preliminary closing count submitted • Awaiting Admin verification</span>
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--warning-bg)',
                            border: '1px solid var(--warning-border)',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.76rem',
                            color: 'var(--warning-text)',
                            fontWeight: 600
                        }}>
                            <AlertCircle size={14} color="var(--warning-text)" />
                            <span>
                                {user && String(user.role).toLowerCase() === 'admin'
                                    ? 'No Active Shift (POS Locked for Staff • Open in Shifts tab)'
                                    : 'No Active Cash Float assigned for this shift'}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {activeTab === 'history' ? (
                <div className="no-print pos-history-view" style={{ minHeight: '650px', width: '100%', overflowX: 'hidden' }}>
                    <Transactions embedded={true} onStartReplacement={handleStartReplacementFromSale} />
                </div>
            ) : activeTab === 'held' ? (
                <div className="no-print pos-held-view" style={{ minHeight: '650px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Header Banner */}
                    <div style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                        boxShadow: 'var(--glass-shadow)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '10px',
                                background: 'rgba(245, 158, 11, 0.14)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#f59e0b'
                            }}>
                                <Pause size={22} />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                    Held Carts & Paused Transactions
                                </h2>
                                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Pause a buyer's cart when they step aside to check their motorcycle or withdraw cash, and resume with one click.
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{
                                background: 'rgba(245, 158, 11, 0.12)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '0.82rem',
                                color: '#f59e0b',
                                fontWeight: 700
                            }}>
                                {heldTransactions.length} Paused in Queue
                            </span>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleTabChange('register')}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.84rem' }}
                            >
                                <ShoppingCart size={15} />
                                <span>Go to Register</span>
                            </button>
                        </div>
                    </div>

                    {/* Main Content: 2 Responsive Columns (Hold Form on left, Queue on right) */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                        gap: '18px',
                        alignItems: 'start'
                    }}>
                        {/* COLUMN 1: HOLD ACTIVE CART FORM */}
                        <div style={{
                            background: 'var(--surface)',
                            border: '1.5px solid var(--border)',
                            borderRadius: '12px',
                            padding: '20px',
                            boxShadow: 'var(--glass-shadow)'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '16px',
                                borderBottom: '1px solid var(--border)',
                                paddingBottom: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Pause size={18} color="#f59e0b" />
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                        Hold Active Cart Form
                                    </h3>
                                </div>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    background: cart.length > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(156, 163, 175, 0.15)',
                                    color: cart.length > 0 ? '#10b981' : 'var(--text-muted)'
                                }}>
                                    {cart.length > 0 ? `${cart.reduce((s, it) => s + it.quantity, 0)} Items in Register` : 'Register Empty'}
                                </span>
                            </div>

                            {cart.length > 0 ? (
                                <div>
                                    {/* Active Cart Summary */}
                                    <div style={{
                                        background: 'var(--surface-hover)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        marginBottom: '16px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                                Current Cart Summary ({cart.reduce((s, it) => s + it.quantity, 0)} items)
                                            </span>
                                            <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>
                                                {formatCurrency(totalAmount)}
                                            </strong>
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', maxHeight: '70px', overflowY: 'auto' }}>
                                            {cart.map(it => `${it.quantity}x ${it.name}`).join(', ')}
                                        </div>
                                    </div>

                                    {/* Form Input 1: Customer Name */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>
                                            Customer Name / Identifier <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="input-premium"
                                            placeholder="e.g. Kuya Rider (Blue Aerox) / John Doe"
                                            value={holdCustomerName}
                                            onChange={(e) => setHoldCustomerName(e.target.value)}
                                            style={{ width: '100%', fontSize: '0.88rem', padding: '10px 12px' }}
                                        />
                                    </div>

                                    {/* Form Input 2: Reason for Holding */}
                                    <div style={{ marginBottom: '18px' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>
                                            Reason for Holding Cart
                                        </label>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                            {['Checking motorcycle outside', 'Getting cash at ATM', 'Choosing more bolts', 'Calling shop owner'].map(preset => (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    className="btn-secondary"
                                                    style={{
                                                        padding: '4px 9px',
                                                        fontSize: '0.74rem',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        borderColor: holdNote === preset ? '#f59e0b' : 'var(--border)',
                                                        color: holdNote === preset ? '#f59e0b' : 'var(--text-muted)'
                                                    }}
                                                    onClick={() => setHoldNote(preset)}
                                                >
                                                    {preset}
                                                </button>
                                            ))}
                                        </div>
                                        <input
                                            type="text"
                                            className="input-premium"
                                            value={holdNote}
                                            onChange={(e) => setHoldNote(e.target.value)}
                                            placeholder="Specify reason"
                                            style={{ width: '100%', fontSize: '0.88rem', padding: '10px 12px' }}
                                        />
                                    </div>

                                    {/* Form Submit Button */}
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={handleConfirmHold}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            background: '#f59e0b',
                                            borderColor: '#d97706',
                                            color: '#000',
                                            fontWeight: 800,
                                            fontSize: '0.92rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            borderRadius: '8px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Pause size={17} /> Confirm & Hold This Cart
                                    </button>
                                </div>
                            ) : (
                                <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <ShoppingCart size={42} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                                    <h4 style={{ margin: '0 0 6px', color: 'var(--text-main)', fontSize: '0.98rem', fontWeight: 700 }}>
                                        Active Register Cart is Empty
                                    </h4>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>
                                        To hold a transaction, add motorparts to the cart in <strong>New Sale</strong> first.
                                    </p>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={() => handleTabChange('register')}
                                        style={{ padding: '8px 18px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <ShoppingCart size={15} /> Go to New Sale (Add Parts)
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* COLUMN 2: HELD TRANSACTIONS QUEUE */}
                        <div style={{
                            background: 'var(--surface)',
                            border: '1.5px solid var(--border)',
                            borderRadius: '12px',
                            padding: '20px',
                            boxShadow: 'var(--glass-shadow)',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '16px',
                                borderBottom: '1px solid var(--border)',
                                paddingBottom: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Clock size={18} color="var(--primary)" />
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                        Paused Carts Queue
                                    </h3>
                                </div>
                                <span style={{
                                    background: '#f59e0b',
                                    color: '#000',
                                    fontWeight: 800,
                                    fontSize: '0.74rem',
                                    padding: '2px 8px',
                                    borderRadius: '10px'
                                }}>
                                    {heldTransactions.length} in queue
                                </span>
                            </div>

                            {heldTransactions.length === 0 ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <Clock size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                                    <div style={{ fontWeight: 600, fontSize: '0.94rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                                        No held transactions right now
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '340px', margin: '0 auto' }}>
                                        When you pause an order using the form on the left, it will be stored here so you can resume it whenever the customer is ready.
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {heldTransactions.map((held) => (
                                        <div
                                            key={held.id}
                                            style={{
                                                background: 'var(--surface-hover)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '10px',
                                                padding: '14px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '10px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                                        {held.id}
                                                    </span>
                                                    <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>
                                                        {held.customer_name}
                                                    </strong>
                                                </div>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    {new Date(held.held_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>

                                            <div style={{ fontSize: '0.78rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.08)', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                                                Note: {held.note}
                                            </div>

                                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                                <strong>{held.item_count || held.items?.length || 0} items:</strong> {held.items?.map(i => `${i.quantity}x ${i.name}`).slice(0, 3).join(', ')}{held.items?.length > 3 ? '...' : ''}
                                            </div>

                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                borderTop: '1px dashed var(--border)',
                                                paddingTop: '8px',
                                                marginTop: '4px'
                                            }}>
                                                <div>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total: </span>
                                                    <strong style={{ fontSize: '1.05rem', color: 'var(--primary)' }}>
                                                        {formatCurrency(held.total)}
                                                    </strong>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResumeCart(held)}
                                                        className="btn-primary"
                                                        style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px', borderRadius: '6px' }}
                                                        title="Resume this cart and bring back all items into register"
                                                    >
                                                        <Play size={13} /> Resume Cart
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteHeldCart(held.id)}
                                                        className="btn-secondary"
                                                        style={{ padding: '6px 10px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', borderRadius: '6px' }}
                                                        title="Discard held cart"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="main-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', height: '100%', gap: '16px', position: 'relative' }}>

                    {/* PRODUCT SELECTION AREA (8 of 12 columns on desktop) */}
                    <div className="no-print pos-catalog-wrapper" style={{ gridColumn: 'span 12 / span 12', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <style>{`
                            .pos-catalog-wrapper { grid-column: span 12 / span 12; }
                            .pos-cart-wrapper { grid-column: span 12 / span 12; }
                            @media (min-width: 860px) {
                                .pos-catalog-wrapper { grid-column: span 7 / span 12 !important; }
                                .pos-cart-wrapper { grid-column: span 5 / span 12 !important; }
                            }
                            @media (min-width: 1024px) {
                                .pos-catalog-wrapper { grid-column: span 8 / span 12 !important; }
                                .pos-cart-wrapper { grid-column: span 4 / span 12 !important; }
                            }
                            .pos-table th, .pos-table td {
                                padding: 8px 8px !important;
                            }
                            .pos-filters-grid {
                                display: grid;
                                grid-template-columns: 2fr 1fr 1fr;
                                gap: 8px;
                                alignItems: center;
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

                        {/* Collapsed 6 Quick Category Codes on a single row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', overflowX: 'auto', marginBottom: '10px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '4px', whiteSpace: 'nowrap' }}>
                                Categories:
                            </span>
                            {[
                                { label: 'All', value: 'All' },
                                { label: 'ENG', value: 'ENG' },
                                { label: 'BRK', value: 'BRK' },
                                { label: 'ELEC', value: 'ELEC' },
                                { label: 'CVT', value: 'CVT' },
                                { label: 'CHAS', value: 'CHAS' },
                                { label: 'OIL', value: 'OIL' }
                            ].map(cat => {
                                const isSelected = filters.category === cat.value || (cat.value === 'All' && (!filters.category || filters.category === 'All'));
                                return (
                                    <button
                                        key={cat.value}
                                        type="button"
                                        onClick={() => setCategory(cat.value)}
                                        style={{
                                            padding: '4px 14px',
                                            fontSize: '0.76rem',
                                            fontWeight: isSelected ? 800 : 600,
                                            borderRadius: '16px',
                                            border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                                            background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface)',
                                            color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {cat.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search and Filters grid (3 clean controls, duplicate dropdown removed) */}
                        <div className="pos-filters-grid">
                            <div style={{ position: 'relative', width: '100%' }}>
                                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Search or scan part # (Enter to add)..."
                                    className="input-premium pos-search-input"
                                    style={{ paddingLeft: '32px', width: '100%' }}
                                    value={searchQuery}
                                    onChange={handleSearchChange}
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
                                <select className="input-premium" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                                    <option value="All">All Types</option>
                                    <option value="Non-Serialized">Non-Serialized Only</option>
                                    <option value="Serialized">Serialized Only</option>
                                </select>
                            </div>
                        </div>

                {/* Product Catalog Cards with Round Borders (Replaces obsolete table layout) */}
                <div className="pos-product-cards-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                    gap: '10px',
                    width: '100%'
                }}>
                    {paginatedProducts.length > 0 ? paginatedProducts.map(p => (
                        <div
                            key={p.row_key || `${p.id}_${p.serial_id || 'noserial'}`}
                            onClick={() => handleRowClick(p)}
                            className="pos-product-card"
                            style={{
                                background: 'var(--surface)',
                                border: '1.5px solid var(--border)',
                                borderRadius: '12px',
                                padding: '14px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                transition: 'all 0.18s ease',
                                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                                position: 'relative',
                                userSelect: 'none'
                            }}
                            title="Click card to add to cart"
                        >
                            {/* Top Row: Part Number & Stock Badge */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', minWidth: 0, width: '100%' }}>
                                    <span
                                        title={p.part_number}
                                        style={{
                                            fontFamily: 'monospace',
                                            fontWeight: 700,
                                            fontSize: '0.75rem',
                                            background: 'var(--surface-hover)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text-main)',
                                            padding: '2px 6px',
                                            borderRadius: '6px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            minWidth: 0,
                                            flex: '1 1 auto',
                                            maxWidth: 'calc(100% - 66px)',
                                            display: 'inline-block'
                                        }}
                                    >
                                        {p.part_number}
                                    </span>

                                    <span style={{
                                        fontWeight: 700,
                                        fontSize: '0.70rem',
                                        color: p.stock <= 0 ? '#94a3b8' : (p.stock <= (p.reorder_level || 5) ? '#dc2626' : '#16a34a'),
                                        background: p.stock <= 0 ? 'rgba(148, 163, 184, 0.1)' : (p.stock <= (p.reorder_level || 5) ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 163, 74, 0.1)'),
                                        border: `1px solid ${p.stock <= 0 ? 'rgba(148, 163, 184, 0.25)' : (p.stock <= (p.reorder_level || 5) ? 'rgba(220, 38, 38, 0.25)' : 'rgba(22, 163, 74, 0.25)')}`,
                                        padding: '2px 7px',
                                        borderRadius: '10px',
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
                                    }}>
                                        {p.stock <= 0 ? 'Out of Stock' : (p.stock <= (p.reorder_level || 5) ? `Low: ${p.stock}` : `Stock: ${p.stock}`)}
                                    </span>
                                </div>

                                {/* Product Name & Category */}
                                <div style={{ marginTop: '10px' }}>
                                    <div style={{
                                        fontWeight: 700,
                                        fontSize: '0.94rem',
                                        color: 'var(--text-main)',
                                        lineHeight: 1.25,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                    }}>
                                        {p.product_name || p.name}
                                    </div>
                                    {p.category && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {p.category}
                                        </div>
                                    )}
                                </div>

                                {/* Brand, Size, Serialized Pills */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                    {p.brand && (
                                        <span style={{
                                            fontSize: '0.72rem',
                                            color: 'var(--text-muted)',
                                            background: 'var(--surface-hover)',
                                            border: '1px solid var(--border)',
                                            padding: '2px 6px',
                                            borderRadius: '6px'
                                        }}>
                                            {p.brand}
                                        </span>
                                    )}
                                    {p.size && !['unspecified', 'n/a', 'none', '-', ''].includes(String(p.size).trim().toLowerCase()) && (
                                        <span style={{
                                            fontSize: '0.72rem',
                                            color: 'var(--text-muted)',
                                            background: 'var(--surface-hover)',
                                            border: '1px solid var(--border)',
                                            padding: '2px 6px',
                                            borderRadius: '6px'
                                        }}>
                                            Size: {p.size}
                                        </span>
                                    )}
                                    {p.is_serialized ? (
                                        <>
                                            <span className="badge-pill badge-serialized" style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '6px' }}>
                                                Serialized
                                            </span>
                                            {p.availSerials && p.availSerials.length > 1 ? (
                                                <select
                                                    value={selectedTableSerials[p.id] || p.availSerials[0].id}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        const newSerialId = Number(e.target.value);
                                                        setSelectedTableSerials(prev => ({
                                                            ...prev,
                                                            [p.id]: newSerialId
                                                        }));
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="Select Serial Number Lot"
                                                    style={{
                                                        fontSize: '0.70rem',
                                                        fontFamily: 'monospace',
                                                        fontWeight: 600,
                                                        padding: '1px 6px',
                                                        borderRadius: '6px',
                                                        background: 'var(--surface-hover)',
                                                        color: 'var(--primary)',
                                                        border: '1px solid var(--border)',
                                                        outline: 'none',
                                                        cursor: 'pointer',
                                                        maxWidth: '160px'
                                                    }}
                                                >
                                                    {p.availSerials.map(s => (
                                                        <option key={s.id} value={s.id} style={{ background: '#1e293b', color: '#f8fafc' }}>
                                                            SN: {s.serial_number} {s.quantity > 1 ? `(${s.quantity})` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                p.availSerials && p.availSerials.length === 1 ? (
                                                    <span style={{
                                                        fontFamily: 'monospace',
                                                        fontWeight: 600,
                                                        fontSize: '0.70rem',
                                                        color: 'var(--primary)',
                                                        background: 'rgba(22, 163, 74, 0.1)',
                                                        padding: '1px 6px',
                                                        borderRadius: '6px',
                                                        border: '1px solid rgba(22, 163, 74, 0.25)',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        SN: {p.availSerials[0].serial_number}
                                                    </span>
                                                ) : null
                                            )}
                                        </>
                                    ) : null}
                                </div>
                            </div>

                            {/* Bottom Row: Price & + Add Button */}
                            <div style={{
                                marginTop: '12px',
                                paddingTop: '8px',
                                borderTop: '1px solid var(--border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <div style={{
                                        color: 'var(--primary)',
                                        fontWeight: 800,
                                        fontSize: '1.15rem',
                                        lineHeight: 1.1
                                    }}>
                                        {formatCurrency(p.price)}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className="btn-primary"
                                    style={{
                                        padding: '5px 12px',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        cursor: 'pointer'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRowClick(p);
                                    }}
                                >
                                    + Add
                                </button>
                            </div>
                        </div>
                    )) : (
                        <div style={{
                            gridColumn: '1 / -1',
                            padding: '40px 20px',
                            textAlign: 'center',
                            background: 'var(--surface)',
                            border: '1.5px dashed var(--border)',
                            borderRadius: '12px',
                            color: 'var(--text-muted)'
                        }}>
                            No matching products found. Try scanning another part number or clearing filters.
                        </div>
                    )}
                </div>

                {/* POS Catalog Pagination Controls */}
                {filteredCount > 0 && (
                    <div className="pos-pagination-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <span>
                                Showing <strong>{((currentPage - 1) * pageSize) + 1}</strong> - <strong>{Math.min(currentPage * pageSize, filteredCount)}</strong> of <strong>{filteredCount}</strong> products
                            </span>
                            <select
                                value={pageSize}
                                onChange={(e) => handlePageSizeChange(e.target.value)}
                                className="input-premium"
                                style={{ padding: '2px 8px', fontSize: '0.75rem', width: 'auto', cursor: 'pointer' }}
                                title="Products per page"
                            >
                                <option value={10}>10 / page</option>
                                <option value={25}>25 / page</option>
                                <option value={50}>50 / page</option>
                                <option value={100}>100 / page</option>
                            </select>
                        </div>

                        {totalPages > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <button
                                    type="button"
                                    disabled={currentPage === 1}
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    className="btn-secondary"
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '0.8rem',
                                        height: '32px',
                                        minHeight: '32px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: currentPage === 1 ? 0.4 : 1,
                                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    Prev
                                </button>

                                {getPageNumbers(currentPage, totalPages).map((pageNum, idx) => (
                                    pageNum === '...' ? (
                                        <span key={`dots-${idx}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>...</span>
                                    ) : (
                                        <button
                                            key={`page-${pageNum}`}
                                            type="button"
                                            onClick={() => handlePageChange(pageNum)}
                                            className={currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '0.8rem',
                                                minWidth: '32px',
                                                height: '32px',
                                                minHeight: '32px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                textAlign: 'center',
                                                fontWeight: currentPage === pageNum ? 700 : 500,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {pageNum}
                                        </button>
                                    )
                                ))}

                                <button
                                    type="button"
                                    disabled={currentPage === totalPages}
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    className="btn-secondary"
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '0.8rem',
                                        height: '32px',
                                        minHeight: '32px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: currentPage === totalPages ? 0.4 : 1,
                                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* CART AREA (4 of 12 columns on desktop) */}
            <div id="pos-cart-section" className="glass-panel no-print cart-container pos-cart-wrapper" style={{ display: 'flex', flexDirection: 'column', padding: '0', minHeight: '480px', height: 'fit-content' }}>
                {replacementMode ? (
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--warning-border)', background: 'var(--warning-bg)', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ArrowLeftRight size={17} color="var(--warning-text)" />
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--warning-text)' }}>
                                    ⇄ Item Replacement Mode
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    Ref: #{replacementMode.originalSale.order_number || replacementMode.originalSale.id}
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleCancelReplacement}
                            style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.35)',
                                color: '#ef4444',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                            title="Cancel replacement mode and clear cart"
                        >
                            ✕ Cancel
                        </button>
                    </div>
                ) : (
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1rem', fontWeight: 600 }}><ShoppingCart size={18} /> Current Order</h3>
                        {cart.length > 0 && (
                            <span style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary)', border: '1px solid rgba(99, 102, 241, 0.4)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                {cart.reduce((sum, item) => sum + item.quantity, 0)} {cart.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'item' : 'items'}
                            </span>
                        )}
                    </div>
                )}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px', maxHeight: '420px' }}>
                    {/* Pinned Locked Credit Line during Replacement Mode */}
                    {replacementMode && (
                        <div
                            className="trade-in-card"
                            data-alert="trade-in-credit"
                            style={{
                                marginBottom: '10px',
                                padding: '10px 12px',
                                background: 'rgba(139, 92, 246, 0.08)',
                                border: '1px solid rgba(139, 92, 246, 0.35)',
                                borderRadius: '8px'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <span
                                        className="trade-in-badge"
                                        data-badge="trade-in-credit"
                                        style={{
                                            fontSize: '0.66rem',
                                            fontWeight: 800,
                                            background: 'rgba(139, 92, 246, 0.25)',
                                            color: '#a78bfa',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            textTransform: 'uppercase'
                                        }}
                                    >
                                        Trade-In Credit
                                    </span>
                                    {replacementMode.allSaleItems && replacementMode.allSaleItems.length > 1 ? (
                                        <div style={{ marginTop: '4px' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                                                Returning Part ({replacementMode.allSaleItems.length} items on receipt):
                                            </div>
                                            <select
                                                value={replacementMode.saleItem?.id}
                                                onChange={(e) => {
                                                    const selected = replacementMode.allSaleItems.find(it => String(it.id) === e.target.value);
                                                    if (selected) {
                                                        handleSelectItemForReplacement(selected);
                                                    }
                                                }}
                                                className="input-premium"
                                                style={{ fontSize: '0.78rem', padding: '3px 8px', width: '100%', background: 'var(--surface)', cursor: 'pointer' }}
                                            >
                                                {replacementMode.allSaleItems.map(it => (
                                                    <option key={it.id} value={it.id}>
                                                        {it.product_name || it.name} ({formatCurrency(it.price || it.unit_price)})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-main)', marginTop: '4px' }}>
                                                Returning: {replacementMode.returnedProduct.name}
                                            </div>
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                {replacementMode.returnedProduct.part_number} • Qty: 1 (Restock to sellable)
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.96rem', color: '#10b981' }}>
                                        -{formatCurrency(replacementMode.creditAmount)}
                                    </span>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Credit Applied</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {cart.length === 0 ? (
                        <div style={{ height: '100%', minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {replacementMode ? 'Add replacement part(s) from catalog' : 'Order is empty'}
                        </div>
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
                {/* Current Order In-Line Discount Panel (No Glass Panel Modal, No Price Override) */}
                {!showDiscountRequestModal ? (
                    <div style={{
                        padding: '8px 12px',
                        background: 'var(--surface-hover)',
                        borderTop: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)'
                    }}>
                        <button
                            type="button"
                            onClick={() => {
                                if (cart.length === 0) return toast.error('Add items to cart before requesting discount');
                                setReqDiscountType(discountType);
                                setReqDiscountVal(discountValue || '');
                                setShowDiscountRequestModal(true);
                            }}
                            className="btn-secondary"
                            style={{
                                width: '100%',
                                padding: '6px 12px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                borderRadius: '6px',
                                background: calculatedDiscount > 0 ? 'rgba(16, 185, 129, 0.12)' : undefined,
                                borderColor: calculatedDiscount > 0 ? '#10b981' : undefined,
                                color: calculatedDiscount > 0 ? '#10b981' : undefined
                            }}
                            title="Add or edit discount on this cart"
                        >
                            <Tag size={13} color={calculatedDiscount > 0 ? '#10b981' : 'var(--text-muted)'} />
                            <span>
                                {calculatedDiscount > 0
                                    ? `Discount: -${formatCurrency(calculatedDiscount)} (${discountType === 'percent' ? discountValue + '%' : 'Fixed'}) • Edit`
                                    : (user && String(user.role).toLowerCase() === 'admin' ? 'Apply Discount' : 'Request Discount')}
                            </span>
                        </button>
                    </div>
                ) : (
                    <div style={{
                        padding: '12px 14px',
                        background: 'var(--surface-hover)',
                        borderTop: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '9px'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Tag size={14} color="#10b981" />
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)' }}>Cart Discount</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDiscountRequestModal(false)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                title="Close discount form"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Retail / Puhunan / Margin Snapshot */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '4px',
                            padding: '6px 8px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            textAlign: 'center'
                        }}>
                            <div>
                                <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Retail</div>
                                <strong style={{ fontSize: '0.78rem' }}>{formatCurrency(cartGrossSubtotal)}</strong>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Puhunan</div>
                                <strong style={{ fontSize: '0.78rem' }}>{formatCurrency(cartTotalCost)}</strong>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Profit</div>
                                <strong style={{ fontSize: '0.78rem', color: '#10b981' }}>{formatCurrency(cartGrossSubtotal - cartTotalCost)}</strong>
                            </div>
                        </div>

                        {/* Type Switch & Value Input */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                    Discount Value
                                </label>
                                <div style={{ display: 'flex', gap: '2px', background: 'var(--input-bg)', padding: '2px', borderRadius: '4px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setReqDiscountType('fixed')}
                                        style={{
                                            padding: '2px 8px',
                                            fontSize: '0.68rem',
                                            borderRadius: '3px',
                                            border: 'none',
                                            background: reqDiscountType === 'fixed' ? 'var(--primary)' : 'transparent',
                                            color: reqDiscountType === 'fixed' ? '#fff' : 'var(--text-muted)',
                                            cursor: 'pointer',
                                            fontWeight: 600
                                        }}
                                    >
                                        ₱ Fixed
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setReqDiscountType('percent')}
                                        style={{
                                            padding: '2px 8px',
                                            fontSize: '0.68rem',
                                            borderRadius: '3px',
                                            border: 'none',
                                            background: reqDiscountType === 'percent' ? 'var(--primary)' : 'transparent',
                                            color: reqDiscountType === 'percent' ? '#fff' : 'var(--text-muted)',
                                            cursor: 'pointer',
                                            fontWeight: 600
                                        }}
                                    >
                                        % Off
                                    </button>
                                </div>
                            </div>
                            <input
                                id="pos-discount-value-input"
                                type="number"
                                className="input-premium"
                                style={{ height: '32px', fontSize: '0.82rem', padding: '4px 8px' }}
                                placeholder={reqDiscountType === 'fixed' ? '₱ amount (e.g. 50)' : '% percentage (e.g. 10)'}
                                value={reqDiscountVal}
                                onChange={(e) => setReqDiscountVal(e.target.value)}
                            />
                        </div>

                        {/* Margin Warning / Preview */}
                        {(() => {
                            const val = parseFloat(reqDiscountVal) || 0;
                            const discAmt = reqDiscountType === 'percent'
                                ? (cartGrossSubtotal * (Math.min(100, val) / 100))
                                : val;
                            const remainingMargin = (cartGrossSubtotal - discAmt) - cartTotalCost;
                            const isBelowCost = remainingMargin < -0.01;

                            if (val <= 0) return null;

                            return (
                                <div style={{
                                    padding: '5px 8px',
                                    borderRadius: '5px',
                                    background: isBelowCost ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.1)',
                                    border: `1px solid ${isBelowCost ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.25)'}`,
                                    fontSize: '0.72rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Remaining Profit Margin:</span>
                                        <strong style={{ color: isBelowCost ? '#ef4444' : '#10b981', fontFamily: 'monospace' }}>
                                            {formatCurrency(remainingMargin)}
                                        </strong>
                                    </div>
                                    {isBelowCost && (
                                        <div style={{ color: '#ef4444', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem' }}>
                                            <AlertCircle size={11} /> Discount exceeds profit margin (below unit puhunan)!
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Reason Input */}
                        <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                                Reason
                            </label>
                            <input
                                type="text"
                                className="input-premium"
                                style={{ height: '32px', fontSize: '0.78rem', padding: '4px 8px' }}
                                placeholder="Reason (optional)"
                                value={reqDiscountReason}
                                onChange={(e) => setReqDiscountReason(e.target.value)}
                            />
                        </div>

                        {/* Action Buttons: Admin Direct Apply vs Staff Email OTP Flow */}
                        {user && String(user.role).toLowerCase() === 'admin' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
                                {/* Admin Direct Apply (No OTP / No Email Needed) */}
                                <button
                                    type="button"
                                    className="btn-primary"
                                    style={{
                                        width: '100%',
                                        height: '34px',
                                        fontSize: '0.80rem',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        background: '#059669',
                                        borderColor: '#059669'
                                    }}
                                    onClick={handleApplyDiscountDirect}
                                >
                                    <CheckCircle2 size={14} />
                                    <span>Apply Discount</span>
                                </button>

                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {(discountValue || calculatedDiscount > 0) && (
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            style={{ flex: 1, height: '28px', fontSize: '0.72rem', color: '#ef4444' }}
                                            onClick={handleClearDiscount}
                                        >
                                            Clear Active
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ flex: (discountValue || calculatedDiscount > 0) ? 'none' : 1, height: '28px', padding: '0 10px', fontSize: '0.72rem' }}
                                        onClick={() => {
                                            setShowDiscountRequestModal(false);
                                            setIsOtpRequested(false);
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : !isOtpRequested ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
                                {/* Primary Action: Send OTP to Admin Gmail for Staff Approval */}
                                <button
                                    type="button"
                                    className="btn-primary"
                                    style={{
                                        width: '100%',
                                        height: '34px',
                                        fontSize: '0.78rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        background: '#059669',
                                        borderColor: '#059669'
                                    }}
                                    onClick={handleRequestDiscountOtp}
                                    disabled={sendingDiscountOtp}
                                >
                                    <Mail size={13} />
                                    <span>{sendingDiscountOtp ? 'Sending OTP to Admin Gmail...' : 'Request Discount (Send OTP to Admin)'}</span>
                                </button>

                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {(discountValue || calculatedDiscount > 0) && (
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            style={{ flex: 1, height: '28px', fontSize: '0.72rem', color: '#ef4444' }}
                                            onClick={handleClearDiscount}
                                        >
                                            Clear Active
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ flex: (discountValue || calculatedDiscount > 0) ? 'none' : 1, height: '28px', padding: '0 10px', fontSize: '0.72rem' }}
                                        onClick={() => {
                                            setShowDiscountRequestModal(false);
                                            setIsOtpRequested(false);
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
                                {/* Waiting for Admin Approval Banner */}
                                <div style={{
                                    padding: '8px 10px',
                                    background: 'rgba(16, 185, 129, 0.12)',
                                    border: '1px solid rgba(16, 185, 129, 0.35)',
                                    borderRadius: '6px',
                                    fontSize: '0.74rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: '#10b981', marginBottom: '2px' }}>
                                        <Mail size={13} />
                                        <span>Waiting for Admin Approval via Gmail</span>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.35 }}>
                                        A 6-digit OTP code was dispatched to Admin's Gmail ({adminMaskedEmail}). Ask Admin for the OTP number to approve.
                                    </div>
                                </div>

                                {/* 6-Digit OTP Input */}
                                <div>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                                        Enter 6-Digit OTP from Admin Gmail *
                                    </label>
                                    <input
                                        id="pos-discount-otp-input"
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        className="input-premium"
                                        style={{
                                            height: '38px',
                                            fontSize: '1.2rem',
                                            letterSpacing: '8px',
                                            textAlign: 'center',
                                            fontFamily: 'monospace',
                                            fontWeight: 800,
                                            padding: '2px 8px'
                                        }}
                                        placeholder="● ● ● ● ● ●"
                                        value={discountOtp}
                                        onChange={(e) => setDiscountOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    />
                                </div>

                                {/* Verify & Resend Buttons */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        style={{ width: '100%', height: '34px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                                        onClick={handleVerifyDiscountOtp}
                                        disabled={verifyingDiscountOtp || discountOtp.length !== 6}
                                    >
                                        <CheckCircle2 size={14} />
                                        <span>{verifyingDiscountOtp ? 'Verifying OTP...' : 'Verify OTP & Apply Discount'}</span>
                                    </button>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            style={{ flex: 1, height: '28px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                            onClick={handleRequestDiscountOtp}
                                            disabled={sendingDiscountOtp}
                                        >
                                            <RefreshCw size={11} className={sendingDiscountOtp ? 'spin' : ''} />
                                            <span>{sendingDiscountOtp ? 'Resending...' : 'Resend OTP'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            style={{ height: '28px', padding: '0 10px', fontSize: '0.72rem' }}
                                            onClick={() => setIsOtpRequested(false)}
                                        >
                                            Back / Edit
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div style={{ padding: '14px 16px', background: 'var(--surface)', borderRadius: '0 0 12px 12px', borderTop: '1px solid var(--border)' }}>
                    {replacementMode ? (
                        <>
                            {/* New items subtotal */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <span>New Items Subtotal:</span>
                                <span style={{ fontFamily: 'monospace' }}>{formatCurrency(cartGrossSubtotal)}</span>
                            </div>
                            {/* Returned item credit */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600 }}>
                                <span>Less: Swap Credit:</span>
                                <span style={{ fontFamily: 'monospace' }}>-{formatCurrency(replacementCredit)}</span>
                            </div>
                            {calculatedDiscount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                                    <span>Less: OTP Discount:</span>
                                    <span style={{ fontFamily: 'monospace' }}>-{formatCurrency(calculatedDiscount)}</span>
                                </div>
                            )}

                            {/* Balance / Top-Up Due Line */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '0.94rem', color: replacementTopUpDue > 0 ? '#10b981' : (isUnderReplacementCredit ? 'var(--warning-text)' : 'var(--text-main)'), display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {replacementTopUpDue > 0 ? (
                                            <>
                                                <TrendingUp size={16} />
                                                <span>Upgrade Top-Up Due</span>
                                            </>
                                        ) : isUnderReplacementCredit ? (
                                            <>
                                                <AlertCircle size={15} />
                                                <span>Remaining Unspent Credit</span>
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={15} />
                                                <span>Even Value Exchange</span>
                                            </>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        {replacementTopUpDue > 0
                                            ? 'Customer pays upgrade difference (Cash or GCash)'
                                            : (isUnderReplacementCredit ? 'Select more parts or choose an upgrade' : 'Exact value match • ₱0.00 balance')}
                                    </div>
                                </div>
                                <span style={{
                                    fontWeight: 900,
                                    fontSize: '1.45rem',
                                    fontFamily: 'monospace',
                                    color: replacementTopUpDue > 0 ? '#10b981' : (isUnderReplacementCredit ? 'var(--warning-text)' : 'var(--primary)')
                                }}>
                                    {replacementTopUpDue > 0
                                        ? `+${formatCurrency(replacementTopUpDue)}`
                                        : (isUnderReplacementCredit ? formatCurrency(replacementRemainingCredit) : '₱0.00')}
                                </span>
                            </div>

                            {/* Helpful Guidance when under credit */}
                            {isUnderReplacementCredit && (
                                <div
                                    className="under-credit-banner"
                                    data-alert="under-credit"
                                    style={{
                                        marginBottom: '10px',
                                        background: 'var(--warning-bg)',
                                        border: '1px solid var(--warning-border)',
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        color: 'var(--warning-text)',
                                        fontSize: '0.75rem',
                                        lineHeight: 1.4
                                    }}
                                >
                                    <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                                        <span>💡 Upgrade or Complete Exchange:</span>
                                    </div>
                                    Customer has <strong>{formatCurrency(replacementRemainingCredit)}</strong> trade-in credit left to spend. You can add more items from the catalog, or pick a pricier upgrade part (e.g. Brembo 4-Piston Caliper). Any upgrade difference will be collected at checkout.
                                </div>
                            )}

                            {/* Replacement Action Buttons */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                                <button
                                    type="button"
                                    className={isUnderReplacementCredit || cart.length === 0 ? "btn-secondary" : "btn-primary"}
                                    disabled={isUnderReplacementCredit || cart.length === 0}
                                    onClick={handleOpenReplacementCheckout}
                                    style={{
                                        padding: '12px 14px',
                                        fontSize: '0.88rem',
                                        fontWeight: 800,
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        cursor: (isUnderReplacementCredit || cart.length === 0) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {isUnderReplacementCredit ? (
                                        <>
                                            <AlertCircle size={16} />
                                            <span>Add {formatCurrency(replacementRemainingCredit)} More or Pick Upgrade</span>
                                        </>
                                    ) : replacementTopUpDue > 0 ? (
                                        <>
                                            <TrendingUp size={16} />
                                            <span>Pay +{formatCurrency(replacementTopUpDue)} Upgrade &amp; Print</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={16} />
                                            <span>Even Exchange (₱0.00) &amp; Print</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Items Subtotal */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <span>Items Subtotal:</span>
                                <span style={{ fontFamily: 'monospace' }}>{formatCurrency(subtotal)}</span>
                            </div>

                            {/* Discount / Bawas Line */}
                            {calculatedDiscount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                                    <span>Less: OTP Discount:</span>
                                    <span style={{ fontFamily: 'monospace' }}>-{formatCurrency(calculatedDiscount)}</span>
                                </div>
                            )}

                            {/* Clean Non-VAT Retail Total */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>Total Amount Payable</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Non-VAT Retail Sale</div>
                                </div>
                                <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '1.4rem', fontFamily: 'monospace' }}>
                                    {formatCurrency(totalAmount)}
                                </span>
                            </div>
                            <div style={{ textAlign: 'center', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><span>Part inspected with customer — Sold As-Is (No Return / No Refund)</span></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={handleOpenHoldModal}
                                    className="btn-secondary"
                                    disabled={cart.length === 0}
                                    style={{
                                        padding: '10px 10px',
                                        fontSize: '0.82rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '5px',
                                        borderColor: 'rgba(245, 158, 11, 0.4)',
                                        color: '#f59e0b',
                                        background: 'rgba(245, 158, 11, 0.08)',
                                        cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                                        borderRadius: '8px'
                                    }}
                                    title="Pause cart when customer steps aside to check motorcycle or get cash"
                                >
                                    <Pause size={15} />
                                    <span>Hold Cart</span>
                                </button>
                                <button 
                                    className={((!activeCashFloat && user && String(user.role).toLowerCase() !== 'admin') || shiftStatus === 'PENDING_REMIT') ? "btn-secondary" : "btn-primary"} 
                                    style={{ padding: '10px 14px', fontSize: '0.88rem', cursor: ((!activeCashFloat && user && String(user.role).toLowerCase() !== 'admin') || shiftStatus === 'PENDING_REMIT') ? 'not-allowed' : 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} 
                                    onClick={handleCheckoutClick} 
                                    disabled={cart.length === 0 || (!activeCashFloat && user && String(user.role).toLowerCase() !== 'admin') || shiftStatus === 'PENDING_REMIT'}
                                >
                                    {shiftStatus === 'PENDING_REMIT' ? (
                                        <>
                                            <Lock size={16} /> Awaiting Sign-Off
                                        </>
                                    ) : (!activeCashFloat && user && String(user.role).toLowerCase() !== 'admin') ? (
                                        <>
                                            <Lock size={16} /> Awaiting Float
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={16} /> Complete &amp; Print
                                        </>
                                    )}
                                </button>
                            </div>
                            {!activeCashFloat && user && String(user.role).toLowerCase() !== 'admin' && (
                                <div style={{ marginTop: '10px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '0.74rem' }}>
                                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                                    <span>Starting Panukli is ₱0.00. Admin must assign your shift cash float before sales can be completed.</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Mobile / Tablet Sticky Quick Checkout Bar */}
            {cart.length > 0 && (
                <div
                    className="mobile-cart-float-bar"
                    onClick={() => {
                        const el = document.getElementById('pos-cart-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShoppingCart size={18} />
                        <span>{cart.reduce((sum, item) => sum + item.quantity, 0)} {cart.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'item' : 'items'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{formatCurrency(totalAmount)}</span>
                        <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.22)', padding: '2px 8px', borderRadius: '4px' }}>Checkout ➔</span>
                    </div>
                </div>
            )}
        </div>
        )}

                        {/* CHECKOUT MODAL */}
            {showConfirmModal && (
                <CheckoutModal
                    isOpen={showConfirmModal}
                    activeCashFloat={activeCashFloat}
                    onClose={() => {
                        setShowConfirmModal(false);
                        setTenderedAmount('');
                    }}
                    totalAmount={totalAmount}
                    subtotal={subtotal}
                    discountAmount={calculatedDiscount}
                    cart={cart}
                    customerName={customerName}
                    customerAddress={customerAddress}
                    onCustomerNameChange={setCustomerName}
                    onCustomerAddressChange={setCustomerAddress}
                    onProcessPayment={processPayment}
                    loading={submittingPayment}
                    discountType={discountType}
                    discountValue={discountValue}
                    onDiscountTypeChange={setDiscountType}
                    onDiscountValueChange={setDiscountValue}
                    cartGrossSubtotal={cartGrossSubtotal}
                    cartTotalCost={cartTotalCost}
                    maxAllowableDiscount={maxAllowableDiscount}
                    isDiscountExceedingCost={isDiscountExceedingCost}
                />
            )}

            {/* ============================================================ */}
            {/* 1. HOLD TRANSACTION MODAL                                      */}
            {/* ============================================================ */}
            {showHoldModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', background: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Pause size={18} color="#f59e0b" />
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Hold Transaction</h3>
                            </div>
                            <button type="button" onClick={() => setShowHoldModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                            Pausing cart with <strong>{cart.reduce((s, it) => s + it.quantity, 0)} items</strong> (Total: <strong style={{ color: 'var(--primary)' }}>{formatCurrency(totalAmount)}</strong>). The counter will be freed up for the next customer.
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                Customer Name / Identifier
                            </label>
                            <input
                                type="text"
                                className="input-premium"
                                placeholder="e.g. Kuya Rider (Blue Click)"
                                value={holdCustomerName}
                                onChange={(e) => setHoldCustomerName(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                Reason for Holding
                            </label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                {['Checking motorcycle outside', 'Getting cash at ATM', 'Choosing more bolts', 'Calling shop owner'].map(preset => (
                                    <button
                                        key={preset}
                                        type="button"
                                        className="btn-secondary"
                                        style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: '4px', cursor: 'pointer' }}
                                        onClick={() => setHoldNote(preset)}
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                className="input-premium"
                                value={holdNote}
                                onChange={(e) => setHoldNote(e.target.value)}
                                placeholder="Reason"
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowHoldModal(false)} style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: '8px 16px', fontSize: '0.85rem', background: '#f59e0b', borderColor: '#d97706', color: '#000', fontWeight: 700 }}
                                onClick={handleConfirmHold}
                            >
                                <Pause size={14} /> Confirm Hold
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* 2. HELD CARTS QUEUE MODAL                                      */}
            {/* ============================================================ */}
            {showHeldQueueModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '680px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Pause size={20} color="#f59e0b" />
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Held Transactions Queue</h3>
                                <span style={{ background: '#f59e0b', color: '#000', fontWeight: 800, fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px' }}>
                                    {heldTransactions.length} Paused
                                </span>
                            </div>
                            <button type="button" onClick={() => setShowHeldQueueModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                            {/* If active cart has items, show form to hold active cart directly inside modal */}
                            {cart.length > 0 && (
                                <div style={{
                                    background: 'rgba(245, 158, 11, 0.08)',
                                    border: '1.5px solid rgba(245, 158, 11, 0.35)',
                                    borderRadius: '10px',
                                    padding: '14px',
                                    marginBottom: '16px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Pause size={16} color="#f59e0b" />
                                            <strong style={{ fontSize: '0.88rem', color: '#f59e0b' }}>
                                                Hold Active Cart ({cart.reduce((s, it) => s + it.quantity, 0)} items • {formatCurrency(totalAmount)})
                                            </strong>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Customer Name / Identifier *</label>
                                            <input
                                                type="text"
                                                className="input-premium"
                                                placeholder="e.g. Kuya Rider"
                                                value={holdCustomerName}
                                                onChange={(e) => setHoldCustomerName(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Reason</label>
                                            <input
                                                type="text"
                                                className="input-premium"
                                                value={holdNote}
                                                onChange={(e) => setHoldNote(e.target.value)}
                                                placeholder="Reason for hold"
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            style={{ padding: '6px 14px', fontSize: '0.82rem', background: '#f59e0b', color: '#000', fontWeight: 700 }}
                                            onClick={handleConfirmHold}
                                        >
                                            <Pause size={14} /> Hold This Cart Now
                                        </button>
                                    </div>
                                </div>
                            )}

                            {heldTransactions.length === 0 ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <Clock size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                                    <div>No held transactions in queue.</div>
                                    <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>When a customer steps aside to check their motorcycle or get cash, click <strong>Hold Cart</strong> to pause their order here.</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {heldTransactions.map((held) => (
                                        <div
                                            key={held.id}
                                            style={{
                                                background: 'var(--surface-hover)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '10px',
                                                padding: '12px 14px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: '12px',
                                                flexWrap: 'wrap'
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: '240px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                                        {held.id}
                                                    </span>
                                                    <strong style={{ fontSize: '0.94rem', color: 'var(--text-main)' }}>
                                                        {held.customer_name}
                                                    </strong>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                                        {new Date(held.held_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.78rem', color: '#f59e0b', marginBottom: '4px' }}>
                                                    Note: {held.note}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {held.item_count || held.items?.length || 0} items: {held.items?.map(i => `${i.quantity}x ${i.name}`).slice(0, 3).join(', ')}{held.items?.length > 3 ? '...' : ''}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total Payable</div>
                                                    <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>
                                                        {formatCurrency(held.total)}
                                                    </strong>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleResumeCart(held)}
                                                    className="btn-primary"
                                                    style={{ padding: '7px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                                                    title="Resume this cart and bring back all items"
                                                >
                                                    <Play size={14} /> Resume Cart
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteHeldCart(held.id)}
                                                    className="btn-secondary"
                                                    style={{ padding: '7px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', borderRadius: '6px' }}
                                                    title="Discard held cart"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowHeldQueueModal(false)} style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
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
                                totalAmount={lastTransaction.total || lastTransaction.totalAmount}
                                subtotal={lastTransaction.subtotal}
                                discountAmount={lastTransaction.discountAmount || lastTransaction.discount}
                                vatableAmount={lastTransaction.vatableAmount}
                                vatAmount={lastTransaction.vatAmount || lastTransaction.taxAmount}
                                taxAmount={lastTransaction.taxAmount || lastTransaction.vatAmount}
                                vatExemptAmount={lastTransaction.vatExemptAmount || 0}
                                zeroRatedAmount={lastTransaction.zeroRatedAmount || 0}
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
                                    padding: '8px 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    fontSize: '0.82rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                                onClick={() => {
                                    closeReceipt();
                                    handleTabChange('history');
                                }}
                                title="View in Sales History"
                            >
                                <History size={14} /> View in Sales History
                            </button>
                            {showVoidConfirm ? (
                                <div style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    background: 'rgba(225, 29, 72, 0.08)',
                                    border: '1.5px solid rgba(225, 29, 72, 0.35)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                    marginTop: '4px'
                                }}>
                                    <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#e11d48', textAlign: 'center' }}>
                                        Void order #{lastTransaction?.orderNumber || lastTransaction?.saleId} and return items to cart?
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                        Customer can add forgotten items and checkout again.
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowVoidConfirm(false)}
                                            className="btn-secondary"
                                            style={{ flex: 1, padding: '7px 8px', fontSize: '0.78rem', fontWeight: 700 }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={executeVoidAndReopen}
                                            disabled={voidingSale}
                                            style={{
                                                flex: 1,
                                                padding: '7px 8px',
                                                fontSize: '0.78rem',
                                                fontWeight: 800,
                                                background: '#e11d48',
                                                color: '#ffffff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {voidingSale ? 'Voiding...' : 'Yes, Void & Restore'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
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
                                    onClick={() => setShowVoidConfirm(true)}
                                    title="Customer forgot something? Void this transaction and return items to cart to add more items."
                                >
                                    <RotateCcw size={15} />
                                    <span>↩ Void &amp; Return to Cart</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* 4. CONFIRM ITEM REPLACEMENT MODAL                            */}
            {/* ============================================================ */}
            {showReplacementCheckoutModal && replacementMode && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: 'rgba(0,0,0,0.75)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px'
                }}>
                    <div className="glass-panel" style={{
                        maxWidth: '520px',
                        width: '100%',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        padding: '24px',
                        position: 'relative',
                        maxHeight: '92vh',
                        overflowY: 'auto'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '8px',
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#10b981',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <CheckCircle2 size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                                        Confirm Item Replacement
                                    </h3>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        Original Receipt: #{replacementMode.originalSale.order_number || replacementMode.originalSale.id}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowReplacementCheckoutModal(false)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Returned vs Replacement Comparison */}
                        <div style={{
                            background: 'var(--surface-hover)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            fontSize: '0.8rem'
                        }}>
                            {/* Returning */}
                            <div>
                                <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '2px' }}>
                                    Returning (Trade-In Credit):
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                                    <span>{replacementMode.returnedProduct.name} (x1)</span>
                                    <span style={{ fontFamily: 'monospace', color: '#ef4444', fontWeight: 800 }}>
                                        -{formatCurrency(replacementCredit)}
                                    </span>
                                </div>
                            </div>

                            {/* New Items */}
                            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                                <div style={{ color: '#10b981', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '4px' }}>
                                    New Replacement Parts ({cart.length}):
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {cart.map((cItem, cIdx) => (
                                        <div key={cIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                                            <span>{cItem.name} <strong>x{cItem.quantity}</strong></span>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                                +{formatCurrency((cItem.price || 0) * cItem.quantity)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#10b981', borderTop: '1px solid var(--border)', paddingTop: '4px', marginTop: '4px' }}>
                                    <span>Total New Items Value:</span>
                                    <span style={{ fontFamily: 'monospace' }}>+{formatCurrency(cartGrossSubtotal)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Top-up Math Summary */}
                        <div style={{
                            padding: '12px 14px',
                            borderRadius: '8px',
                            background: replacementTopUpDue > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)',
                            border: `1px solid rgba(16, 185, 129, 0.3)`,
                            marginBottom: '16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {replacementTopUpDue > 0 ? (
                                        <>
                                            <TrendingUp size={16} color="#10b981" />
                                            <span>Upgrade Top-Up Amount Due:</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={16} color="#10b981" />
                                            <span>Even Value Exchange:</span>
                                        </>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {replacementTopUpDue > 0 ? 'Customer pays the upgrade difference (Cash or GCash)' : 'Even value exchange • No payment required'}
                                </div>
                            </div>
                            <div style={{
                                fontSize: '1.4rem',
                                fontWeight: 900,
                                fontFamily: 'monospace',
                                color: '#10b981'
                            }}>
                                {replacementTopUpDue > 0 ? `+${formatCurrency(replacementTopUpDue)}` : '₱0.00'}
                            </div>
                        </div>

                        {/* If Top-Up Due > 0: Payment Method and Amount Tendered */}
                        {replacementTopUpDue > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                                    Payment Method for Top-Up:
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setSwapPaymentMethod('Cash')}
                                        style={{
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: '1px solid',
                                            borderColor: swapPaymentMethod === 'Cash' ? 'var(--primary)' : 'var(--border)',
                                            background: swapPaymentMethod === 'Cash' ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-hover)',
                                            color: swapPaymentMethod === 'Cash' ? 'var(--primary)' : 'var(--text-main)',
                                            fontWeight: 700,
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Banknote size={16} /> Cash
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSwapPaymentMethod('GCash')}
                                        style={{
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: '1px solid',
                                            borderColor: swapPaymentMethod === 'GCash' ? '#3b82f6' : 'var(--border)',
                                            background: swapPaymentMethod === 'GCash' ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface-hover)',
                                            color: swapPaymentMethod === 'GCash' ? '#3b82f6' : 'var(--text-main)',
                                            fontWeight: 700,
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Smartphone size={16} /> GCash
                                    </button>
                                </div>

                                {swapPaymentMethod === 'Cash' && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                                Amount Tendered:
                                            </label>
                                            {Number(swapTendered) > replacementTopUpDue && (
                                                <span style={{ fontSize: '0.76rem', color: '#10b981', fontWeight: 700 }}>
                                                    Change: {formatCurrency(Number(swapTendered) - replacementTopUpDue)}
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            type="number"
                                            className="input-premium"
                                            style={{ width: '100%', height: '38px', fontSize: '0.95rem', fontWeight: 700 }}
                                            placeholder={`Exact ₱${replacementTopUpDue.toFixed(2)}`}
                                            value={swapTendered}
                                            onChange={(e) => setSwapTendered(e.target.value)}
                                        />
                                        {/* Quick buttons */}
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                            {[
                                                replacementTopUpDue,
                                                Math.ceil(replacementTopUpDue / 100) * 100,
                                                Math.ceil(replacementTopUpDue / 500) * 500,
                                                Math.ceil(replacementTopUpDue / 1000) * 1000,
                                                (Math.floor(replacementTopUpDue / 1000) + 1) * 1000
                                            ].filter((amt, idx, arr) => amt >= replacementTopUpDue && arr.indexOf(amt) === idx && amt > 0).slice(0, 5).map(amt => (
                                                <button
                                                    key={amt}
                                                    type="button"
                                                    onClick={() => setSwapTendered(String(amt))}
                                                    style={{
                                                        padding: '4px 10px',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 700,
                                                        borderRadius: '4px',
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--surface-hover)',
                                                        color: 'var(--text-main)',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ₱{amt.toLocaleString()}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Reason */}
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                Reason for Replacement:
                            </label>
                            <select
                                className="input-premium"
                                value={swapReason}
                                onChange={(e) => setSwapReason(e.target.value)}
                                style={{ width: '100%', height: '36px', fontSize: '0.82rem' }}
                            >
                                <option value="Fitment / Wrong Part Purchased">Fitment / Wrong Part Purchased</option>
                                <option value="Customer Upgrade Preference">Customer Upgrade Preference</option>
                                <option value="Defective / Factory Fault">Defective / Factory Fault</option>
                                <option value="Wrong Color / Variation">Wrong Color / Variation</option>
                                <option value="Other Exchange Reason">Other Exchange Reason</option>
                            </select>
                        </div>

                        {/* Notes */}
                        <div style={{ marginBottom: '18px' }}>
                            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                Notes / Remarks (Optional):
                            </label>
                            <input
                                type="text"
                                className="input-premium"
                                placeholder="e.g. Swapped to larger size belt as requested"
                                value={swapNotes}
                                onChange={(e) => setSwapNotes(e.target.value)}
                                style={{ width: '100%', height: '34px', fontSize: '0.82rem' }}
                            />
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setShowReplacementCheckoutModal(false)}
                                style={{ flex: 1, padding: '10px' }}
                                disabled={submittingSwap}
                            >
                                Back to Cart
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={handleConfirmProcessSwap}
                                disabled={submittingSwap || (replacementTopUpDue > 0 && swapPaymentMethod === 'Cash' && swapTendered && Number(swapTendered) < replacementTopUpDue)}
                                style={{ flex: 1.5, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                            >
                                <CheckCircle2 size={16} />
                                {submittingSwap
                                    ? 'Processing Exchange...'
                                    : (replacementTopUpDue > 0
                                        ? `Confirm & Pay +${formatCurrency(replacementTopUpDue)}`
                                        : 'Confirm & Issue Slip')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* 5. EXCHANGE & REPLACEMENT PRINTABLE SLIP MODAL               */}
            {/* ============================================================ */}
            {showSwapSlipModal && completedSwap && (
                <ExchangeSlipModal
                    isOpen={showSwapSlipModal}
                    swap={completedSwap}
                    onClose={() => {
                        setShowSwapSlipModal(false);
                        setCompletedSwap(null);
                    }}
                />
            )}
        </div>
    );
};

export default POS;
