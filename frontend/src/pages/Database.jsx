import React, { useState, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);
import { Trash2, AlertCircle, Settings2, FileType2, Database as DatabaseIcon, Info, Calculator, Plus, Sparkles, Check, ChevronDown, Download, Layers, AlertTriangle, Settings, Search, ArrowUpDown, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import CardView from '../components/CardView';

export default function Database({ addNotification }) {
    const [dataPreview, setDataPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Responsive State
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth <= 1024);
    const [visibleCount, setVisibleCount] = useState(20);

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            setWindowWidth(width);
            setIsMobile(width < 768);
            setIsTablet(width >= 768 && width <= 1024);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Type Management State
    const [showTypeModal, setShowTypeModal] = useState(false);
    const [columnsInfo, setColumnsInfo] = useState([]);
    const [isSavingTypes, setIsSavingTypes] = useState(false);

    // Calculated Fields State
    const [showFormulaModal, setShowFormulaModal] = useState(false);
    const [formulaName, setFormulaName] = useState('');
    const [formulaExpr, setFormulaExpr] = useState('');
    const [formulaError, setFormulaError] = useState('');
    const [formulaLoading, setFormulaLoading] = useState(false);

    // Anomaly Detection State
    const [showAnomalyPanel, setShowAnomalyPanel] = useState(false);
    const [selectedAnomalyCols, setSelectedAnomalyCols] = useState([]);
    const [anomalyMethod, setAnomalyMethod] = useState('zscore');
    const [anomalyThreshold, setAnomalyThreshold] = useState(3.0);
    const [anomalyResult, setAnomalyResult] = useState(null);
    const [anomalyLoading, setAnomalyLoading] = useState(false);
    const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);
    const [showAllColumnsTablet, setShowAllColumnsTablet] = useState(false);
    const [pageSize, setPageSize] = useState(15);
    const gridRef = React.useRef(null);

    // Mobile specific state
    const [mobileSearchQuery, setMobileSearchQuery] = useState('');
    const [mobileSortCol, setMobileSortCol] = useState('');
    const [showMobileActions, setShowMobileActions] = useState(false);

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
            const res = await fetch(`/api/database?full_data=true`, { credentials: 'include' });
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
            const res = await fetch('/api/reports/columns', { credentials: 'include' });
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
                body: JSON.stringify({ modifications }),
                credentials: 'include',
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
                method: 'POST',
                credentials: 'include',
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

        return dataPreview.columns.map((col, index) => {
            const info = dataPreview.columns_info.find(i => i.name === col.field);
            const baseDef = {
                field: col.field,
                headerName: col.title,
                sortable: true,
                filter: true,
                resizable: true,
                flex: isMobile || isTablet ? 0 : 1,
                minWidth: 150,
                hide: isTablet && !showAllColumnsTablet && index >= 4,
                pinned: index === 0 && (isTablet || !isMobile) ? 'left' : null
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
    }, [dataPreview, anomalyResult, showAnomaliesOnly]);

    const rowClassRules = useMemo(() => ({
        'anomaly-row': (params) => {
            if (!anomalyResult || !anomalyResult.anomalies) return false;
            return anomalyResult.anomalies.some(a => a.row_index === params.node.rowIndex);
        },
        'faded-row': (params) => {
            if (!anomalyResult || showAnomaliesOnly) return false;
            return !anomalyResult.anomalies.some(a => a.row_index === params.node.rowIndex);
        }
    }), [anomalyResult, showAnomaliesOnly]);

    const handleAnalyzeAnomalies = async () => {
        if (selectedAnomalyCols.length === 0) {
            addNotification("Sélectionnez au moins une colonne.", "warning");
            return;
        }
        setAnomalyLoading(true);
        try {
            const res = await fetch('/api/anomalies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    columns: selectedAnomalyCols,
                    method: anomalyMethod,
                    threshold: parseFloat(anomalyThreshold),
                    language: 'fr'
                }),
                credentials: 'include',
            });
            const data = await res.json();
            if (res.ok) {
                setAnomalyResult(data);
                addNotification(`${data.anomaly_count} anomalies détectées.`, data.anomaly_rate > 5 ? "error" : "success");
            } else {
                addNotification(data.message || "Erreur de détection", "error");
            }
        } catch (e) {
            addNotification("Impossible de contacter le serveur.", "error");
        } finally {
            setAnomalyLoading(false);
        }
    };

    const handleExportAnomalies = () => {
        if (!anomalyResult || !anomalyResult.anomalies) return;
        const rows = anomalyResult.anomalies.map(a => a.values);
        if (rows.length === 0) return;

        const headers = Object.keys(rows[0]);
        const csvContent = [
            headers.join(','),
            ...rows.map(row => headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `anomalies_${anomalyMethod}_${new Date().getTime()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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
                    {/* Compact Header (Change 2) */}
                    <div className="px-4 py-2 border-b border-white/20 bg-white/30 flex justify-between items-center h-[60px] shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-br from-bank-500 to-bank-700 rounded-xl text-white shadow-lg shadow-bank-200/50">
                                <FileType2 className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base md:text-lg font-black text-gray-900 tracking-tight whitespace-nowrap">Explorateur</h2>
                                <span className="px-2 py-0.5 rounded-full bg-bank-100 text-bank-700 text-[10px] md:text-xs font-black">
                                    {dataPreview.total_rows.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Compact Toolbar (Change 1) */}
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            <button
                                onClick={fetchColumnsInfo}
                                title="Configurer les types"
                                className="inline-flex items-center px-3 py-1.5 text-xs font-black rounded-lg text-white bg-gradient-to-r from-bank-600 to-bank-500 hover:from-bank-500 hover:to-bank-400 transition-all"
                            >
                                <Settings className="h-3.5 w-3.5 md:mr-1.5" />
                                <span className="hidden md:inline">Types</span>
                            </button>
                            <button
                                onClick={() => { setShowFormulaModal(true); setFormulaError(''); setFormulaName(''); setFormulaExpr(''); }}
                                title="Champ Calculé"
                                className="inline-flex items-center px-3 py-1.5 text-xs font-black rounded-lg text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 transition-all"
                            >
                                <Calculator className="h-3.5 w-3.5 md:mr-1.5" />
                                <span className="hidden md:inline">Calculé</span>
                            </button>
                            {isTablet && (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowAllColumnsTablet(!showAllColumnsTablet)}
                                        className={`inline-flex items-center px-3 py-1.5 text-xs font-black rounded-lg transition-all border ${showAllColumnsTablet ? 'bg-bank-100 border-bank-200 text-bank-700' : 'bg-white border-gray-100 text-gray-500'}`}
                                    >
                                        <Layers className="h-3.5 w-3.5 mr-1.5" />
                                        Colonnes +
                                    </button>
                                </div>
                            )}
                            <button
                                onClick={() => setShowAnomalyPanel(true)}
                                title="Détecter les Anomalies"
                                className="inline-flex items-center px-3 py-1.5 text-xs font-black rounded-lg text-white bg-gradient-to-r from-bank-900 to-gray-800 hover:from-black hover:to-gray-900 transition-all"
                            >
                                <AlertTriangle className="h-3.5 w-3.5 md:mr-1.5 text-bank-400" />
                                <span className="hidden md:inline">Anomalies</span>
                            </button>
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                title="Réinitialiser"
                                className="inline-flex items-center p-1.5 text-xs font-black rounded-lg text-red-600 bg-white hover:bg-red-50 transition-all border border-red-100/50"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>

                    {anomalyResult && (
                        <div className={`px-8 py-3 flex items-center justify-between border-b transition-all ${anomalyResult.anomaly_rate < 1 ? 'bg-green-50 border-green-100 text-green-800' :
                            anomalyResult.anomaly_rate < 5 ? 'bg-amber-50 border-amber-100 text-amber-800' :
                                'bg-red-50 border-red-100 text-red-800'
                            }`}>
                            <div className="flex items-center gap-4">
                                <AlertCircle className="w-5 h-5" />
                                <span className="text-sm font-black uppercase tracking-tight">
                                    {anomalyResult.anomaly_count} anomalies détectées sur {anomalyResult.total_rows} lignes ({anomalyResult.anomaly_rate}%)
                                </span>
                                {anomalyResult.skipped_columns.length > 0 && (
                                    <span className="text-[10px] font-bold opacity-60 ml-4">
                                        IGNORÉES : {anomalyResult.skipped_columns.join(', ')}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowAnomaliesOnly(!showAnomaliesOnly)}
                                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all border ${showAnomaliesOnly ? 'bg-white border-current' : 'bg-transparent border-transparent opacity-60 hover:opacity-100'
                                        }`}
                                >
                                    {showAnomaliesOnly ? 'Voir tout le dataset' : 'Voir anomalies uniquement'}
                                </button>
                                <button
                                    onClick={handleExportAnomalies}
                                    className="flex items-center gap-2 px-3 py-1 bg-white/50 hover:bg-white rounded-lg text-xs font-black transition-all"
                                >
                                    <Download className="w-3 h-3" /> Exporter
                                </button>
                                <button onClick={() => setAnomalyResult(null)} className="p-1 hover:bg-black/5 rounded-full transition-all">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {anomalyResult && anomalyResult.llm_summary && (
                        <div className="px-8 py-5 border-b border-white/20 bg-gradient-to-r from-bank-50/50 to-bank-100/30 flex gap-6 items-start">
                            <div className="p-3 bg-white rounded-xl shadow-sm flex-shrink-0">
                                <Sparkles className="w-6 h-6 text-bank-600" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-bank-500 mb-1 flex items-center gap-2">
                                    Analyse IA par Gemini Flash
                                    <span className="flex h-1.5 w-1.5 rounded-full bg-bank-400 animate-ping"></span>
                                </h4>
                                <p className="text-sm font-medium text-gray-800 leading-relaxed italic">
                                    "{anomalyResult.llm_summary}"
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Mobile Controls (Change 4) */}
                    {isMobile && (
                        <div className="px-4 py-3 bg-white/50 border-b border-white/20 flex flex-col gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Rechercher..."
                                    value={mobileSearchQuery}
                                    onChange={(e) => setMobileSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-white/50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-bank-500"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 relative">
                                    <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <select
                                        value={mobileSortCol}
                                        onChange={(e) => setMobileSortCol(e.target.value)}
                                        className="w-full pl-10 pr-8 py-2 bg-white/50 border border-gray-200 rounded-xl text-sm appearance-none outline-none"
                                    >
                                        <option value="">Trier par...</option>
                                        {dataPreview.columns.map(col => (
                                            <option key={col.field} value={col.field}>{col.title}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 min-h-0 bg-transparent p-6 relative">
                        {isMobile ? (
                            <CardView
                                rows={dataPreview.data}
                                columns={colDefs}
                                anomalies={anomalyResult}
                                searchQuery={mobileSearchQuery}
                                sortCol={mobileSortCol}
                                visibleCount={visibleCount}
                                onLoadMore={() => setVisibleCount(prev => prev + 20)}
                                isLoading={loading}
                            />
                        ) : (
                            <div
                                className="ag-theme-quartz overflow-hidden"
                                style={{
                                    height: isTablet ? 'calc(100vh - 260px)' : 'calc(100vh - 220px)'
                                }}
                            >
                                <AgGridReact
                                    ref={gridRef}
                                    rowData={dataPreview.data || []}
                                    columnDefs={colDefs}
                                    pagination={true}
                                    paginationPageSize={pageSize}
                                    animateRows={true}
                                    onGridReady={(params) => params.api.sizeColumnsToFit()}
                                    rowClassRules={rowClassRules}
                                    defaultColDef={{
                                        cellStyle: { display: 'flex', alignItems: 'center' }
                                    }}
                                />

                                {/* Page Size Selector (Change 5) */}
                                <div className="mt-4 flex items-center gap-2 text-xs font-bold text-gray-500">
                                    <span>Afficher :</span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => setPageSize(Number(e.target.value))}
                                        className="bg-white border border-gray-200 rounded px-2 py-1 outline-none"
                                    >
                                        {[15, 25, 50, 100].map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                    <span>par page</span>
                                </div>
                            </div>
                        )}

                        {/* Mobile FAB (Change 4) */}
                        {isMobile && (
                            <div className="fixed bottom-8 right-6 z-40 flex flex-col items-end gap-3">
                                {showMobileActions && (
                                    <div className="flex flex-col gap-3 mb-2 animate-fade-in-up">
                                        <button
                                            onClick={() => { fetchColumnsInfo(); setShowMobileActions(false); }}
                                            className="flex items-center gap-3 px-4 py-3 bg-bank-600 text-white rounded-xl shadow-xl font-black text-xs uppercase tracking-widest"
                                        >
                                            <Settings className="w-4 h-4" /> Types
                                        </button>
                                        <button
                                            onClick={() => { setShowFormulaModal(true); setShowMobileActions(false); }}
                                            className="flex items-center gap-3 px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-xl font-black text-xs uppercase tracking-widest"
                                        >
                                            <Calculator className="w-4 h-4" /> Calculé
                                        </button>
                                        <button
                                            onClick={() => { setShowAnomalyPanel(true); setShowMobileActions(false); }}
                                            className="flex items-center gap-3 px-4 py-3 bg-gray-950 text-white rounded-xl shadow-xl font-black text-xs uppercase tracking-widest"
                                        >
                                            <AlertTriangle className="w-4 h-4 text-bank-400" /> Anomalies
                                        </button>
                                    </div>
                                )}
                                <button
                                    onClick={() => setShowMobileActions(!showMobileActions)}
                                    className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all transform active:scale-95 ${showMobileActions ? 'bg-red-500 rotate-45' : 'bg-bank-600'
                                        }`}
                                >
                                    <Plus className="w-7 h-7" />
                                </button>
                            </div>
                        )}
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

            {/* Calculated Field Modal */}
            {showFormulaModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-2xl overflow-hidden shadow-2xl transform transition-all sm:max-w-2xl w-full max-h-[85vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-emerald-100/50 flex items-center gap-3 shrink-0">
                            <div className="flex-shrink-0 w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                                <Calculator className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Nouveau Champ Calculé</h3>
                                <p className="text-xs text-gray-500">Créez une nouvelle colonne à partir d'une formule mathématique.</p>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-5">
                            {/* Column Name Input */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Nom de la nouvelle colonne</label>
                                <input
                                    type="text"
                                    value={formulaName}
                                    onChange={(e) => setFormulaName(e.target.value)}
                                    placeholder="Ex: Marge, Total_TTC, Ratio..."
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-bold text-gray-800 placeholder-gray-300 transition-all"
                                />
                            </div>

                            {/* Formula Input */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Formule</label>
                                <textarea
                                    value={formulaExpr}
                                    onChange={(e) => setFormulaExpr(e.target.value)}
                                    placeholder={`Ex: Prix * Quantité   ou   "CA" - Coûts`}
                                    rows={3}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono text-sm text-gray-800 placeholder-gray-300 transition-all resize-none"
                                />
                            </div>

                            {/* Operator Buttons */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mr-2">Opérateurs :</span>
                                {['+', '-', '*', '/', '(', ')'].map(op => (
                                    <button
                                        key={op}
                                        onClick={() => setFormulaExpr(prev => prev + ' ' + op + ' ')}
                                        className="w-9 h-9 bg-gray-100 hover:bg-emerald-100 text-gray-700 hover:text-emerald-700 font-mono font-black rounded-lg border border-gray-200 hover:border-emerald-300 transition-all text-sm"
                                    >
                                        {op}
                                    </button>
                                ))}
                            </div>

                            {/* Available Columns (clickable chips) */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Colonnes disponibles <span className="text-gray-300">(cliquer pour insérer)</span></label>
                                <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto p-3 bg-gray-50 rounded-xl border border-gray-100">
                                    {dataPreview && dataPreview.columns_info ? dataPreview.columns_info.filter(c => c.is_numeric).map(col => (
                                        <button
                                            key={col.name}
                                            onClick={() => setFormulaExpr(prev => prev + (col.name.includes(' ') ? `"${col.name}"` : col.name))}
                                            className="px-3 py-1.5 bg-white border border-emerald-200 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-50 hover:border-emerald-400 transition-all shadow-sm hover:shadow-md"
                                        >
                                            <span className="text-emerald-400 mr-1">Σ</span> {col.name}
                                        </button>
                                    )) : <span className="text-xs text-gray-400 italic">Aucune colonne numérique disponible</span>}
                                </div>
                                {dataPreview && dataPreview.columns_info && dataPreview.columns_info.some(c => !c.is_numeric) && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {dataPreview.columns_info.filter(c => !c.is_numeric).map(col => (
                                            <button
                                                key={col.name}
                                                onClick={() => setFormulaExpr(prev => prev + (col.name.includes(' ') ? `"${col.name}"` : col.name))}
                                                className="px-3 py-1.5 bg-white border border-amber-200 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-50 hover:border-amber-400 transition-all shadow-sm"
                                            >
                                                <span className="text-amber-400 mr-1">A</span> {col.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Error Display */}
                            {formulaError && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs font-semibold text-red-700">{formulaError}</p>
                                </div>
                            )}

                            {/* Help */}
                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">💡 Exemples de formules</p>
                                <ul className="text-xs text-blue-700 space-y-1 font-mono">
                                    <li>Prix * Quantité</li>
                                    <li>"Chiffre d'affaires" - Coûts</li>
                                    <li>(Ventes - Retours) / Ventes * 100</li>
                                </ul>
                            </div>
                        </div>

                        <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3 shrink-0 border-t border-gray-200">
                            <button
                                onClick={async () => {
                                    if (!formulaName.trim()) { setFormulaError('Nom du champ requis'); return; }
                                    if (!formulaExpr.trim()) { setFormulaError('Formule requise'); return; }
                                    setFormulaLoading(true);
                                    setFormulaError('');
                                    try {
                                        const res = await fetch('/api/calculated-field', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ name: formulaName, formula: formulaExpr }),
                                            credentials: 'include',
                                        });
                                        const result = await res.json();
                                        if (res.ok && result.status === 'success') {
                                            addNotification(result.message, 'success');
                                            setShowFormulaModal(false);
                                            fetchDataPreview(); // Refresh the grid
                                        } else {
                                            setFormulaError(result.message || 'Erreur inconnue');
                                        }
                                    } catch (e) {
                                        setFormulaError('Impossible de contacter le serveur.');
                                    } finally {
                                        setFormulaLoading(false);
                                    }
                                }}
                                disabled={formulaLoading}
                                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl font-black text-sm hover:from-emerald-500 hover:to-emerald-400 transition-all flex items-center justify-center min-w-[140px] shadow-lg shadow-emerald-200 hover:-translate-y-0.5 active:translate-y-0"
                            >
                                {formulaLoading ? <span className="block w-4 h-4 rounded-full border-2 border-t-white border-r-transparent animate-spin"></span> : (
                                    <><Plus className="w-4 h-4 mr-2" /> Créer le champ</>
                                )}
                            </button>
                            <button
                                onClick={() => setShowFormulaModal(false)}
                                disabled={formulaLoading}
                                className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-bold"
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Anomaly Detection Drawer (Change 3) */}
            {showAnomalyPanel && (
                <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/40 backdrop-blur-sm px-0">
                    <div className={`bg-white h-full shadow-2xl transform transition-transform duration-500 ease-out flex flex-col border-l border-white ${isMobile ? 'w-full' : 'max-w-2xl w-full translate-x-0'}`}>
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-950 flex items-center justify-between shrink-0 text-white">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-bank-500/20 rounded-xl text-bank-400">
                                    <Sparkles className="h-5 w-5 animate-pulse" />
                                </div>
                                <h3 className="text-lg font-black tracking-tight">Anomalies</h3>
                            </div>
                            <button onClick={() => setShowAnomalyPanel(false)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                                <Plus className="w-6 h-6 rotate-45" />
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto flex-1 space-y-8">
                            {/* Step 1: Columns */}
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-4 flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-900 border border-gray-200">1</span>
                                    Sélectionnez les colonnes à analyser
                                </h4>
                                <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    {dataPreview && dataPreview.columns_info && dataPreview.columns_info.map(col => (
                                        <button
                                            key={col.name}
                                            onClick={() => {
                                                setSelectedAnomalyCols(prev =>
                                                    prev.includes(col.name) ? prev.filter(c => c !== col.name) : [...prev, col.name]
                                                );
                                            }}
                                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 border-2 ${selectedAnomalyCols.includes(col.name)
                                                ? 'bg-bank-600 border-bank-600 text-white shadow-lg shadow-bank-200'
                                                : 'bg-white border-gray-100 text-gray-500 hover:border-gray-300'
                                                }`}
                                        >
                                            {selectedAnomalyCols.includes(col.name) && <Check className="w-3 h-3" />}
                                            {col.name}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-2 flex gap-4">
                                    <button onClick={() => setSelectedAnomalyCols(dataPreview.columns_info.map(c => c.name))} className="text-[10px] font-bold text-bank-600 hover:underline uppercase tracking-tight">Tout sélectionner</button>
                                    <button onClick={() => setSelectedAnomalyCols([])} className="text-[10px] font-bold text-gray-400 hover:underline uppercase tracking-tight">Désélectionner tout</button>
                                </div>
                            </div>

                            {/* Step 2: Method */}
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-4 flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-900 border border-gray-200">2</span>
                                    Choisissez une méthode de détection
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {[
                                        { id: 'zscore', title: 'Z-Score', sub: 'Rapide, idéal pour les distributions normales', icon: Layers },
                                        { id: 'iqr', title: 'IQR', sub: 'Robuste aux distributions asymétriques', icon: FileType2 },
                                        { id: 'isolation_forest', title: 'Isolation Forest', sub: 'Multivarié, patterns complexes', icon: Sparkles }
                                    ].map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => setAnomalyMethod(m.id)}
                                            className={`p-5 rounded-2xl text-left transition-all border-2 flex flex-col gap-3 group ${anomalyMethod === m.id
                                                ? 'bg-bank-50 border-bank-500 ring-4 ring-bank-500/10'
                                                : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${anomalyMethod === m.id ? 'bg-bank-500 text-white' : 'bg-gray-100 text-gray-400'
                                                }`}>
                                                <m.icon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-black text-sm text-gray-900 mb-1">{m.title}</div>
                                                <div className="text-[10px] font-medium text-gray-400 leading-tight">{m.sub}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Step 3: Threshold (if applicable) */}
                            {anomalyMethod !== 'isolation_forest' && (
                                <div className="animate-fade-in-up">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-4 flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-900 border border-gray-200">3</span>
                                        Seuil de sensibilité (Threshold)
                                    </h4>
                                    <div className="flex items-center gap-6 p-6 bg-gray-50 rounded-2xl border border-gray-100">
                                        <div className="flex-1">
                                            <input
                                                type="range"
                                                min="1"
                                                max="10"
                                                step="0.5"
                                                value={anomalyThreshold}
                                                onChange={(e) => setAnomalyThreshold(e.target.value)}
                                                className="w-full accent-bank-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <div className="flex justify-between mt-2 text-[9px] font-black text-gray-300 uppercase tracking-widest">
                                                <span>Sensible (1.0)</span>
                                                <span>Strict (10.0)</span>
                                            </div>
                                        </div>
                                        <div className="w-20 p-4 bg-white rounded-2xl border border-gray-200 text-center">
                                            <span className="text-xl font-black text-bank-600">{anomalyThreshold}</span>
                                        </div>
                                    </div>
                                    <p className="mt-3 text-[10px] font-bold text-gray-400 italic">
                                        {anomalyMethod === 'zscore'
                                            ? "Un seuil de 3.0 capture les valeurs au-delà de 3 écarts-types (standard pour les distributions en cloche)."
                                            : "Un seuil de 1.5 est le standard de Tukey pour détecter les outliers modérés."}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 flex-shrink-0">
                                <Info className="w-3 h-3 text-bank-400" />
                                {selectedAnomalyCols.length} colonne(s) sélectionnée(s)
                            </div>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowAnomalyPanel(false)}
                                    className="px-6 py-3 text-sm font-black text-gray-500 hover:text-gray-900 transition-all uppercase tracking-widest"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={async () => {
                                        await handleAnalyzeAnomalies();
                                        setShowAnomalyPanel(false);
                                    }}
                                    disabled={anomalyLoading || selectedAnomalyCols.length === 0}
                                    className="group relative px-8 py-3 bg-gray-950 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-gray-300 hover:shadow-bank-200 transition-all flex items-center justify-center min-w-[200px] overflow-hidden disabled:opacity-50"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-bank-600 to-bank-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                    <span className="relative z-10 flex items-center gap-3">
                                        {anomalyLoading ? (
                                            <span className="w-4 h-4 border-2 border-t-white border-r-transparent animate-spin rounded-full"></span>
                                        ) : (
                                            <><Sparkles className="w-4 h-4" /> Analyser les données</>
                                        )}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
