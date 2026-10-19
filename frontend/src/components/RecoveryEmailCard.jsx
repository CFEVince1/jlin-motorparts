import { useEffect, useState } from 'react';
import api from '../services/api';
import { Mail, CheckCircle2, AlertCircle, KeyRound, ShieldCheck, RefreshCw, Eye, EyeOff } from 'lucide-react';

export default function RecoveryEmailCard() {
  const [status, setStatus] = useState({ email: null, verified: false });
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => api.get('/staff/email').then((r) => setStatus(r.data));
  useEffect(() => { load().catch(() => {}); }, []);

  const requestCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      const { data } = await api.post('/staff/email/request', { email, currentPassword });
      setMsg(data.message);
      setCodeSent(true);
      setCurrentPassword('');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Could not send the code.');
    } finally {
      setLoading(false);
    }
  };

  const confirmCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      const { data } = await api.post('/staff/email/confirm', { otp: otp.trim() });
      setMsg(data.message);
      setCodeSent(false);
      setOtp('');
      await load();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card" style={{ marginTop: '20px', padding: '20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <Mail size={20} style={{ color: 'var(--primary)' }} />
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
          Password Recovery Email
        </h3>
      </div>
      
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        borderRadius: '8px',
        backgroundColor: status.verified ? 'rgba(16, 185, 129, 0.1)' : 'rgba(234, 179, 8, 0.1)',
        border: `1px solid ${status.verified ? 'rgba(16, 185, 129, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
        margin: '12px 0 16px 0',
        fontSize: '0.85rem'
      }}>
        {status.verified ? (
          <CheckCircle2 size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        ) : (
          <AlertCircle size={18} style={{ color: '#eab308', flexShrink: 0 }} />
        )}
        <p style={{ margin: 0, color: 'var(--text-main)' }}>
          {status.email ? (
            <span>
              <strong>{status.email}</strong> —{' '}
              <span style={{ color: status.verified ? 'var(--primary)' : '#eab308', fontWeight: 600 }}>
                {status.verified ? 'Verified (Recovery Active)' : 'Not verified yet'}
              </span>
            </span>
          ) : (
            'No recovery email linked yet. Link one below to enable self-service password reset.'
          )}
        </p>
      </div>

      {!codeSent ? (
        <form onSubmit={requestCode} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Recovery Email Address
            </label>
            <input
              type="email"
              placeholder="e.g. admin@yourdomain.com"
              className="input-premium"
              style={{ width: '100%' }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
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
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
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

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', height: '38px', marginTop: '4px' }}
            disabled={loading}
          >
            {loading ? 'Sending Code...' : 'Send Verification Code'}
          </button>
        </form>
      ) : (
        <form onSubmit={confirmCode} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
            We emailed a 6-digit confirmation code. Enter it below to complete verification:
          </p>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              6-Digit Code
            </label>
            <input
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              className="input-premium"
              style={{ width: '100%', letterSpacing: '4px', fontSize: '1.1rem', textAlign: 'center' }}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1, height: '38px' }}
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ height: '38px', padding: '0 16px' }}
              onClick={() => { setCodeSent(false); setMsg(''); }}
              disabled={loading}
            >
              Back
            </button>
          </div>
        </form>
      )}

      {msg && (
        <p
          role="status"
          style={{
            marginTop: '12px',
            fontSize: '0.85rem',
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--primary)'
          }}
        >
          {msg}
        </p>
      )}
    </section>
  );
}
