// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/IYieldStrategy.sol";

/**
 * @title PrizePoolVault
 * @author Konde Pranav (https://github.com/pranavkonde)
 * @notice ERC4626-style vault: Users deposit rUSDT, funds earn yield in Sovryn (or mock).
 *        Weekly raffle: accumulated interest goes to one random depositor. Principal is safe.
 */
contract PrizePoolVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IYieldStrategy public immutable yieldStrategy;

    uint256 public constant DRAW_INTERVAL = 1 weeks;
    uint256 public lastDrawTimestamp;
    uint256 public nextDrawTimestamp;

    /// @dev Track total principal (deposits - withdrawals) to compute yield
    uint256 public totalPrincipal;

    address public lastWinner;
    uint256 public lastPrizeAmount;

    event PrizeDrawn(address indexed winner, uint256 amount, uint256 drawNumber);
    event DrawSkipped(string reason);

    constructor(
        IERC20 _asset,
        string memory _name,
        string memory _symbol,
        address _yieldStrategy
    ) ERC20(_name, _symbol) ERC4626(_asset) Ownable() {
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
        return yieldStrategy.totalAssets();
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

    /// @notice Draw the weekly prize (anyone can call when due)
    function drawWinner() external nonReentrant {
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

        address winner = _selectWinner();
        if (winner == address(0)) {
            _advanceDraw();
            emit DrawSkipped("no eligible depositors");
            return;
        }

        // Withdraw yield from strategy and send to winner
        yieldStrategy.withdraw(pot);
        IERC20(asset()).safeTransfer(winner, pot);

        lastWinner = winner;
        lastPrizeAmount = pot;

        _advanceDraw();

        emit PrizeDrawn(winner, pot, block.timestamp / DRAW_INTERVAL);
    }

    function _advanceDraw() internal {
        lastDrawTimestamp = nextDrawTimestamp;
        nextDrawTimestamp = lastDrawTimestamp + DRAW_INTERVAL;
    }

    /// @dev Select winner using blockhash-based randomness
    /// For production mainnet, consider Chainlink VRF for secure randomness
    function _selectWinner() internal view returns (address) {
        uint256 supply = totalSupply();
        if (supply == 0) return address(0);

        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1),
                    block.timestamp,
                    block.prevrandao,
                    block.number
                )
            )
        );
        uint256 index = seed % supply;

        // Walk through holders by cumulative share weight to find winner
        address[] memory holders = _getDepositors();
        uint256 cumulative;
        for (uint256 i = 0; i < holders.length; i++) {
            cumulative += balanceOf(holders[i]);
            if (index < cumulative) return holders[i];
        }
        return holders[holders.length - 1];
    }

    /// @dev Get list of depositors - in production use an enumerable set
    /// For demo we use a simple array; scale with a proper index
    address[] private _depositors;
    mapping(address => bool) private _isDepositor;

    function _getDepositors() internal view returns (address[] memory) {
        return _depositors;
    }

    function _updateDepositor(address user, uint256 balance) internal {
        if (balance > 0 && !_isDepositor[user]) {
            _isDepositor[user] = true;
            _depositors.push(user);
        } else if (balance == 0 && _isDepositor[user]) {
            _isDepositor[user] = false;
            for (uint256 i = 0; i < _depositors.length; i++) {
                if (_depositors[i] == user) {
                    _depositors[i] = _depositors[_depositors.length - 1];
                    _depositors.pop();
                    break;
                }
            }
        }
    }

    // --- ERC4626 overrides: route assets through yield strategy ---

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant {
        IERC20(asset()).safeTransferFrom(caller, address(this), assets);
        IERC20(asset()).forceApprove(address(yieldStrategy), assets);
        yieldStrategy.deposit(assets);

        totalPrincipal += assets;
        _mint(receiver, shares);
        emit Deposit(caller, receiver, assets, shares);

        _updateDepositor(receiver, balanceOf(receiver));
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant {
        _updateDepositor(owner, balanceOf(owner) - shares);

        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }
        _burn(owner, shares);

        // Ensure we actually get the assets from the strategy
        uint256 withdrawn = yieldStrategy.withdraw(assets);
        require(withdrawn >= assets, "PrizePool: strategy withdrawal failed");
        
        totalPrincipal -= assets;

        IERC20(asset()).safeTransfer(receiver, assets);
        emit Withdraw(caller, receiver, owner, assets, shares);
    }
}
