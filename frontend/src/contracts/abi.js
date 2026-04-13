import { parseAbi } from "viem";

// PrizePoolVault ABI - key functions only
export const prizePoolVaultAbi = parseAbi([
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalPrincipal() view returns (uint256)",
  "function currentPrizePot() view returns (uint256)",
  "function getUserOdds(address user) view returns (uint256)",
  "function secondsUntilNextDraw() view returns (uint256)",
  "function drawWinner(bytes32 secret)",
  "function commitDrawEntropy(bytes32 commitment)",
  "function drawEntropyCommitment() view returns (bytes32)",
  "function entropyCommittedAt() view returns (uint256)",
  "function ENTROPY_DELAY() view returns (uint256)",
  "function isEntropyReady() view returns (bool)",
  "function drawNumber() view returns (uint256)",
  "function asset() view returns (address)",
  "function owner() view returns (address)",
  "function previewDeposit(uint256 assets) view returns (uint256)",
  "event PrizeDrawn(address indexed winner, uint256 amount, uint256 indexed drawNumber)",
]);

// ERC20 ABI for approvals and balance
export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

// MockERC20 faucet (mint) - owner-only on deployed mocks; ABI kept for local owner testing
export const mockErc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function mint(address to, uint256 amount) external",
  "function owner() view returns (address)",
]);
