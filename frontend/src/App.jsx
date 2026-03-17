import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RealtimeProvider, useRealtime } from './contexts/RealtimeContext';
import WSInitializer from './components/WSInitializer';
import Layout from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Database from './pages/Database';
import Reports from './pages/Reports';
import AdminUsers from './pages/AdminUsers';

import { customFetch } from './utils/session';


function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionError, setConnectionError] = useState(false);

  const { currentUser, updateUser } = useAuth();

  useEffect(() => {
    let timeoutId;

    const checkAuth = async (attempt = 1) => {
      try {
        const res = await customFetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success') {
            if (!currentUser || currentUser.username !== data.user || currentUser.role !== data.role) {
              updateUser({ username: data.user, role: data.role });
            }
          }
          setIsAuthenticated(data.status === 'success');
        } else {
          setIsAuthenticated(false);
        }
      } catch (e) {
        if (attempt < 3) {
          setRetryCount(attempt);
          timeoutId = setTimeout(() => checkAuth(attempt + 1), 1000);
        } else {
          setConnectionError(true);
        }
      }
    };
    checkAuth();

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (connectionError) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <svg className="w-12 h-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Impossible de joindre le serveur</h2>
        <p className="text-gray-500 font-medium">Vérifiez que le backend est démarré.</p>
      </div>
    );
  }

  if (isAuthenticated === null) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bank-600 mb-4"></div>
        {retryCount > 0 && <p className="text-sm font-bold text-gray-400 animate-pulse tracking-wide">Connexion au serveur...</p>}
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function AppRoot() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <App />
      </RealtimeProvider>
    </AuthProvider>
  );
}

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('bank-theme') || 'default');
  const { notifications, addNotification, removeNotification } = useRealtime();

  useEffect(() => {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('bank-theme', theme);
  }, [theme]);

  return (
    <Router>
      {/* WSInitializer MUST be inside Router (uses useNavigate)
              AND inside AuthProvider + RealtimeProvider */}
      <WSInitializer />

      <Routes>
        <Route path="/login" element={<Login addNotification={addNotification} />} />

        {/* Protected Routes inside Layout */}
        <Route path="/" element={<ProtectedRoute><Layout theme={theme} setTheme={setTheme} notifications={notifications} removeNotification={removeNotification} /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard addNotification={addNotification} />} />
          <Route path="database" element={<Database addNotification={addNotification} />} />
          <Route path="reports" element={<Reports addNotification={addNotification} />} />
          <Route path="admin" element={<AdminUsers addNotification={addNotification} />} />
        </Route>
      </Routes>

      {/* Toast Notifications Overlay */}
      <div className="fixed top-6 inset-x-0 flex flex-col items-center z-[100] space-y-3 pointer-events-none">
        {notifications.map(n => {
          const cat = n.category || 'info';
          let borderColor, bgColor, textColor, icon;

          if (cat === 'error') {
            borderColor = 'border-red-500';
            bgColor = 'bg-red-50';
            textColor = 'text-red-500';
            icon = <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
          } else if (cat === 'warning') {
            borderColor = 'border-yellow-500';
            bgColor = 'bg-yellow-50';
            textColor = 'text-yellow-500';
            icon = <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
          } else if (cat === 'success') {
            borderColor = 'border-green-500';
            bgColor = 'bg-green-50';
            textColor = 'text-green-500';
            icon = <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>;
          } else {
            // info
            borderColor = 'border-blue-500';
            bgColor = 'bg-blue-50';
            textColor = 'text-blue-500';
            icon = <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
          }

          return (
            <div key={n.id} className={`notification group pointer-events-auto flex items-center gap-4 px-5 py-4 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] bg-white border-l-4 ${borderColor} transform transition-all duration-500 ease-out translate-y-0 opacity-100 min-w-[320px] max-w-md animate-fade-in-up`}>
              <div className="flex-shrink-0">
                <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center ${textColor}`}>
                  {icon}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900 leading-tight">
                  {n.title || (n.category === 'error' ? 'Erreur' : n.category === 'success' ? 'Succès' : n.category === 'warning' ? 'Avertissement' : 'Information')}
                </p>
                <p className="text-xs text-gray-500 mt-1">{n.message}</p>
              </div>
              <button className="text-gray-300 hover:text-gray-500 transition-colors" onClick={() => removeNotification(n.id)}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )
        })}
      </div>
    </Router>
  );
}
