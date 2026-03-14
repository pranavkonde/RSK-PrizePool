import React, { useState, useEffect } from "react";
import "./App.css";
import "./Landing.css";
import Landing from "./Landing.jsx";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { prizePoolVaultAbi, erc20Abi, mockErc20Abi } from "./contracts/abi";

const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS || "0x0000000000000000000000000000000000000000").toLowerCase();
const FALLBACK_ASSET_ADDRESS = (import.meta.env.VITE_ASSET_ADDRESS || "").toLowerCase();
const HAS_VAULT = VAULT_ADDRESS && VAULT_ADDRESS !== "0x0000000000000000000000000000000000000000";
const TARGET_CHAIN_ID = import.meta.env.VITE_CHAIN === "rootstock_testnet" ? 31 : import.meta.env.VITE_CHAIN === "rootstock" ? 30 : 31337;

function Countdown({ initialSeconds }) {
  const [seconds, setSeconds] = useState(initialSeconds ?? 0);
  useEffect(() => {
    if (initialSeconds === undefined) return;
    setSeconds(Number(initialSeconds));
    const id = setInterval(() => {
      setSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [initialSeconds]);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return (
    <span className="countdown">
      {h}d {m}h {s}s
    </span>
  );
}

function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [activeTab, setActiveTab] = useState("deposit");
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID;

  const readContractConfig = {
    address: HAS_VAULT ? VAULT_ADDRESS : undefined,
    abi: prizePoolVaultAbi,
    ...(TARGET_CHAIN_ID !== 31337 && { chainId: TARGET_CHAIN_ID }),
  };

  const { data: userBalance, refetch: refetchVaultBalance } = useReadContract({
    ...readContractConfig,
    functionName: "balanceOf",
    args: [address || "0x0000000000000000000000000000000000000000"],
  });

  const { data: prizePot, refetch: refetchPrizePot } = useReadContract({
    ...readContractConfig,
    functionName: "currentPrizePot",
    args: [],
  });

  const { data: userOdds, refetch: refetchOdds } = useReadContract({
    ...readContractConfig,
    functionName: "getUserOdds",
    args: [address || "0x0000000000000000000000000000000000000000"],
  });

  const { data: secondsUntilDraw, refetch: refetchDrawTime } = useReadContract({
    ...readContractConfig,
    functionName: "secondsUntilNextDraw",
    args: [],
  });

  const refetchAll = () => {
    refetchVaultBalance();
    refetchPrizePot();
    refetchOdds();
    refetchDrawTime();
  };

  const { data: assetFromContract } = useReadContract({
    ...readContractConfig,
    functionName: "asset",
    args: [],
  });
  const assetAddress = assetFromContract || (FALLBACK_ASSET_ADDRESS || undefined);

  const { writeContract: drawWinner, isPending: isDrawing } = useWriteContract();

  const prizeFormatted = prizePot ? formatUnits(prizePot, 6) : "0";
  const oddsFormatted = userOdds !== undefined ? (Number(userOdds) / 100).toFixed(2) : "0";
  const balanceFormatted = userBalance ? formatUnits(userBalance, 6) : "0";

  if (showLanding) {
    return <Landing onEnter={() => setShowLanding(false)} />;
  }

  if (!HAS_VAULT) {
    return (
      <div className="app">
        <header className="app-header">
          <button onClick={() => setShowLanding(true)} className="logo-link">
            RSK Prize Pool
          </button>
        </header>
        <main>
          <div className="card setup-card">
            <h2>Setup Required</h2>
            <p>Deploy the contracts to Rootstock Testnet:</p>
            <ol>
              <li>Create a <code>.env</code> file with your <code>PRIVATE_KEY</code></li>
              <li>Run <code>npm run deploy:testnet</code></li>
              <li>Restart the frontend (it will read <code>VITE_VAULT_ADDRESS</code> from <code>.env.local</code>)</li>
            </ol>
            <p className="hint" style={{ marginTop: 15 }}>
              Need testnet RBTC? Get some from the <a href="https://faucet.rootstock.io/" target="_blank" rel="noopener noreferrer" style={{ color: "#ff9100" }}>Rootstock Faucet</a>.
            </p>
            <button onClick={() => setShowLanding(true)} className="btn btn-secondary" style={{ marginTop: 20 }}>
              Back to Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <button onClick={() => setShowLanding(true)} className="logo-link">
          RSK Prize Pool
        </button>
        <div className="wallet">
          {!isConnected ? (
            <button
              onClick={() => connect({ connector: connectors[0] })}
              className="btn btn-primary"
            >
              Connect Wallet
            </button>
          ) : wrongChain ? (
            <button
              onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
              disabled={isSwitching}
              className="btn btn-primary"
            >
              {isSwitching ? (
                <span className="btn-loading-dots"><span /><span /><span /></span>
              ) : (
                "Switch to Rootstock Testnet"
              )}
            </button>
          ) : (
            <div className="wallet-info">
              <span className="chain-badge">
                {chainId === 31 ? "Testnet" : chainId === 30 ? "Mainnet" : "Local"}
              </span>
              <span className="address">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              <button onClick={() => disconnect()} className="btn btn-ghost">
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-main" role="main">
        <section className="cards">
          <div className="card card-prize">
            <h2>Current Prize Pot</h2>
            <p className="value">{prizeFormatted} rUSDT</p>
            <p className="hint">Weekly raffle • One random winner takes all yield</p>
          </div>

          <div className="card card-countdown">
            <h2>Next Draw In</h2>
            <p className="value">
              {secondsUntilDraw !== undefined ? (
                <Countdown initialSeconds={Number(secondsUntilDraw)} />
              ) : (
                <span className="skeleton" style={{ display: "inline-block", width: 80, height: 24 }} />
              )}
            </p>
            <button
              onClick={() => drawWinner({ address: VAULT_ADDRESS, abi: prizePoolVaultAbi, functionName: "drawWinner", args: [] })}
              disabled={isDrawing || secondsUntilDraw === undefined || Number(secondsUntilDraw) > 0}
              className="btn btn-secondary"
            >
              {isDrawing ? (
                <span className="btn-loading-dots"><span /><span /><span /></span>
              ) : (
                "Draw Winner (when due)"
              )}
            </button>
          </div>

          <div className="card card-odds">
            <h2>Your Odds</h2>
            <p className="value">{oddsFormatted}%</p>
            <p className="hint">Based on your share of total deposits</p>
            <p className="balance">Your balance: {balanceFormatted} prUSDT</p>
          </div>
        </section>

        <section className="deposit-section">
          <div className="tabs">
            <button 
              className={`tab-btn ${activeTab === "deposit" ? "active" : ""}`} 
              onClick={() => setActiveTab("deposit")}
            >
              Deposit
            </button>
            <button 
              className={`tab-btn ${activeTab === "withdraw" ? "active" : ""}`} 
              onClick={() => setActiveTab("withdraw")}
            >
              Withdraw
            </button>
          </div>

          {assetAddress ? (
            activeTab === "deposit" ? (
              <DepositForm
                vaultAddress={VAULT_ADDRESS}
                assetAddress={assetAddress}
                isTestnet={TARGET_CHAIN_ID === 31}
                chainId={TARGET_CHAIN_ID}
                onSuccess={refetchAll}
              />
            ) : (
              <WithdrawForm
                vaultAddress={VAULT_ADDRESS}
                isTestnet={TARGET_CHAIN_ID === 31}
                chainId={TARGET_CHAIN_ID}
                onSuccess={refetchAll}
              />
            )
          ) : (
            <div className="deposit-loading">
              <div className="skeleton" style={{ height: 40, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 48 }} />
              <p className="hint" style={{ marginTop: 12 }}>Connect wallet and switch to the correct network</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function DepositForm({ vaultAddress, assetAddress, isTestnet, chainId, onSuccess }) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [mintError, setMintError] = useState("");
  const [mintHash, setMintHash] = useState("");
  const { writeContractAsync: approve, isPending: isApproving } = useWriteContract();
  const { writeContractAsync: deposit, isPending: isDepositing } = useWriteContract();
  const { writeContractAsync: mint, isPending: isMinting } = useWriteContract();

  const { data: assetBalance, refetch: refetchBalance } = useReadContract({
    address: assetAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address || "0x0"],
    ...(chainId && chainId !== 31337 && { chainId }),
  });

  const { isLoading: isMintConfirming, isSuccess: isMintSuccess } = useWaitForTransactionReceipt({ hash: mintHash });
  useEffect(() => {
    if (isMintSuccess && mintHash) {
      refetchBalance();
      if (onSuccess) onSuccess();
      setMintHash("");
    }
  }, [isMintSuccess, mintHash, refetchBalance, onSuccess]);

  const { refetch: refetchAllowance } = useReadContract({
    address: assetAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address || "0x0", vaultAddress],
    ...(chainId && chainId !== 31337 && { chainId }),
  });

  const handleFaucet = async () => {
    if (!address || !assetAddress) return;
    setMintError("");
    setMintHash("");
    try {
      const hash = await mint({
        address: assetAddress,
        abi: mockErc20Abi,
        functionName: "mint",
        args: [address, BigInt(1000 * 1e6)],
        ...(chainId && { chainId }),
      });
      if (hash) setMintHash(hash);
    } catch (err) {
      const msg = err?.shortMessage || err?.message || "Transaction failed";
      setMintError(msg.includes("User rejected") ? "Transaction cancelled" : msg);
      console.error(err);
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!amount || !address || !assetAddress) return;
    const rawAmount = BigInt(Math.floor(parseFloat(amount) * 1e6));
    try {
      await approve({
        address: assetAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [vaultAddress, rawAmount],
        ...(chainId && { chainId }),
      });
      await refetchAllowance();
      await deposit({
        address: vaultAddress,
        abi: prizePoolVaultAbi,
        functionName: "deposit",
        args: [rawAmount, address],
        ...(chainId && { chainId }),
      });
      setAmount("");
      refetchBalance();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  const balanceFormatted = assetBalance ? formatUnits(assetBalance, 6) : "0";

  return (
    <div className="deposit-form-wrapper">
      {isTestnet && (
        <div className="faucet-row">
          <span className="hint">Testnet: Get 1,000 test USDT</span>
          <button
            type="button"
            onClick={handleFaucet}
            disabled={!address || isMinting || isMintConfirming}
            className="btn btn-secondary"
          >
            {(isMinting || isMintConfirming) ? (
              <span className="btn-loading-dots"><span /><span /><span /></span>
            ) : (
              "Get test tokens"
            )}
          </button>
          {mintError && <p className="error-msg">{mintError}</p>}
        </div>
      )}
      <p className="hint">Your token balance: {balanceFormatted}</p>
      <form onSubmit={handleDeposit} className="deposit-form">
        <input
          type="number"
          placeholder={`Amount (${isTestnet ? "test USDT" : "rUSDT"})`}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        min="0"
        step="0.01"
      />
      <button
        type="submit"
        disabled={!amount || !address || isApproving || isDepositing}
        className="btn btn-primary"
      >
        {(isApproving || isDepositing) ? (
          <span className="btn-loading-dots"><span /><span /><span /></span>
        ) : (
          "Deposit"
        )}
      </button>
      </form>
    </div>
  );
}

function WithdrawForm({ vaultAddress, isTestnet, chainId, onSuccess }) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [withdrawHash, setWithdrawHash] = useState("");
  const { writeContractAsync: redeem, isPending: isWithdrawing } = useWriteContract();

  const { data: userBalance, refetch: refetchBalance } = useReadContract({
    address: vaultAddress,
    abi: prizePoolVaultAbi,
    functionName: "balanceOf",
    args: [address || "0x0"],
    ...(chainId && chainId !== 31337 && { chainId }),
  });

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: withdrawHash });

  useEffect(() => {
    if (isSuccess && withdrawHash) {
      setAmount("");
      refetchBalance();
      if (onSuccess) onSuccess();
      setWithdrawHash("");
    }
  }, [isSuccess, withdrawHash, refetchBalance, onSuccess]);

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!amount || !address) return;
    setError("");
    setWithdrawHash("");
    
    try {
      // Use parseUnits instead of parseFloat * 1e6 for better precision
      const rawAmount = parseUnits(amount, 6);
      
      const hash = await redeem({
        address: vaultAddress,
        abi: prizePoolVaultAbi,
        functionName: "redeem",
        args: [rawAmount, address, address],
        ...(chainId && { chainId }),
      });
      
      if (hash) setWithdrawHash(hash);
    } catch (err) {
      console.error(err);
      setError(err?.shortMessage || err?.message || "Withdrawal failed");
    }
  };

  const handleMax = () => {
    if (userBalance) {
      setAmount(formatUnits(userBalance, 6));
    }
  };

  const balanceFormatted = userBalance ? formatUnits(userBalance, 6) : "0";
  const isPending = isWithdrawing || isConfirming;

  return (
    <div className="deposit-form-wrapper">
      <div className="balance-row">
        <p className="hint">Your prUSDT balance: {balanceFormatted}</p>
        <button type="button" onClick={handleMax} className="btn-link">Max</button>
      </div>
      <form onSubmit={handleWithdraw} className="deposit-form">
        <input
          type="number"
          placeholder="Amount (prUSDT)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.01"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={!amount || !address || isPending}
          className="btn btn-primary"
        >
          {isPending ? (
            <span className="btn-loading-dots"><span /><span /><span /></span>
          ) : (
            "Withdraw"
          )}
        </button>
      </form>
      {error && <p className="error-msg" style={{ marginTop: 10 }}>{error}</p>}
      <p className="hint" style={{ marginTop: 15 }}>
        Withdrawals are 1:1. Your prUSDT will be redeemed for {isTestnet ? "test USDT" : "rUSDT"}.
      </p>
    </div>
  );
}

export default App;
