import { ClobClient, Side } from '@polymarket/clob-client';
import { UserPositionInterface } from '../interfaces/User';
import { ethers } from 'ethers';

/**
 * Closes a position using the CLOB API
 * @param clobClient The CLOB client instance
 * @param position The position to close
 * @param type The type of close operation: 'redeem' for claiming winnings, 'sell' for selling tokens
 */
export default async function closePosition(
    clobClient: ClobClient, 
    position: UserPositionInterface, 
    type: 'redeem' | 'sell' = 'sell'
) {
    try {            // For positions that are redeemable (resolved markets), use redeem
        if (type === 'redeem' && position.redeemable) {
            console.log(`🏆 Redeeming position for market: ${position.title || position.conditionId}`);
            console.log(`   Token: ${position.asset}`);
            console.log(`   Amount: ${position.size} tokens`);
            
            // Round down to integer - Polymarket only accepts integer token amounts
            const integerAmount = Math.floor(position.size);
            console.log(`   Amount (integer only): ${integerAmount} tokens`);
            
            if (integerAmount <= 0) {
                console.log('❌ Position too small to redeem (less than 1 token)');
                return;
            }
            
            // Call the Contract directly as the CLOB API doesn't have a redeemPositions method
            // We'll use a different approach via the standalone claim-all-positions.js script
            console.log('⚠️ Direct redemption not available through CLOB API');
            console.log('💡 Use the standalone script: node claim-all-positions.js');
            
            return { status: 'not_supported' };
        } 
        // For active markets, use the sell order
        else if (type === 'sell') {
            console.log(`💰 Selling position for market: ${position.title || position.conditionId}`);
            console.log(`   Token: ${position.asset}`);
            console.log(`   Amount: ${position.size} tokens`);
            
            // Get the market data
            const market = await clobClient.getMarket(position.conditionId);
            if (!market) {
                throw new Error(`Market not found for condition ID: ${position.conditionId}`);
            }
            
            // Find the right outcome index
            const outcomeIndex = market.outcomeIds.findIndex((id: string) => 
                id.toLowerCase() === position.asset.toLowerCase()
            );
            
            if (outcomeIndex === -1) {
                throw new Error(`Could not find outcome matching asset ${position.asset} in market`);
            }
            
            // Place a market sell order
            const order = await clobClient.createOrder({
                tokenID: position.asset,
                side: Side.SELL,
                price: 0.01, // Market sell - use minimum price
                size: Number(position.size),
                feeRateBps: 50, // Default fee rate
                taker: "0x0000000000000000000000000000000000000000" // Public order
            });
            
            console.log(`📤 Sell order submitted: ${order.id || 'Success'}`);
            return order;
        }
    } catch (error) {
        console.error(`❌ Error closing position:`, error);
        throw error;
    }
}
