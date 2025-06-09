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

## Usage

### Regular Copy Trading
To build and run the bot for normal copy trading:
```bash
npm run build
npm run start
```

### Liquidate All Positions First
To liquidate all your current positions before starting copy trading:
```bash
npm run build
npm run start:sell-all
```

For more details about the sell_all feature, see [SELL_ALL_FEATURE.md](SELL_ALL_FEATURE.md).

## Contributing
Contributions are welcome! Please open an issue or submit a pull request. And if you are interested in this project, please consider giving it a star✨.

## Contact
For any questions or inquiries, please contact me at [Telegram](https://t.me/trust4120).
