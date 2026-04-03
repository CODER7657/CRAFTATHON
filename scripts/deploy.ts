import { ethers, network, run } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n🛡️  POCSO Shield — Deployment Script");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Network   : ${network.name} (chainId: ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Balance   : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // ── Deploy ────────────────────────────────────────────────────────────────
  console.log("📦 Deploying POCSORegistry...");
  const Factory = await ethers.getContractFactory("POCSORegistry");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`✅ POCSORegistry deployed to: ${contractAddress}`);

  // ── Save ABI for frontend team ────────────────────────────────────────────
  const fs = await import("fs");
  const path = await import("path");

  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/POCSORegistry.sol/POCSORegistry.json"
  );

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const outputPath = path.join(__dirname, "../POCSORegistry.abi.json");
    fs.writeFileSync(outputPath, JSON.stringify(artifact.abi, null, 2));
    console.log(`📄 ABI saved to: POCSORegistry.abi.json  ← give this to the frontend team`);
  }

  // ── Print summary for PM ──────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 Share these with the PM / Frontend team:");
  console.log(`   CONTRACT_ADDRESS = ${contractAddress}`);
  console.log(`   INFURA_API_KEY   = <from .env>`);
  console.log("   ABI file         = POCSORegistry.abi.json");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── Etherscan verification (Sepolia only) ─────────────────────────────────
  if (network.name === "sepolia") {
    console.log("⏳ Waiting 6 block confirmations before Etherscan verification...");
    await contract.deploymentTransaction()?.wait(6);

    console.log("🔍 Verifying on Etherscan...");
    try {
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [],
      });
      console.log(`✅ Verified! https://sepolia.etherscan.io/address/${contractAddress}#code`);
    } catch (err: any) {
      if (err.message?.includes("Already Verified")) {
        console.log("ℹ️  Already verified on Etherscan.");
      } else {
        console.error("❌ Verification failed:", err.message);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
