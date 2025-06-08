import { ClobClient } from '@polymarket/clob-client';
import { UserPositionInterface } from '../interfaces/User';
import { ethers } from 'ethers';
import { ENV } from '../config/env';
import fetchData from '../utils/fetchData';

const PROXY_WALLET = ENV.PROXY_WALLET;
const POLYMARKET_EXCHANGE_ADDRESS = '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e'; // CTF Exchange
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const RPC_URL = ENV.RPC_URL;
const DEFAULT_MAX_PRIORITY_FEE = '30'; // Default gas settings
const DEFAULT_MAX_FEE = '100';

/**
 * Claims all redeemable positions using direct contract interaction
 * @param clobClient CLOB client instance (not used directly, but kept for interface consistency)
 */
export default async function claimWithClobApi(clobClient: ClobClient) {
    try {
        console.log('🔍 Fetching all claimable positions for your wallet...');
        
        // Get current positions
        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`
        );
        
        if (!my_positions || my_positions.length === 0) {
            console.log('ℹ️ No positions found to claim.');
            return;
        }
        
        // Filter for positions that are redeemable (resolved markets with winning positions)
        const redeemablePositions = my_positions.filter(pos => pos.redeemable === true);
        
        if (redeemablePositions.length === 0) {
            console.log('ℹ️ No redeemable positions found. All your markets may still be active or you have no winning positions.');
            return;
        }
        
        console.log(`🎯 Found ${redeemablePositions.length} redeemable positions to claim:`);
        redeemablePositions.forEach((pos, index) => {
            console.log(`  ${index + 1}. ${pos.title || pos.conditionId} - ${pos.size} tokens, Asset: ${pos.asset}`);
        });
        
        // Set up provider for direct contract interaction
        console.log('🔄 Setting up wallet and provider...');
        
        // Initialize provider with explicit network parameters to disable ENS
        const networkParams = {
            name: 'matic',
            chainId: 137,
            // The _defaultProvider in ethers.js tries to use ENS resolver for the network
            // By providing these explicit settings, we prevent that lookup
            ensAddress: undefined
        };
        
        // Forcefully create provider with network configuration that prevents ENS lookups
        const provider = new ethers.providers.JsonRpcProvider({
            url: RPC_URL,
            skipFetchSetup: true, // Optimization to prevent extra network requests
            throttleLimit: 10     // Increase throttle limit for faster processing
        }, networkParams);
        
        // Force the provider to connect and initialize the network
        await provider.getNetwork();
        
        // Create wallet with the provider
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        
        // Minimal ABI for redeem function with proper types
        const POLYMARKET_CTF_ABI = [
            'function redeem(uint256 _tokenId, uint256 _amount) external'
        ];
        
        // Create contract instance with the ABI that treats the first parameter as uint256
        const ctfExchange = new ethers.Contract(POLYMARKET_EXCHANGE_ADDRESS, POLYMARKET_CTF_ABI, wallet);
        
        console.log(`📍 Wallet address: ${wallet.address}`);
        console.log(`🏪 Exchange contract: ${POLYMARKET_EXCHANGE_ADDRESS}`);
        console.log(`🛠 Using direct contract call with uint256 token ID parameter`);
        
        // Gas settings
        const maxPriorityFeePerGas = ethers.utils.parseUnits(DEFAULT_MAX_PRIORITY_FEE, 'gwei');
        const maxFeePerGas = ethers.utils.parseUnits(DEFAULT_MAX_FEE, 'gwei');
        
        console.log(`⛽ Gas settings: Max Priority Fee: ${ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei')} GWEI, Max Fee: ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} GWEI`);
        
        // Claim each position
        for (const position of redeemablePositions) {
            try {
                console.log(`\n🔄 Claiming position for market: ${position.title || position.conditionId}`);
                console.log(`   Token: ${position.asset}`);
                console.log(`   Amount: ${position.size} tokens`);
                
                // Round down to integer - Polymarket only accepts integer token amounts
                const integerAmount = Math.floor(position.size);
                console.log(`   Amount (integer only): ${integerAmount} tokens`);
                
                if (integerAmount <= 0) {
                    console.log('❌ Position too small to redeem (less than 1 token)');
                    continue;
                }
                
                // Convert token ID to BigNumber for the contract call
                const tokenIdBN = ethers.BigNumber.from(position.asset);
                const amountBN = ethers.BigNumber.from(integerAmount);
                
                console.log(`   Submitting redemption for token ID: ${tokenIdBN}, amount: ${amountBN}`);
                
                // Call redeem function on the contract, explicitly passing tokenId as uint256
                const tx = await ctfExchange.redeem(
                    tokenIdBN,  // Token ID as BigNumber (uint256)
                    amountBN,   // Amount as BigNumber (uint256)
                    {
                        maxPriorityFeePerGas,
                        maxFeePerGas,
                        gasLimit: 300000 // Set an explicit gas limit to avoid gas estimation issues
                    }
                );
                
                console.log(`📤 Transaction hash: ${tx.hash}`);
                console.log('⏳ Waiting for confirmation...');
                
                const receipt = await tx.wait();
                console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
                console.log(`💰 Successfully claimed position!`);
                
            } catch (error) {
                console.error(`❌ Error claiming position for ${position.title || position.conditionId}:`, error);
                console.log('⚠️ Continuing with next position...');
            }
            
            // Add a small delay between transactions
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        console.log('\n🎉 Claim all process completed!');
        
    } catch (error) {
        console.error('❌ Error in claimAllPositions:', error);
        console.log('⚠️ Continuing with regular trading despite claiming errors...');
    }
}
