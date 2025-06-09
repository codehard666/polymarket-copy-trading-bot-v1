import { ClobClient } from '@polymarket/clob-client';
import { UserPositionInterface } from '../interfaces/User';
import { ethers } from 'ethers';
import { ENV } from '../config/env';
import fetchData from '../utils/fetchData';
import createRpcProvider from '../utils/createRpcProvider';

const PROXY_WALLET = ENV.PROXY_WALLET;
const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045'; // CTF (Conditional Token Framework) contract - correct address for redeemPositions
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC on Polygon
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const RPC_URL = ENV.RPC_URL;
const DEFAULT_MAX_PRIORITY_FEE = '50'; // Increased for faster processing during congestion
const DEFAULT_MAX_FEE = '200'; // Increased for faster processing during congestion
const MAX_RETRIES = 3; // Number of retries for failed transactions
const RETRY_DELAY = 5000; // Delay between retries in milliseconds (5 seconds)
const TRANSACTION_SPACING = 10000; // Time between transactions to avoid rate limiting (10 seconds)
const EXPONENTIAL_BACKOFF = true; // Use exponential backoff for retries
const GAS_LIMIT = 350000; // Increased gas limit from 300000 to avoid out-of-gas errors

/**
 * Sleep for a specified number of milliseconds
 * @param ms Milliseconds to sleep
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
        
        // Set up provider for direct contract interaction using our specialized function
        console.log('🔄 Setting up wallet and provider with ENS disabled...');
        
        // Use the createRpcProvider utility that already handles ENS disabling
        // Using let instead of const to allow reconnection later
        let provider;
        try {
            provider = await createRpcProvider(RPC_URL);
            
            // Verify the provider's ENS configuration
            const network = await provider.getNetwork();
            console.log(`📡 Connected to network: ${network.name} (chainId: ${network.chainId})`);
            console.log(`📚 ENS address: ${network.ensAddress}`);
        } catch (providerError) {
            console.error('❌ Error initializing provider:', providerError);
            
            // Try a simpler fallback approach
            console.log('🔄 Trying fallback provider initialization...');
            provider = new ethers.providers.JsonRpcProvider(RPC_URL);
            
            // No attempt to modify provider._network
            console.log('⚠️ Using fallback provider without ENS configuration');
        }
        
        // Create wallet with the provider - using let to allow reconnection
        let wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        
        // Minimal ABI for redeemPositions function - the correct Polymarket CTF function
        const POLYMARKET_CTF_ABI = [
            'function redeemPositions(address collateralToken, bytes32 parentCollectionId, uint256 conditionId, uint256[] indexSets) external',
            'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
            'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)'
        ];
        
        // Create contract instance with the corrected ABI that treats the first parameter as uint256 tokenId
        // Using let to allow reconnection
        let ctfExchange = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
        
        console.log(`📍 Wallet address: ${wallet.address}`);
        console.log(`🏪 CTF contract: ${POLYMARKET_CTF_ADDRESS}`);
        console.log(`🛠 Using redeemPositions function with correct Polymarket CTF parameters`);
        
        // Gas settings
        const maxPriorityFeePerGas = ethers.utils.parseUnits(DEFAULT_MAX_PRIORITY_FEE, 'gwei');
        const maxFeePerGas = ethers.utils.parseUnits(DEFAULT_MAX_FEE, 'gwei');
        
        console.log(`⛽ Gas settings: Max Priority Fee: ${ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei')} GWEI, Max Fee: ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} GWEI (no gas limit set - auto estimation)`);

        console.log('\n🔧 Setup complete, about to start claiming process...');
        console.log(`   Total redeemable positions: ${redeemablePositions.length}`);
        console.log(`   Contract address: ${POLYMARKET_CTF_ADDRESS}`);
        console.log(`   Wallet address: ${wallet.address}`);

        let totalSuccessful = 0;
        let totalFailed = 0;
        
        console.log('\n🔄 Starting to process redeemable positions...');
        
        // Claim each position with retries and spacing between transactions
        for (const position of redeemablePositions) {
            console.log(`\n🔍 Processing position: ${position.title || position.conditionId}`);
            console.log(`   Position object:`, JSON.stringify(position, null, 2));
            
            let retries = 0;
            let success = false;
            
            while (retries < MAX_RETRIES && !success) {
                try {
                    if (retries > 0) {
                        const backoffMultiplier = EXPONENTIAL_BACKOFF ? Math.pow(2, retries - 1) : 1;
                        const delayTime = RETRY_DELAY * backoffMultiplier;
                        
                        console.log(`\n🔄 Retry ${retries}/${MAX_RETRIES} for market: ${position.title || position.conditionId}`);
                        console.log(`⏱️ Waiting ${delayTime/1000} seconds before retry...`);
                        
                        // Wait before retrying with exponential backoff
                        await sleep(delayTime);
                    } else {
                        console.log(`\n🔄 Claiming position for market: ${position.title || position.conditionId}`);
                    }
                    
                    console.log(`   Token: ${position.asset}`);
                    console.log(`   Amount: ${position.size} tokens`);
                    
                    // redeemPositions function claims all tokens for the condition automatically
                    // No need to specify amount - it will redeem the full balance
                    console.log(`   Note: redeemPositions will claim all tokens for this condition`);
                    
                    // Extract parameters for redeemPositions function
                    const collateralToken = USDC_ADDRESS; // USDC on Polygon
                    const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000'; // Null for Polymarket
                    const conditionId = position.conditionId; // Use the condition ID from position data
                    
                    // For binary markets, determine index set based on the outcome
                    // outcomeIndex 0 = "No" = index set [1] (binary 0b01)
                    // outcomeIndex 1 = "Yes" = index set [2] (binary 0b10)
                    const indexSets = position.outcomeIndex === 0 ? [1] : [2];
                    
                    console.log(`   Condition ID: ${conditionId}`);
                    console.log(`   Outcome Index: ${position.outcomeIndex} (${position.outcome})`);
                    console.log(`   Collateral Token: ${collateralToken}`);
                    console.log(`   Index Sets: [${indexSets.join(', ')}] (claiming only the winning outcome)`);
                    
                    // Check oracle resolution status before attempting redemption
                    console.log('🔍 Checking oracle resolution status...');
                    try {
                        const payoutDenominator = await ctfExchange.payoutDenominator(conditionId);
                        console.log(`   Payout denominator: ${payoutDenominator.toString()}`);
                        
                        if (payoutDenominator.eq(0)) {
                            console.log(`❌ Oracle has not resolved condition ${conditionId} yet.`);
                            console.log(`❌ Skipping redemption for ${position.title || position.conditionId} - wait for oracle resolution.`);
                            continue;
                        }
                        
                        // Check the payout for our specific outcome
                        const payoutNumerator = await ctfExchange.payoutNumerators(conditionId, position.outcomeIndex);
                        console.log(`   Payout numerator for outcome ${position.outcomeIndex}: ${payoutNumerator.toString()}`);
                        
                        if (payoutNumerator.eq(0)) {
                            console.log(`❌ No payout for outcome ${position.outcomeIndex} - this outcome lost.`);
                            console.log(`❌ Skipping redemption for ${position.title || position.conditionId} - no winnings to claim.`);
                            continue;
                        }
                        
                        console.log(`✅ Oracle resolved - payout ratio: ${payoutNumerator}/${payoutDenominator}`);
                        
                    } catch (oracleError: any) {
                        console.log(`❌ Error checking oracle status: ${oracleError.message}`);
                        console.log(`❌ Skipping redemption for ${position.title || position.conditionId} - oracle status unclear.`);
                        continue;
                    }
                    
                    console.log(`   Using manual gas limit: ${GAS_LIMIT} (bypassing gas estimation timeout)`);
                    
                    // Before sending, check if the wallet has enough MATIC for gas
                    const balance = await wallet.getBalance();
                    const estimatedGasCost = ethers.BigNumber.from(GAS_LIMIT).mul(maxFeePerGas);
                    console.log(`   Wallet balance: ${ethers.utils.formatEther(balance)} MATIC`);
                    console.log(`   Estimated max gas cost: ${ethers.utils.formatEther(estimatedGasCost)} MATIC`);
                    
                    if (balance.lt(estimatedGasCost)) {
                        console.warn(`⚠️ Warning: Wallet balance may be too low for gas costs!`);
                        console.log(`   Consider adding more MATIC to your wallet for gas fees.`);
                    }
                    
                    // Call redeemPositions function on the contract
                    console.log(`🔄 About to call redeemPositions function on contract...`);
                    let tx: any = null; // Declare tx outside try block for error handling
                    try {
                        console.log(`📞 Calling ctfExchange.redeemPositions with conditionId: ${conditionId}`);
                        
                        tx = await Promise.race([
                            ctfExchange.redeemPositions(
                                collateralToken,
                                parentCollectionId,
                                conditionId,
                                indexSets,
                                {
                                    maxPriorityFeePerGas,
                                    maxFeePerGas,
                                    gasLimit: GAS_LIMIT // Use manual gas limit to bypass timeout
                                }
                            ),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Transaction timeout after 120 seconds')), 120000)
                            )
                        ]) as any;

                        console.log(`📤 Transaction hash: ${tx.hash}`);
                        console.log(`   Polygonscan: https://polygonscan.com/tx/${tx.hash}`);
                        console.log('⏳ Waiting for confirmation...');

                        const receipt = await Promise.race([
                            tx.wait(),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Transaction confirmation timeout after 180 seconds')), 180000)
                            )
                        ]) as any;
                        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
                        console.log(`💰 Successfully claimed position!`);
                        console.log(`   Gas used: ${receipt.gasUsed.toString()} (${(receipt.gasUsed.toNumber() / GAS_LIMIT * 100).toFixed(2)}% of limit)`);

                        success = true;
                        totalSuccessful++;
                    } catch (error) {
                        const err = error as any; // Cast error to 'any' to access its properties
                        console.error(`❌ Transaction failed for condition ID: ${conditionId}`);
                        console.error(`   Error: ${err.message}`);
                        console.error(`   Stack trace: ${err.stack}`);

                        // Check if we have a transaction hash even if confirmation failed
                        if (err.message && err.message.includes('confirmation timeout') && tx && tx.hash) {
                            console.log(`📤 Transaction was submitted with hash: ${tx.hash}`);
                            console.log(`   Polygonscan: https://polygonscan.com/tx/${tx.hash}`);
                            console.log(`   Transaction may still be pending. Check Polygonscan for status.`);
                        }

                        if (err.code === 'INSUFFICIENT_FUNDS') {
                            console.warn('⚠️ Insufficient funds for gas fees. Please add more MATIC to your wallet.');
                        } else if (err.code === 'NETWORK_ERROR') {
                            console.warn('⚠️ Network error encountered. Retrying...');
                        } else if (err.message && err.message.includes('timeout')) {
                            console.warn('⚠️ Transaction or confirmation timeout. This may be due to network congestion.');
                        } else {
                            console.warn('⚠️ Unknown error encountered. Investigate further.');
                        }

                        if (retries >= MAX_RETRIES - 1) {
                            console.warn(`⚠️ Max retries reached for condition ID: ${conditionId}. Skipping this position.`);
                            totalFailed++;
                        }
                    }
                    
                } catch (error: any) {
                    retries++;
                    const errorMessage = error.message || String(error);
                    const errorCode = error.code || '';
                    
                    // More detailed error categorization
                    if (
                        errorMessage.includes('CALL_EXCEPTION') || 
                        errorMessage.includes('execution reverted') ||
                        errorMessage.includes('transaction failed') ||
                        errorCode === 'CALL_EXCEPTION'
                    ) {
                        // Contract error - likely won't succeed with retry
                        console.error(`❌ Contract error for ${position.title || position.conditionId}:`, errorMessage);
                        console.log('⚠️ This appears to be a contract execution error. Position may not be claimable or the contract may be rejecting the transaction.');
                        
                        if (errorMessage.includes('not redeemable') || errorMessage.includes('insufficient balance')) {
                            console.log('   💡 This position might not be truly redeemable or already claimed.');
                            break; // Don't retry as this won't succeed
                        } else {
                            console.log('   Retrying once more with higher gas limit...');
                            // Only try one more time with higher gas
                            if (retries >= 2) break;
                        }
                    } else if (
                        errorMessage.includes('already known') ||
                        errorMessage.includes('nonce too low') ||
                        errorMessage.includes('replacement fee too low')
                    ) {
                        // Transaction state errors - cannot retry with same parameters
                        console.error(`❌ Transaction state error for ${position.title || position.conditionId}:`, errorMessage);
                        console.log('⚠️ This transaction may already be pending or a nonce issue occurred. Skipping retries.');
                        break;
                    } else if (
                        errorMessage.includes('failed response') || 
                        errorMessage.includes('timeout') || 
                        errorMessage.includes('rate limit') ||
                        errorMessage.includes('server error') ||
                        errorMessage.includes('network error') ||
                        errorCode === 'SERVER_ERROR' ||
                        errorCode === 'NETWORK_ERROR' ||
                        errorCode === 'TIMEOUT'
                    ) {
                        // RPC provider issues - good candidate for retry with provider reconnection
                        console.error(`❌ RPC error claiming position for ${position.title || position.conditionId}:`, errorMessage);
                        
                        if (retries < MAX_RETRIES) {
                            console.log(`⏱️ This is an RPC provider issue and will be retried with a fresh provider.`);
                            
                            // Recreate provider and wallet for next attempt
                            try {
                                console.log(`🔄 Reconnecting to RPC provider...`);
                                
                                // Use createRpcProvider which now handles ENS disabling properly
                                provider = await createRpcProvider(RPC_URL);
                                
                                // Create a new wallet with the new provider
                                wallet = new ethers.Wallet(PRIVATE_KEY, provider);
                                
                                // Recreate the contract instance with the new wallet
                                ctfExchange = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
                                
                                console.log(`✅ Successfully reconnected to RPC provider`);
                                
                                // Verify the wallet is working by checking balance
                                const balance = await wallet.getBalance();
                                console.log(`   Wallet balance: ${ethers.utils.formatEther(balance)} MATIC`);
                            } catch (reconnectError) {
                                console.error(`❌ Failed to reconnect to RPC provider:`, reconnectError);
                                console.log(`⚠️ Will attempt to continue with existing provider connection`);
                            }
                            
                            // Apply exponential backoff for RPC errors
                            const backoffMultiplier = Math.pow(2, retries);
                            const backoffDelay = RETRY_DELAY * backoffMultiplier;
                            console.log(`⏱️ Waiting ${backoffDelay/1000} seconds before retry (exponential backoff)...`);
                            await sleep(backoffDelay);
                        } else {
                            console.log('⚠️ Maximum retries reached. Continuing with next position...');
                        }
                    } else if (
                        errorMessage.includes('insufficient funds') ||
                        errorCode === 'INSUFFICIENT_FUNDS'
                    ) {
                        // Gas fee issues
                        console.error(`❌ Insufficient funds error for ${position.title || position.conditionId}:`, errorMessage);
                        console.log('💡 Make sure you have enough MATIC for gas fees on Polygon network.');
                        break; // Don't retry as this won't succeed without adding funds
                    } else {
                        // Unknown error - log and retry
                        console.error(`❌ Unknown error claiming position for ${position.title || position.conditionId}:`, error);
                        
                        if (retries < MAX_RETRIES) {
                            console.log(`⏱️ Will retry ${MAX_RETRIES - retries} more times.`);
                        } else {
                            console.log('⚠️ Maximum retries reached. Continuing with next position...');
                        }
                    }
                }
            }
            
            if (!success) {
                totalFailed++;
            }
            
            // Add a longer delay between positions to avoid rate limiting
            console.log(`⏱️ Waiting ${TRANSACTION_SPACING/1000} seconds before processing next position...`);
            await sleep(TRANSACTION_SPACING);
        }
        
        console.log('\n🎉 Claim all process completed!');
        console.log(`📊 Summary: ${totalSuccessful} positions claimed successfully, ${totalFailed} failed.`);
        
        if (totalFailed > 0) {
            console.log('\n💡 Tips for failed positions:');
            console.log('   1. Try again later as RPC provider issues may be temporary');
            console.log('   2. Increase gas settings if transactions are failing');
            console.log('   3. Check if the positions are truly redeemable (some may have been claimed already)');
            console.log('   4. Ensure your wallet has enough MATIC for gas fees');
        }
        
    } catch (error) {
        console.error('❌ Error in claimAllPositions:', error);
        console.log('⚠️ Continuing with regular trading despite claiming errors...');
    }
}
