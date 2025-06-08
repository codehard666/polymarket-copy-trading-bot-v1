# Polymarket Copy Trading Bot - Sell All Feature

## Overview
This bot now includes a "sell_all" feature that allows you to liquidate all your current open positions before starting the copy trading process. This is useful when you want to start fresh or reset your portfolio.

## Usage

### Normal Operation
To run the bot normally (without selling positions):
```bash
npm run build
npm run start
```

### Sell All Operation
To run the bot with the sell_all feature (liquidate all positions first):
```bash
npm run build
npm run start:sell-all
```

Or for development mode:
```bash
npm run dev:sell-all
```

## How It Works
When the "sell_all" flag is provided:

1. The bot will first fetch all your current open positions from the Polymarket API
2. For each position, it will create market sell orders to liquidate them
3. The bot will attempt to sell at the best available market price
4. Once all positions are liquidated (or attempts have been made), the bot will continue with normal copy trading operations

## Notes
- The liquidation process uses market orders, which means your positions will be sold at the best available price at the time
- If a position cannot be fully liquidated (due to low liquidity or other market conditions), the bot will still proceed with normal operation
- You can monitor the liquidation process in the console logs

## Error Handling
If any errors occur during the liquidation process:
- The bot will log the error and continue with the next position
- Even if not all positions can be liquidated, the bot will still proceed with normal operation
