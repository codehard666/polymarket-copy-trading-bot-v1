const { ethers } = require('ethers');
const { ClobClient, OrderType, Side } = require('@polymarket/clob-client');
require('dotenv').config();

// Configuration from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PROXY_WALLET = process.env.PROXY_WALLET;
const POLYMARKET_EXCHANGE_ADDRESS = process.env.POLYMARKET_EXCHANGE_ADDRESS || '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e';
const CLOB_HTTP_URL = process.env.CLOB_HTTP_URL || 'https://clob.polymarket.com';
const CLOB_WS_URL = process.env.CLOB_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws';

// Create a new CLOB client with API key authentication
async function createClobClient() {
    console.log('🔄 Creating Polymarket CLOB client...');
    
    try {
        // Use same approach as in src/services/createClobClient.ts
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        
        console.log('📝 Creating client with wallet:', wallet.address);
        
        // Create initial client without API key
        let client = new ClobClient(
            CLOB_HTTP_URL,
            137, // Polygon chain ID
            wallet, // Use wallet directly as signer
            undefined, // No clobAuth initially
            {
                funderAddress: undefined // No funder needed
            }
        );
        
        // Temporarily suppress console.error during API key creation
        console.log('🔑 Requesting API credentials...');
        const originalConsoleError = console.error;
        console.error = function () {};
        
        // Try to create or derive API key
        let creds;
        try {
            creds = await client.createApiKey();
        } catch (createError) {
            console.log('⚠️ Could not create new API key, trying to derive existing key...');
            creds = await client.deriveApiKey();
        } finally {
            // Restore error logging
            console.error = originalConsoleError;
        }
        
        if (creds && creds.key) {
            console.log('✅ API credentials obtained successfully');
            
            // Create new client with API credentials
            client = new ClobClient(
                CLOB_HTTP_URL,
                137,
                wallet,
                creds, // Use obtained credentials
                {
                    funderAddress: undefined // No funder needed
                }
            );
            
            console.log('✅ CLOB client created successfully with API authentication');
        } else {
            console.log('⚠️ Could not obtain API credentials, using unauthenticated client');
        }
        
        return client;
    } catch (error) {
        console.error('❌ Error creating CLOB client:', error);
        throw error; // Re-throw so the main function can handle it
    }
}

// Fetch positions for the wallet
async function fetchPositions(walletAddress) {
    console.log(`🔍 Fetching positions for wallet: ${walletAddress}`);
    
    try {
        // Using native fetch API instead of node-fetch
        const response = await fetch(`https://data-api.polymarket.com/positions?user=${walletAddress}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        
        const positions = await response.json();
        console.log(`📋 Found ${positions.length} positions`);
        return positions;
    } catch (error) {
        console.error('❌ Error fetching positions:', error);
        return [];
    }
}

// Get the order book for a market to determine sell price
async function getOrderBook(clobClient, tokenId) {
    try {
        return await clobClient.getOrderBook(tokenId);
    } catch (error) {
        console.error(`❌ Error getting order book for token ${tokenId}:`, error);
        return { bids: [] };
    }
}

// Find the best bid price for selling
function getBestBidPrice(orderBook) {
    if (!orderBook.bids || orderBook.bids.length === 0) {
        return null;
    }
    
    // Find the highest bid price
    const maxPriceBid = orderBook.bids.reduce((max, bid) => {
        return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
    }, orderBook.bids[0]);
    
    return maxPriceBid;
}

// Sell a position
async function sellPosition(clobClient, position) {
    console.log(`\n🔄 Processing position: ${position.title} (${position.outcome})`);
    console.log(`💰 Current size: ${position.size} tokens`);
    
    try {
        // Get current market prices
        const orderBook = await getOrderBook(clobClient, position.asset);
        const bestBid = getBestBidPrice(orderBook);
        
        if (!bestBid) {
            console.log('❌ No bids available for this position. Cannot sell at this time.');
            return null;
        }
        
        console.log(`📊 Best bid: ${bestBid.price} USDC per token (${bestBid.size} available)`);
        
        // Calculate how much we can sell based on available bids
        const saleAmount = Math.min(position.size, parseFloat(bestBid.size));
        const expectedProceeds = saleAmount * parseFloat(bestBid.price);
        
        console.log(`📈 Selling ${saleAmount} tokens at ${bestBid.price} USDC each`);
        console.log(`💵 Expected proceeds: ~${expectedProceeds.toFixed(6)} USDC`);
        
        try {
            console.log('📤 Creating sell order...');
            
            try {
                // Use same parameters as in the working code from src/test/test.ts
                console.log('🔍 Creating order with correct parameters...');
                
                // Use size instead of amount based on existing working code
                const orderArgs = {
                    side: Side.SELL,
                    tokenID: position.asset,
                    size: saleAmount, // Use size instead of amount
                    price: parseFloat(bestBid.price)
                };
                
                console.log('📝 Order parameters:', orderArgs);
                const signedOrder = await clobClient.createOrder(orderArgs);
                
                if (signedOrder) {
                    console.log('✅ Order created successfully!');
                    console.log('📤 Posting order to exchange...');
                    
                    // Try both FOK and GTC order types
                    try {
                        const response = await clobClient.postOrder(signedOrder, OrderType.FOK);
                        
                        if (response && response.success) {
                            console.log('🎉 Order executed successfully!');
                            console.log(`📝 Order ID: ${response.orderID}`);
                            
                            return {
                                title: position.title,
                                outcome: position.outcome,
                                amountSold: saleAmount,
                                price: parseFloat(bestBid.price),
                                proceeds: expectedProceeds,
                                success: true
                            };
                        } else {
                            // Try again with GTC order type if FOK fails
                            console.log('⚠️ FOK order failed, trying GTC...');
                            const gtcResponse = await clobClient.postOrder(signedOrder, OrderType.GTC);
                            
                            if (gtcResponse && gtcResponse.success) {
                                console.log('🎉 GTC order executed successfully!');
                                console.log(`📝 Order ID: ${gtcResponse.orderID}`);
                                return {
                                    title: position.title,
                                    outcome: position.outcome,
                                    amountSold: saleAmount,
                                    price: parseFloat(bestBid.price),
                                    proceeds: expectedProceeds,
                                    success: true
                                };
                            } else {
                                const errorMsg = gtcResponse && gtcResponse.errorMsg ? gtcResponse.errorMsg : 'Unknown error';
                                console.log('❌ GTC order failed:', errorMsg);
                                return {
                                    title: position.title,
                                    outcome: position.outcome,
                                    success: false,
                                    error: errorMsg || 'No error message received'
                                };
                            }
                        }
                    } catch (postError) {
                        console.error('❌ Error posting order:', postError);
                        return {
                            title: position.title,
                            outcome: position.outcome,
                            success: false,
                            error: postError.message || 'Error posting order'
                        };
                    }
                }
            } catch (orderError) {
                console.error('❌ Order creation error:', orderError);
                
                // If creating the order fails, try the market order approach from src/utils/postOrder.ts
                console.log('🔄 Trying market order approach from copy-trading codebase...');
                
                try {
                    const marketOrderArgs = {
                        side: Side.SELL,
                        tokenID: position.asset,
                        amount: Math.min(saleAmount, 10), // Start with smaller amount
                        price: parseFloat(bestBid.price)
                    };
                    
                    console.log('📝 Market order parameters:', marketOrderArgs);
                    const marketOrder = await clobClient.createMarketOrder(marketOrderArgs);
                    
                    if (marketOrder) {
                        const response = await clobClient.postOrder(marketOrder, OrderType.FOK);
                        
                        if (response && response.success) {
                            console.log('🎉 Market order executed successfully!');
                            return {
                                title: position.title,
                                outcome: position.outcome,
                                amountSold: marketOrderArgs.amount,
                                price: parseFloat(bestBid.price),
                                proceeds: marketOrderArgs.amount * parseFloat(bestBid.price),
                                success: true
                            };
                        }
                    }
                } catch (marketOrderError) {
                    console.error('❌ Market order failed:', marketOrderError);
                }
                
                return {
                    title: position.title,
                    outcome: position.outcome,
                    success: false,
                    error: 'All order creation approaches failed'
                };
            }
        } catch (error) {
            console.error('❌ Error selling position:', error.message || error);
            return {
                title: position.title,
                outcome: position.outcome,
                success: false,
                error: error.message || 'Unknown error'
            };
        }
    } catch (error) {
        console.error('❌ Error processing position:', error.message || error);
        return {
            title: position.title,
            outcome: position.outcome,
            success: false,
            error: error.message || 'Unknown error'
        };
    }
}

// Main function to sell selected positions
async function sellAllPositions() {
    console.log('🚀 Starting Polymarket Position Liquidator');
    console.log('='.repeat(50));
    
    try {
        // Initialize CLOB client
        const clobClient = await createClobClient();
        
        // Get all positions for the wallet
        const positions = await fetchPositions(PROXY_WALLET);
        
        if (positions.length === 0) {
            console.log('❌ No positions found for this wallet.');
            return;
        }
        
        console.log('📋 Available positions to sell:');
        positions.forEach((pos, i) => {
            console.log(`${i + 1}. ${pos.title} - ${pos.outcome} (${pos.size} tokens)`);
        });
        
        // Allow user to select positions by inputting numbers
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const askForPositions = () => {
            return new Promise((resolve) => {
                readline.question('\n📊 Enter the position number(s) to sell (e.g. "1" or "1,3,5"), or "all" for all positions: ', (answer) => {
                    resolve(answer.trim());
                });
            });
        };
        
        const positionInput = await askForPositions();
        readline.close();
        
        let positionsToSell = [];
        if (positionInput.toLowerCase() === 'all') {
            positionsToSell = [...positions];
            console.log('\n⏳ Selling ALL positions. This may take a while...');
        } else {
            const selectedIndices = positionInput
                .split(',')
                .map(num => parseInt(num.trim()) - 1) // Convert to 0-based index
                .filter(idx => idx >= 0 && idx < positions.length); // Ensure indices are valid
                
            if (selectedIndices.length === 0) {
                console.log('❌ No valid positions selected. Exiting.');
                return;
            }
            
            positionsToSell = selectedIndices.map(idx => positions[idx]);
            console.log(`\n⏳ Selling ${positionsToSell.length} selected positions. This may take a while...`);
        }
        
        // Process each selected position
        const results = [];
        for (const position of positionsToSell) {
            const result = await sellPosition(clobClient, position);
            if (result) {
                results.push(result);
            }
            
            // Small delay between orders to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.log('\n📊 Sell results:');
        results.forEach((res, i) => {
            if (res.success) {
                console.log(`${i + 1}. ${res.title} (${res.outcome}): Sold ${res.amountSold} tokens at ${res.price} USDC each, proceeds: ${res.proceeds} USDC`);
            } else {
                console.log(`${i + 1}. ${res.title} (${res.outcome}): ❌ Failed to sell - ${res.error}`);
            }
        });
        
        console.log('✅ Process completed');
    } catch (error) {
        console.error('❌ Error in main process:', error);
    }
}

// Execute the main function
sellAllPositions().catch(console.error);
