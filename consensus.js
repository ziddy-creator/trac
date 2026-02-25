/**
 * Trac Oracle Aggregator - Reputation-Based Weighted Consensus
 */

const MINIMUM_STAKE_THRESHOLD = 100; // Minimum tokens required to participate
const SLASHING_THRESHOLD = 3; // Number of offenses before blacklisting

const Database = require('better-sqlite3');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'peer_reputation.db';
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS reputation (
    peerId TEXT PRIMARY KEY,
    offenses INTEGER DEFAULT 0,
    blacklisted INTEGER DEFAULT 0
  )
`);

const stmtGet = db.prepare('SELECT offenses, blacklisted FROM reputation WHERE peerId = ?');
const stmtInsert = db.prepare('INSERT OR IGNORE INTO reputation (peerId, offenses, blacklisted) VALUES (?, 0, 0)');
const stmtUpdate = db.prepare('UPDATE reputation SET offenses = ?, blacklisted = ? WHERE peerId = ?');

/**
 * Gets the history of offenses for a PeerID
 */
function getSlashingRecord(peerId) {
    let row = stmtGet.get(peerId);
    if (!row) {
        stmtInsert.run(peerId);
        row = { offenses: 0, blacklisted: 0 };
    }
    return { offenses: row.offenses, blacklisted: row.blacklisted === 1 };
}

/**
 * Records an offense for submitting outlier data
 */
function recordSlashingOffense(peerId) {
    const record = getSlashingRecord(peerId);
    record.offenses += 1;
    if (record.offenses >= SLASHING_THRESHOLD) {
        record.blacklisted = true;
        console.warn(`[SLASHING] \x1b[31mPeer ${peerId} has been blacklisted for repeated outliers.\x1b[0m`);
    } else {
        console.warn(`[SLASHING] Offense recorded for ${peerId}. Total offenses: ${record.offenses}/${SLASHING_THRESHOLD}`);
    }
    stmtUpdate.run(record.offenses, record.blacklisted ? 1 : 0, peerId);
}

/**
 * Computes standard median of an array of prices
 */
function computeMedian(prices) {
    if (prices.length === 0) return 0;
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sortedPrices.length / 2);
    if (sortedPrices.length % 2 === 0) {
        return (sortedPrices[mid - 1] + sortedPrices[mid]) / 2;
    }
    return sortedPrices[mid];
}

/**
 * Computes the standard deviation of an array of prices
 */
function computeStandardDeviation(prices, mean) {
    if (prices.length === 0) return 0;
    const squaredDiffs = prices.map(price => Math.pow(price - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / prices.length;
    return Math.sqrt(avgSquaredDiff);
}

/**
 * Computes mean of an array of prices
 */
function computeMean(prices) {
    if (prices.length === 0) return 0;
    const sum = prices.reduce((a, b) => a + b, 0);
    return sum / prices.length;
}

/**
 * Calculates the Reputation-Based Weighted Median
 * Instead of a simple average, sort the prices and find the price point 
 * where the cumulative weight reaches 50% of the total network weight.
 * 
 * @param {Array} qualifiedResponses [{ peerId, price, weight }]
 * @returns {Number} The weighted median price
 */
function calculateWeightedMedian(qualifiedResponses) {
    if (qualifiedResponses.length === 0) return 0;

    // Sort responses by price ascending
    const sortedResponses = [...qualifiedResponses].sort((a, b) => a.price - b.price);

    // Calculate total weight
    const totalWeight = sortedResponses.reduce((sum, res) => sum + res.weight, 0);
    const targetWeight = totalWeight / 2;

    let cumulativeWeight = 0;
    for (const response of sortedResponses) {
        cumulativeWeight += response.weight;
        // The price point where cumulative weight reaches 50%
        if (cumulativeWeight >= targetWeight) {
            return response.price;
        }
    }

    return sortedResponses[sortedResponses.length - 1].price; // Fallback
}

/**
 * Parses incoming ORACLE_RES messages and computes final consensus
 * 
 * @param {Array} responses [{ peerId, price, balance }]
 * @returns {Object} { finalPrice, participants, totalWeight }
 */
function processOracleConsensus(responses) {
    const validResponses = [];

    // 1. Sybil Defense & Identity Check
    for (const res of responses) {
        const { peerId, price, balance } = res;

        // Skip blacklisted peers
        const slashingRecord = getSlashingRecord(peerId);
        if (slashingRecord.blacklisted) {
            console.log(`[FILTER] Rejected ORACLE_RES from blacklisted PeerID: ${peerId}`);
            continue;
        }

        // Apply Sybil Threshold
        if (balance < MINIMUM_STAKE_THRESHOLD) {
            console.log(`[FILTER] Rejected ORACLE_RES for Sybil Threshold: ${peerId} has ${balance} tokens (Min: ${MINIMUM_STAKE_THRESHOLD})`);
            continue;
        }

        // Apply Reputation Token formula: Wi = sqrt(Balance)
        const weight = Math.sqrt(balance);
        validResponses.push({ peerId, price, weight, balance });
    }

    if (validResponses.length === 0) {
        throw new Error("No qualified responses for consensus.");
    }

    // 2. Anti-Outlier Filter
    const prices = validResponses.map(r => r.price);
    const medianPrice = computeMedian(prices);
    const meanPrice = computeMean(prices);
    const stdDev = computeStandardDeviation(prices, meanPrice);

    const qualifiedForConsensus = [];

    for (const res of validResponses) {
        const diff = Math.abs(res.price - medianPrice);
        const zScore = stdDev === 0 ? 0 : diff / stdDev;

        // If > 2 standard deviations away, discard and slash
        if (zScore > 2) {
            console.log(`[OUTLIER] Rejected ORACLE_RES from ${res.peerId}. Price: ${res.price}, Median: ${medianPrice}, StdDev: ${stdDev.toFixed(2)}`);
            recordSlashingOffense(res.peerId);
            continue;
        }

        qualifiedForConsensus.push(res);
    }

    if (qualifiedForConsensus.length === 0) {
        throw new Error("No responses passed the outlier filter.");
    }

    // 3. Consensus Calculation (Weighted Median)
    const finalPrice = calculateWeightedMedian(qualifiedForConsensus);

    return {
        finalPrice,
        participants: qualifiedForConsensus.length,
        totalWeight: qualifiedForConsensus.reduce((sum, res) => sum + res.weight, 0)
    };
}

module.exports = {
    processOracleConsensus,
    calculateWeightedMedian,
    getSlashingRecord
};
