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

const productId = "PROD002";

// Customer enters the secret code
const secretCode = "8L4Q-73ZN-R5";

// Convert secret code into hash
const secretHash =
    ethers.keccak256(
        ethers.toUtf8Bytes(secretCode)
    );

// Activate product
try {

    const tx =
        await productVerification.activateProduct(
            productId,
            secretHash
        );

    await tx.wait();

    console.log("");
    console.log("✅ PRODUCT ACTIVATED SUCCESSFULLY");
    console.log("--------------------------------");
    console.log("Product ID:", productId);
    console.log("Secret Code verified:", true);
    console.log("Transaction Hash:", tx.hash);

} catch (error: any) {

    console.log("");
    console.log("⚠️ ACTIVATION REJECTED");
    console.log("--------------------------------");
    console.log("Product ID:", productId);

    if (
        error.reason === "Product already activated" ||
        error.message?.includes("Product already activated")
    ) {
        console.log("");
        console.log("Reason: Product already activated");
        console.log(
            "Possible credential reuse / cloned credential detected."
        );
    } else {
        console.log("");
        console.log("Reason: Activation failed");
        console.log(error.reason || error.message);
    }
}