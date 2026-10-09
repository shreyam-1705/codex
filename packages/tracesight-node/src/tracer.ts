import { NodeSDK } from '@opentelemetry/sdk-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { TraceSightConfig } from './types.js';
import { TraceSightSpanExporter } from './exporter.js';

let sdkInstance: NodeSDK | null = null;

export function init(config: TraceSightConfig): NodeSDK {
  if (sdkInstance) {
    if (config.debug) {
      console.warn('[TraceSight] SDK already initialized.');
    }
    return sdkInstance;
  }

  const exporter = new TraceSightSpanExporter(config);

  sdkInstance = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
    }),
    spanProcessor: new SimpleSpanProcessor(exporter),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });

  try {
    sdkInstance.start();
    if (config.debug) {
      console.log(`[TraceSight] Initialized SDK for service "${config.serviceName}" -> ${config.endpoint}`);
    }
  } catch (err) {
    console.error('[TraceSight] Failed to start SDK:', err);
  }

  process.on('SIGTERM', () => {
    sdkInstance?.shutdown()
      .then(() => console.log('[TraceSight] SDK terminated gracefully.'))
      .catch((err) => console.error('[TraceSight] Error terminating SDK:', err));
  });

  return sdkInstance;
}

