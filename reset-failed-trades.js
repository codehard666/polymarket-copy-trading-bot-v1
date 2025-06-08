const mongoose = require('mongoose');
require('dotenv').config();

const USER_ADDRESS = process.env.USER_ADDRESS;
const MONGO_URI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(MONGO_URI);

// Define the schema dynamically (simplified version of what's in your model)
const userActivitySchema = new mongoose.Schema({
  type: String,
  bot: Boolean,
  botExcutedTime: Number,
  botExecutionStatus: String,
  timestamp: Number,
  conditionId: String,
  side: String,
  title: String,
  outcome: String
}, { collection: `user_activity_${USER_ADDRESS.toLowerCase().replace('0x', '')}` });

const UserActivity = mongoose.model(`UserActivity_${USER_ADDRESS.toLowerCase().replace('0x', '')}`, userActivitySchema);

async function listRecentTrades() {
  console.log(`📊 Checking recent trades for user: ${USER_ADDRESS}`);
  
  // Find all trades from the last 24 hours
  const oneDayAgo = Math.floor(Date.now()/1000) - 86400;
  const allRecentTrades = await UserActivity.find({ 
    type: 'TRADE',
    timestamp: { $gt: oneDayAgo }
  }).sort({ timestamp: -1 }).exec();
  
  console.log(`Found ${allRecentTrades.length} trades in the last 24 hours:`);
  
  // Display all trades with their status
  allRecentTrades.forEach((trade, index) => {
    const date = new Date(trade.timestamp * 1000).toISOString();
    console.log(`${index+1}. ${date} - ${trade.title} - ${trade.side} ${trade.outcome}`);
    console.log(`   Status: ${trade.bot ? 'Processed' : 'Pending'}, Retries: ${trade.botExcutedTime || 0}, Result: ${trade.botExecutionStatus || 'N/A'}`);
  });
  
  // Group by status
  const pending = allRecentTrades.filter(t => !t.bot).length;
  const processed = allRecentTrades.filter(t => t.bot).length;
  const failed = allRecentTrades.filter(t => t.botExecutionStatus && t.botExecutionStatus.includes('FAILED')).length;
  
  console.log('\n📈 Summary:');
  console.log(`- Pending: ${pending}`);
  console.log(`- Processed: ${processed}`);
  console.log(`- Failed: ${failed}`);
}

async function resetAllFailedTrades() {
  // Reset all failed trades to be processed again
  const result = await UserActivity.updateMany(
    {
      type: 'TRADE',
      $or: [
        { botExecutionStatus: { $regex: /FAILED/i } },
        { bot: true, botExcutedTime: { $lt: 3 } } // Also reset trades that might be stuck
      ]
    },
    {
      $set: { bot: false, botExcutedTime: 0, botExecutionStatus: null }
    }
  );
  
  console.log(`🔄 Reset ${result.modifiedCount} trades to be retried`);
}

// Run based on command line argument
const command = process.argv[2];

if (command === 'reset') {
  resetAllFailedTrades().then(() => {
    console.log('✅ Done! Trades have been reset and will be retried.');
    process.exit(0);
  });
} else {
  listRecentTrades().then(() => {
    console.log('\n👉 To reset failed trades, run: node reset-failed-trades.js reset');
    process.exit(0);
  });
}
