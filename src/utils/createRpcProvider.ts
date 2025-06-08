import { ethers } from 'ethers';
import { ENV } from '../config/env';

/**
 * Creates an RPC provider with ENS support disabled
 * to avoid errors when working with networks like Polygon
 * that don't support ENS
 */
export default async function createRpcProvider(rpcUrl = ENV.RPC_URL): Promise<ethers.providers.StaticJsonRpcProvider> {
    if (!rpcUrl) {
        throw new Error('RPC_URL is not defined. Please check your .env file.');
    }
    
    // It's generally better to pass the chainId directly if known,
    // or a minimal network object. Ethers will populate the rest.
    // For Polygon Mainnet, chainId is 137.
    const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, 137);

    try {
        // Ethers.js v5 populates provider._network for known chain IDs (like 137 for Polygon)
        // with a network object that includes a default ENS address.
        // We need to explicitly nullify this to prevent ENS resolution attempts.
        
        // The getNetwork() call ensures that provider._network is initialized.
        const network = await provider.getNetwork(); 
        
        if (network && network.ensAddress) {
            console.log(`Provider\'s network object initially has ENS address: ${network.ensAddress}. Overriding to null.`);
            
            // provider._network is the internal cached network object in ethers v5.
            // We cast to \'any\' to modify this internal property.
            // This makes the provider believe ENS is not configured for this network.
            (provider as any)._network.ensAddress = null;
            
            // Verify the change (optional, for debugging)
            const updatedNetwork = await provider.getNetwork(); // Should reflect the change
            if (updatedNetwork.ensAddress === null) {
                console.log('Successfully set provider.network.ensAddress to null.');
            } else {
                console.warn(`Failed to set provider.network.ensAddress to null. Current value: ${updatedNetwork.ensAddress}`);
            }
        } else if (network) {
            console.log('Provider network object does not have an ENS address, or it is already null.');
        } else {
            console.warn('Provider network object could not be retrieved.');
        }
    } catch (e) {
        console.error("Error while attempting to modify provider\'s network ENS address; ENS issues may persist:", e);
    }

    return provider;
}