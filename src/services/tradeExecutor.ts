import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';
import fetchData from '../utils/fetchData';
import spinner from '../utils/spinner';
import getMyBalance from '../utils/getMyBalance';
import postOrder from '../utils/postOrder';
import { ethers } from 'ethers';
import { checkAllowance as fetchRpcAllowance, clearAllowanceCache } from '../utils/rpcHelper';

const USER_ADDRESS = ENV.USER_ADDRESS;
const RETRY_LIMIT = ENV.RETRY_LIMIT;
const PROXY_WALLET = ENV.PROXY_WALLET;
const POLYMARKET_EXCHANGE_ADDRESS = '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e'; // CTF Exchange

let temp_trades: UserActivityInterface[] = [];

const UserActivity = getUserActivityModel(USER_ADDRESS);

const readTempTrade = async () => {
    // First, let's check all recent trades for diagnostic purposes
    const allRecentTrades = await UserActivity.find({ 
        type: 'TRADE',
        timestamp: { $gt: Math.floor(Date.now()/1000) - 3600 } // Last hour
    }).sort({ timestamp: -1 }).limit(20).exec();
    
    console.log(`📊 Recent DB trades (last hour): ${allRecentTrades.length}`);
    
    if (allRecentTrades.length > 0 && allRecentTrades[0]?.timestamp) {
        console.log(`📈 Most recent trade: ${new Date(allRecentTrades[0].timestamp * 1000).toISOString()}`);
        console.log(`🔍 Processing status: ${allRecentTrades.filter(t => t.bot === true).length} processed, ${allRecentTrades.filter(t => t.bot !== true).length} pending`);
    }
    
    // Now get trades that need processing
    temp_trades = (
        await UserActivity.find({
            $and: [
                { type: 'TRADE' }, 
                { bot: { $ne: true } }, // Not executed yet
                { 
                    $or: [
                        { botExcutedTime: { $lt: RETRY_LIMIT } }, // Haven't exceeded retry limit
                        { botExcutedTime: { $exists: false } }    // Or no retry count yet
                    ]
                }
            ],
        })
        .sort({ timestamp: 1 }) // Process oldest first
        .limit(10) // Process up to 10 trades at a time
        .exec()
    ).map((trade) => trade as UserActivityInterface);
    
    console.log(`📋 Found ${temp_trades.length} trades to process`);
    
    // If no trades found but we have recent trades in DB, let's investigate
    if (temp_trades.length === 0 && allRecentTrades.length > 0) {
        console.log('⚠️ Recent trades exist but none qualify for processing.');
        console.log('📊 Trade statuses:');
        allRecentTrades.slice(0, 5).forEach((trade, i) => {
            const timestamp = trade.timestamp 
                ? new Date(trade.timestamp * 1000).toISOString() 
                : 'Unknown time';
                
            console.log(`  ${i+1}. ${timestamp} - bot: ${trade.bot}, retries: ${trade.botExcutedTime || 0}, status: ${trade.botExecutionStatus || 'pending'}`);
        });
    }
};

// Updated function that uses our new robust RPC helper
async function checkUSDCAllowance(wallet: string): Promise<number> {
    try {
        return await fetchRpcAllowance(wallet, POLYMARKET_EXCHANGE_ADDRESS);
    } catch (error) {
        console.error('❌ Error checking allowance:', error);
        return 0; // Assume zero allowance on error to be safe
    }
}

const doTrading = async (clobClient: ClobClient) => {
    for (const trade of temp_trades) {
        console.log('🔄 Processing trade to copy:', {
            conditionId: trade.conditionId,
            side: trade.side,
            usdcSize: trade.usdcSize,
            asset: trade.asset,
            outcome: trade.outcome,
            title: trade.title,
            timestamp: trade.timestamp
        });
        
        try {
            // Check USDC allowance before trading
            const allowance = await checkUSDCAllowance(PROXY_WALLET);
            const my_balance = await getMyBalance(PROXY_WALLET);
            
            // Check if allowance is sufficient - require at least full balance approval
            // Adding a buffer to account for potential fees/slippage
            if (allowance < my_balance) {
                console.log(`⚠️ USDC allowance too low: ${allowance} USDC (balance is ${my_balance} USDC)`);
                console.log(`💡 Cannot place orders. Run: node approve-usdc.js force`);
                await UserActivity.updateOne(
                    { _id: trade._id },
                    { 
                        bot: true,
                        botExcutedTime: RETRY_LIMIT, // Mark as retry limit hit for this specific error type
                        botExecutionStatus: 'FAILED_ALLOWANCE_TOO_LOW'
                    }
                );
                continue;
            }
            
            // Get market information
            const market = await clobClient.getMarket(trade.conditionId);
            console.log('📊 Market info:', trade.title);
            
            // Get current positions
            const my_positions: UserPositionInterface[] = await fetchData(
                `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`
            );
            const user_positions: UserPositionInterface[] = await fetchData(
                `https://data-api.polymarket.com/positions?user=${USER_ADDRESS}`
            );
            
            const my_position = my_positions.find(
                (position: UserPositionInterface) => position.conditionId === trade.conditionId
            );
            const user_position = user_positions.find(
                (position: UserPositionInterface) => position.conditionId === trade.conditionId
            );
            
            // Get user balance (no need to get my_balance again as we already have it)
            const user_balance = await getMyBalance(USER_ADDRESS);
            
            console.log('💰 Current balances:');
            console.log('  My balance:', my_balance, 'USDC');
            console.log('  User balance:', user_balance, 'USDC');
            
            // Calculate trade amount (copy the same USDC amount)
            let tradeAmount = trade.usdcSize;
            
            // Optional: Scale trade amount based on balance ratio
            if (my_balance < user_balance) {
                const balanceRatio = (my_balance * 100) / user_balance;
                tradeAmount = tradeAmount * balanceRatio;
                console.log(`⚖️ Scaling trade amount by balance ratio: ${balanceRatio.toFixed(3)}`);
            }
            
            // Ensure we have enough balance
            if (tradeAmount > my_balance * 0.95) { // Keep 5% buffer
                tradeAmount = my_balance * 0.9; // Use 90% of balance
                console.log(`⚠️ Adjusting trade amount to ${tradeAmount.toFixed(6)} USDC (90% of balance)`);
            }
            
            if (tradeAmount < 0.01) {
                console.log('❌ Trade amount too small, skipping trade');
                continue;
            }
            
            console.log(`📈 Placing ${trade.side} order for ${tradeAmount.toFixed(6)} USDC on ${trade.outcome}`);
            
            // Determine strategy based on trade side
            const strategy = trade.side.toLowerCase() === 'buy' ? 'buy' : 'sell';
            
            // Use the existing postOrder function with correct parameters
            try {
                await postOrder(
                    clobClient,
                    strategy,
                    my_position,
                    user_position,
                    trade,
                    my_balance,
                    user_balance
                );
                
                console.log('✅ Trade processing completed!');
                
                // Mark trade as executed in database
                await UserActivity.updateOne(
                    { _id: trade._id },
                    { 
                        bot: true,
                        botExcutedTime: Date.now(),
                        botExecutionStatus: 'SUCCESS'
                    }
                );
                
                console.log('📚 Updated trade record in database');
            } catch (orderError: any) {
                console.error('💥 Error placing order:', orderError);
                
                // Check if it's an allowance issue
                if (orderError.message && 
                   (orderError.message.includes('allowance') || 
                    (orderError.data && orderError.data.error && 
                     orderError.data.error.includes('allowance')))) {
                    
                    console.log('❌ Allowance issue detected. Need to increase USDC approval.');
                    console.log('💡 Run: node approve-usdc.js force');
                    
                    // Update the trade with specific error status
                    await UserActivity.updateOne(
                        { _id: trade._id },
                        { 
                            bot: true, // Mark that bot attempted
                            botExcutedTime: RETRY_LIMIT, // Mark as retry limit hit for this specific error type
                            botExecutionStatus: 'FAILED_ALLOWANCE_ISSUE'
                        }
                    );
                } else {
                    // Increment retry count for other errors
                    await UserActivity.updateOne(
                        { _id: trade._id },
                        { 
                            $inc: { botExcutedTime: 1 },
                            botExecutionStatus: 'FAILED_ORDER_ERROR'
                        }
                    );
                }
            }
            
        } catch (error) {
            console.error('💥 Error processing trade:', error);
            
            // Increment retry count on error
            await UserActivity.updateOne(
                { _id: trade._id },
                { 
                    $inc: { botExcutedTime: 1 },
                    botExecutionStatus: 'FAILED_PROCESSING_ERROR'
                }
            );
        }
        
        // Small delay between trades
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
};

// Add a diagnostic function
const resetFailedTrades = async () => {
    const oneHourAgo = Math.floor(Date.now()/1000) - 3600;
    
    const result = await UserActivity.updateMany(
        {
            type: 'TRADE',
            timestamp: { $gt: oneHourAgo },
            bot: true,
            botExecutionStatus: { $in: ['FAILED_ALLOWANCE_TOO_LOW', 'FAILED_ALLOWANCE_ISSUE', 'FAILED_ORDER_ERROR'] }
        },
        {
            $set: { bot: false, botExcutedTime: 0 }
        }
    );
    
    console.log(`🔄 Reset ${result.modifiedCount} failed trades for retry`);
};

const tradeExcutor = async (clobClient: ClobClient) => {
    console.log(`🚀 Starting Copy Trading Bot`);
    
    // Clear allowance cache on startup
    clearAllowanceCache();

    // Reset any failed trades on startup
    await resetFailedTrades();
    console.log('🔄 Failed trades have been reset and will be retried');

    let noTradesCounter = 0;

    while (true) {
        try {
            await readTempTrade();
            
            if (temp_trades.length > 0) {
                console.log('💥 New transactions found 💥');
                spinner.stop();
                await doTrading(clobClient);
                console.log('✅ Finished processing batch of trades');
                noTradesCounter = 0; // Reset counter when we find trades
            } else {
                spinner.start('Waiting for new transactions...');
                
                // Periodically reset failed trades if we haven't found any for a while
                noTradesCounter++;
                if (noTradesCounter >= 30) { // After ~5 minutes with no trades
                    console.log('⚠️ No new trades for a while, resetting any failed trades...');
                    await resetFailedTrades();
                    noTradesCounter = 0;
                }
            }
            
            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
            
        } catch (error) {
            console.error('❌ Error in trade executor main loop:', error);
            spinner.stop();
            
            // Wait longer on error before retrying
            await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second delay on error
        }
    }
};

export default tradeExcutor;
