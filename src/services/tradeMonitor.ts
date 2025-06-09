import moment from 'moment';
import { ENV } from '../config/env';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { getUserActivityModel, getUserPositionModel } from '../models/userHistory';
import fetchData from '../utils/fetchData';
import getMyBalance from '../utils/getMyBalance';

const USER_ADDRESS = ENV.USER_ADDRESS;
const TOO_OLD_TIMESTAMP = ENV.TOO_OLD_TIMESTAMP;
const FETCH_INTERVAL = ENV.FETCH_INTERVAL;

if (!USER_ADDRESS) {
    throw new Error('USER_ADDRESS is not defined');
}

const UserActivity = getUserActivityModel(USER_ADDRESS);
const UserPosition = getUserPositionModel(USER_ADDRESS);

let temp_trades: UserActivityInterface[] = [];

const init = async () => {
    temp_trades = (await UserActivity.find().exec()).map((trade) => trade as UserActivityInterface);
};

const isTradeUnique = (activity: UserActivityInterface, temp_trades: UserActivityInterface[]) => {
    // Check if there's any existing trade that exactly matches this one
    return !temp_trades.some(existingTrade => {
        const timeMatch = moment.unix(existingTrade.timestamp).isSame(moment.unix(activity.timestamp), 'second');
        const sideMatch = existingTrade.side === activity.side;
        const assetMatch = existingTrade.asset === activity.asset;
        const sizeMatch = Math.abs(existingTrade.size - activity.size) < 0.00001; // Use small epsilon for float comparison
        const priceMatch = Math.abs(existingTrade.price - activity.price) < 0.00001;
        const hashMatch = existingTrade.transactionHash === activity.transactionHash;
        const outcomeMatch = existingTrade.outcome === activity.outcome;
        const conditionMatch = existingTrade.conditionId === activity.conditionId;
        
        // A trade is considered duplicate if it matches either:
        // 1. Same transaction hash (definitely same trade) OR
        // 2. Same timestamp AND all trade details match (same trading action)
        return (hashMatch) || (timeMatch && sideMatch && assetMatch && sizeMatch && priceMatch && outcomeMatch && conditionMatch);
    });
};

const fetchTradeData = async () => {
    try {
        console.log(`🔍 Checking for trades at ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
        
        // Check current balance
        const balance = await getMyBalance(USER_ADDRESS);
        console.log(`💰 Current USDC balance: ${balance} USDC`);
        
        // Fetch user activities from Polymarket API
        console.log(`📡 Fetching activities for user: ${USER_ADDRESS}`);
        const userActivities: UserActivityInterface[] = await fetchData(
            `https://data-api.polymarket.com/activity?user=${USER_ADDRESS}&limit=400&offset=0`
        );
        
        console.log(`📊 Total activities fetched: ${userActivities.length}`);
        
        // Fetch user positions from Polymarket API
        const userPositions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${USER_ADDRESS}`
        );
        
        console.log(`📈 Total positions fetched: ${userPositions.length}`);

        // Filter recent trades (not older than TOO_OLD_TIMESTAMP hours)
        const currentTime = moment().unix();
        const oldestAllowedTime = currentTime - (TOO_OLD_TIMESTAMP * 3600); // Convert hours to seconds
        
        console.log(`⏰ Current time: ${currentTime}, Oldest allowed: ${oldestAllowedTime}`);
        console.log(`🕐 Filtering trades newer than: ${moment.unix(oldestAllowedTime).format('YYYY-MM-DD HH:mm:ss')}`);
        
        const recentActivities = userActivities.filter(
            (activity) => activity.timestamp > oldestAllowedTime && activity.type === 'TRADE'
        );
        
        console.log(`🔥 Recent TRADE activities found: ${recentActivities.length}`);
        
        // Log all activities for debugging
        if (userActivities.length > 0) {
            console.log('📋 All activities:');
            userActivities.slice(0, 5).forEach((activity, index) => {
                console.log(`  ${index + 1}. Type: ${activity.type}, Time: ${moment.unix(activity.timestamp).format('YYYY-MM-DD HH:mm:ss')}, Hash: ${activity.transactionHash}`);
            });
        }

        // Process new activities
        const startupTime = moment().unix(); // Record when we started
        for (const activity of recentActivities) {
            // Check if this activity is unique considering all criteria
            if (isTradeUnique(activity, temp_trades)) {
                // Add bot tracking fields, marking as skipped if it was before startup
                const wasBeforeStartup = activity.timestamp < startupTime;
                
                const newActivity = {
                    ...activity,
                    bot: false, // Always mark as unprocessed so it can be copied
                    botExcutedTime: 0,
                    botExecutionStatus: wasBeforeStartup ? 'SKIPPED_PRE_START' : 'PENDING'
                };

                // Save to database
                const activityDoc = new UserActivity(newActivity);
                await activityDoc.save();
                
                // Add to temp_trades for immediate processing
                temp_trades.push(newActivity as UserActivityInterface);
                
                console.log('🔥 New trade detected:', {
                    type: activity.type,
                    side: activity.side,
                    asset: activity.title,
                    size: activity.size,
                    price: activity.price,
                    timestamp: moment.unix(activity.timestamp).format('YYYY-MM-DD HH:mm:ss')
                });
            } else {
                console.log(`⚠️ Trade already exists in database: ${activity.transactionHash}`);
            }
        }

        // Update positions in database
        for (const position of userPositions) {
            await UserPosition.findOneAndUpdate(
                { conditionId: position.conditionId },
                position,
                { upsert: true, new: true }
            );
        }
        
        console.log(`✅ Completed trade data fetch cycle\n`);

    } catch (error) {
        console.error('❌ Error fetching trade data:', error);
    }
};

const tradeMonitor = async () => {
    console.log('Trade Monitor is running every', FETCH_INTERVAL, 'seconds');
    await init();    //Load my oders before sever downs
    while (true) {
        await fetchTradeData();     //Fetch all user activities
        await new Promise((resolve) => setTimeout(resolve, FETCH_INTERVAL * 1000));     //Fetch user activities every second
    }
};

export default tradeMonitor;
