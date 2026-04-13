import React, { useState, useEffect, useRef, useMemo } from "react";
import "./App.css";
import "./Landing.css";
import Landing from "./Landing.jsx";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { formatUnits, parseUnits, encodePacked, keccak256, toHex } from "viem";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useReadContract, useWriteContract } from "wagmi";
import { prizePoolVaultAbi, erc20Abi, mockErc20Abi } from "./contracts/abi";
import { wagmiConfig } from "./wagmi.jsx";

const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS || "0x0000000000000000000000000000000000000000").toLowerCase();
const FALLBACK_ASSET_ADDRESS = (import.meta.env.VITE_ASSET_ADDRESS || "").toLowerCase();
const HAS_VAULT = VAULT_ADDRESS && VAULT_ADDRESS !== "0x0000000000000000000000000000000000000000";
const TARGET_CHAIN_ID = import.meta.env.VITE_CHAIN === "rootstock_testnet" ? 31 : import.meta.env.VITE_CHAIN === "rootstock" ? 30 : 31337;

function drawSecretKey(vault) {
  return `rsk-prizepool-draw-secret:${vault}`;
}

function readStoredDrawSecret(vault) {
  try {
    const v = sessionStorage.getItem(drawSecretKey(vault));
    return v && /^0x[0-9a-fA-F]{64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function storeDrawSecret(vault, secretHex) {
  try {
    sessionStorage.setItem(drawSecretKey(vault), secretHex);
  } catch {
    /* ignore quota / private mode */
  }
}

function Countdown({ initialSeconds }) {
  const endRef = useRef(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (initialSeconds === undefined) return undefined;
    const end = Date.now() + Number(initialSeconds) * 1000;
    endRef.current = end;
    const tick = () => {
      const s = Math.max(0, Math.floor((endRef.current - Date.now()) / 1000));
      setSeconds(s);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [initialSeconds]);

  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return (
    <span className="countdown">
      {d > 0 && (
        <>
          <span className="countdown-value">{d}</span>
          <span className="countdown-unit">d</span>
        </>
      )}
      <span className="countdown-value">{h}</span>
      <span className="countdown-unit">h</span>
      <span className="countdown-value">{m}</span>
      <span className="countdown-unit">m</span>
      <span className="countdown-value">{s}</span>
      <span className="countdown-unit">s</span>
    </span>
  );
}

function formatTxError(err) {
  const msg = err?.shortMessage || err?.message || "Transaction failed";
  if (msg.includes("User rejected") || msg.includes("user rejected")) return "Transaction cancelled";
  return msg;
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

  const readContractConfig = useMemo(
    () => ({
      address: HAS_VAULT ? VAULT_ADDRESS : undefined,
      abi: prizePoolVaultAbi,
      ...(TARGET_CHAIN_ID !== 31337 && { chainId: TARGET_CHAIN_ID }),
    }),
    []
  );

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

  const { data: isEntropyReady, refetch: refetchEntropyReady } = useReadContract({
    ...readContractConfig,
    functionName: "isEntropyReady",
    args: [],
  });

  const { data: drawCommitment, refetch: refetchCommitment } = useReadContract({
    ...readContractConfig,
    functionName: "drawEntropyCommitment",
    args: [],
  });

  const { data: entropyCommittedAt } = useReadContract({
    ...readContractConfig,
    functionName: "entropyCommittedAt",
    args: [],
  });

  const { data: entropyDelaySec } = useReadContract({
    ...readContractConfig,
    functionName: "ENTROPY_DELAY",
    args: [],
  });

  const { data: vaultOwner } = useReadContract({
    ...readContractConfig,
    functionName: "owner",
    args: [],
  });

  const refetchAll = () => {
    refetchVaultBalance();
    refetchPrizePot();
    refetchOdds();
    refetchDrawTime();
    refetchEntropyReady();
    refetchCommitment();
  };

  const { data: assetFromContract } = useReadContract({
    ...readContractConfig,
    functionName: "asset",
    args: [],
  });
  const assetAddress = assetFromContract || (FALLBACK_ASSET_ADDRESS || undefined);

  const { writeContractAsync: writeVaultAsync, isPending: isVaultWriting } = useWriteContract();

  const [drawError, setDrawError] = useState("");

  const prizeFormatted = prizePot ? formatUnits(prizePot, 6) : "0";
  const oddsFormatted = userOdds !== undefined ? (Number(userOdds) / 100).toFixed(2) : "0";
  const balanceFormatted = userBalance ? formatUnits(userBalance, 6) : "0";

  const drawDue = secondsUntilDraw !== undefined && Number(secondsUntilDraw) === 0;
  const hasPot = prizePot !== undefined && prizePot > 0n;
  const isVaultOwner =
    vaultOwner !== undefined && address && vaultOwner.toLowerCase() === address.toLowerCase();
  const needsCommit = drawDue && hasPot && (!drawCommitment || drawCommitment === "0x0000000000000000000000000000000000000000000000000000000000000000");
  const storedSecret = HAS_VAULT ? readStoredDrawSecret(VAULT_ADDRESS) : null;
  const canDrawWithSecret = drawDue && hasPot && isEntropyReady === true && storedSecret;

  const entropyEtaSeconds =
    drawCommitment &&
    drawCommitment !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
    entropyCommittedAt !== undefined &&
    entropyDelaySec !== undefined
      ? Math.max(0, Number(entropyCommittedAt) + Number(entropyDelaySec) - Math.floor(Date.now() / 1000))
      : null;

  const handleCommitEntropy = async () => {
    if (!HAS_VAULT) return;
    setDrawError("");
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const secret = toHex(bytes);
      const commitment = keccak256(encodePacked(["bytes32"], [secret]));
      storeDrawSecret(VAULT_ADDRESS, secret);
      const hash = await writeVaultAsync({
        address: VAULT_ADDRESS,
        abi: prizePoolVaultAbi,
        functionName: "commitDrawEntropy",
        args: [commitment],
        ...(TARGET_CHAIN_ID !== 31337 && { chainId: TARGET_CHAIN_ID }),
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      refetchAll();
    } catch (err) {
      setDrawError(formatTxError(err));
      console.error(err);
    }
  };

  const handleDrawWinner = async () => {
    if (!HAS_VAULT) return;
    setDrawError("");
    const secret = readStoredDrawSecret(VAULT_ADDRESS);
    if (!secret) {
      setDrawError("No draw secret in this browser session. Commit entropy from this device first.");
      return;
    }
    try {
      const hash = await writeVaultAsync({
        address: VAULT_ADDRESS,
        abi: prizePoolVaultAbi,
        functionName: "drawWinner",
        args: [secret],
        ...(TARGET_CHAIN_ID !== 31337 && { chainId: TARGET_CHAIN_ID }),
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      refetchAll();
    } catch (err) {
      setDrawError(formatTxError(err));
      console.error(err);
    }
  };

  if (showLanding) {
    return <Landing onEnter={() => setShowLanding(false)} />;
  }

  if (!HAS_VAULT) {
    return (
      <div className="app">
        <header className="app-header">
          <button type="button" onClick={() => setShowLanding(true)} className="logo-link">
            RSK Prize Pool
          </button>
        </header>
        <main>
          <div className="card setup-card">
            <h2>Setup Required</h2>
            <p>Deploy the contracts to Rootstock Testnet:</p>
            <ol>
              <li>
                Create a <code>.env</code> file with your <code>PRIVATE_KEY</code>
              </li>
              <li>
                Run <code>npm run deploy:testnet</code>
              </li>
              <li>
                Restart the frontend (it will read <code>VITE_VAULT_ADDRESS</code> from <code>.env.local</code>)
              </li>
            </ol>
            <p className="hint" style={{ marginTop: 15 }}>
              Need testnet RBTC? Get some from the{" "}
              <a href="https://faucet.rootstock.io/" target="_blank" rel="noopener noreferrer" style={{ color: "#ff9100" }}>
                Rootstock Faucet
              </a>
              .
            </p>
            <button type="button" onClick={() => setShowLanding(true)} className="btn btn-secondary" style={{ marginTop: 20 }}>
              Back to Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="background-glow" />
      <header className="app-header">
        <button type="button" onClick={() => setShowLanding(true)} className="logo-link">
          RSK Prize Pool
        </button>
        <div className="wallet">
          {!isConnected ? (
            <button type="button" onClick={() => connect({ connector: connectors[0] })} className="btn btn-primary">
              Connect Wallet
            </button>
          ) : wrongChain ? (
            <button
              type="button"
              onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
              disabled={isSwitching}
              className="btn btn-primary"
            >
              {isSwitching ? (
                <span className="btn-loading-dots">
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                "Switch Network"
              )}
            </button>
          ) : (
            <div className="wallet-info">
              <span className="chain-badge">{chainId === 31 ? "Testnet" : chainId === 30 ? "Mainnet" : "Local"}</span>
              <span className="address">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <button type="button" onClick={() => disconnect()} className="btn btn-ghost" aria-label="Disconnect wallet" title="Disconnect">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-main">
        <div className="dashboard-layout">
          <div className="stats-column">
            <section className="cards">
              <div className="card card-prize">
                <h2>Current Prize Pot</h2>
                <div className="value">
                  {prizeFormatted} <span className="unit">rUSDT</span>
                </div>
                <p className="hint">Weekly raffle • One random winner takes all yield</p>
              </div>

              <div className="card card-countdown">
                <h2>Next Draw In</h2>
                <div className="value">
                  {secondsUntilDraw !== undefined ? (
                    <Countdown initialSeconds={Number(secondsUntilDraw)} />
                  ) : (
                    <div className="skeleton" style={{ width: 180, height: 44, borderRadius: 12 }} />
                  )}
                </div>
                <p className="hint" style={{ marginTop: 12 }}>
                  Prize draws use commit–reveal: the vault owner commits entropy at least one hour before calling draw (see <code>ENTROPY_DELAY</code>).
                </p>
                {needsCommit && isVaultOwner && (
                  <button
                    type="button"
                    onClick={handleCommitEntropy}
                    disabled={!address || isVaultWriting || wrongChain}
                    className="btn btn-secondary"
                    style={{ marginTop: 16, width: "100%" }}
                  >
                    {isVaultWriting ? (
                      <span className="btn-loading-dots">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : (
                      "Commit draw entropy"
                    )}
                  </button>
                )}
                {needsCommit && address && !isVaultOwner && (
                  <p className="hint" style={{ marginTop: 16 }}>
                    Only the vault owner can commit draw entropy. Connect the owner wallet or ask the operator to commit before the draw window.
                  </p>
                )}
                {!needsCommit && hasPot && drawDue && drawCommitment && drawCommitment !== "0x0000000000000000000000000000000000000000000000000000000000000000" && isEntropyReady === false && entropyEtaSeconds !== null && (
                  <p className="hint" style={{ marginTop: 12 }}>
                    Entropy ready in ~{Math.ceil(entropyEtaSeconds / 60)} min (wallet time is approximate).
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleDrawWinner}
                  disabled={isVaultWriting || !drawDue || !hasPot || !canDrawWithSecret || wrongChain}
                  className="btn btn-secondary"
                  style={{ marginTop: 16, width: "100%" }}
                >
                  {isVaultWriting ? (
                    <span className="btn-loading-dots">
                      <span />
                      <span />
                      <span />
                    </span>
                  ) : (
                    "Draw winner"
                  )}
                </button>
                {drawError && (
                  <p className="error-msg" style={{ marginTop: 12 }} role="alert">
                    {drawError}
                  </p>
                )}
              </div>

              <div className="card card-odds">
                <h2>Your Odds</h2>
                <div className="value">
                  {oddsFormatted}
                  <span className="unit">%</span>
                </div>
                <p className="hint">Based on your share of total deposits</p>
                <div className="balance">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                    <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                    <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" />
                  </svg>
                  {balanceFormatted} prUSDT
                </div>
              </div>
            </section>
          </div>

          <section className="deposit-section" aria-label="Vault actions">
            <div className="tabs" role="tablist" aria-label="Deposit or withdraw">
              <button
                type="button"
                role="tab"
                id="tab-deposit"
                aria-selected={activeTab === "deposit"}
                aria-controls="panel-deposit"
                className={`tab-btn ${activeTab === "deposit" ? "active" : ""}`}
                onClick={() => setActiveTab("deposit")}
              >
                Deposit
              </button>
              <button
                type="button"
                role="tab"
                id="tab-withdraw"
                aria-selected={activeTab === "withdraw"}
                aria-controls="panel-withdraw"
                className={`tab-btn ${activeTab === "withdraw" ? "active" : ""}`}
                onClick={() => setActiveTab("withdraw")}
              >
                Withdraw
              </button>
            </div>

            <div className="form-container">
              {assetAddress ? (
                activeTab === "deposit" ? (
                  <div id="panel-deposit" role="tabpanel" aria-labelledby="tab-deposit">
                    <DepositForm
                      vaultAddress={VAULT_ADDRESS}
                      assetAddress={assetAddress}
                      isTestnet={TARGET_CHAIN_ID === 31}
                      isLocal={TARGET_CHAIN_ID === 31337}
                      chainId={TARGET_CHAIN_ID}
                      onSuccess={refetchAll}
                    />
                  </div>
                ) : (
                  <div id="panel-withdraw" role="tabpanel" aria-labelledby="tab-withdraw">
                    <WithdrawForm
                      vaultAddress={VAULT_ADDRESS}
                      isTestnet={TARGET_CHAIN_ID === 31}
                      chainId={TARGET_CHAIN_ID}
                      onSuccess={refetchAll}
                    />
                  </div>
                )
              ) : (
                <div className="deposit-loading">
                  <div className="skeleton" style={{ height: 120, marginBottom: 24, borderRadius: 24 }} />
                  <div className="skeleton" style={{ height: 64, borderRadius: 20 }} />
                  <p className="hint" style={{ marginTop: 20, textAlign: "center" }}>
                    Connect wallet to start saving
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function DepositForm({ vaultAddress, assetAddress, isTestnet, isLocal, chainId, onSuccess }) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [mintError, setMintError] = useState("");
  const [formError, setFormError] = useState("");
  const [successHash, setSuccessHash] = useState("");
  const { writeContractAsync: approveAsync, isPending: isApproving } = useWriteContract();
  const { writeContractAsync: depositAsync, isPending: isDepositing } = useWriteContract();
  const { writeContractAsync: mintAsync, isPending: isMinting } = useWriteContract();

  const { data: tokenOwner } = useReadContract({
    address: assetAddress,
    abi: mockErc20Abi,
    functionName: "owner",
    args: [],
    query: { enabled: Boolean(assetAddress) && (isTestnet || isLocal), retry: false },
    ...(chainId && chainId !== 31337 && { chainId }),
  });

  const { data: assetBalance, refetch: refetchBalance } = useReadContract({
    address: assetAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address || "0x0"],
    ...(chainId && chainId !== 31337 && { chainId }),
  });

  const { refetch: refetchAllowance } = useReadContract({
    address: assetAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address || "0x0", vaultAddress],
    ...(chainId && chainId !== 31337 && { chainId }),
  });

  const showMintFaucet = (isLocal || (isTestnet && tokenOwner && address && tokenOwner.toLowerCase() === address.toLowerCase()));

  const handleFaucet = async () => {
    if (!address || !assetAddress) return;
    setMintError("");
    try {
      const hash = await mintAsync({
        address: assetAddress,
        abi: mockErc20Abi,
        functionName: "mint",
        args: [address, BigInt(1000 * 1e6)],
        ...(chainId && { chainId }),
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      refetchBalance();
      if (onSuccess) onSuccess();
    } catch (err) {
      const msg = formatTxError(err);
      setMintError(msg);
      console.error(err);
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!amount || !address || !assetAddress) return;
    setFormError("");
    setSuccessHash("");
    let rawAmount;
    try {
      rawAmount = parseUnits(amount, 6);
    } catch {
      setFormError("Enter a valid amount.");
      return;
    }
    try {
      const approveHash = await approveAsync({
        address: assetAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [vaultAddress, rawAmount],
        ...(chainId && { chainId }),
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
      await refetchAllowance();
      const depositHash = await depositAsync({
        address: vaultAddress,
        abi: prizePoolVaultAbi,
        functionName: "deposit",
        args: [rawAmount, address],
        ...(chainId && { chainId }),
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: depositHash });
      setAmount("");
      setSuccessHash(depositHash);
      refetchBalance();
      if (onSuccess) onSuccess();
    } catch (err) {
      setFormError(formatTxError(err));
      console.error(err);
    }
  };

  const balanceFormatted = assetBalance
    ? Number(formatUnits(assetBalance, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
    : "0";

  return (
    <div className="deposit-form-wrapper">
      {showMintFaucet && (
        <div className="faucet-row">
          <p className="hint">
            {isLocal
              ? "Local network: mint test USDT (deployer / owner only on shared mocks)."
              : "You are the token owner: mint test USDT for this wallet."}
          </p>
          <button
            type="button"
            onClick={handleFaucet}
            disabled={!address || isMinting}
            className="btn btn-secondary"
            style={{ width: "100%" }}
          >
            {isMinting ? (
              <span className="btn-loading-dots">
                <span />
                <span />
                <span />
              </span>
            ) : (
              "Get test tokens"
            )}
          </button>
          {mintError && (
            <p className="error-msg" role="alert">
              {mintError}
            </p>
          )}
        </div>
      )}

      <div className="balance-row">
        <p className="hint">Available: {balanceFormatted} USDT</p>
        <button type="button" onClick={() => setAmount(formatUnits(assetBalance || 0n, 6))} className="btn-link">
          Max
        </button>
      </div>

      <form onSubmit={handleDeposit} className="deposit-form">
        <label htmlFor="deposit-amount" className="sr-only">
          Deposit amount
        </label>
        <input
          id="deposit-amount"
          type="text"
          inputMode="decimal"
          placeholder={`Amount in ${isTestnet ? "test USDT" : "rUSDT"}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoComplete="off"
          aria-describedby="deposit-amount-hint"
        />
        <p id="deposit-amount-hint" className="sr-only">
          Enter an amount with up to 6 decimal places.
        </p>
        <button type="submit" disabled={!amount || !address || isApproving || isDepositing} className="btn btn-primary">
          {isApproving || isDepositing ? (
            <span className="btn-loading-dots">
              <span />
              <span />
              <span />
            </span>
          ) : (
            "Deposit"
          )}
        </button>
      </form>
      {formError && (
        <p className="error-msg" role="alert">
          {formError}
        </p>
      )}
      {successHash && (
        <p className="hint" style={{ marginTop: 10 }}>
          Deposit confirmed.{" "}
          <a
            href={
              chainId === 31
                ? `https://explorer.testnet.rsk.co/tx/${successHash}`
                : chainId === 30
                  ? `https://explorer.rsk.co/tx/${successHash}`
                  : `#${successHash}`
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            View transaction
          </a>
        </p>
      )}
    </div>
  );
}

function WithdrawForm({ vaultAddress, isTestnet, chainId, onSuccess }) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [withdrawHash, setWithdrawHash] = useState("");
  const { writeContractAsync: redeemAsync, isPending: isWithdrawing } = useWriteContract();

  const { data: userBalance, refetch: refetchBalance } = useReadContract({
    address: vaultAddress,
    abi: prizePoolVaultAbi,
    functionName: "balanceOf",
    args: [address || "0x0"],
    ...(chainId && chainId !== 31337 && { chainId }),
  });

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!amount || !address) return;
    setError("");
    setWithdrawHash("");
    let rawAmount;
    try {
      rawAmount = parseUnits(amount, 6);
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    try {
      const hash = await redeemAsync({
        address: vaultAddress,
        abi: prizePoolVaultAbi,
        functionName: "redeem",
        args: [rawAmount, address, address],
        ...(chainId && { chainId }),
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setAmount("");
      setWithdrawHash(hash);
      refetchBalance();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      setError(formatTxError(err));
    }
  };

  const handleMax = () => {
    if (userBalance) {
      setAmount(formatUnits(userBalance, 6));
    }
  };

  const balanceFormatted = userBalance
    ? Number(formatUnits(userBalance, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
    : "0";
  const isPending = isWithdrawing;

  return (
    <div className="deposit-form-wrapper">
      <div className="balance-row">
        <p className="hint">Available: {balanceFormatted} prUSDT</p>
        <button type="button" onClick={handleMax} className="btn-link">
          Max
        </button>
      </div>

      <form onSubmit={handleWithdraw} className="deposit-form">
        <label htmlFor="withdraw-amount" className="sr-only">
          Withdraw amount
        </label>
        <input
          id="withdraw-amount"
          type="text"
          inputMode="decimal"
          placeholder="Amount in prUSDT"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={isPending}
          autoComplete="off"
        />
        <button type="submit" disabled={!amount || !address || isPending} className="btn btn-primary">
          {isPending ? (
            <span className="btn-loading-dots">
              <span />
              <span />
              <span />
            </span>
          ) : (
            "Withdraw"
          )}
        </button>
      </form>
      {error && (
        <p className="error-msg" style={{ marginTop: 10 }} role="alert">
          {error}
        </p>
      )}
      {withdrawHash && (
        <p className="hint" style={{ marginTop: 10 }}>
          Withdrawal confirmed.{" "}
          <a
            href={
              chainId === 31
                ? `https://explorer.testnet.rsk.co/tx/${withdrawHash}`
                : chainId === 30
                  ? `https://explorer.rsk.co/tx/${withdrawHash}`
                  : `#${withdrawHash}`
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            View transaction
          </a>
        </p>
      )}
      <p className="hint" style={{ marginTop: 8 }}>
        Withdrawals are 1:1. Your prUSDT will be redeemed for {isTestnet ? "test USDT" : "rUSDT"}.
      </p>
    </div>
  );
}

export default App;
