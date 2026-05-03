import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { UserPlus, Shield, Trash2, Edit2, Eye, EyeOff, Check, X } from 'lucide-react';
import Spinner from '../components/Spinner';

import { z } from 'zod';

const passwordValidation = z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/, 'Password must contain uppercase, lowercase, numbers, and special characters')
    .refine((val) => !/password|12345678|qwerty/i.test(val), {
        message: 'Password contains common patterns that are easy to guess'
    });

const userSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: passwordValidation,
    confirmPassword: z.string(),
    role: z.enum(['admin', 'staff'], { errorMap: () => ({ message: "Invalid role selected" }) })
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
}).refine((data) => data.password.toLowerCase() !== data.username.toLowerCase(), {
    message: "Password cannot be the same as the username",
    path: ["password"],
});

const userUpdateSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: passwordValidation.or(z.literal('')),
    confirmPassword: z.string().or(z.literal('')),
    role: z.enum(['admin', 'staff'], { errorMap: () => ({ message: "Invalid role selected" }) })
}).refine((data) => {
    if (data.password && data.password !== data.confirmPassword) {
        return false;
    }
    return true;
}, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
}).refine((data) => {
    if (data.password && data.password.toLowerCase() === data.username.toLowerCase()) {
        return false;
    }
    return true;
}, {
    message: "Password cannot be the same as the username",
    path: ["password"],
});

const Users = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [formData, setFormData] = useState({ username: '', password: '', confirmPassword: '', role: 'staff' });
    const [editingId, setEditingId] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [formErrors, setFormErrors] = useState({});

    const fetchUsers = async () => {
        try {
            const res = await api.get('/users');
            setUsers(res.data);
        } catch (err) {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setFormErrors({});
            // Validate data
            if (editingId) {
                userUpdateSchema.parse(formData);
                const payload = { ...formData };
                if (!payload.password) delete payload.password; // Don't update password if empty
                await api.put(`/users/${editingId}`, payload);
                toast.success('User updated');
            } else {
                userSchema.parse(formData);
                await api.post('/users', formData);
                toast.success('User created');
            }
            setFormData({ username: '', password: '', confirmPassword: '', role: 'staff' });
            setEditingId(null);
            fetchUsers();
        } catch (err) {
            if (err instanceof z.ZodError) {
                const errors = {};
                err.errors.forEach(e => {
                    if (e.path.length > 0) {
                        errors[e.path[0]] = e.message;
                    }
                });
                setFormErrors(errors);
                return;
            }
            toast.error(err.response?.data?.message || 'Action failed');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        try {
            await api.delete(`/users/${id}`);
            toast.success('User deleted');
            fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete user');
        }
    };

    const handleEdit = (user) => {
        setFormData({ username: user.username, password: '', confirmPassword: '', role: user.role });
        setEditingId(user.id);
        setFormErrors({});
    };

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>System Users</h1>

            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', position: 'relative', zIndex: 20 }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={20} /> {editingId ? 'Edit User' : 'Add New User'}
                </h3>

                <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                            type="text"
                            placeholder="Username"
                            className="input-premium"
                            required
                            value={formData.username}
                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                        />
                        {formErrors.username && <span style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{formErrors.username}</span>}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder={editingId ? "New Password (Optional)" : "Password"}
                                className="input-premium"
                                style={{ width: '100%', paddingRight: '40px' }}
                                required={!editingId}
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
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
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {formErrors.password && <span style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{formErrors.password}</span>}
                        {formData.password.length > 0 && (
                            <div style={{ 
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                width: '100%',
                                zIndex: 10,
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '12px',
                                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '6px', 
                                marginTop: '4px', 
                                fontSize: '0.75rem' 
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: formData.password.length >= 8 ? 'var(--success)' : 'var(--text-muted)' }}>
                                    {formData.password.length >= 8 ? <Check size={12} /> : <X size={12} />} 8+ characters
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/.test(formData.password) ? 'var(--success)' : 'var(--text-muted)' }}>
                                    {/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/.test(formData.password) ? <Check size={12} /> : <X size={12} />} Uppercase, lowercase, number & special char
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder={editingId ? "Confirm New Password" : "Confirm Password"}
                                className="input-premium"
                                style={{ width: '100%', paddingRight: '40px' }}
                                required={!editingId || formData.password.length > 0}
                                value={formData.confirmPassword}
                                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
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
                        {formErrors.confirmPassword && <span style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{formErrors.confirmPassword}</span>}
                    </div>

                    <select
                        className="input-premium"
                        style={{ background: 'var(--surface)' }}
                        value={formData.role}
                        onChange={e => setFormData({ ...formData, role: e.target.value })}
                        disabled
                    >
                        <option value="staff">Staff / Cashier</option>
                    </select>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="submit" className="btn-primary" style={{ padding: '12px 24px' }}>
                            <UserPlus size={20} /> {editingId ? 'Update' : 'Add'}
                        </button>
                        {editingId && (
                            <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setFormData({ username: '', password: '', confirmPassword: '', role: 'staff' }); setFormErrors({}); }}>
                                Cancel
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
                {loading ? <Spinner text="Loading users..." /> : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Username</th>
                                    <th>Role</th>
                                    <th>Created At</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td>#{u.id}</td>
                                        <td style={{ fontWeight: '500' }}>{u.username}</td>
                                        <td>
                                            <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.8rem',
                                                background: u.role === 'admin' ? 'rgba(50, 215, 75, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                                                color: u.role === 'admin' ? 'var(--success)' : 'var(--text-main)',
                                                textTransform: 'uppercase',
                                                fontWeight: 'bold'
                                            }}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td>{new Date(u.created_at).toLocaleDateString()}</td>
                                        <td style={{ display: 'flex', gap: '8px' }}>
                                            {(u.username === 'admin' || u.username === 'allen') ? (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>Protected</span>
                                            ) : (
                                                <>
                                                    <button onClick={() => handleEdit(u)} title="Edit User" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}><Edit2 size={18} /></button>
                                                    <button onClick={() => handleDelete(u.id)} title="Delete User" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Users;
