// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockERC20
 * @author Konde Pranav (https://github.com/pranavkonde)
 * @notice Mock USDT for local development and testing. Mint is owner-only on shared networks.
 */
contract MockERC20 is ERC20, Ownable {
    uint8 private _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable() {
        _decimals = decimals_;
        _mint(msg.sender, 1_000_000 * 10 ** decimals_);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /// @notice On Rootstock testnet (chainId 31) anyone can mint a capped amount for testing. Other chains: owner only.
    function mint(address to, uint256 amount) external {
        if (block.chainid == 31) {
            require(amount <= 10_000 * 10 ** _decimals, "MockERC20: faucet cap");
        } else {
            _checkOwner();
        }
        _mint(to, amount);
    }
}
