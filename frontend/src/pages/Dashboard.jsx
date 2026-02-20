import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, CheckCircle2, TrendingUp, Users, Database as DatabaseIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard({ addNotification }) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [pendingSheets, setPendingSheets] = useState([]);
    const [selectedSheet, setSelectedSheet] = useState('');
    const fileInputRef = useRef(null);

    const [username, setUsername] = useState('Utilisateur');

    useEffect(() => {
        // In a real app we might fetch user info here from /api/status.
        setUsername('Admin'); // Placeholder
    }, []);

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
            handleFiles(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFiles(e.target.files[0]);
        }
    };

    const handleFiles = async (file) => {
        setIsUploading(true);
        setUploadSuccess(false);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const res = await fetch('/upload', {
                method: 'POST',
                body: formData,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            const result = await res.json();

            if (res.ok && result.status === 'success') {
                setUploadSuccess(true);
                addNotification(result.message, 'success');
                if (result.notification) {
                    addNotification(result.notification.message, 'info');
                }
            } else if (res.ok && result.status === 'requires_sheet') {
                setPendingSheets(result.sheets);
                if (result.sheets.length > 0) setSelectedSheet(result.sheets[0]);
                addNotification(result.message, 'info');
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

    const handleSheetSelection = async () => {
        setIsUploading(true);
        try {
            const res = await fetch('/api/select-sheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sheet_name: selectedSheet })
            });
            const result = await res.json();

            if (res.ok && result.status === 'success') {
                setPendingSheets([]);
                setUploadSuccess(true);
                addNotification(result.message, 'success');
            } else {
                throw new Error(result.message || 'Erreur lors du chargement de la feuille');
            }
        } catch (err) {
            console.error(err);
            addNotification(err.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in-up">
            {/* Welcome Section */}
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 p-6 flex justify-between items-center animate-fade-in-up delay-100">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Bienvenue, {username}</h2>
                    <p className="text-gray-500 mt-1">Voici un résumé de l'activité financière d'aujourd'hui.</p>
                </div>
                <div className="hidden md:block">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-bank-100 text-bank-800">
                        Dernière màj: <span className="ml-1">Aujourd'hui</span>
                    </span>
                </div>
            </div>

            {/* KPI Cards (Static Demo) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow animate-fade-in-up delay-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Transactions</p>
                            <h3 className="text-3xl font-bold text-gray-900 mt-2">2,450</h3>
                            <div className="mt-2 flex items-center text-sm">
                                <span className="text-green-600 font-medium flex items-center">
                                    <TrendingUp className="w-4 h-4 mr-1" /> +12.5%
                                </span>
                                <span className="text-gray-400 ml-2">vs hier</span>
                            </div>
                        </div>
                        <div className="p-3 bg-bank-50 rounded-lg text-bank-600">
                            <DatabaseIcon className="w-6 h-6" />
                        </div>
                    </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow animate-fade-in-up delay-300">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Volume Total</p>
                            <h3 className="text-3xl font-bold text-gray-900 mt-2">45,230 €</h3>
                            <div className="mt-2 flex items-center text-sm">
                                <span className="text-green-600 font-medium flex items-center">
                                    <TrendingUp className="w-4 h-4 mr-1" /> +5.2%
                                </span>
                                <span className="text-gray-400 ml-2">vs hier</span>
                            </div>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg text-green-600">
                            <DatabaseIcon className="w-6 h-6" />
                        </div>
                    </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow animate-fade-in-up delay-400">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Nouveaux Clients</p>
                            <h3 className="text-3xl font-bold text-gray-900 mt-2">12</h3>
                            <div className="mt-2 flex items-center text-sm">
                                <span className="text-gray-500 font-medium">Stable</span>
                            </div>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
                            <Users className="w-6 h-6" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Upload Section */}
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in-up delay-500">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-800">Importation de Données</h2>
                    <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded">ZIP, CSV, XLSX</span>
                </div>

                {!uploadSuccess ? (
                    <div className="p-8">
                        <form
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current.click()}
                            className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300 cursor-pointer group ${dragActive ? 'border-bank-500 bg-bank-50' : 'border-gray-300 hover:border-bank-500 hover:bg-bank-50'}`}
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
                                    <div className="group-hover:scale-110 transform transition-transform duration-300 mb-4">
                                        <div className="w-16 h-16 bg-bank-100 text-bank-600 rounded-full flex items-center justify-center mx-auto">
                                            <UploadCloud className="w-8 h-8" />
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900 group-hover:text-bank-700">Glissez-déposez ou cliquez pour upload</h3>
                                    <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">Analyse automatique par Polars.</p>
                                </div>
                            ) : (
                                <div>
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bank-600 mx-auto mb-4"></div>
                                    <p className="text-bank-600 font-medium">Traitement en cours...</p>
                                </div>
                            )}
                        </form>
                    </div>
                ) : (
                    <div className="bg-white/90 backdrop-blur-sm rounded-xl p-8 text-center transition-all duration-500 animate-fade-in-up">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Importation Réussie !</h3>
                        <p className="text-gray-500 mb-6">Vos données ont été traitées et sont prêtes à être analysées.</p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link to="/database" className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-bank-600 hover:bg-bank-700 transition-colors w-full sm:w-auto justify-center">
                                Voir la Base de Données
                            </Link>
                            <Link to="/reports" className="inline-flex items-center px-6 py-3 border-2 border-bank-600 text-base font-medium rounded-md shadow-sm text-bank-600 bg-white hover:bg-bank-50 transition-all duration-200 w-full sm:w-auto justify-center group">
                                Générer des Rapports
                            </Link>
                            <button onClick={() => setUploadSuccess(false)} className="inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-all duration-200 w-full sm:w-auto justify-center group">
                                Importer un autre fichier
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Sheet Selection Modal */}
            {pendingSheets.length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl overflow-hidden shadow-xl transform transition-all sm:max-w-lg sm:w-full">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">Plusieurs feuilles détectées</h3>
                            <p className="text-sm text-gray-500 mb-4">Veuillez sélectionner la feuille Excel que vous souhaitez analyser.</p>
                            <select
                                value={selectedSheet}
                                onChange={(e) => setSelectedSheet(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bank-500"
                            >
                                {pendingSheets.map(sheet => (
                                    <option key={sheet} value={sheet}>{sheet}</option>
                                ))}
                            </select>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
                            <button
                                onClick={handleSheetSelection}
                                disabled={isUploading}
                                className="px-4 py-2 bg-bank-600 text-white rounded-lg font-semibold hover:bg-bank-700 transition-all flex items-center justify-center min-w-[120px]"
                            >
                                {isUploading ? <span className="block w-4 h-4 rounded-full border-2 border-t-white border-r-transparent animate-spin"></span> : 'Confirmer'}
                            </button>
                            <button
                                onClick={() => setPendingSheets([])}
                                disabled={isUploading}
                                className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
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
