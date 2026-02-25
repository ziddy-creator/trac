const { processOracleConsensus, getSlashingRecord, calculateWeightedMedian } = require('./consensus');

describe('Oracle Consensus Mechanism', () => {
    describe('calculateWeightedMedian', () => {
        it('calculates the median correctly based on weight', () => {
            const data = [
                { peerId: 'p1', price: 100, weight: 10 }, // Cumulative 10
                { peerId: 'p2', price: 110, weight: 20 }, // Cumulative 30
                { peerId: 'p3', price: 120, weight: 50 }, // Cumulative 80 (Target 55, this contains median)
                { peerId: 'p4', price: 130, weight: 30 }  // Cumulative 110
            ];
            const medianPrice = calculateWeightedMedian(data);
            expect(medianPrice).toBe(120);
        });

        it('returns 0 for empty arrays', () => {
            expect(calculateWeightedMedian([])).toBe(0);
        });
    });

    describe('processOracleConsensus', () => {
        it('filters Sybil peers (below minimum stake bounds)', () => {
            const submissions = [
                { peerId: "test_sybil", price: 64200, balance: 50 } // Stake below 100
            ];
            expect(() => processOracleConsensus(submissions)).toThrow("No qualified responses for consensus.");
        });

        it('identifies and filters single outlier correctly', () => {
            const submissions = [
                { peerId: "peer_1", price: 100, balance: 400 }, // Weight 20
                { peerId: "peer_2", price: 101, balance: 400 }, // Weight 20
                { peerId: "peer_3", price: 100, balance: 400 }, // Weight 20
                { peerId: "peer_4", price: 99, balance: 400 },  // Weight 20
                { peerId: "malicious", price: 500, balance: 400 } // Outlier!
            ];

            const result = processOracleConsensus(submissions);
            expect(result.participants).toBe(4);
            // Result should be median of 99, 100, 100, 101 which is 100
            expect(result.finalPrice).toBe(100);

            // malicious peer should get an offense parsed
            const slashingRecord = getSlashingRecord('malicious');
            expect(slashingRecord.offenses).toBeGreaterThan(0);
        });

        it('drops peers after repeated slashing offenses (blacklist)', () => {
            const submissions = [
                { peerId: "peer_a", price: 100, balance: 400 },
                { peerId: "peer_b", price: 100, balance: 400 },
                { peerId: "peer_c", price: 100, balance: 400 },
                { peerId: "bad_actor", price: 9999, balance: 10000 } // Outlier 1
            ];

            // Offense 1
            expect(() => processOracleConsensus(submissions)).not.toThrow();
            // Offense 2
            expect(() => processOracleConsensus(submissions)).not.toThrow();
            // Offense 3 (Threshold Hit)
            expect(() => processOracleConsensus(submissions)).not.toThrow();

            const record = getSlashingRecord('bad_actor');
            expect(record.blacklisted).toBe(true);

            // 4th time: bad_actor should be completely ignored in filter early on
            const resultAfterBlacklist = processOracleConsensus(submissions);
            // Only peer_a, peer_b, peer_c shouldn't be affected
            expect(resultAfterBlacklist.participants).toBe(3);
        });
    });
});
