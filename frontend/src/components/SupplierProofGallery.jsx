import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Image,
  Plus,
  Search,
  Filter,
  Eye,
  Trash2,
  ExternalLink,
  MessageSquare,
  CreditCard,
  Truck,
  FileText,
  Calendar,
  X,
  RefreshCw,
  Copy
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import Spinner from './Spinner';

const PROOF_TYPE_CONFIG = {
  payment_proof: {
    label: 'Payment Proof (GCash / Bank)',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    icon: <CreditCard size={15} />
  },
  messenger_quote: {
    label: 'Messenger Price Agreement',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    icon: <MessageSquare size={15} />
  },
  courier_waybill: {
    label: 'Courier Delivery Waybill',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    icon: <Truck size={15} />
  }
};

const SupplierProofGallery = ({ suppliers = [], preselectedSupplierId = null }) => {
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [supplierFilter, setSupplierFilter] = useState(preselectedSupplierId ? String(preselectedSupplierId) : 'ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Upload Proof Modal
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedProofForView, setSelectedProofForView] = useState(null);

  // Form State
  const [newSupplierId, setNewSupplierId] = useState(preselectedSupplierId ? String(preselectedSupplierId) : '');
  const [newProofType, setNewProofType] = useState('payment_proof');
  const [newTitle, setNewTitle] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newReferenceNo, setNewReferenceNo] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newProofDate, setNewProofDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newNotes, setNewNotes] = useState('');

  const fetchProofs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (supplierFilter !== 'ALL') params.supplier_id = supplierFilter;
      if (typeFilter !== 'ALL') params.proof_type = typeFilter;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const res = await api.get('/suppliers/proofs', { params });
      setProofs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch supplier proofs', err);
      toast.error('Failed to load payment proofs & quotes');
    } finally {
      setLoading(false);
    }
  }, [supplierFilter, typeFilter, searchTerm]);

  useEffect(() => {
    fetchProofs();
  }, [fetchProofs]);

  // Keep supplier filter updated if prop changes
  useEffect(() => {
    if (preselectedSupplierId) {
      setSupplierFilter(String(preselectedSupplierId));
    }
  }, [preselectedSupplierId]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setNewImageUrl(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateProof = async (e) => {
    e.preventDefault();
    if (!newSupplierId) {
      toast.error('Please select a Facebook supplier');
      return;
    }
    if (!newTitle.trim()) {
      toast.error('Please enter a descriptive title');
      return;
    }
    if (!newImageUrl.trim()) {
      toast.error('Please provide an image URL or screenshot link');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/suppliers/proofs', {
        supplier_id: Number(newSupplierId),
        proof_type: newProofType,
        title: newTitle.trim(),
        image_url: newImageUrl.trim(),
        reference_no: newReferenceNo.trim() || null,
        amount: parseFloat(newAmount) || 0,
        notes: newNotes.trim() || null
      });

      toast.success('Proof / Messenger agreement successfully added to gallery!');
      setIsUploadOpen(false);
      // Reset form
      setNewTitle('');
      setNewImageUrl('');
      setNewReferenceNo('');
      setNewAmount('');
      setNewNotes('');
      fetchProofs();
    } catch (err) {
      console.error('Failed to save proof', err);
      toast.error(err.response?.data?.message || 'Failed to save proof');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProof = async (proofId) => {
    if (!window.confirm('Are you sure you want to remove this proof document from the gallery?')) {
      return;
    }
    try {
      await api.delete(`/suppliers/proofs/${proofId}`);
      toast.success('Proof removed');
      fetchProofs();
    } catch (err) {
      toast.error('Failed to delete proof');
    }
  };

  const copyToClipboard = (text, label = 'Reference number') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header and Filter Control Bar */}
      <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Image size={22} style={{ color: 'var(--primary)' }} />
              Supplier Payment Proofs & Messenger Quotes (Middle Branch)
            </h2>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Central gallery of uploaded GCash/Bank transfer screenshots, courier waybills, and Messenger price agreements to prevent disputes.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={fetchProofs}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '8px 14px' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>

            <button
              type="button"
              id="upload-proof-quote-btn"
              className="btn-primary"
              onClick={() => {
                if (supplierFilter !== 'ALL') setNewSupplierId(supplierFilter);
                setIsUploadOpen(!isUploadOpen);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '8px 16px', fontWeight: 600 }}
            >
              <Plus size={15} />
              {isUploadOpen ? '✕ Close Form' : '+ Upload Proof / Quote'}
            </button>
          </div>
        </div>

        {/* Filter Rows */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-premium"
              placeholder="Search title, Ref #, or agreement..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '32px', width: '100%', height: '38px', fontSize: '0.82rem' }}
            />
          </div>

          {/* Supplier Filter */}
          <div>
            <select
              className="input-premium"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              style={{ width: '100%', height: '38px', fontSize: '0.82rem' }}
            >
              <option value="ALL">All Facebook Suppliers</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.fb_page_name ? `(${s.fb_page_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <select
              className="input-premium"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ width: '100%', height: '38px', fontSize: '0.82rem' }}
            >
              <option value="ALL">All Document Types</option>
              <option value="payment_proof">💳 Payment Proofs (GCash / Bank)</option>
              <option value="messenger_quote">💬 Messenger Price Agreements</option>
              <option value="courier_waybill">🚚 Courier Delivery Waybills</option>
            </select>
          </div>
        </div>
      </div>

      {/* INLINE FORM: UPLOAD PROOF OR MESSENGER AGREEMENT QUOTE (NO MODAL, NO GLASS PANEL) */}
      {isUploadOpen && (
        <div
          id="inline-upload-proof-card"
          style={{
            maxWidth: '100%',
            width: '100%',
            borderRadius: '14px',
            padding: '24px',
            border: '1.5px solid var(--primary)',
            background: 'var(--surface)',
            boxShadow: '0 8px 30px rgba(16, 185, 129, 0.12)',
            marginBottom: '20px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Image size={20} color="var(--primary)" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Upload Proof / Messenger Price Agreement
              </h3>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsUploadOpen(false)}
              disabled={submitting}
              style={{ padding: '6px' }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleCreateProof} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Supplier Selection */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                Facebook Supplier <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                className="input-premium"
                value={newSupplierId}
                onChange={(e) => setNewSupplierId(e.target.value)}
                required
                disabled={submitting}
                style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
              >
                <option value="">-- Choose Facebook Supplier --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.fb_page_name && s.fb_page_name !== s.name ? `(${s.fb_page_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Document Type & Reference No */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                  Document Type <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select
                  className="input-premium"
                  value={newProofType}
                  onChange={(e) => setNewProofType(e.target.value)}
                  disabled={submitting}
                  style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                >
                  <option value="payment_proof">💳 Payment Proof (GCash / Bank)</option>
                  <option value="messenger_quote">💬 Messenger Price Agreement</option>
                  <option value="courier_waybill">🚚 Courier Delivery Waybill</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                  Reference / Tracking / PO #
                </label>
                <input
                  type="text"
                  className="input-premium"
                  placeholder="e.g. GCash Ref # / J&T Waybill"
                  value={newReferenceNo}
                  onChange={(e) => setNewReferenceNo(e.target.value)}
                  disabled={submitting}
                  style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                />
              </div>
            </div>

            {/* Document Title */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                Document Title / Summary <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                className="input-premium"
                placeholder="e.g. ₱5,000 GCash Advance Downpayment to Seller"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                disabled={submitting}
                style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
              />
            </div>

            {/* Amount & Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                  Amount Stated (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-premium"
                  placeholder="0.00"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  disabled={submitting}
                  style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                  Transaction / Chat Date
                </label>
                <input
                  type="date"
                  className="input-premium"
                  value={newProofDate}
                  onChange={(e) => setNewProofDate(e.target.value)}
                  disabled={submitting}
                  style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                />
              </div>
            </div>

            {/* File Upload / Image Link */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                Upload Screenshot / Photo <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={submitting}
                  style={{ fontSize: '0.82rem', flex: 1 }}
                />
              </div>
              <div style={{ marginTop: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Or enter direct image URL:</span>
                <input
                  type="text"
                  className="input-premium"
                  placeholder="https://... direct image link"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  disabled={submitting}
                  style={{ width: '100%', height: '34px', fontSize: '0.80rem', marginTop: '3px' }}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                Chat Notes / Price Agreement Excerpt
              </label>
              <textarea
                className="input-premium"
                rows={2}
                placeholder="e.g. Supplier agreed on Messenger to lock price at ₱650/pc for 10 units..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                disabled={submitting}
                style={{ width: '100%', fontSize: '0.82rem', resize: 'vertical' }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsUploadOpen(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
                style={{ fontWeight: 600 }}
              >
                {submitting ? 'Saving...' : 'Save to Proof Gallery'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Proofs Grid View */}
      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
          <Spinner />
          <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Loading supplier proof gallery...
          </div>
        </div>
      ) : proofs.length === 0 ? (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center', borderRadius: '12px' }}>
          <Image size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px auto', opacity: 0.5 }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
            No Proof Documents or Messenger Quotes Found
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '480px', margin: '0 auto 16px auto' }}>
            Upload GCash payment receipts, courier waybills, or screenshots of Facebook Messenger price agreements to link them permanently to suppliers.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsUploadOpen(true)}
            style={{ fontSize: '0.82rem', padding: '8px 16px' }}
          >
            <Plus size={15} /> Upload First Proof
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {proofs.map(proof => {
            const config = PROOF_TYPE_CONFIG[proof.proof_type] || PROOF_TYPE_CONFIG.payment_proof;

            return (
              <div
                key={proof.id}
                className="glass-panel"
                style={{
                  padding: '0',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                }}
              >
                {/* Image Thumbnail Container */}
                <div
                  style={{
                    position: 'relative',
                    height: '180px',
                    background: 'rgba(0,0,0,0.2)',
                    cursor: 'pointer',
                    overflow: 'hidden'
                  }}
                  onClick={() => setSelectedProofForView(proof)}
                  title="Click to view full screenshot"
                >
                  <img
                    src={proof.image_url}
                    alt={proof.title}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform 0.3s ease'
                    }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop';
                    }}
                  />

                  {/* Badge Overlay */}
                  <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    background: config.bg,
                    color: config.color,
                    border: `1px solid ${config.color}40`,
                    backdropFilter: 'blur(8px)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    {config.icon}
                    <span>{config.label}</span>
                  </div>

                  {/* Click to expand overlay */}
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#ffffff',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <Eye size={12} /> Inspect
                  </div>
                </div>

                {/* Content Body */}
                <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                      <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: '1.3' }}>
                        {proof.title}
                      </h4>
                    </div>

                    <div style={{ fontSize: '0.76rem', color: 'var(--primary)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>{proof.supplier_name}</span>
                      {proof.fb_page_name && <span style={{ color: 'var(--text-muted)' }}>({proof.fb_page_name})</span>}
                    </div>

                    {proof.notes && (
                      <p style={{ margin: '0 0 8px 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        {proof.notes}
                      </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {proof.reference_no && (
                        <div
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: '4px' }}
                          onClick={() => copyToClipboard(proof.reference_no, 'Reference #')}
                          title="Click to copy Ref #"
                        >
                          <span style={{ fontWeight: 600, color: 'var(--text-main)', fontFamily: 'monospace' }}>Ref: {proof.reference_no}</span>
                          <Copy size={11} />
                        </div>
                      )}

                      {Number(proof.amount) > 0 && (
                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                          {formatCurrency(proof.amount)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    <span>{formatAuditDate(proof.created_at)}</span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {proof.messenger_url && (
                        <a
                          href={proof.messenger_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                          title="Open Facebook Messenger conversation"
                        >
                          <MessageSquare size={12} color="#0084ff" /> Chat
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteProof(proof.id)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                        title="Delete this proof"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          MODAL 1: VIEW FULL SCREENSHOT LIGHTBOX
         ========================================================================= */}
      {selectedProofForView && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setSelectedProofForView(null)}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '850px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid var(--border)',
              background: 'var(--surface)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {selectedProofForView.title}
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--primary)', marginTop: '2px' }}>
                  {selectedProofForView.supplier_name} {selectedProofForView.fb_page_name ? `• ${selectedProofForView.fb_page_name}` : ''}
                </div>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedProofForView(null)}
                style={{ padding: '6px' }}
                title="Close Lightbox"
              >
                <X size={18} />
              </button>
            </div>

            {/* Large Image */}
            <div style={{ background: '#000', borderRadius: '8px', overflow: 'hidden', textAlign: 'center', marginBottom: '14px' }}>
              <img
                src={selectedProofForView.image_url}
                alt={selectedProofForView.title}
                style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain' }}
              />
            </div>

            {/* Details Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'var(--surface-hover)', padding: '12px', borderRadius: '8px', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Document Type: </span>
                <strong style={{ color: 'var(--text-main)' }}>{PROOF_TYPE_CONFIG[selectedProofForView.proof_type]?.label}</strong>
              </div>
              {selectedProofForView.reference_no && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Reference #: </span>
                  <strong style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>{selectedProofForView.reference_no}</strong>
                </div>
              )}
              {Number(selectedProofForView.amount) > 0 && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Amount: </span>
                  <strong style={{ color: 'var(--primary)' }}>{formatCurrency(selectedProofForView.amount)}</strong>
                </div>
              )}
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Date Logged: </span>
                <strong style={{ color: 'var(--text-main)' }}>{formatAuditDate(selectedProofForView.created_at)}</strong>
              </div>
            </div>

            {selectedProofForView.notes && (
              <div style={{ marginTop: '12px', fontSize: '0.84rem', color: 'var(--text-main)', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <strong>Notes / Agreement Terms: </strong>
                <span>{selectedProofForView.notes}</span>
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
};

export default SupplierProofGallery;
