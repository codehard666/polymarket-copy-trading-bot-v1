import { ethers } from 'ethers';
import { ENV } from '../config/env';

// List of fallback RPC URLs for Polygon
const FALLBACK_RPCS = [
    ENV.RPC_URL,
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.network',
    'https://matic-mainnet.chainstacklabs.com',
    'https://polygon.llamarpc.com',
    'https://polygon.rpc.blxrbdn.com'
];

// Track failed RPC attempts
const rpcFailures: Record<string, number> = {};

// Cache for allowance checks to reduce RPC calls
const allowanceCache: Record<string, { value: number; timestamp: number }> = {};
const CACHE_TTL = 60000; // 1 minute

/**
 * Clears the allowance cache.
 */
export function clearAllowanceCache(): void {
    for (const key in allowanceCache) {
        delete allowanceCache[key];
    }
    console.log('🔄 Allowance cache cleared.');
}

/**
 * Get a working provider with fallback support
 */
export async function getProvider(): Promise<ethers.providers.JsonRpcProvider> {
    // Try each RPC URL until we find one that works
    for (const rpcUrl of FALLBACK_RPCS) {
        // Skip RPC URLs that have failed multiple times recently
        if (rpcFailures[rpcUrl] && rpcFailures[rpcUrl] > 3) {
            console.log(`⚠️ Skipping previously failed RPC: ${rpcUrl}`);
            continue;
        }

        try {
            const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
            
            // Test the provider with a simple call
            await provider.getBlockNumber();
            
            console.log(`✅ Connected to RPC: ${rpcUrl.split('/')[2]}`);
            
            // Reset failure count on success
            rpcFailures[rpcUrl] = 0;
            
            return provider;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.log(`❌ RPC ${rpcUrl.split('/')[2]} failed: ${errorMessage}`);
            
            // Track failure
            rpcFailures[rpcUrl] = (rpcFailures[rpcUrl] || 0) + 1;
        }
    }

    throw new Error('All RPC providers failed. Check your network connection.');
}

/**
 * Check USDC allowance with retry logic and caching
 */
export async function checkAllowance(
    walletAddress: string, 
    spenderAddress: string
): Promise<number> {
    // Create a cache key
    const cacheKey = `${walletAddress}-${spenderAddress}`;
    
    // Check cache first
    const cached = allowanceCache[cacheKey];
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        console.log(`📋 Using cached allowance: ${cached.value} USDC`);
        return cached.value;
    }
    
    // ABI for the allowance function
    const ABI = ['function allowance(address owner, address spender) view returns (uint256)'];
    
    // Try up to 3 times with increasing delays
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const provider = await getProvider();
            
            const contract = new ethers.Contract(ENV.USDC_CONTRACT_ADDRESS, ABI, provider);
            
            // Set timeout to avoid hanging
            const result = await Promise.race([
                contract.allowance(walletAddress, spenderAddress),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Allowance check timed out')), 15000)
                )
            ]) as ethers.BigNumber;
            
            const allowance = parseFloat(ethers.utils.formatUnits(result, 6));
            
            // Store in cache
            allowanceCache[cacheKey] = { 
                value: allowance, 
                timestamp: Date.now() 
            };
            
            return allowance;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ Allowance check failed (attempt ${attempt}/3): ${errorMessage}`);
            
            if (attempt < 3) {
                // Wait with exponential backoff before retrying
                const delay = attempt * 2000; // 2s, 4s
                console.log(`⏳ Retrying in ${delay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    console.log('⚠️ All allowance check attempts failed, assuming zero allowance');
    return 0;
}
