import React, { useState, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, KeyRound, ShieldAlert, CheckCircle, Lock, Eye, EyeOff, Check, X, Settings2, Search } from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import ManageCompatibility from './ManageCompatibility';
import CompatibilitySearch from './CompatibilitySearch';
import RecoveryEmailCard from '../components/RecoveryEmailCard';

/**
 * StaffProfileScreen Page
 * 
 * Staff/Admin Account Management & Security:
 * - Update username & password via PATCH /api/staff/profile.
 * - Requires current password verification.
 * - Increments user.token_version, revoking all existing concurrent sessions.
 * - For Admin accounts only: integrates "Compatibility Rules" management.
 */
export const StaffProfileScreen = () => {
  const { user, login } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    if (tab === 'fitment') return 'fitment';
    if (isAdmin && tab === 'compatibility') return 'compatibility';
    return 'account';
  });

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'compatibility') {
      setSearchParams({ tab: 'compatibility' });
    } else if (tab === 'fitment') {
      setSearchParams({ tab: 'fitment' });
    } else {
      setSearchParams({});
    }
  };
  const [username, setUsername] = useState(user?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error('Current password is required to verify your identity');
      return;
    }

    if (newPassword) {
      if (newPassword.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }

      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/.test(newPassword)) {
        toast.error('Password must contain uppercase, lowercase, number & special character');
        return;
      }

      if (newPassword.toLowerCase() === (username.trim() || user?.username || '').toLowerCase()) {
        toast.error('Password cannot be the same as your username');
        return;
      }

      if (newPassword !== confirmPassword) {
        toast.error('New password and confirmation do not match');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        currentPassword,
        username: username.trim() !== user?.username ? username.trim() : undefined,
        newPassword: newPassword ? newPassword : undefined,
      };

      const res = await api.patch('/staff/profile', payload);

      // On success, backend returns { message, token, user }
      if (res.data?.token) {
        localStorage.setItem('token', res.data.token);
      }

      toast.success('Profile and credentials updated! Other active sessions were securely revoked.');

      // Clear password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Reload or refresh context
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Profile update failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: activeTab === 'account' ? '650px' : '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ marginBottom: '6px' }}>My Account & Security</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
          Manage your credentials, motorcycle fitment lookups, and system configurations.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--surface-hover)',
        padding: '4px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        width: 'fit-content'
      }}>
        <button
          type="button"
          onClick={() => handleTabChange('account')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'account' ? '#fff' : 'var(--text-muted)',
            backgroundColor: activeTab === 'account' ? 'var(--primary)' : 'transparent',
            transition: 'all 0.15s ease'
          }}
        >
          <User size={16} />
          <span>Account & Security</span>
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('fitment')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'fitment' ? '#fff' : 'var(--text-muted)',
            backgroundColor: activeTab === 'fitment' ? 'var(--primary)' : 'transparent',
            transition: 'all 0.15s ease'
          }}
        >
          <Search size={16} />
          <span>Motorcycle Fitment</span>
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => handleTabChange('compatibility')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              color: activeTab === 'compatibility' ? '#fff' : 'var(--text-muted)',
              backgroundColor: activeTab === 'compatibility' ? 'var(--primary)' : 'transparent',
              transition: 'all 0.15s ease'
            }}
          >
            <Settings2 size={16} />
            <span>Compatibility Rules</span>
          </button>
        )}
      </div>

      {/* Render Active Tab Content */}
      {isAdmin && activeTab === 'compatibility' ? (
        <ManageCompatibility />
      ) : activeTab === 'fitment' ? (
        <CompatibilitySearch />
      ) : (
        <div className="glass-panel" style={{ padding: '24px' }}>
        {/* User Badge Info */}
        <div style={{
          padding: '12px 16px',
          background: 'var(--surface-hover)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: 'rgba(5, 150, 105, 0.15)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '1.2rem'
          }}>
            {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div style={{ fontWeight: '600', fontSize: '0.95rem', color: 'var(--text-main)' }}>
              {user?.username}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              Role: <strong style={{ color: 'var(--primary)' }}>{user?.role}</strong> | Security Token v{user?.token_version || 1}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Username
            </label>
            <input
              type="text"
              className="input-premium"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '4px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-main)', display: 'block', marginBottom: '10px' }}>
              Change Password (Leave blank to keep existing)
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  New Password
                </label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    className="input-premium"
                    style={{ width: '100%', paddingRight: '40px' }}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {newPassword.length > 0 && (
                  <div style={{ 
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '12px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '6px', 
                    marginTop: '6px', 
                    fontSize: '0.75rem' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: newPassword.length >= 8 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {newPassword.length >= 8 ? <Check size={12} /> : <X size={12} />} 8+ characters
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/.test(newPassword) ? 'var(--success)' : 'var(--text-muted)' }}>
                      {/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/.test(newPassword) ? <Check size={12} /> : <X size={12} />} Uppercase, lowercase, number & special char
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Confirm New Password
                </label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Enter new password again here"
                    className="input-premium"
                    style={{ 
                      width: '100%', 
                      paddingRight: '40px',
                      borderColor: confirmPassword && newPassword !== confirmPassword ? 'var(--danger)' : undefined
                    }}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                    New password does not match. Enter new password again here.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '4px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--danger)', display: 'block', marginBottom: '4px' }}>
              Current Password (Mandatory to save changes) *
            </label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type={showCurrentPassword ? "text" : "password"}
                placeholder="Enter your current password"
                className="input-premium"
                style={{ width: '100%', paddingRight: '40px' }}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', height: '40px', marginTop: '10px', fontSize: '0.9rem' }}
            disabled={submitting}
          >
            {submitting ? 'Updating Credentials...' : (
              <>
                <CheckCircle size={16} /> Save Security Changes
              </>
            )}
          </button>
        </form>

        {isAdmin && <RecoveryEmailCard />}
      </div>
      )}
    </div>
  );
};

export default StaffProfileScreen;
