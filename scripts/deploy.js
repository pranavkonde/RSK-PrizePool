const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  let asset, yieldStrategy;

  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    // Deploy mocks for local dev
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    asset = await MockERC20.deploy("Mock USDT", "USDT", 6);
    await asset.waitForDeployment();
    console.log("Mock USDT deployed to:", await asset.getAddress());

    const MockYieldStrategy = await hre.ethers.getContractFactory("MockYieldStrategy");
    yieldStrategy = await MockYieldStrategy.deploy(await asset.getAddress());
    await yieldStrategy.waitForDeployment();
    console.log("MockYieldStrategy deployed to:", await yieldStrategy.getAddress());
  } else {
    // Production: use rUSDT and Sovryn (set addresses in env)
    const assetAddr = process.env.RUSDT_ADDRESS || "0xEf213441a85DF4d7acBdAe0Cf78004E1e486BB96";
    const strategyAddr = process.env.YIELD_STRATEGY_ADDRESS;
    if (!strategyAddr) {
      throw new Error("YIELD_STRATEGY_ADDRESS required for non-local deployment");
    }
    asset = { getAddress: () => assetAddr };
    yieldStrategy = { getAddress: () => strategyAddr };
  }

  const assetAddr = typeof asset.getAddress === "function" ? await asset.getAddress() : asset;
  const strategyAddr = typeof yieldStrategy.getAddress === "function" ? await yieldStrategy.getAddress() : yieldStrategy;

  const PrizePoolVault = await hre.ethers.getContractFactory("PrizePoolVault");
  const vault = await PrizePoolVault.deploy(
    assetAddr,
    "RSK Prize Pool rUSDT",
    "prUSDT",
    strategyAddr
  );
  await vault.waitForDeployment();

  console.log("PrizePoolVault deployed to:", await vault.getAddress());

  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    console.log("Local deployment complete. Use addYield on MockYieldStrategy to simulate yield.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
