import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Settings2, Trash2, Edit2, Plus, Bike, Layers, Search, CheckCircle2 } from 'lucide-react';
import Spinner from '../components/Spinner';
import useForm from '../hooks/useForm';

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

const initialUnitForm = { brand: '', model: '', year_model: '' };
const initialGroupForm = { group_name: '', description: '', motorcycle_unit_ids: [] };

const ManageCompatibility = () => {
    const [motorcycleUnits, setMotorcycleUnits] = useState([]);
    const [compatibilityGroups, setCompatibilityGroups] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form states using useForm for Units and Groups
    const {
        values: unitForm,
        setValues: setUnitForm,
        handleChange: handleUnitChange,
        resetForm: resetUnitForm
    } = useForm(initialUnitForm);
    const [editingUnitId, setEditingUnitId] = useState(null);

    const {
        values: groupForm,
        setValues: setGroupForm,
        handleChange: handleGroupChange,
        resetForm: resetGroupForm
    } = useForm(initialGroupForm);
    const [editingGroupId, setEditingGroupId] = useState(null);

    // Product Compatibility Assignment State
    const [selectedProductId, setSelectedProductId] = useState('');
    const [selectedUnitIds, setSelectedUnitIds] = useState([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [unitSearchQuery, setUnitSearchQuery] = useState('');
    const [productFilterQuery, setProductFilterQuery] = useState('');
    const [savingProductCompat, setSavingProductCompat] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [unitsRes, groupsRes, productsRes] = await Promise.all([
                api.get('/compatibility/motorcycle-units'),
                api.get('/compatibility/groups'),
                api.get('/products')
            ]);
            const cleanUnits = Array.isArray(unitsRes.data)
                ? unitsRes.data.filter(u => !isJunkText(u.brand) && !isJunkText(u.model) && !isJunkText(u.year_model))
                : [];
            const cleanGroups = Array.isArray(groupsRes.data)
                ? groupsRes.data
                    .filter(g => !isJunkText(g.group_name) && !isJunkText(g.description))
                    .map(g => ({
                        ...g,
                        member_units: (g.member_units || []).filter(u => !isJunkText(u.brand) && !isJunkText(u.model) && !isJunkText(u.year_model))
                    }))
                : [];
            
            const prodList = Array.isArray(productsRes.data) ? productsRes.data : [];

            setMotorcycleUnits(cleanUnits);
            setCompatibilityGroups(cleanGroups);
            setProducts(prodList);
            if (prodList.length > 0 && !selectedProductId) {
                const first = prodList[0];
                setSelectedProductId(first.id);
                setSelectedUnitIds((first.motorcycle_unit_ids || []).map(Number));
                setSelectedGroupIds((first.compatibility_group_ids || []).map(Number));
            }

            // If a product was selected, sync its fresh state
            if (selectedProductId) {
                const refreshed = prodList.find(p => p.id === Number(selectedProductId));
                if (refreshed) {
                    setSelectedUnitIds((refreshed.motorcycle_unit_ids || []).map(Number));
                    setSelectedGroupIds((refreshed.compatibility_group_ids || []).map(Number));
                }
            }
        } catch {
            toast.error('Failed to load compatibility data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- Product Compatibility Handlers ---

    const handleSelectProduct = (product) => {
        setSelectedProductId(product.id);
        setSelectedUnitIds((product.motorcycle_unit_ids || []).map(Number));
        setSelectedGroupIds((product.compatibility_group_ids || []).map(Number));
        setUnitSearchQuery('');
        // Smooth scroll to editor
        document.getElementById('product-compatibility-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    const toggleProductUnit = (unitId) => {
        const numericId = Number(unitId);
        setSelectedUnitIds(prev =>
            prev.includes(numericId)
                ? prev.filter(id => id !== numericId)
                : [...prev, numericId]
        );
    };

    const toggleProductGroup = (group) => {
        const groupId = Number(group.id);
        const isCurrentlySelected = selectedGroupIds.includes(groupId);
        const memberUnitIds = (group.member_units || []).map(u => Number(u.id));

        if (isCurrentlySelected) {
            setSelectedGroupIds(prev => prev.filter(id => id !== groupId));
        } else {
            setSelectedGroupIds(prev => [...prev, groupId]);
            setSelectedUnitIds(prev => [...new Set([...prev, ...memberUnitIds])]);
        }
    };

    const handleSaveProductCompatibility = async () => {
        if (!selectedProductId) {
            toast.error('Please select a product first');
            return;
        }

        const currentProd = products.find(p => p.id === Number(selectedProductId));
        const prodName = currentProd ? (currentProd.product_name || currentProd.name) : 'Product';

        setSavingProductCompat(true);
        try {
            await api.put(`/compatibility/products/${selectedProductId}`, {
                motorcycle_unit_ids: selectedUnitIds,
                compatibility_group_ids: selectedGroupIds
            });
            toast.success(`Motorcycle compatibility updated for ${prodName}!`);
            await fetchData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update compatibility');
        } finally {
            setSavingProductCompat(false);
        }
    };

    // --- Motorcycle Units Handlers ---

    const handleUnitSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingUnitId) {
                await api.put(`/compatibility/motorcycle-units/${editingUnitId}`, unitForm);
                toast.success('Motorcycle unit updated');
            } else {
                await api.post('/compatibility/motorcycle-units', unitForm);
                toast.success('Motorcycle unit added');
            }
            resetUnitForm();
            setEditingUnitId(null);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Action failed');
        }
    };

    const handleUnitDelete = async (id, name) => {
        if (!window.confirm(`Delete ${name}? This removes it from all products and groups!`)) return;
        try {
            await api.delete(`/compatibility/motorcycle-units/${id}`);
            toast.success('Unit deleted');
            fetchData();
        } catch {
            toast.error('Failed to delete unit');
        }
    };

    const handleUnitEdit = (unit) => {
        setUnitForm({
            brand: unit.brand,
            model: unit.model,
            year_model: unit.year_model || ''
        });
        setEditingUnitId(unit.id);
        document.getElementById('unit-form-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    // --- Compatibility Groups Handlers ---

    const toggleGroupUnit = (unitId) => {
        const numericId = Number(unitId);
        const selected = groupForm.motorcycle_unit_ids.map(Number);
        setGroupForm({
            ...groupForm,
            motorcycle_unit_ids: selected.includes(numericId)
                ? selected.filter(id => id !== numericId)
                : [...selected, numericId]
        });
    };

    const handleGroupSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingGroupId) {
                await api.put(`/compatibility/groups/${editingGroupId}`, groupForm);
                toast.success('Platform group updated');
            } else {
                await api.post('/compatibility/groups', groupForm);
                toast.success('Platform group added');
            }
            resetGroupForm();
            setEditingGroupId(null);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Action failed');
        }
    };

    const handleGroupDelete = async (id, name) => {
        if (!window.confirm(`Delete platform '${name}'? This removes it from all products!`)) return;
        try {
            await api.delete(`/compatibility/groups/${id}`);
            toast.success('Platform deleted');
            fetchData();
        } catch {
            toast.error('Failed to delete platform');
        }
    };

    const handleGroupEdit = (group) => {
        setGroupForm({
            group_name: group.group_name,
            description: group.description || '',
            motorcycle_unit_ids: (group.member_units || []).map(u => Number(u.id))
        });
        setEditingGroupId(group.id);
        document.getElementById('group-form-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    if (loading) return <div style={{ padding: '24px' }}><Spinner text="Loading compatibility data..." /></div>;

    const selectedProduct = products.find(p => p.id === Number(selectedProductId));
    const filteredProducts = products.filter(p => {
        if (!productFilterQuery.trim()) return true;
        const q = productFilterQuery.toLowerCase();
        const pNum = (p.part_number || '').toLowerCase();
        const pName = (p.product_name || p.name || '').toLowerCase();
        const pCompat = (p.compatibility_display || '').toLowerCase();
        return pNum.includes(q) || pName.includes(q) || pCompat.includes(q);
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '40px' }}>
            <div>
                <h2 style={{ marginBottom: '8px', fontSize: '1.25rem', color: 'var(--text-main)' }}>Compatibility Rules & Mapping</h2>
                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>
                    Configure motorcycle compatibility directly onto products, manage platform groups, and define motorcycle units.
                </p>
            </div>

            {/* SECTION 1: PRODUCT MOTORCYCLE COMPATIBILITY */}
            <section id="product-compatibility-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-main)', fontSize: '1.15rem' }}>
                        <Layers size={22} style={{ color: 'var(--primary)' }} /> Motorcycle Compatibility ({selectedUnitIds.length} selected)
                    </h2>
                    {selectedProduct && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Configuring: <strong style={{ color: 'var(--primary)' }}>{selectedProduct.part_number} — {selectedProduct.product_name || selectedProduct.name}</strong>
                        </span>
                    )}
                </div>

                <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                    {/* Product Selector Dropdown */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                            Choose Product to Configure Compatibility:
                        </label>
                        <select
                            className="input-premium"
                            value={selectedProductId || ''}
                            onChange={(e) => {
                                const p = products.find(prod => prod.id === Number(e.target.value));
                                if (p) handleSelectProduct(p);
                                else {
                                    setSelectedProductId('');
                                    setSelectedUnitIds([]);
                                    setSelectedGroupIds([]);
                                }
                            }}
                            style={{ width: '100%', fontSize: '0.9rem', padding: '10px 14px' }}
                        >
                            <option value="">-- Choose a Product ({products.length} in catalog) --</option>
                            {products.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.part_number} — {p.product_name || p.name} {p.compatibility_display ? `[Fits: ${p.compatibility_display}]` : '[Universal / 0 units]'}
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedProductId ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {/* Selected Product Summary Card */}
                            {selectedProduct && (
                                <div style={{
                                    padding: '12px 16px',
                                    background: 'var(--surface-hover)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '12px'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.95rem' }}>
                                            {selectedProduct.part_number} — {selectedProduct.product_name || selectedProduct.name}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            Category: <strong>{selectedProduct.category || '-'}</strong> | Brand: <strong>{selectedProduct.brand || '-'}</strong> | Stock: <strong>{selectedProduct.stock ?? 0} units</strong>
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{
                                            fontSize: '0.78rem',
                                            padding: '4px 10px',
                                            borderRadius: '12px',
                                            background: selectedProduct.compatibility_display ? 'rgba(5, 150, 105, 0.15)' : 'rgba(255,255,255,0.06)',
                                            color: selectedProduct.compatibility_display ? 'var(--primary)' : 'var(--text-muted)',
                                            border: selectedProduct.compatibility_display ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid var(--border)'
                                        }}>
                                            Fits: {selectedProduct.compatibility_display || 'Universal / Unassigned'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Platform Presets Quick-Select */}
                            {compatibilityGroups.length > 0 && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                        Quick-Apply Platform Presets:
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {compatibilityGroups.map(group => {
                                            const isGroupSelected = selectedGroupIds.includes(Number(group.id));
                                            return (
                                                <button
                                                    key={group.id}
                                                    type="button"
                                                    onClick={() => toggleProductGroup(group)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        borderRadius: '20px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        border: isGroupSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                                                        background: isGroupSelected ? 'var(--primary)' : 'var(--surface-hover)',
                                                        color: isGroupSelected ? '#fff' : 'var(--text-main)',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    {isGroupSelected ? '✓ ' : '+ '} {group.group_name} ({group.member_units?.length || 0} units)
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Motorcycle Units Grid Selection */}
                            <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                                    <div>
                                        <label style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.95rem', margin: 0 }}>
                                            <Layers size={18} style={{ color: 'var(--primary)' }} /> Motorcycle Compatibility ({selectedUnitIds.length} selected)
                                        </label>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '4px 0 0 0' }}>
                                            Select the motorcycle models that this product is compatible with.
                                        </p>
                                    </div>

                                    <div style={{ position: 'relative', width: '250px' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search motorcycle models..."
                                            className="input-premium"
                                            value={unitSearchQuery}
                                            onChange={(e) => setUnitSearchQuery(e.target.value)}
                                            style={{ paddingLeft: '32px', fontSize: '0.82rem', height: '36px', width: '100%' }}
                                        />
                                    </div>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                    gap: '8px',
                                    maxHeight: '240px',
                                    overflowY: 'auto',
                                    padding: '10px',
                                    background: 'rgba(0,0,0,0.15)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)'
                                }}>
                                    {motorcycleUnits
                                        .filter(unit => {
                                            if (!unitSearchQuery.trim()) return true;
                                            const q = unitSearchQuery.toLowerCase();
                                            return formatMotorcycleUnit(unit).toLowerCase().includes(q);
                                        })
                                        .map(unit => {
                                            const unitId = Number(unit.id);
                                            const checked = selectedUnitIds.includes(unitId);

                                            return (
                                                <label
                                                    key={unit.id}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        cursor: 'pointer',
                                                        color: 'var(--text-main)',
                                                        fontSize: '0.82rem',
                                                        padding: '6px 10px',
                                                        borderRadius: '6px',
                                                        background: checked ? 'rgba(22, 163, 74, 0.15)' : 'transparent',
                                                        border: checked ? '1px solid rgba(22, 163, 74, 0.4)' : '1px solid transparent'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleProductUnit(unitId)}
                                                        style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                                                    />
                                                    <span style={{ fontWeight: checked ? 600 : 400 }}>{formatMotorcycleUnit(unit)}</span>
                                                </label>
                                            );
                                        })}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    disabled={savingProductCompat}
                                    onClick={handleSaveProductCompatibility}
                                    style={{ height: '40px', padding: '0 20px', fontWeight: 600 }}
                                >
                                    {savingProductCompat ? 'Saving...' : 'Save Motorcycle Compatibility'}
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => {
                                        setSelectedUnitIds([]);
                                        setSelectedGroupIds([]);
                                    }}
                                    style={{ height: '40px' }}
                                >
                                    Clear Selection
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.88rem', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                            Please select a product from the dropdown above (or click <strong>Configure</strong> in the catalog overview table below) to edit its motorcycle compatibility.
                        </div>
                    )}
                </div>

                {/* Catalog Products Overview Table */}
                <div className="glass-panel" style={{ padding: '20px', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                                Product Compatibility Overview
                            </h4>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '2px 0 0 0' }}>
                                Click 'Configure' to load any product into the Motorcycle Compatibility editor.
                            </p>
                        </div>
                        <input
                            type="text"
                            placeholder="Filter catalog products..."
                            className="input-premium"
                            value={productFilterQuery}
                            onChange={(e) => setProductFilterQuery(e.target.value)}
                            style={{ width: '220px', fontSize: '0.8rem', height: '34px' }}
                        />
                    </div>
                    <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Part #</th>
                                    <th>Product Name</th>
                                    <th>Category</th>
                                    <th>Compatibility</th>
                                    <th style={{ width: '120px', textAlign: 'center' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.map(p => {
                                    const isCurrent = p.id === Number(selectedProductId);
                                    return (
                                        <tr key={p.id} style={{ background: isCurrent ? 'rgba(5, 150, 105, 0.08)' : 'transparent' }}>
                                            <td style={{ fontWeight: 600 }}>{p.part_number}</td>
                                            <td>{p.product_name || p.name}</td>
                                            <td style={{ color: 'var(--text-muted)' }}>{p.category || '-'}</td>
                                            <td>
                                                <span style={{
                                                    fontSize: '0.78rem',
                                                    padding: '3px 8px',
                                                    borderRadius: '10px',
                                                    background: p.compatibility_display ? 'rgba(5, 150, 105, 0.15)' : 'rgba(255,255,255,0.06)',
                                                    color: p.compatibility_display ? 'var(--primary)' : 'var(--text-muted)',
                                                    border: p.compatibility_display ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid var(--border)'
                                                }}>
                                                    {p.compatibility_display || 'Universal / Unassigned'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    className={isCurrent ? "btn-primary" : "btn-secondary"}
                                                    onClick={() => handleSelectProduct(p)}
                                                    style={{ padding: '4px 10px', fontSize: '0.75rem', height: '28px' }}
                                                >
                                                    {isCurrent ? 'Editing' : 'Configure'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* SECTION 2: MOTORCYCLE UNITS */}
            <section id="unit-form-section">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--text-main)', fontSize: '1.15rem' }}>
                    <Bike size={24} /> Motorcycle Units
                </h2>
                
                <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary)', fontSize: '1rem' }}>
                        {editingUnitId ? 'Edit Motorcycle Unit' : 'Add New Motorcycle Unit'}
                    </h3>
                    <form onSubmit={handleUnitSubmit} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Brand *</label>
                            <input type="text" name="brand" className="input-premium" required placeholder="e.g., Yamaha"
                                value={unitForm.brand} onChange={handleUnitChange} />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Model *</label>
                            <input type="text" name="model" className="input-premium" required placeholder="e.g., Mio i125"
                                value={unitForm.model} onChange={handleUnitChange} />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Year (Optional)</label>
                            <input type="text" name="year_model" className="input-premium" placeholder="e.g., 2023"
                                value={unitForm.year_model} onChange={handleUnitChange} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="submit" className="btn-primary" style={{ height: '42px' }}>
                                {editingUnitId ? 'Save Changes' : <><Plus size={18} /> Add Unit</>}
                            </button>
                            {editingUnitId && (
                                <button type="button" className="btn-secondary" style={{ height: '42px' }} onClick={() => { setEditingUnitId(null); resetUnitForm(); }}>
                                    Cancel
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                <div className="glass-panel" style={{ padding: 0 }}>
                    <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Brand</th>
                                    <th>Model</th>
                                    <th>Year</th>
                                    <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {motorcycleUnits.length > 0 ? motorcycleUnits.map(unit => (
                                    <tr key={unit.id}>
                                        <td style={{ fontWeight: '500' }}>{unit.brand}</td>
                                        <td>{unit.model}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{unit.year_model || '-'}</td>
                                        <td style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                            <button onClick={() => handleUnitEdit(unit)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}><Edit2 size={18} /></button>
                                            <button onClick={() => handleUnitDelete(unit.id, formatMotorcycleUnit(unit))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No motorcycle units found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* SECTION 3: COMPATIBILITY PLATFORMS */}
            <section id="group-form-section">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--text-main)', fontSize: '1.15rem' }}>
                    <Settings2 size={24} /> Compatibility Platforms
                </h2>

                <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary)', fontWeight: 600, fontSize: '1rem' }}>
                        {editingGroupId ? 'Edit Platform Group' : 'Add New Platform Group'}
                    </h3>
                    <form onSubmit={handleGroupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 300px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Platform Name *</label>
                                <input type="text" name="group_name" className="input-premium" required placeholder="e.g., Yamaha Mio Platform"
                                    value={groupForm.group_name} onChange={handleGroupChange} />
                            </div>
                            <div style={{ flex: '2 1 400px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Description</label>
                                <input type="text" name="description" className="input-premium" placeholder="e.g., Shared parts for Mio family scooters"
                                    value={groupForm.description} onChange={handleGroupChange} />
                            </div>
                        </div>

                        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <label style={{ display: 'block', marginBottom: '12px', color: 'var(--text-main)', fontWeight: 'bold', fontSize: '0.9rem' }}>Assign Member Units</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                                {motorcycleUnits.map(unit => {
                                    const unitId = Number(unit.id);
                                    const checked = groupForm.motorcycle_unit_ids.map(Number).includes(unitId);
                                    return (
                                        <label key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: checked ? 'var(--primary)' : 'var(--text-main)', fontSize: '0.85rem' }}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleGroupUnit(unitId)}
                                                style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                                            />
                                            {formatMotorcycleUnit(unit)}
                                        </label>
                                    );
                                })}
                            </div>
                            {motorcycleUnits.length === 0 && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No motorcycle units available. Add some units first.</div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="submit" className="btn-primary" style={{ height: '42px' }}>
                                {editingGroupId ? 'Save Platform' : <><Plus size={18} /> Add Platform</>}
                            </button>
                            {editingGroupId && (
                                <button type="button" className="btn-secondary" style={{ height: '42px' }} onClick={() => { setEditingGroupId(null); resetGroupForm(); }}>
                                    Cancel
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                <div className="glass-panel" style={{ padding: 0 }}>
                    <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Platform Name</th>
                                    <th>Description</th>
                                    <th>Member Units</th>
                                    <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {compatibilityGroups.length > 0 ? compatibilityGroups.map(group => (
                                    <tr key={group.id}>
                                        <td style={{ fontWeight: '600', color: 'var(--primary)' }}>{group.group_name}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{group.description || '-'}</td>
                                        <td>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {group.member_units?.length > 0 ? group.member_units.map(mu => (
                                                    <span key={mu.id} style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '0.8rem' }}>
                                                        {formatMotorcycleUnit(mu)}
                                                    </span>
                                                )) : <span style={{ color: 'var(--text-muted)' }}>No units</span>}
                                            </div>
                                        </td>
                                        <td style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                            <button onClick={() => handleGroupEdit(group)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}><Edit2 size={18} /></button>
                                            <button onClick={() => handleGroupDelete(group.id, group.group_name)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No platforms found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default ManageCompatibility;
