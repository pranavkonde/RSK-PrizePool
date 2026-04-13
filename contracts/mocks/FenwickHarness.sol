// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../libraries/FenwickSumTree.sol";

/// @dev Test helper for FenwickSumTree (not deployed in production)
contract FenwickHarness {
    using FenwickSumTree for mapping(uint256 => uint256);

    mapping(uint256 => uint256) internal _t;
    uint256 public n;

    function setSize(uint256 _n) external {
        n = _n;
    }

    function add(uint256 idx, uint256 delta) external {
        _t.add(n, idx, delta);
    }

    function sub(uint256 idx, uint256 delta) external {
        _t.sub(n, idx, delta);
    }

    function prefix(uint256 index) external view returns (uint256) {
        return _t.prefix(index);
    }

    function upperBound(uint256 target) external view returns (uint256) {
        return _t.upperBound(n, target);
    }
}
