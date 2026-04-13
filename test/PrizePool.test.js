const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

function randomSecret() {
  return ethers.randomBytes(32);
}

function commitmentFromSecret(secret) {
  return ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));
}

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

    const fundAmount = ethers.parseUnits("10000", 6);
    await asset.connect(owner).transfer(alice.address, fundAmount);
    await asset.connect(owner).transfer(bob.address, fundAmount);
  });

  async function commitEntropyForDraw() {
    const secret = randomSecret();
    const commitment = commitmentFromSecret(secret);
    await vault.connect(owner).commitDrawEntropy(commitment);
    await time.increase(Number(await vault.ENTROPY_DELAY()) + 1);
    return secret;
  }

  describe("Deposits and Withdrawals", function () {
    it("should accept deposits and mint shares 1:1", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await asset.connect(alice).approve(await vault.getAddress(), amount);
      await vault.connect(alice).deposit(amount, alice.address);

      expect(await vault.balanceOf(alice.address)).to.equal(amount);
      expect(await vault.totalPrincipal()).to.equal(amount);
    });

    it("should reject first deposit below MIN_INITIAL_DEPOSIT", async function () {
      const tooSmall = 99_999n;
      await asset.connect(alice).approve(await vault.getAddress(), tooSmall);
      await expect(
        vault.connect(alice).deposit(tooSmall, alice.address)
      ).to.be.revertedWith("PrizePool: min first deposit");
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

    it("should allow all depositors to withdraw principal after a prize draw", async function () {
      const aAmt = ethers.parseUnits("600", 6);
      const bAmt = ethers.parseUnits("400", 6);
      await asset.connect(alice).approve(await vault.getAddress(), aAmt);
      await vault.connect(alice).deposit(aAmt, alice.address);
      await asset.connect(bob).approve(await vault.getAddress(), bAmt);
      await vault.connect(bob).deposit(bAmt, bob.address);

      const yieldAmount = ethers.parseUnits("100", 6);
      await asset.connect(owner).approve(await strategy.getAddress(), yieldAmount);
      await strategy.addYield(yieldAmount);

      const secret = await commitEntropyForDraw();
      await time.increase(7 * 24 * 60 * 60 + 1);

      await vault.drawWinner(secret);

      const aliceShares = await vault.balanceOf(alice.address);
      const bobShares = await vault.balanceOf(bob.address);

      await vault.connect(alice).redeem(aliceShares, alice.address, alice.address);
      await vault.connect(bob).redeem(bobShares, bob.address, bob.address);

      expect(await vault.totalSupply()).to.equal(0);
      expect(await vault.totalPrincipal()).to.equal(0);
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

    it("should draw winner and distribute prize with commit-reveal", async function () {
      await asset.connect(alice).approve(await vault.getAddress(), ethers.parseUnits("600", 6));
      await vault.connect(alice).deposit(ethers.parseUnits("600", 6), alice.address);

      await asset.connect(bob).approve(await vault.getAddress(), ethers.parseUnits("400", 6));
      await vault.connect(bob).deposit(ethers.parseUnits("400", 6), bob.address);

      const yieldAmount = ethers.parseUnits("100", 6);
      await asset.connect(owner).approve(await strategy.getAddress(), yieldAmount);
      await strategy.addYield(yieldAmount);

      const secret = await commitEntropyForDraw();
      await time.increase(7 * 24 * 60 * 60 + 1);

      const potBefore = await vault.currentPrizePot();
      const supplyBefore = await vault.totalSupply();
      expect(potBefore).to.equal(yieldAmount);
      expect(supplyBefore).to.equal(ethers.parseUnits("1000", 6));

      const aliceBefore = await asset.balanceOf(alice.address);
      const bobBefore = await asset.balanceOf(bob.address);

      const tx = await vault.drawWinner(secret);
      const receipt = await tx.wait();
      const drawEvent = receipt.logs
        .map((l) => {
          try {
            return vault.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((p) => p && p.name === "PrizeDrawn");
      expect(drawEvent).to.not.equal(undefined);
      expect(drawEvent.args.drawNumber).to.equal(0n);

      const winner = await vault.lastWinner();
      const prize = await vault.lastPrizeAmount();
      expect(prize).to.equal(yieldAmount);
      expect([alice.address, bob.address]).to.include(winner);

      const winnerAfter =
        winner === alice.address ? await asset.balanceOf(alice.address) : await asset.balanceOf(bob.address);
      const winnerBefore = winner === alice.address ? aliceBefore : bobBefore;
      expect(winnerAfter - winnerBefore).to.equal(yieldAmount);
    });

    it("should skip draw without yield without entropy", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await asset.connect(alice).approve(await vault.getAddress(), amount);
      await vault.connect(alice).deposit(amount, alice.address);

      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(vault.drawWinner(ethers.ZeroHash)).to.emit(vault, "DrawSkipped");
    });

    it("should reject duplicate entropy commit while one is pending", async function () {
      const commitment = commitmentFromSecret(randomSecret());
      await vault.connect(owner).commitDrawEntropy(commitment);
      await expect(
        vault.connect(owner).commitDrawEntropy(commitmentFromSecret(randomSecret()))
      ).to.be.revertedWith("PrizePool: commitment exists");
    });

    it("should reject entropy commit from non-owner", async function () {
      const commitment = commitmentFromSecret(randomSecret());
      await expect(vault.connect(alice).commitDrawEntropy(commitment)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should allow owner to abandon commitment then commit again", async function () {
      const c1 = commitmentFromSecret(randomSecret());
      await vault.connect(owner).commitDrawEntropy(c1);
      await vault.connect(owner).abandonDrawEntropyCommitment();
      const c2 = commitmentFromSecret(randomSecret());
      await vault.connect(owner).commitDrawEntropy(c2);
      expect(await vault.drawEntropyCommitment()).to.equal(c2);
    });

    it("should revert prize draw without commit", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await asset.connect(alice).approve(await vault.getAddress(), amount);
      await vault.connect(alice).deposit(amount, alice.address);

      const yieldAmount = ethers.parseUnits("50", 6);
      await asset.connect(owner).approve(await strategy.getAddress(), yieldAmount);
      await strategy.addYield(yieldAmount);

      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(vault.drawWinner(randomSecret())).to.be.revertedWith(
        "PrizePool: commit entropy first"
      );
    });

    it("should keep Fenwick in sync when shares are transferred", async function () {
      const aAmt = ethers.parseUnits("600", 6);
      const bAmt = ethers.parseUnits("400", 6);
      await asset.connect(alice).approve(await vault.getAddress(), aAmt);
      await vault.connect(alice).deposit(aAmt, alice.address);
      await asset.connect(bob).approve(await vault.getAddress(), bAmt);
      await vault.connect(bob).deposit(bAmt, bob.address);

      await vault.connect(alice).transfer(bob.address, ethers.parseUnits("200", 6));

      const yieldAmount = ethers.parseUnits("50", 6);
      await asset.connect(owner).approve(await strategy.getAddress(), yieldAmount);
      await strategy.addYield(yieldAmount);

      const secret = await commitEntropyForDraw();
      await time.increase(7 * 24 * 60 * 60 + 1);

      await vault.drawWinner(secret);

      const aliceShares = await vault.balanceOf(alice.address);
      const bobShares = await vault.balanceOf(bob.address);
      await vault.connect(alice).redeem(aliceShares, alice.address, alice.address);
      await vault.connect(bob).redeem(bobShares, bob.address, bob.address);

      expect(await vault.totalSupply()).to.equal(0n);
    });

    it("should compute user odds correctly", async function () {
      await asset.connect(alice).approve(await vault.getAddress(), ethers.parseUnits("600", 6));
      await vault.connect(alice).deposit(ethers.parseUnits("600", 6), alice.address);

      await asset.connect(bob).approve(await vault.getAddress(), ethers.parseUnits("400", 6));
      await vault.connect(bob).deposit(ethers.parseUnits("400", 6), bob.address);

      expect(await vault.getUserOdds(alice.address)).to.equal(6000);
      expect(await vault.getUserOdds(bob.address)).to.equal(4000);
    });

    it("should run sequential draws with new commits", async function () {
      const amount = ethers.parseUnits("500", 6);
      await asset.connect(alice).approve(await vault.getAddress(), amount);
      await vault.connect(alice).deposit(amount, alice.address);

      const y1 = ethers.parseUnits("20", 6);
      await asset.connect(owner).approve(await strategy.getAddress(), y1);
      await strategy.addYield(y1);

      let secret = await commitEntropyForDraw();
      await time.increase(7 * 24 * 60 * 60 + 1);
      await vault.drawWinner(secret);

      const y2 = ethers.parseUnits("15", 6);
      await asset.connect(owner).approve(await strategy.getAddress(), y2);
      await strategy.addYield(y2);

      secret = await commitEntropyForDraw();
      await time.increase(7 * 24 * 60 * 60 + 1);
      await vault.drawWinner(secret);

      expect(await vault.drawNumber()).to.equal(2n);
    });
  });

  describe("Gas / scale", function () {
    it("should complete drawWinner with many unique depositors under block gas limit", async function () {
      const signers = await ethers.getSigners();
      const n = Math.min(17, Math.max(0, signers.length - 3));
      const perUser = ethers.parseUnits("10", 6);
      for (let i = 0; i < n; i++) {
        const u = signers[i + 3];
        await asset.connect(owner).transfer(u.address, perUser);
        await asset.connect(u).approve(await vault.getAddress(), perUser);
        await vault.connect(u).deposit(perUser, u.address);
      }

      const yieldAmount = ethers.parseUnits("50", 6);
      await asset.connect(owner).approve(await strategy.getAddress(), yieldAmount);
      await strategy.addYield(yieldAmount);

      const secret = await commitEntropyForDraw();
      await time.increase(7 * 24 * 60 * 60 + 1);

      const tx = await vault.drawWinner(secret);
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.lessThan(6_500_000n);
    });
  });

  describe("Countdown", function () {
    it("should report seconds until next draw", async function () {
      const remaining = await vault.secondsUntilNextDraw();
      expect(remaining).to.be.lte(7 * 24 * 60 * 60);
    });
  });
});
