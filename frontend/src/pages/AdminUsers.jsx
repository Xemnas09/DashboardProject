import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Key, Trash2, Edit2, ShieldAlert, X, Shield, Lock, User as UserIcon } from 'lucide-react';

export default function AdminUsers({ addNotification }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);

    // Modals
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Form States
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('user');
    const [newUsername, setNewUsername] = useState('');

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/admin/users', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (e) {
            console.error("Error fetching users:", e);
        } finally {
            setLoading(false);
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/status', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setCurrentUser({ username: data.user, role: data.role || 'user' });
            }
        } catch (e) {
            console.error("Error fetching status:", e);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchStatus();
    }, []);

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser),
                credentials: 'include'
            });
            if (res.ok) {
                addNotification(`Utilisateur ${newUser.username} créé`, 'success');
                setShowCreateModal(false);
                setNewUser({ username: '', password: '', role: 'user' });
                fetchUsers();
            } else {
                const err = await res.json();
                addNotification(err.detail || "Erreur de création", 'error');
            }
        } catch (e) {
            addNotification("Erreur lors de la création", 'error');
        }
    };

    const handleDeleteUser = (user) => {
        setSelectedUser(user);
        setShowDeleteModal(true);
    };

    const confirmDeleteUser = async () => {
        if (!selectedUser) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/admin/users/${selectedUser.username}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (res.ok) {
                addNotification(`Utilisateur ${selectedUser.username} supprimé`, 'success');
                setShowDeleteModal(false);
                fetchUsers();
            } else {
                const err = await res.json();
                addNotification(err.detail || "Erreur de suppression", 'error');
            }
        } catch (e) {
            addNotification("Erreur lors de la suppression", 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/admin/users/${selectedUser.username}/password`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_password: newPassword }),
                credentials: 'include'
            });
            if (res.ok) {
                addNotification(`Mot de passe de ${selectedUser.username} mis à jour`, 'success');
                setShowPasswordModal(false);
                setNewPassword('');
            } else {
                const err = await res.json();
                addNotification(err.detail || "Erreur", 'error');
            }
        } catch (e) {
            addNotification("Erreur serveur", 'error');
        }
    };

    const handleUpdateRole = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/admin/users/${selectedUser.username}/role`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_role: newRole }),
                credentials: 'include'
            });
            if (res.ok) {
                addNotification(`Rôle de ${selectedUser.username} mis à jour en ${newRole}`, 'success');
                setShowRoleModal(false);
                fetchUsers();
            } else {
                const err = await res.json();
                addNotification(err.detail || "Erreur", 'error');
            }
        } catch (e) {
            addNotification("Erreur serveur", 'error');
        }
    };

    const handleRename = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/admin/users/${selectedUser.username}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_username: newUsername }),
                credentials: 'include'
            });
            if (res.ok) {
                addNotification(`Utilisateur renommé en ${newUsername}`, 'success');
                setShowRenameModal(false);
                fetchUsers();
            } else {
                const err = await res.json();
                addNotification(err.detail || "Erreur", 'error');
            }
        } catch (e) {
            addNotification("Erreur serveur", 'error');
        }
    };

    const isSuperAdmin = currentUser?.role === 'super_admin';

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bank-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header section with Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gray-950 flex items-center justify-center text-white shadow-xl shadow-gray-200">
                        <Users size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Gestion des Utilisateurs</h1>
                        <p className="text-gray-500 text-sm font-medium">Contrôle d'accès et RBAC</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-bank-600 hover:bg-bank-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-bank-200 transition-all hover:-translate-y-0.5"
                >
                    <UserPlus size={18} />
                    Nouvel Utilisateur
                </button>
            </div>

            {/* User List Table */}
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">ID</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">Utilisateur</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">Rôle</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">Statut</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">Création</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-6 py-4 text-xs font-mono text-gray-400">#{user.id}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${user.role === 'super_admin' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                                                {user.role === 'super_admin' ? <Shield size={14} /> : <UserIcon size={14} />}
                                            </div>
                                            <span className="font-bold text-gray-900">{user.username}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${user.role === 'super_admin' ? 'bg-amber-100 text-amber-700' :
                                            user.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                            <span className="text-xs font-medium text-gray-600">{user.is_active ? 'Actif' : 'Inactif'}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-400 font-medium">
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {isSuperAdmin && (
                                                <>
                                                    <button
                                                        title="Réinitialiser le mot de passe"
                                                        onClick={() => { setSelectedUser(user); setShowPasswordModal(true); }}
                                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                                    >
                                                        <Key size={16} />
                                                    </button>
                                                    <button
                                                        title="Changer de rôle"
                                                        onClick={() => { setSelectedUser(user); setNewRole(user.role); setShowRoleModal(true); }}
                                                        className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                                                        disabled={user.role === 'super_admin'}
                                                    >
                                                        <Shield size={16} />
                                                    </button>
                                                    <button
                                                        title="Renommer"
                                                        onClick={() => { setSelectedUser(user); setNewUsername(user.username); setShowRenameModal(true); }}
                                                        className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all"
                                                        disabled={user.role === 'super_admin'}
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        title="Supprimer"
                                                        onClick={() => handleDeleteUser(user)}
                                                        className={`p-2 rounded-xl transition-all ${user.role === 'super_admin' || user.username === currentUser?.username
                                                            ? 'text-gray-200 cursor-not-allowed'
                                                            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                                            }`}
                                                        disabled={user.role === 'super_admin' || user.username === currentUser?.username}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                            {!isSuperAdmin && <span className="text-[10px] text-gray-300 italic">Lecture seule</span>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Components */}
            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
                    <form onSubmit={handleCreateUser} className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-md border border-gray-100">
                        <div className="px-6 py-4 bg-gray-950 text-white flex justify-between items-center">
                            <h3 className="font-black tracking-tight">Nouvel Utilisateur</h3>
                            <button type="button" onClick={() => setShowCreateModal(false)}><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Identifiant</label>
                                <input
                                    required
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-bank-500/20 focus:border-bank-500 outline-none transition-all font-bold text-gray-900"
                                    value={newUser.username}
                                    onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Mot de passe</label>
                                <input
                                    required type="password"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-bank-500/20 focus:border-bank-500 outline-none transition-all font-bold"
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Rôle</label>
                                <select
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-bank-500/20 focus:border-bank-500 outline-none transition-all font-bold text-gray-900 appearance-none"
                                    value={newUser.role}
                                    onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                >
                                    <option value="user">Utilisateur</option>
                                    <option value="admin">Administrateur</option>
                                </select>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 flex gap-3">
                            <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-3 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all font-bold">Annuler</button>
                            <button type="submit" className="flex-1 px-4 py-3 bg-bank-600 text-white rounded-xl shadow-lg shadow-bank-200 hover:bg-bank-700 transition-all font-black">Créer</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Reset Password Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
                    <form onSubmit={handleUpdatePassword} className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-sm">
                        <div className="px-6 py-4 bg-blue-600 text-white flex gap-3 items-center">
                            <Lock size={18} />
                            <h3 className="font-black tracking-tight">Réinitialiser : {selectedUser?.username}</h3>
                        </div>
                        <div className="p-6">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 text-center">Nouveau mot de passe</label>
                            <input
                                required type="password"
                                autoFocus
                                className="w-full text-center px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                            />
                        </div>
                        <div className="px-6 py-4 bg-gray-50 flex gap-3">
                            <button type="button" onClick={() => setShowPasswordModal(false)} className="flex-1 px-4 py-3 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all font-bold">Annuler</button>
                            <button type="submit" className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all font-black">Mettre à jour</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Role Update Modal */}
            {showRoleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
                    <form onSubmit={handleUpdateRole} className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-sm">
                        <div className="px-6 py-4 bg-amber-500 text-white flex gap-3 items-center">
                            <Shield size={18} />
                            <h3 className="font-black tracking-tight">Modifier le Rôle : {selectedUser?.username}</h3>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-2 gap-3">
                                {['user', 'admin'].map(r => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setNewRole(r)}
                                        className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${newRole === r ? 'border-amber-500 bg-amber-50 shadow-md' : 'border-gray-100 hover:border-gray-200'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${r === 'admin' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                                            {r === 'admin' ? <Shield size={16} /> : <UserIcon size={16} />}
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest">{r}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 flex gap-3">
                            <button type="button" onClick={() => setShowRoleModal(false)} className="flex-1 px-4 py-3 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all font-bold">Annuler</button>
                            <button type="submit" className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-xl shadow-lg shadow-amber-200 hover:bg-amber-700 transition-all font-black">Enregistrer</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Rename Modal */}
            {showRenameModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
                    <form onSubmit={handleRename} className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-sm font-sans">
                        <div className="px-6 py-4 bg-green-600 text-white flex gap-3 items-center">
                            <Edit2 size={18} />
                            <h3 className="font-black tracking-tight">Renommer : {selectedUser?.username}</h3>
                        </div>
                        <div className="p-6">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Nouveau nom d'utilisateur</label>
                            <input
                                required
                                autoFocus
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-bold"
                                value={newUsername}
                                onChange={e => setNewUsername(e.target.value)}
                            />
                        </div>
                        <div className="px-6 py-4 bg-gray-50 flex gap-3">
                            <button type="button" onClick={() => setShowRenameModal(false)} className="flex-1 px-4 py-3 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all font-bold">Annuler</button>
                            <button type="submit" className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl shadow-lg shadow-green-200 hover:bg-green-700 transition-all font-black">Renommer</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl w-full max-w-md border border-gray-100 animate-in zoom-in-95 duration-200">
                        <div className="p-8 text-center">
                            <div className="mx-auto w-20 h-20 rounded-[2rem] bg-red-50 flex items-center justify-center mb-6 border border-red-100 text-red-500 shadow-inner">
                                <Trash2 size={36} />
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 leading-tight">Supprimer l'utilisateur</h3>
                            <p className="mt-4 text-gray-500 font-medium px-4">
                                Êtes-vous sûr de vouloir supprimer définitivement le compte <span className="text-red-600 font-black">"{selectedUser?.username}"</span> ?
                            </p>
                            <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 text-amber-700 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                                <ShieldAlert size={14} />
                                Cette action est irréversible
                            </div>
                        </div>
                        <div className="bg-gray-50 px-8 py-6 flex gap-4 border-t border-gray-100">
                            <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 px-6 py-4 bg-white text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-100 transition-all font-black text-sm disabled:opacity-50"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                disabled={isDeleting}
                                onClick={confirmDeleteUser}
                                className="flex-1 px-6 py-4 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-2xl shadow-xl shadow-red-200 hover:shadow-red-300 hover:-translate-y-0.5 transition-all font-black text-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:translate-y-0"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        <span>Suppression...</span>
                                    </>
                                ) : (
                                    <>
                                        <Trash2 size={18} />
                                        <span>Supprimer</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
