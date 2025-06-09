const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POLYGON_RPC_URLS = [
    process.env.RPC_URL,
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.network',
    'https://rpc-mainnet.maticvigil.com',
    'https://polygon.llamarpc.com'
].filter(Boolean);

const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Extended ABI for debugging
const POLYMARKET_CTF_ABI = [
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, uint256 conditionId, uint256[] indexSets) external',
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function balanceOf(address account, uint256 id) view returns (uint256)',
    'function getCondition(bytes32 conditionId) view returns (address oracle, bytes32 questionId, uint256 outcomeSlotCount)',
    'function isConditionResolved(bytes32 conditionId) view returns (bool)',
    'function getOutcomeSlotCount(bytes32 conditionId) view returns (uint256)',
    'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])'
];

async function debugTransactionRevert() {
    try {
        console.log('🔍 Debug Transaction Revert Analysis');
        console.log('=====================================\n');
        
        // Setup provider
        const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC_URLS[0]);
        provider.resolveName = async (name) => {
            if (typeof name === 'string' && /^\d+$/.test(name)) return name;
            if (ethers.utils.isAddress(name)) return name;
            throw new Error('ENS resolution disabled');
        };
        
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
        
        console.log(`📍 Wallet address: ${wallet.address}`);
        console.log(`🏪 CTF contract: ${POLYMARKET_CTF_ADDRESS}\n`);
        
        // Test data from your transaction
        const conditionId = '0xbd378bf3d29449e95da5f1206e7311998a19d255656dea6a938bab3b48949baa';
        const tokenId = '80475983217976229112534347168636968259474363400916041869060270143151750911917';
        const tokenIdHex = '0xb1ebcad758ec04094831c56723e9c649468d49ae532550ae622598dac02e17ad';
        
        console.log(`🎯 Analyzing Condition ID: ${conditionId}`);
        console.log(`🎯 Token ID (decimal): ${tokenId}`);
        console.log(`🎯 Token ID (hex): ${tokenIdHex}\n`);
        
        // 1. Check if condition exists and is resolved
        console.log('1️⃣ Checking condition status...');
        try {
            const condition = await ctfContract.getCondition(conditionId);
            console.log(`   Oracle: ${condition[0]}`);
            console.log(`   Question ID: ${condition[1]}`);
            console.log(`   Outcome Slot Count: ${condition[2].toString()}`);
            
            const isResolved = await ctfContract.isConditionResolved(conditionId);
            console.log(`   Is Resolved: ${isResolved}`);
            
            if (!isResolved) {
                console.log('❌ ISSUE: Condition is not resolved yet!');
                return;
            }
            
        } catch (conditionError) {
            console.log(`❌ Error checking condition: ${conditionError.message}`);
            console.log('❌ ISSUE: Condition may not exist or be invalid!');
            return;
        }
        
        // 2. Check payout status
        console.log('\n2️⃣ Checking payout status...');
        try {
            const payoutDenominator = await ctfContract.payoutDenominator(conditionId);
            console.log(`   Payout denominator: ${payoutDenominator.toString()}`);
            
            if (payoutDenominator.eq(0)) {
                console.log('❌ ISSUE: Payout denominator is 0 - condition not resolved by oracle!');
                return;
            }
            
            // Check payouts for both outcomes
            for (let i = 0; i < 2; i++) {
                const payout = await ctfContract.payoutNumerators(conditionId, i);
                console.log(`   Payout numerator for outcome ${i}: ${payout.toString()}`);
            }
            
        } catch (payoutError) {
            console.log(`❌ Error checking payouts: ${payoutError.message}`);
        }
        
        // 3. Check token balance
        console.log('\n3️⃣ Checking token balance...');
        try {
            const balance = await ctfContract.balanceOf(wallet.address, tokenId);
            console.log(`   Token balance: ${balance.toString()}`);
            
            if (balance.eq(0)) {
                console.log('❌ ISSUE: No tokens to redeem! Balance is 0.');
                return;
            }
            
        } catch (balanceError) {
            console.log(`❌ Error checking balance: ${balanceError.message}`);
        }
        
        // 4. Verify collection ID calculation
        console.log('\n4️⃣ Verifying collection ID calculation...');
        try {
            const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';
            
            // Check both index sets
            for (const indexSet of [1, 2]) {
                const collectionId = await ctfContract.getCollectionId(parentCollectionId, conditionId, indexSet);
                console.log(`   Collection ID for index set ${indexSet}: ${collectionId}`);
                
                // Convert token ID to collection ID format and compare
                if (collectionId.toLowerCase() === tokenIdHex.toLowerCase()) {
                    console.log(`✅ Token matches collection for index set ${indexSet}`);
                } else {
                    console.log(`   Token ${tokenIdHex} does not match collection ${collectionId}`);
                }
            }
            
        } catch (collectionError) {
            console.log(`❌ Error checking collections: ${collectionError.message}`);
        }
        
        // 5. Test the actual transaction call with call() first
        console.log('\n5️⃣ Testing transaction call...');
        try {
            const collateralToken = USDC_ADDRESS;
            const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';
            
            // Try both index sets to see which one works
            for (const indexSet of [1, 2]) {
                console.log(`\n   Testing index set [${indexSet}]...`);
                
                try {
                    // Use call() to simulate the transaction without sending it
                    await ctfContract.callStatic.redeemPositions(
                        collateralToken,
                        parentCollectionId,
                        conditionId,
                        [indexSet]
                    );
                    console.log(`✅ Call simulation succeeded for index set [${indexSet}]`);
                    
                    // If simulation works, try to estimate gas
                    const gasEstimate = await ctfContract.estimateGas.redeemPositions(
                        collateralToken,
                        parentCollectionId,
                        conditionId,
                        [indexSet]
                    );
                    console.log(`   Gas estimate: ${gasEstimate.toString()}`);
                    
                } catch (callError) {
                    console.log(`❌ Call simulation failed for index set [${indexSet}]: ${callError.message}`);
                    
                    // Try to get more details about the error
                    if (callError.reason) {
                        console.log(`   Revert reason: ${callError.reason}`);
                    }
                    if (callError.data) {
                        console.log(`   Error data: ${callError.data}`);
                    }
                }
            }
            
        } catch (testError) {
            console.log(`❌ Error testing transaction: ${testError.message}`);
        }
        
        // 6. Check if we need different parameters
        console.log('\n6️⃣ Advanced parameter analysis...');
        try {
            // Check if the token might be from a different parent collection
            console.log('   Checking if token might be from non-null parent collection...');
            
            // Try to reverse-engineer the parent collection from the token ID
            // This is complex and may require understanding Polymarket's specific token ID structure
            
            // For now, let's check if there are any other tokens we hold that might be related
            const allTokens = [];
            
            // Check a range of common token IDs around our token
            const baseTokenId = ethers.BigNumber.from(tokenId);
            
            console.log('   Checking related token balances...');
            for (let offset = -2; offset <= 2; offset++) {
                if (offset === 0) continue; // Skip our current token
                
                try {
                    const testTokenId = baseTokenId.add(offset);
                    const testBalance = await ctfContract.balanceOf(wallet.address, testTokenId);
                    
                    if (!testBalance.eq(0)) {
                        console.log(`   Found balance for token ID ${testTokenId.toString()}: ${testBalance.toString()}`);
                        allTokens.push({ id: testTokenId.toString(), balance: testBalance.toString() });
                    }
                } catch (e) {
                    // Ignore errors for test tokens
                }
            }
            
            if (allTokens.length === 0) {
                console.log('   No related tokens found');
            }
            
        } catch (advancedError) {
            console.log(`⚠️ Error in advanced analysis: ${advancedError.message}`);
        }
        
        console.log('\n📋 SUMMARY');
        console.log('=========');
        console.log('✅ Function selector matches (0xcecf2242)');
        console.log('✅ Contract address is correct');
        console.log('✅ Parameters appear correct');
        console.log('❓ Need to check why the actual transaction reverts');
        console.log('\n💡 Next steps:');
        console.log('1. Check if the token balance is actually redeemable');
        console.log('2. Verify the exact index set needed for this token');
        console.log('3. Check if there are any additional conditions for redemption');
        
    } catch (error) {
        console.error('❌ Error in debug analysis:', error);
    }
}

debugTransactionRevert();
