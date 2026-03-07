"""
Safe recursive descent expression parser.
Converts a math expression string into a Polars expression.
Unchanged business logic from the Flask app, extracted as a standalone module.
"""
import polars as pl


def parse_expression(expression: str, valid_columns: list[str]) -> pl.Expr:
    """
    Parses a math expression string into a Polars expression.
    Supports: 
    - f['col'], f["col"], "col", 'col', unquoted_col
    - Operators: +, -, *, /, ** (power)
    - Functions: ABS, ROUND, SQRT, LOG, LN, EXP
    - Parentheses and numeric literals.
    """
    # --- Tokenizer ---
    tokens = []
    i = 0
    expr_str = expression.strip()

    while i < len(expr_str):
        c = expr_str[i]
        if c == ' ':
            i += 1
            continue

        # Exponentiation **
        if expr_str[i:i + 2] == '**':
            tokens.append(('OP', '**'))
            i += 2
            continue

        # Operators and parens
        if c in '+-*/(),':
            tokens.append(('OP', c))
            i += 1
            continue

        # f['col'] or f["col"]
        if expr_str[i:i+3] in ["f['", 'f["'] and len(expr_str) > i+3:
            quote = expr_str[i+2]
            j = i + 3
            while j < len(expr_str) and expr_str[j] != quote:
                j += 1
            col_name = expr_str[i+3:j]
            if col_name not in valid_columns:
                raise ValueError(f'Colonne "{col_name}" introuvable')
            
            # Check for closing ]
            if j + 1 < len(expr_str) and expr_str[j+1] == ']':
                tokens.append(('COL', col_name))
                i = j + 2
                continue
            else:
                raise ValueError(f'Crochet fermant "]" manquant après la colonne "{col_name}"')

        # Quoted column name "col" or 'col'
        if c in '"\'':
            quote = c
            j = i + 1
            while j < len(expr_str) and expr_str[j] != quote:
                j += 1
            col_name = expr_str[i + 1:j]
            # Check if this might be an identifier or a column
            if col_name in valid_columns:
                tokens.append(('COL', col_name))
                i = j + 1
                continue
            else:
                # If not a column, maybe it's just a string (not supported as literal yet, but let's handle as error for now)
                raise ValueError(f'Colonne "{col_name}" introuvable')

        # Number (int or float)
        if c.isdigit() or c == '.':
            j = i
            while j < len(expr_str) and (expr_str[j].isdigit() or expr_str[j] == '.'):
                j += 1
            tokens.append(('NUM', float(expr_str[i:j])))
            i = j
            continue

        # Identifiers (Functions or Unquoted Columns)
        if c.isalpha() or c == '_':
            j = i
            while j < len(expr_str) and (expr_str[j].isalnum() or expr_str[j] == '_'):
                j += 1
            ident = expr_str[i:j]
            
            # Check if it's a function
            if ident.upper() in ['ABS', 'ROUND', 'SQRT', 'LOG', 'LN', 'EXP']:
                tokens.append(('FUNC', ident.upper()))
            # Check if it's an unquoted column
            elif ident in valid_columns:
                tokens.append(('COL', ident))
            else:
                # Greedy column match for names with spaces or special chars if they weren't matched yet
                # (Existing logic fallback for unquoted columns with spaces - though f['...'] is preferred)
                matched = None
                for col in sorted(valid_columns, key=len, reverse=True):
                    if expr_str[i:i + len(col)] == col:
                        matched = col
                        break
                if matched:
                    tokens.append(('COL', matched))
                    j = i + len(matched)
                else:
                    raise ValueError(f'Élément inconnu: "{ident}"')
            i = j
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
        left = parse_power()
        while peek() and peek()[0] == 'OP' and peek()[1] in '*/':
            op = consume()[1]
            right = parse_power()
            left = (left * right) if op == '*' else (left / right)
        return left

    def parse_power():
        left = parse_factor()
        while peek() and peek()[0] == 'OP' and peek()[1] == '**':
            consume()
            right = parse_factor()
            left = left ** right
        return left

    def parse_factor():
        token = peek()
        if token is None:
            raise ValueError('Expression incomplète')

        # Parentheses
        if token[0] == 'OP' and token[1] == '(':
            consume()
            expr = parse_expr()
            if not peek() or peek()[1] != ')':
                raise ValueError('Parenthèse fermante manquante')
            consume()
            return expr

        # Unary Minus
        if token[0] == 'OP' and token[1] == '-':
            consume()
            return -parse_factor()

        # Functions: FUNC(arg, [arg2])
        if token[0] == 'FUNC':
            func_name = consume()[1]
            if not peek() or peek()[1] != '(':
                raise ValueError(f'Parenthèse ouvrante requise après {func_name}')
            consume() # consume '('
            
            args = []
            if peek() and peek()[1] != ')':
                args.append(parse_expr())
                while peek() and peek()[1] == ',':
                    consume()
                    # For ROUND/LOG, try to get a raw number for the second argument if it's a literal
                    if peek() and peek()[0] == 'NUM':
                        args.append(consume()[1])
                    else:
                        args.append(parse_expr())
            
            if not peek() or peek()[1] != ')':
                raise ValueError(f'Parenthèse fermante requise pour {func_name}')
            consume() # consume ')'

            # Map to Polars
            if func_name == 'ABS': return args[0].abs()
            if func_name == 'ROUND': 
                decimals = int(args[1]) if len(args) > 1 and isinstance(args[1], (int, float)) else 0
                return args[0].round(decimals)
            if func_name == 'SQRT': return args[0].sqrt()
            if func_name == 'LOG': 
                base = float(args[1]) if len(args) > 1 and isinstance(args[1], (int, float)) else 10.0
                return args[0].log(base=base)
            if func_name == 'LN': return args[0].log()
            if func_name == 'EXP': return args[0].exp()
            
            raise ValueError(f"Fonction non supportée: {func_name}")

        # Columns
        if token[0] == 'COL':
            consume()
            return pl.col(token[1]).cast(pl.Float64, strict=False)

        # Numbers
        if token[0] == 'NUM':
            consume()
            return pl.lit(token[1])

        raise ValueError(f'Élément inattendu: {token}')

    result = parse_expr()

    if pos[0] < len(tokens):
        raise ValueError('Formule invalide: éléments restants après la fin')

    return result
