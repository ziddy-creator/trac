/**
 * Example: Querying the Trac Indexer for Peer Balances using tap-reader
 */

// In a real application, you might import tap-reader like this:
// const { TapReader } = require('tap-reader');

/**
 * Mocking the API for demonstration purposes
 */
class TapReaderMock {
    constructor(endpoint) {
        this.endpoint = endpoint;
    }

    async getTokenBalance(address, ticker) {
        // Mock API response network delay
        await new Promise(resolve => setTimeout(resolve, 50));

        // Return deterministic mock balances for the demo
        const balances = {
            "peer_whale_1": 1000000,
            "peer_high_1": 250000,
            "peer_normal_1": 10000,
            "peer_normal_2": 8100,
            "peer_sybil_1": 50,      // Low stake, will be dropped
            "peer_malicious": 14400    // Good stake, but sends outlier prices
        };
        return balances[address] || 0;
    }
}

const reader = new TapReaderMock("https://api.tap.trac.network");
const REPUTATION_TOKEN_TICKER = "TRAC"; // or specifically e.g. "ORACLE_STAKE"

/**
 * Fetches balances for a list of incoming ORACLE_RES submissions
 * Designed to execute quickly within the 2-second sidechannel window.
 * 
 * @param {Array} submissions [{ peerId, price }]
 * @returns {Array} [{ peerId, price, balance }]
 */
async function discoverStakeWeights(submissions) {
    // We use Promise.all to fetch all balances concurrently 
    // to ensure we respect the fast 2-second timeout window limit
    const enrichedSubmissions = await Promise.all(submissions.map(async (sub) => {
        try {
            const balance = await reader.getTokenBalance(sub.peerId, REPUTATION_TOKEN_TICKER);
            return {
                ...sub,
                balance: balance
            };
        } catch (error) {
            console.error(`Failed to fetch balance for ${sub.peerId}:`, error);
            return {
                ...sub,
                balance: 0 // Fail-safe fallback: treat as Sybil
            };
        }
    }));

    return enrichedSubmissions;
}

// ---------------------------------------------------------
// Demo Execution combining the Query Example and Consensus
// ---------------------------------------------------------
if (require.main === module) {
    const { processOracleConsensus } = require('./consensus');

    async function runDemo() {
        console.log("=== Starting Oracle Aggregator Consensus Demo ===\n");

        // Incoming raw ORACLE_RES submissions (price of BTC in USD for example)
        const incomingSubmissions = [
            { peerId: "peer_whale_1", price: 64200 },
            { peerId: "peer_high_1", price: 64185 },
            { peerId: "peer_normal_1", price: 64210 },
            { peerId: "peer_normal_2", price: 64195 },
            { peerId: "peer_sybil_1", price: 64190 }, // Should be filtered by Sybil Threshold
            { peerId: "peer_malicious", price: 85000 }  // Malicious outlier, should be slashed
        ];

        console.log("1. Fetching on-chain balances from Trac Indexer...");
        const submissionsWithStake = await discoverStakeWeights(incomingSubmissions);
        console.log("Balances fetched. Proceeding to consensus.\n");

        console.log("2. Running Consensus algorithm...");
        try {
            const result = processOracleConsensus(submissionsWithStake);
            console.log("\n--- Consensus Reached ---");
            console.log(`Final Weighted Median Price: $${result.finalPrice}`);
            console.log(`Active Participants:     ${result.participants}`);
            console.log(`Total Handled Weight:    ${result.totalWeight.toFixed(2)}`);
        } catch (error) {
            console.error("\nConsensus failed:", error.message);
        }
    }

    runDemo();
}
