import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const contractAddress = process.env.SEPOLIA_CONTRACT_ADDRESS;
  const authorityPrivateKey = process.env.AUTHORITY_WALLET_PRIVATE_KEY;

  if (!contractAddress) {
    throw new Error("SEPOLIA_CONTRACT_ADDRESS is not set in .env");
  }
  if (!authorityPrivateKey) {
    throw new Error("AUTHORITY_WALLET_PRIVATE_KEY is not set in .env");
  }

  const [owner] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();
  const authorityWallet = new ethers.Wallet(
    authorityPrivateKey.startsWith("0x") ? authorityPrivateKey : `0x${authorityPrivateKey}`
  );

  const contract = await ethers.getContractAt("POCSORegistry", contractAddress, owner);
  const authorityAddress = authorityWallet.address;

  console.log(`Owner: ${ownerAddress}`);
  console.log(`Contract: ${contractAddress}`);
  console.log(`Authority wallet: ${authorityAddress}`);

  const alreadyAuthority = await contract.isAuthority(authorityAddress);
  if (alreadyAuthority) {
    console.log("Authority already assigned.");
    return;
  }

  const tx = await contract.assignAuthority(authorityAddress);
  console.log(`assignAuthority tx: ${tx.hash}`);
  await tx.wait();

  const isAuthority = await contract.isAuthority(authorityAddress);
  console.log(`Authority assigned: ${isAuthority}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
