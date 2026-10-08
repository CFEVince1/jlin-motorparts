import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

import { z } from 'zod';

const loginSchema = z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required')
});

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    useEffect(() => {
        // Ensure real cloud database mode is active
        localStorage.removeItem('jlin_use_mock');
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        localStorage.removeItem('jlin_use_mock');
        try {
            // Validate data
            loginSchema.parse({ username, password });

            await login(username, password);
            toast.success('Successfully logged in');
            navigate('/dashboard');
        } catch (err) {
            if (err.errors && Array.isArray(err.errors)) {
                err.errors.forEach(e => toast.error(e.message));
                return;
            }
            toast.error(err.response?.data?.message || 'Login failed');
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
            {/* Background Graphic: Responsive, Centered & Proportional without distortion */}
            <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'url(/custom_login_bg.png)',
                backgroundPosition: 'center center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                zIndex: 0
            }}></div>

            {/* Subtle radial dark overlay for high contrast and text readability */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.8) 100%)',
                pointerEvents: 'none',
                zIndex: 1
            }}></div>

            {/* Center Login Panel */}
            <div style={{
                zIndex: 2,
                width: '100%',
                maxWidth: '420px',
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
                            width: '96px',
                            height: '96px',
                            objectFit: 'contain',
                            borderRadius: '50%',
                            border: '3px solid rgba(16, 185, 129, 0.5)',
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.25)',
                            backgroundColor: '#000000',
                            margin: '0 auto 16px auto',
                            display: 'block'
                        }}
                    />
                    <h2 style={{ marginBottom: '6px', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1.5rem', fontWeight: 700 }}>
                        JLIN Motorparts
                    </h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>Inventory & Sales Tracking</p>

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <input
                            type="text"
                            placeholder="Username"
                            className="input-premium"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                className="input-premium"
                                style={{ width: '100%', paddingRight: '40px' }}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button 
                                type="button" 
                                onClick={() => setShowPassword(!showPassword)}
                                style={{ 
                                    position: 'absolute', 
                                    right: '12px', 
                                    background: 'none', 
                                    border: 'none', 
                                    color: 'var(--text-muted)', 
                                    cursor: 'pointer',
                                    display: 'flex',
                                    padding: '0'
                                }}
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>

                        <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
                            <LogIn size={20} /> Login
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;
