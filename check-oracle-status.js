const { ethers } = require('ethers');
require('dotenv').config();

// Configuration from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const PROXY_WALLET = process.env.PROXY_WALLET;

// Polymarket CTF (Conditional Token Framework) contract address on Polygon
const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';

// Extended ABI to check oracle status
const POLYMARKET_CTF_ABI = [
    'function payoutNumerators(uint256 conditionId, uint256 index) view returns (uint256)',
    'function payoutDenominator(uint256 conditionId) view returns (uint256)',
    'function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount) pure returns (bytes32)',
    'function balanceOf(address account, uint256 id) view returns (uint256)'
];

/**
 * Fetches all positions for the wallet
 */
async function getPositions() {
    try {
        const response = await fetch(`https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`);
        if (!response.ok) {
            throw new Error(`Error fetching positions: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('❌ Error fetching positions:', error);
        return [];
    }
}

/**
 * Checks if a condition has been resolved by the oracle
 */
async function checkOracleResolution(contract, conditionId) {
    try {
        console.log(`\n🔍 Checking oracle resolution for condition: ${conditionId}`);
        
        // Check payout denominator (should be > 0 if resolved)
        const payoutDenominator = await contract.payoutDenominator(conditionId);
        console.log(`   Payout Denominator: ${payoutDenominator.toString()}`);
        
        if (payoutDenominator.eq(0)) {
            console.log(`   ❌ Market NOT resolved by oracle (payout denominator = 0)`);
            return false;
        }
        
        // Check payout numerators for both outcomes (binary market)
        const payout0 = await contract.payoutNumerators(conditionId, 0);
        const payout1 = await contract.payoutNumerators(conditionId, 1);
        
        console.log(`   Payout Numerator [0] (No): ${payout0.toString()}`);
        console.log(`   Payout Numerator [1] (Yes): ${payout1.toString()}`);
        
        // Determine winning outcome
        if (payout0.gt(0) && payout1.eq(0)) {
            console.log(`   ✅ Market resolved: "No" won (outcome 0)`);
        } else if (payout1.gt(0) && payout0.eq(0)) {
            console.log(`   ✅ Market resolved: "Yes" won (outcome 1)`);
        } else if (payout0.gt(0) && payout1.gt(0)) {
            console.log(`   ⚠️ Market resolved: Split payout (both outcomes have value)`);
        } else {
            console.log(`   ❓ Market resolved but unusual payout structure`);
        }
        
        return true;
        
    } catch (error) {
        console.log(`   ❌ Error checking oracle status: ${error.message}`);
        return false;
    }
}

/**
 * Main function to check oracle status for all redeemable positions
 */
async function checkOracleStatusForPositions() {
    try {
        console.log('🔄 Setting up provider and contract...');
        
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const ctfContract = new ethers.Contract(POLYMARKET_CTF_ADDRESS, POLYMARKET_CTF_ABI, wallet);
        
        console.log(`📍 Wallet address: ${wallet.address}`);
        console.log(`🏪 CTF contract: ${POLYMARKET_CTF_ADDRESS}`);
        
        // Get positions
        console.log('\n🔍 Fetching positions...');
        const positions = await getPositions();
        
        if (!positions || positions.length === 0) {
            console.log('ℹ️ No positions found.');
            return;
        }
        
        // Filter for positions that are marked as redeemable
        const redeemablePositions = positions.filter(pos => pos.redeemable === true);
        
        if (redeemablePositions.length === 0) {
            console.log('ℹ️ No redeemable positions found.');
            return;
        }
        
        console.log(`\n🎯 Found ${redeemablePositions.length} positions marked as redeemable:`);
        
        let actuallyRedeemable = 0;
        let notYetResolved = 0;
        
        for (const position of redeemablePositions) {
            console.log(`\n📊 Position: ${position.title}`);
            console.log(`   Asset: ${position.asset}`);
            console.log(`   Amount: ${position.size} tokens`);
            console.log(`   Outcome: ${position.outcome} (index ${position.outcomeIndex})`);
            
            // Check token balance
            try {
                const tokenBalance = await ctfContract.balanceOf(wallet.address, position.asset);
                console.log(`   Token Balance: ${ethers.utils.formatUnits(tokenBalance, 0)} tokens`);
                
                if (tokenBalance.eq(0)) {
                    console.log(`   ⚠️ No tokens found for this asset`);
                    continue;
                }
            } catch (balanceError) {
                console.log(`   ⚠️ Could not check token balance: ${balanceError.message}`);
            }
            
            // Check oracle resolution status
            const isResolved = await checkOracleResolution(ctfContract, position.conditionId);
            
            if (isResolved) {
                actuallyRedeemable++;
                console.log(`   ✅ This position should be redeemable`);
            } else {
                notYetResolved++;
                console.log(`   ❌ This position is NOT ready for redemption (oracle hasn't resolved)`);
            }
        }
        
        console.log(`\n📈 Summary:`);
        console.log(`   Total positions marked as redeemable: ${redeemablePositions.length}`);
        console.log(`   Actually redeemable (oracle resolved): ${actuallyRedeemable}`);
        console.log(`   Not yet resolved by oracle: ${notYetResolved}`);
        
        if (notYetResolved > 0) {
            console.log(`\n💡 ${notYetResolved} positions are marked as redeemable by the API but haven't been resolved by the oracle yet.`);
            console.log(`💡 These positions will fail with "execution reverted" until the oracle reports payouts.`);
            console.log(`💡 This typically happens shortly after market resolution, but there can be delays.`);
        }
        
        if (actuallyRedeemable > 0) {
            console.log(`\n✅ ${actuallyRedeemable} positions should be successfully redeemable right now.`);
        }
        
    } catch (error) {
        console.error('❌ Error in checkOracleStatusForPositions:', error);
    }
}

// Run the check
checkOracleStatusForPositions();
