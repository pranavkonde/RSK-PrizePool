import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { fallback, http as viemHttp } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";

const isTestnet = import.meta.env.VITE_CHAIN === "rootstock_testnet";

/** Stable ordering: custom env first, then free fallbacks (public RSK node often rate-limits). */
const RSK_TESTNET_RPC_HTTP_URLS = (() => {
  const urls = [
    import.meta.env.VITE_RSK_TESTNET_RPC_URL?.trim(),
    "https://rootstock-testnet.drpc.org",
    "https://public-node.testnet.rsk.co",
  ].filter(Boolean);
  return [...new Set(urls)];
})();

const RSK_TESTNET_HTTP_OPTS = { timeout: 60_000, batch: false };

function createRootstockTestnetTransport() {
  const transports = RSK_TESTNET_RPC_HTTP_URLS.map((url) =>
    viemHttp(url, RSK_TESTNET_HTTP_OPTS),
  );
  if (transports.length === 1) return transports[0];
  return fallback(transports);
}

// Rootstock mainnet
const rootstock = {
  id: 30,
  name: "Rootstock",
  nativeCurrency: { name: "RBTC", symbol: "RBTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://public-node.rsk.co"] },
  },
  blockExplorers: {
    default: { name: "RSK Explorer", url: "https://explorer.rsk.co" },
  },
};

// Rootstock testnet
const rootstockTestnet = {
  id: 31,
  name: "Rootstock Testnet",
  nativeCurrency: { name: "tRBTC", symbol: "tRBTC", decimals: 18 },
  rpcUrls: {
    default: { http: RSK_TESTNET_RPC_HTTP_URLS },
  },
  blockExplorers: {
    default: { name: "RSK Testnet Explorer", url: "https://explorer.testnet.rsk.co" },
  },
};

// Local Hardhat
const localhost = {
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
};

export const wagmiConfig = createConfig({
  chains: isTestnet ? [rootstockTestnet, rootstock, localhost] : [localhost, rootstockTestnet, rootstock],
  transports: {
    [localhost.id]: http("http://127.0.0.1:8545"),
    [rootstockTestnet.id]: createRootstockTestnetTransport(),
    [rootstock.id]: http("https://public-node.rsk.co"),
  },
  connectors: [injected()],
});

export function WagmiProviders({ children }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
