import React, { useState, useEffect } from 'react';
import { X, Building2, User, Phone, Mail, MapPin, CheckCircle, ShieldAlert } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * EditSupplierModal Component
 * 
 * Allows modifying existing supplier vendor details and toggling
 * their active / inactive operational status.
 */
export const EditSupplierModal = ({ isOpen, onClose, supplier, onSupplierUpdated }) => {
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (supplier) {
      setName(supplier.name || '');
      setContactPerson(supplier.contact_person || '');
      setPhone(supplier.phone || '');
      setEmail(supplier.email || '');
      setAddress(supplier.address || '');
      setIsActive(Boolean(supplier.is_active));
    }
  }, [supplier]);

  if (!isOpen || !supplier) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Supplier name is required');
      return;
    }

    try {
      setLoading(true);
      const res = await api.put(`/suppliers/${supplier.id}`, {
        name: name.trim(),
        contact_person: contactPerson.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        is_active: isActive
      });

      toast.success(`Supplier "${res.data.supplier.name}" updated successfully`);
      if (onSupplierUpdated) {
        onSupplierUpdated(res.data.supplier);
      }
      onClose();
    } catch (err) {
      console.error('Failed to update supplier:', err);
      toast.error(err.response?.data?.message || 'Failed to update supplier');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '16px'
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '500px',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Edit Supplier Details</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Vendor / Supplier Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Yamaha Motor Philippines"
                className="input-premium"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Contact Person
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maria Santos"
                  className="input-premium"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Contact Phone
                </label>
                <input
                  type="text"
                  placeholder="e.g. 0917-123-4567"
                  className="input-premium"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Email Address
              </label>
              <input
                type="email"
                placeholder="vendor@supplier.com"
                className="input-premium"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Office / Warehouse Address
              </label>
              <input
                type="text"
                placeholder="e.g. Km. 20 East Service Road, Taguig City"
                className="input-premium"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            {/* Operational Status Selector */}
            <div style={{
              background: isActive ? 'rgba(50, 215, 75, 0.05)' : 'rgba(239, 68, 68, 0.05)',
              border: `1px solid ${isActive ? 'rgba(50, 215, 75, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              borderRadius: '8px',
              padding: '12px',
              marginTop: '4px'
            }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Operational Supplier Status
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}>
                  <input
                    type="radio"
                    name="status"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                  />
                  <strong>Active</strong> (Available in Stock Receive)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', color: !isActive ? 'var(--danger)' : 'var(--text-muted)' }}>
                  <input
                    type="radio"
                    name="status"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                  />
                  <strong>Inactive</strong> (Hidden from Purchasing)
                </label>
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isActive 
                  ? 'Active suppliers can be selected when receiving inventory shipments.'
                  : 'Inactive suppliers will be archived from purchase receiving forms, but all historical delivery slips remain intact.'}
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border)'
          }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CheckCircle size={16} />
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditSupplierModal;
