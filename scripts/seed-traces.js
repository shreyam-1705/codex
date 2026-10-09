const DEMO_URL = process.env.DEMO_URL || 'http://127.0.0.1:3000/checkout';
const RUNS = 3;

async function seed() {
  console.log(`\n========================================`);
  console.log(`  TraceSight Demo Data Seeder`);
  console.log(`  Target: ${DEMO_URL}`);
  console.log(`========================================\n`);

  for (let i = 1; i <= RUNS; i++) {
    process.stdout.write(`[Run ${i}/${RUNS}] Sending GET /checkout... `);
    const start = Date.now();
    try {
      const res = await fetch(DEMO_URL, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer secret_demo_token_xyz'
        }
      });

      const data = await res.json();
      const elapsed = Date.now() - start;
      console.log(`Done (${elapsed}ms). Status: ${res.status}`);
    } catch (err) {
      console.log(`FAILED! Is demo-api running on port 3000?`);
      console.error(err.message);
      process.exit(1);
    }

    if (i < RUNS) {
      await new Promise(r => setTimeout(r, 600));
    }
  }

  console.log(`\n✨ Successfully generated ${RUNS} traces with child spans in TraceSight!`);
  console.log(`You can now query runtime data via Codex MCP tools:\n`);
  console.log(`  - get_route_health('/checkout')`);
  console.log(`  - get_traces(route='/checkout')`);
  console.log(`  - get_trace_detail('<traceId>')\n`);
}

seed();
