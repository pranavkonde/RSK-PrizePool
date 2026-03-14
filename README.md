# RSK Prize Pool

**Gamified No-Loss Savings on Rootstock**- A PoolTogether-style application where users deposit rUSDT, earn yield via Sovryn (or mock), and one random depositor wins the weekly prize. Principal is always safe to withdraw.

📖 **[USER_GUIDE.md](./USER_GUIDE.md)**- How it works and how to use the app

## Features

- **ERC4626-style vault**: Standard tokenized vault for rUSDT deposits
- **Yield strategy**: Integrates with Rootstock yield protocols (Sovryn); includes mock for local dev
- **Weekly raffle**: Accumulated interest awarded to one random depositor
- **Frontend dashboard**: Current prize pot, your odds, countdown to next draw, deposit/withdraw

## Project Structure

```
├── contracts/
│   ├── PrizePoolVault.sol    # Main vault + raffle logic
│   ├── interfaces/IYieldStrategy.sol
│   └── mocks/               # MockERC20, MockYieldStrategy
├── scripts/
│   ├── deploy.js            # Generic deployment
│   └── deploy-and-save.js   # Deploy to localhost + write .env.local
├── test/
│   └── PrizePool.test.js
└── frontend/                # React + Viem + Wagmi
```

## Quick Start

### 1. Install & compile

```bash
npm install
npx hardhat compile
```

### 2. Run tests

```bash
npm test
```

### 3. Rootstock Testnet (Recommended)

Set `PRIVATE_KEY` in `.env` (create from `.env.example`). Get tRBTC from [faucet.rootstock.io](https://faucet.rootstock.io/).

```bash
npm run deploy:testnet
```

This deploys mocks + vault and writes `frontend/.env.local` with addresses and `VITE_CHAIN=rootstock_testnet`. Restart the frontend, connect your wallet, and switch to Rootstock Testnet (chainId 31).

On testnet, real rUSDT is not available, we use **Mock USDT** (deployed with the contracts). Click **"Get test tokens"** in the deposit section to mint 1,000 test USDT for free.

### 4. Local development

**Terminal 1- Hardhat node**

```bash
npm run node
```

**Terminal 2- Deploy**

```bash
npm run deploy:local
```

This deploys mocks + vault and writes `frontend/.env.local` with `VITE_VAULT_ADDRESS`.

**Terminal 3- Frontend**

```bash
cd frontend
npm install
npm run dev
```

### 5. Production (Rootstock Mainnet)

Set environment variables:

- `RUSDT_ADDRESS` rUSDT on Rootstock (default: `0xEf213441a85DF4d7acBdAe0Cf78004E1e486BB96`)
- `YIELD_STRATEGY_ADDRESS` Sovryn lending pool (or compatible strategy)

Then deploy:

```bash
npx hardhat run scripts/deploy.js --network rootstock_testnet
# or --network rootstock for mainnet
```

## Tech Stack

- **Solidity**: ERC4626 vault, custom raffle logic
- **Hardhat**: Build, test, deploy
- **React + Vite**: Frontend
- **Viem + Wagmi**: Web3 integration

## Security Notes

- **Randomness**: Current implementation uses `blockhash` + `block.prevrandao` for demo. For mainnet, use Chainlink VRF or another verifiable randomness source.
- **Yield strategy**: Replace `MockYieldStrategy` with a real Sovryn (or other) integration for production.
