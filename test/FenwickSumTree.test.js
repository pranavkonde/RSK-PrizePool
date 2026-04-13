const { expect } = require("chai");
const { ethers } = require("hardhat");

function brutePrefix(weights, index) {
  let s = 0n;
  for (let i = 1; i <= index; i++) s += weights[i];
  return s;
}

function bruteUpperBound(weights, n, target) {
  for (let j = 1; j <= n; j++) {
    if (brutePrefix(weights, j) > target) return BigInt(j);
  }
  return BigInt(n + 1);
}

describe("FenwickSumTree (via FenwickHarness)", function () {
  let harness;

  beforeEach(async function () {
    const F = await ethers.getContractFactory("FenwickHarness");
    harness = await F.deploy();
    await harness.waitForDeployment();
  });

  it("matches brute-force prefix and upperBound for a fixed tree", async function () {
    const n = 5n;
    await harness.setSize(n);
    const w = { 1: 3n, 2: 2n, 3: 5n, 4: 1n, 5: 4n };
    for (let i = 1; i <= 5; i++) {
      await harness.add(i, w[i]);
    }
    for (let i = 1; i <= 5; i++) {
      expect(await harness.prefix(i)).to.equal(brutePrefix(w, i));
    }
    const total = brutePrefix(w, 5);
    for (let t = 0n; t < total; t++) {
      expect(await harness.upperBound(t)).to.equal(bruteUpperBound(w, 5, t));
    }
  });

  it("fuzz: random updates preserve prefix and upperBound", async function () {
    const seed = 0xdeadbeefn;
    for (let round = 0; round < 24; round++) {
      const n = BigInt(1 + Number((seed + BigInt(round)) % 20n));
      const h = await (await ethers.getContractFactory("FenwickHarness")).deploy();
      await h.waitForDeployment();
      await h.setSize(n);

      const weights = {};
      let x = seed + BigInt(round) * 997n;
      for (let i = 1; i <= Number(n); i++) {
        x = (x * 1103515245n + 12345n) % 1000000007n;
        const delta = 1n + (x % 50n);
        weights[i] = delta;
        await h.add(BigInt(i), delta);
      }

      for (let i = 1; i <= Number(n); i++) {
        expect(await h.prefix(BigInt(i))).to.equal(brutePrefix(weights, i));
      }
      const total = brutePrefix(weights, Number(n));
      for (let t = 0n; t < total; t += 1n + (t % 7n)) {
        expect(await h.upperBound(t)).to.equal(bruteUpperBound(weights, Number(n), t));
      }
    }
  });

  it("sub maintains consistency", async function () {
    await harness.setSize(3n);
    await harness.add(1n, 10n);
    await harness.add(2n, 20n);
    await harness.add(3n, 5n);
    await harness.sub(2n, 7n);
    expect(await harness.prefix(1n)).to.equal(10n);
    expect(await harness.prefix(2n)).to.equal(23n);
    expect(await harness.prefix(3n)).to.equal(28n);
  });
});
