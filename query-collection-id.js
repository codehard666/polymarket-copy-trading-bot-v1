const { ethers } = require('ethers');
require('dotenv').config();

// Configuration from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PROXY_WALLET = process.env.PROXY_WALLET;

// Polymarket CTF (Conditional Token Framework) contract address on Polygon
const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC on Polygon

// Extended ABI with collection querying functions
const POLYMARKET_CTF_ABI = [
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, uint256 conditionId, uint256[] indexSets) external',
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function balanceOf(address account, uint256 id) view returns (uint256)'
];

/**
 * Fetches all positions for the wallet
 * @returns {Promise<Array>} Array of positions
 */
async function getPositions() {
    try {
        const response = await fetch(`https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`);
        if (!response.ok) {
            throw new Error(`Error fetching positions: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('❌ Error fetching positions:', error);
        return [];
    }
}

/**
 * Query collection information for positions to understand the correct parentCollectionId
 */
async function queryCollectionInfo() {
    try {
        console.log('🔄 Setting up provider and contract...');
        
        // Create provider with ENS disabled
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        
        // Override the resolveName method to prevent ENS resolution
        provider.resolveName = async (name) => {
            if (typeof name === 'string' && /^\d+$/.test(name)) {
                return name;
            }
            if (ethers.utils.isAddress(name)) {
                return name;
            }
            throw new Error('ENS resolution disabled');
        };
        
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
        
        console.log(`📍 Wallet address: ${wallet.address}`);
        console.log(`🏪 CTF contract: ${POLYMARKET_CTF_ADDRESS}`);
        
        // Get positions
        console.log('\n🔍 Fetching positions...');
        const positions = await getPositions();
        
        if (!positions || positions.length === 0) {
            console.log('ℹ️ No positions found.');
            return;
        }
        
        // Filter for redeemable positions
        const redeemablePositions = positions.filter(pos => pos.redeemable === true);
        
        if (redeemablePositions.length === 0) {
            console.log('ℹ️ No redeemable positions found.');
            return;
        }
        
        console.log(`\n🎯 Found ${redeemablePositions.length} positions marked as redeemable:\n`);
        
        // For each position, query collection information
        for (const position of redeemablePositions) {
            console.log(`📊 Position: ${position.title}`);
            console.log(`   Asset: ${position.asset}`);
            console.log(`   Amount: ${position.size} tokens`);
            console.log(`   Outcome: ${position.outcome} (index ${position.outcomeIndex})`);
            
            // Check token balance
            try {
                const tokenBalance = await ctfContract.balanceOf(wallet.address, position.asset);
                console.log(`   Token Balance: ${ethers.utils.formatUnits(tokenBalance, 0)} tokens`);
            } catch (balanceError) {
                console.log(`   ❌ Error checking token balance: ${balanceError.message}`);
            }
            
            // Check oracle resolution
            console.log(`\n🔍 Checking oracle resolution for condition: ${position.conditionId}`);
            try {
                const payoutDenominator = await ctfContract.payoutDenominator(position.conditionId);
                
                if (payoutDenominator.eq(0)) {
                    console.log(`   ❌ Oracle has not resolved this condition yet`);
                    console.log(`   ❌ This position is NOT ready for redemption (oracle hasn't resolved)`);
                } else {
                    console.log(`   ✅ Oracle resolved - payout denominator: ${payoutDenominator.toString()}`);
                    
                    // Check payout for this specific outcome
                    const payoutNumerator = await ctfContract.payoutNumerators(position.conditionId, position.outcomeIndex);
                    console.log(`   ✅ Payout numerator for outcome ${position.outcomeIndex}: ${payoutNumerator.toString()}`);
                    console.log(`   ✅ Payout ratio: ${payoutNumerator}/${payoutDenominator}`);
                    
                    // Query collection IDs for different parentCollectionId values
                    console.log(`\n🔍 Querying collection IDs for different scenarios:`);
                    
                    const nullParentCollection = '0x0000000000000000000000000000000000000000000000000000000000000000';
                    const indexSets = position.outcomeIndex === 0 ? [1] : [2];
                    
                    for (const indexSet of indexSets) {
                        try {
                            // Query with null parent collection (most common case)
                            const collectionId = await ctfContract.getCollectionId(
                                nullParentCollection,
                                position.conditionId,
                                indexSet
                            );
                            
                            console.log(`   Collection ID for parentCollection=null, indexSet=${indexSet}: ${collectionId}`);
                            
                            // Check if this matches our asset
                            if (collectionId.toLowerCase() === position.asset.toLowerCase()) {
                                console.log(`   ✅ MATCH! This collection ID matches our position asset`);
                                console.log(`   ✅ Correct parameters: parentCollectionId=null, indexSet=${indexSet}`);
                            } else {
                                console.log(`   ❌ No match with our asset ${position.asset}`);
                            }
                            
                        } catch (collectionError) {
                            console.log(`   ❌ Error querying collection for indexSet ${indexSet}: ${collectionError.message}`);
                        }
                    }
                }
                
            } catch (oracleError) {
                console.log(`   ❌ Error checking oracle status: ${oracleError.message}`);
                console.log(`   ❌ This position is NOT ready for redemption (oracle hasn't resolved)`);
            }
            
            console.log('\n' + '─'.repeat(80) + '\n');
        }
        
        console.log('🎉 Collection ID query completed!');
        
    } catch (error) {
        console.error('❌ Error in queryCollectionInfo:', error);
    } finally {
        // Explicitly exit to prevent hanging
        process.exit(0);
    }
}

// Run the query
queryCollectionInfo().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});
