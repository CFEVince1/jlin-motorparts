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
import Returns from './pages/Returns';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Transactions from './pages/Transactions';
import StockReceiveScreen from './pages/StockReceiveScreen';
import AdjustmentsReport from './pages/AdjustmentsReport';
import StaffProfileScreen from './pages/StaffProfileScreen';
import Suppliers from './pages/Suppliers';
import ForgotPassword from './pages/ForgotPassword';

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
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/returns" element={<Returns />} />
              <Route path="/fitment" element={<Navigate to="/profile?tab=fitment" replace />} />
              <Route path="/compatibility-search" element={<Navigate to="/profile?tab=fitment" replace />} />
              <Route path="/profile" element={<StaffProfileScreen />} />
              <Route path="/inventory" element={<Inventory />} />
              {/* Admin Roles */}
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/products" element={<Products />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/stock-receive" element={<StockReceiveScreen />} />
                <Route path="/manage-compatibility" element={<Navigate to="/profile?tab=compatibility" replace />} />
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
