# Polymarket Copy Trading Bot - Claim All Feature

## Overview
This bot now includes a "claim_all" feature that allows you to redeem all your settled winning positions from resolved markets before starting the copy trading process. This is useful for claiming winnings automatically without having to run a separate script.

## Usage

### Normal Operation
To run the bot normally (without claiming positions):
```bash
npm run build
npm run start
```

### Claim All Operation
To run the bot with the claim_all feature (redeem all winnings first):
```bash
npm run build
npm run start:claim-all
```

Or for development mode:
```bash
npm run dev:claim-all
```

## How It Works
When the "claim_all" flag is provided:

1. The bot will first fetch all your current positions from the Polymarket API
2. It will filter for positions that are redeemable (from resolved markets where you own winning outcome tokens)
3. For each redeemable position, it will submit a transaction to claim your winnings
4. Once all positions are claimed (or attempts have been made), the bot will continue with normal copy trading operations

## Notes
- Only positions that are marked as "redeemable" will be processed
- If a position cannot be claimed (due to transaction errors or other issues), the bot will still proceed with the next position
- You can monitor the claiming process in the console logs
- You need sufficient MATIC in your wallet for gas fees to execute claim transactions
- **Important**: The bot will round down any fractional token amounts to integers when claiming, as the Polymarket contract only accepts integer token amounts for redemption
- If you encounter "network does not support ENS" errors, this has been fixed by using a special wallet initialization method that avoids ENS lookups on Polygon

## Error Handling
If any errors occur during the claiming process:
- The bot will log the error and continue with the next position
- Even if not all positions can be claimed, the bot will still proceed with normal operation
