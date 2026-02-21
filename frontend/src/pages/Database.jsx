import React, { useState, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);
import { Trash2, AlertCircle, Settings2, FileType2, Database as DatabaseIcon, Maximize2, Minimize2, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Database({ addNotification }) {
    const [dataPreview, setDataPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Type Management State
    const [showTypeModal, setShowTypeModal] = useState(false);
    const [columnsInfo, setColumnsInfo] = useState([]);
    const [isSavingTypes, setIsSavingTypes] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // Human-friendly mapping for Polars/Technical types (Excel-like)
    const TYPE_LABELS = {
        'Int64': 'Nombre Entier',
        'Int32': 'Nombre Entier',
        'Float64': 'Nombre Décimal (Réel)',
        'Float32': 'Nombre Décimal (Réel)',
        'String': 'Texte / Catégorie',
        'Utf8': 'Texte / Catégorie',
        'Date': 'Date',
        'Datetime': 'Date et Heure',
        'Boolean': 'Vrai/Faux (Logique)',
        'Bool': 'Vrai/Faux (Logique)',
        'Null': 'Inconnu'
    };

    const getFriendlyType = (dtype) => TYPE_LABELS[dtype] || dtype;

    useEffect(() => {
        fetchDataPreview();
    }, []);

    const [isFullData, setIsFullData] = useState(false);

    const fetchDataPreview = async (forceFull = null) => {
        setLoading(true);
        const useFull = forceFull !== null ? forceFull : isFullData;
        try {
            const res = await fetch(`/api/database?full_data=${useFull}`);
            if (res.ok) {
                const data = await res.json();
                setDataPreview(data.data_preview);
                if (forceFull !== null) setIsFullData(forceFull);
            }
        } catch (e) {
            console.error(e);
            addNotification("Impossible de charger les données.", "error");
        } finally {
            setLoading(false);
        }
    };

    const toggleFullData = () => {
        fetchDataPreview(!isFullData);
    };

    const fetchColumnsInfo = async () => {
        try {
            const res = await fetch('/api/reports/columns');
            if (res.ok) {
                const data = await res.json();
                setColumnsInfo(data.columns_info || []);
                setShowTypeModal(true);
            }
        } catch (e) {
            console.error(e);
            addNotification("Impossible de charger les infos des colonnes.", "error");
        }
    };

    const handleTypeChange = (colName, newType) => {
        setColumnsInfo(columnsInfo.map(col =>
            col.name === colName ? { ...col, target_type: newType } : col
        ));
    };

    const saveColumnTypes = async () => {
        setIsSavingTypes(true);
        const modifications = columnsInfo
            .filter(c => c.target_type && c.target_type !== c.dtype)
            .map(c => ({ column: c.name, type: c.target_type }));

        if (modifications.length === 0) {
            setShowTypeModal(false);
            setIsSavingTypes(false);
            return;
        }

        try {
            const res = await fetch('/api/database/recast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modifications })
            });
            const result = await res.json();

            if (res.ok && result.status === 'success') {
                const hasWarnings = result.warnings && result.warnings.length > 0;
                addNotification(result.message, hasWarnings ? 'warning' : 'success');

                // Display each specific warning
                if (hasWarnings) {
                    result.warnings.forEach(w => addNotification(w, 'warning'));
                }

                setShowTypeModal(false);
                fetchDataPreview(); // Refresh grid
            } else {
                addNotification(result.message || "Erreur de conversion", "error");
            }
        } catch (e) {
            addNotification("Impossible de contacter le serveur.", "error");
        } finally {
            setIsSavingTypes(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const res = await fetch('/clear_data', {
                method: 'POST'
            });
            if (res.ok) {
                setDataPreview(null);
                addNotification("Données supprimées avec succès.", "success");
            }
        } catch (e) {
            addNotification("Erreur lors de la suppression.", "error");
        } finally {
            setIsDeleting(false);
            setShowDeleteModal(false);
        }
    };

    const colDefs = useMemo(() => {
        if (!dataPreview || !dataPreview.columns || !dataPreview.columns_info) return [];

        return dataPreview.columns.map(col => {
            const info = dataPreview.columns_info.find(i => i.name === col.field);
            const baseDef = {
                field: col.field,
                headerName: col.title,
                sortable: true,
                filter: true,
                resizable: true,
                flex: 1,
                minWidth: 150,
            };

            // Enhanced Type Detection
            const isNumeric = info?.is_numeric;
            const isCategorical = info?.dtype === 'String' || info?.dtype === 'Utf8';

            if (isNumeric) {
                return {
                    ...baseDef,
                    cellClass: 'font-mono text-bank-700 font-medium',
                    headerClass: 'header-numeric'
                };
            }

            if (isCategorical) {
                // Logic-based Rendering: Only badge if it looks like a label
                // (e.g., short string, distinct values < 20% of rows or < 15 unique values)
                const samples = dataPreview.data.map(r => String(r[col.field] || ''));
                const distinctCount = new Set(samples).size;
                const avgLength = samples.reduce((acc, s) => acc + s.length, 0) / samples.length;

                const isLabelLike = avgLength < 15 && (distinctCount < 20 || distinctCount < dataPreview.data.length * 0.2);

                if (isLabelLike) {
                    return {
                        ...baseDef,
                        cellRenderer: (params) => {
                            if (!params.value) return null;
                            const str = String(params.value);
                            // Simple hash for consistent professional colors
                            let hash = 0;
                            for (let i = 0; i < str.length; i++) {
                                hash = str.charCodeAt(i) + ((hash << 5) - hash);
                            }
                            const colorClasses = ['badge-indigo', 'badge-emerald', 'badge-slate', 'badge-rose', 'badge-amber', 'badge-violet'];
                            const colorClass = colorClasses[Math.abs(hash) % colorClasses.length];

                            return (
                                <div className="flex items-center h-full">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter border ${colorClass} shadow-sm transform transition-transform hover:scale-110`}>
                                        {str}
                                    </span>
                                </div>
                            );
                        }
                    };
                }
            }

            return baseDef;
        });
    }, [dataPreview]);

    return (
        <div className="h-full flex flex-col pt-2 pb-6 animate-fade-in-up relative overflow-hidden">
            {/* Ambient Background Blobs */}
            <div className="bg-blob bg-bank-200" style={{ top: '-10%', right: '-5%' }}></div>
            <div className="bg-blob bg-violet-200" style={{ bottom: '-10%', left: '-5%', animationDelay: '-5s' }}></div>

            {loading ? (
                <div className="flex-1 premium-glass rounded-3xl p-8 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-bank-200 border-t-bank-600 rounded-full animate-spin"></div>
                        <p className="text-bank-700 font-bold animate-pulse">Chargement de votre univers...</p>
                    </div>
                </div>
            ) : dataPreview && dataPreview.data ? (
                <div className="flex-1 premium-glass rounded-3xl overflow-hidden flex flex-col">
                    <div className="px-8 py-6 border-b border-white/20 bg-white/30 flex justify-between items-center flex-shrink-0">
                        <div className="flex items-center gap-6">
                            <div className="p-4 bg-gradient-to-br from-bank-500 to-bank-700 rounded-2xl text-white shadow-lg shadow-bank-200/50 transform transition-transform hover:scale-110">
                                <FileType2 className="w-6 h-6" />
                            </div>
                            <div className="flex flex-col">
                                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Explorateur de Données</h2>
                                <div className="flex items-center gap-2">
                                    <span className="flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                        {dataPreview.total_rows.toLocaleString()} entrées actives
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={fetchColumnsInfo}
                                className="group inline-flex items-center px-6 py-3 text-sm font-black rounded-2xl text-white bg-gradient-to-r from-bank-600 to-bank-500 hover:from-bank-500 hover:to-bank-400 transition-all hover:shadow-xl hover:shadow-bank-200 hover:-translate-y-0.5 active:translate-y-0"
                            >
                                <Settings2 className="mr-2 h-4 w-4 transition-transform group-hover:rotate-90" />
                                Configurer les types
                            </button>
                            <div className="flex bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className="flex items-center px-6 py-3 text-sm font-black text-bank-700 hover:bg-bank-50 transition-all border-r border-gray-50"
                                >
                                    <Maximize2 className="mr-2 h-4 w-4" />
                                    Plein Écran
                                </button>
                                <button
                                    onClick={toggleFullData}
                                    className={`flex items-center px-4 py-3 transition-all ${isFullData ? 'bg-amber-50 text-amber-600' : 'text-gray-400 hover:bg-gray-50'
                                        }`}
                                    title={isFullData ? "Analyse complète (Toutes les lignes)" : "Aperçu limité (2000 lignes)"}
                                >
                                    <DatabaseIcon className="h-4 w-4" />
                                    <span className="ml-2 text-[10px] font-black uppercase tracking-tighter">
                                        {isFullData ? "100%" : "2K"}
                                    </span>
                                </button>
                            </div>
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="inline-flex items-center px-6 py-3 text-sm font-black rounded-2xl text-red-600 bg-white hover:bg-red-50 transition-all border border-red-100/50 hover:shadow-lg hover:-translate-y-0.5"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Réinitialiser
                            </button>
                        </div>
                    </div>

                    {/* Expanded Modal Overlay */}
                    {isExpanded && (
                        <div className="fixed inset-0 z-[100] bg-white p-6 flex flex-col animate-in fade-in zoom-in duration-200">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-bank-600 flex items-center justify-center text-white shadow-lg">
                                        <DatabaseIcon className="w-6 h-6" />
                                    </div>
                                    <h2 className="text-xl font-black text-gray-900">Vue Étendue - Explorateur</h2>
                                </div>
                                <button
                                    onClick={() => setIsExpanded(false)}
                                    className="flex items-center px-4 py-2 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg"
                                >
                                    <Minimize2 className="mr-2 h-4 w-4" />
                                    Quitter le Plein Écran
                                </button>
                            </div>
                            <div className="flex-1 min-h-0 ag-theme-quartz rounded-2xl border border-gray-100 shadow-2xl overflow-hidden">
                                <AgGridReact
                                    rowData={dataPreview.data}
                                    columnDefs={colDefs}
                                    pagination={true}
                                    paginationPageSize={25}
                                    animateRows={true}
                                    onGridReady={(params) => params.api.sizeColumnsToFit()}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex-1 min-h-0 bg-transparent p-6">
                        <div className="h-full ag-theme-quartz overflow-hidden">
                            <AgGridReact
                                rowData={dataPreview.data}
                                columnDefs={colDefs}
                                pagination={true}
                                paginationPageSize={15}
                                animateRows={true}
                                onGridReady={(params) => params.api.sizeColumnsToFit()}
                                defaultColDef={{
                                    cellStyle: { display: 'flex', alignItems: 'center' }
                                }}
                            />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center h-full flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">Aucune donnée chargée</h3>
                    <p className="mt-2 text-gray-500">Importez un fichier depuis le tableau de bord.</p>
                    <Link to="/dashboard" className="mt-6 inline-flex items-center px-6 py-3 bg-bank-600 text-white font-semibold rounded-xl hover:bg-bank-700 transition-all hover:scale-105 shadow-sm">
                        Aller au Tableau de Bord
                    </Link>
                </div>
            )}

            {/* Delete Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl overflow-hidden shadow-xl transform transition-all sm:max-w-lg sm:w-full">
                        <div className="p-6">
                            <div className="flex items-center space-x-4">
                                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                                    <Trash2 className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Supprimer les données ?</h3>
                                    <p className="text-sm text-gray-500">Cette action est irréversible.</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-all flex items-center justify-center w-28 disabled:opacity-70"
                            >
                                {isDeleting ? <span className="block w-4 h-4 rounded-full border-2 border-t-white border-r-transparent animate-spin"></span> : 'Supprimer'}
                            </button>
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Type Management Modal */}
            {showTypeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl overflow-hidden shadow-xl transform transition-all sm:max-w-2xl w-full max-h-[85vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-3 shrink-0">
                            <div className="flex-shrink-0 w-10 h-10 bg-bank-100 rounded-lg flex items-center justify-center text-bank-600">
                                <FileType2 className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Variables & Statistique</h3>
                                <p className="text-sm text-gray-500">Ajustez le typage des colonnes pour définir vos axes d'analyse (Numérique, Texte).</p>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="space-y-3">
                                {columnsInfo.map(col => (
                                    <div key={col.name} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white shadow-sm hover:border-bank-300 hover:shadow-md transition-all group">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold text-gray-900 group-hover:text-bank-600 transition-colors uppercase tracking-wider text-xs">{col.name}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-medium text-gray-400">TYPE ACTUEL:</span>
                                                <code className={`px-2 py-0.5 rounded text-[10px] font-bold ${col.dtype.includes('Int') || col.dtype.includes('Float')
                                                    ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                                    : 'bg-amber-50 text-amber-600 border border-amber-100'
                                                    }`}>
                                                    {getFriendlyType(col.dtype)}
                                                </code>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-medium text-gray-400 text-right mr-1">CONVERTIR EN :</span>
                                            <select
                                                value={col.target_type || col.dtype}
                                                onChange={(e) => handleTypeChange(col.name, e.target.value)}
                                                className="px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg focus:ring-2 focus:ring-bank-500 w-48 bg-gray-50 hover:bg-white transition-colors cursor-pointer outline-none"
                                            >
                                                <option value={col.dtype}>✓ {getFriendlyType(col.dtype)}</option>
                                                <option value="String">Texte / Catégorie</option>
                                                <option value="Float64">Nombre Décimal</option>
                                                <option value="Int64">Nombre Entier</option>
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3 shrink-0 border-t border-gray-200">
                            <button
                                onClick={saveColumnTypes}
                                disabled={isSavingTypes}
                                className="px-4 py-2 bg-bank-600 text-white rounded-lg font-semibold hover:bg-bank-700 transition-all flex items-center justify-center min-w-[120px]"
                            >
                                {isSavingTypes ? <span className="block w-4 h-4 rounded-full border-2 border-t-white border-r-transparent animate-spin"></span> : 'Sauvegarder'}
                            </button>
                            <button
                                onClick={() => setShowTypeModal(false)}
                                disabled={isSavingTypes}
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
