import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
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
import ManageCompatibility from './pages/ManageCompatibility';
import StockReceiveScreen from './pages/StockReceiveScreen';
import CompatibilitySearch from './pages/CompatibilitySearch';
import AdjustmentsReport from './pages/AdjustmentsReport';
import StaffProfileScreen from './pages/StaffProfileScreen';
import Suppliers from './pages/Suppliers';

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

          {/* Protected Routes inside MainLayout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/compatibility-search" element={<CompatibilitySearch />} />
              <Route path="/profile" element={<StaffProfileScreen />} />
              <Route path="/inventory" element={<Inventory />} />
              {/* Admin Roles */}
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/products" element={<Products />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/stock-receive" element={<StockReceiveScreen />} />
                <Route path="/manage-compatibility" element={<ManageCompatibility />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/reports/adjustments" element={<AdjustmentsReport />} />
                <Route path="/users" element={<Users />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
