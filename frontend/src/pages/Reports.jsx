import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);
import { BarChart3, Settings2, Download, Table as TableIcon, AlertCircle, Database as DatabaseIcon, Filter, X as XIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

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

    // Pivot States
    const [pivotRows, setPivotRows] = useState([]);
    const [pivotCols, setPivotCols] = useState([]);
    const [pivotValues, setPivotValues] = useState([]); // List of { col, agg }
    const [pivotData, setPivotData] = useState(null);
    const [pivotLoading, setPivotLoading] = useState(false);
    const [pivotError, setPivotError] = useState('');
    const [globalFilters, setGlobalFilters] = useState({});
    const generateChartRef = useRef(null);
    const generatePivotRef = useRef(null);
    const isFirstRender = useRef(true);

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

    const toggleField = (colName, colDtype) => {
        // Exclusive selection: remove from wherever it is
        const inRows = pivotRows.includes(colName);
        const inCols = pivotCols.includes(colName);
        const inVals = pivotValues.some(v => v.col === colName);

        if (inRows || inCols || inVals) {
            setPivotRows(prev => prev.filter(x => x !== colName));
            setPivotCols(prev => prev.filter(x => x !== colName));
            setPivotValues(prev => prev.filter(x => x.col !== colName));
        } else {
            // Add based on type
            const dtype = colDtype ? colDtype.toLowerCase() : '';
            const isCat = dtype.includes('string') || dtype.includes('utf8') || dtype.includes('object') || dtype.includes('date') || dtype.includes('categorical');
            if (isCat) setPivotRows(prev => [...prev, colName]);
            else setPivotValues(prev => [...prev, { col: colName, agg: 'sum' }]);
        }
    };

    useEffect(() => {
        fetchColumnsInfo();
        const savedTab = localStorage.getItem('report-active-tab');
        if (savedTab) setActiveTab(savedTab);
    }, []);

    const fetchColumnsInfo = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/reports/columns');
            if (res.ok) {
                const data = await res.json();
                setColumnsInfo(data.columns_info || []);
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

        try {
            const res = await fetch('/api/chart-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    x_column: chartX,
                    y_column: chartY,
                    chart_type: chartType,
                    filters: globalFilters
                })
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
            const res = await fetch('/api/pivot-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    row_cols: pivotRows,
                    col_cols: pivotCols,
                    value_cols: pivotValues.map(v => ({ col: v.col, agg: v.agg })),
                    filters: globalFilters
                })
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
            cellClassRules: {
                'bg-bank-50 font-bold text-bank-900 border-t-2 border-bank-200': (params) => params.data?.isTotalRow,
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
                            <div className="md:col-span-2">
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Type</label>
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
                    </div>

                    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px] flex flex-col relative">
                        {chartData ? (
                            <div className="p-4 flex-1 w-full h-full">
                                <ReactECharts
                                    ref={echartsRef}
                                    option={getChartOptions()}
                                    notMerge={true}
                                    style={{ height: '500px', width: '100%' }}
                                    onEvents={{
                                        'click': (params) => {
                                            // Only filter if clicking a data point/axis label and we have an X column
                                            if (params.name && chartX) {
                                                setGlobalFilters(prev => ({ ...prev, [chartX]: params.name }));
                                            }
                                        }
                                    }}
                                />
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

                    {/* Right: Excel-Style Field List Panel */}
                    <div className="w-full lg:w-[350px] space-y-4">
                        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col overflow-hidden sticky top-6">
                            <div className="p-4 bg-gray-900 text-white flex items-center justify-between">
                                <span className="font-black text-[10px] uppercase tracking-[0.2em]">Champs du TCD</span>
                                <Settings2 className="w-4 h-4 opacity-50" />
                            </div>

                            {/* Field List Container */}
                            <div className="p-4 border-b border-gray-100 max-h-[300px] overflow-y-auto bg-gray-50/30">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-widest px-1">Choisir les champs :</p>
                                <div className="space-y-1">
                                    {columnsInfo.map(col => {
                                        const isAssigned = pivotRows.includes(col.name) || pivotCols.includes(col.name) || pivotValues.some(v => v.col === col.name);
                                        return (
                                            <div
                                                key={col.name}
                                                onClick={() => toggleField(col.name, col.dtype)}
                                                className={`group flex items-center px-3 py-2.5 rounded-xl border cursor-pointer transition-all duration-200 ${isAssigned
                                                    ? 'bg-bank-600 border-bank-600 text-white shadow-lg shadow-bank-100'
                                                    : 'bg-white border-gray-100 hover:border-bank-200 text-gray-700 hover:bg-gray-50'
                                                    }`}
                                            >
                                                <div className={`w-5 h-5 rounded-lg border mr-3 flex items-center justify-center transition-all ${isAssigned ? 'bg-white border-white text-bank-600' : 'bg-gray-50 border-gray-200 group-hover:border-bank-300 shadow-inner'}`}>
                                                    {isAssigned && <div className="w-2 h-2 bg-bank-600 rounded-sm"></div>}
                                                </div>
                                                <span className={`text-sm font-bold truncate flex-1 ${isAssigned ? 'text-white' : 'text-gray-900'}`}>{col.name}</span>
                                                <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-md ${isAssigned ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                    {getFriendlyType(col.dtype).split(' ')[0]}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Quadrants (Drag zones simplified as Areas) */}
                            <div className="p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Rows Zone */}
                                    <div className="border border-gray-100 rounded-2xl p-4 bg-blue-50/30">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                                            <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Lignes</p>
                                        </div>
                                        <div className="min-h-[80px] space-y-2">
                                            {pivotRows.length > 0 ? pivotRows.map(r => (
                                                <div key={r} className="flex items-center bg-white border border-blue-100 px-3 py-2 rounded-xl text-[12px] font-bold text-blue-900 shadow-sm animate-in zoom-in duration-200">
                                                    <span className="flex-1 truncate">{r}</span>
                                                    <button onClick={() => setPivotRows(prev => prev.filter(x => x !== r))} className="ml-2 w-5 h-5 flex items-center justify-center bg-blue-50 text-blue-400 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors">×</button>
                                                </div>
                                            )) : <div className="text-[10px] text-blue-300 italic py-6 text-center">Déposer les lignes ici</div>}
                                            <select
                                                defaultValue=""
                                                onChange={e => {
                                                    if (e.target.value) {
                                                        const val = e.target.value;
                                                        setPivotCols(prev => prev.filter(x => x !== val));
                                                        setPivotValues(prev => prev.filter(x => x.col !== val));
                                                        setPivotRows(prev => [...new Set([...prev, val])]);
                                                        e.target.value = "";
                                                    }
                                                }}
                                                className="w-full bg-white border border-blue-100/50 rounded-lg text-[10px] font-bold text-blue-600 outline-none p-2 shadow-sm focus:border-blue-300"
                                            >
                                                <option value="">+ Ajouter...</option>
                                                {columnsInfo.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    {/* Columns Zone */}
                                    <div className="border border-gray-100 rounded-2xl p-4 bg-amber-50/30">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-1.5 h-6 bg-amber-500 rounded-full"></div>
                                            <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Colonnes</p>
                                        </div>
                                        <div className="min-h-[80px] space-y-2">
                                            {pivotCols.length > 0 ? pivotCols.map(c => (
                                                <div key={c} className="flex items-center bg-white border border-amber-100 px-3 py-2 rounded-xl text-[12px] font-bold text-amber-900 shadow-sm animate-in zoom-in duration-200">
                                                    <span className="flex-1 truncate">{c}</span>
                                                    <button onClick={() => setPivotCols(prev => prev.filter(x => x !== c))} className="ml-2 w-5 h-5 flex items-center justify-center bg-amber-50 text-amber-400 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors">×</button>
                                                </div>
                                            )) : <div className="text-[10px] text-amber-300 italic py-6 text-center">Déposer les colonnes ici</div>}
                                            <select
                                                defaultValue=""
                                                onChange={e => {
                                                    if (e.target.value) {
                                                        const val = e.target.value;
                                                        setPivotRows(prev => prev.filter(x => x !== val));
                                                        setPivotValues(prev => prev.filter(x => x.col !== val));
                                                        setPivotCols(prev => [...new Set([...prev, val])]);
                                                        e.target.value = "";
                                                    }
                                                }}
                                                className="w-full bg-white border border-amber-100/50 rounded-lg text-[10px] font-bold text-amber-600 outline-none p-2 shadow-sm focus:border-amber-300"
                                            >
                                                <option value="">+ Ajouter...</option>
                                                {columnsInfo.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Values Zone */}
                                    <div className="border border-gray-100 rounded-2xl p-4 bg-emerald-50/30">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
                                            <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">Valeurs</p>
                                        </div>
                                        <div className="min-h-[80px] space-y-3">
                                            {pivotValues.length > 0 ? pivotValues.map((v, idx) => (
                                                <div key={v.col} className="bg-white border border-emerald-100 p-3 rounded-xl shadow-sm animate-in zoom-in duration-200">
                                                    <div className="flex items-center mb-2">
                                                        <span className="flex-1 truncate text-[12px] font-black text-emerald-900">{v.col}</span>
                                                        <button onClick={() => setPivotValues(prev => prev.filter(x => x.col !== v.col))} className="ml-2 w-5 h-5 flex items-center justify-center bg-red-50 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-all">×</button>
                                                    </div>
                                                    <select
                                                        value={v.agg}
                                                        onChange={e => {
                                                            const newVals = [...pivotValues];
                                                            newVals[idx].agg = e.target.value;
                                                            setPivotValues(newVals);
                                                        }}
                                                        className="w-full bg-emerald-50 text-[10px] font-black uppercase text-emerald-700 rounded-lg px-2 py-1.5 outline-none border border-emerald-100"
                                                    >
                                                        <option value="sum">Σ Somme</option>
                                                        <option value="mean">μ Moyenne</option>
                                                        <option value="count"># Nombre</option>
                                                        <option value="min">↓ Min</option>
                                                        <option value="max">↑ Max</option>
                                                    </select>
                                                </div>
                                            )) : <div className="text-[10px] text-emerald-300 italic py-6 text-center">Déposer les valeurs ici</div>}
                                            {pivotValues.length < 5 && (
                                                <select
                                                    defaultValue=""
                                                    onChange={e => {
                                                        if (e.target.value) {
                                                            const val = e.target.value;
                                                            setPivotRows(prev => prev.filter(x => x !== val));
                                                            setPivotCols(prev => prev.filter(x => x !== val));
                                                            setPivotValues(prev => [...prev, { col: val, agg: 'sum' }]);
                                                            e.target.value = "";
                                                        }
                                                    }}
                                                    className="w-full bg-white border border-emerald-100/50 rounded-lg text-[10px] font-bold text-emerald-600 outline-none p-2 shadow-sm focus:border-emerald-300"
                                                >
                                                    <option value="">+ Valeur...</option>
                                                    {columnsInfo.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                    {/* Action Zone (Simplified) */}
                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={generatePivot}
                                            disabled={pivotLoading}
                                            className="flex-1 w-full bg-gradient-to-br from-gray-800 to-gray-950 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-2"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                                                <TableIcon className="w-5 h-5 text-bank-400" />
                                            </div>
                                            {pivotLoading ? "Génération..." : "Générer TCD"}
                                        </button>
                                        <button
                                            onClick={() => { setPivotRows([]); setPivotCols([]); setPivotValues([]); setPivotData(null); }}
                                            className="p-3 rounded-xl border border-red-100 bg-red-50/50 text-red-600 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                        >
                                            Vider Tout
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Panel Footer */}
                            <div className="p-3 bg-gray-50/80 border-t border-gray-100 flex items-center justify-center">
                                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">TCD • Mode Excel</div>
                            </div>
                        </div>

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
