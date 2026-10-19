import { network } from "hardhat";

const { ethers } = await network.connect();

const contractAddress =
    "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550";

const productVerification =
    await ethers.getContractAt(
        "ProductVerification",
        contractAddress
    );

const productId = "PROD002";

// 5 = BLOCKED
const newStatus = 3;

try {

    const tx =
        await productVerification.updateStatus(
            productId,
            newStatus
        );

    await tx.wait();

    console.log("");
    console.log("✅ PRODUCT STATUS UPDATED");
    console.log("--------------------------------");
    console.log("Product ID:", productId);
    console.log("New Status: SUSPENDED");
    console.log("Transaction Hash:", tx.hash);

} catch (error: any) {

    console.log("");
    console.log("❌ STATUS UPDATE FAILED");
    console.log("--------------------------------");
    console.log(
        error.reason || error.message
    );
}