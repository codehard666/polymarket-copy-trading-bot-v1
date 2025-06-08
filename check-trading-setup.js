const { ethers } = require('ethers');
require('dotenv').config();

// Configuration from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS;

// Polymarket exchange contract address on Polygon
const POLYMARKET_EXCHANGE_ADDRESS = '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e'; // CTF Exchange

const USDC_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)'
];

async function checkTradingSetup() {
    try {
        console.log('🔍 Checking Polymarket trading setup...');
        
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, wallet);
        
        console.log(`\n📍 Wallet address: ${wallet.address}`);
        
        // Check MATIC balance
        const maticBalance = await provider.getBalance(wallet.address);
        const maticBalanceFormatted = ethers.utils.formatEther(maticBalance);
        console.log(`\n💰 MATIC balance: ${maticBalanceFormatted} MATIC`);
        
        if (parseFloat(maticBalanceFormatted) < 0.01) {
            console.log(`❌ WARNING: Low MATIC balance. You need MATIC for gas fees.`);
            console.log(`   Get MATIC from a faucet or exchange.`);
        } else {
            console.log(`✅ MATIC balance sufficient for gas fees.`);
        }
        
        // Check USDC balance
        const usdcBalance = await usdcContract.balanceOf(wallet.address);
        const usdcBalanceFormatted = ethers.utils.formatUnits(usdcBalance, 6);
        console.log(`\n💵 USDC balance: ${usdcBalanceFormatted} USDC`);
        
        // Check USDC allowance
        const allowance = await usdcContract.allowance(wallet.address, POLYMARKET_EXCHANGE_ADDRESS);
        const allowanceFormatted = ethers.utils.formatUnits(allowance, 6);
        console.log(`\n🔒 USDC allowance for Polymarket: ${allowanceFormatted} USDC`);
        
        // Compare balance and allowance
        const balanceNum = parseFloat(usdcBalanceFormatted);
        const allowanceNum = parseFloat(allowanceFormatted);
        
        console.log('\n📊 Status check:');
        
        // Check if allowance is sufficient
        if (allowanceNum === 0) {
            console.log(`❌ No USDC allowance set for Polymarket exchange!`);
            console.log(`   Run: node approve-usdc.js`);
        } else if (allowanceNum < balanceNum) {
            console.log(`⚠️ USDC allowance (${allowanceNum}) is less than balance (${balanceNum}).`);
            console.log(`   This might limit your trading. Consider running: node approve-usdc.js`);
        } else {
            console.log(`✅ USDC allowance is sufficient for your balance.`);
        }
        
        console.log('\n📋 Overall readiness:');
        if (parseFloat(maticBalanceFormatted) >= 0.01 && allowanceNum >= balanceNum) {
            console.log(`✅ YOUR BOT IS READY FOR TRADING!`);
        } else {
            console.log(`❌ SETUP INCOMPLETE - Address the warnings above.`);
        }
        
    } catch (error) {
        console.error('Error checking trading setup:', error);
    }
}

checkTradingSetup();
