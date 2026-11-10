import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  Plus,
  CreditCard,
  Building2,
  Calendar,
  FileText,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  MessageSquare,
  ExternalLink,
  RefreshCw,
  Search,
  ChevronRight
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import Spinner from './Spinner';

const SupplierLedgerView = ({ suppliers = [], preselectedSupplierId = null }) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    preselectedSupplierId ? String(preselectedSupplierId) : (suppliers[0]?.id ? String(suppliers[0].id) : '')
  );
  const [ledgerData, setLedgerData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Global summary across all suppliers
  const [globalSummary, setGlobalSummary] = useState(null);
  const [viewMode, setViewMode] = useState('statement'); // 'statement' | 'all_balances'

  // Record Payment Modal
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('GCash');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [proofImgUrl, setProofImgUrl] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const fetchLedger = useCallback(async () => {
    if (!selectedSupplierId) return;
    setLoading(true);
    try {
      const res = await api.get(`/suppliers/${selectedSupplierId}/ledger`);
      setLedgerData(res.data);
    } catch (err) {
      console.error('Failed to fetch supplier ledger', err);
      toast.error('Failed to load supplier financial ledger');
    } finally {
      setLoading(false);
    }
  }, [selectedSupplierId]);

  const fetchGlobalSummary = useCallback(async () => {
    try {
      const res = await api.get('/suppliers/ledger/summary');
      setGlobalSummary(res.data);
    } catch (err) {
      console.error('Failed to fetch global ledger summary', err);
    }
  }, []);

  useEffect(() => {
    fetchLedger();
    fetchGlobalSummary();
  }, [fetchLedger, fetchGlobalSummary]);

  // Keep selected supplier in sync if prop changes
  useEffect(() => {
    if (preselectedSupplierId) {
      setSelectedSupplierId(String(preselectedSupplierId));
    }
  }, [preselectedSupplierId]);

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      toast.error('Please select a supplier');
      return;
    }
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    setSubmittingPayment(true);
    try {
      await api.post(`/suppliers/${selectedSupplierId}/payments`, {
        amount: amt,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        reference_number: referenceNumber.trim() || undefined,
        proof_img_url: proofImgUrl.trim() || undefined,
        notes: paymentNotes.trim() || undefined
      });

      toast.success(`Payment of ${formatCurrency(amt)} via ${paymentMethod} recorded in ledger!`);
      setIsRecordPaymentOpen(false);
      setPaymentAmount('');
      setReferenceNumber('');
      setProofImgUrl('');
      setPaymentNotes('');
      fetchLedger();
      fetchGlobalSummary();
    } catch (err) {
      console.error('Failed to record payment', err);
      toast.error(err.response?.data?.message || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const selectedSupplierObj = suppliers.find(s => String(s.id) === String(selectedSupplierId));
  const summary = ledgerData?.summary || {};
  const netBalance = summary.net_balance || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Top Header Card */}
      <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={22} style={{ color: 'var(--primary)' }} />
              Supplier Financial Ledger & Statements
            </h2>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Track purchase orders billed, payments sent via GCash/Bank, and pre-acceptance return credits owed by Facebook suppliers.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* View Switcher: Single Supplier Statement vs All Balances */}
            <div style={{ display: 'inline-flex', background: 'var(--surface-hover)', padding: '3px', borderRadius: '8px', gap: '4px' }}>
              <button
                type="button"
                className={viewMode === 'statement' ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '0.78rem', padding: '6px 12px', border: 'none' }}
                onClick={() => setViewMode('statement')}
              >
                Individual Statement
              </button>
              <button
                type="button"
                className={viewMode === 'all_balances' ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '0.78rem', padding: '6px 12px', border: 'none' }}
                onClick={() => setViewMode('all_balances')}
              >
                All Supplier Balances
              </button>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                fetchLedger();
                fetchGlobalSummary();
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 12px' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>

            <button
              type="button"
              id="record-supplier-payment-btn"
              className={isRecordPaymentOpen ? 'btn-secondary' : 'btn-primary'}
              onClick={() => setIsRecordPaymentOpen(!isRecordPaymentOpen)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px', fontWeight: 600 }}
            >
              {isRecordPaymentOpen ? <X size={15} /> : <Plus size={15} />}
              {isRecordPaymentOpen ? '✕ Close Form' : '+ Record Payment Sent'}
            </button>
          </div>
        </div>

        {/* =========================================================================
            INLINE PANEL: RECORD PAYMENT SENT (GCASH / BANK / COD - NO MODAL, NO GLASS)
           ========================================================================= */}
        {isRecordPaymentOpen && (
          <div
            id="inline-record-payment-card"
            style={{
              width: '100%',
              borderRadius: '14px',
              padding: '24px',
              border: '1.5px solid var(--primary)',
              background: 'var(--surface)',
              boxShadow: '0 8px 30px rgba(16, 185, 129, 0.12)',
              marginTop: '16px',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={20} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Record Supplier Payment Sent
                </h3>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsRecordPaymentOpen(false)}
                disabled={submittingPayment}
                style={{ padding: '6px' }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                  Facebook Supplier <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select
                  className="input-premium"
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  required
                  disabled={submittingPayment}
                  style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.fb_page_name ? `(${s.fb_page_name})` : ''}
                    </option>
                  ))}
                </select>
                {selectedSupplierObj?.gcash_account_number && (
                  <div style={{ fontSize: '0.74rem', color: 'var(--primary)', marginTop: '4px' }}>
                    Saved GCash: <strong>{selectedSupplierObj.gcash_account_number}</strong> ({selectedSupplierObj.seller_contact_name || selectedSupplierObj.name})
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                    Payment Amount (₱) <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    className="input-premium"
                    placeholder="0.00"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    required
                    disabled={submittingPayment}
                    style={{ width: '100%', height: '38px', fontSize: '0.86rem', fontWeight: 700, color: 'var(--primary)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                    Payment Method <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select
                    className="input-premium"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    disabled={submittingPayment}
                    style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                  >
                    <option value="GCash">📱 GCash Wallet Transfer</option>
                    <option value="Bank Transfer">🏦 Online Bank Transfer</option>
                    <option value="Cash on Delivery (COD)">💵 Cash on Delivery (COD)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                    Payment Date <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="date"
                    className="input-premium"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                    disabled={submittingPayment}
                    style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                    GCash / Bank Reference #
                  </label>
                  <input
                    type="text"
                    className="input-premium"
                    placeholder="e.g. 10294828109"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    disabled={submittingPayment}
                    style={{ width: '100%', height: '38px', fontSize: '0.84rem', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                  Payment Screenshot / Receipt Image URL
                </label>
                <input
                  type="text"
                  className="input-premium"
                  placeholder="https://... uploaded screenshot link"
                  value={proofImgUrl}
                  onChange={(e) => setProofImgUrl(e.target.value)}
                  disabled={submittingPayment}
                  style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                  Notes / Breakdown
                </label>
                <textarea
                  className="input-premium"
                  rows={2}
                  placeholder="e.g. Paid via GCash with -₱1,140 pre-acceptance credit deducted from previous return..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  disabled={submittingPayment}
                  style={{ width: '100%', fontSize: '0.82rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsRecordPaymentOpen(false)}
                  disabled={submittingPayment}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingPayment}
                  style={{ fontWeight: 600 }}
                >
                  {submittingPayment ? 'Recording...' : 'Post to Supplier Ledger'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Supplier Selector Bar (when in individual statement mode) */}
        {viewMode === 'statement' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                Select Facebook Supplier:
              </label>
              <select
                id="ledger-supplier-select"
                className="input-premium"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.fb_page_name ? `(${s.fb_page_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedSupplierObj && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {selectedSupplierObj.seller_contact_name && (
                  <div>
                    Contact: <strong style={{ color: 'var(--text-main)' }}>{selectedSupplierObj.seller_contact_name}</strong>
                  </div>
                )}
                {selectedSupplierObj.gcash_account_number && (
                  <div>
                    GCash: <strong style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>{selectedSupplierObj.gcash_account_number}</strong>
                  </div>
                )}
                {selectedSupplierObj.messenger_url && (
                  <a
                    href={selectedSupplierObj.messenger_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}
                  >
                    <MessageSquare size={13} color="#0084ff" /> Open Messenger
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* VIEW MODE 1: INDIVIDUAL SUPPLIER STATEMENT & FINANCIAL METRICS */}
      {viewMode === 'statement' && (
        <>
          {/* Section 6 Ledger 4 Financial KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            {/* 1. Total POs Billed */}
            <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ background: 'rgba(59, 130, 246, 0.15)', width: '36px', height: '36px', borderRadius: '8px', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Total Purchase Orders Billed
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Goods + Shipping Fees
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
                {formatCurrency(summary.total_po_billed || 0)}
              </div>
            </div>

            {/* 2. Total Payments Sent */}
            <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', width: '36px', height: '36px', borderRadius: '8px', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CreditCard size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Total Payments Sent
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Via GCash / Bank / COD
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>
                {formatCurrency(summary.total_payments_sent || 0)}
              </div>
            </div>

            {/* 3. Pre-Acceptance Return Credits */}
            <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', width: '36px', height: '36px', borderRadius: '8px', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RotateCcw size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase' }}>
                    Pre-Acceptance Return Credits
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Damaged items rejected at unboxing
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--danger)', marginTop: '4px' }}>
                -{formatCurrency(summary.total_pre_acceptance_credits || 0)}
              </div>
            </div>

            {/* 4. Net Balance With Supplier */}
            <div className="glass-panel" style={{
              padding: '16px 20px',
              borderRadius: '12px',
              border: netBalance > 0
                ? '1px solid rgba(245, 158, 11, 0.4)'
                : (netBalance < 0 ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)'),
              background: netBalance > 0
                ? 'rgba(245, 158, 11, 0.04)'
                : (netBalance < 0 ? 'rgba(16, 185, 129, 0.04)' : 'var(--surface)')
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{
                  background: netBalance > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  color: netBalance > 0 ? '#f59e0b' : '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <DollarSign size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Net Balance With Supplier
                  </div>
                  <div style={{ fontSize: '0.75rem', color: netBalance > 0 ? '#f59e0b' : (netBalance < 0 ? '#10b981' : 'var(--text-muted)'), fontWeight: 600 }}>
                    {netBalance > 0
                      ? 'Shop Owes Supplier'
                      : (netBalance < 0 ? 'Supplier Owes Shop (Credit)' : 'Fully Settled & Balanced')}
                  </div>
                </div>
              </div>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: 900,
                color: netBalance > 0 ? '#f59e0b' : (netBalance < 0 ? '#10b981' : 'var(--text-main)'),
                marginTop: '4px'
              }}>
                {formatCurrency(Math.abs(netBalance))}
              </div>
            </div>
          </div>

          {/* Statement Timeline Table */}
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  Chronological Transaction Statement & Running Balance
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Complete audit ledger of billed orders, payments released, and pre-acceptance return deductions.
                </p>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {ledgerData?.statement?.length || 0} statement entries recorded
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Spinner />
              </div>
            ) : (!ledgerData?.statement || ledgerData.statement.length === 0) ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                No transaction ledger entries recorded yet for this supplier.
              </div>
            ) : (
              <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px', width: '110px' }}>Date</th>
                      <th style={{ padding: '10px 12px', width: '150px' }}>Type</th>
                      <th style={{ padding: '10px 12px', width: '130px' }}>Reference #</th>
                      <th style={{ padding: '10px 14px' }}>Transaction Description</th>
                      <th style={{ padding: '10px 12px', width: '120px', textAlign: 'right' }}>Billed (+)</th>
                      <th style={{ padding: '10px 12px', width: '120px', textAlign: 'right', color: 'var(--primary)' }}>Payment Sent (-)</th>
                      <th style={{ padding: '10px 12px', width: '120px', textAlign: 'right', color: 'var(--danger)' }}>Return Credit (-)</th>
                      <th style={{ padding: '10px 14px', width: '130px', textAlign: 'right', fontWeight: 700 }}>Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.statement.map((entry, idx) => {
                      const isPO = entry.type === 'PO_BILLED';
                      const isPay = entry.type === 'PAYMENT_SENT';
                      const isRet = entry.type === 'RETURN_CREDIT';

                      return (
                        <tr key={entry.id || idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                            {formatAuditDate(entry.date)}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background: isPO ? 'rgba(59, 130, 246, 0.12)' : (isPay ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'),
                              color: isPO ? '#3b82f6' : (isPay ? '#10b981' : '#ef4444')
                            }}>
                              {entry.typeLabel}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>
                            {entry.reference}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-main)' }}>
                            {entry.description}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: isPO ? 700 : 400 }}>
                            {isPO ? formatCurrency(entry.debit) : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: isPay ? 'var(--primary)' : 'inherit', fontWeight: isPay ? 700 : 400 }}>
                            {isPay ? `-${formatCurrency(entry.credit)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: isRet ? 'var(--danger)' : 'inherit', fontWeight: isRet ? 700 : 400 }}>
                            {isRet ? `-${formatCurrency(entry.credit)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: entry.running_balance > 0 ? '#f59e0b' : (entry.running_balance < 0 ? '#10b981' : 'var(--text-main)') }}>
                            {formatCurrency(entry.running_balance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* VIEW MODE 2: ALL SUPPLIER BALANCES (BALANCE SHEET) */}
      {viewMode === 'all_balances' && (
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                All Facebook Suppliers Financial Balance Sheet
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Overview of total orders billed, payments sent, active pre-acceptance return credits, and net balances across all suppliers.
              </p>
            </div>

            {globalSummary?.overall && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--surface-hover)', padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem' }}>
                <div>
                  Total Billed: <strong style={{ color: 'var(--text-main)' }}>{formatCurrency(globalSummary.overall.total_po_billed)}</strong>
                </div>
                <div>
                  Total Paid: <strong style={{ color: 'var(--primary)' }}>{formatCurrency(globalSummary.overall.total_payments_sent)}</strong>
                </div>
                <div>
                  Return Credits: <strong style={{ color: 'var(--danger)' }}>-{formatCurrency(globalSummary.overall.total_pre_acceptance_credits)}</strong>
                </div>
                <div>
                  Net Outstanding: <strong style={{ color: '#f59e0b' }}>{formatCurrency(globalSummary.overall.net_outstanding_balance)}</strong>
                </div>
              </div>
            )}
          </div>

          <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 14px' }}>Supplier / Facebook Shop</th>
                  <th style={{ padding: '10px 12px' }}>Seller Contact & Messenger</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total PO Billed</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--primary)' }}>Payments Sent</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--danger)' }}>Pre-Acceptance Credits</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>Net Balance</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(globalSummary?.suppliers || []).map(supp => (
                  <tr key={supp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{supp.name}</div>
                      {supp.fb_page_name && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>FB: {supp.fb_page_name}</div>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>{supp.seller_contact_name || supp.phone || 'N/A'}</div>
                      {supp.messenger_url && (
                        <a
                          href={supp.messenger_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.72rem', color: '#0084ff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                        >
                          <MessageSquare size={11} /> Open Messenger
                        </a>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                      {formatCurrency(supp.total_po_billed)}
                    </td>

                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>
                      {formatCurrency(supp.total_payments_sent)}
                    </td>

                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>
                      {supp.pre_acceptance_credits > 0 ? `-${formatCurrency(supp.pre_acceptance_credits)}` : '₱0.00'}
                    </td>

                    <td style={{
                      padding: '10px 14px',
                      textAlign: 'right',
                      fontWeight: 800,
                      color: supp.net_balance > 0 ? '#f59e0b' : (supp.net_balance < 0 ? '#10b981' : 'var(--text-muted)')
                    }}>
                      <div>{formatCurrency(Math.abs(supp.net_balance))}</div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>
                        {supp.net_balance > 0 ? 'Shop Owes' : (supp.net_balance < 0 ? 'Supplier Owes' : 'Settled')}
                      </span>
                    </td>

                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setSelectedSupplierId(String(supp.id));
                          setViewMode('statement');
                        }}
                        style={{ fontSize: '0.75rem', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        Statement <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierLedgerView;
