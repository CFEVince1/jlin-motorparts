import React, { useState, useEffect } from 'react';
import { Building2, Plus, Search, Phone, Mail, MapPin, Edit3, CheckCircle, RefreshCw, UserCheck, UserX } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import QuickAddSupplierModal from '../components/QuickAddSupplierModal';
import EditSupplierModal from '../components/EditSupplierModal';

/**
 * Suppliers Directory Page
 * 
 * Provides a management directory for all registered parts suppliers
 * and vendor contact channels, with active/inactive status management.
 */
export const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'inactive'
  const [isAddModalOpen, setIsAddModalOpen] = useState(() => new URLSearchParams(window.location.search).get('add') === 'true');
  const [selectedSupplierForEdit, setSelectedSupplierForEdit] = useState(null);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/suppliers?includeInactive=true');
      setSuppliers(res.data || []);
    } catch (err) {
      console.error('Failed to load suppliers:', err);
      toast.error('Failed to fetch suppliers directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleSupplierCreated = (newSupplier) => {
    setSuppliers(prev => [newSupplier, ...prev]);
  };

  const handleSupplierUpdated = (updatedSupplier) => {
    setSuppliers(prev => prev.map(s => s.id === updatedSupplier.id ? updatedSupplier : s));
  };

  const handleToggleStatus = async (supplier) => {
    const nextStatus = !supplier.is_active;
    const actionLabel = nextStatus ? 'activate' : 'deactivate';
    
    if (!window.confirm(`Are you sure you want to ${actionLabel} supplier "${supplier.name}"?`)) {
      return;
    }

    try {
      const res = await api.put(`/suppliers/${supplier.id}`, {
        is_active: nextStatus
      });
      setSuppliers(prev => prev.map(s => s.id === supplier.id ? res.data.supplier : s));
      toast.success(
        nextStatus 
          ? `Supplier "${supplier.name}" is now Active` 
          : `Supplier "${supplier.name}" marked as Inactive (hidden from stock receive)`
      );
    } catch (err) {
      console.error('Failed to toggle supplier status:', err);
      toast.error(err.response?.data?.message || 'Failed to update supplier status');
    }
  };

  const activeCount = suppliers.filter(s => s.is_active).length;
  const inactiveCount = suppliers.filter(s => !s.is_active).length;

  const filteredSuppliers = suppliers.filter(s => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = (
      (s.name && s.name.toLowerCase().includes(term)) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(term)) ||
      (s.email && s.email.toLowerCase().includes(term)) ||
      (s.phone && s.phone.toLowerCase().includes(term))
    );

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return Boolean(s.is_active);
    if (statusFilter === 'inactive') return !s.is_active;
    return true;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Building2 size={26} style={{ color: 'var(--primary)' }} />
            Suppliers Directory
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
            Registered vendors, wholesale distributors, and official brand suppliers
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={fetchSuppliers}
            disabled={loading}
            title="Refresh Suppliers"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsAddModalOpen(true)}
          >
            <Plus size={18} /> Register Supplier
          </button>
        </div>
      </div>

      {/* Search and Status Filter Bar */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid var(--border)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
          <Search size={18} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by vendor name, contact person, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-premium"
            style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
          />
        </div>

        {/* Status Filter Tabs */}
        <div style={{ display: 'inline-flex', background: 'var(--surface-hover)', padding: '3px', borderRadius: '8px', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: statusFilter === 'all' ? 'var(--primary)' : 'transparent',
              color: statusFilter === 'all' ? '#ffffff' : 'var(--text-muted)'
            }}
          >
            All ({suppliers.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: statusFilter === 'active' ? 'var(--primary)' : 'transparent',
              color: statusFilter === 'active' ? '#ffffff' : 'var(--text-muted)'
            }}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('inactive')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: statusFilter === 'inactive' ? 'var(--danger)' : 'transparent',
              color: statusFilter === 'inactive' ? '#ffffff' : 'var(--text-muted)'
            }}
          >
            Inactive ({inactiveCount})
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-muted)' }}>Supplier Name</th>
                <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-muted)' }}>Contact Person</th>
                <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-muted)' }}>Contact Info</th>
                <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-muted)' }}>Address</th>
                <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-muted)', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading suppliers directory...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No suppliers found matching your query.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} style={{ borderBottom: '1px solid var(--border)', opacity: supplier.is_active ? 1 : 0.75 }}>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building2 size={16} style={{ color: supplier.is_active ? 'var(--primary)' : 'var(--text-muted)' }} />
                        <span style={{ color: supplier.is_active ? 'inherit' : 'var(--text-muted)' }}>{supplier.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>
                      {supplier.contact_person || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.85rem' }}>
                        {supplier.phone && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={13} style={{ color: 'var(--text-muted)' }} /> {supplier.phone}
                          </span>
                        )}
                        {supplier.email && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Mail size={13} style={{ color: 'var(--text-muted)' }} /> {supplier.email}
                          </span>
                        )}
                        {!supplier.phone && !supplier.email && '—'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', maxWidth: '240px' }}>
                      {supplier.address || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor: supplier.is_active ? 'rgba(50, 215, 75, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: supplier.is_active ? 'var(--primary)' : 'var(--danger)',
                        border: `1px solid ${supplier.is_active ? 'rgba(50, 215, 75, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                      }}>
                        {supplier.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                        {/* Edit Supplier Button */}
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          onClick={() => setSelectedSupplierForEdit(supplier)}
                          title="Edit supplier details & status"
                        >
                          <Edit3 size={13} /> Edit
                        </button>

                        {/* Quick Status Toggle Button */}
                        <button
                          type="button"
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            border: supplier.is_active 
                              ? '1px solid rgba(239, 68, 68, 0.3)' 
                              : '1px solid rgba(50, 215, 75, 0.3)',
                            background: supplier.is_active 
                              ? 'rgba(239, 68, 68, 0.08)' 
                              : 'rgba(50, 215, 75, 0.08)',
                            color: supplier.is_active 
                              ? 'var(--danger)' 
                              : 'var(--primary)'
                          }}
                          onClick={() => handleToggleStatus(supplier)}
                          title={supplier.is_active ? 'Deactivate supplier' : 'Reactivate supplier'}
                        >
                          {supplier.is_active ? (
                            <>
                              <UserX size={13} /> Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck size={13} /> Activate
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Add Supplier Modal */}
      <QuickAddSupplierModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSupplierCreated={handleSupplierCreated}
      />

      {/* Edit Supplier Modal */}
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

