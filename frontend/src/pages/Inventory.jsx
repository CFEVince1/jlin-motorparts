import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import Spinner from '../components/Spinner';

const Inventory = () => {
    const [products, setProducts] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState('');
    const [quantity, setQuantity] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchInventory = async () => {
        try {
            const res = await api.get('/inventory');
            setProducts(res.data);
        } catch (err) {
            toast.error('Failed to load inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInventory();
    }, []);

    const handleStockAction = async (action) => {
        if (!selectedProduct || !quantity || quantity <= 0) {
            return toast.error('Please select a product and enter valid quantity');
        }

        try {
            await api.post(`/inventory/stock-${action}`, {
                product_id: selectedProduct,
                quantity: Number(quantity)
            });
            toast.success(`Stock ${action === 'in' ? 'added' : 'deducted'} successfully`);
            setQuantity('');
            fetchInventory();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Action failed');
        }
    };

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>Inventory Management</h1>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>

                {/* Actions Panel */}
                <div className="glass-panel" style={{ padding: '24px', height: 'fit-content' }}>
                    <h3 style={{ marginBottom: '16px' }}>Adjust Stock</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <select
                            className="input-premium"
                            value={selectedProduct}
                            onChange={e => setSelectedProduct(e.target.value)}
                            style={{ background: 'var(--surface)' }}
                        >
                            <option value="">Select Product...</option>
                            {products.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.product_name} ({p.brand}) - Stock: {p.stock}
                                </option>
                            ))}
                        </select>

                        <input
                            type="number"
                            placeholder="Quantity"
                            className="input-premium"
                            min="1"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                        />

                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                className="btn-primary"
                                style={{ flex: 1, background: 'linear-gradient(135deg, var(--success) 0%, #28a745 100%)' }}
                                onClick={() => handleStockAction('in')}
                            >
                                <ArrowUpCircle size={20} /> Stock In
                            </button>

                            <button
                                className="btn-primary"
                                style={{ flex: 1 }}
                                onClick={() => handleStockAction('out')}
                            >
                                <ArrowDownCircle size={20} /> Stock Out
                            </button>
                        </div>
                    </div>
                </div>

                {/* Inventory List */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ marginBottom: '16px' }}>Current Stock Levels</h3>
                    {loading ? <Spinner text="Loading inventory..." /> : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Brand</th>
                                        <th>Price</th>
                                        <th>Stock Level</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map(p => (
                                        <tr key={p.id}>
                                            <td>{p.product_name}</td>
                                            <td>{p.brand}</td>
                                            <td>₱{Number(p.price).toFixed(2)}</td>
                                            <td style={{
                                                color: p.stock <= 5 ? 'var(--danger)' : 'var(--success)',
                                                fontWeight: 'bold',
                                                fontSize: '1.1rem'
                                            }}>
                                                {p.stock}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default Inventory;
