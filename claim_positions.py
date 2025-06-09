import os
import json
import requests
from web3 import Web3
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Web3
w3 = Web3(Web3.HTTPProvider(os.getenv('RPC_URL')))
if not w3.is_connected():
    raise ConnectionError("Failed to connect to Polygon RPC")

# Get environment variables
PRIVATE_KEY = os.getenv('PRIVATE_KEY')
PROXY_WALLET = os.getenv('PROXY_WALLET')
USDC_ADDRESS = os.getenv('USDC_CONTRACT_ADDRESS')
CTF_ADDRESS = os.getenv('POLYMARKET_CTF_ADDRESS')

# Initialize account
account = w3.eth.account.from_key(PRIVATE_KEY)
if account.address.lower() != PROXY_WALLET.lower():
    raise ValueError("Private key doesn't match proxy wallet address")

# Conditional Tokens ABI (simplified for claim functions)
CTF_ABI = [
    {
        "name": "claimPositions",
        "inputs": [
            {"type": "address", "name": "collateralToken"},
            {"type": "bytes32", "name": "parentCollectionId"},
            {"type": "bytes32[]", "name": "conditionIds"},
            {"type": "uint256[]", "name": "indexSets"}
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "name": "balanceOf",
        "inputs": [
            {"type": "address", "name": "account"},
            {"type": "uint256", "name": "id"}
        ],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "name": "getPositionId",
        "inputs": [
            {"type": "address", "name": "collateralToken"},
            {"type": "bytes32", "name": "collectionId"},
            {"type": "bytes32", "name": "conditionId"},
            {"type": "uint256", "name": "indexSet"}
        ],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "name": "conditions",
        "inputs": [{"type": "bytes32", "name": ""}],
        "outputs": [
            {"type": "address", "name": "oracle"},
            {"type": "bytes32", "name": "questionId"},
            {"type": "uint256", "name": "outcomeSlotCount"},
            {"type": "uint256", "name": "resolutionTimestamp"},
            {"type": "bool", "name": "resolved"},
            {"type": "uint256[]", "name": "payoutNumerators"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
]

# Initialize contract
ctf_contract = w3.eth.contract(address=CTF_ADDRESS, abi=CTF_ABI)

def fetch_resolved_markets():
    """Fetch resolved markets from Polymarket API"""
    markets = []
    cursor = None
    base_url = "https://clob.polymarket.com/markets?state=resolved"
    
    while True:
        url = f"{base_url}&cursor={cursor}" if cursor else base_url
        response = requests.get(url)
        data = response.json()
        
        markets.extend(data.get('results', []))
        cursor = data.get('next')
        if not cursor:
            break
            
    return markets

def get_claimable_positions():
    """Get all claimable positions"""
    markets = fetch_resolved_markets()
    claimable = []
    
    for market in markets:
        condition_id_hex = market['condition_id']
        condition_id = bytes.fromhex(condition_id_hex[2:])
        winning_outcome = market.get('resolved_outcome')
        
        # Skip if no winning outcome
        if winning_outcome is None:
            continue
            
        # Check on-chain resolution status
        on_chain_data = ctf_contract.functions.conditions(condition_id).call()
        is_resolved = on_chain_data[4]
        payout_numerators = on_chain_data[5]
        
        # Verify resolution and winning outcome
        if not is_resolved or payout_numerators[winning_outcome] == 0:
            continue
            
        # Calculate indexSet (bitmask for winning outcome)
        index_set = 1 << winning_outcome
        
        # Get position ID
        position_id = ctf_contract.functions.getPositionId(
            USDC_ADDRESS,
            b'\x00' * 32,  # Parent collection ID (bytes32(0))
            condition_id,
            index_set
        ).call()
        
        # Check balance
        balance = ctf_contract.functions.balanceOf(PROXY_WALLET, position_id).call()
        if balance > 0:
            claimable.append({
                'condition_id': condition_id,
                'index_set': index_set,
                'market_title': market['title'],
                'balance': balance
            })
            
    return claimable

def claim_positions(positions):
    """Claim multiple positions in one transaction"""
    if not positions:
        print("No claimable positions found")
        return None

    condition_ids = [pos['condition_id'] for pos in positions]
    index_sets = [pos['index_set'] for pos in positions]

    # Build transaction
    tx = ctf_contract.functions.claimPositions(
        USDC_ADDRESS,
        b'\x00' * 32,  # Parent collection ID
        condition_ids,
        index_sets
    ).build_transaction({
        'from': PROXY_WALLET,
        'nonce': w3.eth.get_transaction_count(PROXY_WALLET),
        'maxFeePerGas': w3.to_wei(os.getenv('MAX_FEE'), 'gwei'),
        'maxPriorityFeePerGas': w3.to_wei(os.getenv('MAX_PRIORITY_FEE'), 'gwei'),
        'chainId': 137  # Polygon mainnet
    })

    # Sign and send
    signed_tx = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    return tx_hash.hex()

def main():
    print(f"Checking claimable positions for {PROXY_WALLET}...")
    claimable_positions = get_claimable_positions()
    
    if not claimable_positions:
        print("No claimable positions found")
        return
        
    print(f"Found {len(claimable_positions)} claimable positions:")
    for idx, pos in enumerate(claimable_positions, 1):
        print(f"{idx}. {pos['market_title']} - Balance: {pos['balance']}")
    
    tx_hash = claim_positions(claimable_positions)
    if tx_hash:
        print(f"Claim transaction sent! TX Hash: {tx_hash}")
        print(f"Track on Polygonscan: https://polygonscan.com/tx/{tx_hash}")

if __name__ == "__main__":
    main()