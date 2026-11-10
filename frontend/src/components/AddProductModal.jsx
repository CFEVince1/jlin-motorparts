import React, { useState, useEffect, useContext } from 'react';
import { Package, X, Plus, AlertTriangle, Layers, Tag, DollarSign, MapPin, Hash, Search, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { AuthContext } from '../context/AuthContextValue';

import { MOTORCYCLE_CATEGORIES, CANONICAL_6_CATEGORIES } from '../utils/categoryTaxonomy';

const STANDARD_BRANDS = [
  'Akrapovic', 'aRacer', 'Bando', 'Bendix', 'BOSCH', 'Brembo', 'BRT', 'Castrol', 'Corsa',
  'Daeng', 'DID', 'Domino', 'Earls', 'Endurance Pro', 'Engine Ice', 'FAG', 'Faito', 'FDR',
  'Gates', 'Heng', 'Honda', 'JVT', 'K&N', 'Kawasaki', 'Kitti', 'Kixx',
  'Koso', 'KTech', 'Maxxis', 'Michelin', 'Morin', 'Motul', 'MTRT', 'Namban',
  'NGK', 'Nissin', 'Nui Racing', 'OEM Parts', 'Ohlins', 'Option 1', 'Osaki',
  'Osram', 'Pirelli', 'QTT', 'RCB', 'Repsol', 'RS8',
  'SKF', 'Speedmate', 'SSS', 'Suzuki', 'SWR', 'TDD', 'TTGR', 'Uma Racing',
  'Yamaha', 'Yamalube', 'YBN', 'YSS', 'Yy Pang', 'Generic / Aftermarket'
];

export const AddProductModal = ({ isOpen, onClose, onSuccess, initialCategory = '', asPanel = false }) => {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';

  if (!isAdmin || !isOpen) return null;
  const [formData, setFormData] = useState({
    name: '',
    part_number: '',
    brand: '',
    category: initialCategory || 'Engine',
    cost_price: '',
    selling_price: '',
    markup_percentage: '',
    initial_stock: '',
    reorder_level: '5',
    supplier_id: '',
    supplier_name: '',
    is_serialized: false,
    serial_numbers: '',
    size: '',
    measurement: '',
    thread_type: ''
  });

  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Part Number validation states
  const [partNumberStatus, setPartNumberStatus] = useState('idle'); // 'idle' | 'validating' | 'valid' | 'invalid' | 'exists'
  const [partNumberMessage, setPartNumberMessage] = useState('');

  // Serial Number validation states
  const [serialStatus, setSerialStatus] = useState('idle'); // 'idle' | 'validating' | 'valid' | 'invalid' | 'duplicate' | 'exists'
  const [serialMessage, setSerialMessage] = useState('');
  const [parsedSerials, setParsedSerials] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        part_number: '',
        brand: '',
        category: initialCategory || 'Engine',
        cost_price: '',
        selling_price: '',
        markup_percentage: '',
        initial_stock: '',
        reorder_level: '5',
        supplier_id: '',
        supplier_name: '',
        is_serialized: false,
        serial_numbers: '',
        size: '',
        measurement: '',
        thread_type: ''
      });
      setSupplierSearch('');
      setPartNumberStatus('idle');
      setPartNumberMessage('');
      setSerialStatus('idle');
      setSerialMessage('');
      setParsedSerials([]);

      api.get('/suppliers')
        .then(res => {
          if (Array.isArray(res.data)) {
            setSuppliers(res.data);
          }
        })
        .catch(err => {
          console.error('Failed to load suppliers in modal', err);
        });
    }
  }, [isOpen, initialCategory]);

  const handlePartNumberChange = (rawVal) => {
    const sanitized = rawVal.toUpperCase().replace(/\s+/g, '-');
    setFormData(prev => ({ ...prev, part_number: sanitized }));

    if (!sanitized.trim()) {
      setPartNumberStatus('idle');
      setPartNumberMessage('');
      return;
    }

    if (sanitized.length < 2) {
      setPartNumberStatus('invalid');
      setPartNumberMessage('Please enter a valid part number (e.g., K59-A11).');
      return;
    }

    if (sanitized.length > 50) {
      setPartNumberStatus('invalid');
      setPartNumberMessage('Part number cannot exceed 50 characters');
      return;
    }

    // Accepts OEM motorcycle part number formats like "K59-A11" (alphanumeric, hyphens, and dots)
    const partNumberRegex = /^[A-Z0-9]+([-.][A-Z0-9]+)*$/;
    if (!partNumberRegex.test(sanitized)) {
      setPartNumberStatus('invalid');
      setPartNumberMessage('Please enter a valid part number (e.g., K59-A11).');
      return;
    }

    setPartNumberStatus('validating');
    setPartNumberMessage('Checking catalog availability...');
  };

  // Debounced backend validation for Part Number
  useEffect(() => {
    if (partNumberStatus !== 'validating' || !formData.part_number) return;

    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/products/validate-part-number', {
          params: { part_number: formData.part_number }
        });
        if (res.data.exists) {
          setPartNumberStatus('exists');
          setPartNumberMessage(res.data.message);
        } else if (res.data.valid) {
          setPartNumberStatus('valid');
          setPartNumberMessage(res.data.message);
        } else {
          setPartNumberStatus('invalid');
          setPartNumberMessage(res.data.message || 'Invalid part number');
        }
      } catch (err) {
        setPartNumberStatus('idle');
        setPartNumberMessage('');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [formData.part_number, partNumberStatus]);

  const handleSerialChange = (rawVal) => {
    const rawValStr = String(rawVal);
    setFormData(prev => ({ ...prev, serial_numbers: rawValStr }));

    const rawList = rawValStr
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean);

    setParsedSerials(rawList);

    if (rawList.length === 0) {
      setSerialStatus('idle');
      setSerialMessage('');
      setFormData(prev => ({ ...prev, initial_stock: '0' }));
      return;
    }

    setFormData(prev => ({ ...prev, initial_stock: String(rawList.length) }));

    // Strictly numeric only, length between 9 and 15 digits
    const numericSerialRegex = /^\d{9,15}$/;
    const invalidList = rawList.filter(s => !numericSerialRegex.test(s));
    if (invalidList.length > 0) {
      setSerialStatus('invalid');
      setSerialMessage('Serial numbers must contain numbers only and be between 9 to 15 digits long (e.g., 10029384751).');
      return;
    }

    const duplicates = rawList.filter((item, index) => rawList.indexOf(item) !== index);
    const uniqueDupes = [...new Set(duplicates)];
    if (uniqueDupes.length > 0) {
      setSerialStatus('duplicate');
      setSerialMessage(`Duplicate serial number(s) in entry: ${uniqueDupes.join(', ')}`);
      return;
    }

    setSerialStatus('validating');
    setSerialMessage('Checking database uniqueness...');
  };

  // Debounced backend validation for Serial Numbers
  useEffect(() => {
    if (serialStatus !== 'validating' || parsedSerials.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        const res = await api.post('/products/validate-serials', {
          serial_numbers: parsedSerials
        });
        if (res.data.exists) {
          setSerialStatus('exists');
          setSerialMessage(res.data.message);
        } else if (res.data.valid) {
          setSerialStatus('valid');
          setSerialMessage(res.data.message);
        } else {
          setSerialStatus('invalid');
          setSerialMessage(res.data.message || 'Invalid serials');
        }
      } catch (err) {
        setSerialStatus('idle');
        setSerialMessage('');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [parsedSerials, serialStatus]);

  if (!isOpen) return null;

  // Handle pricing and markup synchronization
  const handleCostChange = (val) => {
    const cost = parseFloat(val) || 0;
    const markup = parseFloat(formData.markup_percentage) || 0;
    let computedPrice = formData.selling_price;

    if (markup > 0 && cost > 0) {
      computedPrice = (cost * (1 + markup / 100)).toFixed(2);
    } else if (cost > 0 && parseFloat(formData.selling_price) > 0) {
      const currentPrice = parseFloat(formData.selling_price);
      const computedMarkup = Math.round(((currentPrice - cost) / cost) * 10000) / 100;
      setFormData(prev => ({
        ...prev,
        cost_price: val,
        markup_percentage: computedMarkup >= 0 ? String(computedMarkup) : '0'
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      cost_price: val,
      selling_price: computedPrice
    }));
  };

  const handlePriceChange = (val) => {
    const price = parseFloat(val) || 0;
    const cost = parseFloat(formData.cost_price) || 0;
    let computedMarkup = '';

    if (cost > 0 && price >= cost) {
      computedMarkup = String(Math.round(((price - cost) / cost) * 10000) / 100);
    } else if (cost > 0) {
      computedMarkup = '0';
    }

    setFormData(prev => ({
      ...prev,
      selling_price: val,
      markup_percentage: computedMarkup
    }));
  };

  const handleMarkupChange = (val) => {
    const markup = parseFloat(val) || 0;
    const cost = parseFloat(formData.cost_price) || 0;
    let computedPrice = formData.selling_price;

    if (cost > 0) {
      computedPrice = (cost * (1 + markup / 100)).toFixed(2);
    }

    setFormData(prev => ({
      ...prev,
      markup_percentage: val,
      selling_price: computedPrice
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Product / Part name is required');
      return;
    }

    if (!formData.part_number.trim()) {
      toast.error('Part number / SKU is required');
      return;
    }

    if (partNumberStatus === 'invalid' || partNumberStatus === 'exists') {
      toast.error(partNumberMessage || 'Please enter a valid part number (e.g., K59-A11).');
      return;
    }

    if (formData.is_serialized) {
      if (serialStatus === 'invalid' || serialStatus === 'duplicate' || serialStatus === 'exists') {
        toast.error(serialMessage || 'Serial numbers must contain numbers only and be between 9 to 15 digits long (e.g., 10029384751).');
        return;
      }
    }

    if (!formData.category) {
      toast.error('Please select a category');
      return;
    }

    const cost = parseFloat(formData.cost_price);
    if (isNaN(cost) || cost < 0) {
      toast.error('Please enter a valid supplier wholesale cost');
      return;
    }

    const price = parseFloat(formData.selling_price);
    if (isNaN(price) || price < cost) {
      toast.error('Retail selling price cannot be lower than supplier cost');
      return;
    }

    const reorder = parseInt(formData.reorder_level, 10);
    if (isNaN(reorder) || reorder < 1) {
      toast.error('Please enter a valid minimum reorder level (whole number >= 1)');
      return;
    }

    let initialStockQty = 0;
    if (formData.is_serialized) {
      const serialsArray = String(formData.serial_numbers || '')
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean);
      initialStockQty = serialsArray.length;
    } else {
      if (formData.initial_stock === '' || formData.initial_stock === null || formData.initial_stock === undefined) {
        toast.error('Initial Stock Quantity is required');
        return;
      }
      initialStockQty = Number(formData.initial_stock);
      if (isNaN(initialStockQty) || !Number.isInteger(initialStockQty) || initialStockQty < 0) {
        toast.error('Initial Stock Quantity must be a non-negative whole number (e.g. 0, 10, 50)');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        part_number: formData.part_number.trim(),
        sku: formData.part_number.trim(),
        brand: formData.brand.trim() || 'Generic / Aftermarket',
        category: formData.category,
        cost_price: cost,
        selling_price: price,
        retail_price: price,
        markup_percentage: parseFloat(formData.markup_percentage) || 0,
        initial_stock: initialStockQty,
        initial_stock_quantity: initialStockQty,
        stock: initialStockQty,
        reorder_level: reorder,
        supplier_id: formData.supplier_id ? Number(formData.supplier_id) : null,
        supplier_name: formData.supplier_name || null,
        is_serialized: formData.is_serialized ? 1 : 0,
        size: formData.size.trim() || null,
        measurement: formData.measurement.trim() || null,
        thread_type: formData.thread_type.trim() || null
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

      const res = await api.post('/products', payload);
      const createdProd = res.data.product || {
        id: res.data.productId,
        name: payload.name,
        part_number: payload.part_number,
        brand: payload.brand,
        category: payload.category,
        cost_price: cost,
        selling_price: price,
        is_serialized: payload.is_serialized
      };

      toast.success(`Product "${payload.name}" successfully registered!`);
      if (onSuccess) {
        onSuccess(createdProd);
      }
      onClose();
    } catch (err) {
      console.error('Failed to create product', err);
      const msg = err.response?.data?.message || 'Failed to register product';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const costNum = parseFloat(formData.cost_price) || 0;
  const priceNum = parseFloat(formData.selling_price) || 0;
  const profitPerUnit = Math.max(0, priceNum - costNum);

  const content = (
    <div
      id={asPanel ? 'inline-add-product-container' : undefined}
      className="put-new-product-panel"
      style={asPanel ? {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--surface, #18181b)',
        border: '1.5px solid var(--primary, #10b981)',
        borderRadius: '16px',
        boxShadow: '0 8px 30px rgba(16, 185, 129, 0.12)',
        overflow: 'hidden',
        marginBottom: '24px'
      } : {
        width: '100%',
        maxWidth: '720px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--surface, #18181b)',
        border: '1px solid var(--border, #27272a)',
        borderRadius: '14px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: asPanel ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)'
            }}
          >
            <Package size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              {asPanel ? 'Put New Product Panel (Catalog Registration)' : 'Add New Product'}
            </h2>
            <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Register motorcycle part in catalog with standardized specifications, pricing, and supplier source.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            padding: '6px 12px',
            borderRadius: '6px'
          }}
          title={asPanel ? 'Close Panel' : 'Close'}
        >
          <X size={16} />
          <span>{asPanel ? 'Close Panel' : 'Cancel'}</span>
        </button>
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '20px',
            overflowY: asPanel ? 'visible' : 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            maxHeight: asPanel ? 'none' : 'calc(92vh - 140px)'
          }}
        >
            {/* Row 1: Part Number *, Product Name *, Brand (Dropdown) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Part Number *
                  </label>
                  {partNumberStatus === 'validating' && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <RefreshCw size={11} className="animate-spin" /> Checking...
                    </span>
                  )}
                  {partNumberStatus === 'valid' && (
                    <span style={{ fontSize: '0.7rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                      <CheckCircle2 size={12} /> Available
                    </span>
                  )}
                  {(partNumberStatus === 'invalid' || partNumberStatus === 'exists') && (
                    <span style={{ fontSize: '0.7rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                      <AlertCircle size={12} /> {partNumberStatus === 'exists' ? 'Duplicate Part #' : 'Invalid'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  className="input-premium part-number-input"
                  placeholder="e.g., K59-A11"
                  value={formData.part_number}
                  onChange={(e) => handlePartNumberChange(e.target.value)}
                  required
                  disabled={submitting}
                  style={{
                    height: '36px',
                    fontSize: '0.82rem',
                    width: '100%',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    borderColor: (partNumberStatus === 'invalid' || partNumberStatus === 'exists')
                      ? '#ef4444'
                      : partNumberStatus === 'valid'
                        ? '#10b981'
                        : undefined,
                    boxShadow: (partNumberStatus === 'invalid' || partNumberStatus === 'exists')
                      ? '0 0 0 1px #ef4444'
                      : partNumberStatus === 'valid'
                        ? '0 0 0 1px #10b981'
                        : undefined
                  }}
                />
                {partNumberMessage && (
                  <div style={{
                    fontSize: '0.72rem',
                    marginTop: '4px',
                    color: (partNumberStatus === 'invalid' || partNumberStatus === 'exists') ? '#ef4444' : '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    lineHeight: 1.2
                  }}>
                    <span>{partNumberMessage}</span>
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Product Name *
                </label>
                <input
                  type="text"
                  className="input-premium"
                  placeholder="e.g. Brake Caliper S-Series"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  disabled={submitting}
                  autoFocus
                  style={{ height: '36px', fontSize: '0.82rem', width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Brand
                </label>
                <select
                  className="input-premium"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  disabled={submitting}
                  style={{ height: '36px', fontSize: '0.82rem', width: '100%', cursor: 'pointer' }}
                >
                  <option value="">Select Brand...</option>
                  {STANDARD_BRANDS.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Category * (Dropdown), Size, Measurement, Thread Type */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '12px'
            }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Category *
                </label>
                <select
                  className="input-premium"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                  disabled={submitting}
                  style={{ height: '36px', fontSize: '0.82rem', width: '100%', cursor: 'pointer' }}
                >
                  <option value="">Select Category *</option>
                  {MOTORCYCLE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Size
                </label>
                <input
                  type="text"
                  className="input-premium"
                  placeholder="Size (e.g. 14 inch)"
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  disabled={submitting}
                  style={{ height: '36px', fontSize: '0.82rem', width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Measurement
                </label>
                <input
                  type="text"
                  className="input-premium"
                  placeholder="Measurement (e.g. 260mm)"
                  value={formData.measurement}
                  onChange={(e) => setFormData({ ...formData, measurement: e.target.value })}
                  disabled={submitting}
                  style={{ height: '36px', fontSize: '0.82rem', width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Thread Type
                </label>
                <input
                  type="text"
                  className="input-premium"
                  placeholder="Thread (e.g. M10x1.25)"
                  value={formData.thread_type}
                  onChange={(e) => setFormData({ ...formData, thread_type: e.target.value })}
                  disabled={submitting}
                  style={{ height: '36px', fontSize: '0.82rem', width: '100%' }}
                />
              </div>
            </div>

            {/* Row 3: Initial Stock Quantity *, Reorder Level *, Supplier Cost (₱) *, Markup % (e.g., 30) *, Selling Price (₱) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '12px'
            }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Initial Stock Quantity *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="input-premium initial-stock-input"
                  placeholder={formData.is_serialized ? '0 (from serials)' : 'e.g. 50'}
                  value={formData.is_serialized ? (
                    formData.serial_numbers.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length
                  ) : formData.initial_stock}
                  onChange={(e) => {
                    if (!formData.is_serialized) {
                      setFormData({ ...formData, initial_stock: e.target.value });
                    }
                  }}
                  readOnly={formData.is_serialized}
                  required
                  disabled={submitting}
                  style={{
                    height: '36px',
                    fontSize: '0.82rem',
                    width: '100%',
                    background: formData.is_serialized ? 'var(--surface-hover)' : undefined,
                    cursor: formData.is_serialized ? 'not-allowed' : undefined
                  }}
                  title={formData.is_serialized ? 'Calculated automatically from entered serial numbers' : 'Initial physical stock quantity added to inventory'}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Reorder Level *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="input-premium"
                  placeholder="e.g. 5"
                  value={formData.reorder_level}
                  onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })}
                  required
                  disabled={submitting}
                  style={{ height: '36px', fontSize: '0.82rem', width: '100%' }}
                  title="Minimum stock threshold for Low Stock Alerts (does not affect current stock count)"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Supplier Cost (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-premium"
                  placeholder="e.g. 250.00"
                  value={formData.cost_price}
                  onChange={(e) => handleCostChange(e.target.value)}
                  required
                  disabled={submitting}
                  style={{ height: '36px', fontSize: '0.82rem', width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Markup % (e.g., 30) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-premium"
                  placeholder="e.g. 30"
                  value={formData.markup_percentage}
                  onChange={(e) => handleMarkupChange(e.target.value)}
                  required
                  disabled={submitting}
                  style={{ height: '36px', fontSize: '0.82rem', width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Selling Price (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-premium"
                  placeholder="Selling Price (₱)"
                  value={formData.selling_price}
                  readOnly
                  disabled
                  style={{
                    height: '36px',
                    fontSize: '0.82rem',
                    width: '100%',
                    fontWeight: 'bold',
                    color: 'var(--primary)',
                    background: 'var(--surface-hover)',
                    cursor: 'not-allowed'
                  }}
                  title="Selling Price = Cost + (Cost × Markup %)"
                />
              </div>
            </div>

            {/* Row 4: Product Type toggle (Non-Serialized vs Serialized) with helper text */}
            <div style={{
              padding: '12px 14px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>
                  Product Type *
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  (Inventory Tracking Mode)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{
                  display: 'inline-flex',
                  gap: '14px',
                  alignItems: 'center',
                  padding: '6px 14px',
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '0.82rem'
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 500 }}>
                    <input
                      type="radio"
                      name="modal_product_type"
                      checked={!formData.is_serialized}
                      onChange={() => setFormData({ ...formData, is_serialized: false, serial_numbers: '' })}
                      style={{ accentColor: 'var(--primary)', width: '15px', height: '15px' }}
                      disabled={submitting}
                    />
                    <span>Non-Serialized (Bulk Qty)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 500 }}>
                    <input
                      type="radio"
                      name="modal_product_type"
                      checked={formData.is_serialized}
                      onChange={() => setFormData({ ...formData, is_serialized: true })}
                      style={{ accentColor: 'var(--primary)', width: '15px', height: '15px' }}
                      disabled={submitting}
                    />
                    <span>Serialized (Unique Serial / Lot Tracked)</span>
                  </label>
                </div>

                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', flex: '1 1 250px' }}>
                  {formData.is_serialized ? (
                    <>💡 <strong>Serialized:</strong> Each item tracked with a unique serial number (e.g. ECU, engine blocks). Stock increases as serials are added.</>
                  ) : (
                    <>💡 <strong>Non-Serialized:</strong> Tracked in bulk quantity (e.g. spark plugs, brake pads, fluids). Stock replenished via Stock Receive.</>
                  )}
                </span>
              </div>

              {formData.is_serialized && (
                <div style={{
                  marginTop: '6px',
                  padding: '12px 14px',
                  background: 'var(--surface-hover)',
                  borderRadius: '8px',
                  border: `1px solid ${
                    (serialStatus === 'invalid' || serialStatus === 'duplicate' || serialStatus === 'exists')
                      ? '#ef4444'
                      : serialStatus === 'valid'
                        ? '#10b981'
                        : 'var(--border)'
                  }`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <label style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Hash size={13} /> Unique Serial Number(s) *
                    </label>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Enter 1 per line or comma-separated (9-15 numbers only, e.g., 10029384751, 9847201948293)
                    </span>
                  </div>
                  <textarea
                    placeholder={"ENTER SERIAL NUMBERS (9-15 digits each, 1 per line or comma-separated):\n10029384751\n9847201948293\n582910482910384"}
                    className="input-premium serial-numbers-input"
                    style={{
                      height: '68px',
                      resize: 'vertical',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      textTransform: 'uppercase',
                      padding: '8px 10px',
                      borderColor: (serialStatus === 'invalid' || serialStatus === 'duplicate' || serialStatus === 'exists')
                        ? '#ef4444'
                        : serialStatus === 'valid'
                          ? '#10b981'
                          : undefined
                    }}
                    value={formData.serial_numbers}
                    onChange={(e) => handleSerialChange(e.target.value)}
                  />

                  {/* Real-time Serial Validation Status Banner */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                    {parsedSerials.length > 0 ? (
                      <div style={{
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: (serialStatus === 'invalid' || serialStatus === 'duplicate' || serialStatus === 'exists') ? '#ef4444' : '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        {(serialStatus === 'invalid' || serialStatus === 'duplicate' || serialStatus === 'exists') ? (
                          <>
                            <AlertCircle size={13} />
                            <span>{serialMessage}</span>
                          </>
                        ) : serialStatus === 'validating' ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" />
                            <span>Checking database serial uniqueness...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={13} />
                            <span>✓ {parsedSerials.length} valid unique serial unit(s) ready to add to inventory</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Leave blank if receiving stock later through Stock Receive, or enter initial serials above.
                      </div>
                    )}

                    {parsedSerials.length > 0 && (
                      <span style={{
                        fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        background: (serialStatus === 'invalid' || serialStatus === 'duplicate' || serialStatus === 'exists')
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(16, 185, 129, 0.15)',
                        color: (serialStatus === 'invalid' || serialStatus === 'duplicate' || serialStatus === 'exists')
                          ? '#ef4444'
                          : '#10b981',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 700
                      }}>
                        Total: {parsedSerials.length} Units
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Supplier Selection Field (Right below Row 4 Product Type toggle) */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px'
            }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block' }}>
                Supplier *
              </label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', maxWidth: '640px' }}>
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="input-premium"
                    placeholder="Search supplier..."
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    style={{ paddingLeft: '32px', height: '36px', fontSize: '0.82rem', width: '100%' }}
                  />
                </div>
                <select
                  className="input-premium"
                  required
                  value={formData.supplier_id || ''}
                  onChange={(e) => {
                    const sId = e.target.value;
                    const found = suppliers.find(s => String(s.id) === String(sId));
                    setFormData({
                      ...formData,
                      supplier_id: sId,
                      supplier_name: found ? found.name : ''
                    });
                  }}
                  style={{
                    flex: '1 1 240px',
                    height: '36px',
                    fontSize: '0.82rem',
                    padding: '7px 11px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Select Supplier *</option>
                  {suppliers
                    .filter(s => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
                    .map(sup => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name}
                      </option>
                    ))}
                </select>
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Source vendor supplying this part (e.g., Brembo & RCB Online Hub, J-Lin Racing Parts, Maniquez Motor Parts, Outflow Racing PH).
              </span>
            </div>
          </div>

          {/* Modal Footer - Action Buttons aligned bottom left */}
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '10px',
              background: 'rgba(255, 255, 255, 0.02)'
            }}
          >
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{
                padding: '8px 20px',
                fontSize: '0.84rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} />
              <span>{submitting ? 'Registering...' : '+ Add to Catalog'}</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={submitting}
              style={{ padding: '8px 16px', fontSize: '0.84rem', cursor: 'pointer' }}
            >
              {asPanel ? 'Close Panel' : 'Cancel'}
            </button>
          </div>
        </form>
    </div>
  );

  if (asPanel) {
    return content;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      {content}
    </div>
  );
};

export default AddProductModal;
