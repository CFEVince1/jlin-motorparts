import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ShoppingCart, Printer, Search, Plus, Minus, Trash2, CheckCircle2, X, AlertCircle, Banknote, CreditCard, Smartphone } from 'lucide-react';

const POS = () => {
    const { user } = useContext(AuthContext);
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Receipt & Confirmation Modal State
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastTransaction, setLastTransaction] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [tenderedAmount, setTenderedAmount] = useState('');
    const [category, setCategory] = useState('All');
    const [brandFilter, setBrandFilter] = useState('All');
    const [typeFilter, setTypeFilter] = useState('All');
    const [customerName, setCustomerName] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await api.get('/products');
                const activeProducts = res.data.filter(p => p.stock > 0);
                setProducts(activeProducts);
            } catch (err) {
                toast.error('Failed to load products');
            }
        };
        fetchProducts();
    }, []);

    const uniqueCategories = [...new Set(products.map(product => product.category))];
    const uniqueBrands = ['All', ...new Set(products.map(product => product.brand).filter(Boolean))];

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) || p.brand?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = category === 'All' || p.category === category;
        const matchesBrand = brandFilter === 'All' || p.brand === brandFilter;
        
        let matchesType = true;
        if (typeFilter === 'Serialized') matchesType = p.is_serialized === 1 || p.is_serialized === true;
        if (typeFilter === 'Bulk') matchesType = p.is_serialized === 0 || p.is_serialized === false;

        return matchesSearch && matchesCategory && matchesBrand && matchesType;
    });

    const addToCart = (product) => {
        const existing = cart.find(item => item.product_id === product.id);
        if (existing) {
            if (existing.quantity >= product.stock) {
                return toast.error('Cannot exceed available stock');
            }
            setCart(cart.map(item =>
                item.product_id === product.id
                    ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price }
                    : item
            ));
        } else {
            setCart([...cart, {
                product_id: product.id,
                name: product.product_name,
                brand: product.brand,
                price: Number(product.price),
                quantity: 1,
                subtotal: Number(product.price),
                maxStock: product.stock
            }]);
        }
    };

    const updateQuantity = (id, delta) => {
        setCart(cart.map(item => {
            if (item.product_id === id) {
                const newQuantity = item.quantity + delta;
                if (newQuantity <= 0) return item;
                if (newQuantity > item.maxStock) {
                    toast.error('Cannot exceed available stock');
                    return item;
                }
                return { ...item, quantity: newQuantity, subtotal: newQuantity * item.price };
            }
            return item;
        }));
    };

    const setQuantityDirect = (id, newQuantity) => {
        setCart(cart.map(item => {
            if (item.product_id === id) {
                let qty = parseInt(newQuantity);
                if (isNaN(qty) || qty < 1) qty = 1;
                if (qty > item.maxStock) {
                    toast.error('Cannot exceed available stock');
                    qty = item.maxStock;
                }
                return { ...item, quantity: qty, subtotal: qty * item.price };
            }
            return item;
        }));
    };

    const removeFromCart = (id) => setCart(cart.filter(item => item.product_id !== id));
    
    const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);

    // 1. Trigger the confirmation modal
    const handleCheckoutClick = () => {
        if (cart.length === 0) return toast.error('Cart is empty');
        setShowConfirmModal(true);
    };

    // 2. Process the actual payment after confirmation
    const processPayment = async () => {
        setShowConfirmModal(false); // Close the confirm modal
        
        try {
            const payload = {
                items: cart.map(item => ({ variant_id: item.product_id, quantity: item.quantity })),
                payment_method: paymentMethod,
                tendered_amount: Number(tenderedAmount) || 0
            };

            const res = await api.post('/sales', payload);
            toast.success('Transaction Completed!');

            // Save details for the receipt modal
            setLastTransaction({
                id: res.data.sale_id,
                date: new Date(),
                items: [...cart],
                total: totalAmount,
                paymentMethod: paymentMethod,
                tenderedAmount: res.data.tendered_amount,
                changeDue: res.data.change_due,
                customerName,
                customerAddress,
                cashier: user.username
            });

            // Refresh products
            const resProducts = await api.get('/products');
            const activeProducts = resProducts.data.filter(p => p.stock > 0);
            setProducts(activeProducts);
            
            // Clear cart & show receipt
            setCart([]);
            setShowReceipt(true);

        } catch (err) {
            toast.error(err.response?.data?.message || 'Transaction failed');
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

    return (
        <div className="main-layout" style={{ display: 'flex', height: '100%', gap: '24px', position: 'relative' }}>
            
            {/* PRODUCT SELECTION AREA */}
            <div className="no-print" style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h1 style={{ marginBottom: '8px' }}>Point of Sale</h1>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 250px' }}>
                        <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input type="text" placeholder="Search parts or brand..." className="input-premium" style={{ paddingLeft: '48px', height: '50px', fontSize: '1.1rem', width: '100%' }} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <div style={{ flex: '1 1 150px' }}>
                        <select className="input-premium" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} style={{ width: '100%', height: '50px', background: 'var(--surface)', cursor: 'pointer' }}>
                            {uniqueBrands.map(brand => (
                                <option key={brand} value={brand}>{brand === 'All' ? 'All Brands' : brand}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: '1 1 150px' }}>
                        <select value={category} onChange={e => setCategory(e.target.value)} className="input-premium" style={{ width: '100%', height: '50px', background: 'var(--surface)', cursor: 'pointer' }}>
                            <option value="All">All Categories</option>
                            {uniqueCategories.map((cat, index) => (
                                cat ? <option key={index} value={cat}>{cat}</option> : null
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: '1 1 150px' }}>
                        <select className="input-premium" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: '100%', height: '50px', background: 'var(--surface)', cursor: 'pointer' }}>
                            <option value="All">All Types</option>
                            <option value="Bulk">Bulk Only</option>
                            <option value="Serialized">Serialized Only</option>
                        </select>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', overflowY: 'auto', paddingBottom: '24px' }}>
                    {filteredProducts.map(p => (
                        <div key={p.id} className="glass-panel" style={{ padding: '16px', cursor: 'pointer', transition: 'transform 0.2s', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid rgba(255, 255, 255, 0.2)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }} onClick={() => addToCart(p)}>
                            <div>
                                <div style={{ fontWeight: '600', marginBottom: '4px', fontSize: '1.1rem' }}>{p.product_name}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.brand}</div>
                            </div>
                            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                <div style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.2rem' }}>₱{Number(p.price).toFixed(2)}</div>
                                <div style={{ fontSize: '0.8rem', color: p.stock <= 5 ? 'var(--danger)' : 'var(--success)' }}>Stock: {p.stock}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* CART AREA */}
            <div className="glass-panel no-print cart-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0', minHeight: '500px' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '16px 16px 0 0' }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', m: 0 }}><ShoppingCart /> Current Order</h2>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                    {cart.length === 0 ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Order is empty</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {cart.map(item => (
                                <div key={item.product_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '500' }}>{item.name} <span style={{fontSize: '0.8em', color: 'var(--text-muted)'}}>({item.brand})</span></div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>₱{item.price.toFixed(2)}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button onClick={() => updateQuantity(item.product_id, -1)} style={{ background: 'var(--surface)', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '4px', cursor: 'pointer' }}><Minus size={14} style={{margin:'auto'}}/></button>
                                        <input type="number" min="1" max={item.maxStock} value={item.quantity} onChange={(e) => setQuantityDirect(item.product_id, e.target.value)} style={{ width: '48px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', color: 'white', borderRadius: '4px', padding: '4px', fontSize: '0.9rem' }} />
                                        <button onClick={() => updateQuantity(item.product_id, 1)} style={{ background: 'var(--surface)', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '4px', cursor: 'pointer' }}><Plus size={14} style={{margin:'auto'}}/></button>
                                    </div>
                                    <div style={{ width: '80px', textAlign: 'right', fontWeight: 'bold' }}>₱{item.subtotal.toFixed(2)}</div>
                                    <button onClick={() => removeFromCart(item.product_id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '8px' }}><Trash2 size={16} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div style={{ padding: '24px', background: 'var(--surface)', borderRadius: '0 0 16px 16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', fontSize: '1.2rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Total Amount</span>
                        <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '1.8rem' }}>₱{totalAmount.toFixed(2)}</span>
                    </div>
                    <button className="btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }} onClick={handleCheckoutClick} disabled={cart.length === 0}>
                        <CheckCircle2 size={20} /> Complete Payment
                    </button>
                </div>
            </div>

            {/* CONFIRMATION MODAL */}
            {showConfirmModal && (
                <div className="receipt-overlay no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="glass-panel" style={{ background: 'var(--surface)', padding: '32px', width: '400px', borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', color: 'var(--accent)' }}>
                            <AlertCircle size={48} />
                        </div>
                        <h2 style={{ marginBottom: '8px' }}>Confirm Payment</h2>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', textAlign: 'left' }}>
                            <h4 style={{ margin: '0 0 4px 0', color: 'var(--text-muted)' }}>Customer Details (For Receipt)</h4>
                            <input type="text" placeholder="Customer Name (Optional)" className="input-premium" style={{ padding: '12px' }} value={customerName} onChange={e => setCustomerName(e.target.value)} />
                            <input type="text" placeholder="Address (Optional)" className="input-premium" style={{ padding: '12px' }} value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
                        </div>

                        <div style={{ margin: '16px 0' }}>
                            <button onClick={() => setPaymentMethod('Cash')} style={{ width: '100%', padding: '16px', borderRadius: '8px', border: '2px solid var(--primary)', background: 'rgba(255, 59, 48, 0.1)', color: 'var(--primary)', cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                                <Banknote size={24} />
                                <span style={{ fontWeight: '600', fontSize: '1.2rem' }}>Cash Payment</span>
                            </button>
                        </div>
                        
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                                <span>Total Amount:</span>
                                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>₱{totalAmount.toFixed(2)}</span>
                            </div>
                            
                            {paymentMethod === 'Cash' && (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Amount Tendered:</span>
                                        <div style={{ position: 'relative' }}>
                                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text)' }}>₱</span>
                                            <input type="number" min={totalAmount} value={tenderedAmount} onChange={(e) => setTenderedAmount(e.target.value)} style={{ padding: '8px 12px 8px 28px', width: '120px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'white', fontSize: '1.1rem', textAlign: 'right' }} autoFocus />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Change Due:</span>
                                        <span style={{ fontWeight: 'bold', color: tenderedAmount >= totalAmount ? 'var(--success)' : 'var(--danger)' }}>
                                            ₱{tenderedAmount ? Math.max(0, tenderedAmount - totalAmount).toFixed(2) : '0.00'}
                                        </span>
                                    </div>
                                    {tenderedAmount !== '' && tenderedAmount < totalAmount && (
                                        <div style={{ color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'right', marginTop: '4px' }}>
                                            Insufficient amount
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => setShowConfirmModal(false)}>
                                Cancel
                            </button>
                            <button className="btn-primary" style={{ flex: 1, padding: '12px' }} onClick={processPayment} disabled={paymentMethod === 'Cash' && (tenderedAmount === '' || Number(tenderedAmount) < totalAmount)}>
                                Confirm & Pay
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* RECEIPT MODAL */}
            {showReceipt && lastTransaction && (
                <div className="receipt-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '50px', overflowY: 'auto' }}>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <button className="no-print" onClick={closeReceipt} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>
                            <X size={24} />
                        </button>

                        <div id="printable-receipt" className="receipt-container">
                            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>JLIN Motorparts</h2>
                                <p style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>123 Dummy Address St.</p>
                                <p style={{ margin: '0', fontSize: '0.85rem' }}>Contact: +63 900 123 4567</p>
                                <p style={{ margin: '5px 0 0', fontWeight: 'bold' }}>OFFICIAL RECEIPT</p>
                            </div>

                            <div style={{ fontSize: '0.85rem', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px dashed #000' }}>
                                <div><strong>Receipt No:</strong> {lastTransaction.id}</div>
                                <div><strong>Date:</strong> {lastTransaction.date.toLocaleDateString()} {lastTransaction.date.toLocaleTimeString()}</div>
                                <div><strong>Cashier:</strong> {lastTransaction.cashier}</div>
                                {(lastTransaction.customerName || lastTransaction.customerAddress) && (
                                    <div style={{ marginTop: '5px' }}>
                                        <div><strong>Customer:</strong> {lastTransaction.customerName || 'Walk-in'}</div>
                                        <div><strong>Address:</strong> {lastTransaction.customerAddress || 'N/A'}</div>
                                    </div>
                                )}
                            </div>

                            <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'left', marginBottom: '10px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #000' }}>
                                        <th style={{ padding: '4px 0' }}>Item</th>
                                        <th style={{ padding: '4px 0', textAlign: 'center' }}>Qty</th>
                                        <th style={{ padding: '4px 0', textAlign: 'right' }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lastTransaction.items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td style={{ padding: '4px 0' }}>
                                                <div>{item.name}</div>
                                                <div style={{ fontSize: '0.8em' }}>{item.brand}</div>
                                            </td>
                                            <td style={{ padding: '4px 0', textAlign: 'center' }}>{item.quantity}</td>
                                            <td style={{ padding: '4px 0', textAlign: 'right' }}>₱{item.subtotal.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div style={{ borderTop: '1px dashed #000', paddingTop: '10px', fontSize: '0.85rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1rem', marginBottom: '5px' }}>
                                    <span>TOTAL</span>
                                    <span>₱{lastTransaction.total.toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Payment Method:</span>
                                    <span>{lastTransaction.paymentMethod}</span>
                                </div>
                                {lastTransaction.paymentMethod === 'Cash' && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Tendered:</span>
                                            <span>₱{lastTransaction.tenderedAmount.toFixed(2)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Change:</span>
                                            <span>₱{lastTransaction.changeDue.toFixed(2)}</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                Thank you for shopping with us!
                            </div>
                        </div>

                        <div className="no-print" style={{ marginTop: '20px', display: 'flex', gap: '12px', width: '100%', maxWidth: '300px' }}>
                            <button className="btn-primary" style={{ flex: 1, padding: '12px' }} onClick={handlePrint}>
                                <Printer size={20} /> Print Receipt
                            </button>
                            <button className="btn-secondary" style={{ flex: 1, padding: '12px', background: '#eee', color: '#333' }} onClick={closeReceipt}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>
                {`
    /* Hide the receipt on screen by default (unless in the modal) */
    .receipt-container {
        display: none;
    }

    /* When in the modal, show it */
    .receipt-modal .receipt-container {
        display: block;
        width: 210px; /* Adjusted for 58mm thermal paper */
        margin: 0 auto;
        font-family: monospace;
        font-size: 11px; /* Slightly smaller font to fit narrow width */
        color: black;
        background: white;
        padding: 10px; /* Reduced padding */
    }

    /* The Magic Print Rules */
    @media print {
        /* Hide everything in the app */
        body * {
            visibility: hidden;
        }

        /* Only show the receipt */
        #printable-receipt, #printable-receipt * {
            visibility: visible;
        }

        /* Position the receipt at the absolute top left of the paper */
        #printable-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 58mm; /* Explicitly set to 58mm hardware size */
            max-width: 210px; /* Fallback for browsers */
            margin: 0;
            padding: 0;
            font-size: 11px; /* Ensure font scales down */
        }

        /* Ensure tables inside the receipt don't stretch too wide */
        #printable-receipt table {
            width: 100%;
            table-layout: fixed; /* Forces text to wrap instead of stretching the table */
        }

        #printable-receipt td, #printable-receipt th {
            word-wrap: break-word; /* Prevents long product names from breaking the layout */
        }

        /* Ensure backgrounds print correctly (often disabled by default in browsers) */
        * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
    }
`}
            </style>
        </div>
    );
};

export default POS;
