import { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { AuthContext } from './context/AuthContextValue';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Transactions from './pages/Transactions';
import StockReceiveScreen from './pages/StockReceiveScreen';
import AdjustmentsReport from './pages/AdjustmentsReport';
import StaffProfileScreen from './pages/StaffProfileScreen';
import Suppliers from './pages/Suppliers';
import Purchasing from './pages/Purchasing';
import ForgotPassword from './pages/ForgotPassword';
import CashFloat from './pages/CashFloat';
import AuditLog from './pages/AuditLog';
import CompatibilitySearch from './pages/CompatibilitySearch';
import ManageCompatibility from './pages/ManageCompatibility';
import ItemSwap from './pages/ItemSwap';

// Backward-compatible redirect for /transactions -> /pos?tab=history
const TransactionsRoute = () => {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  if (!params.has('tab')) {
    params.set('tab', 'history');
  }
  return <Navigate to={`/pos?${params.toString()}`} replace />;
};

// Backward-compatible redirect for /suppliers -> /purchasing?tab=suppliers
const SuppliersRedirect = () => {
  const [searchParams] = useSearchParams();
  const search = searchParams.get('search') || searchParams.get('supplier');
  const target = search ? `/purchasing?tab=suppliers&search=${encodeURIComponent(search)}` : '/purchasing?tab=suppliers';
  return <Navigate to={target} replace />;
};

const RoleBasedHome = () => {
  const { user } = useContext(AuthContext);
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  return <Navigate to={isAdmin ? "/dashboard" : "/pos"} replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster position="top-right" toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--text-main)',
            border: '1px solid var(--border)',
            borderRadius: '8px'
          }
        }}
        />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Protected Routes inside MainLayout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<RoleBasedHome />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/item-swap" element={<Navigate to="/pos?tab=history" replace />} />
              <Route path="/swap" element={<Navigate to="/pos?tab=history" replace />} />
              <Route path="/swaps" element={<Navigate to="/pos?tab=history" replace />} />
              <Route path="/transactions" element={<TransactionsRoute />} />
              <Route path="/sales-history" element={<Navigate to="/transactions" replace />} />
              <Route path="/returns" element={<Navigate to="/pos" replace />} />
              <Route path="/customers" element={<Navigate to="/pos?tab=history" replace />} />
              <Route path="/fitment" element={<CompatibilitySearch />} />
              <Route path="/compatibility-search" element={<CompatibilitySearch />} />
              <Route path="/profile" element={<StaffProfileScreen />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/approvals" element={<Navigate to="/pos?tab=history" replace />} />
              <Route path="/shifts" element={<CashFloat />} />
              <Route path="/cash-float" element={<Navigate to="/shifts" replace />} />
              {/* Admin Roles ONLY */}
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/purchasing" element={<Purchasing />} />
                <Route path="/suppliers" element={<SuppliersRedirect />} />
                <Route path="/suppliers-stock-in" element={<Navigate to="/purchasing" replace />} />
                <Route path="/stock-receive" element={<Navigate to="/purchasing" replace />} />
                <Route path="/products" element={<Navigate to="/inventory" replace />} />
                <Route path="/manage-compatibility" element={<ManageCompatibility />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/reports/adjustments" element={<AdjustmentsReport />} />
                <Route path="/users" element={<Users />} />
                <Route path="/staff" element={<Navigate to="/users" replace />} />
                <Route path="/staff-audit-log" element={<Navigate to="/users" replace />} />
                <Route path="/audit-log" element={<Navigate to="/users?tab=audit" replace />} />
                <Route path="/audit" element={<Navigate to="/users?tab=audit" replace />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
