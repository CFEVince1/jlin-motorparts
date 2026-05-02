import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { UserPlus, Shield, Trash2, Edit2 } from 'lucide-react';
import Spinner from '../components/Spinner';

import { z } from 'zod';

const userSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(5, 'Password must be at least 5 characters'),
    confirmPassword: z.string(),
    role: z.enum(['admin', 'staff'], { errorMap: () => ({ message: "Invalid role selected" }) })
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

const userUpdateSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(5, 'Password must be at least 5 characters').or(z.literal('')),
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
});

const Users = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [formData, setFormData] = useState({ username: '', password: '', confirmPassword: '', role: 'staff' });
    const [editingId, setEditingId] = useState(null);

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
            if (err.errors && Array.isArray(err.errors)) {
                err.errors.forEach(e => toast.error(e.message));
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
    };

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>System Users</h1>

            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={20} /> {editingId ? 'Edit User' : 'Add New User'}
                </h3>

                <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Username"
                        className="input-premium"
                        required
                        value={formData.username}
                        onChange={e => setFormData({ ...formData, username: e.target.value })}
                    />

                    <input
                        type="password"
                        placeholder={editingId ? "New Password (Optional)" : "Password"}
                        className="input-premium"
                        required={!editingId}
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                    />

                    <input
                        type="password"
                        placeholder={editingId ? "Confirm New Password" : "Confirm Password"}
                        className="input-premium"
                        required={!editingId || formData.password.length > 0}
                        value={formData.confirmPassword}
                        onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                    />

                    <select
                        className="input-premium"
                        style={{ background: 'var(--surface)', cursor: 'not-allowed', opacity: 0.7 }}
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
                            <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setFormData({ username: '', password: '', confirmPassword: '', role: 'staff' }) }}>
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
