import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export interface SerializedSpan {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  httpMethod?: string;
  httpUrl?: string;
  statusCode?: number;
  durationMs: number;
  startTime: number;
  endTime: number;
  hasError: boolean;
  attributes: Record<string, unknown>;
}

const DB_PATH = process.env.TELEMETRY_DB_PATH || path.resolve(process.cwd(), 'telemetry.db');
console.log(`[Backend DB] Initializing SQLite telemetry store at: ${DB_PATH}`);

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS traces (
    id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL,
    root_route TEXT NOT NULL,
    http_method TEXT NOT NULL,
    status_code INTEGER,
    duration_ms REAL NOT NULL,
    has_error INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS spans (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    parent_span_id TEXT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    http_method TEXT,
    http_url TEXT,
    status_code INTEGER,
    duration_ms REAL NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    has_error INTEGER DEFAULT 0,
    attributes TEXT,
    FOREIGN KEY(trace_id) REFERENCES traces(id)
  );

  CREATE INDEX IF NOT EXISTS idx_traces_route ON traces(root_route);
  CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id);
`);

const upsertTraceStmt = db.prepare(`
  INSERT INTO traces (id, service_name, root_route, http_method, status_code, duration_ms, has_error)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    service_name=excluded.service_name,
    root_route=excluded.root_route,
    http_method=excluded.http_method,
    status_code=excluded.status_code,
    duration_ms=excluded.duration_ms,
    has_error=excluded.has_error
`);

const upsertSpanStmt = db.prepare(`
  INSERT OR REPLACE INTO spans (
    id, trace_id, parent_span_id, name, kind,
    http_method, http_url, status_code, duration_ms,
    start_time, end_time, has_error, attributes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const ensureTraceStmt = db.prepare(`
  INSERT INTO traces (id, service_name, root_route, http_method, duration_ms)
  VALUES (?, ?, 'in_progress', 'UNKNOWN', 0)
  ON CONFLICT(id) DO NOTHING
`);

export function ingestTelemetry(serviceName: string, spans: SerializedSpan[]) {
  for (const span of spans) {
    if (span.kind === 'SERVER' || !span.parentSpanId) {
      const rootRoute = (span.attributes?.['http.route'] as string) || span.httpUrl || span.name;
      upsertTraceStmt.run(
        span.traceId,
        serviceName,
        rootRoute,
        span.httpMethod || 'GET',
        span.statusCode ?? 200,
        span.durationMs,
        span.hasError ? 1 : 0
      );
    } else {
      ensureTraceStmt.run(span.traceId, serviceName);
    }
  }

  for (const span of spans) {
    upsertSpanStmt.run(
      span.id,
      span.traceId,
      span.parentSpanId || null,
      span.name,
      span.kind,
      span.httpMethod || null,
      span.httpUrl || null,
      span.statusCode ?? null,
      span.durationMs,
      span.startTime,
      span.endTime,
      span.hasError ? 1 : 0,
      JSON.stringify(span.attributes || {})
    );
  }
}

