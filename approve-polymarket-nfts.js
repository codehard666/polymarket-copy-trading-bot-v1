const { ethers } = require('ethers');
require('dotenv').config();

// Configuration from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const MAX_PRIORITY_FEE = process.env.MAX_PRIORITY_FEE || '30'; // GWEI
const MAX_FEE = process.env.MAX_FEE || '100'; // GWEI

// Polymarket CTF Exchange Contract
const POLYMARKET_EXCHANGE_ADDRESS = '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e'; 

// Polymarket's Conditional Token Framework Contract on Polygon
// Source: https://docs.polymarket.com/architecture-overview/contract-addresses
const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';

// CTF Contract Interface with approval methods for both ERC-1155 and ERC-20 style tokens
const CTF_ABI = [
  // ERC-1155 style approval
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  // ERC-20 style token approval
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

async function approvePolymarketExchange() {
    try {
        console.log('🔄 Setting up wallet and provider...');
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, CTF_ABI, wallet);

        console.log(`📍 Wallet address: ${wallet.address}`);
        console.log(`📜 Conditional Token Framework (CTF) Contract: ${POLYMARKET_CTF_ADDRESS}`);
        console.log(`🏪 Exchange Contract (Operator): ${POLYMARKET_EXCHANGE_ADDRESS}`);
        
        console.log('🔍 Checking current approvals...');
        
        // First, try ERC-1155 style approval
        try {
            const isNftApproved = await ctfContract.isApprovedForAll(wallet.address, POLYMARKET_EXCHANGE_ADDRESS);
            console.log(`📋 Current NFT approval (ERC-1155 style): ${isNftApproved}`);
            
            if (!isNftApproved) {
                // Gas settings
                const maxPriorityFeePerGas = ethers.utils.parseUnits(MAX_PRIORITY_FEE, 'gwei');
                const maxFeePerGas = ethers.utils.parseUnits(MAX_FEE, 'gwei');
                
                console.log('🔐 Setting approval for all position tokens...');
                const tx = await ctfContract.setApprovalForAll(POLYMARKET_EXCHANGE_ADDRESS, true, {
                    maxPriorityFeePerGas,
                    maxFeePerGas
                });
                console.log(`📤 Transaction hash: ${tx.hash}`);
                console.log('⏳ Waiting for confirmation...');
                
                const receipt = await tx.wait();
                console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
            } else {
                console.log('✅ NFT approval already set!');
            }
        } catch (nftError) {
            console.log('⚠️ ERC-1155 style approval check failed, trying standard ERC-20 style...');
            
            try {
                // Try ERC-20 style approval as fallback
                const allowance = await ctfContract.allowance(wallet.address, POLYMARKET_EXCHANGE_ADDRESS);
                console.log(`📋 Current token allowance (ERC-20 style): ${ethers.utils.formatUnits(allowance, 0)}`);
                
                if (allowance.eq(0)) {
                    // Maximum possible approval in Ethereum
                    const maxUint256 = ethers.constants.MaxUint256;
                    
                    // Gas settings
                    const maxPriorityFeePerGas = ethers.utils.parseUnits(MAX_PRIORITY_FEE, 'gwei');
                    const maxFeePerGas = ethers.utils.parseUnits(MAX_FEE, 'gwei');
                    
                    console.log('🔐 Setting token approval...');
                    const tx = await ctfContract.approve(POLYMARKET_EXCHANGE_ADDRESS, maxUint256, {
                        maxPriorityFeePerGas,
                        maxFeePerGas
                    });
                    console.log(`📤 Transaction hash: ${tx.hash}`);
                    console.log('⏳ Waiting for confirmation...');
                    
                    const receipt = await tx.wait();
                    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
                } else {
                    console.log('✅ Token approval already set!');
                }
            } catch (erc20Error) {
                throw new Error('Both approval mechanisms failed. Contract may not be compatible.');
            }
        }

        console.log('🎉 Polymarket approvals completed! You should now be able to place orders.');

    } catch (error) {
        console.error('❌ Error setting approvals:', error);
        console.log('\n💡 If you\'re encountering issues, consider:');
        console.log('1. Setting approvals directly through the Polymarket website');
        console.log('2. Importing your wallet into MetaMask and using the Polymarket UI');
        console.log('3. Visiting Polymarket\'s support if issues persist');
    }
}

// Update the .env file with Polymarket contract information
function addContractAddressesToEnv() {
    try {
        console.log('\n✏️ Adding Polymarket contract addresses to .env file...');
        
        const fs = require('fs');
        const envPath = '/home/radu/Projects/polymarket-copy-trading-bot-v1/.env';
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // Add contract addresses if they don't exist
        if (!envContent.includes('POLYMARKET_CTF_ADDRESS')) {
            envContent += `\n# Polymarket contract addresses`;
            envContent += `\nPOLYMARKET_CTF_ADDRESS=${POLYMARKET_CTF_ADDRESS}`;
            envContent += `\nPOLYMARKET_EXCHANGE_ADDRESS=${POLYMARKET_EXCHANGE_ADDRESS}\n`;
            
            fs.writeFileSync(envPath, envContent);
            console.log('✅ Contract addresses added to .env file');
        } else {
            console.log('✅ Contract addresses already exist in .env file');
        }
    } catch (error) {
        console.error('❌ Error updating .env file:', error);
    }
}

// Run the script
async function main() {
    await approvePolymarketExchange();
    addContractAddressesToEnv();
}

main().catch(console.error);
