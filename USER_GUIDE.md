# RSK Prize Pool- User Guide

## What Is It?

RSK Prize Pool is a **gamified no-loss savings** app on Rootstock. You deposit stablecoins (rUSDT), your principal stays safe, and every week one random depositor wins **all the accumulated interest** as a prize.

Think of it like a savings account where instead of earning a tiny bit of interest yourself, everyone pools interest and one person wins it all each week.

---

## How It Works

### 1. **Deposits**
- You deposit rUSDT (or test USDT on testnet) into the prize pool vault.
- Your funds are sent to a yield protocol (e.g., Sovryn on Rootstock) to earn interest.
- You receive **prUSDT** (Prize Pool shares), 1 prUSDT = 1 USDT of principal.

### 2. **Yield**
- The vault earns yield from the underlying lending protocol.
- That yield is not paid out to everyone; it builds up as the **prize pot**.

### 3. **Weekly Raffle**
- Every week, the contract runs a draw.
- One depositor is chosen at random.
- The winner receives **the entire prize pot** all the yield earned that week.
- Odds are proportional to your deposit: more prUSDT = higher chance to win.

### 4. **Withdrawals**
- You can withdraw your principal anytime.
- Your prUSDT is redeemed for rUSDT at 1:1.
- There is no lock-up period.

---

## Using the App

### Before You Start
- **Rootstock Testnet**: You need tRBTC for gas. Get it from [faucet.rootstock.io](https://faucet.rootstock.io/).
- **Wallet**: MetaMask or any EVM wallet that supports Rootstock.

### Step 1: Connect Your Wallet
1. Open the app (e.g., `http://localhost:5173` for local dev).
2. Click **Connect Wallet**.
3. Approve the connection in your wallet.

### Step 2: Switch to the Correct Network
- If you see **Switch to Rootstock Testnet**, click it.
- Your wallet will prompt you to add Rootstock Testnet (Chain ID 31) if it isn’t added yet.
- Approve the network switch.

### Step 3: Get Test Tokens (Testnet Only)
- On testnet, rUSDT isn’t available, so we use **Mock USDT**.
1. Click **Get test tokens**.
2. Confirm the transaction in your wallet.
3. You receive 1,000 test USDT.

### Step 4: Deposit
1. Enter the amount you want to deposit.
2. Click **Deposit**.
3. Approve the token spend (first-time only).
4. Confirm the deposit transaction.
5. Your balance appears as prUSDT.

### Step 5: Check Your Odds
- **Your Odds** shows your chance of winning the next draw, in percent.
- It’s based on your share of total deposits.
- Example: 10% of all prUSDT → 10% chance to win.

### Step 6: Wait for the Draw
- **Next Draw In** shows the countdown to the next weekly draw.
- When the timer reaches 0, anyone can trigger the draw.
- Click **Draw Winner (when due)** to run the raffle.

### Step 7: Withdraw (Anytime)
- You can withdraw your principal at any time.
- Switch to the **Withdraw** tab in the main section.
- Enter the amount (or click **Max**) and confirm.
- Your prUSDT is redeemed for rUSDT at 1:1.
- There is no lock-up period.

---

## Key Concepts

| Term | Meaning |
|------|---------|
| **prUSDT** | Your share of the vault. 1 prUSDT = 1 USDT of principal. |
| **Prize Pot** | Total yield earned since the last draw. Awarded to one winner. |
| **Odds** | Your chance of winning = (your prUSDT / total prUSDT) × 100%. |
| **Draw** | Weekly raffle that selects one depositor to receive the prize pot. |

---

## FAQ

**Is my principal safe?**  
Yes. Your deposit stays in the vault and yield protocol. You can withdraw it whenever you want.

**What if no one wins?**  
If there are no depositors or no yield, the draw is skipped and the timer resets.

**Who can trigger the draw?**  
Anyone can call it once the weekly timer is up.

**Is the winner selection random?**  
Yes. On testnet it uses block-based randomness. On mainnet you would typically use something like Chainlink VRF for better security.

**Do I need to do anything to be eligible?**  
No. As long as you hold prUSDT at draw time, you’re in the raffle.

---

## Network Details

### Rootstock Testnet
- **Chain ID:** 31  
- **RPC:** `https://public-node.testnet.rsk.co`  
- **Explorer:** https://explorer.testnet.rsk.co  
- **tRBTC Faucet:** https://faucet.rootstock.io  

### Rootstock Mainnet
- **Chain ID:** 30  
- **RPC:** `https://public-node.rsk.co`  
- **Explorer:** https://explorer.rsk.co  
