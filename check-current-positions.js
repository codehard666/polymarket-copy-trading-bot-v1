const { ethers } = require('ethers');
require('dotenv').config();

async function getPositions() {
    try {
        const response = await fetch(`https://data-api.polymarket.com/positions?user=${process.env.PROXY_WALLET}`);
        if (!response.ok) {
            throw new Error(`Error fetching positions: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('❌ Error fetching positions:', error);
        return [];
    }
}

(async () => {
    console.log('🔍 Checking current positions...\n');
    
    const positions = await getPositions();
    const redeemablePositions = positions.filter(pos => pos.redeemable === true);
    
    console.log(`Found ${redeemablePositions.length} redeemable positions:`);
    
    if (redeemablePositions.length === 0) {
        console.log('No redeemable positions found.');
        return;
    }
    
    redeemablePositions.forEach((pos, index) => {
        console.log(`\n=== Position ${index + 1} ===`);
        console.log(`Title: ${pos.title}`);
        console.log(`Asset Token ID: ${pos.asset}`);
        console.log(`Asset Token Hex: 0x${BigInt(pos.asset).toString(16)}`);
        console.log(`Condition ID: ${pos.conditionId}`);
        console.log(`Outcome Index: ${pos.outcomeIndex} (${pos.outcome})`);
        console.log(`Size: ${pos.size} tokens`);
        console.log(`Market: ${pos.market}`);
        console.log(`Redeemable: ${pos.redeemable}`);
    });
})();
