const { ethers } = require('ethers');
require('dotenv').config();

// Configuration from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PROXY_WALLET = process.env.PROXY_WALLET;

// Contract addresses
const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Extended ABI for diagnostics
const CTF_ABI = [
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, uint256 conditionId, uint256[] indexSets) external',
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function balanceOf(address owner, uint256 tokenId) view returns (uint256)',
    'function getPositionId(address collateralToken, bytes32 collectionId) view returns (uint256)',
    'function conditions(bytes32 conditionId) view returns (address oracle, bytes32 questionId, uint256 outcomeSlotCount, uint256 payoutDenominator)'
];

// Specific position to diagnose
const POSITION = {
    title: "Rangers vs. Nationals",
    asset: "111137752123540331946429122420982159359094785924958413294592923954977870949311",
    amount: "8.585852",
    outcome: "Nationals",
    outcomeIndex: 1,
    conditionId: "0xe7faa8aacdd9ea6eff958cb58669265a011d4669bf46c7a0c1ef64313f81e737"
};

async function diagnosePosition() {
    try {
        console.log('🔬 Diagnostic Analysis for Position');
        console.log('=====================================');
        console.log(`Position: ${POSITION.title}`);
        console.log(`Asset Token ID: ${POSITION.asset}`);
        console.log(`Expected Amount: ${POSITION.amount} tokens`);
        console.log(`Winning Outcome: ${POSITION.outcome} (index ${POSITION.outcomeIndex})`);
        console.log(`Condition ID: ${POSITION.conditionId}`);
        
        // Setup provider and contract
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, CTF_ABI, wallet);
        
        console.log(`\n📡 Connected to network: ${(await provider.getNetwork()).name}`);
        console.log(`📍 Wallet: ${wallet.address}`);
        console.log(`🏪 CTF Contract: ${POLYMARKET_CTF_ADDRESS}`);
        
        // 1. Check oracle resolution status
        console.log('\n1️⃣ Oracle Resolution Status');
        console.log('─────────────────────────────');
        try {
            const payoutDenominator = await ctfContract.payoutDenominator(POSITION.conditionId);
            console.log(`✅ Payout Denominator: ${payoutDenominator.toString()}`);
            
            if (payoutDenominator.eq(0)) {
                console.log('❌ Oracle NOT resolved - condition not finalized');
                return;
            }
            
            // Check payouts for both outcomes
            for (let i = 0; i < 2; i++) {
                const payout = await ctfContract.payoutNumerators(POSITION.conditionId, i);
                console.log(`   Outcome ${i}: ${payout.toString()}/${payoutDenominator.toString()} = ${(payout.toNumber() / payoutDenominator.toNumber() * 100).toFixed(1)}%`);
            }
            
            const winningPayout = await ctfContract.payoutNumerators(POSITION.conditionId, POSITION.outcomeIndex);
            if (winningPayout.eq(0)) {
                console.log(`❌ Outcome ${POSITION.outcomeIndex} did NOT win - no payout available`);
                return;
            } else {
                console.log(`✅ Outcome ${POSITION.outcomeIndex} WON - payout available`);
            }
            
        } catch (error) {
            console.log(`❌ Error checking oracle: ${error.message}`);
            return;
        }
        
        // 2. Check token balance
        console.log('\n2️⃣ Token Balance Check');
        console.log('─────────────────────────');
        try {
            const balance = await ctfContract.balanceOf(wallet.address, POSITION.asset);
            console.log(`Wallet balance of token ${POSITION.asset}: ${balance.toString()}`);
            console.log(`Expected: ${ethers.utils.parseUnits(POSITION.amount, 6).toString()}`);
            
            if (balance.eq(0)) {
                console.log('❌ Zero balance - tokens may have been already claimed or transferred');
                return;
            } else {
                console.log('✅ Tokens are present in wallet');
            }
        } catch (error) {
            console.log(`❌ Error checking balance: ${error.message}`);
        }
        
        // 3. Analyze collection structure
        console.log('\n3️⃣ Collection Structure Analysis');
        console.log('────────────────────────────────');
        
        const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';
        
        try {
            // Check collection IDs for both outcomes
            for (let indexSet = 1; indexSet <= 2; indexSet++) {
                console.log(`\nChecking index set ${indexSet}:`);
                
                const collectionId = await ctfContract.getCollectionId(
                    parentCollectionId, 
                    POSITION.conditionId, 
                    indexSet
                );
                console.log(`   Collection ID: ${collectionId}`);
                
                // Get position ID for this collection
                const positionId = await ctfContract.getPositionId(USDC_ADDRESS, collectionId);
                console.log(`   Position ID: ${positionId.toString()}`);
                
                // Check if this matches our asset
                if (positionId.toString() === POSITION.asset) {
                    console.log(`   ✅ MATCH! This is our asset token`);
                    console.log(`   Index set ${indexSet} corresponds to our position`);
                } else {
                    console.log(`   ❌ No match with our asset`);
                }
            }
        } catch (error) {
            console.log(`❌ Error analyzing collections: ${error.message}`);
        }
        
        // 4. Try the actual redemption call with detailed error analysis
        console.log('\n4️⃣ Redemption Call Analysis');
        console.log('───────────────────────────────');
        
        const collateralToken = USDC_ADDRESS;
        const indexSets = [POSITION.outcomeIndex === 0 ? 1 : 2]; // Convert outcome index to index set
        
        console.log(`Parameters for redeemPositions:`);
        console.log(`   collateralToken: ${collateralToken}`);
        console.log(`   parentCollectionId: ${parentCollectionId}`);
        console.log(`   conditionId: ${POSITION.conditionId}`);
        console.log(`   indexSets: [${indexSets.join(', ')}]`);
        
        try {
            console.log('\n🧪 Testing gas estimation...');
            const gasEstimate = await ctfContract.estimateGas.redeemPositions(
                collateralToken,
                parentCollectionId,
                POSITION.conditionId,
                indexSets
            );
            console.log(`✅ Gas estimation successful: ${gasEstimate.toString()} gas`);
            console.log('✅ Transaction should work - the reversion might be due to gas/timing issues');
            
        } catch (gasError) {
            console.log(`❌ Gas estimation failed: ${gasError.message}`);
            
            // Try to decode the revert reason
            if (gasError.data) {
                console.log(`   Raw error data: ${gasError.data}`);
            }
            
            if (gasError.message.includes('execution reverted')) {
                console.log('   This is a contract-level reversion');
                
                // Common reasons for reversion:
                console.log('\n🔍 Possible reasons for reversion:');
                console.log('   1. Position already redeemed');
                console.log('   2. Incorrect index sets for this position');
                console.log('   3. Condition not properly resolved by oracle');
                console.log('   4. Insufficient token balance');
                console.log('   5. Wrong parentCollectionId');
            }
        }
        
        // 5. Alternative redemption strategies
        console.log('\n5️⃣ Alternative Strategies');
        console.log('─────────────────────────');
        
        // Try with different index sets
        console.log('Testing different index set combinations:');
        
        const alternativeIndexSets = [
            [1],      // Only "No" outcome
            [2],      // Only "Yes" outcome  
            [1, 2]    // Both outcomes
        ];
        
        for (const testIndexSets of alternativeIndexSets) {
            try {
                console.log(`\nTesting index sets [${testIndexSets.join(', ')}]:`);
                const gasEstimate = await ctfContract.estimateGas.redeemPositions(
                    collateralToken,
                    parentCollectionId,
                    POSITION.conditionId,
                    testIndexSets
                );
                console.log(`   ✅ Gas estimation successful: ${gasEstimate.toString()} gas`);
            } catch (error) {
                console.log(`   ❌ Failed: ${error.message.split('\n')[0]}`);
            }
        }
        
        console.log('\n📋 Diagnostic Summary');
        console.log('═════════════════════');
        console.log('If all checks pass but redemption fails, the issue might be:');
        console.log('• Network congestion or RPC provider issues');
        console.log('• Race condition (position claimed between checks)');
        console.log('• Polymarket-specific redemption requirements');
        console.log('• Need to use Polymarket\'s own redemption interface');
        
    } catch (error) {
        console.error('❌ Diagnostic failed:', error);
    } finally {
        process.exit(0);
    }
}

diagnosePosition();
