const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const RPC_URLS = [
    process.env.RPC_URL,
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.network',
    'https://matic-mainnet.chainstacklabs.com',
    'https://polygon-mainnet.public.blastapi.io'
];

const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const WALLET_ADDRESS = process.env.PROXY_WALLET;

const COMPREHENSIVE_CTF_ABI = [
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function balanceOf(address account, uint256 id) view returns (uint256)',
    'function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount) view returns (bytes32)',
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, uint256 conditionId, uint256[] indexSets) external',
    'function getPositionId(address collateralToken, bytes32 collectionId) view returns (uint256)',
    'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external',
    'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external',
    'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
    'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)'
];

// Test data from our known positions
const TEST_POSITIONS = [
    {
        title: "Rangers vs. Nationals",
        conditionId: "0xe7faa8aacdd9ea6eff958cb58669265a011d4669bf46c7a0c1ef64313f81e737",
        outcomeIndex: 1,
        asset: "111137752123540331946429122420982159359094785924958413294592923954977870949311"
    },
    {
        title: "Diamondbacks vs. Reds",
        conditionId: "0xbd378bf3d29449e95da5f1206e7311998a19d255656dea6a938bab3b48949baa",
        outcomeIndex: 1,
        asset: "80475983217976229112534347168636968259474363400916041869060270143151750911917"
    },
    {
        title: "Astros vs. Guardians",
        conditionId: "0x0100791ff80206eeef7e48a44295fed4e38c27a9a51fa1a0fd760f4a1ac72b2f",
        outcomeIndex: 0,
        asset: "24478010573863062609536445468117373076168241103505435818104094452801918436148"
    },
    {
        title: "Marlins vs. Rays",
        conditionId: "0x0595b245b6713afd7a622007b0b1e2c4d69d2f493cc199717c3dc8a91f837f94",
        outcomeIndex: 0,
        asset: "105609130311442576171449460619881682892032174615397588004239045468051202535865"
    }
];

let currentProviderIndex = 0;

function getProvider() {
    const url = RPC_URLS[currentProviderIndex % RPC_URLS.length];
    console.log(`🔗 Using RPC: ${url}`);
    return new ethers.providers.JsonRpcProvider(url);
}

function nextProvider() {
    currentProviderIndex++;
    return getProvider();
}

async function retryWithFallback(operation, description, maxRetries = 3) {
    let lastError;
    let attempts = 0;
    
    for (let providerAttempt = 0; providerAttempt < RPC_URLS.length; providerAttempt++) {
        const provider = getProvider();
        const contract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, COMPREHENSIVE_CTF_ABI, provider);
        
        for (attempts = 0; attempts < maxRetries; attempts++) {
            try {
                console.log(`   ${description} (provider ${providerAttempt + 1}, attempt ${attempts + 1})...`);
                return await operation(contract);
            } catch (error) {
                lastError = error;
                console.log(`   ❌ ${description} failed: ${error.message}`);
                
                if (attempts < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempts + 1)));
                }
            }
        }
        
        console.log(`🔄 Switching to next provider...`);
        nextProvider();
    }
    
    throw lastError;
}

// Token ID analysis functions
function analyzeTokenId(tokenId) {
    console.log(`\n🔍 Analyzing Token ID: ${tokenId}`);
    
    // Convert to hex for analysis
    const tokenHex = ethers.BigNumber.from(tokenId).toHexString();
    console.log(`   Hex representation: ${tokenHex}`);
    console.log(`   Length: ${tokenHex.length} characters (${(tokenHex.length - 2) / 2} bytes)`);
    
    // Try to extract potential components
    const paddedHex = tokenHex.padStart(66, '0'); // Ensure 32 bytes
    console.log(`   Padded to 32 bytes: ${paddedHex}`);
    
    // Split into potential components (16 bytes each for a 32-byte hash)
    const firstHalf = paddedHex.slice(0, 34); // First 16 bytes + '0x'
    const secondHalf = '0x' + paddedHex.slice(34);
    
    console.log(`   First half (16 bytes): ${firstHalf}`);
    console.log(`   Second half (16 bytes): ${secondHalf}`);
    
    return {
        original: tokenId,
        hex: tokenHex,
        padded: paddedHex,
        firstHalf,
        secondHalf
    };
}

async function findParentCollectionByBruteForce(position) {
    console.log(`\n🔍 Brute force search for position: ${position.title}`);
    console.log(`   Condition ID: ${position.conditionId}`);
    console.log(`   Asset ID: ${position.asset}`);
    console.log(`   Outcome Index: ${position.outcomeIndex}`);
    
    // Analyze the token structure
    const tokenAnalysis = analyzeTokenId(position.asset);
    
    // Create systematic parent collection candidates
    const parentCollectionCandidates = [
        // Standard candidates
        '0x0000000000000000000000000000000000000000000000000000000000000000', // null
        USDC_ADDRESS.toLowerCase().replace('0x', '0x000000000000000000000000'), // USDC padded
        '0x0000000000000000000000004d97dcd97ec945f40cf65f87097ace5ea0476045', // CTF contract
        position.conditionId, // condition ID as parent
        
        // Token analysis based candidates
        tokenAnalysis.firstHalf,
        tokenAnalysis.secondHalf,
        
        // Variations of condition ID
        position.conditionId.replace('0x00000000000000000000000000000000', '0x'),
        
        // USDC related variations
        USDC_ADDRESS,
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174000000000000000000000000',
        
        // Other common patterns
        '0x1000000000000000000000000000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000000000000000000000000001',
    ];
    
    console.log(`\n🔄 Testing ${parentCollectionCandidates.length} parent collection candidates...`);
    
    for (let i = 0; i < parentCollectionCandidates.length; i++) {
        const parentCollectionId = parentCollectionCandidates[i];
        console.log(`\n--- Testing candidate ${i + 1}/${parentCollectionCandidates.length} ---`);
        console.log(`Parent Collection ID: ${parentCollectionId}`);
        
        try {
            // Test both possible index sets for binary outcomes
            const indexSets = [1, 2]; // Binary outcomes
            
            for (const indexSet of indexSets) {
                console.log(`   Testing index set: ${indexSet}`);
                
                try {
                    const collectionId = await retryWithFallback(
                        (contract) => contract.getCollectionId(parentCollectionId, position.conditionId, indexSet),
                        `Getting collection ID for index set ${indexSet}`
                    );
                    
                    console.log(`   Collection ID: ${collectionId}`);
                    
                    // Convert collection ID to position ID
                    const positionId = await retryWithFallback(
                        (contract) => contract.getPositionId(USDC_ADDRESS, collectionId),
                        `Getting position ID for collection ${collectionId}`
                    );
                    
                    console.log(`   Position ID: ${positionId.toString()}`);
                    console.log(`   Position ID hex: ${positionId.toHexString()}`);
                    
                    // Check if this matches our target token
                    if (positionId.toString() === position.asset) {
                        console.log(`\n🎉 FOUND MATCH!`);
                        console.log(`   Parent Collection ID: ${parentCollectionId}`);
                        console.log(`   Index Set: ${indexSet}`);
                        console.log(`   Collection ID: ${collectionId}`);
                        console.log(`   Position ID: ${positionId.toString()}`);
                        console.log(`   Matches target: ${position.asset}`);
                        
                        return {
                            parentCollectionId,
                            indexSet,
                            collectionId,
                            positionId: positionId.toString()
                        };
                    }
                } catch (error) {
                    console.log(`   ❌ Error with index set ${indexSet}: ${error.message}`);
                }
            }
        } catch (error) {
            console.log(`   ❌ Error with parent collection ${parentCollectionId}: ${error.message}`);
        }
    }
    
    console.log(`\n❌ No matching parent collection found for position ${position.title}`);
    return null;
}

async function verifyTokenBalance(tokenId) {
    console.log(`\n🔍 Verifying token balance for: ${tokenId}`);
    
    try {
        const balance = await retryWithFallback(
            (contract) => contract.balanceOf(WALLET_ADDRESS, tokenId),
            `Checking token balance`
        );
        
        console.log(`   Balance: ${balance.toString()} tokens`);
        return balance;
    } catch (error) {
        console.log(`   ❌ Error checking balance: ${error.message}`);
        return null;
    }
}

async function testRedemptionParameters(parentCollectionId, conditionId, indexSets) {
    console.log(`\n🧪 Testing redemption parameters:`);
    console.log(`   Parent Collection: ${parentCollectionId}`);
    console.log(`   Condition ID: ${conditionId}`);
    console.log(`   Index Sets: [${indexSets.join(', ')}]`);
    
    try {
        // This is a dry-run - we'll use staticCall to test if the function would work
        // without actually sending a transaction
        const provider = getProvider();
        const contract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, COMPREHENSIVE_CTF_ABI, provider);
        
        // Create a temporary wallet for testing (won't actually send transaction)
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const contractWithSigner = contract.connect(wallet);
        
        console.log(`   Testing with staticCall...`);
        
        // Use callStatic to simulate the transaction without sending it
        await contractWithSigner.callStatic.redeemPositions(
            USDC_ADDRESS,
            parentCollectionId,
            conditionId,
            indexSets
        );
        
        console.log(`   ✅ Static call succeeded - parameters should work!`);
        return true;
    } catch (error) {
        console.log(`   ❌ Static call failed: ${error.message}`);
        
        // Parse the error to understand why it failed
        if (error.message.includes('insufficient balance')) {
            console.log(`   💡 Error indicates insufficient balance - but parameters might be correct`);
        } else if (error.message.includes('invalid parent collection')) {
            console.log(`   💡 Error indicates invalid parent collection ID`);
        } else if (error.message.includes('not redeemable')) {
            console.log(`   💡 Error indicates position not redeemable (oracle not resolved?)`);
        }
        
        return false;
    }
}

async function main() {
    console.log('🔍 Advanced Collection Analysis for Polymarket Redemption\n');
    console.log(`Wallet Address: ${WALLET_ADDRESS}`);
    console.log(`CTF Contract: ${POLYMARKET_CTF_ADDRESS}`);
    console.log(`USDC Address: ${USDC_ADDRESS}\n`);
    
    for (const position of TEST_POSITIONS) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Processing Position: ${position.title}`);
        console.log(`${'='.repeat(80)}`);
        
        // First verify we have the token
        const balance = await verifyTokenBalance(position.asset);
        if (!balance || balance.eq(0)) {
            console.log(`⚠️ No balance found for token ${position.asset}, skipping...`);
            continue;
        }
        
        // Try to find the correct parent collection
        const result = await findParentCollectionByBruteForce(position);
        
        if (result) {
            console.log(`\n🎯 Found correct parameters for ${position.title}:`);
            console.log(`   Parent Collection ID: ${result.parentCollectionId}`);
            console.log(`   Index Set: ${result.indexSet}`);
            console.log(`   Collection ID: ${result.collectionId}`);
            
            // Test if redemption would work with these parameters
            await testRedemptionParameters(
                result.parentCollectionId,
                position.conditionId,
                [result.indexSet]
            );
        }
    }
    
    console.log('\n🏁 Analysis complete!');
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
    process.exit(1);
});

if (require.main === module) {
    main().catch(console.error);
}
