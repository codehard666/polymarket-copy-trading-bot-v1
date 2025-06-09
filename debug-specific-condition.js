const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PROXY_WALLET = process.env.PROXY_WALLET;

const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// ABI for CTF contract
const CTF_ABI = [
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external',
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function balanceOf(address account, uint256 id) view returns (uint256)',
    'function getCondition(bytes32 conditionId) view returns (address oracle, bytes32 questionId, uint256 outcomeSlotCount)',
    'function isConditionResolved(bytes32 conditionId) view returns (bool)'
];

// Specific condition and token from error
const CONDITION_ID = '0xbd378bf3d29449e95da5f1206e7311998a19d255656dea6a938bab3b48949baa';
const TOKEN_ID = '80475983217976229112534347168636968259474363400916041869060270143151750911917';
const TOKEN_ID_HEX = '0xb1ebcad758ec04094831c56723e9c649468d49ae532550ae622598dac02e17ad';

async function debugSpecificCondition() {
    try {
        console.log('🔍 Debugging specific condition and token...');
        console.log(`Condition ID: ${CONDITION_ID}`);
        console.log(`Token ID: ${TOKEN_ID}`);
        console.log(`Token ID (hex): ${TOKEN_ID_HEX}`);
        
        // Setup provider and contract
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, CTF_ABI, wallet);
        
        console.log(`\n📍 Wallet: ${wallet.address}`);
        console.log(`📍 Proxy Wallet: ${PROXY_WALLET}`);
        
        // 1. Check condition resolution status
        console.log('\n🔍 1. Checking condition resolution...');
        try {
            const payoutDenominator = await ctfContract.payoutDenominator(CONDITION_ID);
            console.log(`   Payout denominator: ${payoutDenominator.toString()}`);
            
            if (payoutDenominator.eq(0)) {
                console.log('❌ Condition is NOT resolved yet!');
                return;
            }
            
            // Check payouts for all outcomes (binary market has 2 outcomes)
            for (let i = 0; i < 2; i++) {
                const payout = await ctfContract.payoutNumerators(CONDITION_ID, i);
                console.log(`   Payout for outcome ${i}: ${payout.toString()}`);
            }
            
        } catch (error) {
            console.log(`❌ Error checking payouts: ${error.message}`);
        }
        
        // 2. Check token balances
        console.log('\n🔍 2. Checking token balances...');
        try {
            const balance = await ctfContract.balanceOf(wallet.address, TOKEN_ID);
            console.log(`   Balance for wallet ${wallet.address}: ${balance.toString()}`);
            
            const proxyBalance = await ctfContract.balanceOf(PROXY_WALLET, TOKEN_ID);
            console.log(`   Balance for proxy ${PROXY_WALLET}: ${proxyBalance.toString()}`);
            
        } catch (error) {
            console.log(`❌ Error checking balances: ${error.message}`);
        }
        
        // 3. Analyze token ID structure
        console.log('\n🔍 3. Analyzing token ID structure...');
        
        // Token ID in Polymarket/CTF is constructed from collection ID
        // Let's try to reverse-engineer which collection and index set this token belongs to
        
        // Try different index sets to see which collection matches our token
        const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';
        
        for (let indexSet = 1; indexSet <= 4; indexSet++) {
            try {
                const collectionId = await ctfContract.getCollectionId(parentCollectionId, CONDITION_ID, indexSet);
                console.log(`   Collection ID for index set ${indexSet}: ${collectionId}`);
                
                // Check if this matches our token somehow
                // The token ID might be derived from collection ID + some other data
                if (collectionId.toLowerCase() === TOKEN_ID_HEX.toLowerCase()) {
                    console.log(`✅ Found matching collection for index set ${indexSet}!`);
                }
            } catch (error) {
                console.log(`   Error getting collection for index set ${indexSet}: ${error.message}`);
            }
        }
        
        // 4. Check condition details
        console.log('\n🔍 4. Checking condition details...');
        try {
            const condition = await ctfContract.getCondition(CONDITION_ID);
            console.log(`   Oracle: ${condition[0]}`);
            console.log(`   Question ID: ${condition[1]}`);
            console.log(`   Outcome slot count: ${condition[2].toString()}`);
        } catch (error) {
            console.log(`❌ Error getting condition: ${error.message}`);
        }
        
        // 5. Try to simulate the redemption call
        console.log('\n🔍 5. Simulating redemption calls...');
        
        // Try different index sets
        for (let outcomeIndex = 0; outcomeIndex < 2; outcomeIndex++) {
            const indexSets = outcomeIndex === 0 ? [1] : [2];
            
            console.log(`\n   Testing redemption for outcome ${outcomeIndex}, index sets: [${indexSets.join(', ')}]`);
            
            try {
                // Use callStatic to simulate without sending transaction
                await ctfContract.callStatic.redeemPositions(
                    USDC_ADDRESS,
                    parentCollectionId,
                    CONDITION_ID,
                    indexSets
                );
                console.log(`✅ Redemption simulation SUCCESS for outcome ${outcomeIndex}`);
            } catch (error) {
                console.log(`❌ Redemption simulation FAILED for outcome ${outcomeIndex}: ${error.message}`);
                
                // Try to get more details about the error
                if (error.error && error.error.data) {
                    console.log(`   Error data: ${error.error.data}`);
                }
            }
        }
        
        // 6. Check if we need to use a different parent collection ID
        console.log('\n🔍 6. Testing different parent collection IDs...');
        
        // Sometimes tokens might be from a different collection, let's try some common ones
        const testCollections = [
            '0x0000000000000000000000000000000000000000000000000000000000000000', // null
            CONDITION_ID, // condition ID as parent
            TOKEN_ID_HEX // token ID as parent (unlikely but worth checking)
        ];
        
        for (const testParent of testCollections) {
            console.log(`\n   Testing with parent collection: ${testParent}`);
            
            for (let indexSet = 1; indexSet <= 2; indexSet++) {
                try {
                    const collectionId = await ctfContract.getCollectionId(testParent, CONDITION_ID, indexSet);
                    console.log(`     Collection ID for index set ${indexSet}: ${collectionId}`);
                    
                    // Try redemption with this parent collection
                    try {
                        await ctfContract.callStatic.redeemPositions(
                            USDC_ADDRESS,
                            testParent,
                            CONDITION_ID,
                            [indexSet]
                        );
                        console.log(`✅ SUCCESS with parent ${testParent}, index set ${indexSet}`);
                    } catch (redeemError) {
                        console.log(`❌ Failed with parent ${testParent}, index set ${indexSet}: ${redeemError.message}`);
                    }
                    
                } catch (error) {
                    console.log(`     Error getting collection: ${error.message}`);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Debug error:', error);
    }
}

debugSpecificCondition();
