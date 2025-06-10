import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import fetchData from '../utils/fetchData';
import getMyBalance from '../utils/getMyBalance';
import { ENV } from '../config/env';
import { UserPositionInterface } from '../interfaces/User';

// Helper functions for decimal precision
// Helper function to round token amount to 5 decimal places (maker amount)
const roundTokenAmount = (amount: number): number => {
  return Math.floor(amount * 100000) / 100000;
};

// Helper function to round USDC amount to 2 decimal places (taker amount) 
const roundUSDCAmount = (amount: number): number => {
  return Math.floor(amount * 100) / 100;
};

// Helper function to calculate token amount with proper decimal handling
const calculateTokenAmount = (usdcAmount: number, price: number): number => {
  // First round the input amounts to their proper decimal places
  const roundedUSDC = roundUSDCAmount(usdcAmount);
  const roundedPrice = roundUSDCAmount(price); // Price is in USDC so needs 2 decimals
  // Then calculate and round the result to 5 decimals
  return roundTokenAmount(roundedUSDC / roundedPrice);
};

// Constants for auto-betting
const MIN_PROBABILITY_THRESHOLD = 0.91; // Only bet on >90% probability
const WALLET_PERCENTAGE_TO_BET = 0.10; // 10% of wallet
const PROXY_WALLET = ENV.PROXY_WALLET;

// List of specific market IDs to track
const TRACKED_MARKET_IDS: string[] = [
  '0x3ab9efc4b25a4ee42222e86f2046f5a86ecce97c55e44d5d9718ad29f91c9e50' // Bitcoin $150K market
];

/**
 * Add a market ID to the tracking list
 */
export function addMarketToTrack(marketId: string): void {
  if (!TRACKED_MARKET_IDS.includes(marketId)) {
    TRACKED_MARKET_IDS.push(marketId);
    console.log(`✅ Added market ID ${marketId} to tracking list`);
  } else {
    console.log(`ℹ️ Market ID ${marketId} is already being tracked`);
  }
}

/**
 * Remove a market ID from the tracking list
 */
export function removeMarketFromTracking(marketId: string): void {
  const index = TRACKED_MARKET_IDS.indexOf(marketId);
  if (index !== -1) {
    TRACKED_MARKET_IDS.splice(index, 1);
    console.log(`✅ Removed market ID ${marketId} from tracking list`);
  } else {
    console.log(`ℹ️ Market ID ${marketId} is not in the tracking list`);
  }
}

/**
 * Get all currently tracked market IDs
 */
export function getTrackedMarketIds(): string[] {
  return [...TRACKED_MARKET_IDS];
}

/**
 * Check if we already have a position on a specific outcome
 */
async function checkExistingPosition(outcomeId: string): Promise<boolean> {
  try {
    console.log(`   🔍 Checking for existing position on outcome ${outcomeId}...`);
    
    // Get current positions
    const positions: UserPositionInterface[] = await fetchData(
      `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`
    );
    
    if (!positions || positions.length === 0) {
      console.log(`   ✅ No existing positions found`);
      return false;
    }
    
    // Check if we have a position on this specific outcome
    const existingPosition = positions.find(pos => pos.asset === outcomeId);
    
    if (existingPosition) {
      console.log(`   ❌ Already have position: ${existingPosition.size} tokens`);
      return true;
    }
    
    console.log(`   ✅ No existing position on this outcome`);
    return false;
  } catch (error) {
    console.error(`   ❌ Error checking existing position:`, error);
    // If we can't check, err on the side of caution and don't place bet
    return true;
  }
}

/**
 * Fetch and log information about a specific market ID
 */
export async function fetchAndLogMarketInfo(marketId: string): Promise<any> {
  try {
    console.log(`🔍 Fetching information for market ID: ${marketId}`);
    
    // Fetch the market data
    const marketData = await fetchData(`https://clob.polymarket.com/markets/${marketId}`);
    
    if (!marketData) {
      console.log(`❌ Could not fetch data for market ${marketId}`);
      return null;
    }
    
    // Log the market information
    console.log(`\n📊 Market Information:`);
    console.log(`   Title: ${marketData.title || marketData.question || 'Unknown'}`);
    console.log(`   Description: ${marketData.description || marketData.details || 'No description'}`);
    console.log(`   State: ${marketData.state || 'Unknown'}`);
    
    // Log outcomes and their probabilities
    if (marketData.outcomes && marketData.outcomes.length > 0) {
      console.log(`   Outcomes:`);
      marketData.outcomes.forEach((outcome: any) => {
        // Extract probability from various possible fields
        const probability = parseFloat(outcome.price || outcome.probability || outcome.value || 0) * 100;
        
        // Extract outcome name from various possible fields
        let outcomeName = outcome.value || outcome.name || outcome.title;
        
        // Enhanced name extraction for various market data structures
        if (!outcomeName) {
          // Try to extract from deeper nested properties
          if (outcome.outcome && typeof outcome.outcome === 'object') {
            outcomeName = outcome.outcome.value || outcome.outcome.name || outcome.outcome.title;
          }
          
          // If still no name and it's a binary market, use Yes/No based on index
          if (!outcomeName && marketData.outcomes.length === 2) {
            const index = marketData.outcomes.indexOf(outcome);
            outcomeName = index === 0 ? "Yes" : "No";
          } else if (!outcomeName) {
            // For multi-outcome markets, use option number
            outcomeName = `Option ${marketData.outcomes.indexOf(outcome) + 1}`;
          }
        }
        
        console.log(`      - ${outcomeName}: ${probability.toFixed(2)}%`);
      });
    } else {
      console.log(`   No outcomes found in market data structure:`, JSON.stringify(marketData, null, 2));
    }
    
    return marketData;
  } catch (error) {
    console.error(`❌ Error fetching market ${marketId}:`, error);
    return null;
  }
}

/**
 * Fetch market data for all tracked markets at once
 */
export async function fetchAllTrackedMarketsData(): Promise<Record<string, any>> {
  try {
    console.log(`🔄 Bulk fetching data for ${TRACKED_MARKET_IDS.length} markets...`);
    
    // Create requests for all market IDs in parallel
    const marketDataPromises = TRACKED_MARKET_IDS.map(async marketId => {
      try {
        console.log(`   Fetching data for market ${marketId}...`);
        const url = `https://clob.polymarket.com/markets/${marketId}`;
        console.log(`   URL: ${url}`);
        const data = await fetchData(url);
        if (!data) {
          console.log(`   ❌ No data returned for market ${marketId}`);
          return { marketId, data: null };
        }
        console.log(`   ✅ Successfully fetched data for market ${marketId}`);
        return { marketId, data };
      } catch (error) {
        console.error(`   ❌ Error fetching market ${marketId}:`, error);
        if (error instanceof Error) {
          console.error(`   Error message: ${error.message}`);
          console.error(`   Stack trace: ${error.stack}`);
        }
        return { marketId, data: null };
      }
    });
    
    // Wait for all requests to complete
    console.log('\nWaiting for all market data requests to complete...');
    const results = await Promise.all(marketDataPromises);
    
    // Transform results into a map of marketId -> marketData
    const marketDataMap: Record<string, any> = {};
    for (const result of results) {
      if (result && result.marketId) {
        marketDataMap[result.marketId] = result.data;
      }
    }
    
    const successCount = Object.values(marketDataMap).filter(Boolean).length;
    console.log(`✅ Successfully fetched data for ${successCount} markets`);
    return marketDataMap;
  } catch (error) {
    console.error('❌ Error fetching all tracked markets data:', error);
    return {};
  }
}

/**
 * Place a bet on a specific market outcome
 */
async function placeBetOnOutcome(
  clobClient: ClobClient,
  marketId: string,
  outcomeId: string,
  outcomeName: string,
  price: number,
  betAmount: number,
  marketTitle: string
): Promise<boolean> {
  try {
    console.log(`\n🎯 Placing bet on ${marketTitle}`);
    console.log(`   Outcome: ${outcomeName} (${price * 100}% probability)`);
    console.log(`   Amount: $${betAmount.toFixed(2)} USDC`);
    
    // Get the orderbook to verify liquidity with timeout protection
    let orderBook: any;
    let fallbackPrice = price; // Use provided price as fallback
    let usingFallbackPrice = false;
    
    try {
      console.log(`   📊 Fetching orderbook for ${outcomeId}...`);
      orderBook = await Promise.race([
        clobClient.getOrderBook(outcomeId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Orderbook fetch timeout')), 10000) // 10 second timeout
        )
      ]);
      console.log(`   ✅ Orderbook fetched successfully`);
    } catch (error: any) {
      console.log(`   ❌ Failed to fetch orderbook: ${error.message}`);
      console.log(`   🎯 Using fallback price ${fallbackPrice.toFixed(4)} to continue with bet`);
      usingFallbackPrice = true;
    }
    
    let bestPrice = fallbackPrice;
    
    if (!usingFallbackPrice) {
      if (!orderBook.asks || orderBook.asks.length === 0) {
        console.log('❌ No asks found in orderbook, using fallback price');
        usingFallbackPrice = true;
      } else {
        // Get the best ask price
        const minPriceAsk = orderBook.asks.reduce((min: any, ask: any) => {
          return parseFloat(ask.price) < parseFloat(min.price) ? ask : min;
        }, orderBook.asks[0]);
        
        bestPrice = parseFloat(minPriceAsk.price);
        console.log(`   Best available price: ${bestPrice}`);
        
        // If the price has moved significantly, use fallback price instead of skipping
        if (Math.abs(bestPrice - price) > 0.01) {
          console.log(`   ⚠️ Price has moved significantly (${bestPrice.toFixed(4)} vs ${price.toFixed(4)}), using fallback price`);
          bestPrice = fallbackPrice;
          usingFallbackPrice = true;
        }
      }
    }
    
    if (usingFallbackPrice) {
      console.log(`   📊 Using fallback price: ${bestPrice.toFixed(4)}`);
    }
    
    // Calculate token amount to buy - use a slightly smaller amount to increase fill probability
    // and account for price fluctuations
    // Round to 5 decimal places max to comply with Polymarket's requirements
    const askPrice = roundUSDCAmount(bestPrice);
    const adjustedUSDC = roundUSDCAmount(betAmount * 0.95); // 95% of bet amount, rounded to 2 decimals
    
    // Start with a reasonable token amount based on our budget
    let tokenAmount = calculateTokenAmount(adjustedUSDC, askPrice);
    
    // SYSTEMATIC PRECISION APPROACH: Find values that work with CLOB client's 10^6 calculation
    let attempts = 0;
    const maxAttempts = 500;
    let validMakerInt = 0;
    
    console.log(`   🎯 Searching for valid precision combinations...`);
    console.log(`   📋 Target: ~${adjustedUSDC.toFixed(2)} USDC, Price: ${askPrice.toFixed(2)}`);
    
    // Calculate base token amount in 10^6 units
    const baseTokensInt = Math.floor((adjustedUSDC / askPrice) * 1000000);
    
    // Search systematically around our target
    const searchRanges = [
      { start: -100, end: 100, step: 1 },
      { start: -1000, end: 1000, step: 10 },
      { start: -10000, end: 10000, step: 100 },
      { start: 1000000, end: 25000000, step: 10000 },
    ];
    
    searchLoop: for (const range of searchRanges) {
      if (validMakerInt > 0) break;
      
      console.log(`   🔍 Searching range ${range.start} to ${range.end} (step ${range.step})`);
      
      for (let offset = range.start; offset <= range.end; offset += range.step) {
        const testMakerInt = range.start === 1000000 ? offset : baseTokensInt + offset;
        if (testMakerInt <= 0) continue;
        
        attempts++;
        
        if (attempts > maxAttempts) {
          console.log(`   ⚠️ Reached maximum attempts (${maxAttempts}), stopping search`);
          break searchLoop;
        }
        
        // Calculate taker amount using CLOB client's formula: taker = maker / price
        const calculatedTakerInt = Math.round(testMakerInt / askPrice);
        
        // Convert back to decimals for precision check
        const makerDecimal = testMakerInt / 1000000;
        const takerDecimal = calculatedTakerInt / 1000000;
        
        // Count decimal places
        const makerDecimals = (makerDecimal.toString().split('.')[1] || '').length;
        const takerDecimals = (takerDecimal.toString().split('.')[1] || '').length;
        
        if (makerDecimals <= 5 && takerDecimals <= 2) {
          const costEstimate = makerDecimal * askPrice;
          console.log(`   ✅ Found valid precision after ${attempts} attempts!`);
          console.log(`   - Maker: ${makerDecimal} tokens (${makerDecimals} decimals)`);
          console.log(`   - Taker: ${takerDecimal} USDC (${takerDecimals} decimals)`);
          console.log(`   - Estimated cost: $${costEstimate.toFixed(2)}`);
          validMakerInt = testMakerInt;
          break searchLoop;
        }
        
        if (attempts % 25 === 0) {
          console.log(`   📊 Attempt ${attempts}: Testing ${makerDecimal.toFixed(6)} tokens (${makerDecimals}d maker, ${takerDecimals}d taker)`);
        }
      }
    }
    
    if (validMakerInt === 0) {
      console.log(`   ❌ Could not find valid precision after ${attempts} attempts`);
      return false;
    }
    
    // Use the valid values we found
    const finalTokenAmount = validMakerInt / 1000000;
    const finalPrice = roundUSDCAmount(askPrice);
    
    console.log(`   Buying ${finalTokenAmount.toFixed(6)} tokens at $${finalPrice.toFixed(2)} each`);
    console.log(`   Calculated cost for verification: $${(finalTokenAmount * finalPrice).toFixed(6)}`);
    
    // Create and place the order with proper decimal precision
    const order = {
      side: Side.BUY,
      tokenID: outcomeId,
      amount: finalTokenAmount,
      price: finalPrice
    };
    
    const signedOrder = await clobClient.createMarketOrder(order);
    const resp = await clobClient.postOrder(signedOrder, OrderType.GTC);
    
    if (resp.success === true) {
      console.log('✅ Successfully placed bet:', resp);
      return true;
    } else {
      console.log('❌ Failed to place bet:', resp);
      return false;
    }
  } catch (error) {
    console.error('❌ Error placing bet:', error);
    return false;
  }
}

/**
 * Process outcomes from the market data, handling different data structures
 */
async function processMarketOutcomes(
  clobClient: ClobClient,
  marketId: string,
  marketData: any,
  myBalance: number,
  maxBetAmount: number
): Promise<void> {
  // Check if we have outcomes in the standard format
  if (marketData.outcomes && Array.isArray(marketData.outcomes) && marketData.outcomes.length > 0) {
    console.log(`   Found ${marketData.outcomes.length} outcomes:`);
    
    for (const outcome of marketData.outcomes) {
      const outcomeId = outcome.tokenId || outcome.token_id || outcome.id;
      const probability = parseFloat(outcome.price || outcome.probability || outcome.value || 0);
      const outcomeName = outcome.value || outcome.name || outcome.title || 'Unknown';
      
      console.log(`   Outcome: ${outcomeName} (${(probability * 100).toFixed(2)}%)`);
      
      await processOutcome(
        clobClient,
        marketId,
        outcomeId,
        outcomeName,
        probability,
        marketData,
        myBalance,
        maxBetAmount
      );
    }
  } 
  // Try to find outcomes in alternative data structures
  else {
    console.log(`❌ No standard outcomes found in market data. Looking for alternative formats...`);
    
    // Try different property names that might contain outcome data
    const possibleOutcomeProperties = ['tokens', 'options', 'positions', 'results', 'choices'];
    let foundOutcomes = false;
    
    for (const propName of possibleOutcomeProperties) {
      if (marketData[propName] && Array.isArray(marketData[propName]) && marketData[propName].length > 0) {
        console.log(`   Found outcomes in '${propName}' property. Processing ${marketData[propName].length} outcomes:`);
        
        for (const outcome of marketData[propName]) {
          const outcomeId = outcome.token_id;
          const probability = parseFloat(outcome.price || 0);
          
          // Get the outcome name directly from the Polymarket API response
          let outcomeName = outcome.outcome;
          
          // Enhanced outcome name extraction for various market structures
          if (!outcomeName) {
            // Try to extract from deeper nested properties
            if (outcome.outcome && typeof outcome.outcome === 'object') {
              outcomeName = outcome.outcome.value || outcome.outcome.name || outcome.outcome.title;
            }
            
            // If still no name, check if it's a binary market (Yes/No)
            if (!outcomeName && marketData[propName].length === 2) {
              // For binary markets (Yes/No), infer the name based on probability or position
              const index = marketData[propName].indexOf(outcome);
              if (probability > 0.5 || index === 0) {
                outcomeName = "Yes";
              } else {
                outcomeName = "No";
              }
            } else if (!outcomeName) {
              // If not binary, use the index to create a name
              outcomeName = `Option ${marketData[propName].indexOf(outcome) + 1}`;
            }
          }
          
          console.log(`   Outcome: ${outcomeName} (${(probability * 100).toFixed(2)}%)`);
          
          await processOutcome(
            clobClient,
            marketId,
            outcomeId,
            outcomeName,
            probability,
            marketData,
            myBalance,
            maxBetAmount
          );
        }
        
        foundOutcomes = true;
        break;
      }
    }
    
    if (!foundOutcomes) {
      console.log(`❌ Could not find any outcomes in the market data. Full data:`, JSON.stringify(marketData, null, 2));
    }
  }
}

/**
 * Process a single outcome
 */
async function processOutcome(
  clobClient: ClobClient,
  marketId: string,
  outcomeId: string,
  outcomeName: string,
  probability: number,
  marketData: any,
  myBalance: number,
  maxBetAmount: number
): Promise<void> {
  try {
    // Check if market is expired or about to expire
    if (marketData.game_start_time) {
      const gameStart = new Date(marketData.game_start_time);
      const now = new Date();
      if (gameStart < now) {
        console.log(`   ❌ Market has started/expired (game time: ${gameStart.toISOString()})`);
        return;
      }
    }
    
    if (marketData.end_date_iso) {
      const endDate = new Date(marketData.end_date_iso);
      const now = new Date();
      const timeUntilEnd = endDate.getTime() - now.getTime();
      const hoursUntilEnd = timeUntilEnd / (1000 * 60 * 60);
      
      if (endDate < now) {
        console.log(`   ❌ Market has expired (end date: ${endDate.toISOString()})`);
        return;
      }
      
      if (hoursUntilEnd < 24) {
        console.log(`   ⚠️ Market expires soon (${hoursUntilEnd.toFixed(1)} hours left)`);
        return;
      }
    }

    // Get the orderbook to see buy/sell prices with timeout protection
    let orderBook: any;
    try {
      console.log(`      📊 Fetching orderbook for outcome ${outcomeId}...`);
      orderBook = await Promise.race([
        clobClient.getOrderBook(outcomeId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Orderbook fetch timeout')), 15000) // 15 second timeout
        )
      ]);
      console.log(`      ✅ Orderbook fetched successfully`);
    } catch (error: any) {
      console.log(`      ❌ Failed to fetch orderbook: ${error.message}`);
      console.log(`      ⚠️ Skipping price analysis for this outcome`);
      return;
    }
    
    // Calculate best buy (bid) and sell (ask) prices
    let bestBidPrice = 0;
    let bestAskPrice = 1;
    
    if (orderBook.bids && orderBook.bids.length > 0) {
      const maxBid = orderBook.bids.reduce((max: any, bid: any) => {
        return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
      }, orderBook.bids[0]);
      bestBidPrice = parseFloat(maxBid.price);
    }
    
    if (orderBook.asks && orderBook.asks.length > 0) {
      const minAsk = orderBook.asks.reduce((min: any, ask: any) => {
        return parseFloat(ask.price) < parseFloat(min.price) ? ask : min;
      }, orderBook.asks[0]);
      bestAskPrice = parseFloat(minAsk.price);
    }
    
    console.log(`      - Buy Price: $${bestBidPrice.toFixed(4)}`);
    console.log(`      - Sell Price: $${bestAskPrice.toFixed(4)}`);
    console.log(`      - Spread: $${(bestAskPrice - bestBidPrice).toFixed(4)} (${((bestAskPrice - bestBidPrice) * 100).toFixed(2)}%)`);
    
    // Check if the market meets our auto-betting criteria
    if (probability > MIN_PROBABILITY_THRESHOLD && marketData.state !== 'resolved') {
      console.log(`   📊 Probability check: ${(probability * 100).toFixed(2)}% (threshold: >${(MIN_PROBABILITY_THRESHOLD * 100).toFixed(2)}%)`);
      console.log(`   🎯 High probability opportunity detected: ${outcomeName} (${(probability * 100).toFixed(2)}%)`);
      
      // Check if we already have a position on this outcome
      const hasExistingPosition = await checkExistingPosition(outcomeId);
      if (hasExistingPosition) {
        console.log(`   ⏭️ Skipping bet - already have position on this outcome`);
        return;
      }
      
      if (myBalance > 5) { // Make sure we have enough balance
        // Determine bet amount (10% of wallet) - round down to whole dollars
        const rawBetAmount = Math.min(maxBetAmount, myBalance * 0.9); // Use max 90% of current balance
        const betAmount = Math.floor(rawBetAmount); // Round down to whole dollars
        
        // Skip if bet amount is less than $1
        if (betAmount < 1) {
          console.log(`   ❌ Bet amount too small (${betAmount} < $1)`);
          return;
        }
        
        // Place the bet
        const placedBet = await placeBetOnOutcome(
          clobClient, 
          marketId, 
          outcomeId, 
          outcomeName, 
          roundUSDCAmount(bestAskPrice),
          betAmount, 
          marketData.title || marketData.question || 'Unknown'
        );
        
        if (placedBet) {
          console.log(`   ✅ Successfully placed bet of $${betAmount.toFixed(2)} on ${outcomeName}`);
        } else {
          console.log(`   ❌ Failed to place bet on ${outcomeName}`);
        }
      } else {
        console.log(`   ❌ Insufficient balance for betting`);
      }
    }
    
  } catch (error) {
    console.error(`❌ Error processing outcome ${outcomeId}:`, error);
  }
}

/**
 * Update and track information for all specific market IDs
 * Also place bets on high probability outcomes (>90%)
 */
export async function updateSpecificMarkets(clobClient: ClobClient): Promise<void> {
  try {
    console.log('🔄 Updating specifically tracked markets...');
    
    if (TRACKED_MARKET_IDS.length === 0) {
      console.log('ℹ️ No specific markets are being tracked');
      return;
    }
    
    console.log(`📊 Found ${TRACKED_MARKET_IDS.length} specific markets to update`);
    
    // Bulk fetch all market data first
    const marketDataMap = await fetchAllTrackedMarketsData();
    
    // Get current wallet balance for potential betting
    const myBalance = await getMyBalance(PROXY_WALLET);
    console.log(`\n💰 Current USDC balance: ${myBalance.toFixed(6)} USDC`);
    
    // Calculate bet amount (10% of wallet) - round down to whole dollars
    const maxBetAmount = Math.floor(myBalance * WALLET_PERCENTAGE_TO_BET);
    console.log(`💰 Maximum bet amount (10% of wallet): $${maxBetAmount} USDC`);
    
    // Process each market ID
    for (const marketId of TRACKED_MARKET_IDS) {
      const marketData = marketDataMap[marketId];
      
      if (!marketData) {
        console.log(`\n❌ No data found for market ${marketId}`);
        continue;
      }
      
      // Log basic market info
      console.log(`\n📊 Market Information for ${marketId}:`);
      console.log(`   Title: ${marketData.title || marketData.question || 'Unknown'}`);
      console.log(`   State: ${marketData.state || 'Unknown'}`);
      
      // Process the outcomes
      await processMarketOutcomes(
        clobClient, 
        marketId, 
        marketData, 
        myBalance, 
        maxBetAmount
      );
    }
    
  } catch (error) {
    console.error('❌ Error updating specific markets:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
  }
}
