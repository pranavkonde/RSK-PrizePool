// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IYieldStrategy.sol";

/**
 * @title MockYieldStrategy
 * @author Konde Pranav (https://github.com/pranavkonde)
 * @notice Simulates yield accrual for local development (simulates Sovryn-style lending)
 * In production, replace with actual Sovryn lending pool integration
 */
contract MockYieldStrategy is IYieldStrategy {
    using SafeERC20 for IERC20;

    IERC20 public immutable assetToken;

    function asset() external view override returns (address) {
        return address(assetToken);
    }

    uint256 public totalDeposited;
    uint256 public accruedYield; // Simulated yield (1e18 = 100% of deposits)
    uint256 public constant YIELD_RATE_PER_BLOCK = 1e14; // ~0.01% per block (adjustable)

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event YieldAccrued(uint256 amount);

    constructor(address _asset) {
        assetToken = IERC20(_asset);
    }

    function deposit(uint256 amount) external override returns (uint256) {
        _accrueYield();
        assetToken.safeTransferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
        emit Deposited(msg.sender, amount);
        return amount;
    }

    function withdraw(uint256 amount) external override returns (uint256) {
        _accrueYield();
        uint256 available = assetToken.balanceOf(address(this));
        uint256 toSend = amount > available ? available : amount;
        assetToken.safeTransfer(msg.sender, toSend);
        if (toSend <= totalDeposited) {
            totalDeposited -= toSend;
        } else {
            totalDeposited = 0;
        }
        emit Withdrawn(msg.sender, toSend);
        return toSend;
    }

    function totalAssets() external view override returns (uint256) {
        return assetToken.balanceOf(address(this));
    }

    /// @dev Simulate yield accrual - in production this comes from actual lending protocol
    function _accrueYield() internal {
        // No-op for mock - use addYield() to simulate yield from lending
    }

    /// @notice Simulate yield by transferring tokens to this contract (for testing)
    /// In production, Sovryn lending returns yield automatically
    function addYield(uint256 amount) external {
        assetToken.safeTransferFrom(msg.sender, address(this), amount);
        accruedYield += amount;
        emit YieldAccrued(amount);
    }
}
