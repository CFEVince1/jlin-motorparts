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
    is_serialized: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('type') === 'serialized',
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
    const [isAddFormOpen, setIsAddFormOpen] = useState(() => {
        if (typeof window === 'undefined') return false;
        const p = new URLSearchParams(window.location.search);
        return p.get('add') === 'true' || p.get('type') === 'serialized';
    });
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

            if (formData.is_serialized && formData.serial_numbers) {
                const serialsArray = String(formData.serial_numbers)
                    .split(/[\n,]+/)
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                if (serialsArray.length > 0) {
                    payload.serial_numbers = serialsArray;
                }
            }

            if (editingId) {
                await api.put(`/products/${editingId}`, payload);
                toast.success('Product updated successfully');
            } else {
                await api.post('/products', payload);
                toast.success('Product added successfully');
            }

            resetForm();
            setEditingId(null);
            setIsAddFormOpen(false);
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
        setIsAddFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const isAdmin = user.role === 'admin';

    const uniqueCategories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
    const uniqueBrands = ['All', ...new Set(products.map(p => p.brand).filter(Boolean))];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Products Directory</h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        Manage catalog items, pricing, specifications, and serial settings.
                    </p>
                </div>
                {isAdmin && (
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                            if (isAddFormOpen && editingId) {
                                setEditingId(null);
                                resetForm();
                            }
                            setIsAddFormOpen(prev => !prev);
                        }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            padding: '8px 16px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        {isAddFormOpen ? <ChevronUp size={15} /> : <Plus size={15} />}
                        {isAddFormOpen ? 'Hide Form' : 'Add New Product'}
                    </button>
                )}
            </div>

            {isAdmin && isAddFormOpen && (
                <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: 700 }}>
                            <PackagePlus size={18} style={{ color: 'var(--primary)' }} /> {editingId ? 'Edit Product' : 'Add New Product'}
                        </h3>
                        <button
                            type="button"
                            onClick={() => {
                                setEditingId(null);
                                resetForm();
                                setIsAddFormOpen(false);
                            }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            title="Close form"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                            <input
                                type="text"
                                name="part_number"
                                placeholder="Part Number *"
                                className="input-premium"
                                required
                                value={formData.part_number}
                                onChange={handleChange}
                                style={{ padding: '7px 11px', fontSize: '0.82rem', height: '35px' }}
                            />
                            <input
                                type="text"
                                name="name"
                                placeholder="Product Name *"
                                className="input-premium"
                                required
                                value={formData.name}
                                onChange={handleChange}
                                style={{ padding: '7px 11px', fontSize: '0.82rem', height: '35px' }}
                            />
                            <input
                                type="text"
                                name="brand"
                                placeholder="Brand"
                                className="input-premium"
                                value={formData.brand}
                                onChange={handleChange}
                                style={{ padding: '7px 11px', fontSize: '0.82rem', height: '35px' }}
                            />
                            <input
                                type="text"
                                name="category"
                                placeholder="Category *"
                                className="input-premium"
                                required
                                value={formData.category}
                                onChange={handleChange}
                                style={{ padding: '7px 11px', fontSize: '0.82rem', height: '35px' }}
                            />
                            <input
                                type="text"
                                name="size"
                                placeholder="Size"
                                className="input-premium"
                                value={formData.size}
                                onChange={handleChange}
                                style={{ padding: '7px 11px', fontSize: '0.82rem', height: '35px' }}
                            />
                            <input
                                type="text"
                                name="measurement"
                                placeholder="Measurement"
                                className="input-premium"
                                value={formData.measurement}
                                onChange={handleChange}
                                style={{ padding: '7px 11px', fontSize: '0.82rem', height: '35px' }}
                            />
                            <input
                                type="text"
                                name="thread_type"
                                placeholder="Thread Type"
                                className="input-premium"
                                value={formData.thread_type}
                                onChange={handleChange}
                                style={{ padding: '7px 11px', fontSize: '0.82rem', height: '35px' }}
                            />
                            <input
                                type="number"
                                name="reorder_level"
                                placeholder="Reorder Level *"
                                className="input-premium"
                                required
                                min="0"
                                value={formData.reorder_level}
                                onChange={handleChange}
                                style={{ padding: '7px 11px', fontSize: '0.82rem', height: '35px' }}
                            />
                            <input
                                type="number"
                                name="cost_price"
                                placeholder="Supplier Cost (₱) *"
                                className="input-premium"
                                required
                                min="0"
                                step="0.01"
                                value={formData.cost_price}
                                onChange={handleChange}
                                title="Supplier Cost (₱)"
                                style={{ padding: '7px 11px', fontSize: '0.82rem', height: '35px' }}
                            />
                            <input
                                type="number"
                                name="markup_percentage"
                                placeholder="Markup % (e.g. 30) *"
                                className="input-premium"
                                required
                                min="0"
                                step="0.01"
                                value={formData.markup_percentage}
                                onChange={handleChange}
                                title="Markup percentage on cost"
                                style={{ padding: '7px 11px', fontSize: '0.82rem', height: '35px' }}
                            />
                            <input
                                type="number"
                                name="selling_price"
                                placeholder="Selling Price (₱)"
                                className="input-premium"
                                readOnly
                                disabled
                                value={topSellingPrice > 0 ? topSellingPrice.toFixed(2) : ''}
                                style={{
                                    padding: '7px 11px',
                                    fontSize: '0.82rem',
                                    height: '35px',
                                    fontWeight: 'bold',
                                    color: 'var(--primary)',
                                    background: 'var(--surface-hover)',
                                    cursor: 'not-allowed'
                                }}
                                title="Selling Price = Cost + (Cost × Markup %)"
                            />
                        </div>

                        {/* Compact Type Selector & Initial Stock Indicator */}
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginTop: '2px' }}>
                            <div style={{
                                display: 'inline-flex',
                                gap: '12px',
                                alignItems: 'center',
                                padding: '4px 12px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                fontSize: '0.8rem'
                            }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Type:</span>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 500 }}>
                                    <input
                                        type="radio"
                                        name="product_type"
                                        checked={!formData.is_serialized}
                                        onChange={() => setFormData({ ...formData, is_serialized: false, serial_numbers: '' })}
                                        style={{ accentColor: 'var(--primary)', width: '14px', height: '14px' }}
                                        disabled={editingId !== null}
                                    />
                                    Non-Serialized
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 500 }}>
                                    <input
                                        type="radio"
                                        name="product_type"
                                        checked={formData.is_serialized}
                                        onChange={() => setFormData({ ...formData, is_serialized: true })}
                                        style={{ accentColor: 'var(--primary)', width: '14px', height: '14px' }}
                                        disabled={editingId !== null}
                                    />
                                    Serialized
                                </label>
                            </div>

                            {editingId ? (
                                <input
                                    type="text"
                                    readOnly
                                    disabled
                                    value={`Current Stock: ${formData.stock ?? 0} units (Managed via Stock Receive)`}
                                    className="input-premium"
                                    style={{
                                        width: '260px',
                                        height: '32px',
                                        padding: '4px 10px',
                                        fontSize: '0.78rem',
                                        opacity: 0.85,
                                        cursor: 'not-allowed',
                                        background: 'var(--surface-hover)'
                                    }}
                                />
                            ) : (
                                <span style={{
                                    padding: '4px 10px',
                                    background: 'var(--surface-hover)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    fontSize: '0.78rem',
                                    color: 'var(--text-muted)'
                                }}>
                                    {formData.is_serialized ? (
                                        formData.serial_numbers.trim() ? (
                                            <>Initial Stock: <strong style={{ color: 'var(--primary)' }}>{formData.serial_numbers.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length} units</strong> (from serials)</>
                                        ) : (
                                            <>Initial Stock: <strong>0 units</strong> (Serials can be entered below or received via <em>Stock Receive</em>)</>
                                        )
                                    ) : (
                                        <>Initial Stock: <strong>0 units</strong> (Receive stock via <em>Stock Receive</em> with supplier receipt)</>
                                    )}
                                </span>
                            )}
                        </div>

                        {/* Compact Serial Number Input for Serialized Items */}
                        {formData.is_serialized && !editingId && (
                            <div style={{
                                padding: '10px 12px',
                                background: 'var(--surface-hover)',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                    <label style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.8rem' }}>
                                        Serial Number(s)
                                    </label>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        Comma separated or one per line. Leave blank to receive stock later via Stock Receive.
                                    </span>
                                </div>
                                <textarea
                                    name="serial_numbers"
                                    placeholder="e.g. SN-001, SN-002, SN-003"
                                    className="input-premium"
                                    style={{ height: '52px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem', padding: '6px 10px' }}
                                    value={formData.serial_numbers}
                                    onChange={handleChange}
                                />
                                {formData.serial_numbers.trim() && (
                                    <div style={{ fontSize: '0.74rem', color: 'var(--primary)', fontWeight: 600 }}>
                                        ✓ Initial Stock: {
                                            formData.serial_numbers
                                                .split(/[\n,]+/)
                                                .map(s => s.trim())
                                                .filter(Boolean).length
                                        } serialized unit(s) will be added to stock
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
                            <button
                                type="submit"
                                className="btn-primary"
                                style={{ padding: '6px 16px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Plus size={14} /> {editingId ? 'Save Changes' : 'Add to Catalog'}
                            </button>

                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    setEditingId(null);
                                    resetForm();
                                    setIsAddFormOpen(false);
                                }}
                                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="responsive-filter-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 250px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="text" className="input-premium" placeholder="Search by part number, name, brand, or size..." value={searchQuery} onChange={handleSearchChange} style={{ paddingLeft: '36px', width: '100%' }} />
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
                                    <th>Measurement</th>
                                    <th>Thread Type</th>
                                    <th style={{ textAlign: 'center', width: '90px' }}>Stock</th>
                                    <th style={{ textAlign: 'right' }}>Cost</th>
                                    <th style={{ textAlign: 'center' }}>Markup %</th>
                                    <th style={{ textAlign: 'right' }}>Selling Price</th>
                                    <th>Type</th>
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
                                        <td>{p.size || '-'}</td>
                                        <td>{p.measurement || '-'}</td>
                                        <td>{p.thread_type || '-'}</td>
                                        <td style={{ textAlign: 'center', color: p.stock <= p.reorder_level ? 'var(--danger)' : 'var(--success)', fontWeight: 'bold' }}>
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
                                        <td colSpan={isAdmin ? 13 : 12} className="table-empty-state">
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
