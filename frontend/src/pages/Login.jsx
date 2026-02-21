import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, Shield, Sparkles } from 'lucide-react';

export default function Login({ addNotification }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        setTimeout(() => setMounted(true), 100);
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
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
        <div className="min-h-screen flex relative overflow-hidden">
            {/* Left Panel - Dark Branding */}
            <div className="hidden lg:flex lg:w-[45%] relative bg-gray-950 flex-col justify-between p-12 overflow-hidden">
                {/* Animated gradient orbs */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-bank-600/20 blur-[120px] animate-pulse" style={{ animationDuration: '4s' }}></div>
                    <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-bank-400/15 blur-[100px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }}></div>
                    <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] rounded-full bg-bank-500/10 blur-[80px] animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }}></div>
                </div>

                {/* Grid pattern overlay */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                    backgroundSize: '60px 60px'
                }}></div>

                <div className={`relative z-10 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-bank-400 to-bank-600 flex items-center justify-center shadow-2xl shadow-bank-500/30">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-white/90 font-black text-2xl tracking-tight">DataVision</span>
                    </div>
                    <p className="text-white/40 text-sm font-medium mt-1 tracking-wide">Analytics Intelligence Platform</p>
                </div>

                <div className={`relative z-10 space-y-8 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <div>
                        <h2 className="text-4xl font-black text-white leading-tight tracking-tight">
                            Transformez vos<br />
                            <span className="bg-gradient-to-r from-bank-400 to-bank-300 bg-clip-text text-transparent">données en décisions.</span>
                        </h2>
                        <p className="mt-6 text-white/50 text-base leading-relaxed max-w-md">
                            Explorez, analysez et visualisez vos données en temps réel grâce à des outils d'intelligence avancée.
                        </p>
                    </div>

                    <div className="flex gap-6">
                        {[
                            { label: 'Graphiques', value: '6+', sub: 'types' },
                            { label: 'Analyses', value: '∞', sub: 'illimitées' },
                            { label: 'Export', value: 'Pro', sub: 'premium' }
                        ].map((stat, i) => (
                            <div key={i} className="border border-white/10 rounded-2xl px-5 py-4 bg-white/[0.03] backdrop-blur-sm">
                                <div className="text-2xl font-black text-bank-400">{stat.value}</div>
                                <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={`relative z-10 transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <div className="flex items-center gap-3 text-white/30 text-xs">
                        <Sparkles className="w-3 h-3" />
                        <span className="font-bold uppercase tracking-[0.3em]">Secure • Encrypted • Real-time</span>
                    </div>
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-gray-50 via-white to-bank-50/30 relative">
                {/* Subtle background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[10%] right-[10%] w-[300px] h-[300px] rounded-full bg-bank-100/40 blur-[100px]"></div>
                    <div className="absolute bottom-[10%] left-[10%] w-[200px] h-[200px] rounded-full bg-bank-200/30 blur-[80px]"></div>
                </div>

                <div className={`max-w-md w-full relative z-10 transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                    {/* Mobile Logo */}
                    <div className="lg:hidden text-center mb-10">
                        <div className="mx-auto w-14 h-14 bg-gradient-to-br from-bank-500 to-bank-700 rounded-2xl flex items-center justify-center shadow-xl shadow-bank-200 mb-4">
                            <Shield className="w-7 h-7 text-white" />
                        </div>
                        <h1 className="text-2xl font-black text-gray-900">DataVision</h1>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Connexion</h2>
                        <p className="mt-2 text-gray-500 text-sm">Accédez à votre espace d'analyse sécurisé</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-100 flex items-center gap-3 animate-fade-in-up">
                            <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            </div>
                            <p className="text-sm font-semibold text-red-800">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2" htmlFor="username">
                                Identifiant
                            </label>
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300">
                                    <User className="w-4 h-4" />
                                </div>
                                <input
                                    id="username"
                                    type="text"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-gray-100 bg-white focus:bg-white focus:ring-0 focus:border-bank-500 transition-all duration-300 text-sm font-bold text-gray-800 placeholder-gray-300 shadow-sm hover:border-gray-200"
                                    placeholder="Votre identifiant"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400" htmlFor="password">
                                    Mot de passe
                                </label>
                                <a href="#" className="text-[10px] font-bold text-bank-600 hover:text-bank-700 uppercase tracking-wider transition-colors">
                                    Oublié ?
                                </a>
                            </div>
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300">
                                    <Lock className="w-4 h-4" />
                                </div>
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-gray-100 bg-white focus:bg-white focus:ring-0 focus:border-bank-500 transition-all duration-300 text-sm font-bold text-gray-800 placeholder-gray-300 shadow-sm hover:border-gray-200"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="group w-full flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white font-black text-sm uppercase tracking-[0.15em] rounded-2xl shadow-2xl shadow-gray-300 hover:shadow-gray-400 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <span className="block w-5 h-5 rounded-full border-2 border-t-white border-r-transparent animate-spin"></span>
                            ) : (
                                <>
                                    Se connecter
                                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-10 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-300">
                            Propulsé par DataVision Analytics
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
