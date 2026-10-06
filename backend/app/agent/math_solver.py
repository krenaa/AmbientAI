import ast
import math
import operator
import re
from typing import Dict, Any, Optional, Tuple

_SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

_SAFE_FUNCTIONS = {
    "sqrt": math.sqrt,
    "abs": abs,
    "round": round,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "exp": math.exp,
}


def safe_eval_ast(node):
    if isinstance(node, ast.Expression):
        return safe_eval_ast(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp):
        left = safe_eval_ast(node.left)
        right = safe_eval_ast(node.right)
        op_type = type(node.op)
        if op_type in _SAFE_OPERATORS:
            return _SAFE_OPERATORS[op_type](left, right)
        raise ValueError(f"Unsupported operator: {op_type.__name__}")
    if isinstance(node, ast.UnaryOp):
        operand = safe_eval_ast(node.operand)
        op_type = type(node.op)
        if op_type in _SAFE_OPERATORS:
            return _SAFE_OPERATORS[op_type](operand)
        raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        func_name = node.func.id
        if func_name in _SAFE_FUNCTIONS:
            args = [safe_eval_ast(arg) for arg in node.args]
            return _SAFE_FUNCTIONS[func_name](*args)
        raise ValueError(f"Unsupported function call: {func_name}")
    raise ValueError(f"Unsupported expression element: {type(node).__name__}")


def evaluate_expression(expr: str) -> float:
    """Evaluates mathematical expression using AST."""
    cleaned = expr.replace(",", "").replace("$", "").strip()
    parsed = ast.parse(cleaned, mode="eval")
    return safe_eval_ast(parsed)


def parse_interest_query(text: str) -> Optional[Dict[str, Any]]:
    """Detects simple interest (si) or compound interest (ci) queries with shorthand/typo tolerance."""
    lowered = text.lower().strip()

    # Match SI or CI keywords
    is_ci = bool(re.search(r"\b(ci|compound\s*interest)\b", lowered))
    is_si = bool(re.search(r"\b(si|simple\s*interest)\b", lowered))

    if not is_si and not is_ci:
        # Check if query is about interest generally
        if "interest" in lowered and ("rate" in lowered or "%" in lowered or "year" in lowered):
            is_si = True
        else:
            return None

    # 1. Rate extraction: e.g. "7.5%", "7.5 %", "rate: 7.5", "at 7.5%"
    rate: Optional[float] = None
    rate_match = re.search(r"(\d+(?:\.\d+)?)\s*%", lowered)
    if not rate_match:
        rate_match = re.search(r"\b(?:rate|r)\s*(?:of|is|=|:)?\s*(\d+(?:\.\d+)?)", lowered)
    if not rate_match:
        rate_match = re.search(r"\bat\s*(\d+(?:\.\d+)?)\s*(?:percent)?\b", lowered)
    if rate_match:
        try:
            rate = float(rate_match.group(1))
        except ValueError:
            pass

    # 2. Time extraction: e.g. "5 years", "5 yrs", "5 year", "5y", "time: 5"
    time_val: Optional[float] = None
    time_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:years|year|yrs|yr|y)\b", lowered)
    if not time_match:
        time_match = re.search(r"\b(?:time|period|t)\s*(?:of|is|=|:)?\s*(\d+(?:\.\d+)?)", lowered)
    if not time_match:
        time_match = re.search(r"\bfor\s*(\d+(?:\.\d+)?)\s*(?:years|year|yrs|yr)?\b", lowered)
    if time_match:
        try:
            time_val = float(time_match.group(1))
        except ValueError:
            pass

    # 3. Principal extraction: e.g. "on 20000", "principal 20000", "p=20000", "$20000", "rs 20000"
    principal: Optional[float] = None
    p_match = re.search(r"\b(?:principal|sum|p)\s*(?:of|is|=|:)?\s*[$₹Rs.]*\s*(\d+(?:,\d{3})*(?:\.\d+)?)\b", lowered)
    if not p_match:
        p_match = re.search(r"\bon\s*[$₹Rs.]*\s*(\d+(?:,\d{3})*(?:\.\d+)?)\b", lowered)
    if not p_match:
        p_match = re.search(r"[$₹]\s*(\d+(?:,\d{3})*(?:\.\d+)?)", lowered)
    if not p_match:
        # Check standalone numbers that aren't rate or time
        all_numbers = re.findall(r"\b\d+(?:,\d{3})*(?:\.\d+)?\b", lowered)
        for num_str in all_numbers:
            clean_num = num_str.replace(",", "")
            try:
                val = float(clean_num)
                if (rate is not None and abs(val - rate) < 1e-4) or (time_val is not None and abs(val - time_val) < 1e-4):
                    continue
                if val >= 10:  # Reasonable principal threshold
                    principal = val
                    break
            except ValueError:
                continue
    else:
        try:
            principal = float(p_match.group(1).replace(",", ""))
        except ValueError:
            pass

    return {
        "type": "ci" if is_ci else "si",
        "principal": principal,
        "rate": rate,
        "time": time_val,
    }


def handle_math_calculation(user_query: str) -> Optional[str]:
    """Deterministically handles math and interest queries.
    Returns a complete, formatted answer if matched, or None if not a math request.
    NEVER triggers HITL.
    """
    interest_data = parse_interest_query(user_query)
    if interest_data:
        calc_type = interest_data["type"]
        p = interest_data["principal"]
        r = interest_data["rate"]
        t = interest_data["time"]

        # Case A: Missing required parameter (e.g. Principal missing)
        if p is None or r is None or t is None:
            missing_items = []
            if p is None:
                missing_items.append("Principal Amount ($P$)")
            if r is None:
                missing_items.append("Rate of Interest ($R$)")
            if t is None:
                missing_items.append("Time Period ($T$)")

            sample_p = 10000.0
            effective_r = r if r is not None else 7.5
            effective_t = t if t is not None else 5.0

            if calc_type == "si":
                sample_si = (sample_p * effective_r * effective_t) / 100.0
                sample_amt = sample_p + sample_si
                return (
                    "### Simple Interest Calculation\n\n"
                    "**Formula**:\n"
                    "$$\\text{SI} = \\frac{P \\times R \\times T}{100}$$\n\n"
                    "**Identified Parameters**:\n"
                    f"- **Rate ($R$)**: {r if r is not None else 'Missing (e.g. 7.5%)'}\n"
                    f"- **Time ($T$)**: {f'{t} years' if t is not None else 'Missing (e.g. 5 years)'}\n"
                    f"- **Principal ($P$)**: **Missing**\n\n"
                    f"> **Required Input**: To calculate the exact interest, please provide the {', '.join(missing_items)}.\n\n"
                    f"#### Worked Example (using sample Principal $P = {sample_p:,.0f}$):\n"
                    f"- **Formula**: $$\\text{{SI}} = \\frac{{{sample_p:,.0f} \\times {effective_r} \\times {effective_t}}}{{100}}$$\n"
                    f"- **Simple Interest**: **{sample_si:,.2f}**\n"
                    f"- **Total Maturity Amount ($A = P + \\text{{SI}}$)**: **{sample_amt:,.2f}**\n\n"
                    "Please reply with your principal amount to complete your calculation."
                )
            else:
                sample_amt = sample_p * ((1.0 + effective_r / 100.0) ** effective_t)
                sample_ci = sample_amt - sample_p
                return (
                    "### Compound Interest Calculation\n\n"
                    "**Formula**:\n"
                    "$$A = P \\left(1 + \\frac{R}{100}\\right)^T, \\quad \\text{CI} = A - P$$\n\n"
                    "**Identified Parameters**:\n"
                    f"- **Rate ($R$)**: {r if r is not None else 'Missing (e.g. 7.5%)'}\n"
                    f"- **Time ($T$)**: {f'{t} years' if t is not None else 'Missing (e.g. 5 years)'}\n"
                    f"- **Principal ($P$)**: **Missing**\n\n"
                    f"> **Required Input**: To calculate compound interest, please provide the {', '.join(missing_items)}.\n\n"
                    f"#### Worked Example (using sample Principal $P = {sample_p:,.0f}$):\n"
                    f"- **Total Amount ($A$)**: $${sample_p:,.0f} \\left(1 + \\frac{{{effective_r}}}{{100}}\\right)^{{{effective_t}}} = {sample_amt:,.2f}$$\n"
                    f"- **Compound Interest**: **{sample_ci:,.2f}**\n\n"
                    "Please reply with your principal amount to compute the exact figure."
                )

        # Case B: All parameters present -> compute with AST math
        if calc_type == "si":
            expr_str = f"({p} * {r} * {t}) / 100"
            si_val = evaluate_expression(expr_str)
            total_amt = evaluate_expression(f"{p} + {si_val}")
            return (
                "### Simple Interest Calculation\n\n"
                "**Formula**:\n"
                "$$\\text{SI} = \\frac{P \\times R \\times T}{100}$$\n\n"
                "**Given Values**:\n"
                f"- **Principal ($P$)**: {p:,.2f}\n"
                f"- **Rate ($R$)**: {r}% per annum\n"
                f"- **Time ($T$)**: {t} years\n\n"
                "**Step-by-Step Evaluation**:\n"
                f"$$\\text{{SI}} = \\frac{{{p:,.2f} \\times {r} \\times {t}}}{{100}} = \\mathbf{{{si_val:,.2f}}}$$\n\n"
                "**Results**:\n"
                f"- **Simple Interest (SI)**: **{si_val:,.2f}**\n"
                f"- **Total Maturity Amount ($A = P + \\text{{SI}}$)**: **{total_amt:,.2f}**"
            )
        else:
            amt_expr = f"{p} * ((1 + {r} / 100) ** {t})"
            total_amt = evaluate_expression(amt_expr)
            ci_val = evaluate_expression(f"{total_amt} - {p}")
            return (
                "### Compound Interest Calculation\n\n"
                "**Formula**:\n"
                "$$A = P \\left(1 + \\frac{R}{100}\\right)^T, \\quad \\text{CI} = A - P$$\n\n"
                "**Given Values**:\n"
                f"- **Principal ($P$)**: {p:,.2f}\n"
                f"- **Rate ($R$)**: {r}% per annum\n"
                f"- **Time ($T$)**: {t} years\n\n"
                "**Step-by-Step Evaluation**:\n"
                f"$$A = {p:,.2f} \\left(1 + \\frac{{{r}}}{{100}}\\right)^{{{t}}} = \\mathbf{{{total_amt:,.2f}}}$$\n"
                f"$$\\text{{CI}} = {total_amt:,.2f} - {p:,.2f} = \\mathbf{{{ci_val:,.2f}}}$$\n\n"
                "**Results**:\n"
                f"- **Compound Interest (CI)**: **{ci_val:,.2f}**\n"
                f"- **Total Maturity Amount ($A$)**: **{total_amt:,.2f}**"
            )

    # General calculation prefix check
    lowered = user_query.lower().strip()
    calc_prefixes = ["calculate the formula:", "calculate the formula", "calculate:", "calculate ", "compute:", "compute "]
    for pfx in calc_prefixes:
        if lowered.startswith(pfx):
            expr = user_query[len(pfx):].strip(" :")
            if expr:
                try:
                    result = evaluate_expression(expr)
                    return (
                        "### AST Math Calculation\n\n"
                        f"- **Expression**: `{expr}`\n"
                        f"- **Result**: **{result}**"
                    )
                except Exception as e:
                    return f"Error evaluating expression `{expr}`: {str(e)}"

    return None
