// TRAIDE Quote Tool, GET /api/tip-info
//
// Returns tip wallet addresses and the x402 tip endpoint URL.
// Public defaults live in wrangler.toml [vars]; can be overridden via secrets
// if NoBanks wants to rotate without redeploying code.

interface Env {
  TRAIDE_EVM_TIP_ADDRESS?: string;
  TRAIDE_SOLANA_TIP_ADDRESS?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const evm = context.env.TRAIDE_EVM_TIP_ADDRESS || '0x897025A3d0260fAeA5Dc705e2037b8AFB0480F23';
  const solana = context.env.TRAIDE_SOLANA_TIP_ADDRESS || 'pending';
  const host = new URL(context.request.url).origin;

  return new Response(JSON.stringify({
    evm,
    solana,
    x402_tip_url: `${host}/api/x402-tip`,
    thanks: 'Tips fund TRAIDE Quote Tool ops and Living Agentic stack development.',
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
