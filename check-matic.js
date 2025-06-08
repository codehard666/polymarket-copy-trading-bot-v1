const { ethers } = require('ethers');
require('dotenv').config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;

async function checkMaticBalance() {
    try {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        
        console.log(`📍 Checking for wallet: ${wallet.address}`);
        
        const balance = await provider.getBalance(wallet.address);
        const balanceFormatted = ethers.utils.formatEther(balance);
        
        console.log(`Current MATIC balance: ${balanceFormatted} MATIC`);
        
        if (parseFloat(balanceFormatted) < 0.01) {
            console.log(`❌ Low MATIC balance! You need MATIC for gas fees.`);
            console.log(`💡 Get some MATIC from https://wallet.polygon.technology/`);
        } else {
            console.log(`✅ MATIC balance is sufficient for gas fees!`);
        }
        
    } catch (error) {
        console.error('Error checking MATIC balance:', error);
    }
}

checkMaticBalance();
