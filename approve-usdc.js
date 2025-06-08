const { ethers } = require('ethers');
require('dotenv').config();

// Configuration from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS;

// Polymarket exchange contract address on Polygon
const POLYMARKET_EXCHANGE_ADDRESS = '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e'; // CTF Exchange

// Gas price settings from .env or defaults
const DEFAULT_MAX_PRIORITY_FEE = process.env.MAX_PRIORITY_FEE || '30'; 
const DEFAULT_MAX_FEE = process.env.MAX_FEE || '100';

const USDC_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)'
];

async function approveUSDC(force = false, customAmount = null, maxPriorityFee = DEFAULT_MAX_PRIORITY_FEE, maxFee = DEFAULT_MAX_FEE) {
    try {
        console.log('🔄 Setting up wallet and provider...');
        
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, wallet);
        
        console.log(`📍 Wallet address: ${wallet.address}`);
        console.log(`💰 USDC contract: ${USDC_CONTRACT_ADDRESS}`);
        console.log(`🏪 Exchange contract: ${POLYMARKET_EXCHANGE_ADDRESS}`);
        
        // Check current balance
        const balance = await usdcContract.balanceOf(wallet.address);
        const balanceFormatted = ethers.utils.formatUnits(balance, 6);
        console.log(`💵 Current USDC balance: ${balanceFormatted} USDC`);
        
        // Check current allowance
        const currentAllowance = await usdcContract.allowance(wallet.address, POLYMARKET_EXCHANGE_ADDRESS);
        const allowanceFormatted = ethers.utils.formatUnits(currentAllowance, 6);
        console.log(`📋 Current allowance: ${allowanceFormatted} USDC`);
        
        // Determine if we need to approve - either forced, no allowance, or allowance < balance
        const needsApproval = force || 
                             currentAllowance.eq(0) || 
                             currentAllowance.lt(balance);
                             
        if (!needsApproval) {
            console.log('✅ USDC allowance is sufficient! No action needed.');
            return;
        }
        
        // Gas price settings
        const maxPriorityFeePerGas = ethers.utils.parseUnits(maxPriorityFee, 'gwei');
        const maxFeePerGas = ethers.utils.parseUnits(maxFee, 'gwei');
        
        console.log(`⛽ Gas settings: Max Priority Fee: ${ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei')} GWEI, Max Fee: ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} GWEI`);
        
        // Approve amount
        let approveAmount;
        if (customAmount) {
            approveAmount = ethers.utils.parseUnits(customAmount, 6);
        } else {
            // Default: approve 2x the current balance to accommodate future deposits
            const amountToApprove = parseFloat(balanceFormatted) * 2;
            approveAmount = ethers.utils.parseUnits(amountToApprove.toFixed(6), 6);
        }
        
        console.log(`🔐 Approving ${ethers.utils.formatUnits(approveAmount, 6)} USDC for Polymarket exchange...`);
        
        const tx = await usdcContract.approve(
            POLYMARKET_EXCHANGE_ADDRESS, 
            approveAmount,
            {
                maxPriorityFeePerGas,
                maxFeePerGas
            }
        );
        console.log(`📤 Transaction hash: ${tx.hash}`);
        console.log('⏳ Waiting for confirmation...');
        
        const receipt = await tx.wait();
        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
        
        // Verify the new allowance
        const newAllowance = await usdcContract.allowance(wallet.address, POLYMARKET_EXCHANGE_ADDRESS);
        const newAllowanceFormatted = ethers.utils.formatUnits(newAllowance, 6);
        console.log(`🎉 New allowance: ${newAllowanceFormatted} USDC`);
        console.log('✅ USDC approval successful! You can now place trades.');
        
    } catch (error) {
        console.error('❌ Error approving USDC:', error);
        
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.log('💡 Make sure you have enough MATIC for gas fees on Polygon network');
        } else if (error.code === 'NETWORK_ERROR') {
            console.log('💡 Check your RPC URL and internet connection');
        } else if (error.error && error.error.code === -32000) {
            console.log('💡 Transaction underpriced: Try increasing the gas settings');
            console.log(`💡 Minimum required: ${error.error.message}`);
        }
    }
}

// Also create a function to check allowance only
async function checkAllowance() {
    try {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, wallet);
        
        const balance = await usdcContract.balanceOf(wallet.address);
        const balanceFormatted = ethers.utils.formatUnits(balance, 6);
        
        const allowance = await usdcContract.allowance(wallet.address, POLYMARKET_EXCHANGE_ADDRESS);
        const allowanceFormatted = ethers.utils.formatUnits(allowance, 6);
        
        console.log(`Current USDC balance: ${balanceFormatted} USDC`);
        console.log(`USDC Allowance for exchange: ${allowanceFormatted} USDC`);
        
        return { balance: balanceFormatted, allowance: allowanceFormatted };
    } catch (error) {
        console.error('Error checking allowance:', error);
    }
}

// Run based on command line argument
const command = process.argv[2];

if (command === 'check') {
    checkAllowance();
} else if (command === 'force') {
    // Force approval regardless of current allowance
    const customAmount = process.argv[3]; // Optional custom amount
    const maxPriorityFee = process.argv[4]; // Optional gas price parameters
    const maxFee = process.argv[5];
    approveUSDC(true, customAmount, maxPriorityFee, maxFee);
} else {
    // Regular approval (only if needed)
    const customAmount = process.argv[3]; // Optional custom amount
    const maxPriorityFee = process.argv[4]; // Optional gas price parameters
    const maxFee = process.argv[5];
    approveUSDC(false, customAmount, maxPriorityFee, maxFee);
}
