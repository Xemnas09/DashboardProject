import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, CheckCircle2, TrendingUp, Users, Database as DatabaseIcon, BarChart3, FileSpreadsheet, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getDisplayName, customFetch } from '../features/auth/session';
import OnlineUsers from '../features/realtime/OnlineUsers';

export default function Dashboard({ addNotification }) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [pendingSheets, setPendingSheets] = useState([]);
    const [selectedSheet, setSelectedSheet] = useState(null);
    const [allPreviews, setAllPreviews] = useState({});
    const [sheetPreview, setSheetPreview] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const fileInputRef = useRef(null);

    // ✅ Synchronous read — available before first render, zero flash
    const { currentUser } = useAuth();
    const username = getDisplayName(currentUser) || 'Utilisateur';

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileProcess(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFileProcess(e.target.files[0]);
        }
    };

    const handleFileProcess = async (file) => {
        if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
            addNotification('Format non supporté. Utilisez CSV ou Excel.', 'error');
            return;
        }

        setIsUploading(true);
        setUploadSuccess(false);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const res = await customFetch('/api/upload', {
                method: 'POST',
                body: formData,
                signal: controller.signal,
                credentials: 'include',
            });

            clearTimeout(timeoutId);
            const result = await res.json();

            if (res.ok) {
                if (result.status === 'requires_sheet') {
                    setPendingSheets(result.sheets);
                    setAllPreviews(result.all_previews || {});
                    if (result.sheets.length > 0) setSelectedSheet(result.sheets[0]);
                    addNotification(`${result.sheets.length} feuilles détectées`, 'info');
                } else if (result.status === 'success') {
                    setUploadSuccess(true);
                    addNotification('Fichier importé avec succès', 'success');
                }
            } else {
                throw new Error(result.message || 'Erreur inconnue');
            }
        } catch (err) {
            console.error(err);
            addNotification(err.name === 'AbortError' ? "Temps d'attente dépassé." : err.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    useEffect(() => {
        if (selectedSheet && allPreviews[selectedSheet]) {
            setSheetPreview(allPreviews[selectedSheet]);
        }
    }, [selectedSheet, allPreviews]);

    const handleSheetSelection = async () => {
        setIsUploading(true);
        try {
            const res = await customFetch('/api/upload/select-sheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sheet_name: selectedSheet }),
                credentials: 'include',
            });
            const result = await res.json();

            if (res.ok && result.status === 'success') {
                setPendingSheets([]);
                setSheetPreview(null);
                setUploadSuccess(true);
                addNotification('Feuille importée avec succès', 'success');
            } else {
                throw new Error(result.message || 'Erreur lors de l\'importation de la feuille');
            }
        } catch (err) {
            console.error(err);
            addNotification(err.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const kpiCards = [
        { label: 'Transactions', value: '2,450', change: '+12.5%', positive: true, icon: DatabaseIcon, color: 'bank' },
        { label: 'Volume Total', value: '45,230 €', change: '+5.2%', positive: true, icon: TrendingUp, color: 'emerald' },
        { label: 'Nouveaux Clients', value: '12', change: 'Stable', positive: null, icon: Users, color: 'violet' }
    ];

    const colorMap = {
        bank: { bg: 'bg-bank-50', text: 'text-bank-600', border: 'border-bank-100', gradient: 'from-bank-500 to-bank-600' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', gradient: 'from-emerald-500 to-emerald-600' },
        violet: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100', gradient: 'from-violet-500 to-violet-600' }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in-up">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                {/* Welcome Section - Takes 3 columns */}
                <div className="xl:col-span-3 relative bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 rounded-2xl shadow-2xl p-8 overflow-hidden h-full">
                    {/* Background effects */}
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-bank-500/10 blur-[100px] rounded-full"></div>
                        <div className="absolute bottom-0 left-[20%] w-[200px] h-[200px] bg-bank-400/5 blur-[80px] rounded-full"></div>
                        <div className="absolute inset-0 opacity-[0.03]" style={{
                            backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                            backgroundSize: '40px 40px'
                        }}></div>
                    </div>

                    <div className="relative z-10 flex flex-col h-full justify-center">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-bank-400 mb-2">Tableau de Bord</p>
                            <h2 className="text-3xl font-black text-white tracking-tight">Bienvenue, {username}</h2>
                            <p className="text-white/40 mt-2 text-sm font-medium">Voici un résumé de l'activité d'aujourd'hui.</p>
                        </div>
                    </div>
                </div>

                {/* Online Users Section - Takes 1 column */}
                <div className="xl:col-span-1">
                    <OnlineUsers />
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {kpiCards.map((kpi, i) => {
                    const colors = colorMap[kpi.color];
                    return (
                        <div key={i} className="group bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                            {/* Accent bar */}
                            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colors.gradient} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{kpi.label}</p>
                                    <h3 className="text-3xl font-black text-gray-900 mt-2 tracking-tight">{kpi.value}</h3>
                                    <div className="mt-3 flex items-center text-xs">
                                        {kpi.positive !== null ? (
                                            <span className={`font-black flex items-center ${kpi.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                                                <TrendingUp className="w-3 h-3 mr-1" /> {kpi.change}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 font-bold">{kpi.change}</span>
                                        )}
                                        <span className="text-gray-300 ml-2 font-medium">vs hier</span>
                                    </div>
                                </div>
                                <div className={`w-12 h-12 rounded-2xl ${colors.bg} ${colors.text} flex items-center justify-center border ${colors.border} group-hover:scale-110 transition-transform`}>
                                    <kpi.icon className="w-5 h-5" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Upload Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-bank-50 flex items-center justify-center text-bank-600">
                            <UploadCloud className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">Importation de Données</h2>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {['CSV', 'XLSX', 'XLS'].map(fmt => (
                            <span key={fmt} className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-black text-gray-400 uppercase tracking-wider">{fmt}</span>
                        ))}
                    </div>
                </div>

                {!uploadSuccess ? (
                    <div className="p-8">
                        <form
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current.click()}
                            className={`relative border-2 border-dashed rounded-2xl p-16 text-center transition-all duration-300 cursor-pointer group ${dragActive ? 'border-bank-500 bg-bank-50/50' : 'border-gray-200 hover:border-bank-400 hover:bg-bank-50/30'}`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                onChange={handleChange}
                                accept=".csv,.xlsx,.xls"
                            />

                            {!isUploading ? (
                                <div>
                                    <div className="group-hover:scale-110 transform transition-transform duration-300 mb-6">
                                        <div className="w-20 h-20 bg-gradient-to-br from-bank-100 to-bank-50 text-bank-600 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-bank-100 border border-bank-200/50">
                                            <UploadCloud className="w-9 h-9" />
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 group-hover:text-bank-700 transition-colors">Glissez-déposez ou cliquez pour importer</h3>
                                    <p className="mt-2 text-sm text-gray-400 font-medium max-w-sm mx-auto">Analyse automatique par le moteur Polars haute performance</p>
                                </div>
                            ) : (
                                <div>
                                    <div className="w-14 h-14 rounded-full border-[3px] border-bank-200 border-t-bank-600 animate-spin mx-auto mb-5"></div>
                                    <p className="text-bank-600 font-black text-sm uppercase tracking-wider">Traitement en cours...</p>
                                </div>
                            )}
                        </form>
                    </div>
                ) : (
                    <div className="p-10 text-center animate-fade-in-up">
                        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-emerald-100 shadow-lg shadow-emerald-100">
                            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 mb-2">Importation Réussie !</h3>
                        <p className="text-gray-400 mb-8 text-sm font-medium">Vos données sont prêtes à être analysées.</p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                            <Link to="/database" className="group inline-flex items-center px-6 py-3.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white font-black text-sm rounded-xl shadow-xl hover:-translate-y-0.5 transition-all">
                                <DatabaseIcon className="w-4 h-4 mr-2" />
                                Base de Données
                                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                            </Link>
                            <Link to="/reports" className="group inline-flex items-center px-6 py-3.5 border-2 border-bank-500 text-bank-600 font-black text-sm rounded-xl hover:bg-bank-50 transition-all">
                                <BarChart3 className="w-4 h-4 mr-2" />
                                Rapports
                            </Link>
                            <button onClick={() => setUploadSuccess(false)} className="inline-flex items-center px-6 py-3.5 border border-gray-200 text-gray-600 font-bold text-sm rounded-xl hover:bg-gray-50 transition-all">
                                Importer un autre fichier
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Sheet Selection Modal */}
            {pendingSheets.length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-2xl overflow-hidden shadow-2xl sm:max-w-xl sm:w-full border border-gray-100 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 bg-gray-950 text-white flex items-center gap-3 flex-shrink-0">
                            <div className="w-9 h-9 rounded-xl bg-bank-600/20 flex items-center justify-center">
                                <FileSpreadsheet className="h-5 w-5 text-bank-400" />
                            </div>
                            <div>
                                <h3 className="text-base font-black">Feuilles Multiples</h3>
                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Sélectionnez la feuille à analyser</p>
                            </div>
                        </div>
                        
                        <div className="p-6 flex-1 overflow-hidden flex flex-col gap-6">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Choix de la feuille</p>
                                <select
                                    value={selectedSheet}
                                    onChange={(e) => setSelectedSheet(e.target.value)}
                                    className="w-full px-4 py-3.5 border-2 border-gray-100 rounded-xl focus:ring-0 focus:border-bank-500 font-bold text-gray-800 bg-gray-50 transition-all cursor-pointer outline-none"
                                >
                                    {pendingSheets.map(sheet => (
                                        <option key={sheet} value={sheet}>{sheet}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex-1 flex flex-col min-h-0">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Aperçu rapide (10 premières lignes)</p>
                                <div className="flex-1 border border-gray-100 rounded-xl overflow-auto bg-gray-50/50 custom-scrollbar-mini">
                                    {isPreviewLoading ? (
                                        <div className="h-full flex flex-col items-center justify-center p-8 gap-3">
                                            <div className="w-8 h-8 rounded-full border-2 border-bank-200 border-t-bank-600 animate-spin"></div>
                                            <p className="text-[9px] font-black text-bank-900 uppercase tracking-widest">Chargement...</p>
                                        </div>
                                    ) : sheetPreview ? (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-white border-b border-gray-100">
                                                    {sheetPreview.columns.map(col => (
                                                        <th key={col.field} className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wider whitespace-nowrap bg-white sticky top-0">
                                                            {col.title}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sheetPreview.data.map((row, i) => (
                                                    <tr key={i} className="border-b border-gray-50/50 last:border-0 hover:bg-white/50">
                                                        {sheetPreview.columns.map(col => (
                                                            <td key={col.field} className="px-3 py-1.5 text-[10px] text-gray-600 font-medium whitespace-nowrap truncate max-w-[150px]">
                                                                {row[col.field]}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="h-full flex items-center justify-center p-8 text-gray-400 italic text-[10px]">
                                            Sélectionnez une feuille pour voir un aperçu
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-gray-100 flex-shrink-0">
                            <button
                                onClick={handleSheetSelection}
                                disabled={isUploading || isPreviewLoading}
                                className="px-5 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl font-black text-sm shadow-lg hover:-translate-y-0.5 transition-all min-w-[120px] flex items-center justify-center disabled:opacity-50 disabled:translate-y-0"
                            >
                                {isUploading ? <span className="block w-4 h-4 rounded-full border-2 border-t-white border-r-transparent animate-spin"></span> : 'Confirmer l\'import'}
                            </button>
                            <button
                                onClick={async () => {
                                    setPendingSheets([]);
                                    setSheetPreview(null);
                                    setUploadedFile(null); // Return to upload area
                                    try {
                                        await customFetch('/api/clear_data', { method: 'POST' });
                                    } catch (err) {
                                        console.error("Cleanup failed", err);
                                    }
                                }}
                                disabled={isUploading}
                                className="px-5 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-bold text-sm disabled:opacity-50"
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
