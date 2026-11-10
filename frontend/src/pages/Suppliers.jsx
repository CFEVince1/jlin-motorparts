import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import {
  Building2,
  Plus,
  Search,
  Phone,
  Edit3,
  UserCheck,
  UserX,
  PackagePlus,
  MessageSquare,
  ExternalLink,
  CreditCard,
  FileText
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatters';
import QuickAddSupplierModal from '../components/QuickAddSupplierModal';
import EditSupplierModal from '../components/EditSupplierModal';
import SupplierProofGallery from '../components/SupplierProofGallery';
import SupplierLedgerView from '../components/SupplierLedgerView';

/**
 * Module 6: Suppliers (Owner / Admin Exclusive)
 * 
 * Houses:
 * 1. Supplier List (FB Supplier Directory: 11 vendors, Messenger links, GCash accounts, inline Register FB Vendor)
 * 2. Payment Proofs & Messenger Quotes (Middle Branch)
 * 3. Supplier Ledger & Financial Statements (Balances, P&L restock debits & GCash payments)
 */
export const Suppliers = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  // Sub-tabs: 'list' | 'proofs' | 'ledger'
  const initialSubTab = useMemo(() => {
    const qTab = searchParams.get('tab');
    if (qTab === 'proofs' || qTab === 'quotes') return 'proofs';
    if (qTab === 'ledger' || qTab === 'statements') return 'ledger';
    return 'list';
  }, [searchParams]);

  const [supplierSubTab, setSupplierSubTab] = useState(initialSubTab);
  const [selectedSupplierForLedgerId, setSelectedSupplierForLedgerId] = useState(null);
  const [selectedSupplierForProofsId, setSelectedSupplierForProofsId] = useState(null);
  const [selectedSupplierForEdit, setSelectedSupplierForEdit] = useState(null);

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Sync subtab with URL query
  useEffect(() => {
    const qTab = searchParams.get('tab');
    if (qTab === 'proofs' || qTab === 'quotes') setSupplierSubTab('proofs');
    else if (qTab === 'ledger' || qTab === 'statements') setSupplierSubTab('ledger');
    else setSupplierSubTab('list');
  }, [searchParams]);

  const handleSubTabChange = (tab) => {
    setSupplierSubTab(tab);
    if (tab === 'list') {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  };

  // Cashier role redirection
  useEffect(() => {
    if (!isAdmin && user) {
      toast.error('Module 6 (Suppliers Directory & Ledger) is restricted to Owner/Admin.');
      navigate('/purchasing?tab=receive_orders', { replace: true });
    }
  }, [isAdmin, user, navigate]);

  // Data fetching
  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/suppliers?includeInactive=true');
      setSuppliers(res.data || []);
    } catch (err) {
      console.error('Failed to fetch suppliers', err);
      toast.error('Failed to load supplier directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleSupplierCreated = (newSupplier) => {
    setSuppliers(prev => [newSupplier, ...prev]);
    setIsAddSupplierOpen(false);
    toast.success(`Vendor "${newSupplier.name}" registered successfully!`);
  };

  const handleSupplierUpdated = (updatedSupplier) => {
    setSuppliers(prev => prev.map(s => s.id === updatedSupplier.id ? updatedSupplier : s));
    setSelectedSupplierForEdit(null);
    toast.success(`Supplier "${updatedSupplier.name}" updated!`);
  };

  const handleToggleStatus = async (supplier) => {
    const nextStatus = !supplier.is_active;
    const actionLabel = nextStatus ? 'activate' : 'deactivate';

    if (!window.confirm(`Are you sure you want to ${actionLabel} supplier "${supplier.name}"?`)) {
      return;
    }

    try {
      await api.put(`/suppliers/${supplier.id}`, { is_active: nextStatus });
      toast.success(`Supplier "${supplier.name}" marked as ${nextStatus ? 'active' : 'inactive'}`);
      fetchSuppliers();
    } catch (err) {
      console.error('Failed to toggle supplier status', err);
      toast.error(err.response?.data?.message || 'Failed to update supplier status');
    }
  };

  const handleDirectReceiveFromSupplier = (supplier) => {
    navigate(`/purchasing?tab=receive_orders&supplierId=${supplier.id}`);
  };

  // Filtered Suppliers for Directory
  const filteredSuppliers = suppliers.filter(s => {
    const term = supplierSearchTerm.toLowerCase();
    const matchesSearch = (
      (s.name && s.name.toLowerCase().includes(term)) ||
      (s.fb_page_name && s.fb_page_name.toLowerCase().includes(term)) ||
      (s.seller_contact_name && s.seller_contact_name.toLowerCase().includes(term)) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(term)) ||
      (s.phone && s.phone.toLowerCase().includes(term)) ||
      (s.gcash_account_number && s.gcash_account_number.toLowerCase().includes(term)) ||
      (s.address && s.address.toLowerCase().includes(term))
    );

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return Boolean(s.is_active);
    if (statusFilter === 'inactive') return !s.is_active;
    if (statusFilter === 'facebook') return Boolean(s.messenger_url || s.fb_page_name);
    return true;
  });

  return (
    <div style={{ width: '100%', minWidth: 0, paddingBottom: '32px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.75rem', fontWeight: 'bold' }}>
            <Building2 size={28} style={{ color: 'var(--primary)' }} />
            Suppliers & Vendor Accounts
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
            Manage Facebook seller profiles, GCash details, payment screenshot proofs, quotes, and supplier account ledgers.
          </p>
        </div>

        {/* Sub-Tab Navigation Bar & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', background: 'var(--surface-hover)', padding: '4px', borderRadius: '10px', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              id="subtab-supplier-list-btn"
              className={supplierSubTab === 'list' ? 'btn-primary' : 'btn-secondary'}
              style={{
                height: '36px',
                padding: '0 14px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: supplierSubTab === 'list' ? 'var(--primary)' : 'transparent',
                color: supplierSubTab === 'list' ? '#ffffff' : 'var(--text-muted)'
              }}
              onClick={() => handleSubTabChange('list')}
            >
              <Building2 size={15} /> FB Supplier Directory ({suppliers.length})
            </button>

            <button
              type="button"
              id="subtab-supplier-proofs-btn"
              className={supplierSubTab === 'proofs' ? 'btn-primary' : 'btn-secondary'}
              style={{
                height: '36px',
                padding: '0 14px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: supplierSubTab === 'proofs' ? 'var(--primary)' : 'transparent',
                color: supplierSubTab === 'proofs' ? '#ffffff' : 'var(--text-muted)'
              }}
              onClick={() => handleSubTabChange('proofs')}
            >
              <FileText size={15} /> Payment Proofs & Quotes
            </button>

            <button
              type="button"
              id="subtab-supplier-ledger-btn"
              className={supplierSubTab === 'ledger' ? 'btn-primary' : 'btn-secondary'}
              style={{
                height: '36px',
                padding: '0 14px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: supplierSubTab === 'ledger' ? 'var(--primary)' : 'transparent',
                color: supplierSubTab === 'ledger' ? '#ffffff' : 'var(--text-muted)'
              }}
              onClick={() => handleSubTabChange('ledger')}
            >
              <CreditCard size={15} /> Supplier Ledger & Statements
            </button>
          </div>

          {supplierSubTab === 'list' && (
            <button
              type="button"
              id="register-fb-vendor-header-btn"
              className="btn-primary"
              onClick={() => setIsAddSupplierOpen(!isAddSupplierOpen)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', padding: '8px 16px', fontWeight: 600 }}
            >
              <Plus size={16} /> {isAddSupplierOpen ? '✕ Close Form' : 'Register FB Vendor'}
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          SUB-VIEW 1: SUPPLIER LIST (DIRECTORY)
         ========================================================================= */}
      {supplierSubTab === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* INLINE FORM: REGISTER FB VENDOR (NO MODAL, NO GLASS PANEL) */}
          {isAddSupplierOpen && (
            <QuickAddSupplierModal
              isOpen={true}
              asPanel={true}
              onClose={() => setIsAddSupplierOpen(false)}
              onSupplierCreated={(newSupplier) => {
                handleSupplierCreated(newSupplier);
                setIsAddSupplierOpen(false);
              }}
            />
          )}

          {/* Search & Filter Bar */}
          <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', minWidth: '280px' }}>
                <Search size={16} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search Supplier ID, FB page, contact, category..."
                  className="input-premium"
                  value={supplierSearchTerm}
                  onChange={(e) => setSupplierSearchTerm(e.target.value)}
                  style={{ border: 'none', background: 'transparent', padding: 0, width: '100%', fontSize: '0.84rem' }}
                />
              </div>

              <select
                className="input-premium"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: '190px', fontSize: '0.84rem' }}
              >
                <option value="all">All Vendors ({suppliers.length})</option>
                <option value="facebook">Facebook Suppliers Only</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          </div>

          {/* Supplier Directory Table */}
          <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', width: '100%', overflow: 'hidden' }}>
            <div className="table-container" style={{ border: 'none', overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 12px', minWidth: '180px' }}>VENDOR & FB PROFILE</th>
                    <th style={{ padding: '8px 10px', minWidth: '160px' }}>CONTACT & CHANNELS</th>
                    <th style={{ padding: '8px 10px', minWidth: '130px' }}>SAVED PAYMENT</th>
                    <th style={{ padding: '8px 10px', minWidth: '120px' }}>CATEGORIES</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', minWidth: '95px' }}>NET BALANCE</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', minWidth: '100px' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Loading suppliers directory...
                      </td>
                    </tr>
                  ) : filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No suppliers found matching your query.
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((supplier) => {
                      const suppCode = `SUP-${String(supplier.id).padStart(3, '0')}`;
                      const net = Number(supplier.net_balance || 0);
                      const tags = (supplier.category_tags || 'Motorcycle Parts').split(',').map(t => t.trim()).filter(Boolean);

                      return (
                        <tr key={supplier.id} style={{ borderBottom: '1px solid var(--border)', opacity: supplier.is_active ? 1 : 0.75 }}>
                          {/* 1. Vendor & Facebook Profile + ID */}
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '5px',
                                backgroundColor: supplier.messenger_url ? '#1877F2' : 'var(--surface-hover)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                fontSize: '0.75rem',
                                flexShrink: 0
                              }}>
                                {supplier.messenger_url ? 'f' : <Building2 size={12} />}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.84rem' }}>
                                    {supplier.name}
                                  </span>
                                  <span style={{
                                    fontSize: '0.65rem',
                                    fontFamily: 'monospace',
                                    fontWeight: 700,
                                    color: 'var(--primary)',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    padding: '1px 4px',
                                    borderRadius: '4px'
                                  }}>
                                    {suppCode}
                                  </span>
                                </div>
                                {supplier.fb_page_name && supplier.fb_page_name !== supplier.name && (
                                  <div style={{
                                    fontSize: '0.72rem',
                                    color: 'var(--text-muted)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '200px'
                                  }} title={supplier.fb_page_name}>
                                    FB: {supplier.fb_page_name}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 2. Seller Contact & Messenger / Phone Channels */}
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ fontSize: '0.80rem' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span>{supplier.seller_contact_name || supplier.contact_person || 'Direct Seller'}</span>
                                {supplier.address && (
                                  <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                    ({supplier.address})
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap', fontSize: '0.74rem' }}>
                                {supplier.messenger_url && (
                                  <a
                                    href={supplier.messenger_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#1877F2', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
                                  >
                                    <MessageSquare size={11} /> Chat
                                  </a>
                                )}
                                {supplier.phone && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                    <Phone size={10} /> {supplier.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 3. Saved GCash Number / Bank Account */}
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ fontSize: '0.78rem' }}>
                              {supplier.gcash_account_number ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#007DFE', fontWeight: 700, fontFamily: 'monospace' }}>
                                  <CreditCard size={11} /> {supplier.gcash_account_number}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                              {supplier.bank_details && (
                                <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', marginTop: '1px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={supplier.bank_details}>
                                  {supplier.bank_details}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 4. Supply Category Tags */}
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', maxWidth: '140px' }}>
                              {tags.slice(0, 2).map((tag, idx) => (
                                <span key={idx} style={{
                                  fontSize: '0.68rem',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  color: 'var(--text-main)',
                                  border: '1px solid var(--border)',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {tag}
                                </span>
                              ))}
                              {tags.length > 2 && (
                                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', alignSelf: 'center' }} title={tags.slice(2).join(', ')}>
                                  +{tags.length - 2}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 5. Net Financial Balance */}
                          <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{
                              fontWeight: 800,
                              fontSize: '0.84rem',
                              color: net > 0 ? '#f59e0b' : (net < 0 ? '#10b981' : 'var(--text-muted)')
                            }}>
                              {formatCurrency(Math.abs(net))}
                            </div>
                            <span style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              color: net > 0 ? '#f59e0b' : (net < 0 ? '#10b981' : 'var(--text-muted)')
                            }}>
                              {net > 0 ? 'Shop Owes' : (net < 0 ? 'Supplier Owes' : 'Settled')}
                            </span>
                          </td>

                          {/* 6. Action Buttons */}
                          <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: '3px 7px', fontSize: '0.70rem', display: 'inline-flex', alignItems: 'center', gap: '3px', height: '26px', borderRadius: '5px' }}
                                onClick={() => handleDirectReceiveFromSupplier(supplier)}
                                title="Receive delivery from this supplier in Purchasing module"
                              >
                                <PackagePlus size={11} /> Receive
                              </button>

                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                  setSelectedSupplierForLedgerId(supplier.id);
                                  setSupplierSubTab('ledger');
                                }}
                                style={{ padding: '3px 6px', fontSize: '0.70rem', display: 'inline-flex', alignItems: 'center', gap: '2px', height: '26px', borderRadius: '5px' }}
                                title="View Supplier Financial Statement"
                              >
                                <CreditCard size={10} /> Ledger
                              </button>

                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                  setSelectedSupplierForProofsId(supplier.id);
                                  setSupplierSubTab('proofs');
                                }}
                                style={{ padding: '3px 6px', fontSize: '0.70rem', display: 'inline-flex', alignItems: 'center', gap: '2px', height: '26px', borderRadius: '5px' }}
                                title="View Payment Proofs & Messenger Quotes"
                              >
                                <FileText size={10} /> Proofs
                              </button>

                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '3px 5px', fontSize: '0.70rem', display: 'inline-flex', alignItems: 'center', height: '26px', borderRadius: '5px' }}
                                onClick={() => setSelectedSupplierForEdit(supplier)}
                                title="Edit FB vendor details"
                              >
                                <Edit3 size={11} />
                              </button>

                              <button
                                type="button"
                                className="btn-secondary"
                                style={{
                                  padding: '3px 5px',
                                  fontSize: '0.70rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  height: '26px',
                                  borderRadius: '5px',
                                  color: supplier.is_active ? 'var(--text-muted)' : 'var(--success)'
                                }}
                                onClick={() => handleToggleStatus(supplier)}
                                title={supplier.is_active ? 'Deactivate supplier' : 'Activate supplier'}
                              >
                                {supplier.is_active ? <UserX size={11} /> : <UserCheck size={11} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SUB-VIEW 2: PAYMENT PROOFS & MESSENGER QUOTES
         ========================================================================= */}
      {supplierSubTab === 'proofs' && (
        <SupplierProofGallery
          suppliers={suppliers}
          preselectedSupplierId={selectedSupplierForProofsId}
        />
      )}

      {/* =========================================================================
          SUB-VIEW 3: SUPPLIER LEDGER (FINANCIAL STATEMENTS & BALANCES)
         ========================================================================= */}
      {supplierSubTab === 'ledger' && (
        <SupplierLedgerView
          suppliers={suppliers}
          preselectedSupplierId={selectedSupplierForLedgerId}
        />
      )}

      {/* =========================================================================
          MODAL: EDIT SUPPLIER MODAL
         ========================================================================= */}
      <EditSupplierModal
        isOpen={Boolean(selectedSupplierForEdit)}
        onClose={() => setSelectedSupplierForEdit(null)}
        supplier={selectedSupplierForEdit}
        onSupplierUpdated={handleSupplierUpdated}
      />
    </div>
  );
};

export default Suppliers;
