// frontend/src/components/FitmentSearchWidget.jsx
import React, { useState, useEffect } from 'react';
import { Search, CheckCircle2, XCircle, Layers, X, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatters';

export default function FitmentSearchWidget() {
  const [options, setOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Cascading Selection State
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModelName, setSelectedModelName] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');

  // Results State
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await api.get('/compatibility/options');
        setOptions(res.data || []);
      } catch (err) {
        console.error('Failed to load compatibility options', err);
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

  // Group unique model names
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
      setIsExpanded(true);
    } catch (err) {
      console.error('Compatibility search failed', err);
      toast.error('Failed to query compatibility matrix');
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    setSelectedBrand('');
    setSelectedModelName('');
    setSelectedModelId('');
    setSearchResults(null);
  };

  return (
    <div
      className="glass-panel"
      style={{
        padding: '16px 20px',
        marginBottom: '16px',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Search size={18} style={{ color: 'var(--primary)' }} />
          <h3
            style={{
              fontSize: '0.85rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-main)',
              margin: 0
            }}
          >
            Motorcycle Fitment & Compatibility Search
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            (Instant parts lookup for customer inquiries)
          </span>
        </div>

        {searchResults && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setIsExpanded(prev => !prev)}
              className="btn-secondary"
              style={{
                padding: '4px 8px',
                fontSize: '0.72rem',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {isExpanded ? 'Collapse Results' : 'Show Results'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="btn-secondary"
              style={{
                padding: '4px 8px',
                fontSize: '0.72rem',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
              title="Close"
            >
              <X size={14} /> Close
            </button>
          </div>
        )}
      </div>

      {/* Cascading Search Controls */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) 150px',
          gap: '10px',
          alignItems: 'flex-end'
        }}
      >
        {/* Brand */}
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            1. Brand / Make
          </label>
          <select
            className="input-premium"
            value={selectedBrand}
            onChange={(e) => handleBrandChange(e.target.value)}
            disabled={loadingOptions || searching}
            style={{ width: '100%', fontSize: '0.82rem', padding: '7px 10px', cursor: 'pointer' }}
          >
            <option value="">-- Choose Brand --</option>
            {brands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            2. Model
          </label>
          <select
            className="input-premium"
            value={selectedModelName}
            onChange={(e) => handleModelNameChange(e.target.value)}
            disabled={!selectedBrand || searching}
            style={{ width: '100%', fontSize: '0.82rem', padding: '7px 10px', cursor: 'pointer' }}
          >
            <option value="">-- Choose Model --</option>
            {uniqueModelNames.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Version / Year */}
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            3. Version / Year
          </label>
          <select
            className="input-premium"
            value={selectedModelId}
            onChange={(e) => handleVersionChange(e.target.value)}
            disabled={!selectedModelName || searching}
            style={{ width: '100%', fontSize: '0.82rem', padding: '7px 10px', cursor: 'pointer' }}
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
            type="button"
            className="btn-primary"
            style={{
              width: '100%',
              height: '35px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              cursor: selectedModelId && !searching ? 'pointer' : 'not-allowed',
              opacity: selectedModelId ? 1 : 0.6
            }}
            onClick={handleSearch}
            disabled={!selectedModelId || searching}
          >
            <Search size={15} /> {searching ? 'Checking...' : 'Check Fitment'}
          </button>
        </div>
      </div>

      {/* Results Dropdown / Panel */}
      {searchResults && isExpanded && (
        <div
          style={{
            marginTop: '16px',
            borderTop: '1px solid var(--border)',
            paddingTop: '14px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '14px'
          }}
        >
          {/* Compatible Parts */}
          <div
            style={{
              background: 'var(--surface-hover)',
              borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '12px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '8px'
              }}
            >
              <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--success)' }}>
                Confirmed Compatible Parts ({searchResults.compatible?.length || 0})
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
              {searchResults.compatible?.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                  No compatible items registered for this model version.
                </div>
              ) : (
                searchResults.compatible.map((item, idx) => (
                  <div
                    key={item.item_id || item.id || item.sku || idx}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-main)' }}>
                        {item.product_name || item.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Part #: <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>{item.part_number}</span> | {item.brand || 'Generic'}
                      </div>
                      {item.notes && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontStyle: 'italic', marginTop: '2px' }}>
                          Note: "{item.notes}"
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--primary)' }}>
                        {formatCurrency(item.price || item.selling_price || 0)}
                      </div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          color: (item.stock ?? item.current_stock ?? 0) > 0 ? 'var(--success)' : 'var(--danger)'
                        }}
                      >
                        {(item.stock ?? item.current_stock ?? 0) > 0
                          ? `${item.stock ?? item.current_stock} in stock`
                          : 'Out of stock'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Incompatible Parts */}
          <div
            style={{
              background: 'var(--surface-hover)',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '12px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '8px'
              }}
            >
              <XCircle size={16} style={{ color: 'var(--danger)' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--danger)' }}>
                Explicitly Incompatible Parts ({searchResults.incompatible?.length || 0})
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
              {searchResults.incompatible?.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                  No known incompatible parts logged for this model.
                </div>
              ) : (
                searchResults.incompatible.map((item, idx) => (
                  <div
                    key={item.item_id || item.id || item.sku || idx}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-main)' }}>
                        {item.product_name || item.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Part #: <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>{item.part_number}</span>
                      </div>
                      {item.notes && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--danger)', fontStyle: 'italic', marginTop: '2px' }}>
                          Warning: "{item.notes}"
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span className="badge-pill" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: '0.68rem' }}>
                        DO NOT INSTALL
                      </span>
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
}
