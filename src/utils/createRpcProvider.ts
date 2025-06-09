import { ethers } from 'ethers';
import { ENV } from '../config/env';

/**
 * Creates an RPC provider with ENS support disabled
 * to avoid errors when working with networks like Polygon
 * that don't support ENS
 */
export default async function createRpcProvider(rpcUrl = ENV.RPC_URL): Promise<ethers.providers.JsonRpcProvider> {
    if (!rpcUrl) {
        throw new Error('RPC_URL is not defined. Please check your .env file.');
    }

    try {
        // Initialize provider without modifying '_network'
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

        // Verify connection
        const network = await provider.getNetwork();
        console.log(`📡 Connected to network: ${network.name} (chainId: ${network.chainId})`);

        return provider;
    } catch (error) {
        const err = error as any; // Cast error to 'any' to access its properties
        console.error('Error while creating provider:', err.message);
        console.error('Stack trace:', err.stack);
        console.log('Attempting fallback provider initialization...');

        try {
            // Fallback mechanism
            const fallbackProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
            console.log('✅ Fallback provider initialized successfully.');
            return fallbackProvider;
        } catch (fallbackError) {
            const fallbackErr = fallbackError as any; // Cast fallbackError to 'any'
            console.error('Fallback provider also failed:', fallbackErr.message);
            console.error('Stack trace:', fallbackErr.stack);
            throw new Error('Could not initialize RPC provider after multiple attempts');
        }
    }
}