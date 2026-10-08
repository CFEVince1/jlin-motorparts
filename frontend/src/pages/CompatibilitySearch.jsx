import React, { useState, useEffect } from 'react';
import { Search, CheckCircle2, XCircle, AlertCircle, Layers } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatters';

/**
 * CompatibilitySearch Page
 * 
 * Target vehicle selector & fitment lookup:
 * - 3 cascading dropdowns: Brand -> Model -> Version (Year/Variant).
 * - "Check Compatibility" button fetching GET /api/compatibility/search?modelId=X.
 * - Split-view display:
 *   - Compatible parts (green badge, stock level, price, fitment notes).
 *   - Incompatible parts (red badge, notes).
 */
export const CompatibilitySearch = () => {
  const [options, setOptions] = useState([]); // [{ brand, models: [{ id, name, version }] }]
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Cascading Selection State
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModelName, setSelectedModelName] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');

  // Results State
  const [searchResults, setSearchResults] = useState(null); // { compatible: [], incompatible: [] }
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await api.get('/compatibility/options');
        setOptions(res.data || []);
      } catch (err) {
        console.error('Failed to load compatibility options', err);
        toast.error('Failed to load motorcycle vehicle hierarchy');
      } finally {
        setLoadingOptions(false);
      }
    };
    fetchOptions();
  }, []);

  // Compute available brands
  const brands = options.map(o => o.brand);

  // Compute available models for selected brand
  const selectedBrandData = options.find(o => o.brand === selectedBrand);
  const modelsInBrand = selectedBrandData?.models || [];

  // Group unique model names (API returns { model: "Aerox 155", versions: [...] })
  const uniqueModelNames = [...new Set(modelsInBrand.map(m => m.model || m.name))];

  // Selected model group
  const selectedModelGroup = modelsInBrand.find(m => (m.model || m.name) === selectedModelName);
  const versionsInModel = selectedModelGroup?.versions || [];

  const handleBrandChange = (brand) => {
    setSelectedBrand(brand);
    setSelectedModelName('');
    setSelectedModelId('');
    setSearchResults(null);
  };

  const handleModelNameChange = (name) => {
    setSelectedModelName(name);
    setSelectedModelId('');
    setSearchResults(null);
  };

  const handleVersionChange = (modelId) => {
    setSelectedModelId(modelId);
  };

  const handleSearch = async () => {
    if (!selectedModelId) {
      toast.error('Please select Brand, Model, and specific Version/Year');
      return;
    }

    setSearching(true);
    try {
      const res = await api.get(`/compatibility/search?modelId=${selectedModelId}`);
      setSearchResults(res.data || { compatible: [], incompatible: [] });
    } catch (err) {
      console.error('Compatibility search failed', err);
      toast.error('Failed to query compatibility matrix');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ marginBottom: '6px' }}>Motorcycle Fitment & Compatibility Search</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
          Verify OEM and aftermarket part fitment by motorcycle make, model, and version to prevent costly order mistakes.
        </p>
      </div>

      {/* Cascading Filter Header Panel */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} style={{ color: 'var(--primary)' }} /> Select Target Motorcycle Unit
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) 160px', gap: '14px', alignItems: 'flex-end' }}>
          {/* Brand Dropdown */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              1. Brand / Make
            </label>
            <select
              className="input-premium"
              value={selectedBrand}
              onChange={(e) => handleBrandChange(e.target.value)}
              disabled={loadingOptions || searching}
            >
              <option value="">-- Choose Brand --</option>
              {brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Model Dropdown */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              2. Motorcycle Model
            </label>
            <select
              className="input-premium"
              value={selectedModelName}
              onChange={(e) => handleModelNameChange(e.target.value)}
              disabled={!selectedBrand || searching}
            >
              <option value="">-- Choose Model --</option>
              {uniqueModelNames.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Version / Year Dropdown */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              3. Version / Generation
            </label>
            <select
              className="input-premium"
              value={selectedModelId}
              onChange={(e) => handleVersionChange(e.target.value)}
              disabled={!selectedModelName || searching}
            >
              <option value="">-- Choose Version --</option>
              {versionsInModel.map(v => (
                <option key={v.id} value={v.id}>
                  {v.version || 'Standard'} {v.year_range ? `(${v.year_range})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Search Action */}
          <div>
            <button
              className="btn-primary"
              style={{ width: '100%', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={handleSearch}
              disabled={!selectedModelId || searching}
            >
              <Search size={16} /> {searching ? 'Searching...' : 'Check Fitment'}
            </button>
          </div>
        </div>
      </div>

      {/* Split-View Results Section */}
      {searchResults && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          {/* Compatible Parts Column */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--success)' }}>
                  Confirmed Compatible Parts ({searchResults.compatible?.length || 0})
                </h3>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {searchResults.compatible?.length === 0 ? (
                <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No compatible items registered for this model version.
                </div>
              ) : (
                searchResults.compatible.map((item, idx) => (
                  <div key={item.item_id || item.id || item.sku || idx} style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                          {item.product_name || item.name}
                        </span>
                        <span className="badge-pill" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                          COMPATIBLE
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Part #: <strong style={{ color: 'var(--text-main)' }}>{item.part_number}</strong> | {item.brand || 'No Brand'}
                      </div>
                      {item.notes && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', marginTop: '4px', fontStyle: 'italic' }}>
                          Fitment Note: "{item.notes}"
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.95rem' }}>
                        {formatCurrency(item.price || item.selling_price || 0)}
                      </div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: item.stock > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        Stock: {item.stock ?? item.current_stock ?? 0}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Incompatible Parts Column */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <XCircle size={20} style={{ color: 'var(--danger)' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--danger)' }}>
                  Explicitly Incompatible Parts ({searchResults.incompatible?.length || 0})
                </h3>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {searchResults.incompatible?.length === 0 ? (
                <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No known incompatible parts logged for this model version.
                </div>
              ) : (
                searchResults.incompatible.map((item, idx) => (
                  <div key={item.item_id || item.id || item.sku || idx} style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                          {item.product_name || item.name}
                        </span>
                        <span className="badge-pill" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                          DO NOT INSTALL
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Part #: <strong style={{ color: 'var(--text-main)' }}>{item.part_number}</strong> | {item.brand || 'No Brand'}
                      </div>
                      {item.notes && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '4px', fontWeight: '500' }}>
                          Warning: "{item.notes}"
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                        {formatCurrency(item.price || item.selling_price || 0)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Stock: {item.stock ?? item.current_stock ?? 0}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompatibilitySearch;
