import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import { AuthPage } from '@/pages/AuthPage';
import { OfficerApp } from '@/pages/officer/OfficerApp';
import { AdminApp } from '@/pages/admin/AdminApp';
import { Spinner } from '@/components/ui';

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={40} />
      </div>
    );
  }
  if (!user) return <AuthPage />;
  if (user.role === 'admin') return <AdminApp />;
  return <OfficerApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
