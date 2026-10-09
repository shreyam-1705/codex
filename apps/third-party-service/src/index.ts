import express from 'express';

const app = express();
const PORT = process.env.PORT || 4100;

app.use(express.json());

app.post('/payment-service/charge', (req, res) => {
  const { amount, currency } = req.body;
  console.log(`[Third-Party Payment] Processing charge: ${amount || 99} ${currency || 'USD'}...`);
  
  setTimeout(() => {
    res.json({
      success: true,
      transactionId: 'txn_' + Math.random().toString(36).substring(2, 9),
      status: 'CAPTURED',
      processedAt: new Date().toISOString()
    });
  }, 1300);
});

app.post('/db-service/query', (req, res) => {
  const { sql } = req.body;
  console.log('[Third-Party DB] Executing query...');
  
  setTimeout(() => {
    res.json({
      success: true,
      rows: [
        { transaction_id: 101, payment_date: '2026-10-01', amount: 50.0, running_total_spent: 50.0 },
        { transaction_id: 102, payment_date: '2026-10-05', amount: 75.0, running_total_spent: 125.0 },
        { transaction_id: 103, payment_date: '2026-10-08', amount: 20.0, running_total_spent: 145.0 }
      ],
      rowCount: 3
    });
  }, 300);
});

app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`[Third-Party Service] Mock APIs listening on http://127.0.0.1:${PORT}`);
});

