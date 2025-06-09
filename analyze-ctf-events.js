const ethers = require('ethers');

// Multiple RPC providers for fallback
const RPC_PROVIDERS = [
    'https://polygon-mainnet.infura.io/v3/90ee27dc8b934739ba9a55a075229744',
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.network',
    'https://matic-mainnet.chainstacklabs.com',
    'https://polygon-mainnet.g.alchemy.com/v2/demo'
];

const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';  // Checksummed address
const WALLET_ADDRESS = '0x742d35Cc6634C0532925a3b8D9A7C0e1a4ccAE1f';

// CTF ABI - focusing on events and redemption functions
const CTF_ABI = [
    "function balanceOf(address account, uint256 id) view returns (uint256)",
    "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external",
    "function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)",
    "function payoutDenominator(bytes32 conditionId) view returns (uint256)",
    "function payoutNumerator(bytes32 conditionId, uint256 index) view returns (uint256)",
    
    // Events
    "event PositionSplit(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)",
    "event PositionsMerge(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)",
    "event PayoutRedemption(address indexed redeemer, address indexed collateralToken, bytes32 indexed parentCollectionId, bytes32 conditionId, uint256[] indexSets, uint256 payout)"
];

// USDC contract address on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

async function createRpcProvider() {
    const rpcUrls = [
        process.env.RPC_URL,
        'https://polygon-rpc.com',
        'https://rpc-mainnet.matic.network',
        'https://matic-mainnet.chainstacklabs.com',
        'https://polygon-mainnet.g.alchemy.com/v2/demo'
    ].filter(url => url && url.trim() !== '');

    for (const url of rpcUrls) {
        try {
            console.log(`🔗 Attempting to connect to: ${url}`);
            const provider = new ethers.providers.JsonRpcProvider(url);
            
            // Test the connection
            await provider.getNetwork();
            console.log(`✅ Successfully connected to: ${url}`);
            return provider;
        } catch (error) {
            console.log(`❌ Failed to connect to ${url}: ${error.message}`);
        }
    }
    
    throw new Error('❌ All RPC providers failed');
}

// Our redeemable positions
const positions = [
    {
        title: "Rangers vs. Nationals",
        conditionId: "0xe7faa8aacdd9ea6eff958cb58669265a011d4669bf46c7a0c1ef64313f81e737",
        outcomeIndex: 1,
        tokenId: "111137752123540331946429122420982159359094785924958413294592923954977870949311"
    },
    {
        title: "Diamondbacks vs. Reds",
        conditionId: "0xbd378bf3d29449e95da5f1206e7311998a19d255656dea6a938bab3b48949baa",
        outcomeIndex: 1,
        tokenId: "80475983217976229112534347168636968259474363400916041869060270143151750911917"
    },
    {
        title: "Astros vs. Guardians",
        conditionId: "0x0100791ff80206eeef7e48a44295fed4e38c27a9a51fa1a0fd760f4a1ac72b2f",
        outcomeIndex: 0,
        tokenId: "24478010573863062609536445468117373076168241103505435818104094452801918436148"
    },
    {
        title: "Marlins vs. Rays",
        conditionId: "0x0595b245b6713afd7a622007b0b1e2c4d69d2f493cc199717c3dc8a91f837f94",
        outcomeIndex: 0,
        tokenId: "105609130311442576171449460619881682892032174615397588004239045468051202535865"
    },
    {
        title: "Phillies vs. Pirates",
        conditionId: "0xc92802a649d3552c1e9249515088fded42376f3504673d4dbdd5780c6bc2fb8d",
        outcomeIndex: 0,
        tokenId: "84671607506457489954360562215735796839998723516467292262229181252204477935650"
    },
    {
        title: "Dodgers vs. Cardinals",
        conditionId: "0x35f42c4455dda828715972aff7099b8114b59b875fbc7298896e711490f289b9",
        outcomeIndex: 0,
        tokenId: "111336622919994696157256590756144927974442096568874706559424017134153360834659"
    }
];

// Utility function to split block ranges into smaller chunks
const CHUNK_SIZE = 2000; // Number of blocks per chunk
async function getBlockRangeChunks(provider, startBlock, endBlock) {
    const chunks = [];
    for (let from = startBlock; from < endBlock; from += CHUNK_SIZE) {
        const to = Math.min(from + CHUNK_SIZE - 1, endBlock);
        chunks.push({ from, to });
    }
    return chunks;
}

// Function to fetch events with retries and chunking
async function getEventsWithRetry(contract, eventName, filter, startBlock, endBlock, maxRetries = 3) {
    const chunks = await getBlockRangeChunks(contract.provider, startBlock, endBlock);
    const allEvents = [];
    
    for (const chunk of chunks) {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                console.log(`📦 Fetching ${eventName} events for blocks ${chunk.from}-${chunk.to}`);
                const events = await contract.queryFilter(
                    contract.filters[eventName](),
                    chunk.from,
                    chunk.to
                );
                allEvents.push(...events);
                break;
            } catch (error) {
                retries++;
                if (retries === maxRetries) {
                    console.error(`❌ Failed to fetch events after ${maxRetries} retries:`, error);
                    throw error;
                }
                console.log(`⚠️ Retry ${retries}/${maxRetries} for blocks ${chunk.from}-${chunk.to}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * retries)); // Exponential backoff
            }
        }
    }
    
    return allEvents;
}

async function analyzeCTFEvents() {
    try {
        console.log('🔍 Analyzing CTF events to find parent collection patterns...\n');
        
        const provider = await createRpcProvider();
        const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);
        
        // Get current block and calculate start block (e.g., 7 days ago)
        const currentBlock = await provider.getBlockNumber();
        const blocksPerDay = 24 * 60 * 60 / 2; // Approx blocks per day on Polygon
        const startBlock = currentBlock - (blocksPerDay * 7);
        
        console.log(`📊 Fetching events from block ${startBlock} to ${currentBlock}`);
        
        // Fetch PositionSplit events with retry and chunking
        const splitEvents = await getEventsWithRetry(
            ctf,
            'PositionSplit',
            {},
            startBlock,
            currentBlock
        );
        
        // For each position in our list, find relevant split events
        for (const position of positions) {
            console.log(`\n🎯 Analyzing position: ${position.title}`);
            const relevantSplits = splitEvents.filter(event => 
                event.args.conditionId === position.conditionId
            );
            
            if (relevantSplits.length > 0) {
                console.log(`Found ${relevantSplits.length} relevant split events`);
                const parentCollectionId = relevantSplits[0].args.parentCollectionId;
                position.parentCollectionId = parentCollectionId;
                console.log(`Parent Collection ID: ${parentCollectionId}`);
            } else {
                console.log('⚠️ No split events found for this position');
            }
        }
        
        // Log the updated positions with parent collection IDs
        console.log('\n📝 Updated positions with parent collection IDs:');
        console.log(JSON.stringify(positions, null, 2));
        
        return positions;
    } catch (error) {
        console.error('❌ Error analyzing CTF events:', error);
        throw error;
    }
}

analyzeCTFEvents();
