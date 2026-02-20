import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Layout from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Database from './pages/Database';
import Reports from './pages/Reports';

function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          setIsAuthenticated(data.status === 'success');
        } else {
          setIsAuthenticated(false);
        }
      } catch (e) {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  if (isAuthenticated === null) {
    return <div className="h-screen w-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bank-600"></div></div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('bank-theme') || 'default');

  useEffect(() => {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('bank-theme', theme);
  }, [theme]);

  // Global Notification State
  const [notifications, setNotifications] = useState([]);

  const addNotification = (message, category = 'info') => {
    const id = Date.now();
    const newNotif = {
      id,
      message,
      category,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setNotifications(prev => [newNotif, ...prev].slice(0, 1));

    // Auto remove after 5 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login addNotification={addNotification} />} />

        {/* Protected Routes inside Layout */}
        <Route path="/" element={<ProtectedRoute><Layout theme={theme} setTheme={setTheme} notifications={notifications} removeNotification={removeNotification} /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard addNotification={addNotification} />} />
          <Route path="database" element={<Database addNotification={addNotification} />} />
          <Route path="reports" element={<Reports addNotification={addNotification} />} />
        </Route>
      </Routes>

      {/* Toast Notifications Overlay */}
      <div className="fixed top-6 inset-x-0 flex flex-col items-center z-[100] space-y-3 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className={`notification group pointer-events-auto flex items-center gap-4 px-5 py-4 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] bg-white border-l-4 ${n.category === 'error' ? 'border-red-500' : (n.category === 'success' ? 'border-green-500' : 'border-blue-500')} transform transition-all duration-500 ease-out translate-y-0 opacity-100 min-w-[320px] max-w-md animate-fade-in-up`}>
            <div className="flex-shrink-0">
              {n.category === 'error' ? (
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900 leading-tight">{n.category === 'error' ? 'Erreur' : 'Succès'}</p>
              <p className="text-xs text-gray-500 mt-1">{n.message}</p>
            </div>
            <button className="text-gray-300 hover:text-gray-500 transition-colors" onClick={() => removeNotification(n.id)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </Router>
  );
}
