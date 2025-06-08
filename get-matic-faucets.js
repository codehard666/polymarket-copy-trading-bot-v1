const { ethers } = require('ethers');
require('dotenv').config();

const WALLET_ADDRESS = '0x67EDA02a8FF182DCCA8bE5D54553703B48Bf56C6';

console.log(`🪙 Free MATIC Faucets for your address: ${WALLET_ADDRESS}`);
console.log(`\n📍 Try these faucets (small amounts for testing):`);
console.log(`1. https://faucet.polygon.technology/`);
console.log(`2. https://faucets.chain.link/polygon-mainnet`);
console.log(`3. https://www.allthatnode.com/faucet/polygon.dsrv`);

console.log(`\n💡 For production amounts, you'll need to:`);
console.log(`- Buy MATIC on an exchange and withdraw to Polygon`);
console.log(`- Bridge ETH from Ethereum to Polygon MATIC`);
console.log(`- Use https://wallet.polygon.technology/ bridge`);

console.log(`\n⚠️ You need at least 0.01 MATIC for gas fees to approve USDC spending`);
