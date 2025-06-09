const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.RPC_URL;
const TRANSACTION_HASH = '0x0849e93654533f1806c4f2580aa79238cb6dc57bb4421c8973b4bdbe48fc153e';

// Alternative RPC URLs for Polygon (fallbacks in case of timeouts)
const POLYGON_RPC_URLS = [
    process.env.RPC_URL,
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.network',
    'https://rpc-mainnet.maticvigil.com',
    'https://polygon.llamarpc.com'
].filter(Boolean);

async function checkTransactionStatus() {
    let provider;
    let providerIndex = 0;
    
    const createProvider = (url, timeout = 30000) => {
        const rpcProvider = new ethers.providers.JsonRpcProvider(url);
        rpcProvider.resolveName = () => null;
        
        const originalSend = rpcProvider.send.bind(rpcProvider);
        rpcProvider.send = async (method, params) => {
            return Promise.race([
                originalSend(method, params),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('RPC timeout')), timeout)
                )
            ]);
        };
        
        return rpcProvider;
    };
    
    const getNextProvider = () => {
        if (providerIndex >= POLYGON_RPC_URLS.length) {
            throw new Error('All RPC providers exhausted');
        }
        const url = POLYGON_RPC_URLS[providerIndex++];
        console.log(`📡 Using RPC provider: ${url.includes('infura') ? 'Infura' : url}`);
        return createProvider(url);
    };
    
    provider = getNextProvider();
    
    const retryWithFallback = async (operation, description) => {
        let lastError;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`🔄 ${description} (attempt ${attempt}/3)`);
                return await operation();
            } catch (error) {
                lastError = error;
                console.log(`⚠️ ${description} failed (attempt ${attempt}/3): ${error.message}`);
                
                if (error.message.includes('timeout') || error.message.includes('RPC timeout')) {
                    if (attempt === 3 && providerIndex < POLYGON_RPC_URLS.length) {
                        console.log(`🔄 Switching to next RPC provider...`);
                        provider = getNextProvider();
                        attempt = 0;
                        continue;
                    }
                }
                
                if (attempt < 3) {
                    console.log(`⏳ Waiting 5 seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
        
        throw lastError;
    };
    
    try {
        console.log(`🔍 Checking transaction status: ${TRANSACTION_HASH}`);
        
        const receipt = await retryWithFallback(
            () => provider.getTransactionReceipt(TRANSACTION_HASH),
            'Getting transaction receipt'
        );
        
        if (receipt) {
            console.log(`✅ Transaction confirmed!`);
            console.log(`   Block number: ${receipt.blockNumber}`);
            console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
            console.log(`   Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
            
            if (receipt.logs && receipt.logs.length > 0) {
                console.log(`   Logs: ${receipt.logs.length} events emitted`);
                receipt.logs.forEach((log, index) => {
                    console.log(`     Log ${index + 1}: ${log.address} - ${log.topics.length} topics`);
                });
            }
        } else {
            console.log(`⏳ Transaction not yet confirmed or not found`);
            
            // Also check if transaction exists in mempool
            const tx = await retryWithFallback(
                () => provider.getTransaction(TRANSACTION_HASH),
                'Getting transaction details'
            );
            
            if (tx) {
                console.log(`📤 Transaction found in network:`);
                console.log(`   From: ${tx.from}`);
                console.log(`   To: ${tx.to}`);
                console.log(`   Nonce: ${tx.nonce}`);
                console.log(`   Gas Limit: ${tx.gasLimit.toString()}`);
                console.log(`   Gas Price: ${ethers.utils.formatUnits(tx.gasPrice, 'gwei')} GWEI`);
                console.log(`   Block Number: ${tx.blockNumber || 'Pending'}`);
            } else {
                console.log(`❌ Transaction not found on network`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error checking transaction:', error.message);
        console.log(`🔍 You can also check manually at: https://polygonscan.com/tx/${TRANSACTION_HASH}`);
    }
}

checkTransactionStatus();
