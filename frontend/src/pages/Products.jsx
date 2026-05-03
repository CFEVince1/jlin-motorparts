import { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { PackagePlus, Trash2, Edit2, Search } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import Spinner from '../components/Spinner';

const formatSKU = (category, id) => {
    if (!category) return `PRT-${String(id).padStart(4, '0')}`;
    return `${category.substring(0, 3).toUpperCase()}-${String(id).padStart(4, '0')}`;
};

const Products = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useContext(AuthContext);

    const initialFormState = { 
        name: '', 
        brand: '',
        category: '', 
        cost_price: '',
        selling_price: '', 
        stock: '', 
        is_serialized: false, 
        serial_numbers: ''
    };
    
    const [formData, setFormData] = useState(initialFormState);
    const [editingId, setEditingId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [brandFilter, setBrandFilter] = useState('All');
    const [typeFilter, setTypeFilter] = useState('All');

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Format payload for the new backend
            const payload = {
                name: formData.name,
                brand: formData.brand,
                category: formData.category,
                cost_price: Number(formData.cost_price) || 0,
                selling_price: Number(formData.selling_price),
                reorder_level: Number(formData.reorder_level) || 5,
                is_serialized: formData.is_serialized,
                stock: Number(formData.stock)
            };

            // Process serial numbers if the item is serialized
            if (formData.is_serialized) {
                const serialsArray = formData.serial_numbers
                    .split(/[\n,]+/)
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                
                payload.serial_numbers = serialsArray;
                payload.stock = serialsArray.length; // Override stock with exact serial count
            }

            if (editingId) {
                await api.put(`/products/${editingId}`, payload);
                toast.success('Product updated successfully');
            } else {
                await api.post('/products', payload);
                toast.success('Product added successfully');
            }
            
            setFormData(initialFormState);
            setEditingId(null);
            fetchProducts();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Action failed');
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete ${name}? This will hide it from the system.`)) return;
        try {
            await api.delete(`/products/${id}`);
            toast.success('Product deleted');
            fetchProducts();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete product');
        }
    };

    const handleEdit = (product) => {
        setFormData({
            name: product.product_name, 
            brand: product.brand || '',
            category: product.category,
            selling_price: product.price, 
            stock: product.stock,
            is_serialized: product.is_serialized === 1,
            serial_numbers: '' // We don't allow editing serials directly from here yet
        });
        setEditingId(product.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const isAdmin = user.role === 'admin';
    
    const uniqueCategories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
    const uniqueBrands = ['All', ...new Set(products.map(p => p.brand).filter(Boolean))];
    
    const filteredProducts = products.filter(p => {
        const matchesSearch = p.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.brand?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
        const matchesBrand = brandFilter === 'All' || p.brand === brandFilter;
        
        let matchesType = true;
        if (typeFilter === 'Serialized') matchesType = p.is_serialized === 1 || p.is_serialized === true;
        if (typeFilter === 'Bulk') matchesType = p.is_serialized === 0 || p.is_serialized === false;

        return matchesSearch && matchesCategory && matchesBrand && matchesType;
    });

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>Products Directory</h1>

            {isAdmin && (
                <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <PackagePlus size={20} /> {editingId ? 'Edit Product' : 'Add New Product'}
                    </h3>
                    
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                            <input type="text" placeholder="Product Name" className="input-premium" required
                                value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            
                            <input type="text" placeholder="Brand" className="input-premium" required
                                value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} />
                            
                            <input type="text" placeholder="Category (e.g. Engine, Tires)" className="input-premium" required
                                value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} />
                            
                            <input type="number" placeholder="Selling Price (₱)" className="input-premium" required min="0" step="0.01"
                                value={formData.selling_price} onChange={e => setFormData({ ...formData, selling_price: e.target.value })} />
                            
                            <div className="form-group">
                                <label>Cost Price (₱)</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    min="0" 
                                    placeholder="Enter cost price" 
                                    className="input-premium"
                                    value={formData.cost_price} 
                                    onChange={e => setFormData({ ...formData, cost_price: e.target.value })} 
                                    required 
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', flexWrap: 'wrap' }}>
                                <label style={{ color: 'var(--text-muted)' }}>Type:</label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="radio" name="product_type" checked={!formData.is_serialized} onChange={() => setFormData({ ...formData, is_serialized: false, serial_numbers: '' })} style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }} disabled={editingId !== null} />
                                    Bulk
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="radio" name="product_type" checked={formData.is_serialized} onChange={() => setFormData({ ...formData, is_serialized: true })} style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }} disabled={editingId !== null} />
                                    Serialized
                                </label>
                            </div>
                            <input type="number" placeholder="Stock Level" className="input-premium" required min="0"
                                disabled={formData.is_serialized}
                                style={{ width: '200px', opacity: formData.is_serialized ? 0.5 : 1, cursor: formData.is_serialized ? 'not-allowed' : 'text' }}
                                value={formData.is_serialized ? '' : formData.stock} 
                                onChange={e => setFormData({ ...formData, stock: e.target.value })} />
                        </div>

                        {formData.is_serialized && !editingId && (
                            <div style={{ padding: '16px', background: 'rgba(255, 214, 10, 0.05)', borderRadius: '8px', border: '1px solid rgba(255, 214, 10, 0.2)' }}>
                                <label style={{ color: 'var(--accent)', marginBottom: '8px', display: 'block' }}>Serial Numbers (Comma separated or one per line) *</label>
                                <textarea 
                                    placeholder="e.g., SN001, SN002, SN003"
                                    className="input-premium"
                                    style={{ height: '80px', resize: 'vertical' }}
                                    required
                                    value={formData.serial_numbers}
                                    onChange={e => setFormData({ ...formData, serial_numbers: e.target.value })}
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button type="submit" className="btn-primary">
                                {editingId ? 'Save Changes' : 'Add to Catalog'}
                            </button>

                            {editingId && (
                                <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setFormData(initialFormState); }}>
                                    Cancel Edit
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            )}

            <div className="responsive-filter-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 250px' }}>
                    <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="text" className="input-premium" placeholder="Search products by Parts No., name or brand..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ paddingLeft: '48px', width: '100%' }} />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                    <select className="input-premium" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                        {uniqueBrands.map(brand => (
                            <option key={brand} value={brand}>{brand === 'All' ? 'All Brands' : brand}</option>
                        ))}
                    </select>
                </div>
                <div style={{ flex: '1 1 150px' }}>
                    <select className="input-premium" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                        {uniqueCategories.map(cat => (
                            <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>
                        ))}
                    </select>
                </div>
                <div style={{ flex: '1 1 150px' }}>
                    <select className="input-premium" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                        <option value="All">All Types</option>
                        <option value="Bulk">Bulk Only</option>
                        <option value="Serialized">Serialized Only</option>
                    </select>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: '0' }}>
                {loading ? (
                    <div style={{ padding: '24px' }}><Spinner text="Loading catalog..." /></div>
                ) : (
                    <div className="table-container" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Parts No.</th>
                                    <th>Product Name</th>
                                    <th>Brand</th>
                                    <th>Category</th>
                                    <th>Price</th>
                                    <th>Stock</th>
                                    <th>Type</th>
                                    {isAdmin && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.length > 0 ? filteredProducts.map(p => (
                                    <tr key={p.id}>
                                        <td style={{ color: 'var(--text-muted)', fontWeight: '500' }}>{formatSKU(p.category, p.id)}</td>
                                        <td style={{ fontWeight: '500' }}>{p.product_name}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{p.brand}</td>
                                        <td>{p.category}</td>
                                        <td style={{ color: 'var(--primary)', fontWeight: 'bold' }}>₱{Number(p.price).toFixed(2)}</td>
                                        <td style={{ color: p.stock <= p.reorder_level ? 'var(--danger)' : 'var(--success)', fontWeight: 'bold' }}>
                                            {p.stock}
                                        </td>
                                        <td>
                                            <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', background: p.is_serialized ? 'rgba(255, 214, 10, 0.2)' : 'rgba(255, 255, 255, 0.1)', color: p.is_serialized ? 'var(--accent)' : 'var(--text-main)' }}>
                                                {p.is_serialized ? 'Serialized' : 'Bulk'}
                                            </span>
                                        </td>
                                        {isAdmin && (
                                            <td style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={() => handleEdit(p)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}><Edit2 size={18} /></button>
                                                <button onClick={() => handleDelete(p.id, p.product_name)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                            </td>
                                        )}
                                    </tr>
                                )) : (
                                    <tr><td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No products found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Products;
