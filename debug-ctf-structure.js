const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PROXY_WALLET = process.env.PROXY_WALLET;

// CTF Contract details
const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Enhanced ABI with additional functions for debugging
const POLYMARKET_CTF_ABI = [
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, uint256 conditionId, uint256[] indexSets) external',
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function balanceOf(address account, uint256 id) view returns (uint256)',
    'function getPositionId(address collateralToken, bytes32 collectionId) view returns (uint256)',
    'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external',
    'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external'
];

/**
 * Fetches a specific position for detailed analysis
 */
async function analyzePosition(conditionId, outcomeIndex, tokenId) {
    try {
        console.log(`\n🔍 Analyzing Position:`);
        console.log(`   Condition ID: ${conditionId}`);
        console.log(`   Outcome Index: ${outcomeIndex}`);
        console.log(`   Token ID: ${tokenId}`);
        
        // Setup provider and contract
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
        
        // Check oracle status
        console.log(`\n📊 Oracle Status:`);
        const payoutDenominator = await ctfContract.payoutDenominator(conditionId);
        console.log(`   Payout denominator: ${payoutDenominator.toString()}`);
        
        for (let i = 0; i < 2; i++) {
            const payoutNumerator = await ctfContract.payoutNumerators(conditionId, i);
            console.log(`   Payout numerator[${i}]: ${payoutNumerator.toString()}`);
        }
        
        // Check token balance
        console.log(`\n💰 Token Balance:`);
        const balance = await ctfContract.balanceOf(wallet.address, tokenId);
        console.log(`   Balance for token ${tokenId}: ${balance.toString()}`);
        
        // Calculate collection IDs for all outcomes
        console.log(`\n🗂️ Collection Analysis:`);
        const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';
        
        for (let indexSet = 1; indexSet <= 2; indexSet++) {
            const collectionId = await ctfContract.getCollectionId(parentCollectionId, conditionId, indexSet);
            console.log(`   Collection ID for indexSet ${indexSet}: ${collectionId}`);
            
            // Get position ID for this collection
            try {
                const positionId = await ctfContract.getPositionId(USDC_ADDRESS, collectionId);
                console.log(`   Position ID for collection ${collectionId}: ${positionId.toString()}`);
                console.log(`   Does this match our token ID? ${positionId.toString() === tokenId}`);
                
                // Check balance for this position ID
                const positionBalance = await ctfContract.balanceOf(wallet.address, positionId);
                console.log(`   Balance for position ID ${positionId}: ${positionBalance.toString()}`);
            } catch (error) {
                console.log(`   Error getting position ID: ${error.message}`);
            }
        }
        
        // Try to understand the relationship between token ID and collection
        console.log(`\n🔗 Token ID Analysis:`);
        console.log(`   Given token ID: ${tokenId}`);
        console.log(`   Token ID as hex: 0x${BigInt(tokenId).toString(16)}`);
        
        // Check if we can reverse-engineer the collection from the token ID
        // In CTF, position IDs are typically keccak256(abi.encodePacked(collateralToken, collectionId))
        for (let indexSet = 1; indexSet <= 2; indexSet++) {
            const collectionId = await ctfContract.getCollectionId(parentCollectionId, conditionId, indexSet);
            const expectedPositionId = ethers.utils.keccak256(
                ethers.utils.solidityPack(['address', 'bytes32'], [USDC_ADDRESS, collectionId])
            );
            const expectedPositionIdBN = ethers.BigNumber.from(expectedPositionId);
            
            console.log(`   Expected position ID for indexSet ${indexSet}: ${expectedPositionIdBN.toString()}`);
            console.log(`   Matches our token? ${expectedPositionIdBN.toString() === tokenId}`);
        }
        
    } catch (error) {
        console.error('❌ Error analyzing position:', error);
    }
}

/**
 * Test different redemption approaches
 */
async function testRedemptionApproaches(conditionId, outcomeIndex, tokenId) {
    try {
        console.log(`\n🧪 Testing Redemption Approaches:`);
        
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
        
        const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const indexSets = outcomeIndex === 0 ? [1] : [2];
        
        console.log(`   Condition ID: ${conditionId}`);
        console.log(`   Parent Collection ID: ${parentCollectionId}`);
        console.log(`   Index Sets: [${indexSets.join(', ')}]`);
        
        // Test 1: Standard approach with estimated gas
        console.log(`\n🔧 Test 1: Standard redemption with gas estimation`);
        try {
            const gasEstimate = await ctfContract.estimateGas.redeemPositions(
                USDC_ADDRESS,
                parentCollectionId,
                conditionId,
                indexSets
            );
            console.log(`   ✅ Gas estimate successful: ${gasEstimate.toString()}`);
            
            // Simulate the call to see if it would succeed
            const result = await ctfContract.callStatic.redeemPositions(
                USDC_ADDRESS,
                parentCollectionId,
                conditionId,
                indexSets
            );
            console.log(`   ✅ Static call successful, would redeem successfully`);
            
        } catch (error) {
            console.log(`   ❌ Gas estimation failed: ${error.message}`);
            
            // Try to get more specific error information
            try {
                await ctfContract.callStatic.redeemPositions(
                    USDC_ADDRESS,
                    parentCollectionId,
                    conditionId,
                    indexSets
                );
            } catch (staticError) {
                console.log(`   ❌ Static call also failed: ${staticError.message}`);
                
                // Check if it's a revert with reason
                if (staticError.reason) {
                    console.log(`   🔍 Revert reason: ${staticError.reason}`);
                }
                if (staticError.error && staticError.error.message) {
                    console.log(`   🔍 Error message: ${staticError.error.message}`);
                }
            }
        }
        
        // Test 2: Try with different parent collection IDs
        console.log(`\n🔧 Test 2: Testing different parent collection approaches`);
        
        // Get the collection ID for our winning outcome
        const winningCollectionId = await ctfContract.getCollectionId(parentCollectionId, conditionId, indexSets[0]);
        console.log(`   Winning outcome collection ID: ${winningCollectionId}`);
        
        // Try using the collection ID itself as parent (probably wrong, but let's test)
        try {
            const gasEstimate2 = await ctfContract.estimateGas.redeemPositions(
                USDC_ADDRESS,
                winningCollectionId, // Using collection as parent (likely wrong)
                conditionId,
                indexSets
            );
            console.log(`   ⚠️ Using collection as parent - Gas estimate: ${gasEstimate2.toString()}`);
        } catch (error) {
            console.log(`   ❌ Using collection as parent failed: ${error.message}`);
        }
        
        // Test 3: Check if we need to redeem both outcomes together
        console.log(`\n🔧 Test 3: Testing redemption of all outcomes together`);
        try {
            const allIndexSets = [1, 2]; // Both outcomes
            const gasEstimate3 = await ctfContract.estimateGas.redeemPositions(
                USDC_ADDRESS,
                parentCollectionId,
                conditionId,
                allIndexSets
            );
            console.log(`   ⚠️ Redeeming all outcomes - Gas estimate: ${gasEstimate3.toString()}`);
            
            // Check balances for both outcomes
            const collection1 = await ctfContract.getCollectionId(parentCollectionId, conditionId, 1);
            const collection2 = await ctfContract.getCollectionId(parentCollectionId, conditionId, 2);
            const positionId1 = await ctfContract.getPositionId(USDC_ADDRESS, collection1);
            const positionId2 = await ctfContract.getPositionId(USDC_ADDRESS, collection2);
            const balance1 = await ctfContract.balanceOf(wallet.address, positionId1);
            const balance2 = await ctfContract.balanceOf(wallet.address, positionId2);
            
            console.log(`   Balance for outcome 0 (indexSet 1): ${balance1.toString()}`);
            console.log(`   Balance for outcome 1 (indexSet 2): ${balance2.toString()}`);
            
        } catch (error) {
            console.log(`   ❌ Redeeming all outcomes failed: ${error.message}`);
        }
        
    } catch (error) {
        console.error('❌ Error testing redemption approaches:', error);
    }
}

// Test with one of the failing positions
async function main() {
    console.log('🔍 CTF Contract Structure Analysis\n');
    
    // Use the first failing position for analysis
    const testConditionId = '0xe7faa8aacdd9ea6eff958cb58669265a011d4669bf46c7a0c1ef64313f81e737';
    const testOutcomeIndex = 1; // Nationals
    const testTokenId = '111137752123540331946429122420982159359094785924958413294592923954977870949311';
    
    await analyzePosition(testConditionId, testOutcomeIndex, testTokenId);
    await testRedemptionApproaches(testConditionId, testOutcomeIndex, testTokenId);
}

main().catch(console.error);
