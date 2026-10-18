import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { KeyRound, ArrowLeft } from 'lucide-react';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', code: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) {
      return setError('Passwords do not match.');
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-with-code', {
        username: form.username,
        code: form.code,
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
          backgroundColor: 'rgba(18, 20, 18, 0.90)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.65), 0 0 30px rgba(16, 185, 129, 0.15)'
        }}>
          <img
            src="/jlin-logo.png"
            alt="JLIN Logo"
            style={{
              width: '84px',
              height: '84px',
              objectFit: 'contain',
              borderRadius: '50%',
              border: '3px solid rgba(16, 185, 129, 0.5)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.25)',
              backgroundColor: '#000000',
              margin: '0 auto 14px auto',
              display: 'block'
            }}
          />
          <h2 style={{ marginBottom: '6px', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1.4rem', fontWeight: 700 }}>
            Reset Admin Password
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '22px', fontSize: '0.85rem' }}>
            Enter your admin username and an unused recovery code
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <input
              name="username"
              placeholder="Admin username"
              className="input-premium"
              value={form.username}
              onChange={update}
              required
            />
            <input
              name="code"
              placeholder="Recovery code (XXXX-XXXX)"
              className="input-premium"
              value={form.code}
              onChange={update}
              required
            />
            <input
              name="newPassword"
              type="password"
              placeholder="New password (8+ characters)"
              className="input-premium"
              value={form.newPassword}
              onChange={update}
              required
            />
            <input
              name="confirm"
              type="password"
              placeholder="Confirm new password"
              className="input-premium"
              value={form.confirm}
              onChange={update}
              required
            />

            {error && (
              <p
                role="alert"
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  textAlign: 'left',
                  margin: 0
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{ marginTop: '4px', width: '100%', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              disabled={busy}
            >
              <KeyRound size={18} /> {busy ? 'Resetting password...' : 'Reset password'}
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
                className="hover:underline"
              >
                <ArrowLeft size={14} /> Back to login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
