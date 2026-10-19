import { network } from "hardhat";

const { ethers } = await network.connect();

const contractAddress =
    "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550";

const productVerification =
    await ethers.getContractAt(
        "ProductVerification",
        contractAddress
    );

const productId = "PROD003";

// Temporary customer wallet for testing
const newOwner = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

try {
    const tx =
        await productVerification.transferOwnership(
            productId,
            newOwner
        );

    await tx.wait();

    console.log("");
    console.log("✅ OWNERSHIP TRANSFERRED");
    console.log("--------------------------------");
    console.log("Product ID:", productId);
    console.log("New Owner:", newOwner);
    console.log("Transaction Hash:", tx.hash);

} catch (error: any) {
    console.log("");
    console.log("❌ OWNERSHIP TRANSFER FAILED");
    console.log("--------------------------------");
    console.log(
        error.reason || error.message
    );
}