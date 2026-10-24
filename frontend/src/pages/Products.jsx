import { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { PackagePlus, Trash2, Edit2, Search, History, Plus, X, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';
import Spinner from '../components/Spinner';
import { filterProducts } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import useForm from '../hooks/useForm';
import { formatCurrency } from '../utils/formatters';
import ProductEditModal from '../components/ProductEditModal';
import ItemLedgerDrawer from '../components/ItemLedgerDrawer';

const initialFormState = {
    part_number: '',
    name: '',
    brand: '',
    category: '',
    size: '',
    measurement: '',
    thread_type: '',
    cost_price: '',
    markup_percentage: '',
    selling_price: '',
    reorder_level: '',
    stock: '',
    is_serialized: false,
    serial_numbers: '',
    motorcycle_unit_ids: [],
    compatibility_group_ids: []
};

const Products = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useContext(AuthContext);

    const {
        values: formData,
        setValues: setFormData,
        handleChange,
        setFieldValue,
        resetForm
    } = useForm(initialFormState);

    const topCostNum = parseFloat(formData.cost_price) || 0;
    const topMarkupNum = parseFloat(formData.markup_percentage) || 0;
    // Formula: selling price = cost + (cost * percentage / 100)
    const topSellingPrice = Math.round(topCostNum * (1 + topMarkupNum / 100) * 100) / 100;

    const [editingId, setEditingId] = useState(null);
    const [editingProductModal, setEditingProductModal] = useState(null);
    const [ledgerTarget, setLedgerTarget] = useState(null);
    const [selectedSerialsModalProduct, setSelectedSerialsModalProduct] = useState(null);

    const {
        searchQuery,
        handleSearchChange,
        filters,
        setFilter,
        filteredItems: filteredProducts
    } = useTableFilter({
        items: products,
        initialFilters: { category: 'All', brand: 'All', type: 'All' },
        filterFn: (items, query, f) => filterProducts(items, query, {
            category: f.category,
            brand: f.brand,
            type: f.type
        })
    });

    const categoryFilter = filters.category;
    const brandFilter = filters.brand;
    const typeFilter = filters.type;

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
            const clean = Array.isArray(res.data)
                ? res.data.filter(u => !isJunkText(u.brand) && !isJunkText(u.model) && !isJunkText(u.year_model))
                : [];
            setMotorcycleUnits(clean);
        } catch {
            toast.error('Failed to load motorcycle units');
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
                part_number: formData.part_number,
                name: formData.name,
                brand: formData.brand,
                category: formData.category,
                size: formData.size,
                measurement: formData.measurement,
                thread_type: formData.thread_type,
                cost_price: topCostNum,
                markup_percentage: topMarkupNum,
                selling_price: topSellingPrice,
                reorder_level: Number(formData.reorder_level),
                is_serialized: formData.is_serialized,
                motorcycle_unit_ids: formData.motorcycle_unit_ids.map(Number),
                compatibility_group_ids: formData.compatibility_group_ids.map(Number)
            };

            if (editingId) {
                await api.put(`/products/${editingId}`, payload);
                toast.success('Product updated successfully');
            } else {
                await api.post('/products', payload);
                toast.success('Product added successfully');
            }

            resetForm();
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
        const c = product.cost_price || '';
        const p = product.price || product.selling_price || '';
        let m = product.markup_percentage;
        if (m === undefined || m === null || m === '') {
            const cNum = parseFloat(c) || 0;
            const pNum = parseFloat(p) || 0;
            m = cNum > 0 && pNum >= cNum ? Math.round(((pNum - cNum) / cNum) * 10000) / 100 : 0;
        }
        setFormData({
            part_number: product.part_number || '',
            name: product.product_name,
            brand: product.brand || '',
            category: product.category,
            size: product.size || '',
            measurement: product.measurement || '',
            thread_type: product.thread_type || '',
            cost_price: c,
            markup_percentage: m,
            selling_price: p,
            reorder_level: product.reorder_level || '',
            stock: product.stock,
            is_serialized: product.is_serialized === 1 || product.is_serialized === true,
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
                            <input type="text" name="part_number" placeholder="Part Number" className="input-premium" required
                                value={formData.part_number} onChange={handleChange} />

                            <input type="text" name="name" placeholder="Product Name" className="input-premium" required
                                value={formData.name} onChange={handleChange} />

                            <input type="text" name="brand" placeholder="Brand" className="input-premium" required
                                value={formData.brand} onChange={handleChange} />

                            <input type="text" name="category" placeholder="Category (e.g. Engine, Tires)" className="input-premium" required
                                value={formData.category} onChange={handleChange} />

                            <input type="text" name="size" placeholder="Size" className="input-premium" required
                                value={formData.size} onChange={handleChange} />

                            <input type="text" name="measurement" placeholder="Measurement" className="input-premium"
                                value={formData.measurement} onChange={handleChange} />

                            <input type="text" name="thread_type" placeholder="Thread Type" className="input-premium"
                                value={formData.thread_type} onChange={handleChange} />

                            <input type="number" name="cost_price" placeholder="Supplier Cost (₱)" className="input-premium" required min="0" step="0.01"
                                value={formData.cost_price} onChange={handleChange} title="Supplier Cost (₱)" />

                            <input type="number" name="markup_percentage" placeholder="Markup % (e.g. 30)" className="input-premium" required min="0" step="0.01"
                                value={formData.markup_percentage} onChange={handleChange} title="Markup percentage on cost" />

                            <input type="number" name="selling_price" placeholder="Selling Price (₱)" className="input-premium" readOnly disabled
                                value={topSellingPrice > 0 ? topSellingPrice.toFixed(2) : ''}
                                style={{ fontWeight: 'bold', color: 'var(--primary)', background: 'var(--surface-hover)', cursor: 'not-allowed' }}
                                title="Selling Price = Cost + (Cost × Markup %)" />

                            <input type="number" name="reorder_level" placeholder="Reorder Level" className="input-premium" required min="0"
                                value={formData.reorder_level} onChange={handleChange} />
                        </div>

                        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', flexWrap: 'wrap' }}>
                                <label style={{ color: 'var(--text-muted)' }}>Type:</label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="radio" name="product_type" checked={!formData.is_serialized} onChange={() => setFormData({ ...formData, is_serialized: false, serial_numbers: '' })} style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }} disabled={editingId !== null} />
                                    Non-Serialized
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="radio" name="product_type" checked={formData.is_serialized} onChange={() => setFormData({ ...formData, is_serialized: true })} style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }} disabled={editingId !== null} />
                                    Serialized
                                </label>
                            </div>
                            {editingId ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <input
                                        type="text"
                                        readOnly
                                        disabled
                                        value={`Current Stock: ${formData.stock ?? 0} units (Managed via Stock Receive)`}
                                        className="input-premium"
                                        style={{ width: '320px', opacity: 0.85, cursor: 'not-allowed', background: 'var(--surface-hover)' }}
                                    />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                    <span style={{ padding: '6px 12px', background: 'var(--surface-hover)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                        Initial Stock: <strong>0 units</strong> (Stock must be received via <em>Stock Receive</em> with a supplier receipt)
                                    </span>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button type="submit" className="btn-primary">
                                {editingId ? 'Save Changes' : 'Add to Catalog'}
                            </button>

                            {editingId && (
                                <button type="button" className="btn-secondary" onClick={() => {
                                    setEditingId(null);
                                    resetForm();
                                    setUnitSearchQuery('');
                                }}>
                                    Cancel Edit
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            )}

            <div className="responsive-filter-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 250px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="text" className="input-premium" placeholder="Search by part number, compatibility, name, brand, or size..." value={searchQuery} onChange={handleSearchChange} style={{ paddingLeft: '36px', width: '100%' }} />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                    <select className="input-premium" value={brandFilter} onChange={(e) => setFilter('brand', e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                        {uniqueBrands.map(brand => (
                            <option key={brand} value={brand}>{brand === 'All' ? 'All Brands' : brand}</option>
                        ))}
                    </select>
                </div>
                <div style={{ flex: '1 1 150px' }}>
                    <select className="input-premium" value={categoryFilter} onChange={(e) => setFilter('category', e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                        {uniqueCategories.map(cat => (
                            <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>
                        ))}
                    </select>
                </div>
                <div style={{ flex: '1 1 150px' }}>
                    <select className="input-premium" value={typeFilter} onChange={(e) => setFilter('type', e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
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
                                    <th style={{ minWidth: '170px' }}>Serial Number(s)</th>
                                    <th>Brand</th>
                                    <th>Size</th>
                                    <th style={{ textAlign: 'right' }}>Stock</th>
                                    <th style={{ textAlign: 'right' }}>Cost</th>
                                    <th style={{ textAlign: 'center' }}>Markup %</th>
                                    <th style={{ textAlign: 'right' }}>Selling Price</th>
                                    <th>Type</th>
                                    <th>Compatibility</th>
                                    {isAdmin && <th style={{ textAlign: 'center' }}>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.length > 0 ? filteredProducts.map(p => (
                                    <tr key={p.id}>
                                        <td style={{ color: 'var(--text-muted)', fontWeight: '600', fontFamily: 'monospace' }}>{p.part_number}</td>
                                        <td style={{ fontWeight: '500' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>{p.product_name}</span>
                                                {p.is_serialized ? (
                                                    <span className="badge-pill badge-serialized" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                                                        Serialized
                                                    </span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td>
                                            {p.is_serialized ? (
                                                p.serials && p.serials.length > 0 ? (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '250px', alignItems: 'center' }}>
                                                        {p.serials.slice(0, 3).map(s => (
                                                            <span
                                                                key={s.id || s.serial_number}
                                                                style={{
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.73rem',
                                                                    fontWeight: 600,
                                                                    background: 'rgba(22, 163, 74, 0.12)',
                                                                    color: 'var(--primary)',
                                                                    border: '1px solid rgba(22, 163, 74, 0.25)',
                                                                    padding: '1px 6px',
                                                                    borderRadius: '4px',
                                                                    whiteSpace: 'nowrap'
                                                                }}
                                                            >
                                                                {s.serial_number}
                                                            </span>
                                                        ))}
                                                        {p.serials.length > 3 && (
                                                            <span
                                                                onClick={() => setSelectedSerialsModalProduct(p)}
                                                                style={{
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    color: 'var(--text-main)',
                                                                    background: 'var(--surface-hover)',
                                                                    border: '1px solid var(--border)',
                                                                    padding: '1px 6px',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center'
                                                                }}
                                                                title={`Click to view all ${p.serials.length} serial numbers`}
                                                            >
                                                                +{p.serials.length - 3} more
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No serials in stock</span>
                                                )
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                                            )}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)' }}>{p.brand}</td>
                                        <td>{p.size}</td>
                                        <td style={{ textAlign: 'right', color: p.stock <= p.reorder_level ? 'var(--danger)' : 'var(--success)', fontWeight: 'bold' }}>
                                            {p.stock}
                                        </td>
                                        <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            {formatCurrency(p.cost_price || 0)}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#d97706', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                                +{Number(p.markup_percentage || 0)}%
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right', color: 'var(--primary)', fontWeight: 'bold' }}>{formatCurrency(p.price || p.selling_price)}</td>
                                        <td>
                                            <span className={`badge-pill ${p.is_serialized ? 'badge-serialized' : 'badge-non-serialized'}`}>
                                                {p.is_serialized ? 'Serialized' : 'Non-Serialized'}
                                            </span>
                                        </td>
                                        <td>{p.compatibility_display || '-'}</td>
                                        {isAdmin && (
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                                                    <button onClick={() => setLedgerTarget(p)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title="View Stock Movement History"><History size={16} /></button>
                                                    <button onClick={() => setEditingProductModal(p)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }} title="Edit Product Metadata & Pricing"><Edit2 size={16} /></button>
                                                    <button onClick={() => handleDelete(p.id, p.product_name)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }} title="Delete Product"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={isAdmin ? 12 : 11} className="table-empty-state">
                                            No products match your search or filter criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Product Edit Modal with Read-Only Stock */}
            <ProductEditModal
                isOpen={editingProductModal !== null}
                onClose={() => setEditingProductModal(null)}
                product={editingProductModal}
                onSuccess={fetchProducts}
            />

            
            {/* Serial Numbers Modal */}
            {selectedSerialsModalProduct && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: 'var(--surface, #1e293b)',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        padding: '20px',
                        maxWidth: '480px',
                        width: '100%',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    Serialized Units in Stock ({selectedSerialsModalProduct.serials?.length || 0})
                                </h3>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {selectedSerialsModalProduct.product_name} • <span style={{ fontFamily: 'monospace' }}>{selectedSerialsModalProduct.part_number}</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedSerialsModalProduct(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{
                            overflowY: 'auto',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                            gap: '8px',
                            padding: '4px',
                            marginBottom: '14px'
                        }}>
                            {selectedSerialsModalProduct.serials?.map((s, idx) => (
                                <div
                                    key={s.id || idx}
                                    style={{
                                        background: 'rgba(22, 163, 74, 0.08)',
                                        border: '1px solid rgba(22, 163, 74, 0.2)',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        fontFamily: 'monospace',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: 'var(--primary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}
                                >
                                    <span>{s.serial_number}</span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                        {s.status || 'available'}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setSelectedSerialsModalProduct(null)}
                                className="btn-secondary"
                                style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Item Ledger Drawer */}
            <ItemLedgerDrawer
                isOpen={ledgerTarget !== null}
                onClose={() => setLedgerTarget(null)}
                product={ledgerTarget}
            />
        </div>
    );
};

export default Products;
