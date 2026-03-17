import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import {
    Database as DatabaseIcon,
    Type,
    ShieldCheck,
    Calculator,
    FileDown,
    Trash2,
    ChevronLeft,
    ChevronRight,
    Search,
    X,
    Info,
    Check,
    Download,
    ChevronDown,
    BarChart3,
    TrendingUp,
    Filter,
    Plus,
    RotateCcw,
    Sparkles,
    Layers,
    AlertTriangle,
    AlertCircle,
    ArrowUpDown,
    Menu,
    ChevronsLeft,
    ChevronsRight,
    Settings2,
    Settings,
    FileType2,
    Save,
    Maximize2,
    Minimize2
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { customFetch } from '../features/auth/session';

ModuleRegistry.registerModules([AllCommunityModule]);

const CUSTOM_STYLES = `
    .ag-theme-quartz {
        --ag-grid-size: 8px;
        --ag-font-size: 13px;
        --ag-header-height: 48px;
        --ag-header-foreground-color: #64748b;
        --ag-header-background-color: transparent;
        --ag-row-hover-color: #f8fafc;
        --ag-border-color: #f1f5f9;
        --ag-border-radius: 0px;
    }
    .ag-header-cell-label { 
        font-weight: 800; 
        text-transform: uppercase; 
        letter-spacing: 0.05em; 
        color: #1e293b;
    }
    .ag-cell { 
        display: flex; 
        align-items: center; 
        border-right: 1px solid #f8fafc !important; 
    }
    .ag-row-odd { background-color: #ffffff; }
    .ag-row-even { background-color: #f9fafb; }
    
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
    
    @keyframes modal-scale {
        from { opacity: 0; transform: scale(0.95) translateY(10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .animate-modal { animation: modal-scale 0.3s cubic-bezier(0.16, 1, 0.3, 1); }

    .anomaly-banner { transition: max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
`;

const TYPE_LABELS = {
    'Int64': 'Nombre Entier',
    'Float64': 'Décimal / Prix',
    'String': 'Texte / Catégorie',
    'Date': 'Date / Temps',
    'Boolean': 'Oui / Non'
};

// ─── STABLE SUB-COMPONENTS ────────────────────────

const Modal = ({ isOpen, onClose, title, icon: Icon, children, infoBlock, maxWidth = "max-w-2xl" }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-12 overflow-y-auto">
            <div className={`bg-white rounded-[2rem] shadow-2xl ${maxWidth} w-full flex flex-col h-fit max-h-[90vh] animate-modal relative overflow-hidden`}>
                <div className="h-16 px-8 flex items-center justify-between border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-3">
                        {Icon && (
                            <div className="p-2 bg-bank-50 rounded-xl text-bank-600">
                                <Icon className="w-5 h-5" />
                            </div>
                        )}
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">{title}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-xl transition-all text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-6">
                    {infoBlock && (
                        <div className="bg-bank-50/50 rounded-2xl p-6 mb-8 border border-bank-100/50">
                            <div className="flex gap-4">
                                <div className="text-xl">📘</div>
                                <div className="space-y-4">
                                    <h4 className="text-[13px] font-black text-bank-900 uppercase tracking-tight">{infoBlock.title}</h4>
                                    <p className="text-[12px] font-medium text-bank-800 leading-relaxed opacity-80 whitespace-pre-wrap">
                                        {infoBlock.content}
                                    </p>
                                    <div className="bg-white/60 p-4 rounded-xl text-[11px] italic text-bank-700">
                                        <strong>Exemple :</strong> {infoBlock.example}
                                    </div>
                                    {infoBlock.warning && (
                                        <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-700 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-amber-100">
                                            <AlertTriangle className="w-3.5 h-3.5" />
                                            <span>Attention : {infoBlock.warning}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {children}
                </div>
            </div>
        </div>
    );
};

const Header = ({ rowCount, loadedRows, activeToolTab, onOpenToolTab, onOpenStats, onReset, onDelete, onExport }) => {
    const [isExportOpen, setIsExportOpen] = useState(false);
    const exportRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (exportRef.current && !exportRef.current.contains(event.target)) {
                setIsExportOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-gray-100 z-30 shrink-0">
            <div className="flex items-center justify-between w-full">
                {/* Brand & Stats */}
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-bank-600 rounded-2xl text-white shadow-xl shadow-bank-100">
                        <DatabaseIcon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                            Explorateur de Données
                        </h1>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                {rowCount?.toLocaleString() || 0} lignes synchronisées
                            </span>
                        </div>
                    </div>
                </div>

                {/* Tools & Actions */}
                <div className="flex items-center gap-4">
                    {/* Advanced Tools Group */}
                    <div className="flex items-center gap-1.5 bg-gray-50/50 p-1 rounded-2xl border border-gray-100">
                        <div className="relative group/tools">
                            <button className="flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 rounded-xl transition-all">
                                <Settings2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Outils Avancés</span>
                                <ChevronDown className="w-3 h-3 opacity-50 hidden sm:inline" />
                            </button>

                            <div className="absolute top-full mt-2 right-0 md:right-auto md:left-0 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 opacity-0 invisible group-hover/tools:opacity-100 group-hover/tools:visible transition-all z-50 animate-in fade-in slide-in-from-top-2">
                                <button
                                    onClick={() => onOpenToolTab('anomalies')}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${activeToolTab === 'anomalies' ? 'bg-bank-50 text-bank-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                >
                                    <Sparkles className="w-4 h-4" />
                                    <span className="text-[11px] font-bold uppercase tracking-wider">Anomalies</span>
                                </button>
                                <button
                                    onClick={() => onOpenToolTab('types')}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${activeToolTab === 'types' ? 'bg-bank-50 text-bank-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                >
                                    <Settings2 className="w-4 h-4" />
                                    <span className="text-[11px] font-bold uppercase tracking-wider">Variables</span>
                                </button>
                                <button
                                    onClick={() => onOpenToolTab('expression')}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${activeToolTab === 'expression' ? 'bg-bank-50 text-bank-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                >
                                    <Calculator className="w-4 h-4" />
                                    <span className="text-[11px] font-bold uppercase tracking-wider">Calculs</span>
                                </button>
                            </div>
                        </div>

                        <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>

                        <button
                            onClick={onOpenStats}
                            className="flex items-center gap-2 px-3 py-2 text-violet-600 hover:bg-violet-50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                        >
                            <BarChart3 className="w-4 h-4" />
                            <span className="hidden sm:inline">Statistiques</span>
                        </button>
                    </div>

                    {/* Export & Delete Group */}
                    <div className="flex items-center gap-1 border-l border-gray-100 pl-3 ml-1">
                        <div className="relative" ref={exportRef}>
                            <button
                                onClick={() => setIsExportOpen(!isExportOpen)}
                                className="flex items-center gap-2 px-4 py-2 bg-bank-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-bank-700 transition-all group relative shadow-lg shadow-bank-100"
                            >
                                <Download className="w-4 h-4" />
                                <span>Export</span>
                            </button>

                            {isExportOpen && (
                                <div className="absolute top-full mt-2 right-0 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 animate-modal">
                                    <button onClick={() => { onExport('csv'); setIsExportOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-all">
                                        <div className="text-[11px] font-black text-gray-900 uppercase tracking-tight">CSV</div>
                                    </button>
                                    <button onClick={() => { onExport('xlsx'); setIsExportOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-all">
                                        <div className="text-[11px] font-black text-gray-900 uppercase tracking-tight">Excel (.xlsx)</div>
                                    </button>
                                    <button onClick={() => { onExport('pdf'); setIsExportOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-all">
                                        <div className="text-[11px] font-black text-gray-900 uppercase tracking-tight">PDF</div>
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={onDelete}
                            className="p-2 text-gray-400 hover:text-rose-500 transition-colors"
                            title="Supprimer les données"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

const Toolbar = ({ searchQuery, setSearchQuery, pageSize, setPageSize, totalRows, loadedRows, gridRef, isTableFullScreen, setIsTableFullScreen }) => (
    <div className="h-12 flex items-center justify-between px-6 bg-gray-50 border-b border-gray-200 z-10 shrink-0">
        <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    placeholder="Rechercher dans les lignes..."
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (gridRef.current?.api) {
                            gridRef.current.api.setGridOption('quickFilterText', e.target.value);
                        }
                    }}
                    className="w-full pl-10 pr-4 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-bank-500 transition-all placeholder:text-gray-300"
                />
            </div>
            <div className="hidden lg:flex items-center gap-4 pl-4 border-l border-gray-200">
                <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                    <span>Afficher</span>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            const newSize = Number(e.target.value);
                            setPageSize(newSize);
                            if (gridRef.current?.api) {
                                gridRef.current.api.setGridOption('paginationPageSize', newSize);
                            }
                        }}
                        className="bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-bank-600 focus:ring-0 cursor-pointer font-black"
                    >
                        {[15, 50, 100, 500].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <span>Lignes</span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:block">
                <span className="text-slate-900">{totalRows?.toLocaleString()}</span> lignes &middot; <span className="text-emerald-500">{loadedRows}</span> chargées
            </div>
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setIsTableFullScreen(!isTableFullScreen)}
                    className="p-2 text-gray-400 hover:text-bank-600 hover:bg-bank-50 rounded-xl transition-all"
                    title={isTableFullScreen ? "Réduire le tableau" : "Agrandir le tableau"}
                >
                    {isTableFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button className="md:hidden p-2 text-gray-400">
                    <Menu className="w-5 h-5" />
                </button>
            </div>
        </div>
    </div>
);

const Footer = ({ currentPage, totalPages, pageSize, totalRows, loadedRows, gridRef, isMobile }) => {
    const startRow = totalRows > 0 ? ((currentPage || 1) - 1) * (pageSize || 1) + 1 : 0;
    const endRow = totalRows > 0 ? Math.min((currentPage || 1) * (pageSize || 1), loadedRows || 0) : 0;

    return (
        <footer className="h-12 bg-white border-t border-gray-100 flex items-center justify-between px-6 z-10 shrink-0 select-none">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hidden sm:block">
                Page <span className="text-slate-900">{currentPage || 1}</span> sur <span className="text-slate-900">{totalPages || 1}</span>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => gridRef.current?.api?.paginationGoToFirstPage()}
                    disabled={currentPage === 1}
                    className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-20 transition-all text-slate-900"
                >
                    <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                    onClick={() => gridRef.current?.api?.paginationGoToPreviousPage()}
                    disabled={currentPage === 1}
                    className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-20 transition-all text-slate-900"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[11px] font-black shadow-lg shadow-slate-200 min-w-[36px] text-center">
                    {currentPage || 1}
                </div>

                <button
                    onClick={() => gridRef.current?.api?.paginationGoToNextPage()}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-20 transition-all text-slate-900"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
                <button
                    onClick={() => gridRef.current?.api?.paginationGoToLastPage()}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-20 transition-all text-slate-900"
                >
                    <ChevronsRight className="w-4 h-4" />
                </button>
            </div>

            <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hidden md:block">
                Lignes <span className="text-slate-900">{startRow}</span> à <span className="text-slate-900">{endRow}</span> sur <span className="text-bank-600">{totalRows?.toLocaleString() || 0}</span>
            </div>
            <div className="text-[10px] font-extrabold text-gray-400 uppercase md:hidden tracking-widest">
                PAGE {currentPage || 1}/{totalPages || 1}
            </div>
        </footer>
    );
};

const AnomalyBanner = ({ anomalyResult, isExpanded, setIsExpanded, onExport }) => {
    if (!anomalyResult) return null;
    return (
        <div className="absolute top-0 left-0 right-0 z-20 bg-amber-50 border-b border-amber-200 transition-all duration-300 shadow-sm overflow-hidden">
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="px-6 py-2.5 flex items-center justify-between cursor-pointer hover:bg-amber-100/50 transition-colors select-none"
            >
                <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="text-[11px] font-black text-amber-900 uppercase tracking-widest">
                        ⚠️ {anomalyResult.anomaly_count} anomalies détectées &middot; <span className="text-amber-600">Voir le rapport {isExpanded ? '▲' : '▼'}</span>
                    </span>
                </div>
            </div>

            {isExpanded && (
                <div className="px-6 pb-6 pt-2 animate-modal">
                    <div className="bg-white/80 p-6 rounded-2xl border border-amber-100 max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-bank-600" />
                                <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Interprétation Experte</h4>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onExport(); }}
                                className="p-2 bg-slate-900 text-white rounded-lg hover:bg-black transition-all"
                            >
                                <Download className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div
                            className="text-[12px] font-medium text-slate-700 leading-relaxed prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: anomalyResult.llm_interpretation?.replace(/\n/g, '<br/>') }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const VariablesModal = ({ isOpen, onClose, columnsInfo, onTypeChange, onSave, isSaving }) => {
    if (!isOpen) return null;
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Variables & Types"
            icon={Settings2}
            infoBlock={{
                title: "Pourquoi définir les types de variables ?",
                content: "Lors de l'import, certaines colonnes peuvent être mal interprétées — une date lue comme du texte, un entier lu comme un décimal. Définir le bon type permet une analyse experte de vos données et rend les graphiques plus précis.",
                example: "si la colonne 'Age' est importée en STRING, les calculs de moyenne ou de distribution seront impossibles. En la passant en INT64, toutes les analyses numériques deviennent disponibles.",
                warning: "changer un type ne modifie pas vos données source, uniquement leur interprétation dans cet outil."
            }}
        >
            <div className="space-y-4">
                {Array.isArray(columnsInfo) && columnsInfo.length > 0 ? (
                    columnsInfo.map(col => (
                        <div key={col.name || col.field} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 group hover:border-bank-200 transition-all">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-black text-gray-900 uppercase tracking-tight">{col.name || col.field || col.title}</span>
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Actuel: {TYPE_LABELS[col.dtype] || col.dtype}</span>
                            </div>
                            <select
                                value={col.target_type || col.dtype}
                                onChange={(e) => onTypeChange(col.name || col.field, e.target.value)}
                                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-bank-600 focus:ring-2 focus:ring-bank-500 cursor-pointer"
                            >
                                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                                    <option key={val} value={val}>{label}</option>
                                ))}
                            </select>
                        </div>
                    ))
                ) : (
                    <div className="p-12 text-center space-y-4">
                        <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto text-gray-400">
                            <Layers className="w-6 h-6" />
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Aucune variable détectée</p>
                    </div>
                )}
            </div>
            <div className="mt-8 flex justify-end">
                <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="py-3 px-6 bg-bank-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-bank-200 hover:bg-bank-700 transition-all active:scale-95 disabled:opacity-50"
                >
                    {isSaving ? 'Sauvegarde...' : 'Appliquer les modifications'}
                </button>
            </div>
        </Modal>
    );
};

const AnomaliesModal = ({ isOpen, onClose, columns, selectedCols, onToggleCol, method, setMethod, threshold, setThreshold, onAnalyze, isLoading, hasResult, onReopenBanner }) => {
    if (!isOpen) return null;
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Analyse d'Anomalies Experte"
            icon={Sparkles}
            infoBlock={{
                title: "Qu'est-ce que la détection d'anomalies ?",
                content: "Le système analyse vos colonnes numériques pour identifier les valeurs inhabituelles ou suspectes — des valeurs trop élevées, trop basses, ou statistiquement incohérentes avec le reste des données.",
                example: "dans un dataset médical, un patient avec une tension artérielle de 400 serait immédiatement signalé comme anormal.",
                warning: "Plus le seuil est bas, plus l'analyse est sensitive — vous détecterez plus d'anomalies mais avec plus de faux positifs."
            }}
        >
            <div className="space-y-8">
                <div className="grid grid-cols-2 gap-3">
                    {Array.isArray(columns) && columns.map(col => (
                        <button
                            key={col.field}
                            onClick={() => onToggleCol(col.field)}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${selectedCols?.includes(col.field) ? 'border-bank-500 bg-bank-50/30' : 'border-gray-50 bg-gray-50/50 hover:bg-gray-50 text-gray-400'}`}
                        >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selectedCols?.includes(col.field) ? 'bg-bank-500 border-bank-500 text-white' : 'border-gray-300'}`}>
                                {selectedCols?.includes(col.field) && <Check className="w-3 h-3" />}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-tight truncate">{col.title}</span>
                        </button>
                    ))}
                    {(!Array.isArray(columns) || columns.length === 0) && (
                        <div className="col-span-2 py-8 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            Aucune variable numérique disponible
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-900 rounded-2xl space-y-6">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Méthode de Détection</label>
                        <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                            className="w-full bg-slate-800 border-none text-white rounded-xl py-3 px-4 text-xs font-black cursor-pointer"
                        >
                            <option value="iqr">Statistique : IQR (Recommandé)</option>
                            <option value="zscore">Statistique : Z-Score</option>
                            <option value="isolation_forest">Algorithme : Isolation Forest</option>
                        </select>
                    </div>

                    <div className="space-y-4 pt-2">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sensibilité du Seuil</label>
                            <span className="text-[11px] font-black text-bank-400 uppercase tracking-widest">{threshold}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="5"
                            step="0.1"
                            value={threshold}
                            onChange={(e) => setThreshold(Number(e.target.value))}
                            className="w-full accent-bank-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-[9px] font-black text-gray-500 uppercase tracking-widest">
                            <span>Précis</span>
                            <span>Sensible</span>
                        </div>
                    </div>

                    <button
                        onClick={onAnalyze}
                        disabled={isLoading || (selectedCols?.length || 0) === 0}
                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-20 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-900/10"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            <Sparkles className="w-4 h-4" />
                        )}
                        Lancer l'Analyse Expert
                    </button>
                    {hasResult && (
                        <button
                            onClick={onReopenBanner}
                            className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all"
                        >
                            Revoir le dernier rapport
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

const CalculatedFieldsModal = ({ isOpen, onClose, columns, onAdd, isLoading, error }) => {
    const [expressionName, setExpressionName] = useState('');
    const [expressionText, setExpressionText] = useState('');
    const [varSearch, setVarSearch] = useState('');
    const [activeTab, setActiveTab] = useState('vars');
    const textareaRef = useRef(null);

    // Reset local state when modal opens
    useEffect(() => {
        if (isOpen) {
            setExpressionName('');
            setExpressionText('');
            setVarSearch('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleReset = () => {
        setExpressionName('');
        setExpressionText('');
        setVarSearch('');
    };

    const handleAdd = () => {
        onAdd(expressionName, expressionText);
    };

    const insertAtCursor = (text) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        const newValue = value.substring(0, start) + text + value.substring(end);
        setExpressionText(newValue);

        // Reset cursor position after React update
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
        }, 0);
    };

    const filteredColumns = Array.isArray(columns)
        ? columns.filter(col =>
            col.title.toLowerCase().includes(varSearch.toLowerCase()) ||
            col.field.toLowerCase().includes(varSearch.toLowerCase())
        )
        : [];

    const FUNCTIONS = [
        { name: 'ABS(x)', desc: 'Valeur absolue', format: 'ABS(' },
        { name: 'ROUND(x, n)', desc: 'Arrondir à n décimales', format: 'ROUND(' },
        { name: 'SQRT(x)', desc: 'Racine carrée', format: 'SQRT(' },
        { name: 'LOG(x, b)', desc: 'Logarithme (base b)', format: 'LOG(' },
        { name: 'LN(x)', desc: 'Logarithme népérien', format: 'LN(' },
        { name: 'EXP(x)', desc: 'Exponentielle', format: 'EXP(' },
    ];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Assistant de Calcul Expert"
            icon={Calculator}
            maxWidth="max-w-5xl"
            infoBlock={{
                title: "Conception de variables calculées",
                content: "Créez de nouvelles dimensions d'analyse en appliquant des formules mathématiques sur vos données existantes. Utilisez la recherche pour trouver rapidement vos variables.",
                example: "Marge brute : (f['Ventes'] - f['Couts']) / f['Ventes']",
                warning: "Seules les colonnes numériques (INT, FLOAT) peuvent être utilisées dans les calculs arithmétiques."
            }}
        >
            <div className="flex flex-col gap-8">
                {/* --- Top: Assistant Panel (Horizontal) --- */}
                <div className="w-full bg-gray-50/50 border border-gray-100 rounded-[1.5rem] overflow-hidden shadow-sm flex flex-col">
                    <div className="flex flex-col md:flex-row border-b border-gray-100 bg-white items-center px-4">
                        <div className="flex gap-2 py-2">
                            <button
                                onClick={() => setActiveTab('vars')}
                                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'vars' ? 'text-bank-600 bg-bank-50' : 'text-gray-400 hover:bg-gray-50'}`}
                            >
                                Variables ({filteredColumns.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('funcs')}
                                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'funcs' ? 'text-bank-600 bg-bank-50' : 'text-gray-400 hover:bg-gray-50'}`}
                            >
                                Fonctions
                            </button>
                        </div>

                        {activeTab === 'vars' && (
                            <div className="flex-1 md:ml-8 w-full md:w-auto py-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={varSearch}
                                        onChange={(e) => setVarSearch(e.target.value)}
                                        placeholder="Filtrer les champs..."
                                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2 pl-9 pr-4 text-[11px] font-bold text-gray-900 focus:ring-2 focus:ring-bank-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-4 overflow-y-auto max-h-48 custom-scrollbar">
                        {activeTab === 'vars' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {filteredColumns.length > 0 ? (
                                    filteredColumns.map(col => (
                                        <button
                                            key={col.field}
                                            onClick={() => insertAtCursor(`f['${col.field}']`)}
                                            className="flex items-center justify-between p-3 bg-white border border-gray-100/50 rounded-xl hover:border-bank-200 hover:shadow-sm group transition-all text-left"
                                        >
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[10px] font-black text-gray-700 truncate">{col.title}</span>
                                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{col.field}</span>
                                            </div>
                                            <Plus className="w-3.5 h-3.5 text-bank-400 opacity-0 group-hover:opacity-100 transition-all shrink-0" />
                                        </button>
                                    ))
                                ) : (
                                    <div className="col-span-full py-8 text-center space-y-2">
                                        <Layers className="w-5 h-5 text-gray-200 mx-auto" />
                                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Aucun champ trouvé</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {FUNCTIONS.map(f => (
                                    <button
                                        key={f.name}
                                        onClick={() => insertAtCursor(f.format)}
                                        className="flex flex-col p-3 bg-white border border-gray-100/50 rounded-xl hover:border-violet-200 hover:bg-violet-50/10 group transition-all text-left"
                                    >
                                        <div className="flex items-center justify-between w-full mb-1">
                                            <span className="text-[11px] font-black text-violet-600 font-mono">{f.name}</span>
                                            <Plus className="w-3.5 h-3.5 text-violet-400 opacity-0 group-hover:opacity-100 transition-all shrink-0" />
                                        </div>
                                        <span className="text-[9px] font-medium text-gray-500 leading-tight">{f.desc}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="px-4 py-3 bg-white border-t border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            {['+', '-', '*', '/', '(', ')', '**'].map(op => (
                                <button
                                    key={op}
                                    onClick={() => insertAtCursor(op.length === 1 ? ' ' + op + ' ' : op)}
                                    className="h-8 px-3 flex items-center justify-center bg-gray-50 border border-gray-100 rounded-lg text-[11px] font-black text-gray-600 hover:bg-gray-900 hover:text-white transition-all active:scale-90"
                                >
                                    {op}
                                </button>
                            ))}
                        </div>
                        <div className="hidden sm:flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Syntaxe Polars Active</span>
                        </div>
                    </div>
                </div>

                {/* --- Bottom: Editor Panel (Full Width) --- */}
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-1 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Type className="w-3 h-3" /> Nom de la variable
                            </label>
                            <input
                                type="text"
                                value={expressionName}
                                onChange={(e) => setExpressionName(e.target.value)}
                                placeholder="ROI, Marge..."
                                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-[13px] font-bold text-gray-900 focus:ring-2 focus:ring-bank-500 outline-none transition-all"
                            />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <Sparkles className="w-3 h-3" /> Expression Mathématique
                                </label>
                            </div>
                            <div className="relative group/editor">
                                <textarea
                                    ref={textareaRef}
                                    value={expressionText}
                                    onChange={(e) => setExpressionText(e.target.value)}
                                    placeholder="Entrez votre calcul, ex: f['BP'] * 1.2"
                                    className="w-full h-40 bg-slate-950 p-6 text-emerald-400 font-mono text-[14px] leading-relaxed rounded-2xl resize-none outline-none focus:ring-2 focus:ring-bank-500 shadow-inner group-hover/editor:shadow-bank-100/20 transition-all custom-scrollbar"
                                />
                                <div className="absolute bottom-4 right-4 flex items-center gap-2">
                                    <span className="text-[9px] font-black text-emerald-500/30 uppercase tracking-widest font-mono">Expression Editor</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
                            <div className="flex gap-3">
                                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-[11px] font-black text-rose-900 uppercase">Erreur détectée</p>
                                    <p className="text-[11px] font-medium text-rose-600 leading-tight">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={handleReset}
                            className="px-6 py-4 bg-gray-50 text-gray-400 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-gray-100 hover:text-gray-600 transition-all active:scale-95"
                        >
                            <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={isLoading || !expressionName || !expressionText}
                            className="flex-1 py-4 bg-gradient-to-r from-bank-600 to-bank-700 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.15em] shadow-xl shadow-bank-200 hover:shadow-bank-300 transition-all active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-3 group"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <Calculator className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                    <span>Générer Variable Expert</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

const PDFExportModal = ({ isOpen, onClose, columns, selectedCols, onToggleCol, onGenerate, isLoading }) => {
    if (!isOpen) return null;
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Configuration Rapport PDF"
            icon={Download}
            infoBlock={{
                title: "Optimisation de l'export PDF",
                content: "Le format PDF est idéal pour les rapports imprimables, mais devient illisible si trop de colonnes sont présentes. Sélectionnez uniquement les variables essentielles pour votre analyse.",
                example: "Pour un rapport santé, choisissez 'Patient ID', 'Age', 'BP' et 'Cholesterol' plutôt que l'intégralité des 50 colonnes techniques.",
                warning: "Une sélection de plus de 8-10 colonnes en mode paysage risque de réduire fortement la taille de la police."
            }}
        >
            <div className="space-y-6">
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Colonnes à inclure ({selectedCols?.length || 0})</label>
                        <button
                            onClick={() => {
                                if ((selectedCols?.length || 0) === (columns?.length || 0)) onToggleCol('none');
                                else onToggleCol('all');
                            }}
                            className="text-[9px] font-black text-bank-600 uppercase tracking-widest hover:underline"
                        >
                            {(selectedCols?.length || 0) === (columns?.length || 0) && (columns?.length || 0) > 0 ? "Tout désélectionner" : "Tout sélectionner"}
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
                        {Array.isArray(columns) && columns.map(col => (
                            <button
                                key={col.field}
                                onClick={() => onToggleCol(col.field)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${selectedCols?.includes(col.field) ? 'bg-bank-50 border-bank-200 text-bank-900 shadow-sm' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'}`}
                            >
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${selectedCols?.includes(col.field) ? 'bg-bank-600 border-bank-600 text-white' : 'border-gray-300 bg-white'}`}>
                                    {selectedCols?.includes(col.field) && <Check className="w-3 h-3" />}
                                </div>
                                <span className="text-[11px] font-bold truncate">{col.title}</span>
                            </button>
                        ))}
                        {(!Array.isArray(columns) || columns.length === 0) && (
                            <div className="col-span-2 py-8 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                Chargement des colonnes...
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={onGenerate}
                    disabled={isLoading || (selectedCols?.length || 0) === 0}
                    className="w-full py-4 bg-bank-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-bank-200 hover:bg-bank-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    ) : (
                        <Download className="w-4 h-4" />
                    )
                    }
                    Générer le PDF ({selectedCols?.length || 0} colonnes)
                </button>
            </div>
        </Modal>
    );
};


const MathWarningModal = ({ isOpen, onClose, warning, onConfirm, isLoading }) => {
    if (!isOpen || !warning) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6 text-center animate-in fade-in">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-10 animate-modal border border-white/20">
                <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
                    <AlertTriangle className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tight">Risque Mathématique</h3>
                <p className="text-[13px] font-medium text-slate-600 leading-relaxed mb-6">
                    <span className="font-black text-amber-600">{warning.affected_rows.toLocaleString()} lignes</span> sur {warning.total_rows.toLocaleString()} produiront des erreurs (division par zéro, etc.).
                </p>
                <div className="bg-gray-50 rounded-2xl p-4 text-left border border-gray-100 mb-8">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Impact technique</p>
                    <p className="text-[11px] font-medium text-gray-600 leading-tight">
                        Les valeurs problématiques seront remplacées par <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 text-bank-600 font-bold">null</code> pour préserver l'intégrité de la base.
                    </p>
                </div>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => onConfirm(warning.payload.name, warning.payload.expression, true)}
                        disabled={isLoading}
                        className="w-full py-5 bg-bank-600 hover:bg-bank-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-bank-100 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        {isLoading && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>}
                        <span>Créer quand même</span>
                    </button>
                    <button onClick={onClose} disabled={isLoading} className="w-full py-5 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">Annuler</button>
                </div>
            </div>
        </div>
    );
};


const TYPE_CONFIG = {
    identifier: {
        label: 'ID',
        color: 'bg-gray-100 text-gray-600',
        accentColor: 'bg-gray-300',
        description: 'Identifiant unique — séquence progressive'
    },
    numeric: {
        label: 'NUM',
        color: 'bg-blue-100 text-blue-700',
        accentColor: 'bg-blue-400',
        description: 'Variable numérique'
    },
    categorical: {
        label: 'CAT',
        color: 'bg-amber-100 text-amber-700',
        accentColor: 'bg-amber-400',
        description: 'Variable catégorielle'
    },
    boolean: {
        label: 'BOOL',
        color: 'bg-green-100 text-green-700',
        accentColor: 'bg-green-400',
        description: 'Variable booléenne'
    },
    date: {
        label: 'DATE',
        color: 'bg-teal-100 text-teal-700',
        accentColor: 'bg-teal-400',
        description: 'Variable temporelle'
    }
};

const formatNumber = (val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val !== 'number') return String(val);
    if (Math.abs(val) >= 1_000_000)
        return val.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    if (Math.abs(val) >= 1_000)
        return val.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    return val.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
};

function StatCard({ label, value, subtitle, accent = false }) {
    return (
        <div className={`rounded-2xl p-4 flex flex-col gap-1 ${accent ? 'bg-violet-600 text-white shadow-md' : 'bg-gray-50 border border-gray-100'}`}>
            <span className={`text-[10px] font-black uppercase tracking-widest ${accent ? 'text-violet-200' : 'text-gray-400'}`}>
                {label}
            </span>
            <span className={`font-black leading-tight ${accent ? 'text-white' : 'text-gray-900'} ${String(value).length > 8 ? 'text-base' : 'text-xl'}`}>
                {formatNumber(value)}
            </span>
            {subtitle && (
                <span className={`text-[10px] font-medium ${accent ? 'text-violet-200' : 'text-gray-400'}`}>
                    {subtitle}
                </span>
            )}
        </div>
    );
}

function InterpretationBlock({ mean, std, nullPct, q1, q3 }) {
    const insights = [];

    if (nullPct > 20)
        insights.push({ icon: '⚠️', color: 'text-red-600 bg-red-50 border-red-100', text: `Taux de valeurs nulles élevé (${nullPct}%) — peut biaiser significativement les analyses` });
    else if (nullPct > 5)
        insights.push({ icon: 'ℹ️', color: 'text-amber-600 bg-amber-50 border-amber-100', text: `${nullPct}% de valeurs nulles — à prendre en compte dans les analyses` });

    if (std > mean * 0.5)
        insights.push({ icon: '⚠️', color: 'text-amber-600 bg-amber-50 border-amber-100', text: 'Forte dispersion détectée — présence probable de valeurs extrêmes (outliers)' });

    if ((q3 - q1) < std * 0.3)
        insights.push({ icon: 'ℹ️', color: 'text-blue-600 bg-blue-50 border-blue-100', text: 'Distribution asymétrique — la médiane est plus représentative que la moyenne' });

    if (insights.length === 0)
        insights.push({ icon: '✅', color: 'text-green-600 bg-green-50 border-green-100', text: 'Distribution standard, aucune anomalie structurelle détectée' });

    return (
        <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Interprétation automatique</p>
            {insights.map((insight, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border text-xs font-medium ${insight.color}`}>
                    <span>{insight.icon}</span>
                    <span>{insight.text}</span>
                </div>
            ))}
        </div>
    );
}

const getHistogramOption = (bins) => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#1f2937', borderColor: '#1f2937', textStyle: { color: '#fff', fontSize: 12 }, formatter: (params) => `<b>${params[0].name}</b><br/>Fréquence : <b>${params[0].value.toLocaleString('fr-FR')}</b>` },
    grid: { left: 55, right: 20, top: 15, bottom: 65 },
    xAxis: { type: 'category', data: bins.map(b => b.range), axisLabel: { rotate: 35, fontSize: 10, color: '#6b7280', formatter: (val) => { const num = parseFloat(val.split('-')[0]); return isNaN(num) ? val : num.toLocaleString('fr-FR', { maximumFractionDigits: 0 }); } }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v) => v.toLocaleString('fr-FR') }, splitLine: { lineStyle: { color: '#f3f4f6' } } },
    series: [{ type: 'bar', data: bins.map(b => b.count), itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#7c3aed' }, { offset: 1, color: '#c4b5fd' }] }, borderRadius: [4, 4, 0, 0] }, emphasis: { itemStyle: { color: '#6d28d9' } } }],
    dataZoom: [{ type: 'inside', start: 0, end: 100 }, { type: 'slider', height: 16, bottom: 5, borderColor: '#e5e7eb', fillerColor: 'rgba(124, 58, 237, 0.1)', handleStyle: { color: '#7c3aed' } }]
});

const getDiscreteOption = (values) => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#1f2937', borderColor: '#1f2937', textStyle: { color: '#fff' }, formatter: (params) => `Valeur <b>${params[0].name}</b><br/>Occurrences : <b>${params[0].value.toLocaleString('fr-FR')}</b><br/>Proportion : <b>${values[params[0].dataIndex].pct}%</b>` },
    grid: { left: 45, right: 20, top: 30, bottom: 40 },
    xAxis: { type: 'category', data: values.map(v => String(v.value)), axisLabel: { fontSize: 11, color: '#374151', fontWeight: 'bold' } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v) => v.toLocaleString('fr-FR') }, splitLine: { lineStyle: { color: '#f3f4f6' } } },
    series: [{ type: 'bar', data: values.map(v => v.count), itemStyle: { color: '#7c3aed', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: '#6b7280', formatter: (p) => `${p.value.toLocaleString('fr-FR')} (${values[p.dataIndex].pct}%)` } }]
});

const getCategoricalOption = (topValues) => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#1f2937', borderColor: '#1f2937', textStyle: { color: '#fff' }, formatter: (params) => `<b>${params[0].name}</b><br/>Occurrences : <b>${params[0].value.toLocaleString('fr-FR')}</b>` },
    grid: { left: 120, right: 60, top: 10, bottom: 30 },
    xAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v) => v.toLocaleString('fr-FR') }, splitLine: { lineStyle: { color: '#f3f4f6' } } },
    yAxis: { type: 'category', data: topValues.map(v => String(v.value)), axisLabel: { fontSize: 11, color: '#374151' } },
    series: [{ type: 'bar', data: topValues.map(v => v.count), itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#c4b5fd' }, { offset: 1, color: '#7c3aed' }] }, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', fontSize: 10, color: '#6b7280', formatter: (p) => p.value.toLocaleString('fr-FR') } }]
});

const getDateBarChartOption = (values) => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#1f2937', borderColor: '#1f2937', textStyle: { color: '#fff' }, formatter: (params) => `Période <b>${params[0].name}</b><br/>Occurrences : <b>${params[0].value.toLocaleString('fr-FR')}</b><br/>Proportion : <b>${values[params[0].dataIndex].pct}%</b>` },
    grid: { left: 45, right: 20, top: 30, bottom: 50 },
    xAxis: { type: 'category', data: values.map(v => String(v.value)), axisLabel: { fontSize: 10, color: '#6b7280', rotate: 45, fontWeight: 'medium' } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v) => v.toLocaleString('fr-FR') }, splitLine: { lineStyle: { color: '#f3f4f6' } } },
    series: [{ type: 'bar', data: values.map(v => v.count), itemStyle: { color: '#134e4a', borderRadius: [4, 4, 0, 0] }, emphasis: { itemStyle: { color: '#0f766e' } } }]
});

const getBooleanOption = (trueCount, falseCount, labelTrue = 'Vrai', labelFalse = 'Faux') => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: '#1f2937', borderColor: '#1f2937', textStyle: { color: '#fff' }, formatter: (p) => `<b>${p.name}</b><br/>${p.value.toLocaleString('fr-FR')} — ${p.percent}%` },
    legend: { bottom: 5, left: 'center', textStyle: { color: '#6b7280', fontSize: 11 } },
    series: [{ type: 'pie', radius: ['45%', '72%'], center: ['50%', '45%'], data: [{ value: trueCount, name: labelTrue, itemStyle: { color: '#7c3aed' } }, { value: falseCount, name: labelFalse, itemStyle: { color: '#e9d5ff' } }], label: { show: true, formatter: '{b}\n{d}%', fontSize: 11, color: '#374151' }, emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(124, 58, 237, 0.3)' } } }]
});

const StatisticsModal = ({ isOpen, onClose, columns }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedCol, setSelectedCol] = useState(null);
    const [isFullScreen, setIsFullScreen] = useState(false);

    useEffect(() => {
        if (isOpen && columns?.length > 0 && !selectedCol) {
            setSelectedCol(columns[0].field);
        }
        if (isOpen) {
            fetchStats();
        }
    }, [isOpen, columns]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await customFetch(`/api/database/stats`);
            if (res.ok) {
                const data = await res.json();
                setStats(data.stats);
            }
        } catch (err) {
            console.error("Failed to fetch stats", err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const currentColStats = stats && selectedCol ? stats[selectedCol] : null;
    const config = currentColStats ? TYPE_CONFIG[currentColStats.type] : null;

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 ${isFullScreen ? 'p-0' : 'p-4 md:p-6'}`}>
            <div className={`flex flex-col bg-white shadow-2xl transition-all duration-300 ease-in-out animate-in zoom-in-95 ${isFullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[85vh] rounded-3xl overflow-hidden'}`}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center">
                            <BarChart3 size={20} className="text-violet-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900">Statistiques</h2>
                            <p className="text-xs text-gray-400 font-medium">Calculées sur l'intégralité du dataset</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setIsFullScreen(!isFullScreen)} 
                            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
                            title={isFullScreen ? "Réduire" : "Plein écran"}
                        >
                            {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                        </button>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
                    {/* Sidebar */}
                    <div className="w-full md:w-52 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-100 overflow-y-auto custom-scrollbar bg-gray-50/50 py-3 h-40 md:h-auto">
                        {(columns || []).map(col => {
                            const statData = stats ? stats[col.field] : null;
                            const colType = statData ? statData.type : (col.is_numeric ? 'numeric' : 'categorical');
                            const colConfig = TYPE_CONFIG[colType] || TYPE_CONFIG.categorical;
                            const isActive = col.field === selectedCol;
                            return (
                                <button
                                    key={col.field}
                                    title={col.field}
                                    onClick={() => setSelectedCol(col.field)}
                                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all ${isActive ? 'bg-violet-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
                                >
                                    <span className="text-sm font-bold truncate flex-1 mr-2">{col.field}</span>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${isActive ? 'bg-white/20 text-white' : colConfig.color}`}>
                                        {colConfig.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-5 md:px-6 py-5 space-y-6 bg-white">
                        {loading ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-4">
                                <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Analyse du dataset complet...</p>
                            </div>
                        ) : currentColStats && config ? (
                            <>
                                {/* Column header */}
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-8 rounded-full ${config.accentColor}`} />
                                        <div>
                                            <h3 className="text-2xl font-black text-gray-900">{selectedCol}</h3>
                                            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-0.5">{config.description}</p>
                                        </div>
                                    </div>
                                    <span className={`sm:ml-auto px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider w-fit ${config.color}`}>
                                        {config.label}
                                    </span>
                                </div>

                                {/* Stats cards per type */}
                                {currentColStats.type === 'identifier' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <StatCard label="Total lignes" value={currentColStats.metrics.count} />
                                        <StatCard label="Min" value={currentColStats.metrics.min} />
                                        <StatCard label="Max" value={currentColStats.metrics.max} />
                                    </div>
                                )}

                                {currentColStats.type === 'numeric' && (
                                    <>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <StatCard label="Moyenne" value={currentColStats.metrics.mean} accent={true} />
                                            <StatCard label="Médiane" value={currentColStats.metrics.median} />
                                            <StatCard label="Mode" value={currentColStats.metrics.mode} />
                                            <StatCard label="Valeurs nulles" value={currentColStats.metrics.nulls} subtitle={`${currentColStats.metrics.null_pct}% du total`} accent={currentColStats.metrics.null_pct > 20} />
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <StatCard label="Min" value={currentColStats.metrics.min} />
                                            <StatCard label="Q1" value={currentColStats.metrics.q1} />
                                            <StatCard label="Q3" value={currentColStats.metrics.q3} />
                                            <StatCard label="Max" value={currentColStats.metrics.max} />
                                        </div>
                                    </>
                                )}

                                {currentColStats.type === 'categorical' && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <StatCard label="Total lignes" value={currentColStats.metrics.count} />
                                        <StatCard label="Valeurs uniques" value={currentColStats.metrics.uniques} accent={true} />
                                        <StatCard label="Mode" value={currentColStats.metrics.mode} />
                                        <StatCard label="Valeurs nulles" value={currentColStats.metrics.nulls} subtitle={`${currentColStats.metrics.null_pct}%`} accent={currentColStats.metrics.null_pct > 20} />
                                    </div>
                                )}

                                {currentColStats.type === 'boolean' && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <StatCard label="Total lignes" value={currentColStats.metrics.count} />
                                        <StatCard label={currentColStats.metrics.label_true || "Vrai"} value={currentColStats.metrics.true_count} subtitle={`${currentColStats.metrics.true_pct}%`} accent={true} />
                                        <StatCard label={currentColStats.metrics.label_false || "Faux"} value={currentColStats.metrics.false_count} subtitle={`${currentColStats.metrics.false_pct}%`} />
                                        <StatCard label="Valeurs nulles" value={currentColStats.metrics.nulls} />
                                    </div>
                                )}

                                {currentColStats.type === 'date' && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <StatCard label="Total lignes" value={currentColStats.metrics.count} />
                                        <StatCard label="Début de période" value={currentColStats.metrics.min_date} accent={true} />
                                        <StatCard label="Fin de période" value={currentColStats.metrics.max_date} />
                                        <StatCard label="Amplitude" value={currentColStats.metrics.duration_days} subtitle="jours" />
                                    </div>
                                )}

                                {/* Interpretation block */}
                                {currentColStats.type === 'numeric' && (
                                    <InterpretationBlock
                                        mean={currentColStats.metrics.mean}
                                        std={currentColStats.metrics.std}
                                        nullPct={currentColStats.metrics.null_pct}
                                        q1={currentColStats.metrics.q1}
                                        q3={currentColStats.metrics.q3}
                                    />
                                )}

                                {/* Chart Zone */}
                                <div className="mt-4 pb-6">
                                    {currentColStats.type === 'identifier' && (
                                        <div className="flex flex-col items-center justify-center h-48 rounded-2xl bg-gray-50 border border-gray-100 text-gray-400">
                                            <TrendingUp size={32} className="mb-3 opacity-30" />
                                            <p className="text-sm font-bold text-gray-500">Distribution uniforme</p>
                                            <p className="text-xs text-center mt-1 px-6 text-gray-400 max-w-xs">
                                                Cette colonne est un identifiant unique progressif. Un histogramme n'apporte aucune information analytique utile.
                                            </p>
                                        </div>
                                    )}
                                    {currentColStats.type === 'numeric' && currentColStats.distribution && (
                                        <div className="h-80 w-full">
                                            <ReactECharts 
                                                option={currentColStats.distribution.length > 0 && currentColStats.distribution[0].range 
                                                    ? getHistogramOption(currentColStats.distribution) 
                                                    : getDiscreteOption(currentColStats.distribution)} 
                                                style={{ height: '100%', width: '100%' }} 
                                            />
                                        </div>
                                    )}
                                    {currentColStats.type === 'categorical' && currentColStats.distribution && (
                                        <div className="h-[400px] w-full">
                                            <ReactECharts option={getCategoricalOption(currentColStats.distribution)} style={{ height: '100%', width: '100%' }} />
                                        </div>
                                    )}
                                    {currentColStats.type === 'boolean' && (
                                        <div className="h-80 w-full relative">
                                            <ReactECharts
                                                option={getBooleanOption(
                                                    currentColStats.metrics.true_count || 0,
                                                    currentColStats.metrics.false_count || 0,
                                                    currentColStats.metrics.label_true,
                                                    currentColStats.metrics.label_false
                                                )}
                                                style={{ height: '100%', width: '100%' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-300">
                                <Info className="w-12 h-12 mb-4" />
                                <p className="text-xs font-black uppercase tracking-widest">Aucune donnée statistique disponible</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── MAIN COMPONENT ────────────────────────────────

export default function Database({ addNotification }) {
    // ─── STATE ────────────────────────────────────────
    const [dataPreview, setDataPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeToolTab, setActiveToolTab] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isTableFullScreen, setIsTableFullScreen] = useState(false);
    const [pageSize, setPageSize] = useState(15);

    const [selectedAnomalyCols, setSelectedAnomalyCols] = useState([]);
    const [anomalyMethod, setAnomalyMethod] = useState('zscore');
    const [anomalyThreshold, setAnomalyThreshold] = useState(3.0);
    const [anomalyResult, setAnomalyResult] = useState(null);
    const [anomalyLoading, setAnomalyLoading] = useState(false);
    const [isAnomalyBannerExpanded, setIsAnomalyBannerExpanded] = useState(false);

    const [columnsInfo, setColumnsInfo] = useState([]);
    const [isSavingTypes, setIsSavingTypes] = useState(false);

    const [expressionError, setExpressionError] = useState('');
    const [expressionLoading, setExpressionLoading] = useState(false);
    const [mathWarning, setMathWarning] = useState(null); // { affected_rows, total_rows, message, payload }

    const [isPDFExportModalOpen, setIsPDFExportModalOpen] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

    const [pdfSelectedCols, setPdfSelectedCols] = useState([]);
    const [isPDFGenerating, setIsPDFGenerating] = useState(false);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth <= 1024);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const gridRef = useRef(null);

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            setIsMobile(width < 768);
            setIsTablet(width >= 768 && width <= 1024);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const styleSheet = document.createElement("style");
        styleSheet.type = "text/css";
        styleSheet.innerText = CUSTOM_STYLES;
        document.head.appendChild(styleSheet);
        return () => { document.head.removeChild(styleSheet); };
    }, []);

    useEffect(() => {
        fetchDataPreview();
    }, []);

    useEffect(() => {
        if (dataPreview) {
            fetchColumnsInfo();
        }
    }, [dataPreview]);

    const fetchDataPreview = async () => {
        setLoading(true);
        try {
            const res = await customFetch(`/api/database?full_data=true`);
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
            const res = await customFetch('/api/reports/columns');
            if (res.ok) {
                const data = await res.json();
                // Handle various API response structures
                const info = data.columns_info || data.columns || data.data || [];
                setColumnsInfo(info);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleTypeChange = (colName, newType) => {
        setColumnsInfo(prev => Array.isArray(prev) ? prev.map(col =>
            (col.name === colName || col.field === colName) ? { ...col, target_type: newType } : col
        ) : prev);
    };

    const handleOpenToolTab = (tab) => {
        if (activeToolTab === tab) {
            setActiveToolTab(null);
            return;
        }
        if (tab === 'types' && (!columnsInfo || columnsInfo.length === 0)) {
            fetchColumnsInfo();
        }
        setActiveToolTab(tab);
    };

    const handleAnalyzeAnomalies = async () => {
        if (selectedAnomalyCols.length === 0) {
            addNotification("Sélectionnez au moins une colonne.", "warning");
            return;
        }
        setAnomalyLoading(true);
        try {
            const res = await customFetch('/api/anomalies', {
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
                setIsAnomalyBannerExpanded(true);
                setActiveToolTab(null);
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
        if (!anomalyResult?.anomalies) return;
        const headers = ["ID", "Variables Impactées", "Type d'Anomalie", "Score"];
        const fields = ["id", "impacted_cols", "type", "score"];

        const csvRows = [
            headers.join(','),
            ...anomalyResult.anomalies.map(a => [
                a.id,
                `"${(a.impacted_cols || []).join('; ')}"`,
                a.type,
                a.score
            ].join(','))
        ];

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `datavera_anomalies_${new Date().toISOString().split('T')[0]}.csv`);
        link.click();
        addNotification("Export des anomalies réussi.", "success");
    };

    const saveColumnTypes = async () => {
        setIsSavingTypes(true);
        const modifications = columnsInfo
            .filter(c => c.target_type && c.target_type !== c.dtype)
            .map(c => ({ column: c.name, type: c.target_type }));

        if (modifications.length === 0) {
            setActiveToolTab(null);
            setIsSavingTypes(false);
            return;
        }

        try {
            const res = await customFetch('/api/database/recast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modifications }),
                credentials: 'include',
            });
            const result = await res.json();
            if (res.ok && result.status === 'success') {
                addNotification(result.message, "success");
                setActiveToolTab(null);
                fetchDataPreview();
            } else {
                addNotification(result.message || "Erreur de conversion", "error");
            }
        } catch (e) {
            addNotification("Impossible de contacter le serveur.", "error");
        } finally {
            setIsSavingTypes(false);
        }
    };

    const handleReset = () => {
        setSearchQuery('');
        setPageSize(15);
        setActiveToolTab(null);
        setAnomalyResult(null);
        if (gridRef.current?.api) {
            gridRef.current.api.setGridOption('quickFilterText', '');
            gridRef.current.api.paginationSetPageSize(15);
        }
        addNotification("Interface réinitialisée.", "info");
    };

    const handleAddExpression = async (name, expression, force = false) => {
        setExpressionLoading(true);
        setExpressionError('');
        try {
            const res = await customFetch('/api/database/expression', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, expression, force }),
                credentials: 'include',
            });
            const data = await res.json();
            if (res.ok) {
                addNotification("Variable expert créée avec succès !", "success");
                setActiveToolTab(null);
                setMathWarning(null);
                fetchDataPreview();
            } else if (data.status === 'warning' && data.error_type === 'MATH_WARNING') {
                setMathWarning({
                    affected_rows: data.affected_rows,
                    total_rows: data.total_rows,
                    message: data.message,
                    payload: { name, expression }
                });
            } else {
                setExpressionError(data.message || "Erreur lors de la création du champ.");
            }
        } catch (e) {
            setExpressionError("Impossible de contacter le serveur.");
        } finally {
            setExpressionLoading(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isTableFullScreen) {
                setIsTableFullScreen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isTableFullScreen]);

    const handleImport = async (file) => {
        if (!gridRef.current?.api) return;

        const rowData = [];
        gridRef.current.api.forEachNodeAfterFilter(node => {
            rowData.push(node.data);
        });
    };

    const handleExport = (format) => {
        if (!gridRef.current?.api) return;

        const rowData = [];
        gridRef.current.api.forEachNodeAfterFilter(node => {
            rowData.push(node.data);
        });

        if (rowData.length === 0) {
            addNotification("Aucune donnée à exporter.", "warning");
            return;
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `datavera_export_${dateStr}`;
        const columns = dataPreview?.columns || [];
        const headers = columns.map(col => col.title);
        const fields = columns.map(col => col.field);

        switch (format) {
            case 'csv':
                const csvRows = [
                    headers.join(','),
                    ...rowData.map(row =>
                        fields.map(f => {
                            const val = row[f] == null ? '' : String(row[f]);
                            return `"${val.replace(/"/g, '""')}"`;
                        }).join(',')
                    )
                ];
                const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", `${fileName}.csv`);
                link.click();
                addNotification("Export CSV généré avec succès.", "success");
                break;

            case 'xlsx':
                const ws = XLSX.utils.json_to_sheet(rowData.map(row => {
                    const mapped = {};
                    fields.forEach((f, i) => { mapped[headers[i]] = row[f]; });
                    return mapped;
                }));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Données");
                XLSX.writeFile(wb, `${fileName}.xlsx`);
                addNotification("Export Excel généré avec succès.", "success");
                break;

            case 'pdf':
                // For PDF, we open the selector first
                setPdfSelectedCols(fields); // Default to all selected
                setIsPDFExportModalOpen(true);
                break;
        }
    };

    const handleGeneratePDF = async () => {
        if (!gridRef.current?.api || !dataPreview?.columns || pdfSelectedCols.length === 0) {
            addNotification("Veuillez sélectionner au moins une colonne.", "warning");
            return;
        }
        setIsPDFGenerating(true);

        try {
            const rowData = [];
            gridRef.current.api.forEachNodeAfterFilter(node => {
                if (node.data) rowData.push(node.data);
            });

            if (rowData.length === 0) {
                addNotification("Aucune donnée à exporter.", "warning");
                setIsPDFGenerating(false);
                return;
            }

            const dateStr = new Date().toISOString().split('T')[0];
            const fileName = `datavera_export_${dateStr}`;
            const allColumns = dataPreview.columns;

            // Filter only selected columns
            const selectedColumnsMetadata = allColumns.filter(col => pdfSelectedCols.includes(col.field));
            const headers = selectedColumnsMetadata.map(col => col.title);
            const fields = selectedColumnsMetadata.map(col => col.field);

            const doc = new jsPDF('l', 'mm', 'a4');
            const pdfData = rowData.map(row => fields.map(f => row[f] == null ? '' : String(row[f])));

            doc.setFontSize(14);
            doc.text("Rapport Datavera", 14, 15);
            doc.setFontSize(8);
            doc.text(`Export réalisé le ${new Date().toLocaleString()} - ${rowData.length} lignes`, 14, 22);

            autoTable(doc, {
                head: [headers],
                body: pdfData,
                startY: 25,
                styles: { fontSize: pdfSelectedCols.length > 8 ? 6 : 7, cellPadding: 1 },
                headStyles: { fillColor: [88, 28, 135] },
                margin: { top: 25 },
            });
            doc.save(`${fileName}.pdf`);
            addNotification("Export PDF généré avec succès.", "success");
            setIsPDFExportModalOpen(false);
        } catch (e) {
            console.error(e);
            addNotification("Erreur lors de la génération du PDF.", "error");
        } finally {
            setIsPDFGenerating(false);
        }
    };

    const colDefs = useMemo(() => {
        if (!dataPreview?.columns) return [];
        return dataPreview.columns.map((col, idx) => ({
            field: col.field,
            headerName: col.title,
            sortable: true,
            filter: true,
            resizable: true,
            headerComponent: (props) => {
                const sType = col.semantic_type || (col.is_identifier ? 'identifier' : (col.is_numeric ? 'numeric' : 'categorical'));
                const config = TYPE_CONFIG[sType] || TYPE_CONFIG.categorical;
                return (
                    <div className="flex flex-col leading-none py-1">
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight truncate mb-0.5">
                            {props.displayName}
                        </span>
                        <span className={`text-[8px] font-extrabold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-md ${config.color}`}>
                            {config.label}
                        </span>
                    </div>
                );
            },
            width: col.is_identifier ? 100 : 180,
            pinned: (col.is_identifier || (isMobile && idx === 0)) ? 'left' : null,
            cellClass: (params) => {
                const classes = ["text-xs"];
                if (col.is_identifier) classes.push('text-gray-400 font-medium');
                else if (col.is_numeric) classes.push('justify-end font-mono text-gray-900');
                else classes.push('text-slate-600 font-medium');

                if (params.data && anomalyResult?.anomalous_ids?.includes(params.data.id) && selectedAnomalyCols.includes(col.field)) {
                    classes.push('!bg-amber-100 !text-amber-900 font-bold');
                }
                return classes.join(' ');
            },
            valueFormatter: (params) => {
                if (col.is_numeric && params.value != null) {
                    return params.value.toLocaleString();
                }
                return params.value;
            }
        }));
    }, [dataPreview, anomalyResult, selectedAnomalyCols, isMobile]);

    const rowClassRules = useMemo(() => ({
        'border-l-4 border-l-rose-500 bg-rose-50/20': (params) => {
            if (!anomalyResult?.anomalies) return false;
            return anomalyResult.anomalies.some(a => a.row_index === params.node.rowIndex);
        },
    }), [anomalyResult]);

    const onGridReady = (params) => {
        params.api.sizeColumnsToFit();
    };

    const defaultColDef = useMemo(() => ({
        sortable: true,
        filter: true,
        resizable: true,
        flex: 1,
        minWidth: 100,
    }), []);

    const handleDeleteData = async () => {
        try {
            const res = await customFetch('/clear_data', {
                method: 'POST',
                credentials: 'include'
            });
            if (res.ok) {
                setDataPreview(null);
                setShowDeleteConfirm(false);
                addNotification("Toutes les données ont été supprimées.", "success");
            }
        } catch (e) {
            addNotification("Erreur lors de la suppression.", "error");
        }
    };

    const onPaginationChanged = () => {
        if (gridRef.current?.api) {
            setCurrentPage((gridRef.current.api.paginationGetCurrentPage() || 0) + 1);
            setTotalPages(gridRef.current.api.paginationGetTotalPages() || 1);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-6 animate-modal text-center">
                    <div className="relative">
                        <div className="w-16 h-16 border-[6px] border-bank-50 border-t-bank-600 rounded-full animate-spin"></div>
                        <div className="absolute inset-4 bg-bank-600/10 rounded-full blur-xl animate-pulse"></div>
                    </div>
                    <p className="text-[11px] font-black text-bank-900 uppercase tracking-[0.3em] animate-pulse">Synchronisation</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden font-sans relative">
            <Header
                rowCount={dataPreview?.total_rows}
                loadedRows={dataPreview?.data?.length}
                activeToolTab={activeToolTab}
                onOpenToolTab={handleOpenToolTab}
                onOpenStats={() => setIsStatsModalOpen(true)}
                onReset={handleReset}
                onDelete={() => setShowDeleteConfirm(true)}
                onExport={handleExport}
            />
            
            <div className={`bg-white transition-all duration-300 ease-in-out ${isTableFullScreen ? 'fixed inset-0 z-[100] flex flex-col' : 'rounded-3xl shadow-2xl shadow-bank-100 overflow-hidden border border-bank-100'}`}>
                <Toolbar
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    pageSize={pageSize}
                    setPageSize={setPageSize}
                    totalRows={dataPreview?.total_rows}
                    loadedRows={dataPreview?.data?.length}
                    gridRef={gridRef}
                    isTableFullScreen={isTableFullScreen}
                    setIsTableFullScreen={setIsTableFullScreen}
                />

                <div className={`ag-theme-quartz ${isTableFullScreen ? 'flex-1' : 'h-[600px] border-b border-gray-100'}`}>
                    <AgGridReact
                        ref={gridRef}
                        rowData={dataPreview?.data}
                        columnDefs={colDefs}
                        defaultColDef={defaultColDef}
                        onGridReady={onGridReady}
                        pagination={true}
                        paginationPageSize={pageSize}
                        onPaginationChanged={onPaginationChanged}
                        quickFilterText={searchQuery}
                        rowClassRules={rowClassRules}
                    />
                </div>
            </div>

            {!isTableFullScreen && (
                <AnomalyBanner
                    anomalyResult={anomalyResult}
                    isExpanded={isAnomalyBannerExpanded}
                    setIsExpanded={setIsAnomalyBannerExpanded}
                    onExport={handleExportAnomalies}
                />
            )}

            {/* MODALS */}
            <VariablesModal
                isOpen={activeToolTab === 'types'}
                onClose={() => setActiveToolTab(null)}
                columnsInfo={columnsInfo}
                onTypeChange={handleTypeChange}
                onSave={saveColumnTypes}
                isSaving={isSavingTypes}
            />

            <AnomaliesModal
                isOpen={activeToolTab === 'anomalies'}
                onClose={() => setActiveToolTab(null)}
                columns={dataPreview?.columns}
                selectedCols={selectedAnomalyCols}
                onToggleCol={(field) => {
                    setSelectedAnomalyCols(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
                }}
                method={anomalyMethod}
                setMethod={setAnomalyMethod}
                threshold={anomalyThreshold}
                setThreshold={setAnomalyThreshold}
                onAnalyze={handleAnalyzeAnomalies}
                isLoading={anomalyLoading}
                hasResult={!!anomalyResult}
                onReopenBanner={() => { setIsAnomalyBannerExpanded(true); setActiveToolTab(null); }}
            />

            <CalculatedFieldsModal
                isOpen={activeToolTab === 'expression'}
                onClose={() => setActiveToolTab(null)}
                columns={dataPreview?.columns}
                onAdd={handleAddExpression}
                isLoading={expressionLoading}
                error={expressionError}
            />

            <PDFExportModal
                isOpen={isPDFExportModalOpen}
                onClose={() => setIsPDFExportModalOpen(false)}
                columns={dataPreview?.columns || []}
                selectedCols={pdfSelectedCols}
                onToggleCol={(field) => {
                    if (field === 'all') setPdfSelectedCols((dataPreview?.columns || []).map(c => c.field));
                    else if (field === 'none') setPdfSelectedCols([]);
                    else setPdfSelectedCols(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
                }}
                onGenerate={handleGeneratePDF}
                isLoading={isPDFGenerating}
            />

            <StatisticsModal
                isOpen={isStatsModalOpen}
                onClose={() => setIsStatsModalOpen(false)}
                columns={dataPreview?.columns || []}
            />

            <MathWarningModal
                isOpen={!!mathWarning}
                onClose={() => setMathWarning(null)}
                warning={mathWarning}
                onConfirm={handleAddExpression}
                isLoading={expressionLoading}
            />

            <Footer
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalRows={dataPreview?.total_rows}
                loadedRows={dataPreview?.data?.length}
                gridRef={gridRef}
                isMobile={isMobile}
            />

            {/* DELETE MODAL */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 text-center">
                    <div className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full p-10 animate-modal border border-white/20">
                        <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
                            <Trash2 className="w-10 h-10" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tight">Vider la Base ?</h3>
                        <p className="text-[13px] font-medium text-slate-500 leading-relaxed mb-10">Cette action est définitive.</p>
                        <div className="flex flex-col gap-3">
                            <button onClick={handleDeleteData} className="w-full py-5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all">Tout supprimer</button>
                            <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-5 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">Annuler</button>
                        </div>
                    </div>
                </div>
            )}

            {/* EMPTY STATE */}
            {!dataPreview && !loading && (
                <div className="absolute inset-0 bg-white z-[60] flex items-center justify-center pt-16 font-sans">
                    <div className="text-center space-y-8 max-w-sm px-6 animate-modal">
                        <div className="relative mx-auto w-32 h-32">
                            <div className="absolute inset-0 bg-bank-50 rounded-[2.5rem] rotate-6 animate-pulse"></div>
                            <div className="relative bg-white shadow-2xl rounded-[2.5rem] w-full h-full flex items-center justify-center text-bank-200">
                                <DatabaseIcon className="w-16 h-16" />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Prêt à explorer ?</h2>
                            <p className="text-[12px] font-black text-slate-400 leading-relaxed uppercase tracking-[0.2em]">Commencez par importer votre premier dataset.</p>
                        </div>
                        <Link to="/" className="inline-flex items-center gap-3 px-10 py-5 bg-bank-600 text-white rounded-[2rem] font-black text-[11px] uppercase tracking-widest shadow-2xl shadow-bank-200 hover:bg-bank-700 transition-all active:scale-95">
                            <Plus className="w-5 h-5" /> Importation Directe
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
