import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { getUserActivityModel } from '../models/userHistory';
import { ENV } from '../config/env';

const RETRY_LIMIT = ENV.RETRY_LIMIT;
const USER_ADDRESS = ENV.USER_ADDRESS;
const UserActivity = getUserActivityModel(USER_ADDRESS);

const postOrder = async (
    clobClient: ClobClient,
    condition: string,
    my_position: UserPositionInterface | undefined,
    user_position: UserPositionInterface | undefined,
    trade: UserActivityInterface,
    my_balance: number,
    user_balance: number
) => {
    //Merge strategy
    if (condition === 'merge') {
        console.log('Merging Strategy...');
        if (!my_position) {
            console.log('my_position is undefined');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }
        let remaining = my_position.size;
        let retry = 0;
        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) {
                console.log('No bids found');
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }

            const maxPriceBid = orderBook.bids.reduce((max, bid) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);

            console.log('Max price bid:', maxPriceBid);
            let order_arges;
            if (remaining <= parseFloat(maxPriceBid.size)) {
                order_arges = {
                    side: Side.SELL,
                    tokenID: my_position.asset,
                    amount: remaining,
                    price: parseFloat(maxPriceBid.price),
                };
            } else {
                order_arges = {
                    side: Side.SELL,
                    tokenID: my_position.asset,
                    amount: parseFloat(maxPriceBid.size),
                    price: parseFloat(maxPriceBid.price),
                };
            }
            console.log('Order args:', order_arges);
            const signedOrder = await clobClient.createMarketOrder(order_arges);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted order:', resp);
                remaining -= order_arges.amount;
            } else {
                retry += 1;
                console.log('Error posting order: retrying...', resp);
            }
        }
        if (retry >= RETRY_LIMIT) {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: retry });
        } else {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        }
    } else if (condition === 'buy') {       //Buy strategy
        console.log('Buy Strategy...');
        
        // Fixed 20:1 risk ratio - if user bets $1000, we bet $50
        const RISK_RATIO = 20;
        const ratio = 1 / RISK_RATIO;  // 1/20 = 0.05
        console.log('Fixed risk ratio 1:', RISK_RATIO, 'ratio:', ratio);
        let remaining = trade.usdcSize * ratio;  // We'll trade 5% of what the user trades

        // Enforce minimum order value of $1 USDC
        if (remaining < 1.0) {
            console.log(`Order value ($${remaining.toFixed(2)}) is below minimum $1`);
            await UserActivity.updateOne({ _id: trade._id }, { bot: true, botExecutionStatus: 'ORDER_TOO_SMALL' });
            return;
        }

        let retry = 0;
        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.asks || orderBook.asks.length === 0) {
                console.log('No asks found');
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }

            const minPriceAsk = orderBook.asks.reduce((min, ask) => {
                return parseFloat(ask.price) < parseFloat(min.price) ? ask : min;
            }, orderBook.asks[0]);

            console.log('Min price ask:', minPriceAsk);
            if (parseFloat(minPriceAsk.price) - 0.20 > trade.price) {
                console.log('Too big different price - do not copy');
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }

            // Calculate token amount: USDC amount / price = token shares
            let tokenAmount = remaining / parseFloat(minPriceAsk.price);
            console.log(`Attempting to buy ${tokenAmount.toFixed(6)} tokens at $${minPriceAsk.price} each`);

            // Check if we have enough balance for the required amount
            const orderValueUSD = tokenAmount * parseFloat(minPriceAsk.price);
            console.log(`Order value needed: $${orderValueUSD.toFixed(6)} USDC`);
            console.log(`Available balance: $${my_balance.toFixed(6)} USDC`);
            
            if (orderValueUSD > my_balance) {
                console.log(`⚠️ Insufficient balance! Need $${orderValueUSD.toFixed(6)} but only have $${my_balance.toFixed(6)}`);
                console.log(`💡 Either fund your wallet or check USDC allowance (run: node approve-usdc.js check)`);
                await UserActivity.updateOne(
                    { _id: trade._id }, 
                    { 
                        bot: true,
                        botExecutionStatus: 'INSUFFICIENT_BALANCE'
                    }
                );
                break;
            }

            let order_arges = {
                side: Side.BUY,
                tokenID: trade.asset,
                amount: Math.floor(tokenAmount * 1000000) / 1000000, // Round to 6 decimals
                price: parseFloat(minPriceAsk.price),
            };

            // If the order is larger than available liquidity, adjust it
            if (tokenAmount > parseFloat(minPriceAsk.size)) {
                order_arges.amount = parseFloat(minPriceAsk.size);
                console.log(`Adjusting order size to ${order_arges.amount} due to available liquidity`);
            }
            
            console.log('Order args:', order_arges);
            const signedOrder = await clobClient.createMarketOrder(order_arges);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted order:', resp);
                remaining -= order_arges.amount * order_arges.price; // Subtract USDC amount spent
                console.log(`Remaining USDC to spend: $${remaining.toFixed(6)}`);
            } else {
                retry += 1;
                console.log('Error posting order: retrying...', resp);
                
                // If we get an insufficient balance error, break out
                if (resp.error?.includes('not enough balance/allowance')) {
                    console.log('❌ Insufficient balance/allowance error, stopping');
                    await UserActivity.updateOne(
                        { _id: trade._id },
                        { 
                            bot: true,
                            botExecutionStatus: 'INSUFFICIENT_BALANCE'
                        }
                    );
                    break;
                }
            }
        }
        if (retry >= RETRY_LIMIT) {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: retry });
        } else {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        }
    } else if (condition === 'sell') {          //Sell strategy
        console.log('Sell Strategy...');
        if (!my_position) {
            console.log('No position to sell');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }

        // Fixed 20:1 risk ratio - same as buy strategy
        const RISK_RATIO = 2;
        const ratio = 1 / RISK_RATIO;  // 1/20 = 0.05 (5%)
        console.log('Fixed risk ratio 1:', RISK_RATIO, 'ratio:', ratio);
        let remaining = my_position.size * ratio;  // Sell 5% of our position

        // Ensure we have enough tokens to sell
        console.log(`Attempting to sell ${remaining.toFixed(6)} tokens`);
        if (remaining > my_position.size) {
            console.log(`⚠️ Not enough tokens! Trying to sell ${remaining.toFixed(6)} but only have ${my_position.size}`);
            await UserActivity.updateOne(
                { _id: trade._id },
                { 
                    bot: true,
                    botExecutionStatus: 'INSUFFICIENT_TOKENS'
                }
            );
            return;
        }

        let retry = 0;
        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) {
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
                console.log('No bids found');
                break;
            }

            const maxPriceBid = orderBook.bids.reduce((max, bid) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);

            console.log('Max price bid:', maxPriceBid);
            let order_arges = {
                side: Side.SELL,
                tokenID: trade.asset,
                amount: remaining,
                price: parseFloat(maxPriceBid.price),
            };

            // If the order is larger than available liquidity, adjust it
            if (remaining > parseFloat(maxPriceBid.size)) {
                order_arges.amount = parseFloat(maxPriceBid.size);
                console.log(`Adjusting order size to ${order_arges.amount} due to available liquidity`);
            }

            console.log('Order args:', order_arges);
            const signedOrder = await clobClient.createMarketOrder(order_arges);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted order:', resp);
                remaining -= order_arges.amount;
                console.log(`Remaining tokens to sell: ${remaining.toFixed(6)}`);
            } else {
                retry += 1;
                console.log('Error posting order: retrying...', resp);
                
                // If we get an insufficient balance error, break out
                if (resp.error?.includes('not enough balance/allowance')) {
                    console.log('❌ Insufficient tokens error, stopping');
                    await UserActivity.updateOne(
                        { _id: trade._id },
                        { 
                            bot: true,
                            botExecutionStatus: 'INSUFFICIENT_TOKENS'
                        }
                    );
                    break;
                }
            }
        }
        if (retry >= RETRY_LIMIT) {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: retry });
        } else {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        }
    } else {
        console.log('Condition not supported');
    }
};

export default postOrder;
