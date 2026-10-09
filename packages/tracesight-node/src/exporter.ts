import {
  SpanExporter,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { ExportResult, ExportResultCode, hrTimeToMilliseconds } from '@opentelemetry/core';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { TraceSightConfig, SerializedSpan } from './types.js';
import { sanitizeAttributes, sanitizeUrl } from './sanitizer.js';

interface TraceBuffer {
  spans: SerializedSpan[];
  timer: NodeJS.Timeout;
}

export class TraceSightSpanExporter implements SpanExporter {
  private config: TraceSightConfig;
  private traceBuffers = new Map<string, TraceBuffer>();

  constructor(config: TraceSightConfig) {
    this.config = config;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    for (const span of spans) {
      const traceId = span.spanContext().traceId;
      if (this.config.debug) {
        console.log(`[TraceSight Debug] Span: "${span.name}", Kind: ${span.kind} (${SpanKind[span.kind]}), Parent: ${span.parentSpanId || 'NONE'}`);
      }
      const rawUrl =
        (span.attributes['http.url'] as string) ||
        (span.attributes['url.full'] as string) ||
        (span.attributes['http.target'] as string);

      const httpMethod =
        (span.attributes['http.method'] as string) ||
        (span.attributes['http.request.method'] as string);

      const statusCode =
        Number(span.attributes['http.status_code']) ||
        Number(span.attributes['http.response.status_code']) ||
        undefined;

      const durationMs = hrTimeToMilliseconds(span.duration);
      const startTime = hrTimeToMilliseconds(span.startTime);
      const endTime = hrTimeToMilliseconds(span.endTime);

      const serialized: SerializedSpan = {
        id: span.spanContext().spanId,
        traceId: span.spanContext().traceId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        kind: SpanKind[span.kind] || 'INTERNAL',
        httpMethod,
        httpUrl: sanitizeUrl(rawUrl),
        statusCode,
        durationMs,
        startTime,
        endTime,
        hasError: span.status.code === SpanStatusCode.ERROR,
        attributes: sanitizeAttributes(span.attributes),
      };

      if (!this.config.traceRoutes || this.config.traceRoutes.length === 0) {
        this.sendSpans([serialized]);
        continue;
      }

      let buffer = this.traceBuffers.get(traceId);
      if (!buffer) {
        buffer = {
          spans: [],
          timer: setTimeout(() => {
            this.traceBuffers.delete(traceId);
          }, 10000),
        };
        this.traceBuffers.set(traceId, buffer);
      }

      buffer.spans.push(serialized);

      if (span.kind === SpanKind.SERVER) {
        const rawRoute =
          (span.attributes['http.route'] as string) ||
          (span.attributes['http.target'] as string) ||
          (span.attributes['url.path'] as string) ||
          span.name;

        const isMatched = this.config.traceRoutes.some((route) =>
          rawRoute?.includes(route)
        );

        if (this.config.debug) {
          console.log(`[TraceSight Debug] SERVER span finished. rawRoute="${rawRoute}", isMatched=${isMatched}, bufferSize=${buffer.spans.length}`);
        }

        clearTimeout(buffer.timer);
        this.traceBuffers.delete(traceId);

        if (isMatched) {
          this.sendSpans(buffer.spans);
        }
      }
    }

    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  private sendSpans(spans: SerializedSpan[]): void {
    if (spans.length === 0) return;

    setImmediate(async () => {
      try {
        const payload = {
          serviceName: this.config.serviceName,
          spans,
        };

        const res = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (this.config.debug) {
          console.log(`[TraceSight] Exported ${spans.length} spans for service "${this.config.serviceName}". Status: ${res.status}`);
        }
      } catch (err: any) {
        if (this.config.debug) {
          console.error('[TraceSight] Failed to export spans:', err.message);
        }
      }
    });
  }

  async shutdown(): Promise<void> {
    for (const buffer of this.traceBuffers.values()) {
      clearTimeout(buffer.timer);
    }
    this.traceBuffers.clear();
  }
}
