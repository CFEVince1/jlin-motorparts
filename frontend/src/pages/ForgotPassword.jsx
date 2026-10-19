import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { KeyRound, ArrowLeft, Mail, ShieldAlert, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [form, setForm] = useState({ otp: '', newPassword: '', confirm: '' });
  const [showOtp, setShowOtp] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/forgot-password', { username });
      setMessage(data.message);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) {
      return setError('Passwords do not match.');
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', {
        username,
        otp: form.otp.trim(),
        newPassword: form.newPassword,
      });
      navigate('/login', { state: { message: 'Password reset. Log in with your new password.' } });
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      width: '100vw',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: '#0a0d0a'
    }}>
      {/* Background Graphic */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'url(/custom_login_bg.png)',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        zIndex: 0
      }}></div>

      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.8) 100%)',
        pointerEvents: 'none',
        zIndex: 1
      }}></div>

      <div style={{
        zIndex: 2,
        width: '100%',
        maxWidth: '440px',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div className="glass-panel" style={{
          padding: '36px 32px',
          backgroundColor: 'rgba(18, 20, 18, 0.92)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.65), 0 0 30px rgba(16, 185, 129, 0.15)'
        }}>
          <img
            src="/jlin-logo.png"
            alt="JLIN Logo"
            style={{
              width: '80px',
              height: '80px',
              objectFit: 'contain',
              borderRadius: '50%',
              border: '3px solid rgba(16, 185, 129, 0.5)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.25)',
              backgroundColor: '#000000',
              margin: '0 auto 16px auto',
              display: 'block'
            }}
          />

          {step === 1 ? (
            <form onSubmit={sendCode} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h2 style={{ marginBottom: '6px', color: 'var(--primary)', fontSize: '1.4rem', fontWeight: 700 }}>
                  Forgot Password
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                  Enter your admin username to receive a 6-digit recovery code.
                </p>
              </div>

              <input
                placeholder="Admin username"
                className="input-premium"
                style={{ width: '100%' }}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError('');
                }}
                required
                disabled={busy}
              />

              {error && (
                <div role="alert" style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  textAlign: 'left'
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', height: '42px', marginTop: '4px' }}
                disabled={busy}
              >
                <Mail size={18} /> {busy ? 'Sending code...' : 'Send code to my email'}
              </button>

              <div style={{ marginTop: '8px' }}>
                <Link
                  to="/login"
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <ArrowLeft size={16} /> Back to login
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={reset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h2 style={{ marginBottom: '6px', color: 'var(--primary)', fontSize: '1.4rem', fontWeight: 700 }}>
                  Enter Verification Code
                </h2>
                {message && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                    {message}
                  </p>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', textAlign: 'left', marginBottom: '4px' }}>
                  6-Digit Verification Code
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showOtp ? 'text' : 'password'}
                    placeholder={showOtp ? '000000' : '••••••'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    className="input-premium"
                    style={{ width: '100%', letterSpacing: showOtp ? '4px' : '3px', textAlign: 'center', fontSize: '1.2rem', paddingRight: '40px' }}
                    value={form.otp}
                    onChange={(e) => {
                      setForm({ ...form, otp: e.target.value.replace(/\D/g, '') });
                      if (error) setError('');
                    }}
                    required
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOtp(p => !p)}
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
                    title={showOtp ? 'Hide code' : 'Show code'}
                  >
                    {showOtp ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', textAlign: 'left', marginBottom: '4px' }}>
                  New Password (8+ characters)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="New password (8+ characters)"
                    className="input-premium"
                    style={{ width: '100%', paddingRight: '40px' }}
                    value={form.newPassword}
                    onChange={(e) => {
                      setForm({ ...form, newPassword: e.target.value });
                      if (error) setError('');
                    }}
                    required
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(p => !p)}
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
                    title={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', textAlign: 'left', marginBottom: '4px' }}>
                  Confirm New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    className="input-premium"
                    style={{ width: '100%', paddingRight: '40px' }}
                    value={form.confirm}
                    onChange={(e) => {
                      setForm({ ...form, confirm: e.target.value });
                      if (error) setError('');
                    }}
                    required
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(p => !p)}
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
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  textAlign: 'left'
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', height: '42px', marginTop: '4px' }}
                disabled={busy}
              >
                <KeyRound size={18} /> {busy ? 'Resetting password...' : 'Reset password'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => { setStep(1); setError(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Resend code
                </button>
                <Link
                  to="/login"
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <ArrowLeft size={14} /> Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
