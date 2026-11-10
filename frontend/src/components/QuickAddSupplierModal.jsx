import React, { useState } from 'react';
import { X, Building2, User, Phone, Mail, MapPin, CheckCircle, MessageSquare, ExternalLink, CreditCard } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * QuickAddSupplierModal Component
 * 
 * Allows registering a new Facebook vendor or distributor on the fly
 * directly from the Stock-In form or supplier directory.
 */
export const QuickAddSupplierModal = ({ isOpen, onClose, onSupplierCreated, asPanel = false }) => {
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
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Supplier name / FB Store name is required');
      return;
    }
    if (!/[a-zA-Z]/.test(cleanName) || cleanName.replace(/[^a-zA-Z]/g, '').length < 2) {
      toast.error('Supplier name must contain at least 2 letters');
      return;
    }

    const cleanContact = sellerContactName.trim();
    if (cleanContact) {
      if (/\d/.test(cleanContact)) {
        toast.error('Contact person name cannot contain numbers');
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
      const res = await api.post('/suppliers', {
        name: cleanName,
        fb_page_name: fbPageName.trim() || cleanName,
        seller_contact_name: cleanContact || undefined,
        contact_person: cleanContact || undefined,
        messenger_url: finalMessenger || undefined,
        facebook_page_url: finalFbPageUrl || undefined,
        phone: cleanPhone || undefined,
        category_tags: categoryTags.trim() || undefined,
        gcash_account_name: gcashAccountName.trim() || undefined,
        gcash_account_number: gcashAccountNumber.trim() || undefined,
        email: cleanEmail || undefined,
        address: address.trim() || undefined
      });

      toast.success(`Facebook Supplier "${res.data.supplier.name}" registered successfully!`);
      if (onSupplierCreated) {
        onSupplierCreated(res.data.supplier);
      }
      onClose();
    } catch (err) {
      console.error('Failed to register supplier:', err);
      toast.error(err.response?.data?.message || 'Failed to create supplier');
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div
      id={asPanel ? 'inline-quick-add-supplier-card' : undefined}
      style={{
      background: 'var(--surface)',
      borderRadius: '14px',
      width: '100%',
      maxWidth: asPanel ? '100%' : '560px',
      maxHeight: asPanel ? 'none' : '90vh',
      border: '1.5px solid var(--primary)',
      boxShadow: asPanel ? '0 8px 30px rgba(16, 185, 129, 0.12)' : '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      marginBottom: asPanel ? '20px' : 0
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
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold' }}>Register Facebook Supplier</h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>Online vendor, FB shop, and messenger contact</p>
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
              placeholder="e.g. JVT Racing Parts Direct (Facebook Wholesale)"
              className="input-premium"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!fbPageName) setFbPageName(e.target.value);
              }}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Facebook Page Name
              </label>
              <input
                type="text"
                placeholder="e.g. JVT Racing Parts Official Philippines"
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
                placeholder="e.g. Jayson Tan (FB Seller)"
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
                placeholder="e.g. m.me/jvtracingpartsph"
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
                placeholder="e.g. 0928-554-1092"
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
                placeholder="09XXXXXXXXX for online payment"
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
                placeholder="e.g. Jayson Tan"
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
                placeholder="seller@gmail.com"
                className="input-premium"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Supply Category Tags (e.g. Engine, Brakes & Levers, Oils & Fluids, Tires)
            </label>
            <input
              type="text"
              placeholder="e.g. Brakes, Calipers, Master Pumps, Levers"
              className="input-premium"
              value={categoryTags}
              onChange={(e) => setCategoryTags(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Pickup / Warehouse Location / FB Group
            </label>
            <input
              type="text"
              placeholder="e.g. Caloocan 10th Ave / FB Marketplace Hub"
              className="input-premium"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
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
              <span>{loading ? 'Registering...' : 'Save FB Supplier'}</span>
            </button>
          </div>
        </form>
    </div>
  );

  if (asPanel) {
    return content;
  }

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
      {content}
    </div>
  );
};

export default QuickAddSupplierModal;
