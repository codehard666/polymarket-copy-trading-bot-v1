const { ethers } = require('ethers');
require('dotenv').config();
const fetch = require('node-fetch');

// Configuration from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PROXY_WALLET = process.env.PROXY_WALLET;

// Polymarket CTF Exchange contract address on Polygon
const POLYMARKET_EXCHANGE_ADDRESS = '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e';
const POLYMARKET_CTF_ABI = [
    'function redeem(address _tokenAddress, uint256 _amount) external'
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
        console.log('🔄 Setting up wallet and provider...');
        
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const ctfExchange = new ethers.Contract(POLYMARKET_EXCHANGE_ADDRESS, POLYMARKET_CTF_ABI, wallet);
        
        console.log(`📍 Wallet address: ${wallet.address}`);
        console.log(`🏪 Exchange contract: ${POLYMARKET_EXCHANGE_ADDRESS}`);
        
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
                
                // Create the amount with proper formatting (convert to wei/atomic units)
                const amount = ethers.utils.parseUnits(position.size.toString(), 0);
                
                // Submit redemption transaction
                const tx = await ctfExchange.redeem(
                    position.asset, 
                    amount,
                    {
                        maxPriorityFeePerGas,
                        maxFeePerGas
                    }
                );
                
                console.log(`📤 Transaction hash: ${tx.hash}`);
                console.log('⏳ Waiting for confirmation...');
                
                const receipt = await tx.wait();
                console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
                console.log(`💰 Successfully claimed position!`);
                
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
