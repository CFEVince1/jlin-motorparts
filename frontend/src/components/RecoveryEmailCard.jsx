import { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Mail, CheckCircle2, AlertCircle, Eye, EyeOff, Edit3, Send, Check } from 'lucide-react';

export default function RecoveryEmailCard() {
  const [status, setStatus] = useState({ email: null, verified: false });
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  
  // UI states
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [showResendBox, setShowResendBox] = useState(false);
  const [resendPassword, setResendPassword] = useState('');
  const [showResendPassword, setShowResendPassword] = useState(false);
  
  const [msg, setMsg] = useState(null); // { text, type: 'success' | 'error' }
  const [loading, setLoading] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await api.get('/staff/email');
      setStatus(res.data || { email: null, verified: false });
      if (res.data?.email) {
        setEmailInput(res.data.email);
      }
    } catch {
      // silently handle
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Request new code (used when setting or changing email)
  const handleRequestCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const { data } = await api.post('/staff/email/request', {
        email: emailInput.trim(),
        currentPassword: password
      });
      const successText = data.message || 'Verification code sent to your email!';
      setMsg({ text: successText, type: 'success' });
      toast.success(successText);
      setPassword('');
      setIsChangingEmail(false);
      setShowResendBox(false);
      await loadStatus();
    } catch (err) {
      const errText = err.response?.data?.message || 'Could not send verification code.';
      setMsg({ text: errText, type: 'error' });
      toast.error(errText);
    } finally {
      setLoading(false);
    }
  };

  // Resend code to current email
  const handleResendCode = async (e) => {
    e.preventDefault();
    if (!status.email) return;
    setLoading(true);
    setMsg(null);
    try {
      const { data } = await api.post('/staff/email/request', {
        email: status.email,
        currentPassword: resendPassword
      });
      const successText = data.message || `A new code was sent to ${status.email}`;
      setMsg({ text: successText, type: 'success' });
      toast.success(successText);
      setResendPassword('');
      setShowResendBox(false);
    } catch (err) {
      const errText = err.response?.data?.message || 'Failed to resend verification code.';
      setMsg({ text: errText, type: 'error' });
      toast.error(errText);
    } finally {
      setLoading(false);
    }
  };

  // Confirm OTP code
  const handleConfirmCode = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return;
    setLoading(true);
    setMsg(null);
    try {
      const { data } = await api.post('/staff/email/confirm', { otp: otp.trim() });
      const successText = data.message || 'Email verified successfully! Password recovery is now active.';
      setMsg({ text: successText, type: 'success' });
      toast.success(successText);
      setOtp('');
      await loadStatus();
    } catch (err) {
      const errText = err.response?.data?.message || 'Invalid or expired 6-digit code.';
      setMsg({ text: errText, type: 'error' });
      toast.error(errText);
    } finally {
      setLoading(false);
    }
  };

  const isPendingVerification = Boolean(status.email && !status.verified);
  const isVerified = Boolean(status.email && status.verified);
  const showEmailForm = !status.email || isChangingEmail;

  return (
    <section className="card" style={{ marginTop: '20px', padding: '20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
      {/* Title Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Mail size={20} style={{ color: 'var(--primary)' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
            Password Recovery Email
          </h3>
        </div>

        {/* If verified and not in change mode, show quick edit button in header */}
        {isVerified && !isChangingEmail && (
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '5px 12px', height: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => {
              setIsChangingEmail(true);
              setMsg(null);
            }}
          >
            <Edit3 size={14} /> Change Email
          </button>
        )}
      </div>

      {/* Status Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 14px',
        borderRadius: '8px',
        backgroundColor: isVerified 
          ? 'rgba(16, 185, 129, 0.1)' 
          : isPendingVerification 
            ? 'rgba(234, 179, 8, 0.1)' 
            : 'rgba(59, 130, 246, 0.1)',
        border: `1px solid ${
          isVerified 
            ? 'rgba(16, 185, 129, 0.3)' 
            : isPendingVerification 
              ? 'rgba(234, 179, 8, 0.3)' 
              : 'rgba(59, 130, 246, 0.3)'
        }`,
        margin: '12px 0 16px 0',
        fontSize: '0.85rem'
      }}>
        {isVerified ? (
          <CheckCircle2 size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
        ) : isPendingVerification ? (
          <AlertCircle size={18} style={{ color: '#eab308', flexShrink: 0, marginTop: '2px' }} />
        ) : (
          <Mail size={18} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
        )}
        <div style={{ margin: 0, color: 'var(--text-main)' }}>
          {status.email ? (
            <div>
              <span style={{ fontWeight: 600 }}>{status.email}</span>
              {' — '}
              <span style={{ color: isVerified ? 'var(--primary)' : '#eab308', fontWeight: 600 }}>
                {isVerified ? 'Verified (Recovery Active)' : 'Pending Verification'}
              </span>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {isVerified 
                  ? 'Your account is linked. If you forget your password, you can reset it via email verification.'
                  : 'A 6-digit confirmation code was sent to this address. Enter the code below to verify your email.'}
              </p>
            </div>
          ) : (
            <div>
              <span style={{ fontWeight: 600 }}>No recovery email linked</span>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Link a recovery email so you can safely reset your admin password if you ever get locked out.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* FORM 1: When Email is Pending Verification (Enter 6-digit code) */}
      {isPendingVerification && !isChangingEmail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <form onSubmit={handleConfirmCode} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-main)', display: 'block' }}>
              Enter 6-Digit Verification Code
            </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="123456"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                className="input-premium"
                style={{
                  flex: 1,
                  letterSpacing: '6px',
                  fontSize: '1.25rem',
                  fontWeight: '700',
                  textAlign: 'center',
                  height: '44px'
                }}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                disabled={loading}
              />
              <button
                type="submit"
                className="btn-primary"
                style={{ height: '44px', padding: '0 20px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}
                disabled={loading || otp.trim().length !== 6}
              >
                <Check size={16} />
                {loading ? 'Verifying...' : 'Verify Email'}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Check your Gmail inbox (and Spam folder) for the code. It expires in 10 minutes.
            </p>
          </form>

          {/* Options: Resend Code or Change Email */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            paddingTop: '8px',
            borderTop: '1px dashed var(--border)',
            fontSize: '0.8rem'
          }}>
            {!showResendBox ? (
              <button
                type="button"
                onClick={() => { setShowResendBox(true); setMsg(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                disabled={loading}
              >
                Didn't get the code? Resend Code
              </button>
            ) : null}

            <span style={{ color: 'var(--text-muted)' }}>•</span>

            <button
              type="button"
              onClick={() => {
                setIsChangingEmail(true);
                setShowResendBox(false);
                setMsg(null);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              disabled={loading}
            >
              Wrong email? Change Email Address
            </button>
          </div>

          {/* Inline Resend Box (requires password to authorize sending another OTP) */}
          {showResendBox && (
            <form onSubmit={handleResendCode} style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.02))',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-main)' }}>
                Confirm your password to resend a new verification code to <strong>{status.email}</strong>:
              </p>
              <div style={{ position: 'relative' }}>
                <input
                  type={showResendPassword ? 'text' : 'password'}
                  placeholder="Enter your current password"
                  className="input-premium"
                  style={{ width: '100%', paddingRight: '40px' }}
                  value={resendPassword}
                  onChange={(e) => setResendPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowResendPassword(p => !p)}
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
                  title={showResendPassword ? 'Hide password' : 'Show password'}
                >
                  {showResendPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ height: '34px', fontSize: '0.8rem', padding: '0 14px' }}
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send New Code'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ height: '34px', fontSize: '0.8rem', padding: '0 12px' }}
                  onClick={() => { setShowResendBox(false); setResendPassword(''); }}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* FORM 2: Link or Change Email (Requires New Email + Current Password) */}
      {showEmailForm && (
        <form onSubmit={handleRequestCode} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              {status.email ? 'New Recovery Email Address' : 'Recovery Email Address'}
            </label>
            <input
              type="email"
              placeholder="e.g. admin@yourdomain.com"
              className="input-premium"
              style={{ width: '100%' }}
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              required
              disabled={loading}
            />
            <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Enter a valid email address that you own. We will send a 6-digit confirmation code.
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Current Password (to authorize change)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your current password"
                className="input-premium"
                style={{ width: '100%', paddingRight: '40px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1, height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              disabled={loading}
            >
              <Send size={15} />
              {loading ? 'Sending Code...' : 'Send Verification Code'}
            </button>
            {status.email && (
              <button
                type="button"
                className="btn-secondary"
                style={{ height: '38px', padding: '0 16px' }}
                onClick={() => {
                  setIsChangingEmail(false);
                  setEmailInput(status.email);
                  setPassword('');
                  setMsg(null);
                }}
                disabled={loading}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {/* When Verified and not changing email: Display a clear button */}
      {isVerified && !isChangingEmail && (
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => {
              setIsChangingEmail(true);
              setEmailInput(status.email);
              setMsg(null);
            }}
          >
            <Edit3 size={15} /> Change Email Address
          </button>
        </div>
      )}

      {/* Message Feedback Banner */}
      {msg && (
        <p
          role="status"
          style={{
            marginTop: '14px',
            fontSize: '0.85rem',
            padding: '9px 12px',
            borderRadius: '6px',
            backgroundColor: msg.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            border: `1px solid ${msg.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            color: msg.type === 'error' ? '#ef4444' : 'var(--primary)',
            margin: '12px 0 0 0'
          }}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
