import React, { useState, useEffect } from 'react';
import { Edit2, X, Lock, CheckCircle, Package } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * ProductEditModal Component
 * 
 * Safe product editing modal:
 * - Displays read-only `current_stock` badge with explanation that stock cannot be changed here.
 * - Whitelists editable attributes: part_number, name, brand, category, size, measurement,
 *   thread_type, cost_price, selling_price, reorder_level.
 * - Submits via PUT /api/items/:id.
 */
export const ProductEditModal = ({
  isOpen,
  onClose,
  product, // product item object
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    part_number: '',
    name: '',
    brand: '',
    category: '',
    size: '',
    measurement: '',
    thread_type: '',
    cost_price: '',
    markup_percentage: '',
    reorder_level: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (product) {
      const c = product.cost_price ?? '';
      const p = product.selling_price ?? product.price ?? '';
      let m = product.markup_percentage;
      if (m === undefined || m === null || m === '') {
        const cNum = parseFloat(c) || 0;
        const pNum = parseFloat(p) || 0;
        m = cNum > 0 && pNum >= cNum ? Math.round(((pNum - cNum) / cNum) * 10000) / 100 : 0;
      }
      setFormData({
        part_number: product.part_number || '',
        name: product.product_name || product.name || '',
        brand: product.brand || '',
        category: product.category || '',
        size: product.size || '',
        measurement: product.measurement || '',
        thread_type: product.thread_type || '',
        cost_price: c,
        markup_percentage: m,
        reorder_level: product.reorder_level ?? '',
      });
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const currentStock = product.current_stock ?? product.stock ?? 0;
  const productId = product.id || product.product_id;

  const costNum = parseFloat(formData.cost_price) || 0;
  const markupNum = parseFloat(formData.markup_percentage) || 0;
  // Formula: selling price = cost + (cost * percentage / 100)
  const sellingPrice = Math.round(costNum * (1 + markupNum / 100) * 100) / 100;
  const markupProfit = Math.round((sellingPrice - costNum) * 100) / 100;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.part_number.trim() || !formData.name.trim()) {
      toast.error('Part number and Name are required');
      return;
    }

    setSubmitting(true);
    try {
      await api.put(`/items/${productId}`, {
        part_number: formData.part_number.trim(),
        name: formData.name.trim(),
        brand: formData.brand.trim() || null,
        category: formData.category.trim() || null,
        size: formData.size.trim() || null,
        measurement: formData.measurement.trim() || null,
        thread_type: formData.thread_type.trim() || null,
        cost_price: costNum,
        markup_percentage: markupNum,
        selling_price: sellingPrice,
        reorder_level: formData.reorder_level !== '' ? Number(formData.reorder_level) : 0,
      });

      toast.success('Product metadata and pricing updated successfully');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to update product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="receipt-overlay no-print" style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.75)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div className="glass-panel" style={{
        background: 'var(--surface)',
        padding: '24px',
        width: '580px',
        maxWidth: '100%',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        border: '1px solid var(--border)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit2 size={20} style={{ color: 'var(--primary)' }} /> Edit Product Metadata
            </h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Update catalogue attributes and pricing
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Read-Only Current Stock Badge */}
        <div style={{
          padding: '10px 14px',
          background: 'rgba(5, 150, 105, 0.08)',
          borderRadius: '8px',
          border: '1px solid rgba(5, 150, 105, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={16} style={{ color: 'var(--primary)' }} />
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>
                Current Physical Stock: {currentStock} units
              </span>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Stock is protected by immutable ledger. To adjust stock, use Stock Receive or Adjustment screen.
              </div>
            </div>
          </div>
          <span className="badge-pill" style={{ background: 'var(--primary)', color: '#ffffff', fontWeight: 'bold' }}>
            LOCKED
          </span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Part Number *
              </label>
              <input
                type="text"
                name="part_number"
                className="input-premium"
                value={formData.part_number}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Product Name *
              </label>
              <input
                type="text"
                name="name"
                className="input-premium"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Brand
              </label>
              <input
                type="text"
                name="brand"
                className="input-premium"
                value={formData.brand}
                onChange={handleChange}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Category
              </label>
              <input
                type="text"
                name="category"
                className="input-premium"
                value={formData.category}
                onChange={handleChange}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Size
              </label>
              <input
                type="text"
                name="size"
                className="input-premium"
                value={formData.size}
                onChange={handleChange}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Measurement
              </label>
              <input
                type="text"
                name="measurement"
                className="input-premium"
                value={formData.measurement}
                onChange={handleChange}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Thread Type
              </label>
              <input
                type="text"
                name="thread_type"
                className="input-premium"
                value={formData.thread_type}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Pricing Architecture: Supplier Cost, Markup %, Auto-Computed Read-Only Selling Price */}
          <div style={{
            padding: '12px 14px',
            background: 'rgba(245, 158, 11, 0.05)',
            borderRadius: '8px',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Pricing & Markup Architecture
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Formula: Selling Price = Cost + (Cost × Markup %)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                  Supplier Cost (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="cost_price"
                  placeholder="0.00"
                  className="input-premium"
                  value={formData.cost_price}
                  onChange={handleChange}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                  Markup (%) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="markup_percentage"
                  placeholder="e.g. 30"
                  className="input-premium"
                  value={formData.markup_percentage}
                  onChange={handleChange}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>
                  Selling Price (₱) [Auto]
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={sellingPrice.toFixed(2)}
                  readOnly
                  disabled
                  className="input-premium"
                  style={{
                    fontWeight: 'bold',
                    color: 'var(--primary)',
                    background: 'var(--surface-hover)',
                    cursor: 'not-allowed',
                    borderColor: 'rgba(5, 150, 105, 0.4)'
                  }}
                />
              </div>
            </div>

            {costNum > 0 && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--surface)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <span>Unit Profit: <strong style={{ color: '#10b981' }}>+₱{markupProfit.toFixed(2)}</strong> ({markupNum}% markup)</span>
                <span>Margin on Selling: <strong>{sellingPrice > 0 ? ((markupProfit / sellingPrice) * 100).toFixed(1) : 0}%</strong></span>
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Reorder Level (Low Stock Threshold)
            </label>
            <input
              type="number"
              min="0"
              name="reorder_level"
              className="input-premium"
              value={formData.reorder_level}
              onChange={handleChange}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1 }}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1.4 }}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : (
                <>
                  <CheckCircle size={16} /> Save Product
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductEditModal;
