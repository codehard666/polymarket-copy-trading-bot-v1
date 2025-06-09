const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const RPC_URLS = [
    process.env.RPC_URL,
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.network',
    'https://matic-mainnet.chainstacklabs.com',
    'https://polygon-mainnet.public.blastapi.io'
];

const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

// ABI just for what we need
const ABI = [
    'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
    'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)'
];

const positions = [
    {
        title: "Rangers vs. Nationals",
        conditionId: "0xe7faa8aacdd9ea6eff958cb58669265a011d4669bf46c7a0c1ef64313f81e737",
        outcomeIndex: 1,
        amount: 8.585852
    },
    {
        title: "Diamondbacks vs. Reds",
        conditionId: "0xbd378bf3d29449e95da5f1206e7311998a19d255656dea6a938bab3b48949baa",
        outcomeIndex: 1,
        amount: 6.2018
    },
    {
        title: "Astros vs. Guardians",
        conditionId: "0x0100791ff80206eeef7e48a44295fed4e38c27a9a51fa1a0fd760f4a1ac72b2f",
        outcomeIndex: 0,
        amount: 5.395347
    },
    {
        title: "Marlins vs. Rays",
        conditionId: "0x0595b245b6713afd7a622007b0b1e2c4d69d2f493cc199717c3dc8a91f837f94",
        outcomeIndex: 0,
        amount: 3.636362
    },
    {
        title: "Phillies vs. Pirates",
        conditionId: "0xc92802a649d3552c1e9249515088fded42376f3504673d4dbdd5780c6bc2fb8d",
        outcomeIndex: 0,
        amount: 3.636362
    },
    {
        title: "Dodgers vs. Cardinals",
        conditionId: "0x35f42c4455dda828715972aff7099b8114b59b875fbc7298896e711490f289b9",
        outcomeIndex: 0,
        amount: 3.125
    }
];

let currentProviderIndex = 0;

function getProvider() {
    const url = RPC_URLS[currentProviderIndex % RPC_URLS.length];
    return new ethers.providers.JsonRpcProvider(url);
}

function nextProvider() {
    currentProviderIndex++;
    return getProvider();
}

async function checkOracleResolution(contract, position) {
    try {
        // Check denominator first - if this fails, the oracle hasn't resolved
        const denominator = await contract.payoutDenominator(position.conditionId);
        if (denominator.eq(0)) {
            return { resolved: false, reason: 'Denominator is 0' };
        }

        // Check the winning outcome
        const numerator = await contract.payoutNumerators(position.conditionId, position.outcomeIndex);
        const payout = numerator.toNumber() / denominator.toNumber();

        return {
            resolved: true,
            winning: payout > 0,
            payout: payout * position.amount
        };
    } catch (error) {
        return { resolved: false, reason: error.message };
    }
}

async function checkPosition(position) {
    for (let i = 0; i < RPC_URLS.length; i++) {
        try {
            const provider = getProvider();
            const contract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, ABI, provider);
            const result = await checkOracleResolution(contract, position);

            if (result.resolved) {
                const status = result.winning ? '✅ WON' : '❌ LOST';
                const payoutInfo = result.winning ? ` (Payout: ${result.payout.toFixed(6)} USDC)` : '';
                console.log(`${status} ${position.title}${payoutInfo}`);
                return result;
            }

            nextProvider();
        } catch (error) {
            nextProvider();
            continue;
        }
    }

    console.log(`⏳ Pending: ${position.title}`);
    return { resolved: false };
}

async function monitorPositions() {
    console.log(`\n${new Date().toLocaleString()} - Checking positions...\n`);
    
    let resolvedCount = 0;
    let pendingCount = 0;
    
    for (const position of positions) {
        const result = await checkPosition(position);
        if (result.resolved) {
            resolvedCount++;
        } else {
            pendingCount++;
        }
    }

    console.log(`\nSummary: ${resolvedCount} resolved, ${pendingCount} pending`);
    
    if (pendingCount > 0) {
        // Schedule next check
        console.log(`\nNext check in 5 minutes...`);
        setTimeout(monitorPositions, CHECK_INTERVAL);
    } else {
        console.log('\nAll positions resolved! Monitoring complete.');
        process.exit(0);
    }
}

console.log('🔍 Starting position monitor...');
console.log('Press Ctrl+C to stop\n');

// Start monitoring
monitorPositions().catch(console.error);
