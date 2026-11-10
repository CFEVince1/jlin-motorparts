import React, { useState, useEffect } from 'react';
import { X, Building2, User, Phone, Mail, MapPin, CheckCircle, ShieldAlert, MessageSquare, ExternalLink, CreditCard } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * EditSupplierModal Component
 * 
 * Allows modifying existing supplier vendor details, Facebook links,
 * payment details, and toggling their active / inactive operational status.
 */
export const EditSupplierModal = ({ isOpen, onClose, supplier, onSupplierUpdated }) => {
  const [name, setName] = useState('');
  const [fbPageName, setFbPageName] = useState('');
  const [sellerContactName, setSellerContactName] = useState('');
  const [messengerUrl, setMessengerUrl] = useState('');
  const [facebookPageUrl, setFacebookPageUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [gcashAccountName, setGcashAccountName] = useState('');
  const [gcashAccountNumber, setGcashAccountNumber] = useState('');
  const [email, setEmail] = useState('');
  const [categoryTags, setCategoryTags] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (supplier) {
      setName(supplier.name || '');
      setFbPageName(supplier.fb_page_name || supplier.name || '');
      setSellerContactName(supplier.seller_contact_name || supplier.contact_person || '');
      setMessengerUrl(supplier.messenger_url || '');
      setFacebookPageUrl(supplier.facebook_page_url || '');
      setPhone(supplier.phone || '');
      setGcashAccountName(supplier.gcash_account_name || '');
      setGcashAccountNumber(supplier.gcash_account_number || '');
      setEmail(supplier.email || '');
      setCategoryTags(supplier.category_tags || '');
      setAddress(supplier.address || '');
      setIsActive(Boolean(supplier.is_active));
    }
  }, [supplier]);

  if (!isOpen || !supplier) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Supplier name is required');
      return;
    }
    if (!/[a-zA-Z]/.test(cleanName) || cleanName.replace(/[^a-zA-Z]/g, '').length < 2) {
      toast.error('Supplier name must contain at least 2 letters');
      return;
    }

    const cleanContact = sellerContactName.trim();
    if (cleanContact) {
      if (/\d/.test(cleanContact)) {
        toast.error('Contact person cannot contain numbers');
        return;
      }
    }

    const cleanPhone = phone.trim();
    if (cleanPhone) {
      if (/[a-zA-Z]/.test(cleanPhone)) {
        toast.error('Contact phone cannot contain letters');
        return;
      }
      if (!/^[0-9+\-()\s]{7,20}$/.test(cleanPhone) || cleanPhone.replace(/[^0-9]/g, '').length < 7) {
        toast.error('Please enter a valid phone number (at least 7 digits)');
        return;
      }
    }

    const cleanEmail = email.trim();
    if (cleanEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        toast.error('Please enter a valid email address');
        return;
      }
    }

    let finalMessenger = messengerUrl.trim();
    if (finalMessenger && !finalMessenger.startsWith('http://') && !finalMessenger.startsWith('https://')) {
      if (finalMessenger.startsWith('m.me/')) {
        finalMessenger = 'https://' + finalMessenger;
      } else {
        finalMessenger = `https://m.me/${finalMessenger.replace(/^@/, '')}`;
      }
    }

    let finalFbPageUrl = facebookPageUrl.trim();
    if (finalFbPageUrl && !finalFbPageUrl.startsWith('http://') && !finalFbPageUrl.startsWith('https://')) {
      finalFbPageUrl = 'https://' + finalFbPageUrl;
    }

    try {
      setLoading(true);
      const res = await api.put(`/suppliers/${supplier.id}`, {
        name: cleanName,
        fb_page_name: fbPageName.trim() || cleanName,
        seller_contact_name: cleanContact || null,
        contact_person: cleanContact || null,
        messenger_url: finalMessenger || null,
        facebook_page_url: finalFbPageUrl || null,
        phone: cleanPhone || null,
        category_tags: categoryTags.trim() || null,
        gcash_account_name: gcashAccountName.trim() || null,
        gcash_account_number: gcashAccountNumber.trim() || null,
        email: cleanEmail || null,
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
        maxWidth: '560px',
        maxHeight: '90vh',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'rgba(24, 119, 242, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#1877F2',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '1.1rem'
            }}>
              f
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold' }}>Edit Facebook Supplier</h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>Update contact info, Messenger link, and status</p>
            </div>
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
        <form onSubmit={handleSubmit} style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Supplier / FB Store Name *
            </label>
            <input
              type="text"
              className="input-premium"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Facebook Page Name
              </label>
              <input
                type="text"
                className="input-premium"
                value={fbPageName}
                onChange={(e) => setFbPageName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Seller / Agent Contact Name
              </label>
              <input
                type="text"
                className="input-premium"
                value={sellerContactName}
                onChange={(e) => setSellerContactName(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#1877F2', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <MessageSquare size={13} /> Messenger Link (m.me)
              </label>
              <input
                type="text"
                placeholder="m.me/username"
                className="input-premium"
                value={messengerUrl}
                onChange={(e) => setMessengerUrl(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                FB Page URL
              </label>
              <input
                type="text"
                placeholder="https://facebook.com/..."
                className="input-premium"
                value={facebookPageUrl}
                onChange={(e) => setFacebookPageUrl(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Contact Phone / Mobile
              </label>
              <input
                type="text"
                className="input-premium"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9+\-()\s]/g, ''))}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#007DFE', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <CreditCard size={13} /> GCash Mobile Number
              </label>
              <input
                type="text"
                placeholder="09XXXXXXXXX"
                className="input-premium"
                value={gcashAccountNumber}
                onChange={(e) => setGcashAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                GCash Account Name
              </label>
              <input
                type="text"
                placeholder="Account Name"
                className="input-premium"
                value={gcashAccountName}
                onChange={(e) => setGcashAccountName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Email Address (Optional)
              </label>
              <input
                type="email"
                className="input-premium"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Supply Category Tags (e.g. Engine, Brakes, Transmission, Oils)
            </label>
            <input
              type="text"
              className="input-premium"
              value={categoryTags}
              placeholder="e.g. Brakes, Calipers, Levers"
              onChange={(e) => setCategoryTags(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Pickup / Warehouse Location / FB Group
            </label>
            <input
              type="text"
              className="input-premium"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          {/* Operational Status Toggle */}
          <div style={{
            background: 'var(--surface-hover)',
            padding: '12px 16px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--border)'
          }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Active Vendor Status</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                {isActive ? 'Available for new stock receiving' : 'Hidden from receiving dropdown'}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: isActive ? 'var(--primary)' : 'var(--danger)' }}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>

          {/* Footer Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '10px',
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
              disabled={loading || !name.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <CheckCircle size={16} />
              <span>{loading ? 'Saving...' : 'Update Supplier'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditSupplierModal;
