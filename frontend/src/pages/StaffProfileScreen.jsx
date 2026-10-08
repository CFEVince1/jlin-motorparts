import React, { useState, useContext } from 'react';
import { User, KeyRound, ShieldAlert, CheckCircle, Lock } from 'lucide-react';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * StaffProfileScreen Page
 * 
 * Staff Account Management & Security:
 * - Update username & password via PATCH /api/staff/profile.
 * - Requires current password verification.
 * - Increments user.token_version, revoking all existing concurrent sessions.
 * - Immediately updates active JWT in localStorage and AuthContext.
 */
export const StaffProfileScreen = () => {
  const { user, login } = useContext(AuthContext);

  const [username, setUsername] = useState(user?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error('Current password is required to verify your identity');
      return;
    }

    if (newPassword && newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match');
      return;
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
    <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ marginBottom: '6px' }}>My Account & Security</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
          Manage your credentials. Updating your password automatically increments your security token and signs out any stale browser sessions.
        </p>
      </div>

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
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  New Password
                </label>
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  className="input-premium"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  placeholder="Re-type new password"
                  className="input-premium"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '4px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--danger)', display: 'block', marginBottom: '4px' }}>
              Current Password (Mandatory to save changes) *
            </label>
            <input
              type="password"
              placeholder="Enter your current password"
              className="input-premium"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={submitting}
            />
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
      </div>
    </div>
  );
};

export default StaffProfileScreen;
