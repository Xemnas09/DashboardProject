import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    getFilteredRowModel,
    flexRender,
} from '@tanstack/react-table';
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
import { tableFromIPC } from 'apache-arrow';
import { customFetch } from '../features/auth/session';

const CUSTOM_STYLES = `
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

// ─── HELPERS ──────────────────────────────────────

const getTypeBadge = (dtype) => {
    const fallback = { label: dtype ? String(dtype).slice(0, 4).toUpperCase() : 'UNK', color: 'bg-gray-50 text-gray-400 border-gray-100' };
    if (!dtype) return fallback;
    const dt = String(dtype);
    if (dt.includes('Int')) return { label: 'INT', color: 'bg-blue-50 text-blue-400 border-blue-100' };
    if (dt.includes('Float')) return { label: 'DEC', color: 'bg-indigo-50 text-indigo-400 border-indigo-100' };
    if (dt.includes('String') || dt.includes('Utf8'))
        return { label: 'TXT', color: 'bg-amber-50 text-amber-400 border-amber-100' };
    if (dt.includes('Bool')) return { label: 'BOOL', color: 'bg-green-50 text-green-400 border-green-100' };
    if (dt.includes('Datetime')) return { label: 'TIME', color: 'bg-fuchsia-50 text-fuchsia-400 border-fuchsia-100' };
    if (dt.includes('Date')) return { label: 'DATE', color: 'bg-rose-50 text-rose-400 border-rose-100' };
    return fallback;
};

const TYPE_LABELS = {
    'Int64': 'Nombre Entier',
    'Float64': 'Décimal / Prix',
    'String': 'Texte / Catégorie',
    'Date': 'Date (Jour)',
    'Datetime': 'Horodatage (Temps)',
    'Boolean': 'Oui / Non'
};

// ─── STABLE SUB-COMPONENTS ────────────────────────

const Modal = ({ isOpen, onClose, title, icon: Icon, children, infoBlock, maxWidth = "max-w-2xl", noPadding = false }) => {
    const [isMaximized, setIsMaximized] = useState(false);
    if (!isOpen) return null;
    return (
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[200] flex items-center justify-center animate-in fade-in duration-200 ${isMaximized ? 'p-0' : 'p-4 md:p-12'}`}>
            <div className={`bg-white shadow-2xl w-full flex flex-col animate-modal relative overflow-hidden transition-all duration-300 ${isMaximized ? 'h-full rounded-none' : `rounded-[2rem] ${maxWidth} h-fit max-h-[90vh]`}`}>
                <div className="h-16 px-8 flex items-center justify-between border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-3">
                        {Icon && (
                            <div className="p-2 bg-bank-50 rounded-xl text-bank-600">
                                <Icon className="w-5 h-5" />
                            </div>
                        )}
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">{title}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsMaximized(!isMaximized)}
                            title={isMaximized ? "Réduire" : "Agrandir"}
                            className="p-2 hover:bg-gray-50 rounded-xl transition-all text-gray-400 hover:text-gray-600"
                        >
                            {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-rose-50 rounded-xl transition-all text-gray-400 hover:text-rose-500">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className={`flex-1 overflow-y-auto custom-scrollbar ${noPadding ? '' : 'p-8 pt-6'}`}>
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
        <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-gray-100 relative z-[60] shrink-0">
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

                            <div className="absolute top-full mt-2 right-0 md:right-auto md:left-0 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 opacity-0 invisible group-hover/tools:opacity-100 group-hover/tools:visible transition-all z-[70] animate-in fade-in slide-in-from-top-2">
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

const Toolbar = ({ searchQuery, setSearchQuery, pageSize, setPageSize, totalRows, loadedRows, onToggleFullscreen, isMaximized }) => (
    <div className="h-12 flex items-center justify-between px-6 bg-gray-50 border-b border-gray-200 relative z-20 shrink-0">
        <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    placeholder="Rechercher dans les lignes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-1.5 bg-white border border-gray-200 rounded-xl text-[11px] font-bold focus:ring-2 focus:ring-bank-500 transition-all placeholder:text-gray-300 shadow-sm"
                />
            </div>
            <div className="hidden lg:flex items-center gap-4 pl-4 border-l border-gray-200">
                <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                    <span>Afficher</span>
                    <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-bank-600 focus:ring-0 cursor-pointer font-black"
                    >
                        {[15, 50, 100, 500].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <span>Lignes</span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-4">
                {!isMaximized && (
                    <button
                        onClick={onToggleFullscreen}
                        title="Plein écran (Données)"
                        className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-600 transition-all border border-gray-100 bg-white shadow-sm flex items-center gap-1.5 px-3"
                    >
                        <Maximize2 size={12} />
                        <span className="text-[9px] font-black uppercase tracking-tighter">Plein écran</span>
                    </button>
                )}
            </div>
            <button className="md:hidden p-2 text-gray-400">
                <Menu className="w-5 h-5" />
            </button>
        </div>
    </div>
);

const FullscreenPortal = ({ children }) => {
    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col animate-in fade-in zoom-in duration-300">
            {children}
        </div>,
        document.body
    );
};

const Footer = ({ currentPage, totalPages, pageSize, totalRows, loadedRows, table, isMobile }) => {
    const startRow = totalRows > 0 ? (currentPage - 1) * pageSize + 1 : 0;
    const endRow = totalRows > 0 ? Math.min(currentPage * pageSize, loadedRows) : 0;

    return (
        <footer className="h-12 bg-white border-t border-gray-100 flex items-center justify-between px-6 z-10 shrink-0 select-none">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hidden sm:block">
                Page <span className="text-slate-900">{currentPage || 1}</span> sur <span className="text-slate-900">{totalPages || 1}</span>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => table?.setPageIndex(0)}
                    disabled={!table?.getCanPreviousPage?.()}
                    className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-20 transition-all text-slate-900"
                >
                    <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                    onClick={() => table?.previousPage()}
                    disabled={!table?.getCanPreviousPage?.()}
                    className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-20 transition-all text-slate-900"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[11px] font-black shadow-lg shadow-slate-200 min-w-[36px] text-center">
                    {currentPage || 1}
                </div>

                <button
                    onClick={() => table?.nextPage()}
                    disabled={!table?.getCanNextPage?.()}
                    className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-20 transition-all text-slate-900"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
                <button
                    onClick={() => table?.setPageIndex(table?.getPageCount?.() - 1)}
                    disabled={!table?.getCanNextPage?.()}
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
        <div className="absolute top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 transition-all duration-300 shadow-sm overflow-hidden">
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
                                <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Interprétation IA</h4>
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

const VariablesModal = ({ isOpen, onClose, columnsInfo, onTypeChange, onRecommendAI, onSave, isSaving }) => {
    if (!isOpen) return null;
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Variables & Types"
            icon={Settings2}
            infoBlock={{
                title: "Pourquoi définir les types de variables ?",
                content: "Lors de l'import, certaines colonnes peuvent être mal interprétées — une date lue comme du texte, un entier lu comme un décimal. Définir le bon type permet à l'IA d'analyser correctement vos données et aux graphiques d'être plus précis.",
                example: "si la colonne 'Age' est importée en STRING, les calculs de moyenne ou de distribution seront impossibles. En la passant en INT64, toutes les analyses numériques deviennent disponibles.",
                warning: "changer un type ne modifie pas vos données source, uniquement leur interprétation dans cet outil."
            }}
        >
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {Array.isArray(columnsInfo) && columnsInfo.length > 0 ? (
                    columnsInfo.map(col => (
                        <div key={col.name || col.field} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 group hover:border-bank-200 transition-all">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-black text-gray-900 uppercase tracking-tight truncate max-w-[140px]">{col.name || col.field || col.title}</span>
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Type {TYPE_LABELS[col.dtype] ? 'Défini' : 'Auto'}</span>
                            </div>
                            <select
                                value={col.target_type || col.dtype}
                                onChange={(e) => onTypeChange(col.name || col.field, e.target.value)}
                                className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-[10px] font-black text-bank-600 focus:ring-2 focus:ring-bank-500 cursor-pointer shadow-sm min-w-[120px]"
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

// ─── Method recommendation logic ─────────────────────────────────────────────
function getMethodRecommendation(columns) {
    const numCols = columns?.length || 0;
    if (numCols >= 5) {
        return { method: "isolation_forest", reason: `${numCols} colonnes numériques — Isolation Forest analyse les combinaisons anormales entre colonnes.` };
    }
    return { method: "iqr", reason: "Peu de colonnes — IQR est robuste et ne fait aucune hypothèse sur la distribution." };
}

// ─── AnomalyConfigModal ──────────────────────────────────────────────────────
const METHODS_CONFIG = [
    { id: 'iqr', label: 'IQR', sublabel: 'Interquartile Range', description: 'Robuste, aucune hypothèse sur la distribution. Idéal pour données financières.' },
    { id: 'zscore', label: 'Z-Score', sublabel: 'Écart-type', description: 'Rapide et interprétable. Fonctionne mieux sur distributions symétriques.' },
    { id: 'isolation_forest', label: 'Isolation Forest', sublabel: 'Machine Learning', description: 'Détecte des patterns complexes multivariés. Recommandé pour données à nombreuses colonnes.' },
];

const AnomalyConfigModal = ({ isOpen, onClose, columns, selectedCols, onToggleCol, method, setMethod, sensitivity, setSensitivity, onAnalyze, isLoading }) => {
    if (!isOpen) return null;
    const numericCols = columns?.filter(c => c.type === 'number' || c?.isNumeric) || columns || [];
    const recommendation = getMethodRecommendation(numericCols);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Analyse des Anomalies" icon={ShieldCheck} maxWidth="max-w-4xl">
            <div className="space-y-6">
                {/* Recommendation banner */}
                <div className="flex items-start gap-3 p-4 bg-violet-50 border border-violet-100 rounded-2xl">
                    <Sparkles className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-black text-violet-800 mb-0.5">Recommandation automatique</p>
                        <p className="text-[11px] text-violet-600 font-medium leading-relaxed">{recommendation.reason}</p>
                    </div>
                </div>

                {/* Method cards */}
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Méthode de Détection</p>
                    <div className="grid grid-cols-3 gap-3">
                        {METHODS_CONFIG.map(m => (
                            <button key={m.id} onClick={() => setMethod(m.id)}
                                className={`relative p-4 rounded-2xl border-2 text-left transition-all ${method === m.id ? 'border-bank-500 bg-bank-50/50 shadow-md' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                                {recommendation.method === m.id && (
                                    <span className="absolute top-2 right-2 text-[9px] font-black px-2 py-0.5 bg-bank-100 text-bank-700 rounded-full uppercase tracking-wider">Recommandé</span>
                                )}
                                <p className="font-black text-sm text-gray-900">{m.label}</p>
                                <p className="text-[10px] font-bold text-gray-400 mb-2">{m.sublabel}</p>
                                <p className="text-xs text-gray-500 leading-relaxed">{m.description}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sensitivity */}
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Sensibilité</p>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { value: 'strict', label: 'Strict', hint: 'Peu d\'anomalies, haute précision' },
                            { value: 'standard', label: 'Standard', hint: 'Équilibre précision / rappel' },
                            { value: 'loose', label: 'Large', hint: 'Plus d\'anomalies, exploration' },
                        ].map(s => (
                            <button key={s.value} onClick={() => setSensitivity(s.value)}
                                className={`p-3 rounded-xl border-2 text-left transition-all ${sensitivity === s.value ? 'border-bank-500 bg-bank-50/30' : 'border-gray-100 hover:border-gray-200'}`}>
                                <p className="text-xs font-black text-gray-900">{s.label}</p>
                                <p className="text-[10px] text-gray-400 font-medium">{s.hint}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Columns */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Colonnes à analyser ({selectedCols?.length || 0})</p>
                        <div className="flex gap-2">
                            <button onClick={() => (columns || []).forEach(c => !selectedCols.includes(c.field) && onToggleCol(c.field))}
                                className="text-[9px] font-black text-bank-600 bg-bank-50 px-2 py-1 rounded-lg hover:bg-bank-100 transition-all uppercase">Tout</button>
                            <button onClick={() => selectedCols.forEach(c => onToggleCol(c))}
                                className="text-[9px] font-black text-gray-400 bg-gray-50 px-2 py-1 rounded-lg hover:bg-gray-100 transition-all uppercase">Aucun</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                        {(columns || []).map(col => (
                            <button key={col.field} onClick={() => onToggleCol(col.field)}
                                className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-left ${selectedCols?.includes(col.field) ? 'border-bank-500 bg-bank-50/30' : 'border-gray-100 bg-white hover:bg-gray-50 text-gray-400'}`}>
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${selectedCols?.includes(col.field) ? 'bg-bank-500 border-bank-500 text-white' : 'border-gray-300'}`}>
                                    {selectedCols?.includes(col.field) && <Check className="w-2.5 h-2.5" />}
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-tight truncate">{col.title}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Action */}
                <button onClick={onAnalyze} disabled={isLoading || (selectedCols?.length || 0) === 0}
                    className="w-full py-4 bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 disabled:opacity-20 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl">
                    {isLoading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <Sparkles className="w-4 h-4" />}
                    {isLoading ? 'Analyse en cours...' : 'Lancer l\'analyse'}
                </button>
            </div>
        </Modal>
    );
};

// ─── AnomalyResultsModal ────────────────────────────────────────────────────
const AnomalyResultsModal = ({ isOpen, onClose, results, onHighlightInTable, onExportCSV }) => {
    const [severityFilter, setSeverityFilter] = useState('Tous');
    const [interpretation, setInterpretation] = useState(null);
    const [interpretationLoading, setInterpretationLoading] = useState(false);

    // Load LLM interpretation asynchronously
    useEffect(() => {
        if (!results || !isOpen) return;
        setInterpretationLoading(true);
        setInterpretation(null);
        customFetch('/api/anomalies/interpret', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method_label: results.method_label || results.method,
                total_rows: results.total_rows,
                anomaly_count: results.anomaly_count,
                anomaly_rate: results.anomaly_rate,
                top_columns: results.summary_stats?.top_columns || [],
                by_severity: results.summary_stats?.by_severity || {},
                col_count: results.columns_analyzed?.length || 0,
            }),
        })
            .then(r => r.json())
            .then(d => setInterpretation(d.interpretation))
            .catch(() => setInterpretation("Analyse contextuelle indisponible."))
            .finally(() => setInterpretationLoading(false));
    }, [results, isOpen]);

    if (!isOpen || !results) return null;

    const { anomalies = [], anomaly_count, anomaly_rate, severity, severity_label, method_label } = results;
    const bySeverity = results.summary_stats?.by_severity || { high: 0, moderate: 0, low: 0 };

    const FILTER_MAP = { 'Tous': null, 'Critiques': 'high', 'Modérées': 'moderate', 'Faibles': 'low' };
    const filteredAnomalies = severityFilter === 'Tous' ? anomalies : anomalies.filter(a => a.severity === FILTER_MAP[severityFilter]);
    const displayAnomalies = filteredAnomalies.slice(0, 50);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Résultats d'Analyse" icon={ShieldCheck} maxWidth="max-w-5xl" noPadding>
            {/* Bloc A — Dark header */}
            <div className="bg-gray-950 p-6 rounded-t-sm">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${severity === 'high' ? 'bg-red-500/20 border border-red-500/30' : severity === 'moderate' ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-emerald-500/20 border border-emerald-500/30'}`}>
                            <AlertTriangle className={`w-7 h-7 ${severity === 'high' ? 'text-red-400' : severity === 'moderate' ? 'text-amber-400' : 'text-emerald-400'}`} />
                        </div>
                        <div>
                            <p className="text-white font-black text-2xl">{anomaly_count?.toLocaleString('fr-FR')} anomalies</p>
                            <p className="text-white/40 text-xs font-medium">{(anomaly_rate * 100).toFixed(2)}% du dataset · méthode {method_label}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {[
                            { key: 'high', label: 'Critiques', color: 'bg-red-500/20 text-red-400' },
                            { key: 'moderate', label: 'Modérées', color: 'bg-amber-500/20 text-amber-400' },
                            { key: 'low', label: 'Faibles', color: 'bg-gray-500/20 text-gray-400' },
                        ].map(({ key, label, color }) => (
                            <div key={key} className={`px-3 py-2 rounded-xl ${color} text-center min-w-[70px]`}>
                                <p className="text-lg font-black">{bySeverity[key] || 0}</p>
                                <p className="text-[10px] font-bold uppercase tracking-wider">{label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bloc B — LLM interpretation */}
            <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Analyse contextuelle</p>
                        {interpretationLoading ? (
                            <div className="space-y-2">
                                {[100, 80, 60].map(w => <div key={w} className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${w}%` }} />)}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-600 leading-relaxed font-medium">{interpretation}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Bloc C — Table */}
            <div className="px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Détail des anomalies</p>
                    <div className="flex gap-1">
                        {['Tous', 'Critiques', 'Modérées', 'Faibles'].map(f => (
                            <button key={f} onClick={() => setSeverityFilter(f)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${severityFilter === f ? 'bg-bank-600 text-white' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">Sévérité</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">Ligne #</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">Colonnes impliquées</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">Déviation</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">Valeurs</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {displayAnomalies.map((anomaly, i) => (
                                <tr key={i}
                                    className={`hover:bg-gray-50/50 transition-colors ${anomaly.severity === 'high' ? 'border-l-2 border-l-red-400' : anomaly.severity === 'moderate' ? 'border-l-2 border-l-amber-400' : ''}`}>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black
                                            ${anomaly.severity === 'high' ? 'bg-red-50 text-red-600 border border-red-100'
                                            : anomaly.severity === 'moderate' ? 'bg-amber-50 text-amber-600 border border-amber-100'
                                            : 'bg-gray-50 text-gray-500 border border-gray-100'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${anomaly.severity === 'high' ? 'bg-red-500' : anomaly.severity === 'moderate' ? 'bg-amber-500' : 'bg-gray-400'}`} />
                                            {anomaly.severity_label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3"><span className="font-mono text-xs text-gray-400 font-bold">#{anomaly.row_index + 1}</span></td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                            {(anomaly.contributing_columns || []).map(col => (
                                                <span key={col} className="px-2 py-0.5 bg-violet-50 border border-violet-100 text-violet-700 text-[10px] font-black rounded-md">{col}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3"><span className="text-xs font-black text-gray-700">{anomaly.score_label}</span></td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-0.5">
                                            {(anomaly.contributing_columns || []).map(col => (
                                                <span key={col} className="text-xs text-gray-500 font-medium">
                                                    <span className="text-gray-400">{col}: </span>
                                                    <span className="font-bold text-gray-700">{anomaly.values?.[col]}</span>
                                                    {anomaly.normal_ranges?.[col]?.median != null && (
                                                        <span className="text-gray-400 font-normal"> (méd. {anomaly.normal_ranges[col].median?.toLocaleString('fr-FR')})</span>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {anomaly_count > 50 && (
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-center">
                            <p className="text-xs text-gray-400 font-medium">Affichage des 50 anomalies les plus sévères sur {anomaly_count}. Exportez pour voir tout.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Bloc D — Actions */}
            <div className="px-6 pb-6 flex gap-3 border-t border-gray-100 pt-4">
                <button onClick={onExportCSV}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-black text-gray-600 hover:border-bank-300 hover:text-bank-600 transition-all">
                    <Download size={14} /> Exporter CSV ({anomaly_count} lignes)
                </button>
                <button onClick={onHighlightInTable}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-black text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-all">
                    <Search size={14} /> Voir dans la table
                </button>
                <button onClick={onClose}
                    className="ml-auto px-5 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl font-black text-xs shadow-lg hover:-translate-y-0.5 transition-all">
                    Fermer
                </button>
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
    continuous: {
        label: 'NUM',
        color: 'bg-blue-100 text-blue-700',
        accentColor: 'bg-blue-400',
        description: 'Variable numérique continue'
    },
    discrete: {
        label: 'DISC',
        color: 'bg-violet-100 text-violet-700',
        accentColor: 'bg-violet-400',
        description: 'Variable numérique discrète'
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
        color: 'bg-rose-100 text-rose-700',
        accentColor: 'bg-rose-400',
        description: 'Variable temporelle (Date)'
    },
    datetime: {
        label: 'TIME',
        color: 'bg-fuchsia-100 text-fuchsia-700',
        accentColor: 'bg-fuchsia-400',
        description: 'Horodatage avec précision temporelle'
    }
};

const formatNumber = (val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val !== 'number') return String(val);
    return val.toLocaleString('fr-FR');
};

const nFormatter = (num, digits = 1) => {
    const lookup = [
        { value: 1, symbol: "" },
        { value: 1e3, symbol: "k" },
        { value: 1e6, symbol: "M" },
        { value: 1e9, symbol: "G" }
    ];
    const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    var item = lookup.slice().reverse().find(function (item) {
        return num >= item.value;
    });
    return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0";
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

const getHistogramOption = (bins) => {
    const isCrowded = bins.length > 15;
    const topIndices = isCrowded ? bins.map((b, i) => ({ count: b.count, i })).sort((a, b) => b.count - a.count).slice(0, 10).map(x => x.i) : [];

    return {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(31, 41, 55, 0.95)',
            borderColor: '#374151',
            borderRadius: 12,
            textStyle: { color: '#fff', fontSize: 11, fontWeight: '600' },
            formatter: (params) => `
                <div style="padding: 4px;">
                    <div style="color: #9ca3af; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">Plage de données</div>
                    <div style="font-size: 13px; font-weight: 900; color: #fff; margin-bottom: 8px;">${params[0].name}</div>
                    <div style="height: 1px; background: rgba(255,255,255,0.1); margin-bottom: 8px;"></div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #7c3aed;"></span>
                        <span style="color: #d1d5db;">Fréquence :</span>
                        <span style="font-weight: 900; color: #fff;">${params[0].value.toLocaleString('fr-FR')}</span>
                    </div>
                </div>
            `
        },
        grid: { left: 55, right: 20, top: 25, bottom: isCrowded ? 80 : 65 },
        xAxis: {
            type: 'category',
            data: bins.map(b => b.value),
            axisLabel: {
                rotate: 35,
                fontSize: 10,
                color: '#6b7280',
                formatter: (val) => {
                    const num = parseFloat(val.split('-')[0]);
                    return isNaN(num) ? val : nFormatter(num);
                }
            },
            axisLine: { lineStyle: { color: '#e5e7eb' } }
        },
        yAxis: {
            type: 'value',
            axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v) => nFormatter(v) },
            splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }
        },
        series: [{
            type: 'bar',
            data: bins.map(b => b.count),
            itemStyle: {
                color: {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [{ offset: 0, color: '#7c3aed' }, { offset: 1, color: '#c4b5fd' }]
                },
                borderRadius: [6, 6, 0, 0]
            },
            label: {
                show: true,
                position: 'top',
                rotate: isCrowded ? 45 : 0,
                fontSize: 9,
                color: '#4b5563',
                fontWeight: 'bold',
                fontFamily: 'Inter',
                distance: 10,
                formatter: (p) => {
                    if (isCrowded && !topIndices.includes(p.dataIndex)) return '';
                    return nFormatter(p.value);
                }
            },
            labelLayout: { hideOverlap: true },
            emphasis: { itemStyle: { color: '#6d28d9', shadowBlur: 10, shadowColor: 'rgba(124, 58, 237, 0.4)' } }
        }],
        dataZoom: [
            { type: 'inside', start: 0, end: bins.length > 25 ? 40 : 100 },
            { type: 'slider', height: 16, bottom: 5, borderColor: '#e5e7eb', fillerColor: 'rgba(124, 58, 237, 0.1)', handleStyle: { color: '#7c3aed' } }
        ]
    };
};

const getDiscreteOption = (values) => {
    const isCrowded = values.length > 12;
    const topIndices = isCrowded ? values.map((v, i) => ({ count: v.count, i })).sort((a, b) => b.count - a.count).slice(0, 10).map(x => x.i) : [];

    return ({
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(31, 41, 55, 0.95)',
            borderColor: '#374151',
            borderRadius: 12,
            textStyle: { color: '#fff' },
            formatter: (params) => `
                <div style="padding: 4px;">
                    <div style="font-size: 13px; font-weight: 900; color: #fff; margin-bottom: 8px;">${params[0].name}</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; justify-between; gap: 12px;">
                            <span style="color: #9ca3af; font-size: 10px; text-transform: uppercase;">Occurrences</span>
                            <span style="font-weight: 900; color: #fff; margin-left: auto;">${params[0].value.toLocaleString('fr-FR')}</span>
                        </div>
                        <div style="display: flex; justify-between; gap: 12px;">
                            <span style="color: #9ca3af; font-size: 10px; text-transform: uppercase;">Proportion</span>
                            <span style="font-weight: 900; color: #a5b4fc; margin-left: auto;">${values[params[0].dataIndex].pct}%</span>
                        </div>
                    </div>
                </div>
            `
        },
        grid: { left: 55, right: 20, top: 30, bottom: isCrowded ? 60 : 40 },
        xAxis: { type: 'category', data: values.map(v => String(v.value)), axisLabel: { rotate: isCrowded ? 45 : 0, fontSize: 10, color: '#374151', fontWeight: 'bold' } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v) => nFormatter(v) }, splitLine: { lineStyle: { color: '#f3f4f6' } } },
        series: [{
            type: 'bar',
            data: values.map(v => v.count),
            itemStyle: { color: '#7c3aed', borderRadius: [6, 6, 0, 0] },
            label: {
                show: true,
                position: 'top',
                rotate: isCrowded ? 45 : 0,
                fontSize: 9,
                color: '#6b7280',
                distance: 10,
                formatter: (p) => {
                    if (isCrowded && !topIndices.includes(p.dataIndex)) return '';
                    return `${nFormatter(p.value)} (${values[p.dataIndex].pct}%)`;
                }
            },
            labelLayout: { hideOverlap: true }
        }],
        dataZoom: values.length > 20 ? [
            { type: 'inside', start: 0, end: 50 },
            { type: 'slider', height: 16, bottom: 5, borderColor: '#e5e7eb', fillerColor: 'rgba(124, 58, 237, 0.1)', handleStyle: { color: '#7c3aed' } }
        ] : []
    });
};

const getCategoricalOption = (topValues) => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#1f2937', borderColor: '#1f2937', textStyle: { color: '#fff' }, formatter: (params) => `<b>${params[0].name}</b><br/>Occurrences : <b>${params[0].value.toLocaleString('fr-FR')}</b>` },
    grid: { left: 120, right: 60, top: 10, bottom: 30 },
    xAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v) => v.toLocaleString('fr-FR') }, splitLine: { lineStyle: { color: '#f3f4f6' } } },
    yAxis: { type: 'category', data: topValues.map(v => String(v.value)), axisLabel: { fontSize: 11, color: '#374151' } },
    series: [{ type: 'bar', data: topValues.map(v => v.count), itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#c4b5fd' }, { offset: 1, color: '#7c3aed' }] }, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', fontSize: 10, color: '#6b7280', formatter: (p) => p.value.toLocaleString('fr-FR') } }]
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
    const [isMaximized, setIsMaximized] = useState(false);

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
        <div className={`fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 ${isMaximized ? 'p-0' : 'p-4 md:p-6'}`}>
            <div className={`flex flex-col bg-white shadow-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 ${isMaximized ? 'h-full rounded-none' : 'max-w-5xl h-[85vh] rounded-3xl'}`}>
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
                            onClick={() => setIsMaximized(!isMaximized)}
                            title={isMaximized ? "Réduire" : "Agrandir"}
                            className="p-2 rounded-xl border border-transparent hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
                        >
                            {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all">
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
                            const colType = statData ? statData.type : (col.is_numeric ? 'continuous' : 'categorical');
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

                                {currentColStats.type === 'continuous' && (
                                    <>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <StatCard label="Moyenne" value={currentColStats.metrics.mean} accent={true} />
                                            <StatCard label="Médiane" value={currentColStats.metrics.median} />
                                            <StatCard label="Écart-type" value={currentColStats.metrics.std} />
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

                                {(currentColStats.type === 'discrete' || currentColStats.type === 'categorical') && (
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

                                {(currentColStats.type === 'date' || currentColStats.type === 'datetime') && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <StatCard label="Date Début" value={currentColStats.metrics.min} accent={true} />
                                        <StatCard label="Date Fin" value={currentColStats.metrics.max} accent={true} />
                                        <StatCard label="Amplitude" value={currentColStats.metrics.duration || "N/A"} />
                                    </div>
                                )}

                                {/* Interpretation block */}
                                {(currentColStats.type === 'continuous' || currentColStats.type === 'discrete') && (
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
                                    {currentColStats.type === 'continuous' && currentColStats.distribution && (
                                        <div className="h-80 w-full">
                                            <ReactECharts option={getHistogramOption(currentColStats.distribution)} style={{ height: '100%', width: '100%' }} />
                                        </div>
                                    )}
                                    {currentColStats.type === 'discrete' && currentColStats.distribution && (
                                        <div className="h-80 w-full">
                                            <ReactECharts option={getDiscreteOption(currentColStats.distribution)} style={{ height: '100%', width: '100%' }} />
                                        </div>
                                    )}
                                    {currentColStats.type === 'categorical' && currentColStats.distribution && (
                                        <div className="h-[400px] w-full">
                                            <ReactECharts option={getCategoricalOption(currentColStats.distribution)} style={{ height: '100%', width: '100%' }} />
                                        </div>
                                    )}
                                    {(currentColStats.type === 'date' || currentColStats.type === 'datetime') && currentColStats.distribution && (
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
    const [pageSize, setPageSize] = useState(15);

    const [sorting, setSorting] = useState([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [pagination, setPagination] = useState({
        pageIndex: 0,
        pageSize: pageSize
    });

    const [selectedAnomalyCols, setSelectedAnomalyCols] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setGlobalFilter(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Sync existing pageSize state
    useEffect(() => {
        setPagination(prev => ({ ...prev, pageSize }));
    }, [pageSize]);

    const [anomalyMethod, setAnomalyMethod] = useState('iqr');
    const [anomalySensitivity, setAnomalySensitivity] = useState('standard');
    const [isTableMaximized, setIsTableMaximized] = useState(false);
    const [anomalyResult, setAnomalyResult] = useState(null);
    const [anomalyLoading, setAnomalyLoading] = useState(false);
    const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
    const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);

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

    // gridRef removed as per TanStack migration

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

    // ─── TANSTACK TABLE LOGIC ────────────────────────

    const columns = useMemo(() => {
        if (!dataPreview?.columns || !dataPreview?.columns_info) return [];

        let firstIdFound = false;

        return dataPreview.columns.map((col) => {
            const info = dataPreview.columns_info.find(i => i.name === col.field);
            const isNumeric = info?.is_numeric;
            const isCategorical = info?.dtype === 'String' || info?.dtype === 'Utf8';
            let isId = info?.is_identifier === true;

            if (isId) {
                if (firstIdFound) {
                    isId = false; // Only first ID is pinned
                } else {
                    firstIdFound = true;
                }
            }


            let isLabelLike = false;
            if (isCategorical && dataPreview.data && dataPreview.data.length > 0) {
                // Optimization: sampled label-like check (first 50 rows only)
                const samples = dataPreview.data.slice(0, 50).map(r => String(r[col.field] || ''));
                const distinctSamples = new Set(samples).size;
                isLabelLike = distinctSamples < 15;
            }

            return {
                id: col.field,
                accessorKey: col.field,
                meta: { isNumeric, isLabelLike, isId, dtype: info?.dtype, typeBadge: getTypeBadge(info?.dtype) },

                header: ({ column }) => {
                    const badge = getTypeBadge(info?.dtype);
                    const sorted = column.getIsSorted();
                    return (
                        <div
                            onClick={column.getToggleSortingHandler()}
                            className={`flex flex-col gap-0.5 cursor-pointer select-none group transition-colors ${isNumeric ? 'items-end' : 'items-start'}`}
                        >
                            <div className="flex items-center gap-1 w-full overflow-hidden">
                                <span className="font-black text-[9px] uppercase tracking-tighter text-gray-500 group-hover:text-gray-900 transition-colors truncate">
                                    {col.title}
                                </span>
                                <span className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {sorted === 'asc' && <span className="text-bank-600 text-[9px] font-bold">↑</span>}
                                    {sorted === 'desc' && <span className="text-bank-600 text-[9px] font-bold">↓</span>}
                                    {!sorted && <span className="text-gray-200 text-[9px]">↕</span>}
                                </span>
                            </div>
                            {badge && (
                                <span className={`text-[7px] font-black px-1 py-0 rounded border leading-[1.2] tracking-tighter shadow-sm flex-shrink-0 max-w-fit ${badge.color}`}>
                                    {badge.label}
                                </span>
                            )}
                        </div>
                    );
                },

                cell: ({ getValue }) => {
                    const value = getValue();

                    // Better boolean display for 0/1
                    if (typeof value === 'boolean') {
                        const boolValue = value;
                        const isOriginalNumeric = info?.dtype?.includes('int') || info?.dtype?.includes('float');
                        const displayValue = isOriginalNumeric ? (boolValue ? '1' : '0') : String(boolValue);
                        return <span className="text-[11px] font-bold text-gray-700">{displayValue}</span>;
                    }

                    if (value === null || value === undefined || value === '')
                        return <span className="text-gray-200 text-xs italic font-medium">—</span>;

                    if (isId)
                        return (
                            <span className="text-gray-300 font-mono text-xs font-bold tabular-nums">
                                {String(value)}
                            </span>
                        );

                    if (isLabelLike) {
                        const str = String(value);
                        let hash = 0;
                        for (let i = 0; i < str.length; i++)
                            hash = str.charCodeAt(i) + ((hash << 5) - hash);
                        const colorClasses = [
                            'bg-indigo-50 text-indigo-600 border-indigo-100',
                            'bg-emerald-50 text-emerald-600 border-emerald-100',
                            'bg-slate-50 text-slate-600 border-slate-200',
                            'bg-rose-50 text-rose-600 border-rose-100',
                            'bg-amber-50 text-amber-600 border-amber-100',
                            'bg-violet-50 text-violet-600 border-violet-100',
                        ];
                        const colorClass = colorClasses[Math.abs(hash) % colorClasses.length];
                        return (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${colorClass}`}>
                                {str}
                            </span>
                        );
                    }

                    if (isNumeric) {
                        const num = typeof value === 'number' ? value : parseFloat(value);
                        const formatted = isNaN(num)
                            ? String(value)
                            : num.toLocaleString('fr-FR', { maximumFractionDigits: 4 });
                        return (
                            <span className="font-mono text-gray-800 font-semibold tabular-nums text-xs tracking-tight">
                                {formatted}
                            </span>
                        );
                    }

                    return <span className="text-gray-600 text-xs font-medium">{String(value)}</span>;
                }
            };
        });
    }, [dataPreview]);

    const anomalyIndices = useMemo(() => {
        if (!anomalyResult?.anomalies) return new Set();
        return new Set(anomalyResult.anomalies.map(a => a.row_index));
    }, [anomalyResult]);

    const tableData = useMemo(() => {
        if (!dataPreview?.data) return [];
        if (showAnomaliesOnly && anomalyResult?.anomalies) {
            return dataPreview.data.filter((_, idx) => anomalyIndices.has(idx));
        }
        return dataPreview.data;
    }, [dataPreview, showAnomaliesOnly, anomalyIndices]);

    const table = useReactTable({
        data: tableData,
        columns,
        state: { sorting, globalFilter, pagination },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        manualPagination: false,
    });

    const fetchDataPreview = async () => {
        setLoading(true);
        try {
            // --- GAME CHANGER: Try Apache Arrow (Binary) First ---
            let arrowSuccess = false;
            try {
                const arrowRes = await customFetch('/api/database/arrow');
                if (arrowRes.ok) {
                    console.time("Arrow-Engine-Parse");
                    const buffer = await arrowRes.arrayBuffer();
                    const table = tableFromIPC(new Uint8Array(buffer));

                    // Fetch basic metadata (columns info) which is small
                    const metaRes = await customFetch('/api/database');
                    const metaData = await metaRes.json();

                    if (metaData.status === 'success' && metaData.data_preview) {
                        const jsonData = [];
                        // Extract data from Arrow table
                        for (let i = 0; i < table.numRows; i++) {
                            const row = table.get(i);
                            jsonData.push(row ? row.toJSON() : {});
                        }

                        setDataPreview({
                            ...metaData.data_preview,
                            data: jsonData
                        });
                        console.timeEnd("Arrow-Engine-Parse");
                        console.log(`%c[Arrow-Engine] %cLoaded ${table.numRows} rows instantly`, "color: #10b981; font-weight: bold", "color: #6b7280");
                        arrowSuccess = true;
                    }
                }
            } catch (arrowErr) {
                console.warn("[Arrow-Engine] Failed to load binary data, falling back to JSON:", arrowErr);
                arrowSuccess = false;
            }

            if (arrowSuccess) return;

            // --- FALLBACK: Standard JSON ---
            const res = await customFetch(`/api/database?full_data=true`);
            if (res.ok) {
                const data = await res.json();
                setDataPreview(data.data_preview);
            }
        } catch (e) {
            console.error("[Database] Critical fetch error:", e);
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
            const res = await customFetch('/api/anomalies/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    columns: selectedAnomalyCols,
                    method: anomalyMethod,
                    sensitivity: anomalySensitivity,
                }),
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                setAnomalyResult(data);
                setActiveToolTab(null);
                setIsResultsModalOpen(true);
                addNotification(`${data.anomaly_count} anomalies détectées via ${data.method_label}.`, data.anomaly_rate > 0.05 ? "error" : "success");
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
        const headers = ["Ligne", "Sévérité", "Score", "Colonnes impliquées", "Déviation"];
        const csvRows = [
            headers.join(','),
            ...anomalyResult.anomalies.map(a => [
                a.row_index + 1,
                a.severity_label,
                a.score,
                `"${(a.contributing_columns || []).join('; ')}"`,
                `"${a.score_label}"`
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

    const handleHighlightInTable = () => {
        setShowAnomaliesOnly(true);
        setIsResultsModalOpen(false);
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
        setGlobalFilter('');
        setPageSize(15);
        setActiveToolTab(null);
        setAnomalyResult(null);
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

    const handleExport = (format) => {
        const rowData = table.getFilteredRowModel().rows.map(row => row.original);

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
        if (!dataPreview?.columns || pdfSelectedCols.length === 0) {
            addNotification("Veuillez sélectionner au moins une colonne.", "warning");
            return;
        }
        setIsPDFGenerating(true);

        try {
            const rowData = table.getFilteredRowModel().rows.map(row => row.original);

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

    // colDefs removed

    // rowClassRules removed

    const handleSuggestTypesAI = async () => {
        setIsSavingTypes(true);
        try {
            const res = await customFetch('/api/database/ai-suggest-types');
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                const recs = data.recommendations;
                setColumnsInfo(prev => prev.map(col => {
                    const rec = recs.find(r => r.column === col.name);
                    if (rec) {
                        return { ...col, target_type: rec.recommended_type };
                    }
                    return col;
                }));
                addNotification("Recommendations IA appliquées. N'oubliez pas d'enregistrer.", "info");
            } else {
                addNotification(data.message || "Échec de l'analyse IA", "error");
            }
        } catch (e) {
            addNotification("Erreur lors de la suggestion IA", "error");
        } finally {
            setIsSavingTypes(false);
        }
    };

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

    // gridRef based pagination handlers removed

    const renderTable = () => {
        if (!dataPreview) return null;
        return (
            <>
                <table className="w-full border-separate border-spacing-0">
                    <thead>
                        {table?.getHeaderGroups?.()?.map(hg => (
                            <tr key={hg.id}>
                                {hg.headers.map((header, i) => {
                                    const meta = header.column.columnDef.meta;
                                    return (
                                        <th
                                            key={header.id}
                                            className={`px-4 py-2 bg-gray-50 border-b-2 border-gray-100 first:border-l-0 last:border-r-0 ${i > 0 ? 'border-l border-gray-100' : ''} ${meta?.isId ? 'min-w-[64px]' : 'min-w-[100px]'} ${meta?.isNumeric ? 'text-right' : 'text-left'} sticky top-0 ${meta?.isId ? 'left-0 z-40 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]' : 'z-30 bg-gray-50'}`}
                                        >
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {table?.getRowModel?.()?.rows?.map((row, rowIdx) => {
                            const originalIdx = row.index;
                            const isAnomaly = anomalyIndices.has(originalIdx);
                            const isFaded = anomalyResult && !isAnomaly && !showAnomaliesOnly;
                            const isEven = rowIdx % 2 === 0;

                            return (
                                <tr
                                    key={row.id}
                                    className={`group transition-all duration-100 ${isAnomaly ? 'bg-[#fff1f2] border-l-[3px] border-l-rose-400 hover:bg-[#ffe4e6]' : isEven ? 'bg-white hover:bg-[#f5f3ff]' : 'bg-[#f9fafb] hover:bg-[#f5f3ff]'} ${isFaded ? 'opacity-25' : ''}`}
                                >
                                    {row.getVisibleCells().map((cell, cellIdx) => {
                                        const meta = cell.column.columnDef.meta;
                                        return (
                                            <td
                                                key={cell.id}
                                                className={`px-4 py-2.5 text-xs ${cellIdx > 0 ? 'border-l border-gray-50' : ''} ${meta?.isNumeric ? 'text-right' : 'text-left'} ${meta?.isId ? `sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] ${isAnomaly ? 'bg-[#fff1f2]' : isEven ? 'bg-white' : 'bg-[#f9fafb]'} group-hover:bg-[#f5f3ff]` : ''}`}
                                            >
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {table?.getRowModel?.()?.rows?.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
                            <Search size={24} className="opacity-30" />
                        </div>
                        <p className="text-sm font-bold text-gray-500 uppercase tracking-tighter">Aucun résultat</p>
                        <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">Essayez de modifier votre recherche</p>
                    </div>
                )}

            </>
        );
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

            <Toolbar
                searchQuery={searchTerm}
                setSearchQuery={setSearchTerm}
                pageSize={pageSize}
                setPageSize={(val) => {
                    setPageSize(val);
                    table?.setPageSize?.(val);
                }}
                totalRows={table?.getFilteredRowModel?.()?.rows?.length || 0}
                loadedRows={dataPreview?.data?.length}
                isMaximized={isTableMaximized}
                onToggleFullscreen={() => setIsTableMaximized(true)}
            />

            <div className="flex-1 flex flex-col relative overflow-hidden bg-gray-50">
                {/* Anomaly highlight banner */}
                {showAnomaliesOnly && anomalyResult && (
                    <div className="mx-4 mt-2 flex items-center gap-3 p-3 bg-violet-50 border border-violet-100 rounded-xl">
                        <ShieldCheck className="w-4 h-4 text-violet-600" />
                        <p className="text-xs font-bold text-violet-800 flex-1">
                            Affichage filtré : {anomalyResult.anomaly_count} anomalies sur {anomalyResult.total_rows} lignes
                        </p>
                        <button onClick={() => setShowAnomaliesOnly(false)}
                            className="text-[10px] font-black text-violet-600 bg-white px-3 py-1 rounded-lg border border-violet-200 hover:bg-violet-100 transition-all uppercase">Tout afficher</button>
                        <button onClick={() => setIsResultsModalOpen(true)}
                            className="text-[10px] font-black text-white bg-violet-600 px-3 py-1 rounded-lg hover:bg-violet-700 transition-all uppercase">Revoir le rapport</button>
                    </div>
                )}

                <div className={`flex-1 overflow-auto border-gray-100 shadow-sm relative transition-all duration-500 ${isTableMaximized ? 'opacity-0 pointer-events-none' : 'rounded-t-2xl border-x border-t mx-4 mt-2 mb-0 bg-white'}`}>
                    {renderTable()}
                </div>

                {!isTableMaximized && (
                    <div className="mx-4 bg-white border-x border-b rounded-b-2xl shadow-sm border-gray-100 overflow-hidden shrink-0">
                        <Footer
                            currentPage={(table?.getState?.()?.pagination?.pageIndex || 0) + 1}
                            totalPages={table?.getPageCount?.() || 1}
                            pageSize={pageSize}
                            totalRows={dataPreview?.total_rows}
                            loadedRows={table?.getFilteredRowModel?.()?.rows?.length || 0}
                            table={table}
                            isMobile={isMobile}
                        />
                    </div>
                )}

                {/* MODALS */}
                <VariablesModal
                    isOpen={activeToolTab === 'types'}
                    onClose={() => setActiveToolTab(null)}
                    columnsInfo={columnsInfo}
                    onTypeChange={(col, type) => {
                        setColumnsInfo(prev => prev.map(c => c.name === col ? { ...c, target_type: type } : c));
                    }}
                    onRecommendAI={handleSuggestTypesAI}
                    onSave={saveColumnTypes}
                    isSaving={isSavingTypes}
                />

                <AnomalyConfigModal
                    isOpen={activeToolTab === 'anomalies'}
                    onClose={() => setActiveToolTab(null)}
                    columns={dataPreview?.columns}
                    selectedCols={selectedAnomalyCols}
                    onToggleCol={(field) => {
                        setSelectedAnomalyCols(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
                    }}
                    method={anomalyMethod}
                    setMethod={setAnomalyMethod}
                    sensitivity={anomalySensitivity}
                    setSensitivity={setAnomalySensitivity}
                    onAnalyze={handleAnalyzeAnomalies}
                    isLoading={anomalyLoading}
                />

                <AnomalyResultsModal
                    isOpen={isResultsModalOpen}
                    onClose={() => setIsResultsModalOpen(false)}
                    results={anomalyResult}
                    onHighlightInTable={handleHighlightInTable}
                    onExportCSV={handleExportAnomalies}
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
                    columns={dataPreview?.columns}
                    selectedCols={pdfSelectedCols}
                    onToggleCol={(field) => {
                        if (field === 'all') setPdfSelectedCols(dataPreview.columns.map(c => c.field));
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

            </div>

            {isTableMaximized && (
                <FullscreenPortal>
                    <div className="h-16 px-8 flex items-center justify-between border-b border-gray-100 shrink-0 bg-white">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-900 text-white rounded-xl">
                                <Maximize2 size={18} />
                            </div>
                            <span className="text-sm font-black text-slate-900 uppercase tracking-tight">Vue Immersion Données</span>
                        </div>
                        <button
                            onClick={() => setIsTableMaximized(false)}
                            className="p-2.5 bg-slate-900 text-white rounded-2xl shadow-xl hover:bg-slate-800 transition-all flex items-center gap-2 px-5 group"
                        >
                            <Minimize2 size={16} />
                            <span className="text-xs font-black uppercase tracking-widest">Réduire</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-0 bg-white">
                        {renderTable()}
                    </div>
                    <div className="bg-white border-t border-gray-100 shrink-0">
                        <Footer
                            currentPage={(table?.getState?.()?.pagination?.pageIndex || 0) + 1}
                            totalPages={table?.getPageCount?.() || 1}
                            pageSize={pageSize}
                            totalRows={dataPreview?.total_rows}
                            loadedRows={table?.getFilteredRowModel?.()?.rows?.length || 0}
                            table={table}
                            isMobile={isMobile}
                        />
                    </div>
                </FullscreenPortal>
            )}

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

            <button
                onClick={() => handleOpenToolTab('anomalies')}
                className="fixed bottom-20 right-6 w-14 h-14 bg-bank-600 text-white rounded-2xl shadow-2xl flex items-center justify-center md:hidden z-40 active:scale-90 transition-all"
            >
                <Sparkles className="w-6 h-6 animate-pulse" />
            </button>
        </div>
    );
}
