import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Database, BarChart3, Settings, LogOut, Menu, User, Bell, Shield, ChevronRight, X, Clock } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { useRealtime } from '../features/realtime/RealtimeContext';
import { getDisplayName, customFetch, clearToken } from '../features/auth/session';

/**
 * Main application layout component.
 * Renders the responsive sidebar navigation, top header with notification bell,
 * and handles UI modals for theming and logout. Contains an `<Outlet />` for
 * rendering nested route pages.
 * 
 * @param {Object} props - Component props.
 * @param {string} props.theme - The current layout color theme.
 * @param {Function} props.setTheme - Callback to update the layout color theme.
 */
export default function Layout({ theme, setTheme }) {
    // ✅ Synchronous — currentUser available on first render via AuthContext
    const { currentUser, updateUser } = useAuth();
    const userRole = currentUser?.role || 'user';
    const username = getDisplayName(currentUser) || 'Utilisateur';

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [showLogout, setShowLogout] = useState(false);
    const [showNotifMenu, setShowNotifMenu] = useState(false);
    const [tempTheme, setTempTheme] = useState(theme);

    const { notifHistory } = useRealtime();
    const unreadCount = notifHistory.length > 0 ? 1 : 0; // Simple indicator if there are any session notifications

    const [showHistoryModal, setShowHistoryModal] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) setIsSidebarOpen(false);
            else setIsSidebarOpen(true);
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleLogout = async () => {
        try {
            await customFetch('/logout', { method: 'POST' });
        } catch (e) {
            console.error(e);
        } finally {
            // Clear all local auth state BEFORE reloading.
            // sessionStorage keeps user data across React navigate() calls;
            // without this, AuthContext re-reads it after the reload and
            // thinks the user is still logged in.
            sessionStorage.removeItem('dv_user');
            clearToken();
            // Force a full page reload to close ALL WebSocket connections
            // (HF Spaces creates 2 simultaneous WS sessions through different proxies;
            // only a real browser reload closes both).
            window.location.replace('/login');
        }
    };

    const navItems = [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Vue globale' },
        { to: '/database', label: 'Base de Données', icon: Database, description: 'Explorer & gérer' },
        { to: '/reports', label: 'Rapports', icon: BarChart3, description: 'Graphiques & TCD' }
    ];

    if (userRole === 'admin' || userRole === 'super_admin') {
        navItems.push({ to: '/admin', label: 'Admin', icon: Shield, description: 'Gérer utilisateurs' });
    }

    return (
        <div className="flex h-screen bg-gray-50 font-sans text-gray-900 selection:bg-bank-200 selection:text-bank-900">
            {/* Subtle Background */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-bank-50/20 to-gray-100"></div>
                <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-bank-200/15 blur-[150px] rounded-full"></div>
                <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-bank-300/15 blur-[150px] rounded-full"></div>
            </div>

            <div className="relative flex flex-1 w-full z-10 overflow-hidden">
                {/* Premium Dark Sidebar */}
                <aside className={`${isSidebarOpen ? 'w-[260px]' : 'w-[72px]'} flex-shrink-0 bg-gray-950 transition-all duration-300 ease-in-out flex flex-col relative overflow-hidden`}>
                    {/* Sidebar gradient glow */}
                    <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-bank-500/30 via-bank-400/10 to-transparent"></div>
                    <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-bank-900/10 to-transparent pointer-events-none"></div>

                    {/* Logo Area */}
                    <div className="h-[72px] flex items-center justify-between px-4 border-b border-white/[0.06]">
                        <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'opacity-100 w-full' : 'opacity-0 w-0 hidden'}`}>
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-bank-400 to-bank-600 flex items-center justify-center text-white shadow-lg shadow-bank-500/20">
                                <Shield className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-black text-white text-sm tracking-tight">Datavera</span>
                                <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">Analytics</span>
                            </div>
                        </div>
                        {!isSidebarOpen && (
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-bank-400 to-bank-600 flex items-center justify-center text-white shadow-lg shadow-bank-500/20 mx-auto">
                                <Shield className="w-4 h-4" />
                            </div>
                        )}
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white/80 transition-all focus:outline-none">
                            <Menu size={18} />
                        </button>
                    </div>

                    {/* Navigation */}
                    <div className="flex-1 overflow-y-auto py-6">
                        <nav className="px-3 space-y-1">
                            {isSidebarOpen && (
                                <p className="px-3 mb-3 text-[9px] font-black uppercase tracking-[0.3em] text-white/20">Navigation</p>
                            )}
                            {navItems.map((item) => (
                                <NavLink key={item.to} to={item.to} className={({ isActive }) => `group flex items-center ${isSidebarOpen ? 'px-3 py-3' : 'px-0 py-3 justify-center'} text-sm font-semibold rounded-xl transition-all duration-200 ${isActive
                                    ? 'bg-gradient-to-r from-bank-600/20 to-bank-500/10 text-bank-400 shadow-lg shadow-bank-500/5 border border-bank-500/10'
                                    : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80 border border-transparent'
                                    }`}>
                                    {({ isActive }) => (
                                        <>
                                            <div className={`${isSidebarOpen ? 'mr-3' : ''} w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-bank-500/20 text-bank-400' : 'text-white/40 group-hover:text-white/60'}`}>
                                                <item.icon size={18} />
                                            </div>
                                            {isSidebarOpen && (
                                                <div className="flex flex-col flex-1 overflow-hidden">
                                                    <span className="font-bold text-[13px] truncate">{item.label}</span>
                                                    <span className={`text-[10px] ${isActive ? 'text-bank-400/60' : 'text-white/25'} truncate`}>{item.description}</span>
                                                </div>
                                            )}
                                            {isSidebarOpen && isActive && (
                                                <ChevronRight className="w-3.5 h-3.5 text-bank-400/50 ml-auto flex-shrink-0" />
                                            )}
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </nav>
                    </div>

                    {/* Bottom Actions */}
                    <div className="p-3 border-t border-white/[0.06]">
                        <div className="space-y-1">
                            <button onClick={() => setShowSettings(true)} className={`w-full group flex items-center ${isSidebarOpen ? 'px-3 py-2.5' : 'justify-center py-2.5'} text-sm font-semibold text-white/40 rounded-xl hover:bg-white/[0.04] hover:text-white/70 transition-all duration-200`}>
                                <Settings size={18} className="flex-shrink-0" />
                                {isSidebarOpen && <span className="ml-3 font-bold text-[13px]">Paramètres</span>}
                            </button>
                            <button onClick={() => setShowLogout(true)} className={`w-full group flex items-center ${isSidebarOpen ? 'px-3 py-2.5' : 'justify-center py-2.5'} text-sm font-semibold text-red-400/60 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-all duration-200`}>
                                <LogOut size={18} className="flex-shrink-0" />
                                {isSidebarOpen && <span className="ml-3 font-bold text-[13px]">Déconnexion</span>}
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 flex flex-col h-full overflow-hidden bg-transparent">
                    {/* Premium Header */}
                    <header className="h-[64px] flex items-center justify-between px-6 bg-white/70 backdrop-blur-xl border-b border-gray-100/80 z-20">
                        <div className="flex-1"></div>
                        <div className="flex items-center gap-3">
                            {/* Notification Bell */}
                            <div className="relative">
                                <button onClick={() => setShowNotifMenu(!showNotifMenu)} className="p-2.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all relative">
                                    <Bell size={20} />
                                    {unreadCount > 0 && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse"></span>}
                                </button>
                                {showNotifMenu && (
                                    <div className="origin-top-right absolute right-0 mt-2 w-[340px] rounded-2xl shadow-2xl bg-white ring-1 ring-black/5 z-[1001] overflow-hidden border border-gray-100">
                                        <div className="px-5 py-3.5 bg-gray-950 flex justify-between items-center">
                                            <h3 className="text-sm font-black text-white uppercase tracking-wider">Notifications</h3>
                                            <button onClick={() => setShowNotifMenu(false)} className="text-white/40 hover:text-white/80 transition-colors">
                                                <X size={16} />
                                            </button>
                                        </div>
                                        <div className="max-h-[22rem] overflow-y-auto">
                                            <div className="px-4 py-2 bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">Derniers événements (3 max)</div>
                                            {notifHistory.length === 0 ? (
                                                <div className="px-5 py-8 text-sm text-gray-400 text-center font-medium">Aucun événement</div>
                                            ) : (
                                                notifHistory.slice(0, 3).map((n, idx) => (
                                                    <div key={`n-${idx}`} className="px-5 py-3.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                                                        <div className="flex items-start gap-3">
                                                            <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${n.category === 'error' ? 'bg-red-500' : n.category === 'success' ? 'bg-green-500' : n.category === 'warning' ? 'bg-yellow-500' : 'bg-bank-500'}`}></div>
                                                            <div>
                                                                <p className="text-sm text-gray-800 font-semibold leading-snug">{n.title || 'Notification'}</p>
                                                                <p className="text-[11px] text-gray-500 mt-0.5">{n.message}</p>
                                                                <p className="text-[10px] text-gray-400 mt-1 font-medium">{n.time}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        <div className="border-t border-gray-100 bg-gray-50 p-2">
                                            <button
                                                onClick={() => { setShowNotifMenu(false); setShowHistoryModal(true); }}
                                                className="w-full py-2.5 text-xs font-bold text-gray-600 hover:text-bank-600 hover:bg-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Clock size={14} />
                                                Voir tout l'historique de la session
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
                                <div className="hidden md:flex flex-col items-end mr-1">
                                    <span className="text-xs font-black text-gray-900 leading-none">{username}</span>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">{userRole}</span>
                                </div>
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-bank-500 to-bank-600 flex items-center justify-center text-white shadow-lg shadow-bank-200">
                                    <User size={16} />
                                </div>
                            </div>
                        </div>
                    </header>
                    <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
                        <Outlet />
                    </div>
                </main>
            </div>

            {/* Settings Modal - Premium */}
            {showSettings && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl overflow-hidden shadow-2xl sm:max-w-lg sm:w-full border border-gray-100">
                        <div className="px-6 py-4 bg-gray-950 text-white flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-bank-600/20 flex items-center justify-center">
                                <Settings className="h-5 w-5 text-bank-400" />
                            </div>
                            <div>
                                <h3 className="text-base font-black">Paramètres</h3>
                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Personnalisation visuelle</p>
                            </div>
                        </div>
                        <div className="p-6">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Thème Chromatique</h4>
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { id: 'default', label: 'Classique', color: '#0ea5e9', gradient: 'from-sky-400 to-blue-600' },
                                    { id: 'emerald', label: 'Émeraude', color: '#10b981', gradient: 'from-emerald-400 to-green-600' },
                                    { id: 'violet', label: 'Moderne', color: '#8b5cf6', gradient: 'from-violet-400 to-purple-600' }
                                ].map(t => (
                                    <button key={t.id} onClick={() => setTempTheme(t.id)} className={`flex flex-col items-center justify-center p-5 border-2 rounded-2xl focus:outline-none transition-all duration-200 ${tempTheme === t.id ? 'border-bank-500 bg-bank-50/50 shadow-lg shadow-bank-100 scale-[1.02]' : 'border-gray-100 hover:border-gray-200 hover:shadow-md'}`}>
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.gradient} mb-3 shadow-lg`}></div>
                                        <span className="text-xs font-black text-gray-700 uppercase tracking-wider">{t.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-gray-100">
                            <button onClick={() => { setTheme(tempTheme); setShowSettings(false); }} className="px-5 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl font-black text-sm shadow-lg hover:-translate-y-0.5 transition-all">Valider</button>
                            <button onClick={() => { setTempTheme(theme); setShowSettings(false); }} className="px-5 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-bold text-sm">Annuler</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Logout Modal - Premium */}
            {showLogout && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl overflow-hidden shadow-2xl sm:max-w-md sm:w-full border border-gray-100">
                        <div className="p-8 text-center">
                            <div className="mx-auto w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-5 border border-red-100">
                                <LogOut className="h-6 w-6 text-red-500" />
                            </div>
                            <h3 className="text-xl font-black text-gray-900">Déconnexion</h3>
                            <p className="mt-2 text-sm text-gray-500">Êtes-vous sûr de vouloir vous déconnecter ?</p>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 flex gap-3 border-t border-gray-100">
                            <button onClick={() => setShowLogout(false)} className="flex-1 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-bold text-sm">Annuler</button>
                            <button onClick={handleLogout} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl font-black text-sm shadow-lg shadow-red-200 hover:-translate-y-0.5 transition-all">Déconnexion</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modals are placed below main wrapper */}

            {showHistoryModal && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div className="flex items-center gap-3 text-gray-900">
                                <Clock size={24} className="text-bank-600" />
                                <h2 className="text-xl font-bold">Historique de la session</h2>
                            </div>
                            <button
                                onClick={() => setShowHistoryModal(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {notifHistory.length === 0 ? (
                                <div className="py-20 text-center text-gray-400 flex flex-col items-center">
                                    <Bell size={48} className="mb-4 opacity-20" />
                                    <p className="text-lg font-medium">Aucun événement enregistré</p>
                                    <p className="text-sm mt-1">Les notifications reçues apparaîtront ici.</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {notifHistory.map((n, idx) => (
                                        <div key={idx} className="flex gap-4 p-4 hover:bg-gray-50 rounded-2xl transition-colors items-start">
                                            <div className="w-16 flex-shrink-0 text-right pt-0.5">
                                                <span className="text-xs font-mono font-medium text-gray-400">{n.time}</span>
                                            </div>
                                            <div className="mt-1.5 flex-shrink-0">
                                                <div className={`w-2.5 h-2.5 rounded-full ring-4 ring-white shadow-sm ${n.category === 'error' ? 'bg-red-500' : n.category === 'success' ? 'bg-green-500' : n.category === 'warning' ? 'bg-yellow-500' : 'bg-bank-500'}`}></div>
                                            </div>
                                            <div className="flex-1 pb-4 border-b border-gray-100 last:border-0 relative top-[-4px]">
                                                <p className="text-[15px] font-bold text-gray-900">{n.title || 'Notification'}</p>
                                                <p className="text-[14px] text-gray-600 mt-1 leading-relaxed">{n.message}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                            <button
                                onClick={() => setShowHistoryModal(false)}
                                className="w-full sm:w-auto px-6 py-2.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors"
                            >
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
