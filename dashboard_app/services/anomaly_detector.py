"""
Anomaly Detection Service.

Provides statistical anomaly detection on Polars DataFrames using configurable
methods (IQR, Z-Score). Results are returned as structured dictionaries ready
for API serialization and optional LLM interpretation.
"""
import polars as pl
from sklearn.ensemble import IsolationForest

class AnomalyDetector:
    def detect(self, df: pl.DataFrame, columns: list[str], method: str, threshold: float) -> tuple[list[dict], list[str]]:
        # Filtre sur les colonnes existantes
        working_cols = [c for c in columns if c in df.columns]
        
        # Séparation Numérique / Non-Numérique
        numeric_cols = [c for c in working_cols if df[c].dtype.is_numeric()]
        non_numeric_cols = [c for c in working_cols if not df[c].dtype.is_numeric()]
        
        skipped_for_method = []
        anomalies_map = {} # row_index -> {values: {}, scores: {}, flags: []}

        def _add_anomaly(row_idx, col, val, score):
            if row_idx not in anomalies_map:
                anomalies_map[row_idx] = {"values": {}, "scores": {}, "flagged_columns": []}
            anomalies_map[row_idx]["values"][col] = val
            anomalies_map[row_idx]["scores"][col] = round(score, 2)
            if col not in anomalies_map[row_idx]["flagged_columns"]:
                anomalies_map[row_idx]["flagged_columns"].append(col)

        # 1. Traitement des Numériques
        if method == "zscore":
            for col in numeric_cols:
                mean = df[col].mean()
                std = df[col].std()
                if std and std > 0:
                    z_scores = ((df[col] - mean) / std).fill_null(0)
                    outliers = df.with_columns(z=z_scores).with_row_index(name="__row_idx__").filter(pl.col("z").abs() > threshold)
                    for row in outliers.to_dicts():
                        _add_anomaly(row["__row_idx__"], col, row[col], abs(row["z"]))
                        
        elif method == "iqr":
            for col in numeric_cols:
                q1 = df[col].quantile(0.25)
                q3 = df[col].quantile(0.75)
                if q1 is not None and q3 is not None:
                    iqr = q3 - q1
                    lower = q1 - threshold * iqr
                    upper = q3 + threshold * iqr
                    outliers = df.with_row_index(name="__row_idx__").filter((pl.col(col) < lower) | (pl.col(col) > upper)).drop_nulls(subset=[col])
                    for row in outliers.to_dicts():
                        val = row[col]
                        dist = (lower - val) if val < lower else (val - upper)
                        _add_anomaly(row["__row_idx__"], col, val, dist)
                        
        elif method == "isolation_forest":
            skipped_for_method = non_numeric_cols
            if numeric_cols:
                pdf = df.select(numeric_cols).to_pandas().fillna(0)
                clf = IsolationForest(contamination='auto', random_state=42)
                clf.fit(pdf)
                preds = clf.predict(pdf)
                scores = clf.decision_function(pdf) # negatif = anomalie
                
                # Récupération des index où predict == -1
                for idx, (pred, score) in enumerate(zip(preds, scores)):
                    if pred == -1:
                        for col in numeric_cols:
                            _add_anomaly(idx, col, df[col][idx], -score)

        # 2. Traitement des Non-Numériques (identique pour toutes les méthodes)
        for col in non_numeric_cols:
            if df[col].dtype in [pl.Date, pl.Datetime]:
                # Datetimes: +/- 3 std
                dt_col = df[col].cast(pl.Int64)
                mean = dt_col.mean()
                std = dt_col.std()
                if std and std > 0:
                    outliers = df.with_row_index(name="__row_idx__").filter(
                        (dt_col < mean - 3 * std) | (dt_col > mean + 3 * std)
                    ).drop_nulls(subset=[col])
                    for row in outliers.to_dicts():
                        _add_anomaly(row["__row_idx__"], col, str(row[col]), 3.0) # Score fixe indicatif
            else:
                # String / Cat : Freq < 1%
                val_counts = df[col].value_counts()
                total = len(df)
                rare_vals = val_counts.filter((pl.col("count") / total) < 0.01)[col].to_list()
                if rare_vals:
                    outliers = df.with_row_index(name="__row_idx__").filter(pl.col(col).is_in(rare_vals))
                    for row in outliers.to_dicts():
                        _add_anomaly(row["__row_idx__"], col, row[col], 1.0) # Score fixe

        # Formatage du retour
        final_anomalies = []
        for idx, data in anomalies_map.items():
            # Ajout des valeurs complètes de toute la ligne pour le contexte front (Optionnel mais pratique)
            row_dict = df.row(idx, named=True)
            final_anomalies.append({
                "row_index": idx,
                "values": row_dict, # On renvoie toute la ligne pour pouvoir la surligner sur le front
                "scores": data["scores"],
                "flagged_columns": data["flagged_columns"]
            })
            
        # Tri par gravité max
        final_anomalies.sort(key=lambda x: max(x["scores"].values() or [0]), reverse=True)
        return final_anomalies, skipped_for_method

anomaly_detector = AnomalyDetector()
