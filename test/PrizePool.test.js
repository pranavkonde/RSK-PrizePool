const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PrizePoolVault", function () {
  let vault, asset, strategy;
  let owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    asset = await MockERC20.deploy("Mock USDT", "USDT", 6);
    await asset.waitForDeployment();

    const MockYieldStrategy = await ethers.getContractFactory("MockYieldStrategy");
    strategy = await MockYieldStrategy.deploy(await asset.getAddress());
    await strategy.waitForDeployment();

    const PrizePoolVault = await ethers.getContractFactory("PrizePoolVault");
    vault = await PrizePoolVault.deploy(
      await asset.getAddress(),
      "RSK Prize Pool",
      "prUSDT",
      await strategy.getAddress()
    );
    await vault.waitForDeployment();

    // Fund users
    const fundAmount = ethers.parseUnits("10000", 6);
    await asset.connect(owner).transfer(alice.address, fundAmount);
    await asset.connect(owner).transfer(bob.address, fundAmount);
  });

  describe("Deposits and Withdrawals", function () {
    it("should accept deposits and mint shares 1:1", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await asset.connect(alice).approve(await vault.getAddress(), amount);
      await vault.connect(alice).deposit(amount, alice.address);

      expect(await vault.balanceOf(alice.address)).to.equal(amount);
      expect(await vault.totalPrincipal()).to.equal(amount);
    });

    it("should allow withdrawals", async function () {
      const amount = ethers.parseUnits("500", 6);
      await asset.connect(alice).approve(await vault.getAddress(), amount);
      await vault.connect(alice).deposit(amount, alice.address);

      const before = await asset.balanceOf(alice.address);
      await vault.connect(alice).withdraw(amount, alice.address, alice.address);
      const after = await asset.balanceOf(alice.address);

      expect(after - before).to.equal(amount);
      expect(await vault.balanceOf(alice.address)).to.equal(0);
    });
  });

  describe("Prize Logic", function () {
    it("should report 0 prize pot with no yield", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await asset.connect(alice).approve(await vault.getAddress(), amount);
      await vault.connect(alice).deposit(amount, alice.address);

      expect(await vault.currentPrizePot()).to.equal(0);
    });

    it("should report prize pot after yield added", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await asset.connect(alice).approve(await vault.getAddress(), amount);
      await vault.connect(alice).deposit(amount, alice.address);

      const yieldAmount = ethers.parseUnits("50", 6);
      await asset.connect(owner).approve(await strategy.getAddress(), yieldAmount);
      await strategy.addYield(yieldAmount);

      expect(await vault.currentPrizePot()).to.equal(yieldAmount);
    });

    it("should draw winner and distribute prize", async function () {
      await asset.connect(alice).approve(await vault.getAddress(), ethers.parseUnits("600", 6));
      await vault.connect(alice).deposit(ethers.parseUnits("600", 6), alice.address);

      await asset.connect(bob).approve(await vault.getAddress(), ethers.parseUnits("400", 6));
      await vault.connect(bob).deposit(ethers.parseUnits("400", 6), bob.address);

      const yieldAmount = ethers.parseUnits("100", 6);
      await asset.connect(owner).approve(await strategy.getAddress(), yieldAmount);
      await strategy.addYield(yieldAmount);

      await time.increase(7 * 24 * 60 * 60 + 1); // 1 week

      const potBefore = await vault.currentPrizePot();
      const supplyBefore = await vault.totalSupply();
      expect(potBefore).to.equal(yieldAmount);
      expect(supplyBefore).to.equal(ethers.parseUnits("1000", 6));

      const aliceBefore = await asset.balanceOf(alice.address);
      const bobBefore = await asset.balanceOf(bob.address);

      await expect(vault.drawWinner()).to.emit(vault, "PrizeDrawn");

      const winner = await vault.lastWinner();
      const prize = await vault.lastPrizeAmount();
      expect(prize).to.equal(yieldAmount);
      expect([alice.address, bob.address]).to.include(winner);

      const winnerBefore = winner === alice.address ? aliceBefore : bobBefore;
      const winnerAfter = winner === alice.address ? await asset.balanceOf(alice.address) : await asset.balanceOf(bob.address);
      expect(winnerAfter - winnerBefore).to.equal(yieldAmount);
    });

    it("should compute user odds correctly", async function () {
      await asset.connect(alice).approve(await vault.getAddress(), ethers.parseUnits("600", 6));
      await vault.connect(alice).deposit(ethers.parseUnits("600", 6), alice.address);

      await asset.connect(bob).approve(await vault.getAddress(), ethers.parseUnits("400", 6));
      await vault.connect(bob).deposit(ethers.parseUnits("400", 6), bob.address);

      expect(await vault.getUserOdds(alice.address)).to.equal(6000); // 60%
      expect(await vault.getUserOdds(bob.address)).to.equal(4000);  // 40%
    });
  });

  describe("Countdown", function () {
    it("should report seconds until next draw", async function () {
      const remaining = await vault.secondsUntilNextDraw();
      expect(remaining).to.be.lte(7 * 24 * 60 * 60);
    });
  });
});
