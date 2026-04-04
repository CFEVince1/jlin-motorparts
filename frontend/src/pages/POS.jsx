import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ShoppingCart, Printer, Search, Plus, Minus, Trash2, CheckCircle2, X, AlertCircle } from 'lucide-react';

const POS = () => {
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Receipt & Confirmation Modal State
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastTransaction, setLastTransaction] = useState(null);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await api.get('/products');
                const flatVariants = [];
                res.data.forEach(p => {
                    p.variants.forEach(v => {
                        if (v.stock > 0) {
                            flatVariants.push({
                                ...v,
                                product_name: p.product_name,
                                category: p.category
                            });
                        }
                    });
                });
                setProducts(flatVariants);
            } catch (err) {
                toast.error('Failed to load products');
            }
        };
        fetchProducts();
    }, []);

    const filteredProducts = products.filter(p =>
        p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.brand?.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
                items: cart.map(item => ({ variant_id: item.product_id, quantity: item.quantity }))
            };

            const res = await api.post('/sales', payload);
            toast.success('Transaction Completed!');

            // Save details for the receipt modal
            setLastTransaction({
                id: res.data.sale_id,
                date: new Date(),
                items: [...cart],
                total: totalAmount
            });

            // Refresh products
            const resProducts = await api.get('/products');
            const flatVariants = [];
            resProducts.data.forEach(p => {
                p.variants.forEach(v => {
                    if (v.stock > 0) {
                        flatVariants.push({ ...v, product_name: p.product_name, category: p.category });
                    }
                });
            });
            setProducts(flatVariants);
            
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
    };

    return (
        <div style={{ display: 'flex', height: '100%', gap: '24px', position: 'relative' }}>
            
            {/* PRODUCT SELECTION AREA */}
            <div className="no-print" style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h1 style={{ marginBottom: '8px' }}>Point of Sale</h1>
                <div style={{ position: 'relative' }}>
                    <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="text" placeholder="Search parts or brand..." className="input-premium" style={{ paddingLeft: '48px', height: '50px', fontSize: '1.1rem' }} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', overflowY: 'auto', paddingBottom: '24px' }}>
                    {filteredProducts.map(p => (
                        <div key={p.id} className="glass-panel" style={{ padding: '16px', cursor: 'pointer', transition: 'transform 0.2s', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid rgba(255, 59, 48, 0.2)' }} onClick={() => addToCart(p)}>
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
            <div className="glass-panel no-print" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0' }}>
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
                                        <span style={{ width: '20px', textAlign: 'center' }}>{item.quantity}</span>
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
                        <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '1.1rem' }}>
                            Finalize this sale for <br/>
                            <strong style={{ color: 'var(--primary)', fontSize: '1.8rem', display: 'block', marginTop: '8px' }}>₱{totalAmount.toFixed(2)}</strong>
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => setShowConfirmModal(false)}>
                                Cancel
                            </button>
                            <button className="btn-primary" style={{ flex: 1, padding: '12px' }} onClick={processPayment}>
                                Confirm & Pay
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* RECEIPT MODAL (Only this prints!) */}
            {showReceipt && lastTransaction && (
                <div className="receipt-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div id="printable-receipt" className="glass-panel" style={{ background: 'white', color: 'black', padding: '40px', width: '400px', borderRadius: '8px', position: 'relative' }}>
                        
                        <button className="no-print" onClick={closeReceipt} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>
                            <X size={24} />
                        </button>

                        <div style={{ textAlign: 'center', borderBottom: '2px dashed #ccc', paddingBottom: '16px', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0 }}>JLIN Motorparts</h2>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem', color: '#666' }}>Official Receipt</p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '16px' }}>
                                <span>Receipt #: {lastTransaction.id}</span>
                                <span>{lastTransaction.date.toLocaleDateString()} {lastTransaction.date.toLocaleTimeString()}</span>
                            </div>
                        </div>

                        <table style={{ width: '100%', marginBottom: '16px', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #eee' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 0', background: 'transparent', color: 'black' }}>Item</th>
                                    <th style={{ textAlign: 'center', padding: '8px 0', background: 'transparent', color: 'black' }}>Qty</th>
                                    <th style={{ textAlign: 'right', padding: '8px 0', background: 'transparent', color: 'black' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lastTransaction.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={{ padding: '8px 0', borderBottom: 'none' }}>
                                            <div>{item.name}</div>
                                            <div style={{ fontSize: '0.8em', color: '#666' }}>{item.brand}</div>
                                        </td>
                                        <td style={{ padding: '8px 0', textAlign: 'center', borderBottom: 'none' }}>{item.quantity}</td>
                                        <td style={{ padding: '8px 0', textAlign: 'right', borderBottom: 'none' }}>₱{item.subtotal.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ borderTop: '2px dashed #ccc', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.2rem' }}>
                            <span>TOTAL</span>
                            <span>₱{lastTransaction.total.toFixed(2)}</span>
                        </div>

                        <div className="no-print" style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
                            <button className="btn-primary" style={{ flex: 1, padding: '12px' }} onClick={handlePrint}>
                                <Printer size={20} /> Print
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
          @media print {
            body { background: white; color: black; }
            .no-print { display: none !important; }
            #printable-receipt { 
                position: absolute; 
                left: 0; 
                top: 0; 
                width: 100%; 
                box-shadow: none; 
                border: none; 
                background: white;
                padding: 0 !important;
            }
            .receipt-overlay { background: transparent !important; }
          }
        `}
            </style>
        </div>
    );
};

export default POS;
