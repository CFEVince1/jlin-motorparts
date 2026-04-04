import { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { PackagePlus, Edit2, Trash2, ChevronDown, ChevronRight, PlusCircle } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import Spinner from '../components/Spinner';

import { z } from 'zod';

const productSchema = z.object({
    product_name: z.string().min(1, 'Product Name is required'),
    brand: z.string().min(1, 'Brand is required'),
    category: z.string().min(1, 'Category is required'),
    price: z.coerce.number({ required_error: "Price is required", invalid_type_error: "Price must be a number" }).positive('Price must be greater than zero'),
    stock: z.coerce.number({ required_error: "Stock is required", invalid_type_error: "Stock must be a number" }).nonnegative('Stock cannot be negative').int('Stock must be a whole number')
});

const Products = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useContext(AuthContext);

    // Form State
    const [formData, setFormData] = useState({ product_name: '', brand: '', category: '', price: '', stock: 0 });
    const [editingId, setEditingId] = useState(null); // This is variant ID
    const [expandedProducts, setExpandedProducts] = useState(new Set());

    const fetchProducts = async () => {
        try {
            const res = await api.get('/products');
            setProducts(res.data);
        } catch (err) {
            toast.error('Failed to load products');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const toggleExpand = (productId) => {
        const newExpanded = new Set(expandedProducts);
        if (newExpanded.has(productId)) newExpanded.delete(productId);
        else newExpanded.add(productId);
        setExpandedProducts(newExpanded);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Validate data
            const validatedData = productSchema.parse(formData);

            if (editingId) {
                await api.put(`/products/${editingId}`, validatedData);
                toast.success('Variant updated');
            } else {
                await api.post('/products', validatedData);
                toast.success('Product/Variant added');
            }
            setFormData({ product_name: '', brand: '', category: '', price: '', stock: 0 });
            setEditingId(null);
            fetchProducts();
        } catch (err) {
            if (err.errors && Array.isArray(err.errors)) {
                err.errors.forEach(e => toast.error(e.message));
                return;
            }
            toast.error(err.response?.data?.message || 'Action failed');
        }
    };

    const handleDeleteParent = async (id, productName) => {
        if (!window.confirm(`Are you sure you want to delete ${productName} and ALL its variants? This will hide them from the system.`)) return;
        try {
            await api.delete(`/products/parent/${id}`);
            toast.success('Product group deleted');
            fetchProducts();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete product group');
        }
    };

    const handleDeleteVariant = async (id, brand) => {
        if (!window.confirm(`Are you sure you want to delete only the ${brand} variant?`)) return;
        try {
            await api.delete(`/products/${id}`);
            toast.success('Variant deleted');
            fetchProducts();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete variant');
        }
    };

    const handleEditVariant = (parentProduct, variant) => {
        setFormData({
            product_name: parentProduct.product_name,
            category: parentProduct.category,
            brand: variant.brand,
            price: variant.price,
            stock: variant.stock
        });
        setEditingId(variant.id);
    };

    const prefillAddVariant = (parentProduct) => {
        setFormData({
            product_name: parentProduct.product_name,
            category: parentProduct.category,
            brand: '',
            price: '',
            stock: 0
        });
        setEditingId(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const isAdmin = user.role === 'admin';

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>Products & Variants</h1>

            {isAdmin && (
                <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '16px' }}>{editingId ? 'Edit Product Variant' : 'Add New Product / Variant'}</h3>
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                        <input type="text" placeholder="Product Name (e.g. Brake Pad)" className="input-premium" required
                            value={formData.product_name} onChange={e => setFormData({ ...formData, product_name: e.target.value })} disabled={editingId} />
                        <input type="text" placeholder="Brand / Variant" className="input-premium"
                            value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} />
                        <input type="text" placeholder="Category" className="input-premium"
                            value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} disabled={editingId} />
                        <input type="number" placeholder="Price" className="input-premium" required min="0" step="0.01"
                            value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />

                        {!editingId && (
                            <input type="number" placeholder="Initial Stock" className="input-premium" min="0"
                                value={formData.stock} onChange={e => setFormData({ ...formData, stock: e.target.value })} />
                        )}

                        <button type="submit" className="btn-primary" style={{ gridColumn: '1 / -1' }}>
                            <PackagePlus size={20} /> {editingId ? 'Save Variant Changes' : 'Add Product'}
                        </button>

                        {editingId && (
                            <button type="button" className="btn-secondary" style={{ gridColumn: '1 / -1' }} onClick={() => { setEditingId(null); setFormData({ product_name: '', brand: '', category: '', price: '', stock: 0 }) }}>
                                Cancel Edit
                            </button>
                        )}
                    </form>
                </div>
            )}

            <div className="glass-panel" style={{ padding: '0' }}>
                {loading ? (
                    <div style={{ padding: '24px' }}><Spinner text="Loading grouped products..." /></div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {/* Headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: '50px 2fr 1fr 1fr 1fr', background: 'rgba(255,255,255,0.05)', padding: '16px', fontWeight: 'bold' }}>
                            <div></div>
                            <div>Product Name</div>
                            <div>Category</div>
                            <div>Total Variants</div>
                            {isAdmin && <div style={{ textAlign: 'right' }}>Actions</div>}
                        </div>
                        
                        {/* Parent Rows */}
                        {products.map(p => {
                            const isExpanded = expandedProducts.has(p.id);
                            const totalStock = p.variants.reduce((sum, v) => sum + v.stock, 0);

                            return (
                                <div key={p.id}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '50px 2fr 1fr 1fr 1fr', padding: '16px', borderTop: '1px solid var(--border)', alignItems: 'center', background: isExpanded ? 'rgba(255, 59, 48, 0.05)' : 'transparent', transition: 'background 0.2s', cursor: 'pointer' }} onClick={() => toggleExpand(p.id)}>
                                        <div style={{ color: 'var(--text-muted)' }}>
                                            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                        </div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{p.product_name}</div>
                                        <div style={{ color: 'var(--text-muted)' }}>{p.category}</div>
                                        <div style={{ color: 'var(--primary)' }}>{p.variants.length} Brands ({totalStock} items)</div>
                                        
                                        {isAdmin && (
                                            <div style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                                                <button onClick={() => prefillAddVariant(p)} style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} title="Add Variant">
                                                    <PlusCircle size={18} />
                                                </button>
                                                <button onClick={() => handleDeleteParent(p.id, p.product_name)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }} title="Delete Entire Group">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Variant Sub-rows */}
                                    {isExpanded && (
                                        <div style={{ background: 'rgba(0,0,0,0.1)', padding: '0 16px 16px 66px' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                <div>Brand / Variant</div>
                                                <div>Price</div>
                                                <div>Stock</div>
                                                {isAdmin && <div style={{ textAlign: 'right' }}>Actions</div>}
                                            </div>
                                            {p.variants.map(v => (
                                                <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.02)', alignItems: 'center' }}>
                                                    <div style={{ fontWeight: '500' }}>{v.brand}</div>
                                                    <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>₱{Number(v.price).toFixed(2)}</div>
                                                    <div style={{ color: v.stock <= 5 ? 'var(--danger)' : 'var(--success)' }}>{v.stock} in stock</div>
                                                    
                                                    {isAdmin && (
                                                        <div style={{ textAlign: 'right', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                                            <button onClick={() => handleEditVariant(p, v)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }} title="Edit Variant">
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button onClick={() => handleDeleteVariant(v.id, v.brand)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title="Remove Variant">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {products.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No products in database.</div>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Products;
