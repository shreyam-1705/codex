export interface TraceSightConfig {
  serviceName: string;
  endpoint: string;
  traceRoutes?: string[];
  debug?: boolean;
}

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

