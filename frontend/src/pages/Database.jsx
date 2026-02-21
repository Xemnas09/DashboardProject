import React, { useState, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);
import { Trash2, AlertCircle, Settings2, FileType2 } from 'lucide-react';
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

    const fetchDataPreview = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/database');
            if (res.ok) {
                const data = await res.json();
                setDataPreview(data.data_preview);
            }
        } catch (e) {
            console.error(e);
            addNotification("Impossible de charger les données.", "error");
        } finally {
            setLoading(false);
        }
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
        if (!dataPreview || !dataPreview.columns) return [];
        return dataPreview.columns.map(col => ({
            field: col.field,
            headerName: col.title,
            sortable: true,
            filter: true,
            resizable: true,
            flex: 1,
            minWidth: 120
        }));
    }, [dataPreview]);

    return (
        <div className="h-full flex flex-col pt-2 pb-6 animate-fade-in-up">
            {loading ? (
                <div className="flex-1 bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 p-8">
                    <div className="animate-pulse space-y-4">
                        <div className="h-10 bg-gray-200 rounded w-full"></div>
                        <div className="h-12 bg-gray-200 rounded w-full"></div>
                        <div className="h-12 bg-gray-200 rounded w-full"></div>
                        <div className="h-12 bg-gray-200 rounded w-full"></div>
                    </div>
                </div>
            ) : dataPreview && dataPreview.data ? (
                <div className="flex-1 bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    <div className="px-6 py-5 border-b border-gray-100 bg-white/50 flex justify-between items-center flex-shrink-0">
                        <div className="flex items-center gap-5">
                            <div className="p-3 bg-bank-50 rounded-xl text-bank-600 shadow-sm border border-bank-100">
                                <FileType2 className="w-6 h-6" />
                            </div>
                            <div className="flex flex-col">
                                <h2 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">Base de Données</h2>
                                <span className="text-sm font-medium text-gray-400 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                    {dataPreview.total_rows.toLocaleString()} lignes importées
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={fetchColumnsInfo}
                                className="inline-flex items-center px-5 py-2.5 text-sm font-bold rounded-xl text-bank-700 bg-bank-100/80 hover:bg-bank-200 transition-all hover:scale-105 active:scale-95 shadow-sm border border-bank-200/50"
                            >
                                <Settings2 className="mr-2 h-4 w-4" />
                                Configurer les types
                            </button>
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="inline-flex items-center px-5 py-2.5 text-sm font-bold rounded-xl text-red-700 bg-red-100/50 hover:bg-red-200 transition-all hover:scale-105 active:scale-95 shadow-sm border border-red-200/50"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Nettoyer la base
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 bg-white p-4">
                        <div className="h-full ag-theme-quartz shadow-inner rounded-xl overflow-hidden border border-gray-100">
                            <AgGridReact
                                rowData={dataPreview.data}
                                columnDefs={colDefs}
                                pagination={true}
                                paginationPageSize={15}
                                animateRows={true}
                                onGridReady={(params) => params.api.sizeColumnsToFit()}
                                defaultColDef={{
                                    minWidth: 100,
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
