// TRAIDE Quote Tool, GET /api/health
// Liveness probe. Reports build time, supported chains, whether 1inch key is set.

interface Env {
  ONEINCH_API_KEY?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return new Response(JSON.stringify({
    status: 'ok',
    service: 'traide-quote-tool',
    version: '0.1.0',
    supported_chains: ['eth', 'base', 'arbitrum', 'optimism', 'polygon', 'solana'],
    oneinch_configured: Boolean(context.env.ONEINCH_API_KEY),
    timestamp: new Date().toISOString(),
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
};
