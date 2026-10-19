import { network } from "hardhat";
import { ethers } from "ethers";

const { ethers: hardhatEthers } = await network.connect();

const contractAddress =
    "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550";

const productVerification =
    await hardhatEthers.getContractAt(
        "ProductVerification",
        contractAddress
    );

const productId = "PROD003";

// Original metadata used during registration
const originalMetadata = "Smart Watch Ultra|ABC Electronics|B2026-003";

const calculatedHash =
    ethers.keccak256(
        ethers.toUtf8Bytes(originalMetadata)
    );

try {
    const product =
        await productVerification.getProduct(productId);

    const blockchainHash = product.metadataHash;

    console.log("");
    console.log("🔐 METADATA INTEGRITY CHECK");
    console.log("--------------------------------");
    console.log("Product ID:", productId);
    console.log("Blockchain Hash:", blockchainHash);
    console.log("Calculated Hash:", calculatedHash);

    if (blockchainHash === calculatedHash) {
        console.log("");
        console.log("✅ INTEGRITY VERIFIED");
        console.log("Metadata has not been modified.");
    } else {
        console.log("");
        console.log("❌ INTEGRITY FAILED");
        console.log("Metadata does not match the blockchain record.");
    }

} catch (error: any) {
    console.log("");
    console.log("❌ INTEGRITY CHECK FAILED");
    console.log(error.reason || error.message);
}