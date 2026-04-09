// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/IYieldStrategy.sol";
import "./libraries/FenwickSumTree.sol";

/**
 * @title PrizePoolVault
 * @author Konde Pranav (https://github.com/pranavkonde)
 * @notice ERC4626-style vault: Users deposit rUSDT, funds earn yield in Sovryn (or mock).
 *        Weekly raffle: accumulated interest goes to one random depositor. Principal is safe.
 * @dev Randomness uses commit–reveal: call commitDrawEntropy before the draw with keccak256(secret).
 *      Winner selection uses a Fenwick tree over depositors for O(log n) gas per draw.
 */
contract PrizePoolVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using FenwickSumTree for mapping(uint256 => uint256);

    error PrizePoolShortfall();

    IYieldStrategy public immutable yieldStrategy;

    uint256 public constant DRAW_INTERVAL = 1 weeks;
    /// @notice Commit must be this old before a prize draw. Increase for production (e.g. 1 days) for stronger timing assumptions.
    uint256 public constant ENTROPY_DELAY = 1 hours;
    /// @notice First deposit must be at least this large to reduce share-manipulation / dust games.
    uint256 public constant MIN_INITIAL_DEPOSIT = 100_000; // 0.1 USDT at 6 decimals

    uint256 public lastDrawTimestamp;
    uint256 public nextDrawTimestamp;
    /// @dev Monotonic draw counter for indexing (increments on every draw/skip advance).
    uint256 public drawNumber;

    /// @dev Track total principal (deposits - withdrawals) to compute yield
    uint256 public totalPrincipal;

    address public lastWinner;
    uint256 public lastPrizeAmount;

    /// @dev commit–reveal: commitment == keccak256(abi.encodePacked(secret))
    bytes32 public drawEntropyCommitment;
    uint256 public entropyCommitBlock;
    uint256 public entropyCommittedAt;

    event PrizeDrawn(address indexed winner, uint256 amount, uint256 indexed drawNumber);
    event DrawSkipped(string reason);

    constructor(
        IERC20 _asset,
        string memory _name,
        string memory _symbol,
        address _yieldStrategy
    ) ERC20(_name, _symbol) ERC4626(_asset) Ownable() {
        require(_yieldStrategy.code.length > 0, "PrizePool: strategy not contract");
        yieldStrategy = IYieldStrategy(_yieldStrategy);
        require(
            address(yieldStrategy.asset()) == address(_asset),
            "PrizePool: asset mismatch"
        );
        lastDrawTimestamp = block.timestamp;
        nextDrawTimestamp = block.timestamp + DRAW_INTERVAL;
    }

    /// @inheritdoc ERC4626
    function totalAssets() public view override returns (uint256) {
        uint256 a = yieldStrategy.totalAssets();
        if (a < totalPrincipal) revert PrizePoolShortfall();
        return a;
    }

    /// @dev 1:1 shares to principal - yield is distributed as prizes, not share appreciation
    function _convertToShares(
        uint256 assets,
        Math.Rounding rounding
    ) internal view override returns (uint256) {
        uint256 supply = totalSupply();
        uint256 principal = totalPrincipal;
        if (principal == 0) return assets;
        return Math.mulDiv(assets, supply, principal, rounding);
    }

    /// @dev 1:1 shares to principal
    function _convertToAssets(
        uint256 shares,
        Math.Rounding rounding
    ) internal view override returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 0;
        return Math.mulDiv(shares, totalPrincipal, supply, rounding);
    }

    /// @notice Current prize pot (yield earned since inception)
    function currentPrizePot() public view returns (uint256) {
        uint256 total = totalAssets();
        if (total <= totalPrincipal) return 0;
        return total - totalPrincipal;
    }

    /// @notice User's odds as basis points (e.g. 150 = 1.5%)
    function getUserOdds(address user) external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 0;
        return (balanceOf(user) * 10000) / supply;
    }

    /// @notice Seconds until next draw
    function secondsUntilNextDraw() external view returns (uint256) {
        if (block.timestamp >= nextDrawTimestamp) return 0;
        return nextDrawTimestamp - block.timestamp;
    }

    /// @notice Commit entropy for the next prize draw. Anyone can commit; use a fresh secret per period.
    function commitDrawEntropy(bytes32 commitment) external {
        require(commitment != bytes32(0), "PrizePool: invalid commitment");
        drawEntropyCommitment = commitment;
        entropyCommitBlock = block.number;
        entropyCommittedAt = block.timestamp;
    }

    /// @notice Whether a committed secret can be revealed for the current draw (time and block checks only).
    function isEntropyReady() external view returns (bool) {
        if (drawEntropyCommitment == bytes32(0)) return false;
        if (block.number <= entropyCommitBlock) return false;
        return block.timestamp >= entropyCommittedAt + ENTROPY_DELAY;
    }

    /// @notice Draw the weekly prize when due. `secret` must match the committed hash when pot > 0.
    function drawWinner(bytes32 secret) external nonReentrant {
        require(
            block.timestamp >= nextDrawTimestamp,
            "PrizePool: draw not yet due"
        );

        uint256 pot = currentPrizePot();
        uint256 supply = totalSupply();

        if (supply == 0) {
            _advanceDraw();
            emit DrawSkipped("no depositors");
            return;
        }

        if (pot == 0) {
            _advanceDraw();
            emit DrawSkipped("no yield");
            return;
        }

        _validateEntropy(secret);

        uint256 dn = drawNumber;
        uint256 seed = _randomSeed(secret, dn);
        address winner = _selectWinner(seed, supply);
        if (winner == address(0)) {
            _advanceDraw();
            emit DrawSkipped("no eligible depositors");
            return;
        }

        uint256 withdrawn = yieldStrategy.withdraw(pot);
        require(withdrawn >= pot, "PrizePool: prize withdraw short");
        IERC20(asset()).safeTransfer(winner, pot);

        drawEntropyCommitment = bytes32(0);
        entropyCommitBlock = 0;
        entropyCommittedAt = 0;

        lastWinner = winner;
        lastPrizeAmount = pot;

        _advanceDraw();

        emit PrizeDrawn(winner, pot, drawNumber);
    }

    function _validateEntropy(bytes32 secret) internal view {
        bytes32 c = drawEntropyCommitment;
        require(c != bytes32(0), "PrizePool: commit entropy first");
        require(block.number > entropyCommitBlock, "PrizePool: commit same block");
        require(
            block.timestamp >= entropyCommittedAt + ENTROPY_DELAY,
            "PrizePool: entropy too fresh"
        );
        require(
            keccak256(abi.encodePacked(secret)) == c,
            "PrizePool: bad reveal"
        );
    }

    function _randomSeed(bytes32 secret, uint256 dn) internal view returns (uint256) {
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        secret,
                        blockhash(block.number - 1),
                        block.timestamp,
                        dn,
                        block.number
                    )
                )
            );
    }

    function _advanceDraw() internal {
        lastDrawTimestamp = nextDrawTimestamp;
        nextDrawTimestamp = lastDrawTimestamp + DRAW_INTERVAL;
        unchecked {
            drawNumber += 1;
        }
    }

    /// @dev O(log n) weighted pick using Fenwick tree over unique holders
    function _selectWinner(uint256 seed, uint256 supply) internal view returns (address) {
        if (supply == 0 || _holderCount == 0) return address(0);

        uint256 index = seed % supply;
        uint256 idx = _fenwick.upperBound(_holderCount, index);
        return _holders[idx - 1];
    }

    // --- Holder index + Fenwick (1-based indices) ---

    mapping(uint256 => uint256) private _fenwick;
    uint256 private _holderCount;
    address[] private _holders;
    mapping(address => uint256) private _holderIndex; // 1-based; 0 = not tracked
    mapping(address => uint256) private _shareCheckpoint;

    function _syncHolder(address user, uint256 newBal) internal {
        uint256 idx = _holderIndex[user];
        if (newBal > 0 && idx == 0) {
            unchecked {
                _holderCount += 1;
            }
            idx = _holderCount;
            _holderIndex[user] = idx;
            _holders.push(user);
            _fenwick.add(_holderCount, idx, newBal);
            _shareCheckpoint[user] = newBal;
            return;
        }

        if (newBal == 0 && idx != 0) {
            _removeHolder(user, idx);
            return;
        }

        if (idx != 0) {
            uint256 old = _shareCheckpoint[user];
            if (newBal > old) {
                _fenwick.add(_holderCount, idx, newBal - old);
            } else if (newBal < old) {
                _fenwick.sub(_holderCount, idx, old - newBal);
            }
            _shareCheckpoint[user] = newBal;
        }
    }

    function _removeHolder(address user, uint256 r) internal {
        uint256 nBefore = _holderCount;

        if (r != nBefore) {
            address lastUser = _holders[nBefore - 1];
            _holders[r - 1] = lastUser;
            _holderIndex[lastUser] = r;
        }

        _holders.pop();
        unchecked {
            _holderCount -= 1;
        }
        delete _holderIndex[user];
        delete _shareCheckpoint[user];

        // Swap-pop changes indices; rebuild Fenwick from live balances (O(n log n), avoids inconsistent partial sums).
        _rebuildFenwick(nBefore);
    }

    function _rebuildFenwick(uint256 clearUpTo) internal {
        for (uint256 i = 1; i <= clearUpTo; i++) {
            _fenwick[i] = 0;
        }
        uint256 n = _holders.length;
        for (uint256 i = 0; i < n; i++) {
            address h = _holders[i];
            uint256 bal = balanceOf(h);
            require(bal > 0, "PrizePool: holder balance");
            _fenwick.add(n, i + 1, bal);
            _shareCheckpoint[h] = bal;
        }
    }

    // --- ERC4626 overrides: route assets through yield strategy ---

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant {
        if (totalSupply() == 0) {
            require(assets >= MIN_INITIAL_DEPOSIT, "PrizePool: min first deposit");
        }

        IERC20(asset()).safeTransferFrom(caller, address(this), assets);
        IERC20(asset()).forceApprove(address(yieldStrategy), assets);
        yieldStrategy.deposit(assets);

        totalPrincipal += assets;
        _mint(receiver, shares);
        emit Deposit(caller, receiver, assets, shares);

        _syncHolder(receiver, balanceOf(receiver));
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant {
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }

        _burn(owner, shares);
        _syncHolder(owner, balanceOf(owner));

        uint256 withdrawn = yieldStrategy.withdraw(assets);
        require(withdrawn >= assets, "PrizePool: strategy withdrawal failed");

        totalPrincipal -= assets;

        IERC20(asset()).safeTransfer(receiver, assets);
        emit Withdraw(caller, receiver, owner, assets, shares);
    }
}
