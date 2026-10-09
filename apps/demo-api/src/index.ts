import { init } from '@tracesight/node';

init({
  serviceName: 'e-commerce-api',
  endpoint: process.env.TELEMETRY_ENDPOINT || 'http://127.0.0.1:4000/api/spans',
  debug: false,
  traceRoutes: ['/checkout'],
});

await import('./server.js');
