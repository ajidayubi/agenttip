# AgentTip — Tip BNB to any Agent ID (.ai name)

A dApp for the **Binance Wallet × BNB Chain Agent ID Hackathon** (submissions
18 Nov – 9 Dec 2026 08:00 UTC). Send BNB to a `.ai` Agent ID name without
knowing the 0x address: the contract resolves the name on-chain via the
SPACE ID Agent ID registry and forwards the full amount to the name's owner.
0 fee, no admin, no token.

## How it works

1. You type an Agent ID name, e.g. `ajidayubi` (with or without `.ai`, any case).
2. The contract normalizes the name (trim, lowercase, strip `.ai`), computes
   `tokenId = uint256(keccak256(name))`, and calls `ownerOf(tokenId)` on the
   Agent ID registry `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`.
3. Your BNB is forwarded in full to that address. The contract keeps nothing
   and has no owner/admin functions. Tips are irreversible.

## Layout

| Path | What it is |
|---|---|
| `contracts/AgentTip.sol` | The contract (single file, no imports, MIT). |
| `test/AgentTip.t.sol` | 11 Foundry fork tests against BSC mainnet (real registry). |
| `script/Deploy.s.sol` | Deploy script (testnet + mainnet). |
| `frontend/` | Static site: `index.html`, `app.js`, `style.css`, `abi.json` (no build step). |
| `scripts/e2e-fork.mjs` | E2E run against a local anvil fork of BSC mainnet. |
| `deployer-keypair.json` | **Fresh project deployer keypair, mode 600. Never print or share its private key.** |
| `docs/deployment-plan.md` | Mainnet deploy plan (deployer address, BNB needed, commands). |
| `docs/submission.md` | Hackathon submission materials draft. |
| `out/AgentTip.flattened.sol` | Verification source (identical to the contract file — no imports). |

## Test (all read-only against BSC mainnet, no funds needed)

```bash
export PATH="$HOME/.foundry/bin:$PATH"
forge test --fork-url https://bsc-dataseed.binance.org/
# 11 passed, 0 failed. Covers: registry formula, normalization,
# full-value forwarding, events, minimum amount, all reverts.
```

Deploy gas measured on a fork: **610,711 gas** for deployment,
~64–72k gas per tip. At the current BSC gas price (~0.05 gwei) the deploy
costs ~0.00003 BNB.

## Frontend

Static files — serve `frontend/` with any static host (planned: GitHub Pages
at `https://ajidayubi.github.io/agenttip/`). Set `CONFIG.CONTRACT_ADDRESS`
and `CONFIG.DEPLOY_BLOCK` in `frontend/app.js` after each deployment.
`node --check frontend/app.js` passes. The frontend was verified at the
call level against a fork (resolve → tip → Tip event → getLogs); a full
browser run needs the mainnet deployment (pending).

## Deploy

See `docs/deployment-plan.md`. **Do NOT deploy to mainnet without the user's
explicit confirmation** — the plan includes the one-line summary to show him
first. Testnet deploy is blocked on faucet tBNB for the deployer address.

## Safety / hackathon red lines

- No QR-code login, no session storage, no bypassing user confirmation.
- No approvals, no token handling, no promised returns.
- No name-lookup/directory page (resolution happens only as part of a tip).
- No "Binance" in the project name, no seed/private-key collection.
- Contract is immutable: no owner, no pause, no withdraw — nothing to disclose.
