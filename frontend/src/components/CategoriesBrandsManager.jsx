import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  Building2,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  X,
  Search,
  RefreshCw,
  Package,
  Layers,
  AlertTriangle,
  Flag,
  Wrench,
  Globe,
  Lock
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import Spinner from './Spinner';

const getCategoryColor = (code) => {
  switch ((code || '').toUpperCase()) {
    case 'ENG':
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.35)' };
    case 'BRK':
      return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.35)' };
    case 'CHAS':
      return { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.35)' };
    case 'CVT':
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.35)' };
    case 'ELEC':
      return { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.35)' };
    case 'OIL':
      return { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.35)' };
    case 'TIRE':
      return { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.35)' };
    case 'WHL':
      return { bg: 'rgba(2, 132, 199, 0.15)', text: '#0284c7', border: 'rgba(2, 132, 199, 0.35)' };
    case 'SUSP':
      return { bg: 'rgba(20, 184, 166, 0.15)', text: '#14b8a6', border: 'rgba(20, 184, 166, 0.35)' };
    case 'EXH':
      return { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: 'rgba(249, 115, 22, 0.35)' };
    case 'CHN':
      return { bg: 'rgba(132, 204, 22, 0.15)', text: '#84cc16', border: 'rgba(132, 204, 22, 0.35)' };
    case 'HNDL':
      return { bg: 'rgba(99, 102, 241, 0.15)', text: '#6366f1', border: 'rgba(99, 102, 241, 0.35)' };
    case 'LGHT':
      return { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: 'rgba(234, 179, 8, 0.35)' };
    case 'BLT':
      return { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', border: 'rgba(100, 116, 139, 0.35)' };
    case 'BODY':
      return { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.35)' };
    case 'GEAR':
      return { bg: 'rgba(217, 70, 239, 0.15)', text: '#d946ef', border: 'rgba(217, 70, 239, 0.35)' };
    default:
      return { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' };
  }
};

const getCountryFlag = (country) => {
  if (!country) return '🏁';
  const c = country.toLowerCase();
  if (c.includes('japan')) return '🇯🇵';
  if (c.includes('malaysia')) return '🇲🇾';
  if (c.includes('italy')) return '🇮🇹';
  if (c.includes('taiwan')) return '🇹🇼';
  if (c.includes('philippines')) return '🇵🇭';
  if (c.includes('thailand')) return '🇹🇭';
  if (c.includes('slovenia')) return '🇸🇮';
  if (c.includes('germany')) return '🇩🇪';
  if (c.includes('usa') || c.includes('united states')) return '🇺🇸';
  if (c.includes('indonesia')) return '🇮🇩';
  if (c.includes('uk') || c.includes('united kingdom')) return '🇬🇧';
  if (c.includes('france')) return '🇫🇷';
  return '🏁';
};

const CategoriesBrandsManager = ({ onCatalogUpdated }) => {
  const [activeSubTab, setActiveSubTab] = useState('categories'); // 'categories' | 'brands'
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add category state
  const [newCatName, setNewCatName] = useState('');
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatScope, setNewCatScope] = useState('');
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [savingCat, setSavingCat] = useState(false);

  // Add brand state
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandCountry, setNewBrandCountry] = useState('Philippines');
  const [newBrandSpecialty, setNewBrandSpecialty] = useState('');
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);

  // Edit category modal state
  const [editingCat, setEditingCat] = useState(null);
  const [editedCatName, setEditedCatName] = useState('');
  const [savingEditCat, setSavingEditCat] = useState(false);

  // Rename brand modal state
  const [editingBrand, setEditingBrand] = useState(null);
  const [editedBrandName, setEditedBrandName] = useState('');
  const [savingEditBrand, setSavingEditBrand] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, brandRes] = await Promise.all([
        api.get('/inventory/categories'),
        api.get('/inventory/brands')
      ]);
      setCategories(catRes.data || []);
      setBrands(brandRes.data || []);
    } catch {
      toast.error('Failed to load categories and brands');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    const cleanName = newCatName.trim();
    if (!cleanName) {
      toast.error('Please enter a category name');
      return;
    }
    setSavingCat(true);
    try {
      await api.post('/inventory/categories', { 
        name: cleanName,
        category_code: newCatCode.trim() || undefined,
        scope: newCatScope.trim() || undefined
      });
      toast.success(`Category "${cleanName}" created successfully!`);
      setNewCatName('');
      setNewCatCode('');
      setNewCatScope('');
      setIsAddingCat(false);
      fetchData();
      if (onCatalogUpdated) onCatalogUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create category');
    } finally {
      setSavingCat(false);
    }
  };

  const handleAddBrand = async (e) => {
    e.preventDefault();
    const cleanName = newBrandName.trim();
    if (!cleanName) {
      toast.error('Please enter a brand name');
      return;
    }
    setSavingBrand(true);
    try {
      await api.post('/inventory/brands', {
        name: cleanName,
        country: newBrandCountry.trim(),
        specialty: newBrandSpecialty.trim()
      });
      toast.success(`Brand "${cleanName}" added successfully!`);
      setNewBrandName('');
      setNewBrandCountry('Philippines');
      setNewBrandSpecialty('');
      setIsAddingBrand(false);
      fetchData();
      if (onCatalogUpdated) onCatalogUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add brand');
    } finally {
      setSavingBrand(false);
    }
  };

  const handleUpdateCategory = async (e) => {
    e.preventDefault();
    if (!editingCat || !editedCatName.trim()) return;
    setSavingEditCat(true);
    try {
      await api.put(`/inventory/categories/${editingCat.category_id}`, { name: editedCatName.trim() });
      toast.success(`Category renamed to "${editedCatName.trim()}"!`);
      setEditingCat(null);
      fetchData();
      if (onCatalogUpdated) onCatalogUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to rename category');
    } finally {
      setSavingEditCat(false);
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (!window.confirm(`Are you sure you want to delete category "${cat.category_name}"?`)) return;
    try {
      await api.delete(`/inventory/categories/${cat.category_id}`);
      toast.success(`Category "${cat.category_name}" deleted.`);
      fetchData();
      if (onCatalogUpdated) onCatalogUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete category');
    }
  };

  const handleDeleteBrand = async (b) => {
    if (b.product_count > 0) {
      toast.error(`Cannot delete brand "${b.brand_name}" because ${b.product_count} products are linked to it.`);
      return;
    }
    if (!window.confirm(`Are you sure you want to delete brand "${b.brand_name}"?`)) return;
    try {
      await api.delete(`/inventory/brands/${b.brand_id}`);
      toast.success(`Brand "${b.brand_name}" deleted.`);
      fetchData();
      if (onCatalogUpdated) onCatalogUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete brand');
    }
  };

  const handleRenameBrand = async (e) => {
    e.preventDefault();
    if (!editingBrand || !editedBrandName.trim()) return;
    setSavingEditBrand(true);
    try {
      await api.put('/inventory/brands/rename', {
        old_name: editingBrand.brand_name,
        new_name: editedBrandName.trim()
      });
      toast.success(`Brand updated to "${editedBrandName.trim()}" across all products!`);
      setEditingBrand(null);
      fetchData();
      if (onCatalogUpdated) onCatalogUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to rename brand');
    } finally {
      setSavingEditBrand(false);
    }
  };

  const filteredCategories = categories.filter(c =>
    (c.category_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.category_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.scope || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredBrands = brands.filter(b =>
    (b.brand_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.country_origin || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.specialty || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Controls & Sub-Tab Switcher */}
      <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className={activeSubTab === 'categories' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => { setActiveSubTab('categories'); setSearchQuery(''); }}
            style={{
              padding: '8px 16px',
              fontSize: '0.86rem',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Tag size={16} />
            <span>Racing Categories ({categories.length})</span>
          </button>

          <button
            type="button"
            className={activeSubTab === 'brands' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => { setActiveSubTab('brands'); setSearchQuery(''); }}
            style={{
              padding: '8px 16px',
              fontSize: '0.86rem',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Building2 size={16} />
            <span>Racing Brands ({brands.length})</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 320px', maxWidth: '450px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={activeSubTab === 'categories' ? 'Search category name, code, or keyword...' : 'Search brand, country, specialty...'}
              className="input-premium"
              style={{ paddingLeft: '32px', width: '100%', height: '36px', fontSize: '0.84rem' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {activeSubTab === 'categories' ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setIsAddingCat(true)}
              style={{ height: '36px', padding: '0 14px', fontSize: '0.84rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={15} /> Add Category
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setIsAddingBrand(true)}
              style={{ height: '36px', padding: '0 14px', fontSize: '0.84rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={15} /> Add Brand
            </button>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={fetchData}
            style={{ height: '36px', width: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Inline Form to Add Category */}
      {isAddingCat && (
        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.05)', border: '1.5px solid rgba(16, 185, 129, 0.3)' }}>
          <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  CATEGORY NAME *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fairings & Body Kits, Cooling Systems..."
                  className="input-premium"
                  style={{ width: '100%', height: '38px', fontSize: '0.86rem' }}
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  autoFocus
                  required
                  disabled={savingCat}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  SHORT CODE (3-4 Chars)
                </label>
                <input
                  type="text"
                  placeholder="e.g. BODY, COOL, EXH"
                  className="input-premium"
                  maxLength={5}
                  style={{ width: '100%', height: '38px', fontSize: '0.86rem', textTransform: 'uppercase' }}
                  value={newCatCode}
                  onChange={(e) => setNewCatCode(e.target.value.toUpperCase())}
                  disabled={savingCat}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  RACING PARTS COVERED (SCOPE)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Radiators, Oil Coolers, Water Pumps..."
                  className="input-premium"
                  style={{ width: '100%', height: '38px', fontSize: '0.86rem' }}
                  value={newCatScope}
                  onChange={(e) => setNewCatScope(e.target.value)}
                  disabled={savingCat}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setIsAddingCat(false); setNewCatName(''); setNewCatCode(''); setNewCatScope(''); }}
                style={{ height: '38px', padding: '0 14px', fontSize: '0.84rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={savingCat}
                style={{ height: '38px', padding: '0 16px', fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <CheckCircle size={15} /> {savingCat ? 'Saving...' : 'Save Category'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inline Form to Add Brand */}
      {isAddingBrand && (
        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.05)', border: '1.5px solid rgba(56, 189, 248, 0.3)' }}>
          <form onSubmit={handleAddBrand} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  BRAND / MANUFACTURER NAME *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Uma Racing, Brembo, RCB, Ohlins..."
                  className="input-premium"
                  style={{ width: '100%', height: '38px', fontSize: '0.86rem' }}
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  autoFocus
                  required
                  disabled={savingBrand}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  COUNTRY OF ORIGIN
                </label>
                <input
                  type="text"
                  placeholder="e.g. Malaysia, Japan, Italy, Taiwan..."
                  className="input-premium"
                  style={{ width: '100%', height: '38px', fontSize: '0.86rem' }}
                  value={newBrandCountry}
                  onChange={(e) => setNewBrandCountry(e.target.value)}
                  disabled={savingBrand}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  RACING SPECIALTY / SIGNATURE PARTS
                </label>
                <input
                  type="text"
                  placeholder="e.g. Superheads, Radial Calipers, Belts..."
                  className="input-premium"
                  style={{ width: '100%', height: '38px', fontSize: '0.86rem' }}
                  value={newBrandSpecialty}
                  onChange={(e) => setNewBrandSpecialty(e.target.value)}
                  disabled={savingBrand}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setIsAddingBrand(false); setNewBrandName(''); setNewBrandCountry('Philippines'); setNewBrandSpecialty(''); }}
                style={{ height: '38px', padding: '0 14px', fontSize: '0.84rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={savingBrand}
                style={{ height: '38px', padding: '0 16px', fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <CheckCircle size={15} /> {savingBrand ? 'Saving...' : 'Save Brand'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Content Grid / Table */}
      {loading ? (
        <Spinner text="Loading categories and brands..." />
      ) : activeSubTab === 'categories' ? (
        /* CATEGORIES VIEW */
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={17} color="var(--primary)" /> Master Motorcycle Racing Categories
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Showing {filteredCategories.length} categories
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {filteredCategories.map(cat => {
              const badgeStyle = getCategoryColor(cat.category_code);
              return (
                <div
                  key={cat.category_id}
                  style={{
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--text-main)' }}>
                          {cat.category_name}
                        </span>
                        {cat.category_code && (
                          <span style={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            fontSize: '0.70rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: badgeStyle.bg,
                            color: badgeStyle.text,
                            border: `1px solid ${badgeStyle.border}`
                          }}>
                            {cat.category_code}
                          </span>
                        )}
                      </div>
                      {cat.scope && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.3' }}>
                          {cat.scope}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => { setEditingCat(cat); setEditedCatName(cat.category_name); }}
                        className="btn-secondary"
                        style={{ padding: '6px', borderRadius: '6px' }}
                        title="Rename Category"
                      >
                        <Edit2 size={13} style={{ color: '#38bdf8' }} />
                      </button>
                      {cat.product_count > 0 ? (
                        <span
                          style={{
                            padding: '6px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-muted)',
                            cursor: 'not-allowed'
                          }}
                          title={`Category locked: ${cat.product_count} active parts linked (${cat.total_units || 0} units stock). Cannot delete while inventory is linked.`}
                        >
                          <Lock size={13} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="btn-secondary"
                          style={{ padding: '6px', borderRadius: '6px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          title="Delete Empty Category"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{
                    fontSize: '0.74rem',
                    color: 'var(--text-muted)',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span><strong style={{ color: 'var(--primary)' }}>{cat.product_count}</strong> parts linked</span>
                    <span>•</span>
                    <span><strong>{cat.total_units}</strong> units stock</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* BRANDS VIEW */
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={17} color="#38bdf8" /> Motorcycle Racing Brands & Aftermarket Manufacturers
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Showing {filteredBrands.length} racing brands
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '12px' }}>
            {filteredBrands.map(b => (
              <div
                key={b.brand_id || b.brand_name}
                style={{
                  background: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                        {b.brand_name}
                      </span>
                      {b.country_origin && (
                        <span style={{
                          fontSize: '0.68rem',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          padding: '1px 5px',
                          color: 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}>
                          <span>{getCountryFlag(b.country_origin)}</span>
                          <span>{b.country_origin}</span>
                        </span>
                      )}
                    </div>
                    {b.specialty && (
                      <div style={{
                        fontSize: '0.72rem',
                        color: '#38bdf8',
                        marginTop: '3px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }} title={b.specialty}>
                        {b.specialty}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => { setEditingBrand(b); setEditedBrandName(b.brand_name); }}
                      className="btn-secondary"
                      style={{ padding: '5px', borderRadius: '6px' }}
                      title="Rename Brand Across Products"
                    >
                      <Edit2 size={12} style={{ color: '#38bdf8' }} />
                    </button>
                    {b.brand_id ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteBrand(b)}
                        className="btn-secondary"
                        style={{ padding: '5px', borderRadius: '6px', opacity: b.product_count > 0 ? 0.35 : 1 }}
                        title={b.product_count > 0 ? 'Cannot delete brand with catalog products' : 'Delete Brand'}
                        disabled={b.product_count > 0}
                      >
                        <Trash2 size={12} style={{ color: '#ef4444' }} />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  paddingTop: '6px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span><strong style={{ color: '#38bdf8' }}>{b.product_count}</strong> catalog parts</span>
                  <span>•</span>
                  <span><strong>{b.total_units}</strong> units stock</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCat && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '16px'
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)',
            boxShadow: 'var(--glass-shadow)', width: '100%', maxWidth: '420px', padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Rename Category</h3>
              <button type="button" className="btn-secondary" onClick={() => setEditingCat(null)} style={{ padding: '4px' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleUpdateCategory} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  CATEGORY NAME
                </label>
                <input
                  type="text"
                  className="input-premium"
                  value={editedCatName}
                  onChange={(e) => setEditedCatName(e.target.value)}
                  style={{ width: '100%' }}
                  required
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingCat(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingEditCat}>
                  {savingEditCat ? 'Saving...' : 'Update Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Brand Modal */}
      {editingBrand && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '16px'
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)',
            boxShadow: 'var(--glass-shadow)', width: '100%', maxWidth: '420px', padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Rename Brand Across Catalog</h3>
              <button type="button" className="btn-secondary" onClick={() => setEditingBrand(null)} style={{ padding: '4px' }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: '0 0 14px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Renaming "{editingBrand.brand_name}" will automatically update all {editingBrand.product_count} associated parts in inventory.
            </p>
            <form onSubmit={handleRenameBrand} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  NEW BRAND NAME
                </label>
                <input
                  type="text"
                  className="input-premium"
                  value={editedBrandName}
                  onChange={(e) => setEditedBrandName(e.target.value)}
                  style={{ width: '100%' }}
                  required
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingBrand(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingEditBrand}>
                  {savingEditBrand ? 'Saving...' : 'Rename Everywhere'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesBrandsManager;
