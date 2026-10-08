import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Settings2, Trash2, Edit2, Plus, Bike } from 'lucide-react';
import Spinner from '../components/Spinner';
import useForm from '../hooks/useForm';

const formatMotorcycleUnit = (unit) => `${unit.brand} ${unit.model} ${unit.year_model || ''}`.trim();

const initialUnitForm = { brand: '', model: '', year_model: '' };
const initialGroupForm = { group_name: '', description: '', motorcycle_unit_ids: [] };

const ManageCompatibility = () => {
    const [motorcycleUnits, setMotorcycleUnits] = useState([]);
    const [compatibilityGroups, setCompatibilityGroups] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form states using useForm
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

    const fetchData = async () => {
        setLoading(true);
        try {
            const [unitsRes, groupsRes] = await Promise.all([
                api.get('/compatibility/motorcycle-units'),
                api.get('/compatibility/groups')
            ]);
            setMotorcycleUnits(unitsRes.data);
            setCompatibilityGroups(groupsRes.data);
        } catch {
            toast.error('Failed to load compatibility data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

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
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
        // Scroll to the group form section
        document.getElementById('group-form-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    if (loading) return <div style={{ padding: '24px' }}><Spinner text="Loading compatibility data..." /></div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '40px' }}>
            <div>
                <h1 style={{ marginBottom: '8px' }}>Manage Compatibility</h1>
                <p style={{ color: 'var(--text-muted)' }}>Configure exact motorcycle units and shared compatibility platforms.</p>
            </div>

            {/* SECTION 1: MOTORCYCLE UNITS */}
            <section>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--text-main)' }}>
                    <Bike size={24} /> Motorcycle Units
                </h2>
                
                <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary)' }}>
                        {editingUnitId ? 'Edit Motorcycle Unit' : 'Add New Motorcycle Unit'}
                    </h3>
                    <form onSubmit={handleUnitSubmit} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Brand *</label>
                            <input type="text" name="brand" className="input-premium" required placeholder="e.g., Yamaha"
                                value={unitForm.brand} onChange={handleUnitChange} />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Model *</label>
                            <input type="text" name="model" className="input-premium" required placeholder="e.g., Mio i125"
                                value={unitForm.model} onChange={handleUnitChange} />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Year (Optional)</label>
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
                    <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
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

            {/* SECTION 2: COMPATIBILITY PLATFORMS */}
            <section id="group-form-section">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--text-main)' }}>
                    <Settings2 size={24} /> Compatibility Platforms
                </h2>

                <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary)', fontWeight: 600 }}>
                        {editingGroupId ? 'Edit Platform Group' : 'Add New Platform Group'}
                    </h3>
                    <form onSubmit={handleGroupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 300px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Platform Name *</label>
                                <input type="text" name="group_name" className="input-premium" required placeholder="e.g., Yamaha Mio Platform"
                                    value={groupForm.group_name} onChange={handleGroupChange} />
                            </div>
                            <div style={{ flex: '2 1 400px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Description</label>
                                <input type="text" name="description" className="input-premium" placeholder="e.g., Shared parts for Mio family scooters"
                                    value={groupForm.description} onChange={handleGroupChange} />
                            </div>
                        </div>

                        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <label style={{ display: 'block', marginBottom: '12px', color: 'var(--text-main)', fontWeight: 'bold' }}>Assign Member Units</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                                {motorcycleUnits.map(unit => {
                                    const unitId = Number(unit.id);
                                    const checked = groupForm.motorcycle_unit_ids.map(Number).includes(unitId);
                                    return (
                                        <label key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: checked ? 'var(--primary)' : 'var(--text-main)' }}>
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
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No motorcycle units available. Add some units first.</div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="submit" className="btn-primary">
                                {editingGroupId ? 'Save Platform' : <><Plus size={18} /> Add Platform</>}
                            </button>
                            {editingGroupId && (
                                <button type="button" className="btn-secondary" onClick={() => { setEditingGroupId(null); resetGroupForm(); }}>
                                    Cancel
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                <div className="glass-panel" style={{ padding: 0 }}>
                    <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
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
