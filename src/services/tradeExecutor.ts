import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';
import fetchData from '../utils/fetchData';
import spinner from '../utils/spinner';
import getMyBalance from '../utils/getMyBalance';
import postOrder from '../utils/postOrder';

const USER_ADDRESS = ENV.USER_ADDRESS;
const RETRY_LIMIT = ENV.RETRY_LIMIT;
const PROXY_WALLET = ENV.PROXY_WALLET;

let temp_trades: UserActivityInterface[] = [];

const UserActivity = getUserActivityModel(USER_ADDRESS);

const readTempTrade = async () => {
    temp_trades = (
        await UserActivity.find({
            $and: [
                { type: 'TRADE' }, 
                { bot: { $ne: true } }, // Not executed yet
                { botExcutedTime: { $lt: RETRY_LIMIT } } // Haven't exceeded retry limit
            ],
        })
        .sort({ timestamp: 1 }) // Process oldest first
        .limit(10) // Process up to 10 trades at a time
        .exec()
    ).map((trade) => trade as UserActivityInterface);
    
    console.log(`📋 Found ${temp_trades.length} trades to process`);
};

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
            
            // Get current balances
            const my_balance = await getMyBalance(PROXY_WALLET);
            const user_balance = await getMyBalance(USER_ADDRESS);
            
            console.log('💰 Current balances:');
            console.log('  My balance:', my_balance, 'USDC');
            console.log('  User balance:', user_balance, 'USDC');
            
            // Calculate trade amount (copy the same USDC amount)
            let tradeAmount = trade.usdcSize;
            
            // Optional: Scale trade amount based on balance ratio
            if (my_balance < user_balance) {
                const balanceRatio = my_balance / user_balance;
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
                    botExcutedTime: Date.now()
                }
            );
            
            console.log('📚 Updated trade record in database');
            
        } catch (error) {
            console.error('💥 Error processing trade:', error);
            
            // Increment retry count on error
            await UserActivity.updateOne(
                { _id: trade._id },
                { 
                    $inc: { botExcutedTime: 1 }
                }
            );
        }
        
        // Small delay between trades
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
};

const tradeExcutor = async (clobClient: ClobClient) => {
    console.log(`🚀 Starting Copy Trading Bot`);

    while (true) {
        try {
            await readTempTrade();
            if (temp_trades.length > 0) {
                console.log('💥 New transactions found 💥');
                spinner.stop();
                await doTrading(clobClient);
                console.log('✅ Finished processing batch of trades');
            } else {
                spinner.start('Waiting for new transactions...');
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
