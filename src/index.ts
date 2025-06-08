import connectDB from './config/db';
import { ENV } from './config/env';
import createClobClient from './services/createClobClient';
import tradeExecutor from './services/tradeExecutor';
import tradeMonitor from './services/tradeMonitor';
import test from './test/test';

const USER_ADDRESS = ENV.USER_ADDRESS;
const PROXY_WALLET = ENV.PROXY_WALLET;

// Check for command line arguments
const args = process.argv.slice(2);
const shouldSellAll = args.includes('sell_all');
const shouldClaimAll = args.includes('claim_all');

export const main = async () => {
    await connectDB();
    console.log(`Target User Wallet addresss is: ${USER_ADDRESS}`);
    console.log(`My Wallet addresss is: ${PROXY_WALLET}`);
    const clobClient = await createClobClient();
    
    // Start monitoring user's transactions
    tradeMonitor();
    
    // Execute transactions on your wallet with the sell_all or claim_all flag if provided
    tradeExecutor(clobClient, shouldSellAll, shouldClaimAll);
    
    // test(clobClient);
};

main();
