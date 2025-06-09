const { ethers } = require('ethers');
require('dotenv').config();

const POSITIONS = [
    {
        title: "Rangers vs. Nationals",
        conditionId: "0xe7faa8aacdd9ea6eff958cb58669265a011d4669bf46c7a0c1ef64313f81e737",
        outcomeIndex: 1,
        asset: "111137752123540331946429122420982159359094785924958413294592923954977870949311"
    },
    {
        title: "Diamondbacks vs. Reds",
        conditionId: "0xbd378bf3d29449e95da5f1206e7311998a19d255656dea6a938bab3b48949baa",
        outcomeIndex: 1,
        asset: "80475983217976229112534347168636968259474363400916041869060270143151750911917"
    },
    {
        title: "Astros vs. Guardians",
        conditionId: "0x0100791ff80206eeef7e48a44295fed4e38c27a9a51fa1a0fd760f4a1ac72b2f",
        outcomeIndex: 0,
        asset: "24478010573863062609536445468117373076168241103505435818104094452801918436148"
    },
    {
        title: "Marlins vs. Rays",
        conditionId: "0x0595b245b6713afd7a622007b0b1e2c4d69d2f493cc199717c3dc8a91f837f94",
        outcomeIndex: 0,
        asset: "105609130311442576171449460619881682892032174615397588004239045468051202535865"
    },
    {
        title: "Phillies vs. Pirates",
        conditionId: "0xc92802a649d3552c1e9249515088fded42376f3504673d4dbdd5780c6bc2fb8d",
        outcomeIndex: 0,
        asset: "84671607506457489954360562215735796839998723516467292262229181252204477935650"
    },
    {
        title: "Dodgers vs. Cardinals",
        conditionId: "0x35f42c4455dda828715972aff7099b8114b59b875fbc7298896e711490f289b9",
        outcomeIndex: 0,
        asset: "111336622919994696157256590756144927974442096568874706559424017134153360834659"
    }
];

const POLYMARKET_CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

async function forceClaimAllPositions() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`📍 Wallet address: ${wallet.address}`);
    
    const ctfAbi = [
        'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external',
        'function balanceOf(address account, uint256 id) view returns (uint256)'
    ];
    
    const ctf = new ethers.Contract(POLYMARKET_CTF_ADDRESS, ctfAbi, wallet);
    
    for (const position of POSITIONS) {
        try {
            console.log(`\n🎲 Attempting to claim ${position.title}`);
            console.log(`   Token ID: ${position.asset}`);
            
            // Check if we have balance
            const balance = await ctf.balanceOf(wallet.address, position.asset);
            if (balance.eq(0)) {
                console.log(`❌ No balance for this position, skipping...`);
                continue;
            }
            console.log(`✅ Found balance: ${balance.toString()} tokens`);
            
            // Prepare claim parameters
            const parentCollectionId = '0x0000000000000000000000000000000000000000000000000000000000000000';
            const indexSets = [position.outcomeIndex === 0 ? 1 : 2];
            
            console.log('🔄 Submitting claim transaction...');
            const tx = await ctf.redeemPositions(
                USDC_ADDRESS,
                parentCollectionId,
                position.conditionId,
                indexSets,
                {
                    gasLimit: 300000,
                    maxFeePerGas: ethers.utils.parseUnits('100', 'gwei'),
                    maxPriorityFeePerGas: ethers.utils.parseUnits('30', 'gwei')
                }
            );
            
            console.log(`📤 Transaction sent: ${tx.hash}`);
            console.log('⏳ Waiting for confirmation...');
            
            const receipt = await tx.wait();
            console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
            
        } catch (error) {
            console.log(`❌ Error claiming ${position.title}:`);
            console.log(`   ${error.message}`);
            if (error.error && error.error.message) {
                console.log(`   Details: ${error.error.message}`);
            }
        }
        
        // Wait between transactions
        await new Promise(r => setTimeout(r, 3000));
    }
}

forceClaimAllPositions().catch(console.error);
