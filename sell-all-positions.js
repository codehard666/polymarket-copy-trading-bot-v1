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

// Create a new CLOB client - fixing the signer issue
async function createClobClient() {
    console.log('🔄 Creating Polymarket CLOB client...');
    
    try {
        // Use same approach as in src/services/createClobClient.ts
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        
        // For ClobClient, we need to generate a deterministic API key
        // that will be consistent across restarts
        const apiKey = "529f77d0-cf1a-d991-ad9f-b3bfa6ccea28"; // Using a fixed API key for consistency
        
        // Generate a deterministic passphrase from the private key and API key
        const passphrase = ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes(PRIVATE_KEY)
        ).substring(2); // Remove 0x prefix
        
        console.log('📝 Creating client with wallet:', wallet.address);
        
        const client = new ClobClient({
            httpUrl: CLOB_HTTP_URL,
            wsUrl: CLOB_WS_URL,
            signer: wallet,
            apiKey: apiKey,
            passphrase: passphrase
        });
        
        console.log('✅ CLOB client created successfully');
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
        
        // Create order arguments
        const orderArgs = {
            side: Side.SELL,
            tokenID: position.asset,
            amount: saleAmount,
            price: parseFloat(bestBid.price),
        };
        
        console.log('🚀 Creating market sell order...');
        const signedOrder = await clobClient.createMarketOrder(orderArgs);
        
        console.log('📤 Submitting order...');
        const response = await clobClient.postOrder(signedOrder, OrderType.FOK);
        
        if (response.success) {
            console.log('✅ Sell order executed successfully!');
            console.log(`📝 Order ID: ${response.orderID}`);
            if (response.transactionsHashes && response.transactionsHashes.length) {
                console.log(`🔗 Transaction hash: ${response.transactionsHashes[0]}`);
            }
            return {
                title: position.title,
                outcome: position.outcome,
                amountSold: saleAmount,
                price: parseFloat(bestBid.price),
                proceeds: expectedProceeds,
                success: true
            };
        } else {
            console.log('❌ Sell order failed:', response.errorMsg || 'Unknown error');
            return {
                title: position.title,
                outcome: position.outcome,
                success: false,
                error: response.errorMsg || 'Unknown error'
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
}

// Main function to sell all positions
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
        
        console.log('📋 Positions to sell:');
        positions.forEach((pos, i) => {
            console.log(`${i + 1}. ${pos.title} - ${pos.outcome} (${pos.size} tokens)`);
        });
        
        console.log('\n⏳ Selling all positions. This may take a while...');
        
        // Process each position
        const results = [];
        for (const position of positions) {
            const result = await sellPosition(clobClient, position);
            if (result) results.push(result);
            
            // Small delay between orders to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Print summary
        console.log('\n📊 Sell Operation Summary:');
        console.log('='.repeat(50));
        
        let totalProceeds = 0;
        let successCount = 0;
        
        results.forEach((result, i) => {
            if (result.success) {
                console.log(`✅ ${i + 1}. ${result.title} - ${result.outcome}: Sold ${result.amountSold} at ${result.price} USDC (${result.proceeds.toFixed(6)} USDC)`);
                totalProceeds += result.proceeds;
                successCount++;
            } else {
                console.log(`❌ ${i + 1}. ${result.title} - ${result.outcome}: Failed (${result.error})`);
            }
        });
        
        console.log('='.repeat(50));
        console.log(`📈 Total positions: ${positions.length}`);
        console.log(`✅ Successfully sold: ${successCount}`);
        console.log(`❌ Failed: ${positions.length - successCount}`);
        console.log(`💰 Total proceeds: ~${totalProceeds.toFixed(6)} USDC`);
        console.log('='.repeat(50));
        
        if (successCount < positions.length) {
            console.log('\n💡 Some positions failed to sell. You can:');
            console.log('1. Run this script again to retry');
            console.log('2. Try selling them manually on Polymarket');
            console.log('3. Wait for better market conditions');
        }
        
    } catch (error) {
        console.error('❌ Error in main process:', error);
    }
}

// Run the script
sellAllPositions().catch(console.error);
