import { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import Spinner from './Spinner';

const ProtectedRoute = ({ allowedRoles }) => {
    const { user, loading } = useContext(AuthContext);

    if (loading) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner text="Verifying authentication..." />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    const userRole = (user?.role || '').toLowerCase() === 'admin' ? 'admin' : 'cashier';
    if (allowedRoles && !allowedRoles.map(r => r.toLowerCase()).includes(userRole)) {
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
