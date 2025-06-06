import { ethers } from 'ethers'; // Reverted to v5 import
import { ENV } from '../config/env';

const RPC_URL = ENV.RPC_URL;
const USDC_CONTRACT_ADDRESS = ENV.USDC_CONTRACT_ADDRESS;

const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];

const getMyBalance = async (address: string): Promise<number> => {
    const rpcProvider = new ethers.providers.JsonRpcProvider(RPC_URL); // Reverted to v5 provider
    const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, rpcProvider); // Reverted to v5 Contract
    const balance_usdc = await usdcContract.balanceOf(address);
    const balance_usdc_real = ethers.utils.formatUnits(balance_usdc, 6); // Reverted to v5 utils.formatUnits
    return parseFloat(balance_usdc_real);
};

export default getMyBalance;
