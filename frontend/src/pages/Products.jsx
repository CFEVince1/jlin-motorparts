import { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { PackagePlus, Trash2, Edit2, Search } from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';
import Spinner from '../components/Spinner';
import { filterProducts } from '../utils/productFilter';
import useDebouncedValue from '../hooks/useDebouncedValue';

const formatMotorcycleUnit = (unit) => `${unit.brand} ${unit.model} ${unit.year_model || ''}`.trim();

const Products = () => {
    const [products, setProducts] = useState([]);
    const [motorcycleUnits, setMotorcycleUnits] = useState([]);
    const [compatibilityGroups, setCompatibilityGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useContext(AuthContext);

    const initialFormState = {
        part_number: '',
        name: '',
        brand: '',
        category: '',
        size: '',
        measurement: '',
        thread_type: '',
        cost_price: '',
        selling_price: '',
        reorder_level: '',
        stock: '',
        is_serialized: false,
        serial_numbers: '',
        motorcycle_unit_ids: [],
        compatibility_group_ids: []
    };

    const [formData, setFormData] = useState(initialFormState);
    const [editingId, setEditingId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [brandFilter, setBrandFilter] = useState('All');
    const [typeFilter, setTypeFilter] = useState('All');
    const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);

    const fetchProducts = async () => {
        try {
            const res = await api.get('/products');
            setProducts(res.data);
        } catch {
            toast.error('Failed to load products');
        } finally {
            setLoading(false);
        }
    };

    const fetchMotorcycleUnits = async () => {
        try {
            const res = await api.get('/products/motorcycle-units');
            setMotorcycleUnits(res.data);
        } catch {
            toast.error('Failed to load motorcycle units');
        }
    };

    const fetchCompatibilityGroups = async () => {
        try {
            const res = await api.get('/products/compatibility-groups');
            setCompatibilityGroups(res.data);
        } catch {
            toast.error('Failed to load compatibility groups');
        }
    };

    useEffect(() => {
        fetchProducts();
        fetchMotorcycleUnits();
        fetchCompatibilityGroups();
    }, []);

    const toggleMotorcycleUnit = (unitId) => {
        const numericId = Number(unitId);
        const selected = formData.motorcycle_unit_ids.map(Number);

        setFormData({
            ...formData,
            motorcycle_unit_ids: selected.includes(numericId)
                ? selected.filter(id => id !== numericId)
                : [...selected, numericId]
        });
    };

    const toggleCompatibilityGroup = (groupId) => {
        const numericId = Number(groupId);
        const selected = formData.compatibility_group_ids.map(Number);

        setFormData({
            ...formData,
            compatibility_group_ids: selected.includes(numericId)
                ? selected.filter(id => id !== numericId)
                : [...selected, numericId]
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Format payload for the new backend
            const payload = {
                part_number: formData.part_number,
                name: formData.name,
                brand: formData.brand,
                category: formData.category,
                size: formData.size,
                measurement: formData.measurement,
                thread_type: formData.thread_type,
                cost_price: Number(formData.cost_price),
                selling_price: Number(formData.selling_price),
                reorder_level: Number(formData.reorder_level),
                is_serialized: formData.is_serialized,
                stock: Number(formData.stock),
                motorcycle_unit_ids: formData.motorcycle_unit_ids.map(Number),
                compatibility_group_ids: formData.compatibility_group_ids.map(Number)
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
            toast.error(err.response?.data?.message || err.response?.data?.error || 'Action failed');
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
            part_number: product.part_number || '',
            name: product.product_name,
            brand: product.brand || '',
            category: product.category,
            size: product.size || '',
            measurement: product.measurement || '',
            thread_type: product.thread_type || '',
            cost_price: product.cost_price || '',
            selling_price: product.price,
            reorder_level: product.reorder_level || '',
            stock: product.stock,
            is_serialized: product.is_serialized === 1,
            serial_numbers: '', // We don't allow editing serials directly from here yet
            motorcycle_unit_ids: (product.motorcycle_unit_ids || []).map(Number),
            compatibility_group_ids: (product.compatibility_group_ids || []).map(Number)
        });
        setEditingId(product.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const isAdmin = user.role === 'admin';

    const uniqueCategories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
    const uniqueBrands = ['All', ...new Set(products.map(p => p.brand).filter(Boolean))];

    const filteredProducts = filterProducts(products, debouncedSearchQuery, {
        category: categoryFilter,
        brand: brandFilter,
        type: typeFilter
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
                            <input type="text" placeholder="Part Number" className="input-premium" required
                                value={formData.part_number} onChange={e => setFormData({ ...formData, part_number: e.target.value })} />

                            <input type="text" placeholder="Product Name" className="input-premium" required
                                value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />

                            <input type="text" placeholder="Brand" className="input-premium" required
                                value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} />

                            <input type="text" placeholder="Category (e.g. Engine, Tires)" className="input-premium" required
                                value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} />

                            <input type="text" placeholder="Size" className="input-premium" required
                                value={formData.size} onChange={e => setFormData({ ...formData, size: e.target.value })} />

                            <input type="text" placeholder="Measurement" className="input-premium"
                                value={formData.measurement} onChange={e => setFormData({ ...formData, measurement: e.target.value })} />

                            <input type="text" placeholder="Thread Type" className="input-premium"
                                value={formData.thread_type} onChange={e => setFormData({ ...formData, thread_type: e.target.value })} />

                            <input type="number" placeholder="Cost Price" className="input-premium" required min="0" step="0.01"
                                value={formData.cost_price} onChange={e => setFormData({ ...formData, cost_price: e.target.value })} />

                            <input type="number" placeholder="Selling Price (₱)" className="input-premium" required min="0" step="0.01"
                                value={formData.selling_price} onChange={e => setFormData({ ...formData, selling_price: e.target.value })} />

                            <input type="number" placeholder="Reorder Level" className="input-premium" required min="0"
                                value={formData.reorder_level} onChange={e => setFormData({ ...formData, reorder_level: e.target.value })} />
                        </div>

                        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <label style={{ color: 'var(--text-main)', marginBottom: '12px', display: 'block', fontWeight: 'bold' }}>Platform / Group Compatibility</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                                {compatibilityGroups.map(group => {
                                    const groupId = Number(group.id);
                                    const checked = formData.compatibility_group_ids.map(Number).includes(groupId);

                                    return (
                                        <label key={group.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--accent)' }}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleCompatibilityGroup(groupId)}
                                                style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }}
                                            />
                                            {group.group_name}
                                        </label>
                                    );
                                })}
                            </div>

                            <label style={{ color: 'var(--text-muted)', marginBottom: '12px', display: 'block' }}>Exact-Fit Compatibility (Optional if Group selected)</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                                {motorcycleUnits.map(unit => {
                                    const unitId = Number(unit.id);
                                    const checked = formData.motorcycle_unit_ids.map(Number).includes(unitId);

                                    return (
                                        <label key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-main)' }}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleMotorcycleUnit(unitId)}
                                                style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                                            />
                                            {formatMotorcycleUnit(unit)}
                                        </label>
                                    );
                                })}
                            </div>
                            {motorcycleUnits.length === 0 && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No motorcycle units available.</div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', flexWrap: 'wrap' }}>
                                <label style={{ color: 'var(--text-muted)' }}>Type:</label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="radio" name="product_type" checked={!formData.is_serialized} onChange={() => setFormData({ ...formData, is_serialized: false, serial_numbers: '' })} style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }} disabled={editingId !== null} />
                                    Non-Serialized
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="radio" name="product_type" checked={formData.is_serialized} onChange={() => setFormData({ ...formData, is_serialized: true })} style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }} disabled={editingId !== null} />
                                    Serialized
                                </label>
                            </div>
                            {!formData.is_serialized && (
                                <input type="number" placeholder="Stock Level" className="input-premium" required min="0"
                                    style={{ width: '200px' }}
                                    value={formData.stock}
                                    onChange={e => setFormData({ ...formData, stock: e.target.value })} />
                            )}
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
                    <input type="text" className="input-premium" placeholder="Search by part number, compatibility, name, brand, or size..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ paddingLeft: '48px', width: '100%' }} />
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
                        <option value="Non-Serialized">Non-Serialized Only</option>
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
                                    <th>Part Number</th>
                                    <th>Name</th>
                                    <th>Brand</th>
                                    <th>Size</th>
                                    <th>Stock</th>
                                    <th>Price</th>
                                    <th>Type</th>
                                    <th>Compatibility</th>
                                    {isAdmin && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.length > 0 ? filteredProducts.map(p => (
                                    <tr key={p.id}>
                                        <td style={{ color: 'var(--text-muted)', fontWeight: '500' }}>{p.part_number}</td>
                                        <td style={{ fontWeight: '500' }}>{p.product_name}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{p.brand}</td>
                                        <td>{p.size}</td>
                                        <td style={{ color: p.stock <= p.reorder_level ? 'var(--danger)' : 'var(--success)', fontWeight: 'bold' }}>
                                            {p.stock}
                                        </td>
                                        <td style={{ color: 'var(--primary)', fontWeight: 'bold' }}>₱{Number(p.price).toFixed(2)}</td>
                                        <td>
                                            <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', background: p.is_serialized ? 'rgba(255, 214, 10, 0.2)' : 'rgba(255, 255, 255, 0.1)', color: p.is_serialized ? 'var(--accent)' : 'var(--text-main)' }}>
                                                {p.is_serialized ? 'Serialized' : 'Non-Serialized'}
                                            </span>
                                        </td>
                                        <td>{p.compatibility_display || '-'}</td>
                                        {isAdmin && (
                                            <td style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={() => handleEdit(p)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}><Edit2 size={18} /></button>
                                                <button onClick={() => handleDelete(p.id, p.product_name)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                            </td>
                                        )}
                                    </tr>
                                )) : (
                                    <tr><td colSpan={isAdmin ? 9 : 8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No products found.</td></tr>
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
