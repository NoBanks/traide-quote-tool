# TRAIDE Quote Tool

**Live URL (target):** [quote.traidedefi.com](https://quote.traidedefi.com)
**Status:** v1 built 2026-05-19. Awaits Cloudflare Pages deploy + 1inch API key + custom domain wiring.

A free public tool that compares swap quotes across DEX aggregators in real time. Built for both humans (single-page UI, no wallet required to fetch a quote) and AI agents (clean JSON API endpoint, optional x402 tip).

Built and maintained by the [TRAIDE](https://traidedefi.com) team.

## What it does

User selects: chain, sell token, buy token, sell amount. Tool returns quotes from multiple sources side by side, including the best price, the gas estimate, the route breakdown, and a one-click link to execute on the winning venue.

Sources integrated in v1:

| Chain family | Source | API key needed |
|---|---|---|
| Solana | Jupiter Quote API v6 | no |
| Ethereum, Base, Arbitrum, Optimism, Polygon | 1inch Aggregator v6 | yes (free tier, [1inch portal](https://portal.1inch.dev/)) |
| Base (post-mainnet GA) | TRAIDE AMM router | no |

Sources reserved for v1.5 (after first traffic data): 0x Swap API, KyberSwap, CoW Protocol, ParaSwap, Uniswap V4 direct.

## Why this exists

- **Brand vehicle for TRAIDE.** Every quote query becomes a brand impression, even when TRAIDE does not win. Subdomain `quote.traidedefi.com` carries TRAIDE branding by URL alone.
- **Useful to humans and agents.** Humans get a clean UI. Agents get a JSON API. Same backend.
- **Dogfoods x402.** The agent-side API is x402-gated as an optional tip path (free to call without tipping, paid tier for guaranteed low-latency response).
- **Free to host.** Static frontend on Cloudflare Pages, backend logic in Cloudflare Pages Functions. Both free up to generous limits.

## Architecture

```
public/                  Static SPA (no build step required)
  index.html             Single page
  app.js                 Vanilla JS, quote fetcher + renderer
  style.css              TRAIDE-brand dark UI
functions/api/           Cloudflare Pages Functions (Workers under the hood)
  quote.ts               GET /api/quote, fans out to Jupiter + 1inch in parallel, returns aggregated JSON
  tip-info.ts            GET /api/tip-info, returns tip wallet addresses
  health.ts              GET /api/health, status probe
wrangler.toml            Cloudflare Pages config
package.json             Minimal, only for wrangler dev tooling
```

Single deploy: `wrangler pages deploy public` from the repo root.

## API: `GET /api/quote`

Query parameters:

| Param | Required | Example | Notes |
|---|---|---|---|
| `chain` | yes | `base`, `eth`, `arbitrum`, `optimism`, `polygon`, `solana` | Lowercase chain id |
| `sell` | yes | `USDC` or `0x833589f...` | Symbol for popular tokens, or full address |
| `buy` | yes | `ETH` or `0x4200000...` | Same |
| `amount` | yes | `100` | In sell-token human units (e.g. 100 = 100 USDC), not wei |

Response:

```json
{
  "chain": "base",
  "sell": "USDC",
  "buy": "ETH",
  "sellAmount": "100",
  "quotes": [
    {
      "source": "1inch",
      "buyAmount": "0.0287",
      "buyAmountUsd": 99.42,
      "gasEstimate": "180000",
      "gasUsd": 0.18,
      "route": ["USDC", "WETH"],
      "executeUrl": "https://app.1inch.io/...",
      "latencyMs": 412
    },
    {
      "source": "TRAIDE",
      "status": "pending_mainnet",
      "note": "TRAIDE quote available at mainnet GA on Base."
    }
  ],
  "best": "1inch",
  "fetchedAt": "2026-05-19T22:14:00Z"
}
```

Errors:

| Status | Reason |
|---|---|
| 400 | Missing or invalid params |
| 429 | Rate limit upstream (1inch etc) |
| 502 | All upstream sources failed |

## API: `GET /api/tip-info`

Returns tip wallet addresses + the x402 tip endpoint URL.

```json
{
  "evm": "0x897025A3d0260fAeA5Dc705e2037b8AFB0480F23",
  "solana": "pending",
  "x402_tip_url": "https://quote.traidedefi.com/api/x402-tip",
  "thanks": "Tips fund TRAIDE Quote Tool ops + Living Agentic stack development."
}
```

## Local dev

```bash
npm install
npx wrangler pages dev public --compatibility-date=2026-05-19
```

Open http://localhost:8788. The Functions in `functions/api/` are auto-mounted at `/api/*`.

## Deploy

One-time setup:
1. Get a free 1inch API key from [portal.1inch.dev](https://portal.1inch.dev/)
2. `npx wrangler pages secret put ONEINCH_API_KEY` and paste when prompted
3. (Optional) Get a 0x API key from [0x.org dashboard](https://dashboard.0x.org/) and store as `ZEROEX_API_KEY` once v1.5 ships
4. Add custom domain `quote.traidedefi.com` via the Cloudflare Pages dashboard (the CNAME is auto-provisioned)

Recurring deploy:
```bash
npx wrangler pages deploy public --project-name=traide-quote-tool
```

## License

MIT. Open source. Forks welcome. Attribution appreciated.
