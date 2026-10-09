import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'demo-e-commerce-api' });
});

app.get('/checkout', async (req, res) => {
  try {
    const paymentResponse = await fetch('http://127.0.0.1:4100/payment-service/charge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer demo_redaction_token_not_real'
      },
      body: JSON.stringify({
        userId: 123,
        amount: 149.99,
        currency: 'USD'
      })
    });
    const paymentResult = await paymentResponse.json();

    const unoptimizedSql = `
      SELECT
        p1.transaction_id,
        p1.payment_date,
        p1.amount,
        (
          SELECT SUM(p2.amount)
          FROM payments p2
          WHERE p2.user_id = p1.user_id
            AND p2.payment_date <= p1.payment_date
        ) AS running_total_spent
      FROM payments p1
      WHERE p1.user_id = 123
      ORDER BY p1.payment_date DESC;
    `.trim();

    const dbResponse = await fetch('http://127.0.0.1:4100/db-service/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: unoptimizedSql })
    });
    const dbResult = await dbResponse.json();

    res.json({
      success: true,
      message: 'Order placed successfully',
      payment: paymentResult,
      dbSummary: dbResult
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`[Demo API] E-commerce server listening on http://127.0.0.1:${PORT}`);
  console.log(`[Demo API] Open in browser or curl: http://127.0.0.1:${PORT}/checkout`);
});

