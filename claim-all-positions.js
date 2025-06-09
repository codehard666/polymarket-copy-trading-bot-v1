const { ethers } = require('ethers');
require('dotenv').config();
// Using built-in fetch in Node.js 18+

// Configuration from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PROXY_WALLET = process.env.PROXY_WALLET;

// Alternative RPC URLs for Polygon (fallbacks in case of timeouts)
const POLYGON_RPC_URLS = [
    process.env.RPC_URL,
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.network',
    'https://rpc-mainnet.maticvigil.com',
    'https://polygon.llamarpc.com'
].filter(Boolean); // Remove any undefined URLs

// Polymarket CTF (Conditional Token Framework) contract address on Polygon
const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC on Polygon
const POLYMARKET_CTF_ABI = [
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, uint256 conditionId, uint256[] indexSets) external',
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function balanceOf(address account, uint256 id) view returns (uint256)'
];

// Gas price settings from .env or defaults
const DEFAULT_MAX_PRIORITY_FEE = process.env.MAX_PRIORITY_FEE || '30'; 
const DEFAULT_MAX_FEE = process.env.MAX_FEE || '100';

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
 * Claims all redeemable positions (winnings) from resolved markets
 */
async function claimAllPositions(maxPriorityFee = DEFAULT_MAX_PRIORITY_FEE, maxFee = DEFAULT_MAX_FEE) {
    try {
        console.log('🔄 Setting up wallet and provider with ENS disabled...');
        
        // Create provider with fallback logic and ENS disabled
        let provider;
        let providerIndex = 0;
        let wallet;
        let ctfExchange;
        
        const createProvider = (url, timeout = 20000) => {
            const rpcProvider = new ethers.providers.JsonRpcProvider({
                url: url,
                timeout: timeout
            });
            
            // Disable ENS resolution
            rpcProvider.resolveName = async (name) => {
                // If it looks like a token ID (long number), return it as-is
                if (typeof name === 'string' && /^\d+$/.test(name)) {
                    return name;
                }
                // For actual addresses, return as-is
                if (ethers.utils.isAddress(name)) {
                    return name;
                }
                // Throw error for actual ENS name resolution attempts
                throw new Error('ENS resolution disabled');
            };
            
            // Override send method to add timeout and better error handling
            const originalSend = rpcProvider.send.bind(rpcProvider);
            rpcProvider.send = async (method, params) => {
                try {
                    return await Promise.race([
                        originalSend(method, params),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('RPC timeout')), timeout)
                        )
                    ]);
                } catch (error) {
                    // Convert network errors to RPC timeouts for fallback handling
                    if (error.code === 'NETWORK_ERROR' || error.reason === 'could not detect network') {
                        throw new Error('RPC timeout');
                    }
                    throw error;
                }
            };
            
            return rpcProvider;
        };
        
        const getNextProvider = () => {
            if (providerIndex >= POLYGON_RPC_URLS.length) {
                throw new Error('All RPC providers exhausted');
            }
            const url = POLYGON_RPC_URLS[providerIndex++];
            console.log(`📡 Using RPC provider: ${url.includes('infura') ? 'Infura' : new URL(url).hostname}`);
            return createProvider(url);
        };
        
        const initializeProvider = async () => {
            let attempts = 0;
            while (attempts < POLYGON_RPC_URLS.length) {
                try {
                    provider = getNextProvider();
                    
                    // Test the provider with a simple call
                    const network = await Promise.race([
                        provider.getNetwork(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Network detection timeout')), 10000)
                        )
                    ]);
                    
                    console.log(`📡 Connected to network: ${network.name} (chainId: ${network.chainId})`);
                    
                    // Initialize wallet and contract
                    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
                    ctfExchange = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
                    
                    return true;
                } catch (error) {
                    console.log(`⚠️ Provider failed: ${error.message}`);
                    attempts++;
                    if (attempts >= POLYGON_RPC_URLS.length) {
                        throw new Error('All RPC providers failed during initialization');
                    }
                }
            }
        };
        
        await initializeProvider();
        
        // Comprehensive ENS disabling to prevent address resolution attempts
        try {
            const network = await provider.getNetwork();
            console.log(`📡 Connected to network: ${network.name} (chainId: ${network.chainId})`);
            
            // Multiple approaches to disable ENS resolution
            provider._network = { 
                ...network, 
                ensAddress: null,
                _defaultProvider: null 
            };
            
            console.log('🔧 ENS resolution comprehensively disabled');
            console.log(`📚 ENS address after setup: ${provider._network.ensAddress}`);
        } catch (ensError) {
            console.log('⚠️ Could not modify ENS settings:', ensError.message);
            console.log('⚠️ Continuing without ENS support');
        }
        
        // Add retry helper function with robust provider switching
        const retryWithFallback = async (operation, description) => {
            let lastError;
            
            // Try with current provider first, then switch providers if needed
            for (let providerAttempt = 0; providerAttempt < POLYGON_RPC_URLS.length; providerAttempt++) {
                for (let attempt = 1; attempt <= 2; attempt++) { // Reduced attempts per provider
                    try {
                        console.log(`🔄 ${description} (provider ${providerAttempt + 1}/${POLYGON_RPC_URLS.length}, attempt ${attempt}/2)`);
                        return await operation();
                    } catch (error) {
                        lastError = error;
                        console.log(`⚠️ ${description} failed: ${error.message}`);
                        
                        // Check if we should switch provider
                        const shouldSwitchProvider = (
                            error.message.includes('timeout') ||
                            error.message.includes('RPC timeout') ||
                            error.message.includes('could not detect network') ||
                            error.message.includes('NETWORK_ERROR') ||
                            error.code === 'NETWORK_ERROR'
                        );
                        
                        if (shouldSwitchProvider && attempt === 2) {
                            // Try next provider if available
                            if (providerIndex < POLYGON_RPC_URLS.length) {
                                console.log(`🔄 Switching to next RPC provider...`);
                                provider = getNextProvider();
                                wallet = new ethers.Wallet(PRIVATE_KEY, provider);
                                ctfExchange = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
                                break; // Break inner loop to try new provider
                            }
                        }
                        
                        if (attempt < 2) {
                            console.log(`⏳ Waiting 3 seconds before retry...`);
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }
                    }
                }
            }
            
            throw lastError;
        };
        
        // Contract and wallet are already initialized in the provider setup above
        
        console.log(`📍 Wallet address: ${wallet.address}`);
        console.log(`🏪 CTF contract: ${POLYMARKET_CTF_ADDRESS}`);
        
        // Get positions
        console.log('🔍 Fetching positions...');
        const positions = await getPositions();
        
        if (!positions || positions.length === 0) {
            console.log('ℹ️ No positions found to claim.');
            return;
        }
        
        // Filter for positions that are redeemable (resolved markets with winning positions)
        const redeemablePositions = positions.filter(pos => pos.redeemable === true);
        
        if (redeemablePositions.length === 0) {
            console.log('ℹ️ No redeemable positions found. All your markets may still be active or you have no winning positions.');
            return;
        }
        
        console.log(`🎯 Found ${redeemablePositions.length} redeemable positions to claim:`);
        redeemablePositions.forEach((pos, index) => {
            console.log(`  ${index + 1}. ${pos.title} - ${pos.size} tokens, Asset: ${pos.asset}`);
            console.log(`     Outcome: ${pos.outcome}, Outcome Index: ${pos.outcomeIndex}`);
            console.log(`     Condition ID: ${pos.conditionId}`);
        });
        
        // Gas price settings
        const maxPriorityFeePerGas = ethers.utils.parseUnits(maxPriorityFee, 'gwei');
        const maxFeePerGas = ethers.utils.parseUnits(maxFee, 'gwei');
        
        console.log(`⛽ Gas settings: Max Priority Fee: ${ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei')} GWEI, Max Fee: ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} GWEI`);
        
        // Claim each position
        for (const position of redeemablePositions) {
            try {
                console.log(`\n🔄 Claiming position for market: ${position.title}`);
            console.log(`   Token: ${position.asset}`);
            console.log(`   Amount: ${position.size} tokens`);
            
            // redeemPositions function claims all tokens for the condition automatically
            // No need to specify amount - it will redeem the full balance
            console.log(`   Note: redeemPositions will claim all tokens for this condition`);
            
            // Extract parameters for redeemPositions function
            const collateralToken = USDC_ADDRESS; // USDC on Polygon
            const conditionId = position.conditionId; // Use the condition ID from position data
            
            // For binary markets, determine index set based on the outcome
            // outcomeIndex 0 = "No" = index set [1] (binary 0b01)
            // outcomeIndex 1 = "Yes" = index set [2] (binary 0b10)
            const indexSets = position.outcomeIndex === 0 ? [1] : [2];
            
            console.log(`   Condition ID: ${conditionId}`);
            console.log(`   Outcome Index: ${position.outcomeIndex} (${position.outcome})`);
            console.log(`   Collateral Token: ${collateralToken}`);
            console.log(`   Index Sets: [${indexSets.join(', ')}] (claiming only the winning outcome)`);
            
            // Always use the null collection as parent collection ID for Polymarket positions
            const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';
            console.log('🔍 Using null collection as parent collection ID...');
                
                // For each indexSet, get the collection ID and see if it matches our token
                for (const indexSet of indexSets) {
                    const collectionId = await ctfExchange.getCollectionId(parentCollectionId, conditionId, indexSet);
                    console.log(`   Collection ID for index set ${indexSet}: ${collectionId}`);
                    
                    // Check if this collection ID matches our position asset
                    if (collectionId.toLowerCase() === position.asset.toLowerCase()) {
                        console.log(`✅ Found matching collection for asset ${position.asset}`);
                        console.log(`   Using parentCollectionId: ${parentCollectionId} (null collection)`);
                        break;
                    }
                }
                
                // If we didn't find a match with null collection, this token might be from a different collection
                // For Polymarket, most tokens should be from the null collection, so we'll proceed with the default
                
            } catch (collectionError) {
                console.log(`⚠️ Could not query collection information: ${collectionError.message}`);
                console.log(`⚠️ Proceeding with default null parentCollectionId`);
            }
            
            // Check oracle resolution status before attempting redemption
            console.log('🔍 Checking oracle resolution status...');
            let payoutDenominator, payoutNumerator;
            
            try {
                payoutDenominator = await retryWithFallback(
                    (contract) => contract.payoutDenominator(conditionId),
                    'Querying payout denominator'
                );
                
                console.log(`   Payout denominator: ${payoutDenominator.toString()}`);
                
                if (payoutDenominator.eq(0)) {
                    console.log(`❌ Oracle has not resolved condition ${conditionId} yet.`);
                    console.log(`❌ Skipping redemption for ${position.title} - wait for oracle resolution.`);
                    continue;
                }
                
                // Check the payout for our specific outcome
                payoutNumerator = await retryWithFallback(
                    (contract) => contract.payoutNumerators(conditionId, position.outcomeIndex),
                    'Querying payout numerator'
                );
                
                console.log(`   Payout numerator for outcome ${position.outcomeIndex}: ${payoutNumerator.toString()}`);
                
                if (payoutNumerator.eq(0)) {
                    console.log(`❌ No payout for outcome ${position.outcomeIndex} - this outcome lost.`);
                    console.log(`❌ Skipping redemption for ${position.title} - no winnings to claim.`);
                    continue;
                }
                
                console.log(`✅ Oracle resolved - payout ratio: ${payoutNumerator}/${payoutDenominator}`);
                
            } catch (oracleError) {
                console.log(`❌ Error checking oracle status: ${oracleError.message}`);
                console.log(`❌ Skipping redemption for ${position.title} - oracle status unclear.`);
                continue;
            }
            
            // Let's first check if we actually hold tokens for this asset
            try {
                // Create an ERC-1155 contract instance to check token balance
                const erc1155Abi = [
                    'function balanceOf(address account, uint256 id) view returns (uint256)'
                ];
                const tokenContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, erc1155Abi, wallet);
                
                const tokenBalance = await retryWithFallback(
                    () => tokenContract.balanceOf(wallet.address, position.asset),
                    'Checking token balance'
                );
                
                console.log(`   Token balance on CTF contract: ${ethers.utils.formatUnits(tokenBalance, 0)} tokens`);
                
                if (tokenBalance.eq(0)) {
                    console.log(`❌ No tokens found for asset ${position.asset}. Skipping this position.`);
                    continue;
                }
            } catch (balanceError) {
                console.log(`⚠️ Could not check token balance: ${balanceError.message}`);
                console.log('⚠️ Proceeding anyway...');
            }
                
                try {
                    // Submit redemption transaction using the correct redeemPositions function
                    console.log(`🔄 Using manual gas limit: 300000 (bypassing gas estimation timeout)`);
                    const tx = await ctfExchange.redeemPositions(
                        collateralToken,
                        parentCollectionId,
                        conditionId,
                        indexSets,
                        {
                            maxPriorityFeePerGas,
                            maxFeePerGas,
                            gasLimit: 300000 // Use manual gas limit to bypass timeout
                        }
                    );
                    
                    console.log(`📤 Transaction hash: ${tx.hash}`);
                    console.log('⏳ Waiting for confirmation (with timeout handling)...');
                    
                    try {
                        // Wait for transaction confirmation with timeout
                        const receipt = await Promise.race([
                        tx.wait(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
                        )
                    ]);
                    
                    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
                    console.log(`💰 Successfully claimed position!`);
                    
                } catch (confirmError) {
                    if (confirmError.message.includes('timeout')) {
                        console.log(`⚠️ Transaction confirmation timeout - but transaction was submitted!`);
                        console.log(`🔍 Check transaction status at: https://polygonscan.com/tx/${tx.hash}`);
                        console.log(`💡 The transaction may still be processing - check your wallet balance later.`);
                    } else {
                        throw confirmError;
                    }
                }
                
            } catch (error) {
                console.error(`❌ Error claiming position for ${position.title}:`, error);
                console.log('⚠️ Continuing with next position...');
            }
            
            // Add a small delay between transactions
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        console.log('\n🎉 Claim all process completed!');
        
    } catch (error) {
        console.error('❌ Error in claimAllPositions:', error);
        
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.log('💡 Make sure you have enough MATIC for gas fees on Polygon network');
        } else if (error.code === 'NETWORK_ERROR') {
            console.log('💡 Check your RPC URL and internet connection');
        } else if (error.error && error.error.code === -32000) {
            console.log('💡 Transaction underpriced: Try increasing the gas settings');
            console.log(`💡 Minimum required: ${error.error.message}`);
        }
    }
}

// Run based on command line argument
const maxPriorityFee = process.argv[2] || DEFAULT_MAX_PRIORITY_FEE;
const maxFee = process.argv[3] || DEFAULT_MAX_FEE;

claimAllPositions(maxPriorityFee, maxFee);
