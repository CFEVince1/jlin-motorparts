import { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { PackagePlus, Trash2, Edit2, Search, History, Layers, Plus, X, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';
import Spinner from '../components/Spinner';
import { filterProducts } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import useForm from '../hooks/useForm';
import { formatCurrency } from '../utils/formatters';
import ProductEditModal from '../components/ProductEditModal';
import ItemLedgerDrawer from '../components/ItemLedgerDrawer';

const formatMotorcycleUnit = (unit) => {
    if (!unit) return '';
    const brand = (unit.brand || '').trim();
    const model = (unit.model || '').trim();
    const year = (unit.year_model || '').trim();
    const formattedBrand = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : '';
    if (!year) return `${formattedBrand} ${model}`.trim();
    if (model.toLowerCase().includes(year.toLowerCase())) {
        return `${formattedBrand} ${model}`.trim();
    }
    return `${formattedBrand} ${model} ${year}`.trim();
};

const isJunkText = (str) => {
    if (!str) return false;
    const s = String(str).toLowerCase();
    return s.includes('test') || s.includes('werewe') || s.includes('wampipti') || s.includes('susuki') || s.includes('naglulu') || s.includes('inanak') || s.includes('sila');
};

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
    const [motorcycleUnits, setMotorcycleUnits] = useState([]);
    const [compatibilityGroups, setCompatibilityGroups] = useState([]);
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

    const fetchCompatibilityGroups = async () => {
        try {
            const res = await api.get('/products/compatibility-groups');
            const clean = Array.isArray(res.data)
                ? res.data
                    .filter(g => !isJunkText(g.group_name) && !isJunkText(g.description))
                    .map(g => ({
                        ...g,
                        member_units: (g.member_units || []).filter(u => !isJunkText(u.brand) && !isJunkText(u.model) && !isJunkText(u.year_model))
                    }))
                : [];
            setCompatibilityGroups(clean);
        } catch {
            toast.error('Failed to load compatibility groups');
        }
    };

    useEffect(() => {
        fetchProducts();
        fetchMotorcycleUnits();
        fetchCompatibilityGroups();
    }, []);

    const [selectedGroupIdToAdd, setSelectedGroupIdToAdd] = useState('');
    const [unitSearchQuery, setUnitSearchQuery] = useState('');
    const [showExactUnits, setShowExactUnits] = useState(false);
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupDescription, setNewGroupDescription] = useState('');
    const [newGroupUnitIds, setNewGroupUnitIds] = useState([]);
    const [savingGroup, setSavingGroup] = useState(false);

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

    const addCompatibilityGroup = (groupId) => {
        if (!groupId) return;
        const numericId = Number(groupId);
        const selected = formData.compatibility_group_ids.map(Number);
        if (!selected.includes(numericId)) {
            setFormData({
                ...formData,
                compatibility_group_ids: [...selected, numericId]
            });
        }
        setSelectedGroupIdToAdd('');
    };

    const removeCompatibilityGroup = (groupId) => {
        const numericId = Number(groupId);
        setFormData({
            ...formData,
            compatibility_group_ids: formData.compatibility_group_ids.map(Number).filter(id => id !== numericId)
        });
    };

    const handleQuickCreateGroup = async (e) => {
        e.preventDefault();
        if (!newGroupName.trim()) {
            toast.error('Platform group name is required');
            return;
        }
        setSavingGroup(true);
        try {
            const res = await api.post('/compatibility/groups', {
                group_name: newGroupName.trim(),
                description: newGroupDescription.trim() || null,
                motorcycle_unit_ids: newGroupUnitIds
            });
            toast.success(`Platform group "${newGroupName.trim()}" created!`);
            await fetchCompatibilityGroups();
            if (res.data?.id) {
                const newId = Number(res.data.id);
                const currentSelected = formData.compatibility_group_ids.map(Number);
                if (!currentSelected.includes(newId)) {
                    setFormData(prev => ({
                        ...prev,
                        compatibility_group_ids: [...currentSelected, newId]
                    }));
                }
            }
            setNewGroupName('');
            setNewGroupDescription('');
            setNewGroupUnitIds([]);
            setIsCreatingGroup(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create platform group');
        } finally {
            setSavingGroup(false);
        }
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
            setSelectedGroupIdToAdd('');
            setIsCreatingGroup(false);
            setUnitSearchQuery('');
            setShowExactUnits(false);
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

                        <div style={{ padding: '18px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            {/* Section Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <label style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.95rem', margin: 0 }}>
                                        <Layers size={18} style={{ color: 'var(--primary)' }} /> Platform / Group Compatibility
                                    </label>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '4px 0 0 0' }}>
                                        Select a platform group to automatically cover all shared models in that family (e.g. all Click or Aerox variants).
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => setIsCreatingGroup(!isCreatingGroup)}
                                    style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Plus size={14} /> {isCreatingGroup ? 'Cancel New Group' : 'Create New Group'}
                                </button>
                            </div>

                            {/* Quick Create Group Inline Form */}
                            {isCreatingGroup && (
                                <div style={{ padding: '16px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '8px', border: '1px dashed var(--primary)', marginBottom: '16px' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Plus size={16} /> Create New Platform Group
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                        <input
                                            type="text"
                                            placeholder="Group Name (e.g. Yamaha NMAX Platform)"
                                            className="input-premium"
                                            value={newGroupName}
                                            onChange={(e) => setNewGroupName(e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Description (e.g. All NMAX 155 versions)"
                                            className="input-premium"
                                            value={newGroupDescription}
                                            onChange={(e) => setNewGroupDescription(e.target.value)}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                                            Select Member Motorcycle Models:
                                        </label>
                                        <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '8px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                                            {motorcycleUnits.map(unit => {
                                                const unitId = Number(unit.id);
                                                const isChecked = newGroupUnitIds.includes(unitId);
                                                return (
                                                    <label key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-main)' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => {
                                                                setNewGroupUnitIds(prev => 
                                                                    isChecked ? prev.filter(id => id !== unitId) : [...prev, unitId]
                                                                );
                                                            }}
                                                            style={{ accentColor: 'var(--primary)', width: '14px', height: '14px' }}
                                                        />
                                                        {formatMotorcycleUnit(unit)}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            onClick={handleQuickCreateGroup}
                                            disabled={savingGroup}
                                            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                                        >
                                            {savingGroup ? 'Saving...' : 'Save & Select Platform Group'}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={() => { setIsCreatingGroup(false); setNewGroupName(''); setNewGroupDescription(''); setNewGroupUnitIds([]); }}
                                            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Dropdown Selector Row */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                                <div style={{ flex: '1 1 300px' }}>
                                    <select
                                        className="input-premium"
                                        value={selectedGroupIdToAdd}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSelectedGroupIdToAdd(val);
                                            if (val) {
                                                addCompatibilityGroup(val);
                                            }
                                        }}
                                        style={{ width: '100%', cursor: 'pointer' }}
                                    >
                                        <option value="">-- Select Platform Group to Add --</option>
                                        {compatibilityGroups.map(group => {
                                            const groupId = Number(group.id);
                                            const isAlreadySelected = formData.compatibility_group_ids.map(Number).includes(groupId);
                                            const modelCount = group.member_units?.length || 0;
                                            const modelsSample = (group.member_units || []).slice(0, 3).map(m => m.model).join(', ');
                                            const label = `${group.group_name}${modelCount > 0 ? ` (${modelCount} models: ${modelsSample})` : ''}${isAlreadySelected ? ' ✓ (Added)' : ''}`;

                                            return (
                                                <option key={group.id} value={group.id} disabled={isAlreadySelected}>
                                                    {label}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>

                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => addCompatibilityGroup(selectedGroupIdToAdd)}
                                    disabled={!selectedGroupIdToAdd}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '42px', padding: '0 16px' }}
                                >
                                    <Plus size={16} /> Add Platform Group
                                </button>
                            </div>

                            {/* Selected Groups Badges */}
                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>
                                    Selected Platform Groups ({formData.compatibility_group_ids.length}):
                                </label>
                                {formData.compatibility_group_ids.length > 0 ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                        {formData.compatibility_group_ids.map(id => {
                                            const group = compatibilityGroups.find(g => Number(g.id) === Number(id));
                                            if (!group) return null;
                                            const memberNames = (group.member_units || []).map(formatMotorcycleUnit).join(', ');
                                            return (
                                                <div
                                                    key={id}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '6px 12px',
                                                        background: 'rgba(99, 102, 241, 0.15)',
                                                        border: '1px solid rgba(99, 102, 241, 0.4)',
                                                        borderRadius: '20px',
                                                        color: 'var(--text-main)',
                                                        fontSize: '0.85rem'
                                                    }}
                                                    title={memberNames ? `Covers: ${memberNames}` : 'No specific models attached'}
                                                >
                                                    <span style={{ fontWeight: 600 }}>🏷️ {group.group_name}</span>
                                                    {group.member_units?.length > 0 && (
                                                        <span style={{
                                                            fontSize: '0.75rem',
                                                            background: 'rgba(255,255,255,0.12)',
                                                            padding: '2px 8px',
                                                            borderRadius: '10px',
                                                            color: 'var(--text-muted)'
                                                        }}>
                                                            {group.member_units.length} {group.member_units.length === 1 ? 'model' : 'models'}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeCompatibilityGroup(id)}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            color: 'var(--text-muted)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            padding: '2px',
                                                            borderRadius: '50%'
                                                        }}
                                                        title="Remove platform group"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{
                                        padding: '12px 16px',
                                        background: 'rgba(255,255,255,0.01)',
                                        border: '1px dashed var(--border)',
                                        borderRadius: '8px',
                                        color: 'var(--text-muted)',
                                        fontSize: '0.85rem'
                                    }}>
                                        No platform group selected yet. Use the dropdown above to add one, or select exact individual models below.
                                    </div>
                                )}
                            </div>

                            {/* Exact-Fit Motorcycle Units Toggle & Search */}
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowExactUnits(!showExactUnits)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontSize: '0.85rem',
                                            fontWeight: 'bold',
                                            padding: 0
                                        }}
                                    >
                                        {showExactUnits ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        Exact-Fit Individual Models ({formData.motorcycle_unit_ids.length} selected)
                                    </button>

                                    {showExactUnits && (
                                        <div style={{ position: 'relative', width: '220px' }}>
                                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                            <input
                                                type="text"
                                                placeholder="Search models..."
                                                className="input-premium"
                                                value={unitSearchQuery}
                                                onChange={(e) => setUnitSearchQuery(e.target.value)}
                                                style={{ paddingLeft: '30px', fontSize: '0.8rem', height: '32px' }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {showExactUnits && (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                        gap: '8px',
                                        maxHeight: '180px',
                                        overflowY: 'auto',
                                        padding: '8px',
                                        background: 'rgba(0,0,0,0.15)',
                                        borderRadius: '6px'
                                    }}>
                                        {motorcycleUnits
                                            .filter(unit => {
                                                if (!unitSearchQuery.trim()) return true;
                                                const q = unitSearchQuery.toLowerCase();
                                                return formatMotorcycleUnit(unit).toLowerCase().includes(q);
                                            })
                                            .map(unit => {
                                                const unitId = Number(unit.id);
                                                const checked = formData.motorcycle_unit_ids.map(Number).includes(unitId);

                                                return (
                                                    <label
                                                        key={unit.id}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            cursor: 'pointer',
                                                            color: 'var(--text-main)',
                                                            fontSize: '0.8rem',
                                                            padding: '4px 6px',
                                                            borderRadius: '4px',
                                                            background: checked ? 'rgba(99, 102, 241, 0.1)' : 'transparent'
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleMotorcycleUnit(unitId)}
                                                            style={{ accentColor: 'var(--primary)', width: '15px', height: '15px' }}
                                                        />
                                                        {formatMotorcycleUnit(unit)}
                                                    </label>
                                                );
                                            })}
                                        {motorcycleUnits.length === 0 && (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No motorcycle units available.</div>
                                        )}
                                    </div>
                                )}
                            </div>
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
                                    setSelectedGroupIdToAdd('');
                                    setIsCreatingGroup(false);
                                    setUnitSearchQuery('');
                                    setShowExactUnits(false);
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
                                        <td style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{p.part_number}</td>
                                        <td style={{ fontWeight: '500' }}>{p.product_name}</td>
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
                                        <td colSpan={isAdmin ? 11 : 10} className="table-empty-state">
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
