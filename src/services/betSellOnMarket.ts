import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import fetchData from '../utils/fetchData';
import getMyBalance from '../utils/getMyBalance';
import { ENV } from '../config/env';
import { UserPositionInterface } from '../interfaces/User';

// Helper functions for decimal precision - API requirements: 5 decimals for tokens, 2 for USDC
const roundTokenAmount = (amount: number): number => {
  return Math.floor(amount * 100000) / 100000; // 5 decimals for tokens (maker amount)
};

const roundUSDCAmount = (amount: number): number => {
  return Math.floor(amount * 100) / 100; // 2 decimals for USDC
};

const calculateTokenAmount = (usdcAmount: number, price: number): number => {
  const roundedUSDC = roundUSDCAmount(usdcAmount);
  const roundedPrice = roundUSDCAmount(price);
  return roundTokenAmount(roundedUSDC / roundedPrice);
};

// Constants for auto-betting
const MIN_PROBABILITY_THRESHOLD = 0.65; // Only bet on >65% probability to avoid 50/50 markets
const WALLET_PERCENTAGE_TO_BET = 0.10; // 10% of wallet
const PROXY_WALLET = ENV.PROXY_WALLET;

// List of specific market IDs to track
const TRACKED_MARKET_IDS: string[] = [
  // '0x3ab9efc4b25a4ee42222e86f2046f5a86ecce97c55e44d5d9718ad29f91c9e50', // Bitcoin $150K market
  '0x4945f434a719fa00968e6d1de6988d02597cc3bfa60d65bc6a18124801c31d50' //Bitcoin Up or Down - June 10, 5 PM ET
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
    
    const positions: UserPositionInterface[] = await fetchData(
      `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`
    );
    
    if (!positions || positions.length === 0) {
      console.log(`   ✅ No existing positions found`);
      return false;
    }
    
    const existingPosition = positions.find(pos => pos.asset === outcomeId);
    
    if (existingPosition) {
      console.log(`   ❌ Already have position: ${existingPosition.size} tokens`);
      return true;
    }
    
    console.log(`   ✅ No existing position on this outcome`);
    return false;
  } catch (error) {
    console.error(`   ❌ Error checking existing position:`, error);
    return true;
  }
}

/**
 * Fetch and log information about a specific market ID
 */
export async function fetchAndLogMarketInfo(marketId: string): Promise<any> {
  try {
    console.log(`🔍 Fetching information for market ID: ${marketId}`);
    
    const marketData = await fetchData(`https://clob.polymarket.com/markets/${marketId}`);
    
    if (!marketData) {
      console.log(`❌ Could not fetch data for market ${marketId}`);
      return null;
    }
    
    console.log(`\n📊 Market Information:`);
    console.log(`   Title: ${marketData.title || marketData.question || 'Unknown'}`);
    console.log(`   Description: ${marketData.description || marketData.details || 'No description'}`);
    console.log(`   State: ${marketData.state || 'Unknown'}`);
    
    if (marketData.outcomes && marketData.outcomes.length > 0) {
      console.log(`   Outcomes:`);
      marketData.outcomes.forEach((outcome: any) => {
        const probability = parseFloat(outcome.price || outcome.probability || outcome.value || 0) * 100;
        
        let outcomeName = outcome.value || outcome.name || outcome.title;
        
        if (!outcomeName) {
          if (outcome.outcome && typeof outcome.outcome === 'object') {
            outcomeName = outcome.outcome.value || outcome.outcome.name || outcome.outcome.title;
          }
          
          if (!outcomeName && marketData.outcomes.length === 2) {
            const index = marketData.outcomes.indexOf(outcome);
            outcomeName = index === 0 ? "Yes" : "No";
          } else if (!outcomeName) {
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
    
    console.log('\nWaiting for all market data requests to complete...');
    const results = await Promise.all(marketDataPromises);
    
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
 * Place a bet on a specific market outcome - using exact precision logic from working postOrder.ts
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
    let fallbackPrice = price;
    let usingFallbackPrice = false;
    
    try {
      console.log(`   📊 Fetching orderbook for ${outcomeId}...`);
      orderBook = await Promise.race([
        clobClient.getOrderBook(outcomeId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Orderbook fetch timeout')), 10000)
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
        const minPriceAsk = orderBook.asks.reduce((min: any, ask: any) => {
          return parseFloat(ask.price) < parseFloat(min.price) ? ask : min;
        }, orderBook.asks[0]);
        
        bestPrice = parseFloat(minPriceAsk.price);
        console.log(`   Best available price: ${bestPrice}`);
        
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
    
    // Calculate amounts using the exact same logic as working postOrder.ts
    const adjustedPrice = parseFloat(bestPrice.toFixed(2)); // Ensure 2 decimal precision like postOrder.ts
    const adjustedUSDC = betAmount * 0.95; // 95% of bet amount to account for slippage
    
    // Check available liquidity in the orderbook
    let availableLiquidity = 0;
    if (!usingFallbackPrice && orderBook.asks && orderBook.asks.length > 0) {
      const priceThreshold = adjustedPrice * 1.005;
      availableLiquidity = orderBook.asks
        .filter((ask: any) => parseFloat(ask.price) <= priceThreshold)
        .reduce((total: number, ask: any) => total + parseFloat(ask.size), 0);
      
      console.log(`   📊 Available liquidity: ${availableLiquidity.toFixed(5)} tokens at ≤$${priceThreshold.toFixed(4)}`);
    }
    
    // Calculate token amount exactly like postOrder.ts
    let tokenAmount = adjustedUSDC / adjustedPrice;
    
    // If we have orderbook data, limit our order to available liquidity
    if (availableLiquidity > 0 && tokenAmount > availableLiquidity * 0.9) {
      console.log(`   ⚠️ Reducing order size to match available liquidity`);
      tokenAmount = availableLiquidity * 0.8;
    }
    
    console.log(`   💰 Using price: $${adjustedPrice.toFixed(6)}`);
    console.log(`   📊 Budget: $${adjustedUSDC.toFixed(6)} USDC`);
    console.log(`   🎯 Buying ${tokenAmount.toFixed(6)} tokens at $${adjustedPrice.toFixed(6)} each`);
    console.log(`   💵 Estimated cost: $${(tokenAmount * adjustedPrice).toFixed(6)} USDC`);
    
    if (tokenAmount < 0.00001) {
      console.log(`   ❌ Order size too small: ${tokenAmount}`);
      return false;
    }
    
    console.log(`   ✅ Order validation passed - proceeding with bet placement`);
    
    try {
      // Use exact Polymarket example approach with FOK order type and integer USD amounts
      // Round to whole dollars to avoid precision issues completely
      const usdAmount = Math.floor(adjustedUSDC); // Use whole dollars only (like example: amount: 100)
      
      if (usdAmount < 1) {
        console.log(`   ❌ USD amount too small after rounding: $${usdAmount}`);
        return false;
      }
      
      const orderArgs = {
        tokenID: outcomeId,
        amount: usdAmount, // Integer USD amount like Polymarket example
        side: Side.BUY, //Side.SELL or Side.BUY
        orderType: OrderType.FOK, // Use FOK like in Polymarket example
      };
      
      console.log('📤 Order args (exact Polymarket example format):', orderArgs);
      console.log(`📊 USD amount: $${usdAmount} (integer - no decimals)`);
      
      console.log('✅ Using integer USD amount - creating market order');
      
      const signedOrder = await clobClient.createMarketOrder(orderArgs);
      const resp = await clobClient.postOrder(signedOrder, OrderType.FOK); // Use FOK like example
      
      if (resp && resp.success === true) {
        console.log('✅ Successfully placed bet:', resp);
        return true;
      } else {
        console.log('❌ Failed to place bet:', resp);
        if (resp && resp.error) {
          console.log('Error details:', resp.error);
        }
        return false;
      }
    } catch (error: any) {
      console.error('❌ Error placing bet:', error);
      
      if (error.data && error.data.error) {
        console.error('Error details:', error.data.error);
        
        if (error.config && error.config.data) {
          try {
            const requestData = JSON.parse(error.config.data);
            console.log('📝 Request payload inspection:');
            console.log(`- makerAmount: ${requestData.order.makerAmount}`);
            console.log(`- takerAmount: ${requestData.order.takerAmount}`);
          } catch (e) {
            console.log('Could not parse request data for debugging');
          }
        }
      }
      
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
  console.log(`   🔍 Analyzing market ${marketId} for betting opportunities...`);
  
  // Track if we've already placed a bet on this market to avoid hedging
  let alreadyBetOnThisMarket = false;
  
  if (marketData.outcomes && Array.isArray(marketData.outcomes) && marketData.outcomes.length > 0) {
    console.log(`   Found ${marketData.outcomes.length} outcomes:`);
    
    for (const outcome of marketData.outcomes) {
      if (alreadyBetOnThisMarket) {
        console.log(`   ⏭️ Skipping additional outcomes - already bet on this market`);
        break;
      }
      
      const outcomeId = outcome.tokenId || outcome.token_id || outcome.id;
      const probability = parseFloat(outcome.price || outcome.probability || outcome.value || 0);
      const outcomeName = outcome.value || outcome.name || outcome.title || 'Unknown';
      
      console.log(`   Outcome: ${outcomeName} (${(probability * 100).toFixed(2)}%)`);
      
      const betPlaced = await processOutcome(
        clobClient,
        marketId,
        outcomeId,
        outcomeName,
        probability,
        marketData,
        myBalance,
        maxBetAmount
      );
      
      if (betPlaced) {
        alreadyBetOnThisMarket = true;
        console.log(`   ✅ Bet placed on ${outcomeName} - skipping remaining outcomes to avoid hedging`);
      }
    }
  } else {
    console.log(`❌ No standard outcomes found in market data. Looking for alternative formats...`);
    
    const possibleOutcomeProperties = ['tokens', 'options', 'positions', 'results', 'choices'];
    let foundOutcomes = false;
    
    for (const propName of possibleOutcomeProperties) {
      if (marketData[propName] && Array.isArray(marketData[propName]) && marketData[propName].length > 0) {
        console.log(`   Found outcomes in '${propName}' property. Processing ${marketData[propName].length} outcomes:`);
        
        for (const outcome of marketData[propName]) {
          if (alreadyBetOnThisMarket) {
            console.log(`   ⏭️ Skipping additional outcomes - already bet on this market`);
            break;
          }
          
          const outcomeId = outcome.token_id;
          const probability = parseFloat(outcome.price || 0);
          
          let outcomeName = outcome.outcome;
          
          if (!outcomeName) {
            if (outcome.outcome && typeof outcome.outcome === 'object') {
              outcomeName = outcome.outcome.value || outcome.outcome.name || outcome.outcome.title;
            }
            
            if (!outcomeName && marketData[propName].length === 2) {
              const index = marketData[propName].indexOf(outcome);
              if (probability > 0.5 || index === 0) {
                outcomeName = "Yes";
              } else {
                outcomeName = "No";
              }
            } else if (!outcomeName) {
              outcomeName = `Option ${marketData[propName].indexOf(outcome) + 1}`;
            }
          }
          
          console.log(`   Outcome: ${outcomeName} (${(probability * 100).toFixed(2)}%)`);
          
          const betPlaced = await processOutcome(
            clobClient,
            marketId,
            outcomeId,
            outcomeName,
            probability,
            marketData,
            myBalance,
            maxBetAmount
          );
          
          if (betPlaced) {
            alreadyBetOnThisMarket = true;
            console.log(`   ✅ Bet placed on ${outcomeName} - skipping remaining outcomes to avoid hedging`);
          }
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
): Promise<boolean> {
  try {
    // Debug: Show all date-related fields in market data
    console.log(`      🐛 Debug market dates:`);
    console.log(`         - end_date_iso: ${marketData.end_date_iso}`);
    console.log(`         - end_date: ${marketData.end_date}`);
    console.log(`         - game_start_time: ${marketData.game_start_time}`);
    console.log(`         - resolution_date: ${marketData.resolution_date}`);
    console.log(`         - state: ${marketData.state}`);
    console.log(`         - current time: ${new Date().toISOString()}`);
    
    // Check if market is expired or about to expire
    if (marketData.game_start_time) {
      const gameStart = new Date(marketData.game_start_time);
      const now = new Date();
      if (gameStart < now) {
        console.log(`   ❌ Market has started/expired (game time: ${gameStart.toISOString()})`);
        return false;
      }
    }
    
    // Check multiple possible end date fields
    let endDate = null;
    if (marketData.end_date_iso) {
      endDate = new Date(marketData.end_date_iso);
    } else if (marketData.end_date) {
      endDate = new Date(marketData.end_date);
    } else if (marketData.resolution_date) {
      endDate = new Date(marketData.resolution_date);
    }
    
    if (endDate) {
      const now = new Date();
      const timeUntilEnd = endDate.getTime() - now.getTime();
      const hoursUntilEnd = timeUntilEnd / (1000 * 60 * 60);
      
      console.log(`      📅 End date: ${endDate.toISOString()}`);
      console.log(`      ⏰ Hours until end: ${hoursUntilEnd.toFixed(1)}`);
      
      if (endDate < now) {
        console.log(`   ❌ Market has expired (end date: ${endDate.toISOString()})`);
        // Check if market state definitively shows it's closed
        if (marketData.state === 'resolved' || marketData.state === 'closed') {
          console.log(`   ❌ Market state is '${marketData.state}' - skipping`);
          return false;
        } else {
          console.log(`   ⚠️ Market past end date but state is '${marketData.state}' - checking orderbook...`);
          // Continue to check orderbook - if there's active trading, market might still be live
        }
      }
      
      if (hoursUntilEnd < 1 && hoursUntilEnd > 0) {
        console.log(`   ⚠️ Market expires very soon (${hoursUntilEnd.toFixed(1)} hours left)`);
        // Continue but with warning
      }
    } else {
      console.log(`      ℹ️ No end date found - assuming market is active`);
    }

    // Get the orderbook with timeout protection
    let orderBook: any;
    try {
      console.log(`      📊 Fetching orderbook for outcome ${outcomeId}...`);
      orderBook = await Promise.race([
        clobClient.getOrderBook(outcomeId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Orderbook fetch timeout')), 15000)
        )
      ]);
      console.log(`      ✅ Orderbook fetched successfully`);
    } catch (error: any) {
      console.log(`      ❌ Failed to fetch orderbook: ${error.message}`);
      console.log(`      ⚠️ Skipping price analysis for this outcome`);
      return false;
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
    
    // Check if orderbook indicates an active market
    const hasActiveLiquidity = (orderBook.bids && orderBook.bids.length > 0) || (orderBook.asks && orderBook.asks.length > 0);
    const reasonableSpread = (bestAskPrice - bestBidPrice) < 0.1; // Spread less than 10 cents
    
    if (!hasActiveLiquidity) {
      console.log(`   ❌ No active liquidity in orderbook - market appears closed`);
      return false;
    }
    
    if (!reasonableSpread) {
      console.log(`   ⚠️ Very wide spread (${((bestAskPrice - bestBidPrice) * 100).toFixed(2)}%) - market may be illiquid`);
    }
    
    console.log(`   ✅ Market appears active with liquidity`);
    
    // Check if the market meets our auto-betting criteria
    if (probability > MIN_PROBABILITY_THRESHOLD && marketData.state !== 'resolved') {
      console.log(`   📊 Probability check: ${(probability * 100).toFixed(2)}% (threshold: >${(MIN_PROBABILITY_THRESHOLD * 100).toFixed(2)}%)`);
      console.log(`   🎯 High probability opportunity detected: ${outcomeName} (${(probability * 100).toFixed(2)}%)`);
      
      if (myBalance > 5) {
        const betAmount = 2; // Fixed bet amount of $2 USDC
        
        if (betAmount < 1) {
          console.log(`   ❌ Bet amount too small (${betAmount} < $1)`);
          return false;
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
          return true; // Bet was successfully placed
        } else {
          console.log(`   ❌ Failed to place bet on ${outcomeName}`);
          return false;
        }
      } else {
        console.log(`   ❌ Insufficient balance for betting`);
        return false;
      }
    }
    
    // No bet was placed (didn't meet criteria)
    return false;
    
  } catch (error) {
    console.error(`❌ Error processing outcome ${outcomeId}:`, error);
    return false;
  }
}

/**
 * Update and track information for all specific market IDs
 * Also place bets on high probability outcomes (>90%)
 */
export async function betSellOnMarketId(clobClient: ClobClient): Promise<void> {
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
    const maxBetAmount = 1;
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
