import React, { useState, useEffect } from 'react';
import { Building2, Plus, Search, Phone, Mail, MapPin, Edit3, CheckCircle, RefreshCw } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import QuickAddSupplierModal from '../components/QuickAddSupplierModal';

/**
 * Suppliers Directory Page
 * 
 * Provides a management directory for all registered parts suppliers
 * and vendor contact channels.
 */
export const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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

  const filteredSuppliers = suppliers.filter(s => {
    const term = searchTerm.toLowerCase();
    return (
      (s.name && s.name.toLowerCase().includes(term)) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(term)) ||
      (s.email && s.email.toLowerCase().includes(term)) ||
      (s.phone && s.phone.toLowerCase().includes(term))
    );
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

      {/* Search Bar */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid var(--border)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading suppliers directory...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No suppliers found matching your query.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building2 size={16} style={{ color: 'var(--primary)' }} />
                        <span>{supplier.name}</span>
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
                        color: supplier.is_active ? 'var(--primary)' : 'var(--danger)'
                      }}>
                        {supplier.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <QuickAddSupplierModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSupplierCreated={handleSupplierCreated}
      />
    </div>
  );
};

export default Suppliers;
