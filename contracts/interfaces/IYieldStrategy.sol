// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title IYieldStrategy
 * @author Konde Pranav (https://github.com/pranavkonde)
 * @notice Interface for yield-generating strategies (e.g., Sovryn lending pool)
 */
interface IYieldStrategy {
    /// @notice Deposit assets into the yield strategy
    /// @param amount Amount of assets to deposit
    /// @return sharesOrAmount Amount of strategy tokens/shares received
    function deposit(uint256 amount) external returns (uint256 sharesOrAmount);

    /// @notice Withdraw assets from the yield strategy
    /// @param amount Amount of assets to withdraw
    /// @return actualAmount Actual amount of assets withdrawn
    function withdraw(uint256 amount) external returns (uint256 actualAmount);

    /// @notice Get total balance of underlying assets in the strategy
    function totalAssets() external view returns (uint256);

    /// @notice Get the underlying asset token address
    function asset() external view returns (address);
}
