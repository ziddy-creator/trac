Trac Oracle Aggregator Consensus

This project implements a **Reputation-Based Weighted Consensus** mechanism designed for a decentralized oracle network (referred to as the Trac Oracle Aggregator). It aggregates price data submissions from multiple peers, defenses against Sybil attacks and malicious outliers, and computes a secure weighted median final price.

## Features

1. **Sybil Resistance:** Peers must hold a minimum stake (e.g., $TRAC tokens) to participate. Minimum threshold limits are strictly enforced.
2. **Reputation Token Formula:** A peer's influence over the consensus calculation is proportional to the square root of their staked balance ($W_i = \sqrt{Balance_i}$), preventing wealthy nodes from easily overpowering the network.
3. **Anti-Outlier Filter:** Submissions that deviate by more than 2 standard deviations from the dataset's median are discarded. 
4. **Persistent Slashing System:** Peers submitting data outside the accepted standard deviation are penalized. After a predefined number of offenses (Slashing Threshold), the peer is persistently blacklisted. Records are stored efficiently using `better-sqlite3`.
5. **Weighted Median Calculation:** The final consensus price is derived by finding the price point where the cumulative weight of the sorted submissions reaches 50% of the network's total participating weight.

## Prerequisites

- Node.js (v14 or higher recommended)
- npm

## Installation

1. Clone or download the repository.
2. Navigate to the project directory:
   ```bash
   cd trac
   ```
3. Install the required dependencies (`better-sqlite3` and `jest` for testing):
   ```bash
   npm install
   ```
## Trac Address

trac1ajrf072puhf4df9pqyee8mshyat4duqhqns7g8vlk3jhcwyw4zkqltqjff

