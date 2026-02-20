import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Database, BarChart3, Settings, LogOut, Menu, User, Bell } from 'lucide-react';

export default function Layout({ theme, setTheme, notifications, removeNotification }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [showLogout, setShowLogout] = useState(false);
    const [showNotifMenu, setShowNotifMenu] = useState(false);
    const [tempTheme, setTempTheme] = useState(theme);

    const navigate = useNavigate();
    const unreadCount = notifications.length;

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
            await fetch('/logout', { method: 'POST' });
            navigate('/login');
        } catch (e) {
            console.error(e);
            navigate('/login');
        }
    };

    const navItems = [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/database', label: 'Base de Données', icon: Database },
        { to: '/reports', label: 'Rapports et Analyse', icon: BarChart3 }
    ];

    return (
        <div className="flex h-screen bg-gray-50 font-sans text-gray-900 selection:bg-bank-200 selection:text-bank-900">
            {/* Premium CSS Background Effect */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-bank-50/30 to-gray-100"></div>
                <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-bank-200/20 blur-[120px] rounded-full mix-blend-multiply"></div>
                <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-bank-300/20 blur-[120px] rounded-full mix-blend-multiply"></div>
            </div>

            <div className="relative flex flex-1 w-full z-10 overflow-hidden">
                {/* Sidebar */}
                <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} flex-shrink-0 bg-white shadow-lg border-r border-gray-100 transition-all duration-300 ease-in-out flex flex-col`}>
                    <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
                        <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'opacity-100 w-full' : 'opacity-0 w-0 hidden'}`}>
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-bank-500 to-bank-700 flex items-center justify-center text-white font-bold shadow-md">
                                B
                            </div>
                            <span className="font-serif font-bold text-lg text-gray-800 tracking-tight whitespace-nowrap">Banque</span>
                        </div>
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg text-gray-500 hover:bg-bank-50 hover:text-bank-600 transition-colors focus:outline-none focus:ring-2 focus:ring-bank-500/20">
                            <Menu size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto py-6">
                        <nav className="px-3 space-y-1">
                            {navItems.map((item) => (
                                <NavLink key={item.to} to={item.to} className={({ isActive }) => `group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${isActive ? 'bg-bank-50 text-bank-700 shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                                    {({ isActive }) => (
                                        <>
                                            <item.icon size={20} className={`flex-shrink-0 mr-3 transition-colors ${isActive ? 'text-bank-600' : 'text-gray-400 group-hover:text-gray-500'}`} />
                                            <span className={`transition-all duration-300 whitespace-nowrap ${isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 hidden'}`}>{item.label}</span>
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </nav>
                    </div>

                    <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                        <div className="space-y-1">
                            <button onClick={() => setShowSettings(true)} className="w-full group flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 rounded-xl hover:bg-white hover:text-gray-900 transition-all duration-200 hover:shadow-sm">
                                <Settings size={20} className="flex-shrink-0 mr-3 text-gray-400 group-hover:text-gray-500" />
                                <span className={`transition-all duration-300 whitespace-nowrap ${isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 hidden'}`}>Paramètres</span>
                            </button>
                            <button onClick={() => setShowLogout(true)} className="w-full group flex items-center px-3 py-2.5 text-sm font-medium text-red-600 rounded-xl hover:bg-red-50 hover:text-red-700 transition-all duration-200">
                                <LogOut size={20} className="flex-shrink-0 mr-3 text-red-400 group-hover:text-red-500" />
                                <span className={`transition-all duration-300 whitespace-nowrap ${isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 hidden'}`}>Déconnexion</span>
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 flex flex-col h-full overflow-hidden bg-transparent">
                    <header className="h-16 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md border-b border-gray-100 shadow-sm z-20 transition-all duration-300">
                        <div className="flex-1"></div>
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <button onClick={() => setShowNotifMenu(!showNotifMenu)} className="p-2 text-gray-400 hover:text-gray-500 focus:outline-none transition-colors relative">
                                    <span className="sr-only">View notifications</span>
                                    <Bell size={24} />
                                    {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse"></span>}
                                </button>
                                {showNotifMenu && (
                                    <div className="origin-top-right absolute right-0 mt-2 w-80 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] bg-white ring-1 ring-black ring-opacity-5 focus:outline-none transform transition-all duration-200 z-50 overflow-hidden">
                                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                                            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                                        </div>
                                        <div className="max-h-80 overflow-y-auto w-full flex flex-col">
                                            {notifications.length === 0 ? (
                                                <div className="px-4 py-8 text-sm text-gray-500 text-center">Aucune notification</div>
                                            ) : (
                                                notifications.map(n => (
                                                    <div key={n.id} className="px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors animate-fade-in-down">
                                                        <div className="flex items-start gap-3">
                                                            <div className="mt-1 flex-shrink-0">
                                                                <div className={`w-2 h-2 rounded-full ${n.category === 'error' ? 'bg-red-500' : 'bg-bank-500'}`}></div>
                                                            </div>
                                                            <div>
                                                                <p className="text-sm text-gray-800 leading-snug">{n.message}</p>
                                                                <p className="text-[10px] text-gray-400 mt-1">{n.time}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                                <div className="w-9 h-9 rounded-full bg-bank-100 flex items-center justify-center text-bank-600 font-medium">
                                    <User size={18} />
                                </div>
                            </div>
                        </div>
                    </header>
                    <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
                        <Outlet />
                    </div>
                </main>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75 transition-opacity">
                    <div className="bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:max-w-lg sm:w-full">
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div className="sm:flex sm:items-start">
                                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-bank-100 sm:mx-0 sm:h-10 sm:w-10">
                                    <Settings className="h-6 w-6 text-bank-600" />
                                </div>
                                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                    <h3 className="text-lg leading-6 font-medium text-gray-900">Paramètres</h3>
                                    <div className="mt-4">
                                        <p className="text-sm text-gray-500 mb-4">Personnalisez l'apparence de votre espace de travail.</p>
                                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Thème Chromatique</h4>
                                        <div className="grid grid-cols-3 gap-3">
                                            {['default', 'emerald', 'violet'].map(t => (
                                                <button key={t} onClick={() => setTempTheme(t)} className={`theme-btn flex flex-col items-center justify-center p-3 border-2 rounded-lg focus:outline-none transition-all ${tempTheme === t ? 'border-bank-500 bg-bank-50/50' : 'border-gray-200 hover:border-bank-300'}`}>
                                                    <div className={`w-8 h-8 rounded-full mb-2 shadow-sm ${t === 'default' ? 'bg-[#0ea5e9]' : t === 'emerald' ? 'bg-[#10b981]' : 'bg-[#8b5cf6]'}`}></div>
                                                    <span className="text-xs font-medium text-gray-700 capitalize">{t === 'default' ? 'Classique' : t === 'emerald' ? 'Émeraude' : 'Moderne'}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                            <button onClick={() => { setTheme(tempTheme); setShowSettings(false); }} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-bank-600 text-base font-medium text-white hover:bg-bank-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm transition-colors">Valider</button>
                            <button onClick={() => { setTempTheme(theme); setShowSettings(false); }} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors">Annuler</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Logout Modal */}
            {showLogout && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75 transition-opacity">
                    <div className="bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:max-w-lg sm:w-full">
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div className="sm:flex sm:items-start">
                                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                    <LogOut className="h-6 w-6 text-red-600" />
                                </div>
                                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                    <h3 className="text-lg leading-6 font-medium text-gray-900">Confirmer la déconnexion</h3>
                                    <div className="mt-2">
                                        <p className="text-sm text-gray-500">Êtes-vous sûr de vouloir vous déconnecter ?</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                            <button onClick={handleLogout} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 sm:ml-3 sm:w-auto sm:text-sm">Déconnexion</button>
                            <button onClick={() => setShowLogout(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Annuler</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
