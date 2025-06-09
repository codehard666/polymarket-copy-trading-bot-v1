const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PROXY_WALLET = process.env.PROXY_WALLET;
const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Expanded ABI for debugging
const POLYMARKET_CTF_ABI = [
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, uint256 conditionId, uint256[] indexSets) external',
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function balanceOf(address account, uint256 id) view returns (uint256)',
    'function getCondition(bytes32 conditionId) view returns (address oracle, bytes32 questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators, uint256 payoutDenominator)',
    'function getOutcomeSlotCount(bytes32 conditionId) view returns (uint256)',
    'function getPositionId(address collateralToken, bytes32 collectionId) view returns (uint256)'
];

async function debugRedemption() {
    console.log('🔍 Debugging CTF redemption process...\n');
    
    // Set up provider and wallet
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
    
    // Test with the first failing position
    const testPosition = {
        conditionId: '0xe7faa8aacdd9ea6eff958cb58669265a011d4669bf46c7a0c1ef64313f81e737',
        asset: '111137752123540331946429122420982159359094785924958413294592923954977870949311',
        outcomeIndex: 1,
        title: 'Rangers vs. Nationals'
    };
    
    console.log(`📋 Testing position: ${testPosition.title}`);
    console.log(`   Condition ID: ${testPosition.conditionId}`);
    console.log(`   Asset (Token ID): ${testPosition.asset}`);
    console.log(`   Outcome Index: ${testPosition.outcomeIndex}\n`);
    
    try {
        // 1. Get condition details
        console.log('1️⃣ Getting condition details...');
        try {
            const condition = await ctfContract.getCondition(testPosition.conditionId);
            console.log(`   Oracle: ${condition.oracle}`);
            console.log(`   Question ID: ${condition.questionId}`);
            console.log(`   Outcome Slot Count: ${condition.outcomeSlotCount.toString()}`);
            console.log(`   Payout Numerators: [${condition.payoutNumerators.map(p => p.toString()).join(', ')}]`);
            console.log(`   Payout Denominator: ${condition.payoutDenominator.toString()}`);
        } catch (error) {
            console.log(`   ⚠️ Could not get condition details: ${error.message}`);
        }
        
        // 2. Check outcome slot count
        console.log('\n2️⃣ Checking outcome slot count...');
        const outcomeSlotCount = await ctfContract.getOutcomeSlotCount(testPosition.conditionId);
        console.log(`   Outcome slots: ${outcomeSlotCount.toString()}`);
        
        // 3. Check payout numerators for all outcomes
        console.log('\n3️⃣ Checking payout numerators for all outcomes...');
        const payoutDenominator = await ctfContract.payoutDenominator(testPosition.conditionId);
        console.log(`   Payout denominator: ${payoutDenominator.toString()}`);
        
        for (let i = 0; i < outcomeSlotCount.toNumber(); i++) {
            const numerator = await ctfContract.payoutNumerators(testPosition.conditionId, i);
            console.log(`   Outcome ${i}: ${numerator.toString()}/${payoutDenominator.toString()}`);
        }
        
        // 4. Test different index set combinations
        console.log('\n4️⃣ Testing different index set combinations...');
        const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';
        
        // For binary outcomes, possible index sets are:
        // [1] = 0b01 = outcome 0 only
        // [2] = 0b10 = outcome 1 only  
        // [3] = 0b11 = both outcomes (should not be redeemable)
        
        const indexSetsToTest = [1, 2, 3];
        
        for (const indexSet of indexSetsToTest) {
            try {
                const collectionId = await ctfContract.getCollectionId(parentCollectionId, testPosition.conditionId, indexSet);
                const positionId = await ctfContract.getPositionId(USDC_ADDRESS, collectionId);
                const balance = await ctfContract.balanceOf(wallet.address, positionId);
                
                console.log(`   Index Set ${indexSet} (binary: ${indexSet.toString(2).padStart(2, '0')}):`);
                console.log(`     Collection ID: ${collectionId}`);
                console.log(`     Position ID: ${positionId.toString()}`);
                console.log(`     Balance: ${balance.toString()}`);
                console.log(`     Matches Asset: ${positionId.toString() === testPosition.asset ? '✅' : '❌'}`);
            } catch (error) {
                console.log(`   Index Set ${indexSet}: Error - ${error.message}`);
            }
        }
        
        // 5. Check if we can redeem with correct index sets
        console.log('\n5️⃣ Determining correct redemption approach...');
        
        // Find which index set corresponds to our asset
        let correctIndexSet = null;
        for (const indexSet of indexSetsToTest) {
            try {
                const collectionId = await ctfContract.getCollectionId(parentCollectionId, testPosition.conditionId, indexSet);
                const positionId = await ctfContract.getPositionId(USDC_ADDRESS, collectionId);
                if (positionId.toString() === testPosition.asset) {
                    correctIndexSet = indexSet;
                    console.log(`   ✅ Found matching index set: ${indexSet} for asset ${testPosition.asset}`);
                    break;
                }
            } catch (error) {
                // Continue checking
            }
        }
        
        if (!correctIndexSet) {
            console.log('   ❌ Could not find matching index set for this asset');
            return;
        }
        
        // 6. For binary markets, we need to redeem BOTH outcomes at once
        console.log('\n6️⃣ Testing redemption with both outcomes...');
        
        // In CTF, for binary markets, you typically need to redeem [1, 2] together
        // This represents having both "No" and "Yes" tokens to redeem
        const bothIndexSets = [1, 2];
        
        console.log(`   Testing redemption with index sets: [${bothIndexSets.join(', ')}]`);
        
        // Check balances for both outcomes
        let hasOutcome0 = false, hasOutcome1 = false;
        
        for (const indexSet of bothIndexSets) {
            try {
                const collectionId = await ctfContract.getCollectionId(parentCollectionId, testPosition.conditionId, indexSet);
                const positionId = await ctfContract.getPositionId(USDC_ADDRESS, collectionId);
                const balance = await ctfContract.balanceOf(wallet.address, positionId);
                
                console.log(`     Index Set ${indexSet}: Balance = ${balance.toString()}`);
                
                if (indexSet === 1) hasOutcome0 = balance.gt(0);
                if (indexSet === 2) hasOutcome1 = balance.gt(0);
            } catch (error) {
                console.log(`     Index Set ${indexSet}: Error - ${error.message}`);
            }
        }
        
        console.log(`   Has outcome 0 tokens: ${hasOutcome0 ? '✅' : '❌'}`);
        console.log(`   Has outcome 1 tokens: ${hasOutcome1 ? '✅' : '❌'}`);
        
        // 7. Test the actual redemption call (dry run)
        console.log('\n7️⃣ Testing redemption call (estimating gas)...');
        
        // Try different approaches
        const approachesToTest = [
            { indexSets: [correctIndexSet], description: 'Single winning outcome' },
            { indexSets: [1, 2], description: 'Both outcomes' },
            { indexSets: [1], description: 'Outcome 0 only' },
            { indexSets: [2], description: 'Outcome 1 only' }
        ];
        
        for (const approach of approachesToTest) {
            try {
                console.log(`   Testing approach: ${approach.description} [${approach.indexSets.join(', ')}]`);
                
                const gasEstimate = await ctfContract.estimateGas.redeemPositions(
                    USDC_ADDRESS,
                    parentCollectionId,
                    testPosition.conditionId,
                    approach.indexSets
                );
                
                console.log(`     ✅ Gas estimate: ${gasEstimate.toString()}`);
                
                // If gas estimation succeeds, this approach should work
                console.log(`     💡 This approach should work for redemption!`);
                
            } catch (error) {
                console.log(`     ❌ Failed: ${error.message}`);
                
                // Try to get more details about the error
                if (error.reason) {
                    console.log(`     Reason: ${error.reason}`);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error during debugging:', error.message);
    }
}

debugRedemption().catch(console.error);
