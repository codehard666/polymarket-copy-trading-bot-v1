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
        const ratio = my_balance / (user_balance + trade.usdcSize);
        console.log('ratio', ratio);
        let remaining = trade.usdcSize * ratio;
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
            let order_arges;
            // Calculate token amount: USDC amount / price = token shares
            let tokenAmount = remaining / parseFloat(minPriceAsk.price);
            
            // Ensure minimum 2 tokens for testing phase
            const minTokens = 2;
            if (tokenAmount < minTokens) {
                console.log(`Calculated token amount (${tokenAmount.toFixed(6)}) is less than minimum (${minTokens}). Setting to minimum.`);
                tokenAmount = minTokens;
                remaining = tokenAmount * parseFloat(minPriceAsk.price); // Update remaining USDC needed
                console.log(`Updated remaining USDC needed: ${remaining.toFixed(6)}`);
            }
            
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
            
            // Check if order meets minimum $1 USD requirement
            if (orderValueUSD < 1.0) {
                console.log(`Order value ($${orderValueUSD.toFixed(2)}) is below minimum $1. Adjusting to $1 minimum.`);
                tokenAmount = 1.0 / parseFloat(minPriceAsk.price);
                remaining = 1.0; // Set remaining to $1
            }
            
            if (tokenAmount <= parseFloat(minPriceAsk.size)) {
                order_arges = {
                    side: Side.BUY,
                    tokenID: trade.asset,
                    amount: Math.floor(tokenAmount * 1000000) / 1000000, // Round to 6 decimals
                    price: parseFloat(minPriceAsk.price),
                };
            } else {
                order_arges = {
                    side: Side.BUY,
                    tokenID: trade.asset,
                    amount: parseFloat(minPriceAsk.size),
                    price: parseFloat(minPriceAsk.price),
                };
            }
            console.log('Order args:', order_arges);
            const signedOrder = await clobClient.createMarketOrder(order_arges);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted order:', resp);
                remaining -= order_arges.amount * order_arges.price; // Subtract USDC amount spent
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
    } else if (condition === 'sell') {          //Sell strategy
        console.log('Sell Strategy...');
        let remaining = 0;
        if (!my_position) {
            console.log('No position to sell');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        } else if (!user_position) {
            remaining = my_position.size;
        } else {
            const ratio = trade.size / (user_position.size + trade.size);
            console.log('ratio', ratio);
            remaining = my_position.size * ratio;
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
            let order_arges;
            if (remaining <= parseFloat(maxPriceBid.size)) {
                order_arges = {
                    side: Side.SELL,
                    tokenID: trade.asset,
                    amount: remaining,
                    price: parseFloat(maxPriceBid.price),
                };
            } else {
                order_arges = {
                    side: Side.SELL,
                    tokenID: trade.asset,
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
    } else {
        console.log('Condition not supported');
    }
};

export default postOrder;
