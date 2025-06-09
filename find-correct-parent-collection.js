const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const RPC_URL = process.env.RPC_URL;
const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const POLYMARKET_CTF_ABI = [
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function balanceOf(address account, uint256 id) view returns (uint256)',
    'function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount) view returns (bytes32)',
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)'
];

// Test data from your output
const CONDITION_ID = '0x00000000000000000000000000000000000000000000000000000000017d9bc7';
const TARGET_TOKEN_ID = '104411547841791877252227935410049230769909951522603517050502627610163580155198';
const TARGET_TOKEN_HEX = '0xe6d6d782936004f99414f49fdce286c785d806f03db6d2f90bba44872ff6b53e';

// Common parent collection IDs to try
const PARENT_COLLECTION_CANDIDATES = [
    '0x0000000000000000000000000000000000000000000000000000000000000000', // null collection (already tested)
    USDC_ADDRESS.toLowerCase().replace('0x', '0x000000000000000000000000'), // USDC as parent
    '0x0000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC padded
    CONDITION_ID, // Condition ID itself
    '0x0000000000000000000000004d97dcd97ec945f40cf65f87097ace5ea0476045', // CTF contract as parent
];

async function findCorrectParentCollection() {
    console.log('🔍 Searching for correct parent collection ID...\n');
    
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, provider);
    
    console.log(`Target token ID: ${TARGET_TOKEN_ID}`);
    console.log(`Target token hex: ${TARGET_TOKEN_HEX}\n`);
    
    // Try each parent collection candidate
    for (let i = 0; i < PARENT_COLLECTION_CANDIDATES.length; i++) {
        const parentCollectionId = PARENT_COLLECTION_CANDIDATES[i];
        console.log(`\n--- Testing Parent Collection ${i + 1}/${PARENT_COLLECTION_CANDIDATES.length} ---`);
        console.log(`Parent Collection ID: ${parentCollectionId}`);
        
        try {
            // Test both outcome indices (0 and 1) with their corresponding index sets
            for (let outcomeIndex = 0; outcomeIndex <= 1; outcomeIndex++) {
                const indexSet = outcomeIndex === 0 ? 1 : 2; // 0 -> indexSet 1, 1 -> indexSet 2
                
                const collectionId = await ctfContract.getCollectionId(
                    parentCollectionId,
                    CONDITION_ID,
                    indexSet
                );
                
                const collectionIdDecimal = ethers.BigNumber.from(collectionId).toString();
                
                console.log(`  Outcome ${outcomeIndex} (indexSet=${indexSet}):`);
                console.log(`    Collection ID: ${collectionId}`);
                console.log(`    Collection ID (decimal): ${collectionIdDecimal}`);
                
                // Check if this matches our target token
                if (collectionIdDecimal === TARGET_TOKEN_ID) {
                    console.log(`\n🎉 MATCH FOUND!`);
                    console.log(`✅ Parent Collection ID: ${parentCollectionId}`);
                    console.log(`✅ Outcome Index: ${outcomeIndex}`);
                    console.log(`✅ Index Set: ${indexSet}`);
                    console.log(`✅ Collection ID: ${collectionId}`);
                    return {
                        parentCollectionId,
                        outcomeIndex,
                        indexSet,
                        collectionId
                    };
                }
            }
        } catch (error) {
            console.log(`  ❌ Error testing parent collection: ${error.message}`);
        }
    }
    
    console.log('\n❌ No match found with standard parent collection candidates');
    console.log('\n🔍 Trying reverse engineering approach...');
    
    // Reverse engineering: try to derive parent collection from the token ID
    await reverseEngineerParentCollection(ctfContract);
    
    return null;
}

async function reverseEngineerParentCollection(ctfContract) {
    console.log('\n--- Reverse Engineering Approach ---');
    
    // The collection ID is calculated as keccak256(abi.encodePacked(parentCollectionId, conditionId, indexSet))
    // We know the collection ID and need to find the parent collection
    
    // Try some educated guesses based on common Polymarket patterns
    const educatedGuesses = [
        // Try variations of USDC address formatting
        '0x' + USDC_ADDRESS.toLowerCase().slice(2).padStart(64, '0'),
        '0x' + USDC_ADDRESS.toLowerCase().slice(2).padEnd(64, '0'),
        
        // Try CTF contract address
        '0x' + POLYMARKET_CTF_ADDRESS.toLowerCase().slice(2).padStart(64, '0'),
        
        // Try some common Polymarket collection IDs (these are examples)
        '0x323b5d4c32345ced77393b3530b1eed0f346429d',
        '0x4d97dcd97ec945f40cf65f87097ace5ea0476045',
        
        // Try hash of USDC address
        ethers.utils.keccak256(USDC_ADDRESS),
        
        // Try combination of common identifiers
        ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [USDC_ADDRESS])),
    ];
    
    console.log(`\nTrying ${educatedGuesses.length} educated guesses...`);
    
    for (let i = 0; i < educatedGuesses.length; i++) {
        const parentCollectionId = educatedGuesses[i];
        console.log(`\n  Guess ${i + 1}: ${parentCollectionId}`);
        
        try {
            for (let outcomeIndex = 0; outcomeIndex <= 1; outcomeIndex++) {
                const indexSet = outcomeIndex === 0 ? 1 : 2;
                
                const collectionId = await ctfContract.getCollectionId(
                    parentCollectionId,
                    CONDITION_ID,
                    indexSet
                );
                
                const collectionIdDecimal = ethers.BigNumber.from(collectionId).toString();
                
                if (collectionIdDecimal === TARGET_TOKEN_ID) {
                    console.log(`\n🎉 REVERSE ENGINEERING SUCCESS!`);
                    console.log(`✅ Parent Collection ID: ${parentCollectionId}`);
                    console.log(`✅ Outcome Index: ${outcomeIndex}`);
                    console.log(`✅ Index Set: ${indexSet}`);
                    console.log(`✅ Collection ID: ${collectionId}`);
                    
                    return {
                        parentCollectionId,
                        outcomeIndex,
                        indexSet,
                        collectionId
                    };
                }
            }
        } catch (error) {
            console.log(`    ❌ Error: ${error.message}`);
        }
    }
    
    console.log('\n❌ Reverse engineering also failed');
    console.log('\n💡 Suggestions:');
    console.log('1. Check Polymarket documentation for collection ID structure');
    console.log('2. Look at successful redemption transactions on Polygonscan');
    console.log('3. Contact Polymarket support for collection ID format');
    console.log('4. Try analyzing the token transfer events to understand the hierarchy');
}

// Additional function to analyze the token structure
async function analyzeTokenStructure() {
    console.log('\n--- Analyzing Token Structure ---');
    
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    
    // Look at the target token ID in different formats
    console.log(`Target token ID: ${TARGET_TOKEN_ID}`);
    console.log(`Target token hex: ${TARGET_TOKEN_HEX}`);
    console.log(`Target token length: ${TARGET_TOKEN_HEX.length} characters`);
    
    // Try to extract meaningful parts from the token ID
    const tokenIdBigNum = ethers.BigNumber.from(TARGET_TOKEN_ID);
    const tokenIdHex = tokenIdBigNum.toHexString();
    
    console.log(`\nToken ID breakdown:`);
    console.log(`  Full hex: ${tokenIdHex}`);
    console.log(`  First 32 bytes: ${tokenIdHex.slice(0, 66)}`);
    if (tokenIdHex.length > 66) {
        console.log(`  Last part: ${tokenIdHex.slice(66)}`);
    }
    
    // Check if any part of the token ID matches known addresses
    const tokenIdStr = tokenIdHex.replace('0x', '');
    console.log(`\nLooking for address patterns in token ID...`);
    
    // Check for USDC address pattern
    const usdcPattern = USDC_ADDRESS.replace('0x', '').toLowerCase();
    if (tokenIdStr.toLowerCase().includes(usdcPattern)) {
        console.log(`✅ Found USDC address pattern in token ID`);
    }
    
    // Check for CTF contract pattern
    const ctfPattern = POLYMARKET_CTF_ADDRESS.replace('0x', '').toLowerCase();
    if (tokenIdStr.toLowerCase().includes(ctfPattern)) {
        console.log(`✅ Found CTF contract pattern in token ID`);
    }
    
    // Check for condition ID pattern
    const conditionPattern = CONDITION_ID.replace('0x', '').toLowerCase();
    if (tokenIdStr.toLowerCase().includes(conditionPattern)) {
        console.log(`✅ Found condition ID pattern in token ID`);
    }
}

async function main() {
    try {
        console.log('🔍 Starting comprehensive parent collection search...\n');
        
        // First analyze the token structure
        await analyzeTokenStructure();
        
        // Then try to find the correct parent collection
        const result = await findCorrectParentCollection();
        
        if (result) {
            console.log('\n🎉 SUCCESS! Found the correct parent collection.');
            console.log('\nYou can now update your claim script with these parameters:');
            console.log(`const parentCollectionId = '${result.parentCollectionId}';`);
            console.log(`// This will work for outcome ${result.outcomeIndex} with indexSet ${result.indexSet}`);
        } else {
            console.log('\n❌ Could not find the correct parent collection ID.');
            console.log('This might require deeper analysis of Polymarket\'s token structure.');
        }
        
    } catch (error) {
        console.error('❌ Error in main:', error);
    }
}

main();
