import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
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

    const handleLogin = async (e) => {
        e.preventDefault();
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
            height: '100vh',
            width: '100vw',
            alignItems: 'center',
            justifyContent: 'flex-end',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <video 
                autoPlay 
                loop 
                muted
                playsInline
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    zIndex: 0
                }}
            >
                <source src="/Landscape .mp4" type="video/mp4" />
            </video>
            {/* Dark gradient overlay so the form stands out and brands are visible on left */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to right, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)',
                pointerEvents: 'none'
            }}></div>

            {/* Right Side: Login Panel */}
            <div style={{
                zIndex: 1,
                width: '100%',
                maxWidth: '440px',
                padding: '48px',
                textAlign: 'center',
                marginRight: '80px',
            }}>
                <div className="glass-panel" style={{ padding: '40px' }}>
                    <h2 style={{ marginBottom: '8px', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        JLIN Motorparts
                    </h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Inventory & Sales Tracking</p>

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
