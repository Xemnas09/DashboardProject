import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login({ addNotification }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // In development, the proxy will forward this to Flask
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (res.ok && data.status === 'success') {
                addNotification("Connexion réussie", "success");
                navigate('/dashboard');
            } else {
                setError(data.message || 'Identifiants incorrects');
                addNotification(data.message || "Erreur de connexion", "error");
            }
        } catch (err) {
            console.error(err);
            setError("Impossible de se connecter au serveur.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gray-50">
            {/* Premium CSS Background Effect */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-bank-50/50 to-bank-100/30"></div>
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-bank-300/20 blur-[100px] rounded-full mix-blend-multiply animate-slow-zoom"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-bank-400/20 blur-[100px] rounded-full mix-blend-multiply animate-slow-zoom" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="max-w-md w-full relative z-10 animate-fade-in-up">
                <div className="text-center mb-8">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-br from-bank-500 to-bank-700 rounded-2xl flex items-center justify-center shadow-lg mb-4 transform hover:scale-105 transition-transform duration-300">
                        <span className="text-white font-serif text-3xl font-bold">B</span>
                    </div>
                    <h1 className="text-3xl font-serif font-bold text-gray-900 tracking-tight">Espace Client</h1>
                    <p className="mt-2 text-sm text-gray-500">Connectez-vous à votre portail sécurisé</p>
                </div>

                <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-8 transform hover:shadow-2xl transition-all duration-300">
                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 flex items-start animate-fade-in-up">
                            <div className="flex-shrink-0 mt-0.5"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div></div>
                            <p className="ml-3 text-sm text-red-800">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm justify-between flex font-medium text-gray-700 mb-1" htmlFor="username">
                                <span>Identifiant</span>
                            </label>
                            <input
                                id="username"
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="block w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/50 focus:bg-white focus:ring-2 focus:ring-bank-500 focus:border-bank-500 transition-all duration-200 sm:text-sm"
                                placeholder="Ex : admin"
                            />
                        </div>

                        <div>
                            <label className="block text-sm justify-between flex font-medium text-gray-700 mb-1" htmlFor="password">
                                <span>Mot de passe</span>
                                <a href="#" className="font-medium text-bank-600 hover:text-bank-500 text-xs">Oublié ?</a>
                            </label>
                            <input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/50 focus:bg-white focus:ring-2 focus:ring-bank-500 focus:border-bank-500 transition-all duration-200 sm:text-sm"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md bg-bank-600 text-sm font-medium text-white hover:bg-bank-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bank-500 transform transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed">
                            {loading ? 'Connexion...' : 'Se connecter'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
