# SPDX-License-Identifier: Apache-2.0
# Project-local evidence classification. Upstream scanner rules stay unchanged.
"""Conservative static evidence context; never executes cited code.

This is a structural floor, not proof of test behavior or source authenticity.
Unknown contexts keep the upstream strict scan. No manifest waivers are added.
"""
from __future__ import annotations

import ast
import hashlib
import json
import re
from pathlib import Path

JS_SUFFIXES = {".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx"}
TEST_DIRS = {"tests", "test", "__tests__", "tests-browser"}
ASSERT_METHODS = r"(?:equal|notEqual|strictEqual|notStrictEqual|deepEqual|notDeepEqual|deepStrictEqual|notDeepStrictEqual|ok|throws|rejects|doesNotThrow|doesNotReject|match|doesNotMatch|fail)"
ASSERT_CALL = re.compile(r"(?<![\w$])assert\s*(?:\.\s*"+ASSERT_METHODS+r")?\s*\(|(?<![\w$])expect\s*\(")
NEGATIVE_CLAUSE = re.compile(r"\b(?:no|without)\s+(?P<token>sample|mock|fake|stub|placeholder)\s+(?:data|fallbacks?)\b|\bnot widening or (?P<sample>sample) fallback\b", re.I)
RUNTIME_FIELDS = {"sourceOfTruth", "dataBinding", "dataSources"}


def inside(path, root):
    try:
        resolved, base = path.resolve(), root.resolve()
        return resolved == base or base in resolved.parents
    except (OSError, RuntimeError):
        return False


def string_values(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from string_values(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from string_values(item)


class EvidenceContext:
    """Per-validation immutable runtime path inventory, not a process-wide cache."""
    def __init__(self, manifest, project_root):
        self.root = Path(project_root).resolve() if project_root is not None else None
        self.runtime_paths = []
        if self.root is not None:
            self._walk(manifest)

    def _walk(self, value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in RUNTIME_FIELDS:
                    for text in string_values(child):
                        # Try the complete value first: bare directories/root
                        # files and absolute Windows paths with spaces are real
                        # runtime bindings too. Embedded paths are additional
                        # conservative candidates, never the sole path parser.
                        candidates = [text.strip(), text.split("#", 1)[0].strip()]
                        candidates.extend(re.findall(r"(?:[A-Za-z0-9_.-]+[/\\])+[A-Za-z0-9_.-]+", text))
                        candidates.extend(part.split("#", 1)[0].strip("()[];,\"'") for part in text.split())
                        for raw in candidates:
                            if not raw:
                                continue
                            path = self.root / raw
                            if inside(path, self.root) and path.exists():
                                self.runtime_paths.append(path.resolve())
                self._walk(child)
        elif isinstance(value, list):
            for child in value:
                self._walk(child)

    def isolated(self, candidate):
        if self.root is None or not inside(candidate, self.root):
            return False
        resolved = candidate.resolve()
        return not any(resolved == path or path in resolved.parents for path in self.runtime_paths)


def is_test_file(candidate):
    suffix = candidate.suffix.lower()
    if suffix not in JS_SUFFIXES | {".py"}:
        return False
    return any(part.lower() in TEST_DIRS for part in candidate.parts) or bool(re.search(r"(?:^test_|[.-](?:test|spec)\.)", candidate.name, re.I))


def js_tokens(body):
    """Small lexical reader: comments/literal contents cannot become code calls.

    Template interpolations are deliberately opaque. Unsupported syntax is not
    executed or interpreted as an assertion. Regex literals are opaque too.
    """
    result = []
    i, length = 0, len(body)
    while i < length:
        ch = body[i]
        if ch.isspace():
            i += 1; continue
        if body.startswith("//", i):
            end = body.find("\n", i+2); i = length if end < 0 else end; continue
        if body.startswith("/*", i):
            end = body.find("*/", i+2); i = length if end < 0 else end+2; continue
        if ch in "\"'`":
            start, quote = i, ch
            i += 1
            while i < length:
                if body[i] == "\\":
                    i += 2; continue
                if body[i] == quote:
                    i += 1; break
                i += 1
            result.append(("string", body[start+1:i-1], start, i)); continue
        if ch == "/" and (not result or result[-1][1] in {"=", "(", ",", ":", "[", "{", "!", ";", "return", "=>"}):
            start, in_class = i, False
            i += 1
            while i < length and body[i] not in "\r\n":
                if body[i] == "\\":
                    i += 2; continue
                if body[i] == "[": in_class = True
                if body[i] == "]": in_class = False
                if body[i] == "/" and not in_class:
                    i += 1
                    while i < length and body[i].isalpha(): i += 1
                    break
                i += 1
            result.append(("regex", body[start:i], start, i)); continue
        word = re.match(r"[A-Za-z_$][A-Za-z0-9_$]*", body[i:])
        if word:
            value = word.group(); result.append(("word", value, i, i+len(value))); i += len(value); continue
        two = body[i:i+2]
        if two in {"=>", "==", "!=", "?.", "&&", "||", "++", "--"}:
            result.append(("punct", two, i, i+2)); i += 2; continue
        result.append(("punct", ch, i, i+1)); i += 1
    return result


def masked_code(body, tokens):
    chars = list(body)
    cursor = 0
    for kind, _, start, end in tokens:
        for index in range(cursor, start):
            if chars[index] not in "\r\n": chars[index] = " "
        if kind in {"string", "regex"}:
            for index in range(start, end):
                if chars[index] not in "\r\n": chars[index] = " "
        cursor = end
    for index in range(cursor, len(chars)):
        if chars[index] not in "\r\n": chars[index] = " "
    return "".join(chars)


def executable_assertion(body, candidate=None):
    if candidate is not None and candidate.suffix.lower() == ".py":
        try:
            tree = ast.parse(body)
        except (SyntaxError, ValueError):
            return False
        return any(isinstance(node, ast.Assert) or isinstance(node, ast.Call) and ((isinstance(node.func, ast.Attribute) and node.func.attr.startswith("assert")) or (isinstance(node.func, ast.Name) and node.func.id in {"assert_that", "expect"})) for node in ast.walk(tree))
    tokens = js_tokens(body)
    code = masked_code(body, tokens)
    # An expect call alone evaluates a value but asserts no property.
    return bool(re.search(r"(?<![\w$])assert\s*(?:\.\s*"+ASSERT_METHODS+r")?\s*\(", code) or re.search(r"(?<![\w$])expect\s*\([^;]*?\)\s*(?:\.\s*(?:not|resolves|rejects)\s*)*\.\s*(?:to[A-Z]\w*|toBe|toEqual)\s*\(", code))


def executable_tokens(body, candidate):
    """Relevant strings must occur as call arguments, never imports/comments/decoys.

    Test titles are permitted for compatibility with the upstream test contract.
    This proves a static link only, not that the assertion tests that link.
    """
    if candidate.suffix.lower() == ".py":
        try:
            tree = ast.parse(body)
        except (SyntaxError, ValueError):
            return ""
        parts = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                parts.append(ast.unparse(node.func))
                for arg in node.args:
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str): parts.append(arg.value)
        return "\n".join(parts)
    tokens, parts, stack = js_tokens(body), [], []
    import_statement = False
    for index, (kind, value, _, _) in enumerate(tokens):
        if value == "import": import_statement = True
        if value == ";": import_statement = False
        if value == "(":
            previous = tokens[index-1][1] if index else ""
            call = bool(index and (tokens[index-1][0] == "word" or previous in {")", "]"})) and previous not in {"import", "require", "if", "while", "for", "switch"}
            stack.append(call and not import_statement)
        elif value == ")" and stack:
            stack.pop()
        if not import_statement:
            if kind == "word":
                parts.append(value)
                dotted, cursor = value, index + 1
                while cursor + 1 < len(tokens) and tokens[cursor][1] in {".", "?."} and tokens[cursor+1][0] == "word":
                    dotted += "." + tokens[cursor+1][1]
                    cursor += 2
                if dotted != value and cursor < len(tokens) and tokens[cursor][1] == "(": parts.append(dotted)
            if kind in {"string", "regex"} and any(stack): parts.append(value)
    return "\n".join(parts)


def test_scan_body(body, candidate, context):
    if context is None or not context.isolated(candidate) or not is_test_file(candidate):
        return body
    if not executable_assertion(body, candidate):
        return body
    tokens = js_tokens(body) if candidate.suffix.lower() in JS_SUFFIXES else []
    chars = list(body)
    code = masked_code(body, tokens)
    def blank(start, end):
        for index in range(start, end):
            if chars[index] not in "\r\n": chars[index] = " "
    # Only the standard identity generator is a fixture exemption, not arbitrary
    # random/mock identifiers. It changes no production/runtime scan behavior.
    for kind, value, start, end in tokens:
        if kind == "word" and value == "randomUUID": blank(start, end)
    # Negative match assertions intentionally name disallowed content. The rest
    # of the file is scanned strictly, including positive fallback identifiers.
    for match in re.finditer(r"\bassert\s*\.\s*doesNotMatch\s*\(", code):
        depth, end = 1, match.end()
        while end < len(code) and depth:
            if code[end] == "(": depth += 1
            if code[end] == ")": depth -= 1
            end += 1
        if depth == 0:
            for kind, _, start, stop in tokens:
                if kind in {"string", "regex"} and match.end() <= start < stop <= end: blank(start, stop)
    # Template interpolation is opaque to the lexical reader. Recognize only
    # the exact zero-argument UUID-generator expression, not arbitrary template
    # code or any other fixture/fallback identifier.
    cleaned = "".join(chars)
    return re.sub(r"\$\{\s*randomUUID\s*\(\s*\)\s*\}", "", cleaned)


def review_scan_body(body, candidate, context, limit):
    if context is None or not context.isolated(candidate) or candidate.suffix.lower() != ".json":
        return body
    try:
        relative = candidate.resolve().relative_to(context.root).as_posix()
        if not relative.startswith(".admin-console/evidence/"): return body
        data = json.loads(body)
        if not isinstance(data, dict) or not re.search(r"\bsource review\b", str(data.get("classification", "")), re.I) or not isinstance(data.get("reviewer"), str) or not data['reviewer'].strip(): return body
        assertions, files = data.get('source_assertions'), data.get('files')
        if not isinstance(assertions, list) or not assertions or not all(isinstance(item, str) for item in assertions) or not isinstance(files, list) or not files: return body
        for entry in files:
            if not isinstance(entry, dict) or not isinstance(entry.get('path'), str): return body
            source = context.root / entry['path']
            if not inside(source, context.root) or not source.is_file() or source.stat().st_size > limit: return body
            expected = entry.get('sha256_utf8_crlf_to_lf')
            if not isinstance(expected, str) or not re.fullmatch(r'[0-9a-f]{64}', expected): return body
            actual = hashlib.sha256(source.read_bytes().decode('utf-8').replace('\r\n', '\n').encode('utf-8')).hexdigest()
            if actual != expected: return body
        cleaned = []
        for assertion in assertions:
            # Never treat code fragments/fences as review prose.
            if any(char in assertion for char in ('`', '{', '}')):
                cleaned.append(assertion); continue
            def replace(match):
                value = match.group()
                start = match.start('token') if match.group('token') else match.start('sample')
                offset = start - match.start()
                token = match.group('token') or match.group('sample')
                return value[:offset] + (' ' * len(token)) + value[offset+len(token):]
            cleaned.append(NEGATIVE_CLAUSE.sub(replace, assertion))
        data['source_assertions'] = cleaned
        return json.dumps(data, ensure_ascii=False)
    except (OSError, UnicodeError, ValueError, TypeError, RuntimeError):
        return body
