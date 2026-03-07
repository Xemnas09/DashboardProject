import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, AlertTriangle, Info, Plus, ArrowUpDown, Filter } from 'lucide-react';

export default function CardView({
    rows,
    columns,
    anomalies,
    searchQuery,
    sortCol,
    visibleCount,
    onLoadMore,
    isLoading
}) {
    // Local state for "Voir plus" toggle per card
    const [expandedCards, setExpandedCards] = useState({});

    const toggleCard = (index) => {
        setExpandedCards(prev => ({ ...prev, [index]: !prev[index] }));
    };

    // Filter and Sort Logic
    const filteredRows = useMemo(() => {
        let result = [...rows];

        // Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(row =>
                Object.values(row).some(val =>
                    String(val).toLowerCase().includes(query)
                )
            );
        }

        // Sort
        if (sortCol) {
            result.sort((a, b) => {
                const valA = a[sortCol];
                const valB = b[sortCol];
                if (valA < valB) return -1;
                if (valA > valB) return 1;
                return 0;
            });
        }

        return result;
    }, [rows, searchQuery, sortCol]);

    const visibleRows = filteredRows.slice(0, visibleCount);

    if (isLoading) {
        return (
            <div className="space-y-4 p-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white/50 animate-pulse rounded-2xl h-40 border border-gray-100"></div>
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-transparent">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24" style={{ height: 'calc(100vh - 180px)' }}>
                {visibleRows.length === 0 ? (
                    <div className="bg-white/50 rounded-2xl p-8 text-center border border-dashed border-gray-200">
                        <p className="text-gray-400 text-sm font-medium">Aucun résultat trouvé</p>
                    </div>
                ) : (
                    visibleRows.map((row, idx) => {
                        const anomaly = anomalies?.anomalies?.find(a => a.row_index === idx);
                        // Note: row_index in anomalyResult matches some logic. For now using global idx or row identifier if available.
                        // In actual app, we'd need a stable ID.

                        return (
                            <div
                                key={idx}
                                className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 transition-all ${anomaly ? 'border-l-red-500 bg-red-50/30' : 'border-l-transparent'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-bank-500 uppercase tracking-widest leading-none mb-1">Entrée #{idx + 1}</span>
                                        {anomaly && (
                                            <div className="flex items-center gap-1 mt-1">
                                                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-black uppercase tracking-tighter shadow-sm">
                                                    Anomalie détectée
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => toggleCard(idx)}
                                        className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${expandedCards[idx] ? 'rotate-90' : ''}`} />
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {columns.map((col, cIdx) => {
                                        const isHidden = !expandedCards[idx] && cIdx >= 3;
                                        if (isHidden) return null;

                                        const val = row[col.field];
                                        const colAnomaly = anomaly?.details?.find(d => d.column === col.field);

                                        return (
                                            <div key={cIdx} className="flex flex-col">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{col.headerName}</span>
                                                    {colAnomaly && (
                                                        <button
                                                            onClick={() => alert(`Explication: ${colAnomaly.reason}`)}
                                                            className="p-1 text-red-400 hover:text-red-600"
                                                        >
                                                            <Info className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className={`text-sm font-bold truncate ${colAnomaly ? 'text-red-600 bg-red-50 px-1 rounded' : 'text-gray-900'}`}>
                                                    {val === null || val === undefined ? <em className="text-gray-300 font-normal">null</em> : String(val)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}

                {visibleRows.length < filteredRows.length && (
                    <button
                        onClick={onLoadMore}
                        className="w-full py-4 bg-white/50 border border-gray-100 rounded-2xl text-xs font-black text-bank-600 uppercase tracking-widest hover:bg-white transition-all shadow-sm active:scale-95"
                    >
                        Charger 20 de plus
                    </button>
                )}
            </div>
        </div>
    );
}
