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

try {
    const product =
        await productVerification.getProduct(productId);

    console.log("");
    console.log("🔎 PRODUCT DETAILS");
    console.log("--------------------------------");
    console.log("Product ID:", product.productId);
    console.log("Serial Number:", product.serialNumber);
    console.log("Product Name:", product.productName);
    console.log("Manufacturer:", product.manufacturer);
    console.log("Status:", product.status);
    console.log("Activated:", product.activated);
    console.log("Current Owner:", product.currentOwner);
    console.log("Metadata Hash:", product.metadataHash);

} catch (error: any) {
    console.log("");
    console.log("❌ FAILED TO GET PRODUCT");
    console.log("--------------------------------");
    console.log(error.reason || error.message);
}