// TRAIDE Quote Tool, GET /api/quote
//
// Fans out to Jupiter (Solana) and 1inch (EVM) in parallel, merges results,
// returns aggregated JSON. TRAIDE is included as a placeholder until mainnet
// GA on Base. CF Pages Function, runs on the Workers runtime at the edge.
//
// Env (set via `wrangler pages secret put ...`):
//   ONEINCH_API_KEY: free tier from https://portal.1inch.dev/
//
// Cache: 5s per (chain, sell, buy, amount) tuple via the CF cache API.

interface Env {
  ONEINCH_API_KEY?: string;
  QUOTE_CACHE_TTL_SECONDS?: string;
}

interface TokenMeta {
  address: string;
  decimals: number;
  symbol: string;
}

interface QuoteResult {
  source: string;
  status?: 'pending_mainnet';
  buyAmount?: string;
  buyAmountUsd?: number;
  gasEstimate?: string;
  gasUsd?: number;
  route?: string[];
  executeUrl?: string;
  latencyMs?: number;
  note?: string;
  error?: string;
}

interface ResponseShape {
  chain: string;
  sell: string;
  buy: string;
  sellAmount: string;
  quotes: QuoteResult[];
  best: string | null;
  fetchedAt: string;
}

// 1inch chain id mapping
const CHAIN_ID: Record<string, number> = {
  eth: 1, ethereum: 1,
  base: 8453,
  arbitrum: 42161, arb: 42161,
  optimism: 10, op: 10,
  polygon: 137, matic: 137,
};

const SOLANA_CHAINS = new Set(['solana', 'sol']);

// Symbol -> {address, decimals} per chain. Lowercase symbol keys.
// Hardcoded to keep the Function self-contained, no external token-list deps.
// User can also pass a raw 0x... or Solana base58 address directly.
const TOKENS_EVM: Record<number, Record<string, TokenMeta>> = {
  1: {
    eth:   { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, symbol: 'ETH' },
    weth:  { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, symbol: 'WETH' },
    usdc:  { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6,  symbol: 'USDC' },
    usdt:  { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6,  symbol: 'USDT' },
    dai:   { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, symbol: 'DAI' },
    wbtc:  { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8,  symbol: 'WBTC' },
  },
  8453: {
    eth:   { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, symbol: 'ETH' },
    weth:  { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH' },
    usdc:  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6,  symbol: 'USDC' },
    dai:   { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, symbol: 'DAI' },
    cbbtc: { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8,  symbol: 'cbBTC' },
  },
  42161: {
    eth:   { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, symbol: 'ETH' },
    weth:  { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, symbol: 'WETH' },
    usdc:  { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6,  symbol: 'USDC' },
    usdt:  { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6,  symbol: 'USDT' },
    dai:   { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, symbol: 'DAI' },
    wbtc:  { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8,  symbol: 'WBTC' },
  },
  10: {
    eth:   { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, symbol: 'ETH' },
    weth:  { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH' },
    usdc:  { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6,  symbol: 'USDC' },
    usdt:  { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6,  symbol: 'USDT' },
    dai:   { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, symbol: 'DAI' },
    wbtc:  { address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8,  symbol: 'WBTC' },
  },
  137: {
    matic: { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, symbol: 'MATIC' },
    wmatic:{ address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18, symbol: 'WMATIC' },
    weth:  { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, symbol: 'WETH' },
    usdc:  { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6,  symbol: 'USDC' },
    usdt:  { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6,  symbol: 'USDT' },
    dai:   { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18, symbol: 'DAI' },
    wbtc:  { address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', decimals: 8,  symbol: 'WBTC' },
  },
};

// Solana SPL tokens. Address is the mint, "decimals" is the SPL decimals.
const TOKENS_SOLANA: Record<string, TokenMeta> = {
  sol:  { address: 'So11111111111111111111111111111111111111112', decimals: 9, symbol: 'SOL' },
  usdc: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
  usdt: { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, symbol: 'USDT' },
  bonk: { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, symbol: 'BONK' },
  jup:  { address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  decimals: 6, symbol: 'JUP' },
  jto:  { address: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  decimals: 9, symbol: 'JTO' },
};

function resolveTokenEvm(chainId: number, input: string): TokenMeta | null {
  const t = input.trim().toLowerCase();
  // Looks like an 0x address: build a stub with assumed 18 decimals.
  // TRUE decimals would require an on-chain read which we skip in MVP.
  if (/^0x[a-f0-9]{40}$/.test(t)) {
    return { address: input.trim(), decimals: 18, symbol: input.trim().slice(0, 8) };
  }
  const map = TOKENS_EVM[chainId];
  return map?.[t] ?? null;
}

function resolveTokenSolana(input: string): TokenMeta | null {
  const t = input.trim();
  // Base58 mint pubkey heuristic: 32-44 chars, base58 alphabet.
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t)) {
    return { address: t, decimals: 9, symbol: t.slice(0, 6) };
  }
  return TOKENS_SOLANA[t.toLowerCase()] ?? null;
}

function toAtomic(amount: string, decimals: number): string {
  // Handle decimal strings without depending on BigInt math libraries.
  // Split on '.' then concat + pad/truncate to `decimals` digits.
  const [whole, frac = ''] = amount.split('.');
  const cleanFrac = frac.replace(/[^0-9]/g, '').slice(0, decimals).padEnd(decimals, '0');
  const cleanWhole = whole.replace(/[^0-9]/g, '') || '0';
  // Strip leading zeros except keep one
  const out = (cleanWhole + cleanFrac).replace(/^0+(\d)/, '$1');
  return out;
}

function fromAtomic(atomic: string, decimals: number): string {
  if (!/^[0-9]+$/.test(atomic)) return atomic;
  if (atomic.length <= decimals) {
    return ('0.' + atomic.padStart(decimals, '0')).replace(/0+$/, '').replace(/\.$/, '');
  }
  const whole = atomic.slice(0, atomic.length - decimals);
  const frac = atomic.slice(atomic.length - decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

async function fetchJupiterQuote(sell: TokenMeta, buy: TokenMeta, atomicAmount: string): Promise<QuoteResult> {
  const t0 = Date.now();
  try {
    const url = new URL('https://quote-api.jup.ag/v6/quote');
    url.searchParams.set('inputMint', sell.address);
    url.searchParams.set('outputMint', buy.address);
    url.searchParams.set('amount', atomicAmount);
    url.searchParams.set('slippageBps', '50');
    const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!r.ok) {
      return { source: 'Jupiter', error: `Jupiter ${r.status}` };
    }
    const data: any = await r.json();
    const route = (data.routePlan || [])
      .map((leg: any) => leg.swapInfo?.label || leg.swapInfo?.ammKey?.slice(0, 6))
      .filter(Boolean);
    return {
      source: 'Jupiter',
      buyAmount: fromAtomic(String(data.outAmount), buy.decimals),
      route: route.length ? route : undefined,
      executeUrl: `https://jup.ag/swap/${sell.symbol}-${buy.symbol}`,
      latencyMs: Date.now() - t0,
    };
  } catch (e: any) {
    return { source: 'Jupiter', error: e?.message || String(e) };
  }
}

async function fetch1inchQuote(chainId: number, sell: TokenMeta, buy: TokenMeta, atomicAmount: string, apiKey: string | undefined): Promise<QuoteResult> {
  const t0 = Date.now();
  if (!apiKey) {
    return { source: '1inch', error: 'ONEINCH_API_KEY not configured' };
  }
  try {
    const url = new URL(`https://api.1inch.dev/swap/v6.0/${chainId}/quote`);
    url.searchParams.set('src', sell.address);
    url.searchParams.set('dst', buy.address);
    url.searchParams.set('amount', atomicAmount);
    url.searchParams.set('includeGas', 'true');
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { source: '1inch', error: `1inch ${r.status}: ${txt.slice(0, 200)}` };
    }
    const data: any = await r.json();
    return {
      source: '1inch',
      buyAmount: fromAtomic(String(data.dstAmount), buy.decimals),
      gasEstimate: data.gas ? String(data.gas) : undefined,
      executeUrl: `https://app.1inch.io/#/${chainId}/simple/swap/${sell.address}/${buy.address}`,
      latencyMs: Date.now() - t0,
    };
  } catch (e: any) {
    return { source: '1inch', error: e?.message || String(e) };
  }
}

function traidePlaceholder(chain: string): QuoteResult {
  return {
    source: 'TRAIDE',
    status: 'pending_mainnet',
    note: chain === 'base'
      ? 'TRAIDE quote available at Base mainnet GA. Open code review in progress.'
      : 'TRAIDE deploys to Base mainnet first. Other chains follow demand signal.',
  };
}

function pickBest(quotes: QuoteResult[]): string | null {
  const live = quotes.filter(q => q.buyAmount && !q.error);
  if (live.length === 0) return null;
  live.sort((a, b) => Number(b.buyAmount) - Number(a.buyAmount));
  return live[0].source;
}

function badRequest(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }, null, 2), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const chain = (url.searchParams.get('chain') || '').trim().toLowerCase();
  const sellRaw = (url.searchParams.get('sell') || '').trim();
  const buyRaw = (url.searchParams.get('buy') || '').trim();
  const amount = (url.searchParams.get('amount') || '').trim();

  if (!chain) return badRequest('chain is required (e.g. base, eth, arbitrum, optimism, polygon, solana)');
  if (!sellRaw || !buyRaw) return badRequest('sell and buy tokens are required');
  if (!amount || !/^[0-9]+(\.[0-9]+)?$/.test(amount) || Number(amount) <= 0) {
    return badRequest('amount must be a positive number');
  }

  // Cache lookup (5s)
  const cache = (caches as any).default as Cache;
  const cacheKey = new Request(url.toString(), context.request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let quotes: QuoteResult[] = [];

  if (SOLANA_CHAINS.has(chain)) {
    const sell = resolveTokenSolana(sellRaw);
    const buy = resolveTokenSolana(buyRaw);
    if (!sell) return badRequest(`Unknown Solana token "${sellRaw}". Use a symbol (sol, usdc, bonk, jup, jto) or full mint address.`);
    if (!buy) return badRequest(`Unknown Solana token "${buyRaw}".`);
    const atomic = toAtomic(amount, sell.decimals);
    const [jupQuote] = await Promise.all([fetchJupiterQuote(sell, buy, atomic)]);
    quotes = [jupQuote];
  } else {
    const chainId = CHAIN_ID[chain];
    if (!chainId) return badRequest(`Unknown chain "${chain}". Supported: eth, base, arbitrum, optimism, polygon, solana.`);
    const sell = resolveTokenEvm(chainId, sellRaw);
    const buy = resolveTokenEvm(chainId, buyRaw);
    if (!sell) return badRequest(`Unknown EVM token "${sellRaw}" on ${chain}. Use a known symbol or full 0x address.`);
    if (!buy) return badRequest(`Unknown EVM token "${buyRaw}" on ${chain}.`);
    const atomic = toAtomic(amount, sell.decimals);
    const apiKey = context.env.ONEINCH_API_KEY;
    const [oneInchQuote] = await Promise.all([fetch1inchQuote(chainId, sell, buy, atomic, apiKey)]);
    quotes = [oneInchQuote, traidePlaceholder(chain)];
  }

  const body: ResponseShape = {
    chain,
    sell: sellRaw,
    buy: buyRaw,
    sellAmount: amount,
    quotes,
    best: pickBest(quotes),
    fetchedAt: new Date().toISOString(),
  };

  const ttl = Number(context.env.QUOTE_CACHE_TTL_SECONDS || '5');
  const response = new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
      'Access-Control-Allow-Origin': '*',
    },
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
