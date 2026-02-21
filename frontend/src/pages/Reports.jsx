import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);
import { BarChart3, Settings2, Download, Table as TableIcon, AlertCircle, Database as DatabaseIcon, Maximize2, Minimize2 } from 'lucide-react';
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

    // Chart States
    const [chartX, setChartX] = useState('');
    const [chartY, setChartY] = useState('');
    const [chartType, setChartType] = useState('bar');
    const [chartData, setChartData] = useState(null);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartError, setChartError] = useState('');
    const [chartTitle, setChartTitle] = useState('');
    const [manualTitle, setManualTitle] = useState('');
    const [isFullData, setIsFullData] = useState(false);
    const echartsRef = useRef(null);

    // Pivot States
    const [pivotRows, setPivotRows] = useState([]);
    const [pivotCol, setPivotCol] = useState('');
    const [pivotValue, setPivotValue] = useState('');
    const [pivotAgg, setPivotAgg] = useState('sum');
    const [pivotData, setPivotData] = useState(null);
    const [pivotLoading, setPivotLoading] = useState(false);
    const [pivotError, setPivotError] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);

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
                    full_data: isFullData
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
    const isCategorical = (type) => type && (type.includes('String') || type.includes('Utf8') || type.includes('Object') || type.includes('Categorical'));

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
        if (pivotRows.length === 0 || !pivotValue) {
            setPivotError("Veuillez sélectionner au moins une ligne et une valeur");
            setPivotData(null);
            return;
        }

        setPivotLoading(true);
        setPivotError('');
        setPivotData(null);

        try {
            const res = await fetch('/api/pivot-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    row_cols: pivotRows,
                    col_col: pivotCol,
                    value_col: pivotValue,
                    agg_func: pivotAgg,
                    full_data: isFullData
                })
            });
            const result = await res.json();

            if (res.ok && result.status === 'success') {
                const rowData = result.rows.map(rowArray => {
                    const rowObj = {};
                    result.headers.forEach((h, i) => { rowObj[h] = rowArray[i] });
                    return rowObj;
                });

                // Add total row at the end
                if (result.totals && result.totals.length > 0) {
                    const totalObj = {};
                    result.headers.forEach((h, i) => { totalObj[h] = result.totals[i] });
                    totalObj.isTotalRow = true;
                    rowData.push(totalObj);
                }

                setPivotData({
                    headers: result.headers,
                    data: rowData,
                    rowCount: result.row_count
                });
            } else {
                setPivotError(result.message || 'Erreur lors de la génération du TCD');
            }
        } catch (e) {
            setPivotError("Impossible de contacter le serveur.");
        } finally {
            setPivotLoading(false);
        }
    };

    const pivotColDefs = useMemo(() => {
        if (!pivotData || !pivotData.headers) return [];
        return pivotData.headers.map((h, i) => ({
            field: h,
            headerName: h,
            filter: true,
            sortable: true,
            resizable: true,
            cellClassRules: {
                'bg-bank-50 font-bold text-bank-900 border-t-2 border-bank-200': (params) => params.data.isTotalRow,
                'bg-gray-50/30 text-bank-700 font-semibold border-l border-gray-100': (params) => i >= pivotRows.length && !params.data.isTotalRow
            }
        }));
    }, [pivotData, pivotRows.length]);

    const handleRowSelect = (e) => {
        const opts = Array.from(e.target.selectedOptions).map(opt => opt.value);
        setPivotRows(opts);
    };

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
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsFullData(!isFullData)}
                                    className={`inline-flex items-center px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full transition-all border ${isFullData
                                        ? 'bg-amber-100 text-amber-700 border-amber-200'
                                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                                        }`}
                                >
                                    <DatabaseIcon className="mr-1.5 h-3 w-3" />
                                    {isFullData ? "Analyse 100%" : "Aperçu 2K"}
                                </button>
                            </div>
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="inline-flex items-center px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-bank-600 bg-bank-50 rounded-full hover:bg-bank-100 transition-all"
                            >
                                <Maximize2 className="mr-1.5 h-3 w-3" />
                                Plein Écran
                            </button>
                        </div>
                        {chartError && <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{chartError}</p>}
                    </div>

                    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px] flex flex-col relative">
                        {isExpanded && chartData && (
                            <div className="fixed inset-0 z-[100] bg-white p-8 flex flex-col animate-in fade-in zoom-in duration-200">
                                <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-bank-600 flex items-center justify-center text-white shadow-lg">
                                            <BarChart3 className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-xl font-black text-gray-900">Analyse Visuelle Étendue</h2>
                                    </div>
                                    <button
                                        onClick={() => setIsExpanded(false)}
                                        className="flex items-center px-4 py-2 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg"
                                    >
                                        <Minimize2 className="mr-2 h-4 w-4" />
                                        Quitter le Plein Écran
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0 w-full h-full bg-gray-50/30 rounded-3xl border border-gray-100/50 p-6 shadow-inner">
                                    <ReactECharts ref={echartsRef} option={getChartOptions()} notMerge={true} style={{ height: '100%', width: '100%' }} />
                                </div>
                            </div>
                        )}
                        {chartData ? (
                            <div className="p-4 flex-1 w-full h-full">
                                <ReactECharts ref={echartsRef} option={getChartOptions()} notMerge={true} style={{ height: '500px', width: '100%' }} />
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
                <div className="space-y-6 animate-fade-in-up">
                    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                            <TableIcon className="w-5 h-5 mr-2 text-bank-600" /> Configuration du TCD
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Lignes</label>
                                <select multiple value={pivotRows} onChange={handleRowSelect} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-bank-500 bg-white h-24">
                                    {columnsInfo.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Colonnes</label>
                                <select value={pivotCol} onChange={e => setPivotCol(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-bank-500 bg-white">
                                    <option value="">— Aucune —</option>
                                    {columnsInfo.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Valeurs</label>
                                <select value={pivotValue} onChange={e => setPivotValue(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-bank-500 bg-white">
                                    <option value="">— Sélectionner —</option>
                                    {columnsInfo.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Agrégation</label>
                                <select value={pivotAgg} onChange={e => setPivotAgg(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-bank-500 bg-white">
                                    <option value="sum">∑ Somme</option>
                                    <option value="mean">μ Moyenne</option>
                                    <option value="count"># Nombre</option>
                                    <option value="min">↓ Minimum</option>
                                    <option value="max">↑ Maximum</option>
                                </select>
                            </div>
                            <div className="md:col-span-1 border-l border-gray-100 pl-4">
                                <button
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className="w-full inline-flex items-center justify-center px-4 py-2 text-[10px] font-black uppercase tracking-widest text-bank-600 bg-bank-50 rounded-xl hover:bg-bank-100 transition-all mb-2"
                                >
                                    <Maximize2 className="mr-1.5 h-3 w-3" />
                                    Plein Écran
                                </button>
                                <button onClick={generatePivot} disabled={pivotLoading} className="w-full px-6 py-2 bg-bank-600 text-white font-black rounded-xl shadow-lg shadow-bank-100 hover:bg-bank-700 hover:-translate-y-0.5 transition-all h-[42px]">
                                    {pivotLoading ? 'Génération...' : 'Générer TCD'}
                                </button>
                            </div>
                        </div>
                        {pivotError && <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{pivotError}</p>}
                    </div>

                    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col relative">
                        {isExpanded && pivotData && (
                            <div className="fixed inset-0 z-[100] bg-white p-8 flex flex-col animate-in fade-in zoom-in duration-200">
                                <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-bank-600 flex items-center justify-center text-white shadow-lg">
                                            <TableIcon className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-xl font-black text-gray-900">Tableau Croisé Étendu</h2>
                                    </div>
                                    <button
                                        onClick={() => setIsExpanded(false)}
                                        className="flex items-center px-4 py-2 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg"
                                    >
                                        <Minimize2 className="mr-2 h-4 w-4" />
                                        Quitter le Plein Écran
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0 ag-theme-quartz rounded-3xl border border-gray-100 shadow-inner overflow-hidden">
                                    <AgGridReact
                                        rowData={pivotData.data}
                                        columnDefs={pivotColDefs}
                                        pagination={true}
                                        paginationPageSize={25}
                                        animateRows={true}
                                        onGridReady={(params) => params.api.sizeColumnsToFit()}
                                    />
                                </div>
                            </div>
                        )}
                        {pivotData ? (
                            <div className="flex-1 min-h-[500px] ag-theme-quartz overflow-hidden">
                                <AgGridReact
                                    rowData={pivotData.data}
                                    columnDefs={pivotColDefs}
                                    pagination={true}
                                    paginationPageSize={15}
                                    animateRows={true}
                                    onGridReady={(params) => params.api.sizeColumnsToFit()}
                                />
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-500">
                                <TableIcon className="w-12 h-12 text-bank-200 mb-4" />
                                <p>Configurez et générez un tableau croisé dynamique.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
