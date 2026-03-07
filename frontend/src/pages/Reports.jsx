import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);
import { BarChart3, Settings2, Download, Table as TableIcon, AlertCircle, Database as DatabaseIcon, Filter, X as XIcon, Sparkles, GripVertical, Plus, X, Search, Check, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { customFetch } from '../features/auth/session';

// @dnd-kit imports
import {
    DndContext,
    DragOverlay,
    closestCorners,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const ZONES = {
    AVAILABLE: 'available',
    ROWS: 'rows',
    COLUMNS: 'columns',
    VALUES: 'values',
    FILTERS: 'filters',
};

function FieldChip({ id, zone, dtype, aggregation, onAggChange, onRemove }) {
    const [isRemoving, setIsRemoving] = React.useState(false);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    const DTYPE_CHIP_STYLE = {
        continuous: 'bg-blue-50 border-blue-100 text-blue-700',
        discrete: 'bg-violet-50 border-violet-100 text-violet-700',
        categorical: 'bg-amber-50 border-amber-100 text-amber-700',
        boolean: 'bg-green-50 border-green-100 text-green-700',
        identifier: 'bg-gray-50 border-gray-200 text-gray-500',
        unknown: 'bg-gray-50 border-gray-200 text-gray-500',
    };

    // Map dtype to internal category
    const getTypeCategory = (dt) => {
        if (!dt) return 'unknown';
        const low = dt.toLowerCase();
        if (low.includes('int') || low.includes('float') || low.includes('decimal')) return 'continuous';
        if (low.includes('bool')) return 'boolean';
        if (low.includes('date') || low.includes('time')) return 'discrete';
        if (low.includes('string') || low.includes('utf8') || low.includes('object')) return 'categorical';
        return 'unknown';
    };

    const ZONE_CHIP_SOLID = {
        [ZONES.ROWS]: 'bg-blue-600 border-blue-600 text-white',
        [ZONES.COLUMNS]: 'bg-amber-500 border-amber-500 text-white',
        [ZONES.VALUES]: 'bg-emerald-600 border-emerald-600 text-white',
        [ZONES.FILTERS]: 'bg-red-500 border-red-500 text-white',
    };

    const chipBase = "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold shadow-sm select-none transition-all duration-150 animate-in zoom-in-95 fade-in";

    if (zone === ZONES.AVAILABLE) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
                className={`${chipBase} rounded-full cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 ${DTYPE_CHIP_STYLE[getTypeCategory(dtype)]} ${isRemoving ? 'opacity-0 scale-95 duration-150' : ''}`}
            >
                <GripVertical size={12} className="opacity-40" />
                <span>{id}</span>
            </div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`${chipBase} py-2.5 shadow-md hover:brightness-110 group ${ZONE_CHIP_SOLID[zone]} ${isRemoving ? 'opacity-0 scale-95 duration-150' : ''}`}
        >
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
                <GripVertical size={12} className="opacity-50" />
            </div>
            <span className="truncate flex-1">{id}</span>

            {zone === ZONES.VALUES && (
                <select
                    value={aggregation}
                    onChange={e => onAggChange(id, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="bg-white/20 text-inherit text-[10px] font-black rounded-lg px-2 py-1 border border-white/20 outline-none hover:bg-white/30 cursor-pointer"
                >
                    <option value="sum">Σ Somme</option>
                    <option value="mean">μ Moyenne</option>
                    <option value="count"># Nombre</option>
                    <option value="min">↓ Min</option>
                    <option value="max">↑ Max</option>
                </select>
            )}

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsRemoving(true);
                    setTimeout(() => onRemove(id), 150);
                }}
                className="w-5 h-5 rounded-full bg-white/20 opacity-0 group-hover:opacity-100 hover:bg-white/40 flex items-center justify-center transition-all duration-150"
            >
                <X size={10} />
            </button>
        </div>
    );
}

function FilterSelector({ field, activeFilters, onSave, onClose }) {
    const [values, setValues] = useState([]);
    const [selected, setSelected] = useState(activeFilters[field] || []);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [totalUnique, setTotalUnique] = useState(0);

    useEffect(() => {
        const fetchValues = async () => {
            try {
                const res = await customFetch(`/api/reports/unique-values?column=${encodeURIComponent(field)}`);
                if (res.ok) {
                    const data = await res.json();
                    setValues(data.values);
                    setTotalUnique(data.total_unique);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchValues();
    }, [field]);

    const filteredValues = values.filter(v =>
        String(v).toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 bg-gray-950 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center">
                            <Filter className="w-4 h-4 text-red-500" />
                        </div>
                        <div>
                            <p className="text-white font-black text-sm tracking-wide">Filtrer: {field}</p>
                            <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest">Sélectionner les valeurs</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Rechercher des valeurs..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-red-500 transition-all outline-none"
                        />
                    </div>

                    <div className="max-h-[300px] overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                        {loading ? (
                            <div className="py-10 flex flex-col items-center justify-center gap-3">
                                <div className="w-6 h-6 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
                                <p className="text-[10px] font-black uppercase text-gray-400">Chargement...</p>
                            </div>
                        ) : filteredValues.length > 0 ? (
                            filteredValues.map(v => {
                                const isSelected = selected.includes(v);
                                return (
                                    <button
                                        key={v}
                                        onClick={() => {
                                            setSelected(prev =>
                                                isSelected ? prev.filter(x => x !== v) : [...prev, v]
                                            );
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150 ${isSelected ? 'bg-red-50 text-red-700' : 'hover:bg-gray-50 text-gray-600'
                                            }`}
                                    >
                                        <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-red-500 border-red-500' : 'border-gray-200'
                                            }`}>
                                            {isSelected && <Check size={12} className="text-white" />}
                                        </div>
                                        <span className="text-sm font-bold truncate">{v === null ? '(Vide)' : String(v)}</span>
                                    </button>
                                );
                            })
                        ) : (
                            <p className="py-10 text-center text-xs text-gray-400 font-medium italic">Aucune valeur trouvée</p>
                        )}
                    </div>

                    {totalUnique > 1000 && (
                        <p className="text-[9px] text-amber-600 font-bold uppercase text-center bg-amber-50 py-2 rounded-lg ring-1 ring-amber-200">
                            ⚠️ Trop de valeurs ({totalUnique}). Seules les 1000 premières sont affichées.
                        </p>
                    )}

                    <div className="pt-2 flex gap-3">
                        <button
                            onClick={() => setSelected([])}
                            className="flex-1 py-3 bg-gray-50 text-gray-500 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-gray-100 transition-all"
                        >
                            Désélectionner tout
                        </button>
                        <button
                            onClick={() => onSave(selected)}
                            className="flex-1 py-3 bg-red-500 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-red-100 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                        >
                            Appliquer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DropZone({ id, label, children, isEmpty }) {
    const { isOver, setNodeRef } = useDroppable({ id });

    const ZONE_CONFIG = {
        [ZONES.ROWS]: { idle: 'bg-blue-50/30 border-blue-200', hover: 'bg-blue-100/60 border-blue-400 shadow-blue-100', text: 'text-blue-800', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
        [ZONES.COLUMNS]: { idle: 'bg-amber-50/30 border-amber-200', hover: 'bg-amber-100/60 border-amber-400 shadow-amber-100', text: 'text-amber-800', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
        [ZONES.VALUES]: { idle: 'bg-emerald-50/30 border-emerald-200', hover: 'bg-emerald-100/60 border-emerald-400 shadow-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
        [ZONES.FILTERS]: { idle: 'bg-red-50/30 border-red-200', hover: 'bg-red-100/60 border-red-400 shadow-red-100', text: 'text-red-800', dot: 'bg-red-400', badge: 'bg-red-100 text-red-700' },
    };
    const cfg = ZONE_CONFIG[id];
    const fieldCount = children.length;

    return (
        <div
            ref={setNodeRef}
            className={`rounded-2xl border-2 p-4 min-h-[110px] transition-all duration-200 ${isOver ? 'border-solid scale-[1.02] shadow-lg ' + cfg.hover : 'border-dashed ' + cfg.idle}`}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-5 rounded-full ${cfg.dot}`} />
                    <p className={`text-[10px] font-black uppercase tracking-widest ${cfg.text}`}>{label}</p>
                </div>
                {fieldCount > 0 && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${cfg.badge}`}>{fieldCount}</span>
                )}
            </div>

            <SortableContext items={children.map(c => c.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                    {children}
                    {isEmpty && (
                        <div className={`flex flex-col items-center justify-center py-5 gap-1.5`}>
                            <div className={`w-8 h-8 rounded-xl border-2 border-dashed flex items-center justify-center opacity-30 ${cfg.dot.replace('bg-', 'border-').replace('text-', 'border-')}`}>
                                <Plus size={14} className={cfg.text} />
                            </div>
                            <p className={`text-[10px] italic opacity-40 ${cfg.text}`}>Glissez des champs ici</p>
                        </div>
                    )}
                </div>
            </SortableContext>
        </div>
    );
}

export default function Reports({ addNotification }) {
    const [columnsInfo, setColumnsInfo] = useState([]);
    const [activeTab, setActiveTab] = useState('charts');
    const [loading, setLoading] = useState(true);

    // Human-friendly mapping for Polars/Technical types (Excel-like)
    const TYPE_LABELS = {
        'Int64': 'Nombre Entier',
        'Int32': 'Nombre Entier',
        'Float64': 'Nombre Décimal',
        'Float32': 'Nombre Décimal',
        'String': 'Texte / Catégorie',
        'Utf8': 'Texte / Catégorie',
        'Object': 'Texte / Catégorie',
        'Date': 'Date',
        'Datetime': 'Date et Heure',
        'Boolean': 'Logique (Vrai/Faux)',
        'Null': 'Inconnu'
    };
    const getFriendlyType = (dtype) => {
        if (!dtype) return 'Inconnu';
        return TYPE_LABELS[dtype] || (dtype.includes('Int') ? 'Nombre Entier' : dtype.includes('Float') ? 'Nombre Décimal' : dtype);
    };

    const isCategorical = (dtype) => {
        if (!dtype) return true;
        const low = dtype.toLowerCase();
        return low.includes('string') || low.includes('utf8') || low.includes('object') || low.includes('date');
    };

    // Chart States
    const [chartX, setChartX] = useState('');
    const [chartY, setChartY] = useState('');
    const [chartType, setChartType] = useState('bar');
    const [chartData, setChartData] = useState(null);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartError, setChartError] = useState('');
    const [chartTitle, setChartTitle] = useState('');
    const [manualTitle, setManualTitle] = useState('');
    const echartsRef = useRef(null);

    // Pivot States (Unified DnD Model)
    const [fieldZones, setFieldZones] = useState({
        [ZONES.AVAILABLE]: [],
        [ZONES.ROWS]: [],
        [ZONES.COLUMNS]: [],
        [ZONES.VALUES]: [],
        [ZONES.FILTERS]: [],
    });
    const [aggregations, setAggregations] = useState({});
    const [activeId, setActiveId] = useState(null);

    // Derived values for backward compatibility
    const pivotRows = fieldZones[ZONES.ROWS];
    const pivotCols = fieldZones[ZONES.COLUMNS];
    const pivotValues = fieldZones[ZONES.VALUES].map(col => ({
        col,
        agg: aggregations[col] || 'sum'
    }));

    const [pivotData, setPivotData] = useState(null);
    const [pivotLoading, setPivotLoading] = useState(false);
    const [pivotError, setPivotError] = useState('');
    const [globalFilters, setGlobalFilters] = useState({});
    const generateChartRef = useRef(null);
    const generatePivotRef = useRef(null);
    const isFirstRender = useRef(true);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 }
        })
    );

    const [filterModalField, setFilterModalField] = useState(null);

    const [totalRows, setTotalRows] = useState(0);

    // LLM States
    const [llmInterpretation, setLlmInterpretation] = useState('');
    const [llmLoading, setLlmLoading] = useState(false);
    const [llmError, setLlmError] = useState('');
    const [llmRecommendations, setLlmRecommendations] = useState([]);
    const [llmRecLoading, setLlmRecLoading] = useState(false);
    const [llmRecError, setLlmRecError] = useState('');

    // ====================== LLM LOGIC ======================
    const handleInterpret = async () => {
        if (!chartData) return;
        setLlmLoading(true); setLlmError(''); setLlmInterpretation('');

        const isYNum = isNumeric(yColType) || (!yColType);
        let summary = {};
        if (isYNum && chartData.values) {
            summary = {
                min: Math.min(...chartData.values),
                max: Math.max(...chartData.values),
                mean: Math.round(chartData.values.reduce((a, b) => a + b, 0) / chartData.values.length),
                trend: chartData.values[0] < chartData.values[chartData.values.length - 1] ? 'ascendant' : 'descendant',
                top_values: chartData.labels.map((l, i) => ({ label: l, value: chartData.values[i] })).sort((a, b) => b.value - a.value).slice(0, 3)
            };
        } else if (chartData.data && Array.isArray(chartData.data) && chartData.data[0]?.value !== undefined) {
            const vals = chartData.data.map(d => d.value);
            summary = { min: Math.min(...vals), max: Math.max(...vals) };
        }

        try {
            const res = await customFetch('/api/chart-data/interpret', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chart_type: chartType, x_column: chartX, y_column: chartY,
                    summary: summary, language: 'fr'
                }),
                credentials: 'include',
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                setLlmInterpretation(data.interpretation);
            } else if (res.status === 503) {
                setLlmError("Le service d'interprétation est temporairement indisponible. Réessayez dans quelques instants.");
            } else {
                setLlmError("Erreur lors de l'interprétation.");
            }
        } catch { setLlmError("Erreur de connexion."); }
        setLlmLoading(false);
    };

    const handleRecommend = async () => {
        if (!chartX) return;
        setLlmRecLoading(true); setLlmRecError(''); setLlmRecommendations([]);
        try {
            const res = await customFetch('/api/chart-data/recommend', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    x_column: chartX, x_type: getFriendlyType(xColType),
                    y_column: chartY, y_type: getFriendlyType(yColType),
                    row_count: totalRows, language: 'fr'
                }),
                credentials: 'include',
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                setLlmRecommendations(data.recommendations || []);
            } else if (res.status === 503) {
                setLlmRecError("503");
            }
        } catch { }
        setLlmRecLoading(false);
    };

    // Auto-refresh when filters change (skip first render to avoid double-fetch on mount)
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        // Only re-run if there is already data present
        if (chartData && generateChartRef.current) generateChartRef.current();
        if (pivotData && generatePivotRef.current) generatePivotRef.current();
    }, [globalFilters]);

    const findZone = (fieldName) => {
        return Object.entries(fieldZones).find(([, fields]) =>
            fields.includes(fieldName)
        )?.[0] ?? null;
    };

    const handleDragStart = ({ active }) => setActiveId(active.id);

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over) return;

        const sourceZone = findZone(active.id);
        let targetZone = over.id;

        // If dropped over a field instead of a zone container, find that field's zone
        if (!Object.values(ZONES).includes(targetZone)) {
            targetZone = findZone(targetZone);
        }

        if (!sourceZone || !targetZone) return;
        if (sourceZone === targetZone) return; // Order not specifically handled yet

        setFieldZones(prev => {
            const next = { ...prev };
            next[sourceZone] = next[sourceZone].filter(id => id !== active.id);
            next[targetZone] = [...next[targetZone], active.id];
            return next;
        });

        // Add default aggregation if entering VALUES
        if (targetZone === ZONES.VALUES) {
            setAggregations(prev => ({
                ...prev,
                [active.id]: prev[active.id] || 'sum'
            }));
        }
        // Cleanup aggregation if leaving VALUES
        if (sourceZone === ZONES.VALUES && targetZone !== ZONES.VALUES) {
            setAggregations(prev => {
                const next = { ...prev };
                delete next[active.id];
                return next;
            });
        }
    };

    const removeField = (fieldName) => {
        const zone = findZone(fieldName);
        if (!zone) return;
        setFieldZones(prev => ({
            ...prev,
            [zone]: prev[zone].filter(f => f !== fieldName),
            [ZONES.AVAILABLE]: [...new Set([...prev[ZONES.AVAILABLE], fieldName])]
        }));
        setAggregations(prev => {
            const next = { ...prev };
            delete next[fieldName];
            return next;
        });
    };

    const resetAll = () => {
        setFieldZones({
            [ZONES.AVAILABLE]: columnsInfo.map(c => c.name),
            [ZONES.ROWS]: [],
            [ZONES.COLUMNS]: [],
            [ZONES.VALUES]: [],
            [ZONES.FILTERS]: [],
        });
        setAggregations({});
        setPivotData(null);
    };

    const toggleField = (colName, colDtype) => {
        const currentZone = findZone(colName);
        if (currentZone && currentZone !== ZONES.AVAILABLE) {
            removeField(colName);
            return;
        }

        // Logic to move from AVAILABLE to a best-guess zone
        const dtype = colDtype ? colDtype.toLowerCase() : '';
        const isCat = dtype.includes('string') || dtype.includes('utf8') || dtype.includes('object') || dtype.includes('date') || dtype.includes('categorical');
        const targetZone = isCat ? ZONES.ROWS : ZONES.VALUES;

        setFieldZones(prev => ({
            ...prev,
            [ZONES.AVAILABLE]: prev[ZONES.AVAILABLE].filter(f => f !== colName),
            [targetZone]: [...prev[targetZone], colName]
        }));
        if (targetZone === ZONES.VALUES) {
            setAggregations(prev => ({ ...prev, [colName]: 'sum' }));
        }
    };

    useEffect(() => {
        if (columnsInfo.length > 0) {
            setFieldZones(prev => {
                const allAssigned = Object.entries(prev)
                    .filter(([zone]) => zone !== ZONES.AVAILABLE)
                    .flatMap(([, fields]) => fields);
                const available = columnsInfo
                    .map(c => c.name)
                    .filter(name => !allAssigned.includes(name));
                return { ...prev, [ZONES.AVAILABLE]: available };
            });
        }
    }, [columnsInfo]);

    useEffect(() => {
        fetchColumnsInfo();
        const savedTab = localStorage.getItem('report-active-tab');
        if (savedTab) setActiveTab(savedTab);
    }, []);

    const fetchColumnsInfo = async () => {
        try {
            setLoading(true);
            const res = await customFetch('/api/reports/columns');
            if (res.ok) {
                const data = await res.json();
                setColumnsInfo(data.columns_info || []);
                setTotalRows(data.row_count || 0);
            }
        } catch (e) {
            console.error(e);
            addNotification("Impossible de charger les colonnes.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleTabSwitch = (tab) => {
        setActiveTab(tab);
        localStorage.setItem('report-active-tab', tab);
    };

    // ====================== CHARTS LOGIC ======================
    const generateChart = async () => {
        if (!chartX) {
            setChartError("Veuillez sélectionner au moins la variable X");
            setChartData(null);
            return;
        }

        setChartLoading(true);
        setChartError('');
        setChartData(null);
        setLlmInterpretation('');

        try {
            const res = await customFetch('/api/chart-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    x_column: chartX,
                    y_column: chartY,
                    chart_type: chartType,
                    filters: globalFilters
                }),
                credentials: 'include',
            });
            const result = await res.json();
            if (res.ok && result.status === 'success') {
                setChartData(result);
            } else {
                setChartError(result.message || "Erreur de chargement");
            }
        } catch (e) {
            setChartError("Impossible de contacter le serveur.");
        } finally {
            setChartLoading(false);
        }
    };
    generateChartRef.current = generateChart;

    // Synchronize Chart Title in real-time
    useEffect(() => {
        if (chartX) {
            const auto = chartY ? `${chartY} par ${chartX}` : `Répartition de ${chartX}`;
            setChartTitle(manualTitle || auto);
        }
    }, [manualTitle, chartX, chartY]);

    const getChartOptions = () => {
        if (!chartData) return {};
        const d = chartData;
        const colorPalette = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4'];
        const tooltipStyle = { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#e5e7eb', textStyle: { color: '#374151' } };

        // Define Base Options to be shared
        const baseOptions = {
            title: {
                text: chartTitle,
                left: 'center',
                top: 10,
                textStyle: {
                    fontSize: 22,
                    fontWeight: '900',
                    color: '#111827',
                    fontFamily: 'Outfit, Inter, sans-serif'
                }
            },
            color: colorPalette,
            backgroundColor: 'transparent',
            animationDuration: 1000,
        };

        if (d.chart_type === 'pie') {
            return {
                ...baseOptions,
                tooltip: { trigger: 'item', ...tooltipStyle },
                legend: { type: 'scroll', bottom: 10 },
                series: [{
                    type: 'pie', radius: ['35%', '65%'], center: ['50%', '55%'],
                    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                    label: { show: true, formatter: '{b}: {d}%', fontSize: 11 },
                    emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
                    data: d.data
                }]
            };
        }
        if (d.chart_type === 'scatter') {
            return {
                ...baseOptions,
                tooltip: { trigger: 'item', formatter: (p) => `${d.x_name}: ${p.value[0]}<br/>${d.y_name}: ${p.value[1]}`, ...tooltipStyle },
                xAxis: { type: 'value', name: d.x_name, top: 40 },
                yAxis: { type: 'value', name: d.y_name },
                grid: { top: 80 },
                series: [{ type: 'scatter', symbolSize: 8, data: d.data }]
            };
        }
        if (d.chart_type === 'boxplot') {
            const series = [{
                name: 'Boxplot', type: 'boxplot',
                data: d.data.map((box, i) => ({ value: box, itemStyle: { color: colorPalette[i % colorPalette.length] + '30', borderColor: colorPalette[i % colorPalette.length] } }))
            }];
            if (d.outliers && d.outliers.length > 0) {
                series.push({ name: 'Outliers', type: 'scatter', data: d.outliers });
            }
            return {
                ...baseOptions,
                tooltip: { trigger: 'item', ...tooltipStyle },
                xAxis: { type: 'category', data: d.categories },
                yAxis: { type: 'value', name: d.y_name },
                grid: { top: 80 },
                series: series
            };
        }

        const seriesType = d.chart_type === 'area' ? 'line' : d.chart_type;
        return {
            ...baseOptions,
            tooltip: { trigger: 'axis', axisPointer: { type: d.chart_type === 'bar' ? 'shadow' : 'line' }, ...tooltipStyle },
            xAxis: { type: 'category', data: d.labels },
            yAxis: { type: 'value', name: d.y_name },
            grid: { top: 80 },
            series: [{ type: seriesType, data: d.values, areaStyle: d.chart_type === 'area' ? { opacity: 0.15 } : undefined }]
        };
    };

    // Statistical Constraints Logic
    const xColType = useMemo(() => {
        const col = columnsInfo.find(c => c.name === chartX);
        return col ? col.dtype : null;
    }, [chartX, columnsInfo]);

    const yColType = useMemo(() => {
        const col = columnsInfo.find(c => c.name === chartY);
        return col ? col.dtype : null;
    }, [chartY, columnsInfo]);

    const isNumeric = (type) => type && (type.includes('Int') || type.includes('Float') || type.includes('Decimal'));

    // Filter available chart types based on selected variables
    const getAvailableChartTypes = () => {
        const types = [];

        // Bar, Line, Area: Need X (Category or Numeric). Y can be missing (counting) or Numeric.
        if (chartX && (!chartY || isNumeric(yColType))) {
            types.push('bar');
            types.push('line');
            types.push('area');
        }

        // Pie: X Categorical. Y missing or Numeric (aggregates sum by category).
        if (chartX && isCategorical(xColType) && (!chartY || isNumeric(yColType))) {
            types.push('pie');
        }

        // Scatter: X Numeric, Y Numeric.
        if (chartX && chartY && isNumeric(xColType) && isNumeric(yColType)) {
            types.push('scatter');
        }

        // Boxplot: X Categorical, Y Numeric.
        if (chartX && chartY && isCategorical(xColType) && isNumeric(yColType)) {
            types.push('boxplot');
        }

        return types;
    };

    const availableCharts = getAvailableChartTypes();

    // Auto-reset chart type if current selection becomes statistically invalid
    useEffect(() => {
        if (availableCharts.length > 0 && !availableCharts.includes(chartType)) {
            setChartType(availableCharts[0]);
        }
    }, [chartX, chartY, availableCharts, chartType]);

    // ====================== PIVOT LOGIC ======================
    const generatePivot = async () => {
        // === VALIDATION ===
        // 1) At least one row is required
        if (pivotRows.length === 0) {
            setPivotError("⚠️ Sélectionnez au moins un champ dans la zone « Lignes » pour construire le TCD.");
            setPivotData(null);
            return;
        }
        // 2) At least one value is required
        if (pivotValues.length === 0) {
            setPivotError("⚠️ Sélectionnez au moins un champ numérique dans la zone « Valeurs » (Σ Somme, μ Moyenne, etc.).");
            setPivotData(null);
            return;
        }
        // 3) Check that value columns are indeed numeric
        const nonNumericValues = pivotValues.filter(v => {
            const colInfo = columnsInfo.find(c => c.name === v.col);
            return colInfo && !colInfo.is_numeric && v.agg !== 'count';
        });
        if (nonNumericValues.length > 0) {
            const names = nonNumericValues.map(v => `"${v.col}"`).join(', ');
            setPivotError(`⚠️ Les champs ${names} ne sont pas numériques. Utilisez l'agrégation « # Nombre » pour les champs texte, ou changez-les de zone.`);
            setPivotData(null);
            return;
        }
        // 4) Check for duplicate fields across zones
        const allFields = [...pivotRows, ...pivotCols, ...pivotValues.map(v => v.col)];
        const seen = new Set();
        const duplicates = allFields.filter(f => { if (seen.has(f)) return true; seen.add(f); return false; });
        if (duplicates.length > 0) {
            setPivotError(`⚠️ Le champ "${duplicates[0]}" est présent dans plusieurs zones. Chaque champ doit être unique.`);
            setPivotData(null);
            return;
        }

        console.log('[TCD] Generating pivot with:', { rows: pivotRows, cols: pivotCols, values: pivotValues, filters: globalFilters });

        setPivotLoading(true);
        setPivotError('');
        setPivotData(null);

        try {
            const res = await customFetch('/api/pivot-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    row_cols: pivotRows,
                    col_cols: pivotCols,
                    value_cols: pivotValues.map(v => ({ col: v.col, agg: v.agg })),
                    filters: globalFilters
                }),
                credentials: 'include',
            });

            const result = await res.json();
            if (res.ok && result.status === 'success') {
                if (!result.rows || result.rows.length === 0) {
                    setPivotError("Le TCD est vide pour cette sélection.");
                    setPivotData(null);
                    return;
                }
                const rowData = result.rows.map(rowArray => {
                    const rowObj = {};
                    result.headers.forEach((h, i) => { rowObj[h] = rowArray[i] });
                    return rowObj;
                });

                if (result.totals && result.totals.length > 0) {
                    const totalObj = {};
                    result.headers.forEach((h, i) => { totalObj[h] = result.totals[i] });
                    totalObj.isTotalRow = true;
                    rowData.push(totalObj);
                }

                setPivotData({
                    headers: result.headers,
                    data: rowData,
                    rowCount: result.row_count,
                    totals: result.totals
                });
            } else {
                setPivotError(result.message || "Erreur lors de la génération du TCD");
            }
        } catch (e) {
            console.error('[TCD] Fetch error:', e);
            setPivotError("Impossible de contacter le serveur. Vérifiez que le backend est lancé.");
        } finally {
            setPivotLoading(false);
        }
    };
    generatePivotRef.current = generatePivot;

    const pivotColDefs = useMemo(() => {
        if (!pivotData || !pivotData.headers) return [];
        return pivotData.headers.map((h, i) => ({
            field: h,
            headerName: h,
            filter: true,
            sortable: true,
            resizable: true,
            valueFormatter: (params) => {
                if (params.data?.isTotalRow && i === 0) return 'TOTAL';
                return params.value;
            },
            cellClassRules: {
                'bg-bank-50 font-black text-bank-900 border-t-2 border-bank-200': (params) => params.data?.isTotalRow,
                'bg-gray-50/30 text-bank-700 font-bold border-l border-gray-100': (params) => i >= pivotRows.length && !params.data?.isTotalRow
            }
        }));
    }, [pivotData, pivotRows]);

    if (loading) {
        return <div className="p-8 flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bank-600"></div></div>;
    }

    if (columnsInfo.length === 0) {
        return (
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 p-12 text-center mt-6">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                    <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">Aucune donnée disponible</h3>
                <p className="mt-2 text-gray-500">Importez d'abord un fichier pour générer des rapports.</p>
                <Link to="/dashboard" className="mt-6 inline-flex items-center px-6 py-3 bg-bank-600 text-white font-semibold rounded-xl hover:bg-bank-700 transition-all">
                    Importer un fichier
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
            {/* Tabs */}
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 overflow-hidden flex">
                <button onClick={() => handleTabSwitch('charts')} className={`flex-1 px-6 py-4 text-sm font-medium text-center transition-all ${activeTab === 'charts' ? 'border-b-2 border-bank-600 text-bank-700 bg-bank-50/50' : 'border-b-2 border-transparent text-gray-500 hover:bg-gray-50'}`}>
                    <BarChart3 className="w-4 h-4 inline-block mr-2" /> Graphiques
                </button>
                <button onClick={() => handleTabSwitch('pivot')} className={`flex-1 px-6 py-4 text-sm font-medium text-center transition-all ${activeTab === 'pivot' ? 'border-b-2 border-bank-600 text-bank-700 bg-bank-50/50' : 'border-b-2 border-transparent text-gray-500 hover:bg-gray-50'}`}>
                    <TableIcon className="w-4 h-4 inline-block mr-2" /> Tableau Croisé Dynamique
                </button>
            </div>

            {/* Filter Ribbon */}
            {Object.keys(globalFilters).length > 0 && (
                <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-bank-100 p-4 flex items-center gap-4 animate-in slide-in-from-top-4 duration-300">
                    <div className="bg-bank-50 p-2 rounded-xl text-bank-600 flex items-center gap-2">
                        <Filter className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Filtres Actifs</span>
                    </div>
                    <div className="flex-1 flex flex-wrap gap-2">
                        {Object.entries(globalFilters).map(([col, val]) => (
                            <div key={col} className="flex items-center bg-bank-600 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-lg shadow-bank-100 group transition-all hover:scale-105">
                                <span className="opacity-70 mr-2 uppercase tracking-tighter">{col}:</span>
                                <span>{val}</span>
                                <button
                                    onClick={() => {
                                        const newF = { ...globalFilters };
                                        delete newF[col];
                                        setGlobalFilters(newF);
                                    }}
                                    className="ml-2 bg-white/20 hover:bg-white/40 p-0.5 rounded-full transition-colors"
                                >
                                    <XIcon className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => setGlobalFilters({})}
                        className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700 underline underline-offset-4"
                    >
                        Tout effacer
                    </button>
                </div>
            )}

            {/* CHARTS TAB */}
            {activeTab === 'charts' && (
                <div className="space-y-6 animate-fade-in-up">
                    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                            <Settings2 className="w-5 h-5 mr-2 text-bank-600" /> Configuration du graphique
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6 items-end">
                            <div className="md:col-span-3">
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Titre du Graphique</label>
                                <input
                                    type="text"
                                    value={manualTitle}
                                    onChange={e => setManualTitle(e.target.value)}
                                    placeholder="Titre personnalisé..."
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-bank-500 transition-all font-medium text-gray-700"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Variable X</label>
                                <select value={chartX} onChange={e => setChartX(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-bank-500 transition-all font-bold text-gray-700">
                                    <option value="">— Sélectionner —</option>
                                    {columnsInfo.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Variable Y</label>
                                <select value={chartY} onChange={e => setChartY(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-bank-500 transition-all font-bold text-gray-700">
                                    <option value="">— Fréquence —</option>
                                    {columnsInfo.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2 relative">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Type</label>
                                    {chartX && !llmRecError && (
                                        <button type="button" onClick={handleRecommend} disabled={llmRecLoading} className="text-[10px] text-bank-600 font-bold hover:underline flex items-center">
                                            {llmRecLoading ? <span className="animate-spin mr-1">↻</span> : '✨ Recommander'}
                                        </button>
                                    )}
                                </div>
                                <select value={chartType} onChange={e => setChartType(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-bank-500 transition-all font-bold text-gray-700">
                                    <option value="bar" disabled={!availableCharts.includes('bar')}>📊 Barres {(!availableCharts.includes('bar') && chartX) ? '(Y Numérique requis)' : ''}</option>
                                    <option value="line" disabled={!availableCharts.includes('line')}>📈 Ligne {(!availableCharts.includes('line') && chartX) ? '(Y Numérique requis)' : ''}</option>
                                    <option value="pie" disabled={!availableCharts.includes('pie')}>🥧 Camembert {(!availableCharts.includes('pie') && chartX) ? '(X Catégoriel requis)' : ''}</option>
                                    <option value="area" disabled={!availableCharts.includes('area')}>📉 Aire {(!availableCharts.includes('area') && chartX) ? '(Y Numérique requis)' : ''}</option>
                                    <option value="scatter" disabled={!availableCharts.includes('scatter')}>🔵 Scatter {(!availableCharts.includes('scatter') && chartX) ? '(X et Y Numériques requis)' : ''}</option>
                                    <option value="boxplot" disabled={!availableCharts.includes('boxplot')}>📦 Boxplot {(!availableCharts.includes('boxplot') && chartX) ? '(X Catég. et Y Numérique requis)' : ''}</option>
                                </select>
                            </div>
                            <div className="md:col-span-3">
                                <button onClick={generateChart} disabled={chartLoading} className="w-full py-3 bg-gradient-to-r from-bank-600 to-bank-500 text-white font-black rounded-2xl shadow-xl shadow-bank-100 hover:shadow-bank-200 hover:-translate-y-0.5 transition-all active:translate-y-0">
                                    {chartLoading ? 'Génération...' : 'Mettre à jour'}
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-start items-center">
                            {/* Option tags removed for limited preview */}
                        </div>
                        {chartError && <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{chartError}</p>}

                        {llmRecommendations.length > 0 && (
                            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
                                {llmRecommendations.map((rec, i) => (
                                    <div
                                        key={i}
                                        onClick={() => setChartType(rec.chart_type)}
                                        className="p-4 border border-bank-100 rounded-2xl bg-gradient-to-br from-bank-50/30 to-white hover:border-bank-400 hover:shadow-lg transition-all cursor-pointer group"
                                    >
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-black text-bank-800 uppercase tracking-wide flex items-center gap-2">
                                                <BarChart3 className="w-4 h-4 text-bank-600 group-hover:scale-110 transition-transform" /> {rec.chart_type}
                                            </span>
                                            <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${rec.confidence === 'high' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {rec.confidence === 'high' ? 'Recommandé' : 'Alternatif'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 leading-relaxed font-medium">
                                            {rec.reason}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px] flex flex-col relative">
                        {chartData ? (
                            <div className="flex-1 flex flex-col w-full h-full">
                                <div className="p-4 flex-1 w-full">
                                    <ReactECharts
                                        ref={echartsRef}
                                        option={getChartOptions()}
                                        notMerge={true}
                                        style={{ height: '500px', width: '100%' }}
                                        onEvents={{
                                            'click': (params) => {
                                                if (params.name && chartX) {
                                                    setGlobalFilters(prev => ({ ...prev, [chartX]: params.name }));
                                                }
                                            }
                                        }}
                                    />
                                </div>
                                {!llmInterpretation && (
                                    <div className="p-4 border-t border-gray-50 flex flex-col items-center bg-gray-50/30 relative z-10 w-full block">
                                        <button onClick={handleInterpret} disabled={llmLoading} className="px-6 py-2.5 bg-white border border-bank-200 text-bank-700 font-bold text-sm rounded-xl shadow-sm hover:bg-bank-50 hover:border-bank-300 transition-all flex items-center">
                                            {llmLoading ? <span className="w-4 h-4 rounded-full border-2 border-t-bank-600 border-r-transparent animate-spin mr-2"></span> : <Sparkles className="w-4 h-4 mr-2" />}
                                            Interpréter ce graphique
                                        </button>
                                        {llmError && !llmError.includes("503") && <p className="text-xs font-bold text-red-500 mt-3">{llmError}</p>}
                                        {llmError && llmError.includes("temporairement indisponible") && <p className="text-xs font-bold text-orange-500 mt-3 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">{llmError}</p>}
                                    </div>
                                )}
                                {llmInterpretation && (
                                    <div className="p-6 border-t border-bank-100 bg-gradient-to-br from-bank-50/80 to-white relative z-10 animate-fade-in-up w-full">
                                        <button onClick={() => setLlmInterpretation('')} className="absolute top-4 right-4 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-700 transition-colors">Fermer ✕</button>
                                        <h4 className="font-black text-bank-800 mb-3 flex items-center text-sm uppercase tracking-wider"><Sparkles className="w-4 h-4 mr-2 text-bank-600" /> Analyse Intelligente</h4>
                                        <p className="text-gray-700 text-sm leading-relaxed font-medium">{llmInterpretation}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-500 font-medium">
                                <div className="w-20 h-20 bg-bank-50 rounded-full flex items-center justify-center text-bank-200 mb-6 animate-pulse">
                                    <BarChart3 className="w-10 h-10" />
                                </div>
                                <h3 className="text-gray-900 font-bold mb-2">Aucun rendu disponible</h3>
                                <p>Configurez vos variables et cliquez sur "Mettre à jour".</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* PIVOT TAB */}
            {activeTab === 'pivot' && (
                <div className="flex flex-col lg:flex-row gap-6 animate-fade-in-up items-start">
                    {/* Left: Result Area */}
                    <div className="flex-1 space-y-6 w-full lg:w-3/4">
                        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col relative min-h-[650px]">

                            {/* Standard View Header */}
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-bank-500 animate-pulse"></span>
                                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Résultat du TCD</span>
                                </div>
                            </div>

                            {pivotData ? (
                                <div className="ag-theme-quartz" style={{ width: '100%', height: '600px' }}>
                                    <AgGridReact
                                        rowData={pivotData.data}
                                        columnDefs={pivotColDefs}
                                        pagination={true}
                                        paginationPageSize={20}
                                        animateRows={true}
                                        onGridReady={(params) => params.api.sizeColumnsToFit()}
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-400">
                                    <div className="w-24 h-24 bg-gray-50 rounded-3xl flex items-center justify-center mb-6 border border-gray-100 shadow-inner">
                                        <TableIcon className="w-12 h-12 text-gray-200" />
                                    </div>
                                    <h3 className="text-gray-900 font-bold text-lg mb-2">Prêt pour l'analyse</h3>
                                    <p className="max-w-xs text-center text-sm">Organisez les champs sur la droite et cliquez sur "Générer" pour construire votre tableau.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Pivot Builder Panel (Sticky) */}
                    <div className="w-full lg:w-[450px] space-y-4">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCorners}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden sticky top-6">
                                {/* Panel Header */}
                                <div className="px-5 py-4 bg-gray-950 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                                            <TableIcon className="w-4 h-4 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-white font-black text-sm tracking-wide">Constructeur de TCD</p>
                                            <p className="text-white/40 text-[10px] font-medium">Glissez les champs dans les zones</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Mode Excel</span>
                                    </div>
                                </div>

                                {/* Available Fields Zone */}
                                <div className="p-5 border-b border-gray-100 bg-gray-50/20">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                                        <span className="w-4 h-px bg-gray-200 inline-block" />
                                        Champs disponibles
                                        <span className="w-4 h-px bg-gray-200 inline-block" />
                                    </p>
                                    <SortableContext
                                        items={fieldZones[ZONES.AVAILABLE]}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="flex flex-wrap gap-2 min-h-[50px]">
                                            {fieldZones[ZONES.AVAILABLE].map(fieldName => {
                                                const col = columnsInfo.find(c => c.name === fieldName);
                                                return (
                                                    <FieldChip
                                                        key={fieldName}
                                                        id={fieldName}
                                                        zone={ZONES.AVAILABLE}
                                                        dtype={col?.dtype}
                                                    />
                                                );
                                            })}
                                            {fieldZones[ZONES.AVAILABLE].length === 0 && (
                                                <div className="w-full text-center py-4 text-[10px] text-gray-300 italic">Tous les champs sont assignés</div>
                                            )}
                                        </div>
                                    </SortableContext>
                                </div>

                                {/* Quadrants Grid */}
                                <div className="p-6 space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <DropZone id={ZONES.ROWS} label="Lignes" isEmpty={fieldZones[ZONES.ROWS].length === 0}>
                                            {fieldZones[ZONES.ROWS].map(f => (
                                                <FieldChip key={f} id={f} zone={ZONES.ROWS} onRemove={removeField} />
                                            ))}
                                        </DropZone>
                                        <DropZone id={ZONES.COLUMNS} label="Colonnes" isEmpty={fieldZones[ZONES.COLUMNS].length === 0}>
                                            {fieldZones[ZONES.COLUMNS].map(f => (
                                                <FieldChip key={f} id={f} zone={ZONES.COLUMNS} onRemove={removeField} />
                                            ))}
                                        </DropZone>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <DropZone id={ZONES.VALUES} label="Valeurs (Σ)" isEmpty={fieldZones[ZONES.VALUES].length === 0}>
                                            {fieldZones[ZONES.VALUES].map(f => (
                                                <FieldChip
                                                    key={f}
                                                    id={f}
                                                    zone={ZONES.VALUES}
                                                    aggregation={aggregations[f] || 'sum'}
                                                    onAggChange={(col, agg) => setAggregations(prev => ({ ...prev, [col]: agg }))}
                                                    onRemove={removeField}
                                                />
                                            ))}
                                        </DropZone>
                                        <DropZone id={ZONES.FILTERS} label="Filtres" isEmpty={fieldZones[ZONES.FILTERS].length === 0}>
                                            {fieldZones[ZONES.FILTERS].map(f => (
                                                <div key={f} onClick={() => setFilterModalField(f)} className="cursor-pointer group">
                                                    <FieldChip
                                                        id={f}
                                                        zone={ZONES.FILTERS}
                                                        onRemove={removeField}
                                                    />
                                                    {globalFilters[f] && (
                                                        <div className="mt-1 px-2 py-0.5 bg-red-50 rounded-lg text-[9px] font-black text-red-600 uppercase flex items-center justify-between">
                                                            <span className="truncate max-w-[120px]">
                                                                {globalFilters[f].length} sélections
                                                            </span>
                                                            <ChevronDown size={10} />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </DropZone>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="space-y-4 pt-2">
                                        <button
                                            onClick={generatePivot}
                                            disabled={pivotLoading || fieldZones[ZONES.ROWS].length === 0 || fieldZones[ZONES.VALUES].length === 0}
                                            className="w-full py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:shadow-2xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-3"
                                        >
                                            {pivotLoading ? (
                                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Génération...</span></>
                                            ) : (
                                                <><TableIcon size={16} /><span>Générer le TCD</span></>
                                            )}
                                        </button>
                                        <button
                                            onClick={resetAll}
                                            className="w-full py-2.5 rounded-xl border border-red-100 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-200"
                                        >
                                            Vider tout
                                        </button>
                                    </div>
                                </div>

                                {/* Panel Footer */}
                                <div className="p-3 bg-gray-50/80 border-t border-gray-100 flex items-center justify-center">
                                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">TCD • Mode Excel</div>
                                </div>
                            </div>

                            {/* Drag Overlay with Portal */}
                            {createPortal(
                                <DragOverlay
                                    dropAnimation={{
                                        duration: 150,
                                        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                                    }}
                                >
                                    {activeId ? (
                                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-bank-600 text-white text-xs font-bold shadow-2xl rotate-2 scale-110 pointer-events-none z-[999]">
                                            <GripVertical size={12} className="opacity-50" />
                                            {activeId}
                                        </div>
                                    ) : null}
                                </DragOverlay>,
                                document.body
                            )}
                        </DndContext>

                        {/* Filter Modal */}
                        {filterModalField && (
                            <FilterSelector
                                field={filterModalField}
                                activeFilters={globalFilters}
                                onClose={() => setFilterModalField(null)}
                                onSave={(selectedValues) => {
                                    setGlobalFilters(prev => {
                                        const next = { ...prev };
                                        if (selectedValues.length === 0) delete next[filterModalField];
                                        else next[filterModalField] = selectedValues;
                                        return next;
                                    });
                                    setFilterModalField(null);
                                }}
                            />
                        )}

                        {pivotError && (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                                <p className="text-xs font-semibold text-red-800 leading-relaxed">{pivotError}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
