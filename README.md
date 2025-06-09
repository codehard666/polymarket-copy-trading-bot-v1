node approve-usdc.js force
node approve-polymarket-nfts.js
node check-allowance.js 
node check-trading-setup.js 
node analyze-ctf-events.js
node check-matic.js
node reset-failed-trades.js
npm run build
npm run start
npm run start:sell-all
npm run start:claim-all
npm run start:skip-past-trades
node force-claim-position.js
node force-claim-position.js 0xe7faa8aacdd9ea6eff958cb58669265a011d4669bf46c7a0c1ef64313f81e737 1


# Polymarket Copy Trading Bot

## Introduction
This project is a Polymarket Copy Trading Bot that allows users to automatically copy trades from a selected trader on Polymarket.

## Features
- **Automated Trading**: Automatically copy trades from a selected trader.
- **Real-time Monitoring**: Continuously monitor the selected trader's activity.
- **Customizable Settings**: Configure trading parameters and risk management.
- **Sell All Option**: Liquidate all open positions before starting to copy trades.
- **Claim All Option**: Claim all redeemable winning positions.

## Trading Algorithm

### Monitoring System
- **Check Interval**: Bot checks for new trades every `FETCH_INTERVAL` seconds (default: 1 second)
- **Trade Age Filter**: Only processes trades newer than `TOO_OLD_TIMESTAMP` hours (default: 24 hours)
- **Data Source**: Fetches user activities and positions from Polymarket API with 400 records per request

### Trade Copying Logic

#### Buy Orders
- Calculates position size based on relative USDC balance:
  ```
  ratio = my_balance / (user_balance + trade.usdcSize)
  my_trade_size = user_trade_size * ratio
  ```
- Example: If you have 1000 USDC and the user has 10000 USDC, and they make a 1000 USDC trade, your trade will be 90.9 USDC (1000/(10000+1000) * 1000)

#### Sell Orders
- Calculates sell amount based on position size ratio:
  ```
  ratio = user_sell_size / (user_position_size + user_sell_size)
  my_sell_size = my_position_size * ratio
  ```
- If user has no previous position, sells your entire position

#### Safety Measures
1. **Price Protection**:
   - Won't execute if market price has moved more than 0.20 higher than original trade price
   - Uses best available price from orderbook

2. **Size Limits**:
   - Minimum trade: 2 tokens or $1 USD (whichever is larger)
   - Maximum trade: Limited by available balance and order book liquidity

3. **Trade Validation**:
   - Unique trade detection using transaction hash and trade details
   - Retries failed trades up to `RETRY_LIMIT` times (default: 3)
   - Tracks trade execution status in database

### Transaction Flow
1. New trade detected → Check if unique
2. Calculate proportional size based on balance ratio
3. Verify price hasn't moved significantly
4. Place market order with Fill-or-Kill (FOK) execution
5. Update database with trade status
6. If failed, retry up to configured limit

## Installation
1. Install latest version of Node.js and npm
2. Navigate to the project directory:
    ```bash
    cd polymarket_copy_trading_bot
    ```
3. Create `.env` file:
    ```bash
    touch .env
    ```
4. Configure env variables:
    ```typescript
    USER_ADDRESS = 'Selected account wallet address to copy'

    PROXY_WALLET = 'Your Polymarket account address'
    PRIVATE_KEY = 'My wallet private key'

    CLOB_HTTP_URL = 'https://clob.polymarket.com/'
    CLOB_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws'

    FETCH_INTERVAL = 1      // default is 1 second
    TOO_OLD_TIMESTAMP = 1   // default is 1 hour
    RETRY_LIMIT = 3         // default is 3 times

    MONGO_URI = 'mongodb+srv://polymarket_copytrading_bot:V5ufvi9ra1dsOA9M@cluster0.j1flc.mongodb.net/polymarket_copytrading'

    RPC_URL = 'https://polygon-mainnet.infura.io/v3/90ee27dc8b934739ba9a55a075229744'

    USDC_CONTRACT_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
    ```
5. Install the required dependencies:
    ```bash
    npm install
    ```
6. If you encounter ethers.js version issues, ensure compatibility:
    ```bash
    npm install ethers@^6.0.0
    ```
7. Build the project:
    ```bash
    npm run build
    ```
8. Run BOT:
    ```bash
    npm run start
    ```

## Troubleshooting

### Ethers.js Import Issues
If you see "JsonRpcProvider is not a constructor" or "ethers is not defined" errors:

1. **Check your ethers version:**
   ```bash
   npm list ethers
   ```

2. **For ethers v6 (recommended):**
   ```bash
   npm install ethers@^6.0.0
   ```
   Update imports to use:
   ```javascript
   const { JsonRpcProvider, Contract, formatUnits, parseUnits } = require('ethers');
   ```

3. **For ethers v5 (legacy):**
   ```bash
   npm install ethers@^5.7.2
   ```
   Update imports to use:
   ```javascript
   const { ethers } = require('ethers');
   // Then use: new ethers.providers.JsonRpcProvider()
   ```

### Transaction Failures
If claiming positions fails with "transaction failed" errors:

1. **Check MATIC balance:**
   ```bash
   node check-matic.js
   ```

2. **Verify position status:**
   - Ensure positions are actually redeemable
   - Check if market has been resolved by the oracle
   - Verify you haven't already claimed the position

3. **Check gas settings:**
   - Increase gas limit in the claiming function
   - Ensure MATIC balance covers transaction fees

### Common Commands for Debugging
```bash
# Check wallet and setup status
node check-trading-setup.js

# Check MATIC balance for gas fees
node check-matic.js

# Reset any failed trade records
node reset-failed-trades.js reset

# Analyze CTF contract events (requires ethers fix)
node analyze-ctf-events.js

# Force approve USDC if needed
node approve-usdc.js force

# Approve NFT trading permissions
node approve-polymarket-nfts.js
```

## Command Reference

### Setup and Configuration Commands
```bash
# Approve USDC spending for Polymarket. The 'force' flag will reset and reapprove even if already approved
node approve-usdc.js force

# Approve NFT trading permissions required for Polymarket trading
node approve-polymarket-nfts.js

# Check current USDC allowance for your wallet
node check-allowance.js 

# Verify your wallet is properly configured for trading (checks allowances, balances, and permissions)
node check-trading-setup.js 

# Analyze Conditional Token Framework (CTF) events for debugging position issues
node analyze-ctf-events.js

# Check your MATIC balance for gas fees
node check-matic.js

# Reset failed trade records in the database. Useful if trades got stuck
node reset-failed-trades.js
```

### Core Bot Commands
```bash
# Build the TypeScript project
npm run build

# Start the bot in normal trading mode
npm run start

# Start bot after selling all current positions
npm run start:sell-all

# Start bot and claim all redeemable winning positions first
npm run start:claim-all

# Start bot ignoring all past trades (only copy new trades from start time)
npm run start:skip-past-trades
```

### Position Management Commands
```bash
# Force claim a specific position when automatic claiming fails
node force-claim-position.js

# Force claim a specific position by condition ID and outcome index
# Example: Claiming outcome index 1 for condition 0xe7faa...
node force-claim-position.js 0xe7faa8aacdd9ea6eff958cb58669265a011d4669bf46c7a0c1ef64313f81e737 1
```

### Common Command Sequences

1. **Initial Setup**:
   ```bash
   node check-trading-setup.js  # Check configuration
   node approve-usdc.js force   # Approve USDC spending
   node approve-polymarket-nfts.js  # Approve NFT trading
   npm run build               # Build the project
   ```

2. **Fresh Start (No Previous Positions)**:
   ```bash
   node check-matic.js        # Verify gas balance
   npm run build
   npm run start:skip-past-trades
   ```

3. **Start After Cleaning Up**:
   ```bash
   node reset-failed-trades.js  # Clear any failed trades
   npm run start:sell-all      # Sell existing positions first
   ```

4. **Claim and Continue**:
   ```bash
   npm run start:claim-all    # Claim winnings and continue trading
   ```

## Timing Parameters
- **Fetch Interval**: Bot checks for new trades every 1 second (configurable via `FETCH_INTERVAL`)
- **Trade History**: Looks back 24 hours for trades (configurable via `TOO_OLD_TIMESTAMP`)
- **API Polling**: Makes API requests every second to get latest user activities
- **Order Execution**: Places orders immediately after detection with FOK (Fill-or-Kill) execution
- **Retry Timing**: On failure, retries up to 3 times (configurable via `RETRY_LIMIT`)

## Proxy Wallet System
The bot uses a proxy wallet system where:
1. Main monitoring wallet (`USER_ADDRESS`): The address being copied
2. Trading wallet (`PROXY_WALLET`): Your wallet that executes the trades
3. Transaction flow:
   - Monitor main wallet for trades
   - Calculate proportional amounts
   - Execute trades from proxy wallet
   - Track execution status in database

This separation ensures:
- Clean transaction history tracking
- Independent balance management
- No interference with original trader's activities

## Contributing
Contributions are welcome! Please open an issue or submit a pull request. And if you are interested in this project, please consider giving it a star✨.

## Contact
For any questions or inquiries, please contact me at [Telegram](https://t.me/trust4120).
