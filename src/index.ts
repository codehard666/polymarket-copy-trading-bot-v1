import connectDB from './config/db';
import { ENV } from './config/env';
import createClobClient from './services/createClobClient';
import tradeExecutor from './services/tradeExecutor';
import tradeMonitor from './services/tradeMonitor';
import test from './test/test';
import { getUserActivityModel } from './models/userHistory';
import { updateSpecificMarkets } from './services/specificMarketTracker';

const USER_ADDRESS = ENV.USER_ADDRESS;
const PROXY_WALLET = ENV.PROXY_WALLET;

// Check for command line arguments
const args = process.argv.slice(2);
console.log('📋 Command line arguments:', args);
const shouldSellAll = args.includes('sell_all');
const shouldClaimAll = args.includes('claim_all');
const shouldSkipPastTrades = args.includes('skip_past_trades');
const shouldTrackSpecificMarkets = args.includes('track_specific_markets');

console.log('🏷️ Flags:', {
    shouldSellAll,
    shouldClaimAll,
    shouldSkipPastTrades,
    shouldTrackSpecificMarkets
});

export const main = async () => {
    await connectDB();
    console.log(`Target User Wallet addresss is: ${USER_ADDRESS}`);
    console.log(`My Wallet addresss is: ${PROXY_WALLET}`);
    const clobClient = await createClobClient();

    // Run the specific market tracker if flag is set
    if (shouldTrackSpecificMarkets) {
        console.log('🔍 Specific market tracking enabled - monitoring selected market IDs...');
        // Run immediately once
        await updateSpecificMarkets(clobClient);
        
        // Then schedule to run every 10 seconds
        console.log('⏱️ Scheduling specific market tracker to run every 10 seconds');
        setInterval(async () => {
            await updateSpecificMarkets(clobClient);
        }, 10 * 1000); // Every 10 seconds
        return;
    }
    
    // If we're skipping past trades, mark all existing trades as processed before starting monitor
    if (shouldSkipPastTrades) {
        console.log('🔄 Skip past trades flag detected - marking all existing trades as processed...');
        const currentTime = Math.floor(Date.now() / 1000);
        await getUserActivityModel(USER_ADDRESS).updateMany(
            { timestamp: { $lt: currentTime } },
            { $set: { bot: true, botExcutedTime: 0, botExecutionStatus: 'SKIPPED_ON_START' } }
        );
        console.log('✅ Marked all existing trades as processed');
    }
    
    // Start monitoring user's transactions (only in normal copy trading mode)
    tradeMonitor();
    
    // Execute transactions on your wallet with the sell_all or claim_all flag if provided
    tradeExecutor(clobClient, shouldSellAll, shouldClaimAll);
    
    // test(clobClient);
};

main();
