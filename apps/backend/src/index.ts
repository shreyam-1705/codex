import express from 'express';
import { ingestTelemetry } from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tracesight-backend' });
});

app.post('/api/spans', (req, res) => {
  const { serviceName, spans } = req.body;

  if (!spans || !Array.isArray(spans)) {
    return res.status(400).json({ error: 'Payload must contain a spans array' });
  }

  try {
    ingestTelemetry(serviceName || 'unknown-service', spans);
    return res.status(200).json({ success: true, count: spans.length });
  } catch (err: any) {
    console.error('[Backend Ingest Error]:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`[TraceSight Backend] Ingest API running on http://127.0.0.1:${PORT}`);
});

