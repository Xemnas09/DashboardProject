"""
Safe recursive descent formula parser.
Converts a math formula string into a Polars expression.
Unchanged business logic from the Flask app, extracted as a standalone module.
"""
import polars as pl


def parse_formula(formula: str, valid_columns: list[str]) -> pl.Expr:
    """
    Parses a simple math formula string into a Polars expression.
    Supports: column names (quoted or unquoted), +, -, *, /, parentheses, numeric literals.

    Examples:
        "Ventes - Coûts"            => pl.col("Ventes") - pl.col("Coûts")
        "(Prix * Quantité) / 100"   => (pl.col("Prix") * pl.col("Quantité")) / pl.lit(100)
        '"Chiffre d\\'affaires"'     => pl.col("Chiffre d'affaires")
    """
    # --- Tokenizer ---
    tokens = []
    i = 0
    formula_str = formula.strip()

    while i < len(formula_str):
        c = formula_str[i]

        # Skip whitespace
        if c == ' ':
            i += 1
            continue

        # Operators and parens
        if c in '+-*/()':
            tokens.append(('OP', c))
            i += 1
            continue

        # Quoted column name
        if c in '"\'':
            quote = c
            j = i + 1
            while j < len(formula_str) and formula_str[j] != quote:
                j += 1
            col_name = formula_str[i + 1:j]
            if col_name not in valid_columns:
                raise ValueError(f'Colonne "{col_name}" introuvable')
            tokens.append(('COL', col_name))
            i = j + 1
            continue

        # Number (int or float)
        if c.isdigit() or c == '.':
            j = i
            while j < len(formula_str) and (formula_str[j].isdigit() or formula_str[j] == '.'):
                j += 1
            tokens.append(('NUM', float(formula_str[i:j])))
            i = j
            continue

        # Unquoted column name — greedy match
        matched = None
        for col in sorted(valid_columns, key=len, reverse=True):
            if formula_str[i:i + len(col)] == col:
                end = i + len(col)
                if end >= len(formula_str) or not formula_str[end].isalnum():
                    matched = col
                    break

        if matched:
            tokens.append(('COL', matched))
            i += len(matched)
            continue

        raise ValueError(f'Caractère inattendu: "{c}" à la position {i}')

    if not tokens:
        raise ValueError('Formule vide')

    # --- Recursive descent parser ---
    pos = [0]

    def peek():
        return tokens[pos[0]] if pos[0] < len(tokens) else None

    def consume():
        t = tokens[pos[0]]
        pos[0] += 1
        return t

    def parse_expr():
        left = parse_term()
        while peek() and peek()[0] == 'OP' and peek()[1] in '+-':
            op = consume()[1]
            right = parse_term()
            left = (left + right) if op == '+' else (left - right)
        return left

    def parse_term():
        left = parse_factor()
        while peek() and peek()[0] == 'OP' and peek()[1] in '*/':
            op = consume()[1]
            right = parse_factor()
            left = (left * right) if op == '*' else (left / right)
        return left

    def parse_factor():
        token = peek()
        if token is None:
            raise ValueError('Expression incomplète')

        if token[0] == 'OP' and token[1] == '(':
            consume()
            expr = parse_expr()
            if not peek() or peek()[1] != ')':
                raise ValueError('Parenthèse fermante manquante')
            consume()
            return expr

        if token[0] == 'OP' and token[1] == '-':
            consume()
            return -parse_factor()

        if token[0] == 'COL':
            consume()
            return pl.col(token[1]).cast(pl.Float64, strict=False)

        if token[0] == 'NUM':
            consume()
            return pl.lit(token[1])

        raise ValueError(f'Élément inattendu: {token}')

    result = parse_expr()

    if pos[0] < len(tokens):
        raise ValueError('Formule invalide: éléments restants après la fin')

    return result
