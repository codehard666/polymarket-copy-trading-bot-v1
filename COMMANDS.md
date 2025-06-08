# Polymarket Position Management Commands

## Copy Trading Commands
- `npm run build` - Build the application
- `npm run start` - Start the copy trading bot (normal operation)
- `npm run start:sell-all` - Sell all positions before starting copy trading
- `npm run dev` - Run in development mode
- `npm run dev:sell-all` - Run in development mode and sell all positions first

## Standalone Commands

### USDC Management
- `node check-allowance.js` - Check current USDC balance and exchange allowance
- `node approve-usdc.js` - Approve USDC for the exchange (only if needed)
- `node approve-usdc.js force` - Force approval of USDC regardless of current allowance
- `node approve-usdc.js force [amount]` - Force approval with a custom amount
- `node transfer-usdc.js` - Transfer USDC between wallets

### Position Management
- `node claim-all-positions.js` - Claim all redeemable positions (winnings from resolved markets)
- `node claim-all-positions.js [maxPriorityFee] [maxFee]` - Claim all with custom gas settings

### Wallet Management
- `node check-matic.js` - Check MATIC balance for gas fees
- `node get-matic-faucets.js` - Get a list of MATIC faucets
- `node wallet-info.js` - Display complete wallet information

### NFT Management
- `node approve-polymarket-nfts.js` - Approve NFTs for the exchange

### Troubleshooting
- `node reset-failed-trades.js` - Reset failed trades for retry
- `node check-trading-setup.js` - Verify trading setup configuration
