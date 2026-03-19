import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  UploadCloud, CheckCircle2, DatabaseIcon, BarChart3, 
  FileSpreadsheet, ArrowRight, AlertCircle, AlertTriangle, 
  ShieldAlert, Settings2, Layers, Database, TrendingUp
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getDisplayName, customFetch } from '../features/auth/session';
import OnlineUsers from '../features/realtime/OnlineUsers';

// --- UTILITIES ---
function formatRelativeTime(isoString) {
  if (!isoString) return 'récemment';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 2) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (hours < 24) return `il y a ${hours}h`;
  return `il y a ${days}j`;
}

// --- SUB-COMPONENTS ---
function KpiCard({ label, value, sub, icon: Icon, color }) {
  const COLORS = {
    bank:    { bg: 'bg-bank-50',    text: 'text-bank-600',    border: 'border-bank-100',    grad: 'from-bank-500 to-bank-600'    },
    violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  border: 'border-violet-100',  grad: 'from-violet-500 to-violet-600'  },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', grad: 'from-emerald-500 to-emerald-600' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100',   grad: 'from-amber-500 to-amber-600'   },
    red:     { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-100',     grad: 'from-red-500 to-red-600'     },
  };
  const c = COLORS[color] || COLORS.bank;

  return (
    <div className="group relative bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${c.grad} opacity-0 group-hover:opacity-100 transition-opacity`} />
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">{label}</p>
          <p className="text-2xl font-black text-gray-900 tracking-tight truncate">{value}</p>
          <p className="text-[10px] font-bold text-gray-400 mt-1.5">{sub}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} flex items-center justify-center border ${c.border} flex-shrink-0 ml-3 group-hover:scale-110 transition-transform`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ username, handlers }) {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center gap-8 animate-fade-in-up">
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-bank-400 mb-2">Tableau de Bord</p>
        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Bienvenue, {username}</h1>
        <p className="text-gray-400 mt-2 font-medium">Importez des données pour commencer votre analyse</p>
      </div>

      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Overlay to block sidebar and header clicks during upload */}
          {handlers.isUploading && createPortal(
            <div className="fixed inset-0 z-[9999] bg-white/30 backdrop-blur-[2px] cursor-wait" />,
            document.body
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => handlers.setActiveTab('local')}
              disabled={handlers.isUploading}
              className={`flex-1 py-4 text-sm font-black uppercase tracking-wider transition-all ${
                handlers.activeTab === 'local'
                  ? 'text-bank-600 border-b-2 border-bank-500 bg-bank-50/30'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              📁 Fichier Local
            </button>
            <button
              onClick={() => handlers.setActiveTab('url')}
              disabled={handlers.isUploading}
              className={`flex-1 py-4 text-sm font-black uppercase tracking-wider transition-all ${
                handlers.activeTab === 'url'
                  ? 'text-bank-600 border-b-2 border-bank-500 bg-bank-50/30'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              🔗 Importer via URL
            </button>
          </div>

          {handlers.activeTab === 'local' ? (
            <>
              <div
                onDragEnter={handlers.handleDrag}
                onDragLeave={handlers.handleDrag}
                onDragOver={handlers.handleDrag}
                onDrop={handlers.handleDrop}
                onClick={!handlers.isUploading ? () => handlers.fileInputRef.current.click() : undefined}
                className={`p-16 text-center transition-all duration-300 ${!handlers.isUploading ? 'cursor-pointer hover:bg-gray-50/50' : ''} ${handlers.dragActive ? 'bg-bank-50/80 border-bank-400' : ''}`}
              >
                <input
                  ref={handlers.fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handlers.handleChange}
                  accept=".csv,.tsv,.xlsx,.xls,.json,.parquet"
                />

                {handlers.uploadSuccess ? (
                  <div className="py-8 flex flex-col items-center justify-center animate-fade-in-up">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h3 className="text-xl font-black text-emerald-600 mb-1">Succès !</h3>
                    <p className="text-gray-400 text-sm font-medium">Chargement du tableau de bord...</p>
                  </div>
                ) : !handlers.isUploading ? (
              <>
                <div className="relative mx-auto w-24 h-24 mb-8">
                  <div className="absolute inset-0 bg-bank-100 rounded-3xl animate-pulse opacity-60" />
                  <div className="relative w-24 h-24 bg-gradient-to-br from-bank-500 to-bank-700 rounded-3xl flex items-center justify-center shadow-2xl shadow-bank-200">
                    <UploadCloud className="w-10 h-10 text-white" />
                  </div>
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-2">Glissez-déposez votre fichier ici</h3>
                <p className="text-gray-400 text-sm font-medium mb-8">ou cliquez pour parcourir</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {[
                    { icon: '⚡', label: 'Moteur Polars haute performance' },
                    { icon: '🔍', label: 'Détection de types automatique' },
                    { icon: '🛡️', label: "Anomalies détectées à l'import" },
                  ].map((f, i) => (
                    <span key={i} className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-gray-500">
                      <span>{f.icon}</span>
                      {f.label}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-4">
                <div className="w-14 h-14 rounded-full border-[3px] border-bank-200 border-t-bank-600 animate-spin mx-auto mb-5" />
                <p className="text-bank-600 font-black text-sm uppercase tracking-wider">Traitement en cours...</p>
                <p className="text-gray-400 text-xs mt-2 font-medium">Analyse Polars en cours</p>
              </div>
            )}
              </div>
          </>
          ) : (
            <div className="p-10 flex flex-col items-center justify-center text-center">
              {handlers.uploadSuccess ? (
                  <div className="py-8 flex flex-col items-center justify-center animate-fade-in-up">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h3 className="text-xl font-black text-emerald-600 mb-1">Succès !</h3>
                    <p className="text-gray-400 text-sm font-medium">Chargement du tableau de bord...</p>
                  </div>
              ) : !handlers.isUploading ? (
                <>
                  <div className="w-16 h-16 bg-bank-50 rounded-2xl flex items-center justify-center mb-6">
                    <AlertCircle className="w-8 h-8 text-bank-600" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-2">Lien vers vos données</h3>
                  <p className="text-gray-500 text-sm font-medium mb-8 max-w-md">
                    Collez un lien direct vers un fichier ou un lien de partage Google Sheets (accès public requis).
                  </p>
                  
                  <div className="w-full relative">
                    <input
                      type="url"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={handlers.urlInput}
                      onChange={(e) => handlers.setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlers.urlInput && handlers.handleUrlSubmit()}
                      className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-bank-500 focus:bg-white outline-none transition-all pr-32 font-medium text-gray-700"
                    />
                    <button
                      onClick={handlers.handleUrlSubmit}
                      disabled={!handlers.urlInput}
                      className="absolute right-2 top-2 bottom-2 px-6 bg-bank-600 text-white font-black text-sm rounded-xl hover:bg-bank-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Importer
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-12">
                  <div className="w-14 h-14 rounded-full border-[3px] border-bank-200 border-t-bank-600 animate-spin mx-auto mb-5" />
                  <p className="text-bank-600 font-black text-sm uppercase tracking-wider">Téléchargement en cours...</p>
                  <p className="text-gray-400 text-xs mt-2 font-medium">Récupération des données depuis l'URL</p>
                </div>
              )}
            </div>
          )}

          <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Formats supportés</span>
            <div className="flex flex-wrap gap-1.5 justify-end">
              {['CSV', 'TSV', 'XLSX', 'XLS', 'JSON', 'Parquet'].map(fmt => (
                <span key={fmt} className="px-2 py-0.5 bg-white border border-gray-200 rounded-md text-[9px] font-black text-gray-400 uppercase tracking-wider">{fmt}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataState({ summary, username, onNewUpload }) {
  if (!summary) return null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-bank-400 mb-1">Tableau de Bord</p>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Bonjour, {username}</h1>
        </div>
        <button
          onClick={onNewUpload}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-black text-gray-600 hover:border-bank-300 hover:text-bank-600 transition-all shadow-sm"
        >
          <UploadCloud size={14} />
          Nouveau fichier
        </button>
      </div>

      <div className="bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 rounded-2xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-0 right-0 w-64 h-64 bg-bank-500/10 blur-[80px] rounded-full" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-bank-600/20 border border-bank-500/30 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-6 h-6 text-bank-400" />
            </div>
            <div>
              <p className="text-white font-black text-lg leading-tight">{summary.filename}</p>
              <p className="text-white/40 text-xs font-medium mt-0.5">
                Importé {formatRelativeTime(summary.imported_at)}
                {summary.file_size_mb > 0 && ` · ${summary.file_size_mb} MB`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Qualité des données</p>
              <div className="flex items-center gap-3">
                <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${summary.quality_score >= 80 ? 'bg-emerald-400' : summary.quality_score >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${summary.quality_score}%` }}
                  />
                </div>
                <span className={`text-xl font-black ${summary.quality_score >= 80 ? 'text-emerald-400' : summary.quality_score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {summary.quality_score}%
                </span>
              </div>
            </div>
          </div>
        </div>
        {summary.col_warnings?.length > 0 && (
          <div className="relative z-10 mt-4 pt-4 border-t border-white/10 flex items-center gap-3 flex-wrap">
            <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
            <span className="text-[10px] font-bold text-white/40">Colonnes avec valeurs manquantes :</span>
            {summary.col_warnings.map(col => (
              <span key={col} className="px-2 py-0.5 bg-amber-400/10 border border-amber-400/20 rounded-md text-[10px] font-black text-amber-400">{col}</span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Lignes', value: summary.row_count.toLocaleString('fr-FR'), sub: 'enregistrements', icon: Database, color: 'bank' },
          { label: 'Colonnes', value: summary.col_count, sub: `${summary.numeric_count} NUM · ${summary.categorical_count} CAT`, icon: Layers, color: 'violet' },
          { label: 'Valeurs nulles', value: `${summary.null_rate}%`, sub: summary.null_rate < 5 ? 'Excellent' : summary.null_rate < 15 ? 'Acceptable' : 'À corriger', icon: AlertCircle, color: summary.null_rate < 5 ? 'emerald' : summary.null_rate < 15 ? 'amber' : 'red' },
          { label: 'Anomalies', value: summary.anomaly_count > 0 ? summary.anomaly_count.toLocaleString('fr-FR') : '—', sub: summary.anomaly_count > 0 ? 'détectées' : 'Aucune détectée', icon: ShieldAlert, color: summary.anomaly_count > 0 ? 'red' : 'emerald' },
        ].map((kpi, i) => (
          <KpiCard key={i} {...kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Actions rapides</p>
          {[
            { icon: Database, color: 'bg-bank-600', title: 'Explorer les données', description: `Visualisez et filtrez vos ${summary.row_count.toLocaleString('fr-FR')} lignes`, to: '/database', badge: null },
            { icon: BarChart3, color: 'bg-violet-600', title: 'Créer des rapports', description: 'Graphiques, tableaux croisés dynamiques', to: '/reports', badge: null },
            ...(summary.anomaly_count > 0 ? [{ icon: ShieldAlert, color: 'bg-red-500', title: `${summary.anomaly_count} anomalies détectées`, description: 'Des valeurs suspectes ont été trouvées dans vos données', to: '/database', badge: 'Attention', badgeColor: 'bg-red-100 text-red-600' }] : []),
            ...(summary.quality_score < 80 ? [{ icon: Settings2, color: 'bg-amber-500', title: 'Corriger les types de colonnes', description: `${summary.col_warnings.length} colonne(s) avec des problèmes de qualité`, to: '/database', badge: 'Recommandé', badgeColor: 'bg-amber-100 text-amber-600' }] : []),
          ].map((action, i) => (
            <Link key={i} to={action.to} className="group flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-bank-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className={`w-10 h-10 ${action.color} rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform`}>
                <action.icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-black text-sm text-gray-900">{action.title}</p>
                  {action.badge && <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${action.badgeColor}`}>{action.badge}</span>}
                </div>
                <p className="text-xs text-gray-400 font-medium mt-0.5 truncate">{action.description}</p>
              </div>
              <ArrowRight size={16} className="text-gray-300 group-hover:text-bank-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
            </Link>
          ))}
        </div>
        <div className="lg:col-span-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Utilisateurs en ligne</p>
          <OnlineUsers />
        </div>
      </div>
    </div>
  );
}

// --- MAIN COMPONENT ---
export default function Dashboard({ addNotification }) {
    const [summary, setSummary] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [pendingSheets, setPendingSheets] = useState([]);
    const [selectedSheet, setSelectedSheet] = useState(null);
    const [sheetPreview, setSheetPreview] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('local');
    const [urlInput, setUrlInput] = useState('');
    const fileInputRef = useRef(null);

    const { currentUser } = useAuth();
    const username = getDisplayName(currentUser) || 'Utilisateur';

    const fetchSummary = async () => {
        try {
            setSummaryLoading(true);
            const res = await customFetch('/api/dashboard/summary', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setSummary(data);
            }
        } catch (e) {
            console.error("Failed to fetch dashboard summary", e);
        } finally {
            setSummaryLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, []);

    useEffect(() => {
        if (uploadSuccess) fetchSummary();
    }, [uploadSuccess]);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
        else if (e.type === "dragleave") setDragActive(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileProcess(e.dataTransfer.files[0]);
    };

    const handleChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) handleFileProcess(e.target.files[0]);
    };

    const handleFileProcess = async (file) => {
        if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
            addNotification('Format non supporté. Utilisez CSV ou Excel.', 'error');
            return;
        }

        // Reset the input and sheet states so re-uploading the same file/sheet triggers effects
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedSheet(null);
        setSheetPreview(null);

        setIsUploading(true);
        setUploadSuccess(false);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await customFetch('/api/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });
            const result = await res.json();

            if (res.ok) {
                if (result.status === 'requires_sheet') {
                    setPendingSheets(result.sheets);
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
            addNotification(err.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleUrlSubmit = async () => {
        if (!urlInput.trim()) return;
        
        try {
            new URL(urlInput); // basic validation
        } catch {
            addNotification('URL invalide. Veuillez vérifier le lien.', 'error');
            return;
        }

        setIsUploading(true);
        setUploadSuccess(false);

        try {
            const res = await customFetch('/api/upload/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: urlInput }),
                credentials: 'include',
            });
            const result = await res.json();

            if (res.ok) {
                if (result.status === 'requires_sheet') {
                    setPendingSheets(result.sheets);
                    if (result.sheets.length > 0) setSelectedSheet(result.sheets[0]);
                    addNotification(`${result.sheets.length} feuilles détectées`, 'info');
                } else if (result.status === 'success') {
                    setUploadSuccess(true);
                    setUrlInput('');
                    addNotification('Fichier importé avec succès depuis l\'URL', 'success');
                }
            } else {
                throw new Error(result.message || 'Erreur inconnue');
            }
        } catch (err) {
            console.error(err);
            addNotification(err.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSheetPreviewFetch = async (sheetName) => {
        if (!sheetName) return;
        setIsPreviewLoading(true);
        try {
            const res = await customFetch('/api/upload/sheet-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sheet_name: sheetName }),
                credentials: 'include',
            });
            const result = await res.json();
            if (res.ok && result.status === 'success') {
                setSheetPreview(result.preview);
            }
        } catch (err) {
            console.error("Preview fetch failed", err);
        } finally {
            setIsPreviewLoading(false);
        }
    };

    useEffect(() => {
        if (selectedSheet) handleSheetPreviewFetch(selectedSheet);
    }, [selectedSheet]);

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

    const handleNewUpload = () => {
        setUploadSuccess(false);
        setSummary({ has_data: false });
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const hasData = summary?.has_data === true;

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {summaryLoading ? (
                <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-bank-200 border-t-bank-600 rounded-full animate-spin"></div>
                </div>
            ) : hasData ? (
                <DataState summary={summary} username={username} onNewUpload={handleNewUpload} />
            ) : (
                <EmptyState 
                    username={username} 
                    handlers={{
                        handleDrag, handleDrop, handleChange, isUploading, uploadSuccess,
                        dragActive, fileInputRef,
                        activeTab, setActiveTab, urlInput, setUrlInput, handleUrlSubmit
                    }} 
                />
            )}

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
                                    setSelectedSheet(null);
                                    setSheetPreview(null);
                                    if (fileInputRef.current) fileInputRef.current.value = "";
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
