import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);
import { BarChart3, Settings2, Download, Table as TableIcon, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Reports({ addNotification }) {
    const [columnsInfo, setColumnsInfo] = useState([]);
    const [activeTab, setActiveTab] = useState('charts');
    const [loading, setLoading] = useState(true);

    // Chart States
    const [chartX, setChartX] = useState('');
    const [chartY, setChartY] = useState('');
    const [chartType, setChartType] = useState('bar');
    const [chartData, setChartData] = useState(null);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartError, setChartError] = useState('');
    const echartsRef = useRef(null);

    // Pivot States
    const [pivotRows, setPivotRows] = useState([]);
    const [pivotCol, setPivotCol] = useState('');
    const [pivotValue, setPivotValue] = useState('');
    const [pivotAgg, setPivotAgg] = useState('sum');
    const [pivotData, setPivotData] = useState(null);
    const [pivotLoading, setPivotLoading] = useState(false);
    const [pivotError, setPivotError] = useState('');

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
                body: JSON.stringify({ x_column: chartX, y_column: chartY, chart_type: chartType })
            });
            const result = await res.json();

            if (res.ok && result.status === 'success') {
                setChartData(result);
            } else {
                setChartError(result.message || 'Erreur lors de la génération');
            }
        } catch (e) {
            setChartError("Impossible de contacter le serveur.");
        } finally {
            setChartLoading(false);
        }
    };

    const getChartOptions = () => {
        if (!chartData) return {};
        const d = chartData;
        const colorPalette = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4'];
        const tooltipStyle = { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#e5e7eb', textStyle: { color: '#374151' } };

        if (d.chart_type === 'pie') {
            return {
                color: colorPalette,
                tooltip: { trigger: 'item', ...tooltipStyle },
                legend: { type: 'scroll', bottom: 10 },
                series: [{
                    type: 'pie', radius: ['35%', '65%'], center: ['50%', '45%'],
                    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                    data: d.data
                }]
            };
        }
        if (d.chart_type === 'scatter') {
            return {
                color: colorPalette,
                tooltip: { trigger: 'item', formatter: (p) => `${d.x_name}: ${p.value[0]}<br/>${d.y_name}: ${p.value[1]}`, ...tooltipStyle },
                xAxis: { type: 'value', name: d.x_name },
                yAxis: { type: 'value', name: d.y_name },
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
                color: colorPalette, tooltip: { trigger: 'item', ...tooltipStyle },
                xAxis: { type: 'category', data: d.categories },
                yAxis: { type: 'value', name: d.y_name },
                series: series
            };
        }

        const seriesType = d.chart_type === 'area' ? 'line' : d.chart_type;
        return {
            color: colorPalette,
            tooltip: { trigger: 'axis', axisPointer: { type: d.chart_type === 'bar' ? 'shadow' : 'line' }, ...tooltipStyle },
            xAxis: { type: 'category', data: d.labels },
            yAxis: { type: 'value', name: d.y_name },
            series: [{ type: seriesType, data: d.values, areaStyle: d.chart_type === 'area' ? { opacity: 0.15 } : undefined }]
        };
    };

    // Statistical Constraints Logic
    const xColType = useMemo(() => {
        const col = columnsInfo.find(c => c.name === chartX);
        return col ? col.type : null;
    }, [chartX, columnsInfo]);

    const yColType = useMemo(() => {
        const col = columnsInfo.find(c => c.name === chartY);
        return col ? col.type : null;
    }, [chartY, columnsInfo]);

    const isNumeric = (type) => ['float64', 'int64', 'numeric'].includes(type);
    const isCategorical = (type) => ['object', 'string', 'categorical'].includes(type);

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
                body: JSON.stringify({ row_cols: pivotRows, col_col: pivotCol, value_col: pivotValue, agg_func: pivotAgg })
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
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Variable X</label>
                                <select value={chartX} onChange={e => setChartX(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-bank-500 bg-white">
                                    <option value="">— Sélectionner —</option>
                                    {columnsInfo.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Variable Y</label>
                                <select value={chartY} onChange={e => setChartY(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-bank-500 bg-white">
                                    <option value="">— Aucune (comptage) —</option>
                                    {columnsInfo.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Type de graphique</label>
                                <select value={chartType} onChange={e => setChartType(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-bank-500 bg-white">
                                    <option value="bar" disabled={!availableCharts.includes('bar')}>📊 Histogramme {(!availableCharts.includes('bar') && chartX) ? '(Y Numérique requis)' : ''}</option>
                                    <option value="line" disabled={!availableCharts.includes('line')}>📈 Ligne {(!availableCharts.includes('line') && chartX) ? '(Y Numérique requis)' : ''}</option>
                                    <option value="pie" disabled={!availableCharts.includes('pie')}>🥧 Circulaire {(!availableCharts.includes('pie') && chartX) ? '(X Catégoriel requis)' : ''}</option>
                                    <option value="area" disabled={!availableCharts.includes('area')}>📉 Aire {(!availableCharts.includes('area') && chartX) ? '(Y Numérique requis)' : ''}</option>
                                    <option value="scatter" disabled={!availableCharts.includes('scatter')}>🔵 Nuage points {(!availableCharts.includes('scatter') && chartX) ? '(X et Y Numériques requis)' : ''}</option>
                                    <option value="boxplot" disabled={!availableCharts.includes('boxplot')}>📦 Boxplot {(!availableCharts.includes('boxplot') && chartX) ? '(X Catég. et Y Numérique requis)' : ''}</option>
                                </select>
                            </div>
                            <div>
                                <button onClick={generateChart} disabled={chartLoading} className="w-full px-6 py-2 bg-bank-600 text-white font-medium rounded-lg shadow-sm hover:bg-bank-700 flex items-center justify-center">
                                    {chartLoading ? 'Génération...' : 'Générer'}
                                </button>
                            </div>
                        </div>
                        {chartError && <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{chartError}</p>}
                    </div>

                    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">
                        {chartData ? (
                            <div className="p-4 flex-1 w-full h-full">
                                <ReactECharts ref={echartsRef} option={getChartOptions()} style={{ height: '500px', width: '100%' }} />
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-500">
                                <BarChart3 className="w-12 h-12 text-bank-200 mb-4" />
                                <p>Configurez et générez un graphique pour le visualiser ici.</p>
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
                            <div>
                                <button onClick={generatePivot} disabled={pivotLoading} className="w-full px-6 py-2 bg-bank-600 text-white font-medium rounded-lg shadow-sm hover:bg-bank-700 flex items-center justify-center h-[42px]">
                                    {pivotLoading ? 'Génération...' : 'Générer'}
                                </button>
                            </div>
                        </div>
                        {pivotError && <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{pivotError}</p>}
                    </div>

                    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                        {pivotData ? (
                            <div className="p-4 w-full">
                                <div className="ag-theme-quartz" style={{ height: 600, width: '100%' }}>
                                    <AgGridReact
                                        rowData={pivotData.data}
                                        columnDefs={pivotColDefs}
                                        suppressRowClickSelection={true}
                                    />
                                </div>
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
