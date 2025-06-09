const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PROXY_WALLET = process.env.PROXY_WALLET;

// Polymarket CTF contract
const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const POLYMARKET_CTF_ABI = [
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function balanceOf(address account, uint256 id) view returns (uint256)',
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)'
];

/**
 * Fetches positions from Polymarket API
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
 * Brute force search for the correct parent collection ID
 */
async function findParentCollection() {
    console.log('🔍 Starting parent collection ID discovery...\n');
    
    // Setup provider and wallet
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
    
    // Get positions
    const positions = await getPositions();
    const redeemablePositions = positions.filter(pos => pos.redeemable === true);
    
    if (redeemablePositions.length === 0) {
        console.log('❌ No redeemable positions found');
        return;
    }
    
    console.log(`📊 Found ${redeemablePositions.length} redeemable positions\n`);
    
    // Take the first redeemable position for analysis
    const position = redeemablePositions[0];
    console.log(`🎯 Analyzing position: ${position.title}`);
    console.log(`   Token ID: ${position.asset}`);
    console.log(`   Condition ID: ${position.conditionId}`);
    console.log(`   Outcome Index: ${position.outcomeIndex}`);
    console.log(`   Size: ${position.size} tokens\n`);
    
    const conditionId = position.conditionId;
    const targetTokenId = position.asset;
    const outcomeIndex = position.outcomeIndex;
    const indexSet = outcomeIndex === 0 ? 1 : 2;
    
    console.log(`🔍 Looking for parent collection that produces token ID: ${targetTokenId}`);
    console.log(`   Using index set: ${indexSet} (for outcome ${outcomeIndex})\n`);
    
    // Method 1: Try some common parent collection patterns
    const commonPatterns = [
        '0x0000000000000000000000000000000000000000000000000000000000000000', // Null collection
        conditionId, // Use condition ID as parent
        ethers.utils.keccak256(conditionId), // Hash of condition ID
        ethers.utils.keccak256(ethers.utils.solidityPack(['bytes32'], [conditionId])), // Packed hash
        ethers.utils.keccak256(ethers.utils.solidityPack(['string'], ['polymarket'])), // "polymarket" hash
        ethers.utils.keccak256(ethers.utils.solidityPack(['string'], ['USDC'])), // "USDC" hash
    ];
    
    console.log('🧪 Testing common parent collection patterns...\n');
    
    for (let i = 0; i < commonPatterns.length; i++) {
        const parentCollectionId = commonPatterns[i];
        console.log(`📋 Pattern ${i + 1}: ${parentCollectionId}`);
        
        try {
            const collectionId = await ctfContract.getCollectionId(parentCollectionId, conditionId, indexSet);
            const positionId = ethers.BigNumber.from(collectionId);
            
            console.log(`   Collection ID: ${collectionId}`);
            console.log(`   Position ID: ${positionId.toString()}`);
            console.log(`   Position ID (hex): ${positionId.toHexString()}`);
            
            if (positionId.toString() === targetTokenId || positionId.toHexString().toLowerCase() === targetTokenId.toLowerCase()) {
                console.log(`🎉 FOUND MATCH! Parent collection ID: ${parentCollectionId}\n`);
                return parentCollectionId;
            } else {
                console.log(`   ❌ No match\n`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }
    
    // Method 2: Try to reverse engineer from the token ID
    console.log('🔬 Attempting reverse engineering approach...\n');
    
    // The token ID might be derived from a hash of multiple components
    // Let's try to understand the structure by examining the token ID itself
    const tokenIdBN = ethers.BigNumber.from(targetTokenId);
    const tokenIdHex = tokenIdBN.toHexString();
    
    console.log(`🔍 Token ID analysis:`);
    console.log(`   Decimal: ${tokenIdBN.toString()}`);
    console.log(`   Hex: ${tokenIdHex}`);
    console.log(`   Length: ${tokenIdHex.length} characters`);
    
    // Check if the token ID could be a direct hash
    if (tokenIdHex.length === 66) { // 0x + 64 hex chars = 32 bytes
        console.log(`   ✅ Token ID is 32 bytes - could be a direct hash`);
        
        // Try using the token ID itself as a collection ID to see if we can trace it back
        try {
            const balance = await ctfContract.balanceOf(wallet.address, targetTokenId);
            console.log(`   Token balance: ${balance.toString()}`);
        } catch (error) {
            console.log(`   ❌ Could not check balance: ${error.message}`);
        }
    }
    
    // Method 3: Try market-specific parent collections
    console.log('\n🏪 Trying market-specific approaches...\n');
    
    // Get market information to try market-specific hashes
    try {
        // Try hashing the market title
        const titleHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(position.title));
        console.log(`📋 Market title hash: ${titleHash}`);
        
        const collectionId = await ctfContract.getCollectionId(titleHash, conditionId, indexSet);
        const positionId = ethers.BigNumber.from(collectionId);
        
        console.log(`   Collection ID: ${collectionId}`);
        console.log(`   Position ID: ${positionId.toString()}`);
        
        if (positionId.toString() === targetTokenId) {
            console.log(`🎉 FOUND MATCH with market title hash!`);
            return titleHash;
        }
    } catch (error) {
        console.log(`   ❌ Market title approach failed: ${error.message}`);
    }
    
    // Method 4: Check if there's a pattern in existing successful redemptions
    console.log('\n📊 Analyzing all redeemable positions for patterns...\n');
    
    for (let i = 0; i < Math.min(3, redeemablePositions.length); i++) {
        const pos = redeemablePositions[i];
        console.log(`🔍 Position ${i + 1}: ${pos.title}`);
        console.log(`   Token: ${pos.asset}`);
        console.log(`   Condition: ${pos.conditionId}`);
        
        // Check if there are any patterns in the token IDs
        const tokenBN = ethers.BigNumber.from(pos.asset);
        const conditionBN = ethers.BigNumber.from(pos.conditionId);
        
        console.log(`   Token/Condition ratio: ${tokenBN.div(conditionBN).toString()}`);
    }
    
    console.log('\n❌ Could not find the correct parent collection ID with standard methods');
    console.log('💡 This suggests Polymarket uses a more complex collection hierarchy');
    console.log('💡 You may need to examine successful redemption transactions on Polygonscan');
    console.log('💡 Or contact Polymarket support for the correct redemption parameters');
    
    return null;
}

// Run the analysis
findParentCollection().catch(console.error);
