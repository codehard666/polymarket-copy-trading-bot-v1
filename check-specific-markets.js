// Check tracked specific markets
import { ClobClient } from '@polymarket/clob-client';
import dotenv from 'dotenv';
import connectDB from './src/config/db';
import createClobClient from './src/services/createClobClient';
import { updateSpecificMarkets, getTrackedMarketIds } from './src/services/specificMarketTracker';

// Load environment variables
dotenv.config();

async function main() {
  try {
    console.log('🔍 Checking tracked specific markets...');
    
    // Connect to the database
    await connectDB();
    
    // Create CLOB client
    const clobClient = await createClobClient();
    
    // Get list of tracked market IDs
    const marketIds = getTrackedMarketIds();
    console.log(`\n📋 Currently tracking ${marketIds.length} specific markets:`);
    
    if (marketIds.length === 0) {
      console.log('   No market IDs are currently being tracked');
      console.log('\nUse the market-ids command to add markets to track:');
      console.log('   npm run market-ids -- add <marketId>');
      process.exit(0);
    }
    
    marketIds.forEach((id, index) => {
      console.log(`   ${index + 1}. ${id}`);
    });
    
    // Update information for tracked markets
    console.log('\n🔄 Fetching current information for tracked markets...');
    const updatedMarkets = await updateSpecificMarkets(clobClient);
    
    if (updatedMarkets.length > 0) {
      console.log(`\n✅ Successfully updated ${updatedMarkets.length} markets`);
    } else {
      console.log('\n❌ No markets were updated');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking tracked markets:', error);
    process.exit(1);
  }
}

// Run the main function
main();
