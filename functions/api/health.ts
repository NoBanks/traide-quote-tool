// TRAIDE Quote Tool, GET /api/health
// Liveness probe. Reports supported chains and aggregator endpoints.

export const onRequestGet: PagesFunction = async () => {
  return new Response(JSON.stringify({
    status: 'ok',
    service: 'traide-quote-tool',
    version: '0.2.0',
    supported_chains: ['eth', 'base', 'arbitrum', 'optimism', 'polygon', 'bsc', 'solana'],
    aggregators: {
      evm: 'KyberSwap (open API, no key required)',
      solana: 'Jupiter v6 (open API)',
      traide: 'placeholder until Base mainnet GA',
    },
    timestamp: new Date().toISOString(),
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
};
