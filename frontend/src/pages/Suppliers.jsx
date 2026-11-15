import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import {
  Building2,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Edit3,
  UserCheck,
  UserX,
  Truck,
  ExternalLink
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatters';
import QuickAddSupplierModal from '../components/QuickAddSupplierModal';
import EditSupplierModal from '../components/EditSupplierModal';

/**
 * Module 5: Supplier Directory (Owner / Admin Exclusive)
 * 
 * Houses:
 * - Master list of motorcycle parts suppliers and FB vendor stores
 * - Direct truck intake shortcuts and delivery history links
 * - Phone, email, address, and spend analytics
 */
export const Suppliers = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useContext(AuthContext);
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const [selectedSupplierForEdit, setSelectedSupplierForEdit] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const urlSearch = searchParams.get('search') || searchParams.get('supplier') || '';
  const [supplierSearchTerm, setSupplierSearchTerm] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const q = searchParams.get('search') || searchParams.get('supplier') || '';
    if (q) {
      setSupplierSearchTerm(q);
    }
  }, [searchParams]);

  // Cashier role redirection
  useEffect(() => {
    if (!isAdmin && user) {
      toast.error('Supplier Directory is restricted to Owner/Admin.');
      navigate('/purchasing', { replace: true });
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
    toast.success(`Supplier "${newSupplier.name}" registered successfully!`);
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
    navigate(`/purchasing?supplierId=${supplier.id}`);
  };

  // Filtered Suppliers for Directory
  const filteredSuppliers = suppliers.filter(s => {
    const term = supplierSearchTerm.toLowerCase();
    const matchesSearch = (
      (s.name && s.name.toLowerCase().includes(term)) ||
      (s.fb_page_name && s.fb_page_name.toLowerCase().includes(term)) ||
      (s.phone && s.phone.toLowerCase().includes(term)) ||
      (s.email && s.email.toLowerCase().includes(term)) ||
      (s.address && s.address.toLowerCase().includes(term))
    );

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return Boolean(s.is_active);
    if (statusFilter === 'inactive') return !s.is_active;
    if (statusFilter === 'facebook') return Boolean(s.fb_page_name || s.facebook_page_url);
    return true;
  });

  return (
    <div style={{ width: '100%', minWidth: 0, paddingBottom: '32px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.75rem', fontWeight: 'bold' }}>
            <Building2 size={28} style={{ color: 'var(--primary)' }} />
            Supplier Directory
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
            Master list of motorcycle parts suppliers, FB shop profiles, phone contacts, and truck delivery history.
          </p>
        </div>

        {/* Quick Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            id="register-fb-vendor-header-btn"
            className="btn-primary"
            onClick={() => setIsAddSupplierOpen(!isAddSupplierOpen)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', padding: '8px 16px', fontWeight: 600 }}
          >
            <Plus size={16} /> {isAddSupplierOpen ? '✕ Close Form' : 'Register Supplier'}
          </button>
        </div>
      </div>

      {/* SUPPLIER LIST (DIRECTORY) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* INLINE FORM: REGISTER SUPPLIER */}
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
                placeholder="Search Supplier name, FB page, phone, location..."
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
              <option value="all">All Suppliers ({suppliers.length})</option>
              <option value="facebook">Facebook Stores Only</option>
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
                  <th style={{ padding: '8px 12px', minWidth: '200px' }}>SUPPLIER / FB STORE</th>
                  <th style={{ padding: '8px 10px', minWidth: '160px' }}>CONTACT PHONE & EMAIL</th>
                  <th style={{ padding: '8px 10px', minWidth: '160px' }}>LOCATION / ADDRESS</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', minWidth: '110px' }}>TOTAL DELIVERIES & SPEND</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', minWidth: '100px' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Loading suppliers directory...
                    </td>
                  </tr>
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No suppliers found matching your query.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((supplier) => {
                    const suppCode = `SUP-${String(supplier.id).padStart(3, '0')}`;

                    return (
                      <tr key={supplier.id} style={{ borderBottom: '1px solid var(--border)', opacity: supplier.is_active ? 1 : 0.75 }}>
                        {/* 1. Supplier / FB Store & ID */}
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '5px',
                              backgroundColor: supplier.facebook_page_url || supplier.fb_page_name ? '#1877F2' : 'var(--surface-hover)',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold',
                              fontSize: '0.75rem',
                              flexShrink: 0
                            }}>
                              {supplier.facebook_page_url || supplier.fb_page_name ? 'f' : <Building2 size={12} />}
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
                                  maxWidth: '220px'
                                }} title={supplier.fb_page_name}>
                                  FB: {supplier.fb_page_name}
                                </div>
                              )}
                              {supplier.facebook_page_url && (
                                <div style={{ marginTop: '2px' }}>
                                  <a
                                    href={supplier.facebook_page_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#1877F2', fontSize: '0.72rem', textDecoration: 'none' }}
                                  >
                                    Visit FB Page <ExternalLink size={10} />
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 2. Contact Phone & Email */}
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontSize: '0.80rem' }}>
                            {supplier.phone ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-main)', fontWeight: 600 }}>
                                <Phone size={11} style={{ color: 'var(--primary)' }} /> {supplier.phone}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>No phone</span>
                            )}
                            {supplier.email && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Mail size={10} /> {supplier.email}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 3. Location / Address */}
                        <td style={{ padding: '8px 10px' }}>
                          {supplier.address ? (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', display: 'flex', alignItems: 'flex-start', gap: '4px', maxWidth: '200px' }}>
                              <MapPin size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />
                              <span>{supplier.address}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        {/* 4. Total Deliveries & Spend */}
                        <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{
                            fontWeight: 800,
                            fontSize: '0.84rem',
                            color: 'var(--text-main)'
                          }}>
                            {formatCurrency(Number(supplier.total_spend || 0))}
                          </div>
                          <span style={{
                            fontSize: '0.66rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)'
                          }}>
                            {Number(supplier.total_deliveries || 0)} truck {Number(supplier.total_deliveries || 0) === 1 ? 'delivery' : 'deliveries'}
                          </span>
                        </td>

                        {/* 5. Action Buttons */}
                        <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ padding: '3px 7px', fontSize: '0.70rem', display: 'inline-flex', alignItems: 'center', gap: '3px', height: '26px', borderRadius: '5px' }}
                              onClick={() => handleDirectReceiveFromSupplier(supplier)}
                              title="Receive delivery from this supplier in Receiving / Stock-In"
                            >
                              <Truck size={11} /> Receive
                            </button>

                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setSelectedSupplierForEdit(supplier)}
                              style={{ padding: '3px 6px', fontSize: '0.70rem', display: 'inline-flex', alignItems: 'center', height: '26px', borderRadius: '5px' }}
                              title="Edit Supplier"
                            >
                              <Edit3 size={11} />
                            </button>

                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleToggleStatus(supplier)}
                              style={{
                                padding: '3px 6px',
                                fontSize: '0.70rem',
                                color: supplier.is_active ? 'var(--text-muted)' : '#10b981',
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: '26px',
                                borderRadius: '5px'
                              }}
                              title={supplier.is_active ? 'Deactivate' : 'Activate'}
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

      {/* EDIT SUPPLIER MODAL */}
      {selectedSupplierForEdit && (
        <EditSupplierModal
          isOpen={Boolean(selectedSupplierForEdit)}
          supplier={selectedSupplierForEdit}
          onClose={() => setSelectedSupplierForEdit(null)}
          onSupplierUpdated={handleSupplierUpdated}
        />
      )}
    </div>
  );
};

export default Suppliers;
