"""
Anomaly Detection Service — Refonte v2.0

Three detection methods with enriched output:
  - Z-Score (scipy-based): for symmetric distributions
  - IQR (Tukey's Fences): non-parametric, robust for financial data
  - Isolation Forest: multivariate ML detection with RobustScaler

All methods produce normalized 0→1 scores and structured responses.
"""
import numpy as np
import polars as pl
from scipy import stats
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler
from loguru import logger


# ─── Sensitivity presets ─────────────────────────────────────────────────────
SENSITIVITY_PARAMS = {
    "strict":   {"zscore_threshold": 2.5, "iqr_multiplier": 1.5, "contamination": 0.05},
    "standard": {"zscore_threshold": 3.0, "iqr_multiplier": 2.0, "contamination": 0.10},
    "loose":    {"zscore_threshold": 3.5, "iqr_multiplier": 3.0, "contamination": 0.15},
}

METHOD_LABELS = {
    "zscore": "Z-Score",
    "iqr": "IQR (Tukey)",
    "isolation_forest": "Isolation Forest",
}


# ─── Severity classification ─────────────────────────────────────────────────
def get_severity(score: float) -> tuple[str, str]:
    """Returns (severity_key, severity_label) based on normalized score 0→1."""
    if score >= 0.75:
        return "high", "Critique"
    if score >= 0.45:
        return "moderate", "Modéré"
    return "low", "Faible"


def get_global_severity(anomaly_rate: float) -> tuple[str, str]:
    """Overall dataset severity based on anomaly rate (0→1 ratio)."""
    if anomaly_rate >= 0.05:
        return "high", "Élevé"
    if anomaly_rate >= 0.01:
        return "moderate", "Modéré"
    return "low", "Faible"


# ─── Score computation engines ────────────────────────────────────────────────
def compute_zscore_scores(df_pandas, threshold: float):
    """Z-Score via scipy. Returns normalized 0→1 scores and labels."""
    z_abs = np.abs(stats.zscore(df_pandas.fillna(df_pandas.median()), nan_policy="omit"))
    max_z = np.nanmax(z_abs, axis=1)
    labels = np.where(max_z > threshold, -1, 1)
    normalized = np.clip(max_z / (threshold * 2), 0, 1)
    # Per-column z-scores for contributing column identification
    return {"scores": normalized, "labels": labels, "col_scores": z_abs}


def compute_iqr_scores(df_pandas, multiplier: float):
    """Tukey IQR. Returns normalized 0→1 scores and labels."""
    Q1 = df_pandas.quantile(0.25)
    Q3 = df_pandas.quantile(0.75)
    IQR = Q3 - Q1
    lower = Q1 - multiplier * IQR
    upper = Q3 + multiplier * IQR
    is_outlier = ((df_pandas < lower) | (df_pandas > upper)).any(axis=1)
    # Deviation relative to IQR
    deviations = ((df_pandas - df_pandas.median()) / (IQR.replace(0, np.nan).fillna(1))).abs()
    max_dev = deviations.max(axis=1)
    normalized = np.clip(max_dev / (multiplier * 3), 0, 1)
    labels = np.where(is_outlier, -1, 1)
    return {"scores": normalized, "labels": labels, "col_scores": deviations.values}


def compute_isolation_forest_scores(df_pandas, contamination: float):
    """Isolation Forest with RobustScaler. Returns normalized 0→1 scores."""
    scaler = RobustScaler()
    X = scaler.fit_transform(df_pandas.fillna(df_pandas.median()))
    clf = IsolationForest(
        contamination=contamination,
        random_state=42,
        n_estimators=100,
    )
    clf.fit(X)
    raw_scores = clf.score_samples(X)
    score_range = raw_scores.max() - raw_scores.min()
    if score_range == 0:
        normalized = np.zeros_like(raw_scores)
    else:
        normalized = 1 - (raw_scores - raw_scores.min()) / score_range
    labels = clf.predict(X)  # -1 = anomaly
    # Per-column contribution: absolute scaled values
    col_scores = np.abs(X)
    return {"scores": normalized, "labels": labels, "col_scores": col_scores}


# ─── Contributing column identification ──────────────────────────────────────
def get_contributing_columns(row_idx: int, col_scores, columns: list[str], top_n: int = 2) -> list[str]:
    """Returns the top-N columns with highest deviation for a given row."""
    row_scores = col_scores[row_idx]
    if len(row_scores) == 0:
        return columns[:top_n]
    indices = np.argsort(row_scores)[::-1][:top_n]
    return [columns[i] for i in indices if i < len(columns)]


# ─── Score label generator ────────────────────────────────────────────────────
def make_score_label(row_values: dict, contributing_cols: list[str], medians: dict) -> str:
    """Generates a human-readable deviation label like '×4.2 la médiane'."""
    if not contributing_cols:
        return "Déviation détectée"
    
    col = contributing_cols[0]
    val = row_values.get(col)
    med = medians.get(col)
    
    if val is None or med is None or med == 0:
        return f"Valeur atypique sur {col}"
    
    try:
        ratio = abs(float(val) / float(med))
        if ratio >= 2:
            return f"×{ratio:.1f} la médiane"
        else:
            diff_pct = abs((float(val) - float(med)) / float(med)) * 100
            return f"{diff_pct:.0f}% d'écart à la médiane"
    except (ValueError, TypeError, ZeroDivisionError):
        return f"Valeur atypique sur {col}"


# ─── Main orchestrator ────────────────────────────────────────────────────────
def detect_anomalies(
    df: pl.DataFrame,
    method: str,
    sensitivity: str,
    columns: list[str],
) -> dict:
    """
    Main detection function. Returns the enriched response dict.
    """
    params = SENSITIVITY_PARAMS[sensitivity]
    total_rows = len(df)

    # Resolve columns — default to all numeric
    all_numeric = [c for c in df.columns if df[c].dtype.is_numeric()]
    working_cols = [c for c in columns if c in all_numeric] if columns else all_numeric

    if not working_cols:
        return _empty_response(method, total_rows, working_cols)

    numeric_df = df.select(working_cols).to_pandas()

    # Run the selected detection method
    if method == "zscore":
        result = compute_zscore_scores(numeric_df, params["zscore_threshold"])
    elif method == "iqr":
        result = compute_iqr_scores(numeric_df, params["iqr_multiplier"])
    elif method == "isolation_forest":
        result = compute_isolation_forest_scores(numeric_df, params["contamination"])
    else:
        return _empty_response(method, total_rows, working_cols)

    # Build enriched response
    return build_response(df, numeric_df, result, working_cols, method, total_rows)


def build_response(
    df: pl.DataFrame,
    numeric_df,
    result: dict,
    columns: list[str],
    method: str,
    total_rows: int,
) -> dict:
    """Builds the enriched API response from raw detection results."""
    scores = result["scores"]
    labels = result["labels"]
    col_scores = result["col_scores"]

    # Compute reference statistics
    medians = {col: float(numeric_df[col].median()) for col in columns if not np.isnan(numeric_df[col].median())}
    q1s = {col: float(numeric_df[col].quantile(0.25)) for col in columns}
    q3s = {col: float(numeric_df[col].quantile(0.75)) for col in columns}

    # Build anomaly rows (only where label == -1)
    anomalies = []
    severity_counts = {"high": 0, "moderate": 0, "low": 0}
    column_freq = {}

    for idx in range(len(labels)):
        if labels[idx] != -1:
            continue

        score = float(scores[idx])
        severity_key, severity_label = get_severity(score)
        severity_counts[severity_key] += 1

        contributing = get_contributing_columns(idx, col_scores, columns, top_n=2)
        for c in contributing:
            column_freq[c] = column_freq.get(c, 0) + 1

        # Get full row values
        try:
            row_dict = df.row(idx, named=True)
            # Ensure JSON-safe values
            safe_values = {}
            for k, v in row_dict.items():
                if v is None:
                    safe_values[k] = None
                elif hasattr(v, 'isoformat'):
                    safe_values[k] = str(v)
                else:
                    safe_values[k] = v
        except Exception:
            safe_values = {c: numeric_df.iloc[idx][c] for c in columns}

        # Build normal ranges for contributing columns
        normal_ranges = {}
        for c in contributing:
            normal_ranges[c] = {
                "median": medians.get(c),
                "q1": q1s.get(c),
                "q3": q3s.get(c),
            }

        score_label = make_score_label(safe_values, contributing, medians)

        anomalies.append({
            "row_index": idx,
            "severity": severity_key,
            "severity_label": severity_label,
            "score": round(score, 4),
            "score_label": score_label,
            "contributing_columns": contributing,
            "values": safe_values,
            "normal_ranges": normal_ranges,
        })

    # Sort by score descending (most severe first)
    anomalies.sort(key=lambda x: x["score"], reverse=True)

    anomaly_count = len(anomalies)
    anomaly_rate = anomaly_count / total_rows if total_rows > 0 else 0

    # Top impacted columns
    top_columns = sorted(column_freq, key=column_freq.get, reverse=True)[:5]

    global_sev, global_sev_label = get_global_severity(anomaly_rate)

    return {
        "status": "success",
        "method": method,
        "method_label": METHOD_LABELS.get(method, method),
        "total_rows": total_rows,
        "anomaly_count": anomaly_count,
        "anomaly_rate": round(anomaly_rate, 6),
        "severity": global_sev,
        "severity_label": global_sev_label,
        "columns_analyzed": columns,
        "anomalies": anomalies,
        "summary_stats": {
            "by_severity": severity_counts,
            "top_columns": top_columns,
        },
    }


def _empty_response(method: str, total_rows: int, columns: list[str]) -> dict:
    """Returns a valid empty response when no analysis can be performed."""
    return {
        "status": "success",
        "method": method,
        "method_label": METHOD_LABELS.get(method, method),
        "total_rows": total_rows,
        "anomaly_count": 0,
        "anomaly_rate": 0.0,
        "severity": "low",
        "severity_label": "Faible",
        "columns_analyzed": columns,
        "anomalies": [],
        "summary_stats": {
            "by_severity": {"high": 0, "moderate": 0, "low": 0},
            "top_columns": [],
        },
    }
