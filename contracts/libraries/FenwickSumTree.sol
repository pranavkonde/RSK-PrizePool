// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title FenwickSumTree
 * @notice Fenwick (Binary Indexed) tree over a mapping for O(log n) prefix sums and updates.
 */
library FenwickSumTree {
    function add(
        mapping(uint256 => uint256) storage t,
        uint256 n,
        uint256 idx,
        uint256 delta
    ) internal {
        uint256 i = idx;
        while (i <= n) {
            t[i] += delta;
            unchecked {
                i += i & (0 - i);
            }
        }
    }

    function sub(
        mapping(uint256 => uint256) storage t,
        uint256 n,
        uint256 idx,
        uint256 delta
    ) internal {
        uint256 i = idx;
        while (i <= n) {
            uint256 v = t[i];
            require(v >= delta, "Fenwick: underflow");
            unchecked {
                t[i] = v - delta;
                i += i & (0 - i);
            }
        }
    }

    function prefix(
        mapping(uint256 => uint256) storage t,
        uint256 index
    ) internal view returns (uint256 s) {
        uint256 i = index;
        while (i > 0) {
            s += t[i];
            unchecked {
                i -= i & (0 - i);
            }
        }
    }

    /// @return Smallest idx in [1, n] such that prefix(t, idx) > target (0-based target in [0, total-1])
    /// @dev Binary search over prefix (O(log^2 n)); a single Fenwick walk-down must match this tree's layout exactly.
    function upperBound(
        mapping(uint256 => uint256) storage t,
        uint256 n,
        uint256 target
    ) internal view returns (uint256) {
        uint256 lo = 1;
        uint256 hi = n;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (prefix(t, mid) > target) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }
}
