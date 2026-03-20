"""
Shared configurations for data type identification and semantic classification.
Acts as the single source of truth for both Ingestion (type_inference) 
and Analysis (column_classifier).
"""

# --- BOOLEAN MARKERS ---
# Values recognized as representing "True" or "Positive" states.
BOOLEAN_TRUE_MARKERS = {1, 1.0, "1", "true", "vrai", "oui", "yes", "y", "t"}

# Values recognized as representing "False" or "Negative" states.
BOOLEAN_FALSE_MARKERS = {0, 0.0, "0", "false", "faux", "non", "no", "n", "f"}

# Combined set of all boolean-like indicators
BOOLEAN_ALL_MARKERS = BOOLEAN_TRUE_MARKERS.union(BOOLEAN_FALSE_MARKERS)

# --- CARDINALITY ---
# The threshold under which a numeric variable is considered Qualitative (Nominal/Ordinal)
# rather than Quantitative (Discrete/Continuous).
CARDINALITY_THRESHOLD = 30

# --- TEMPORAL ---
# Mapping of French and English month names to their numeric representation (MM).
# Used for parsing text-based dates like "Mars 2023".
MONTH_MAP = {
    # French
    'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04', 'mai': '05', 'juin': '06',
    'juillet': '07', 'août': '08', 'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12',
    'janv': '01', 'févr': '02', 'avr': '04', 'juil': '07', 'sept': '09', 'octo': '10', 'nove': '11', 'déce': '12',
    # English
    'january': '01', 'february': '02', 'march': '03', 'april': '04', 'may': '05', 'june': '06',
    'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12',
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
}

# --- SEMANTIC HINTS ---
# Keywords used to identify measurements (Quantitative) even with low cardinality.
MEASURE_KEYWORDS = [
    'prix', 'price', 'age', 'valeur', 'value', 'amount', 'montant', 
    'taux', 'rate', 'ht', 'ttc', 'score', 'note'
]

# Keywords used to identify identifiers (Qualitative/Discrete).
ID_KEYWORDS = [
    'id', 'uuid', 'ref', 'pk', 'code', 'index', 'key', 'idx', 'num', 'no'
]
