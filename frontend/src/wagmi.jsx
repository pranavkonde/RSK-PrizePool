import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";

const isTestnet = import.meta.env.VITE_CHAIN === "rootstock_testnet";

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
    default: { http: ["https://public-node.testnet.rsk.co"] },
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

const config = createConfig({
  chains: isTestnet
    ? [rootstockTestnet, rootstock, localhost, mainnet]
    : [localhost, rootstockTestnet, rootstock, mainnet],
  transports: {
    [localhost.id]: http("http://127.0.0.1:8545"),
    [rootstockTestnet.id]: http("https://public-node.testnet.rsk.co"),
    [rootstock.id]: http("https://public-node.rsk.co"),
    [mainnet.id]: http(),
  },
  connectors: [injected()],
});

const queryClient = new QueryClient();

export function WagmiProviders({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
