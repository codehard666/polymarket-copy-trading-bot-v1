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

## Advanced Features

### Enhanced Retry Logic
The claiming process includes sophisticated retry logic:
- Each position redemption will be attempted up to 3 times if it fails
- Exponential backoff delay between retries (5s, 10s, 20s) helps avoid rate limiting
- A 10-second delay between different positions ensures the RPC provider doesn't throttle requests
- Different error types are handled with appropriate strategies:
  - Contract execution errors (typically not retried as they indicate a fundamental issue)
  - Transaction state errors (e.g., nonce issues, not retried)
  - RPC/network errors (retried with backoff)
  - Gas/funds errors (not retried, requires user action)

### Improved Token ID Handling
- Token IDs are properly converted to BigNumber format for the contract call
- Multiple conversion methods are attempted if standard conversion fails
- Clear logs show the exact token ID being used in the transaction

### Better Gas Management
- Increased default gas limits (350,000 gas units) to avoid out-of-gas errors
- Higher priority fees (35 gwei) to increase chances of quick inclusion
- Higher max fees (120 gwei) to ensure transactions go through during congestion
- Balance checks before transactions to warn about insufficient funds

### ENS Error Prevention
- ENS lookups are explicitly disabled in the provider configuration
- Multiple fallback mechanisms ensure ENS-related errors don't occur
- Provider connection is tested before attempting transactions

### Comprehensive Error Handling
- Detailed error categorization for different types of failures
- Error messages include Polygonscan links for transaction investigation
- Post-execution summary shows success/failure statistics
- Tips provided for addressing failed transactions

### Transaction Monitoring
- Gas usage statistics are displayed for successful transactions
- Transactions include links to Polygonscan for easier tracking
- Detailed logs help diagnose any issues that occur

## Troubleshooting
If you encounter issues with the claim_all feature:

1. **RPC Provider Errors**: These are typically temporary - try again later or use a different RPC URL
2. **Insufficient Funds**: Ensure your wallet has enough MATIC for gas fees (at least 0.1 MATIC recommended)
3. **Transaction Failures**: Check if positions are truly redeemable; they may have already been claimed
4. **Gas Issues**: Try increasing the gas settings in the code (DEFAULT_MAX_PRIORITY_FEE and DEFAULT_MAX_FEE)
5. **Contract Errors**: Some positions may appear redeemable in the API but can't be claimed due to contract state
- The bot will continue processing other positions even if some fail

## Notes
- Only positions that are marked as "redeemable" will be processed
- If a position cannot be claimed (after all retry attempts), the bot will still proceed with the next position
- You can monitor the claiming process in the console logs
- You need sufficient MATIC in your wallet for gas fees to execute claim transactions
- **Important**: The bot will round down any fractional token amounts to integers when claiming, as the Polymarket contract only accepts integer token amounts for redemption
- For reliability, the token redemption process uses direct contract calls with specific data formatting to avoid ENS-related errors
