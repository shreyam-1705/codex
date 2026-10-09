import os
import re
import json
import sqlite3
from typing import Optional, List, Dict, Any
from fastmcp import FastMCP

mcp = FastMCP("TraceSight Telemetry Server")

def get_db_path() -> str:
    root_candidate = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "telemetry.db"))
    backend_candidate = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "telemetry.db"))
    
    if os.path.exists(backend_candidate):
        return backend_candidate
    return root_candidate

def get_readonly_conn() -> sqlite3.Connection:
    db_path = get_db_path()
    if not os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
    else:
        uri = f"file:{os.path.abspath(db_path)}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn

@mcp.tool
def get_route_health(route: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Returns latency metrics (average, min, max duration, total requests, error count)
    for a given route or all routes if none specified.
    """
    conn = get_readonly_conn()
    try:
        cursor = conn.cursor()
        query = """
            SELECT 
                root_route,
                COUNT(*) as total_requests,
                ROUND(AVG(duration_ms), 2) as avg_duration_ms,
                ROUND(MIN(duration_ms), 2) as min_duration_ms,
                ROUND(MAX(duration_ms), 2) as max_duration_ms,
                SUM(CASE WHEN has_error = 1 THEN 1 ELSE 0 END) as error_count
            FROM traces
            WHERE (? IS NULL OR root_route LIKE '%' || ? || '%')
            GROUP BY root_route
            ORDER BY avg_duration_ms DESC
        """
        cursor.execute(query, (route, route))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

@mcp.tool
def get_traces(
    route: Optional[str] = None,
    limit: int = 10,
    min_duration_ms: float = 0.0,
    has_error: Optional[bool] = None
) -> List[Dict[str, Any]]:
    """
    Returns trace summaries filterable by route, minimum duration in ms, error status, and limit.
    """
    conn = get_readonly_conn()
    try:
        cursor = conn.cursor()
        error_val = None if has_error is None else (1 if has_error else 0)
        query = """
            SELECT id, service_name, root_route, http_method, status_code, duration_ms, has_error, timestamp
            FROM traces
            WHERE (? IS NULL OR root_route LIKE '%' || ? || '%')
              AND duration_ms >= ?
              AND (? IS NULL OR has_error = ?)
            ORDER BY timestamp DESC
            LIMIT ?
        """
        cursor.execute(query, (route, route, min_duration_ms, error_val, error_val, min(limit, 50)))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

@mcp.tool
def get_trace_detail(trace_id: str) -> Dict[str, Any]:
    """
    Returns full trace execution details including root request and all child execution spans
    sorted chronologically with latency contribution percentages.
    """
    conn = get_readonly_conn()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM traces WHERE id = ?", (trace_id,))
        trace = cursor.fetchone()
        if not trace:
            return {"error": f"Trace with id '{trace_id}' not found"}

        trace_dict = dict(trace)
        total_duration = trace_dict.get("duration_ms", 1.0) or 1.0

        cursor.execute("""
            SELECT id, parent_span_id, name, kind, http_method, http_url, status_code, 
                   duration_ms, start_time, end_time, has_error, attributes
            FROM spans 
            WHERE trace_id = ? 
            ORDER BY start_time ASC
        """, (trace_id,))
        spans = cursor.fetchall()

        formatted_spans = []
        for s in spans:
            item = dict(s)
            span_duration = item.get("duration_ms", 0)
            item["duration_percentage"] = round((span_duration / total_duration) * 100, 1)
            if item.get("attributes"):
                try:
                    item["attributes"] = json.loads(item["attributes"])
                except Exception:
                    pass
            formatted_spans.append(item)

        return {
            "trace": trace_dict,
            "span_count": len(formatted_spans),
            "spans": formatted_spans
        }
    finally:
        conn.close()

@mcp.tool
def get_db_schema() -> Dict[str, str]:
    """
    Returns the DDL schema of the telemetry database (traces and spans tables)
    so Codex can inspect data structures or write accurate queries.
    """
    return {
        "traces": """
CREATE TABLE traces (
    id TEXT PRIMARY KEY,               -- Unique traceId
    service_name TEXT NOT NULL,        -- Instrumented service name
    root_route TEXT NOT NULL,          -- Incoming route e.g. /checkout
    http_method TEXT NOT NULL,         -- GET, POST, etc.
    status_code INTEGER,               -- 200, 500, etc.
    duration_ms REAL NOT NULL,         -- Total end-to-end duration in ms
    has_error INTEGER DEFAULT 0,       -- 1 if failed, 0 if successful
    timestamp DATETIME                 -- Time captured
);
        """.strip(),
        "spans": """
CREATE TABLE spans (
    id TEXT PRIMARY KEY,               -- Unique spanId
    trace_id TEXT NOT NULL,            -- Associated traceId (foreign key)
    parent_span_id TEXT,               -- Parent spanId (null if root server span)
    name TEXT NOT NULL,                -- Operation name
    kind TEXT NOT NULL,                -- 'SERVER' (incoming) or 'CLIENT' (downstream call)
    http_method TEXT,                  -- Outgoing/incoming HTTP method
    http_url TEXT,                     -- Sanitized URL target
    status_code INTEGER,               -- Response status code
    duration_ms REAL NOT NULL,         -- Duration of operation in ms
    start_time INTEGER NOT NULL,       -- Start timestamp ms
    end_time INTEGER NOT NULL,         -- End timestamp ms
    has_error INTEGER DEFAULT 0,       -- 1 if failed, 0 if successful
    attributes TEXT                    -- JSON sanitized metadata attributes
);
        """.strip()
    }

@mcp.tool
def execute_custom_sql(query: str) -> Dict[str, Any]:
    """
    Safely executes a read-only SQL query against the telemetry database.
    Guards enforce SELECT statements only, reject destructive keywords, and limit result rows.
    """
    clean_query = query.strip()
    
    if not re.match(r"^\s*SELECT\b", clean_query, re.IGNORECASE):
        return {"error": "Responsible Engineering Guard: Only SELECT queries are permitted."}

    destructive_keywords = [
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", 
        "ATTACH", "DETACH", "PRAGMA", "REINDEX", "VACUUM", "REPLACE"
    ]
    for kw in destructive_keywords:
        if re.search(rf"\b{kw}\b", clean_query, re.IGNORECASE):
            return {"error": f"Responsible Engineering Guard: Keyword '{kw}' is prohibited."}

    limit_match = re.search(r"\bLIMIT\s+(\d+)", clean_query, re.IGNORECASE)
    if limit_match:
        limit_val = int(limit_match.group(1))
        if limit_val > 50:
            clean_query = re.sub(r"\bLIMIT\s+\d+", "LIMIT 50", clean_query, flags=re.IGNORECASE)
    else:
        clean_query = f"{clean_query.rstrip(';')} LIMIT 50"

    conn = get_readonly_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(clean_query)
        rows = cursor.fetchall()
        cols = [description[0] for description in cursor.description] if cursor.description else []
        return {
            "columns": cols,
            "rows": [dict(row) for row in rows],
            "row_count": len(rows)
        }
    except Exception as e:
        return {"error": f"SQL Execution Error: {str(e)}"}
    finally:
        conn.close()

if __name__ == "__main__":
    mcp.run()
