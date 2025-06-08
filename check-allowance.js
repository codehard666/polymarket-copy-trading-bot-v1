const { ethers } = require('ethers');
require('dotenv').config();

// Configuration from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS;

// Polymarket exchange contract address on Polygon
const POLYMARKET_EXCHANGE_ADDRESS = '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e'; // CTF Exchange

const USDC_ABI = [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)'
];

async function checkAllowance() {
    try {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, wallet);
        
        console.log(`📍 Checking for wallet: ${wallet.address}`);
        
        const balance = await usdcContract.balanceOf(wallet.address);
        const balanceFormatted = ethers.utils.formatUnits(balance, 6);
        
        const allowance = await usdcContract.allowance(wallet.address, POLYMARKET_EXCHANGE_ADDRESS);
        const allowanceFormatted = ethers.utils.formatUnits(allowance, 6);
        
        console.log(`Current USDC balance: ${balanceFormatted} USDC`);
        console.log(`Raw balance: ${balance.toString()}`);
        console.log(`USDC Allowance for exchange: ${allowanceFormatted} USDC`);
        
        if (parseFloat(allowanceFormatted) === 0) {
            console.log(`❌ No allowance set! Run: node approve-usdc.js`);
        } else if (parseFloat(allowanceFormatted) < parseFloat(balanceFormatted)) {
            console.log(`⚠️ Allowance (${allowanceFormatted} USDC) is less than your balance (${balanceFormatted} USDC)`);
            console.log(`💡 Consider increasing your allowance: node approve-usdc.js`);
        } else {
            console.log(`✅ Allowance is set, ready to trade!`);
        }
        
    } catch (error) {
        console.error('Error checking allowance:', error);
    }
}

checkAllowance();
