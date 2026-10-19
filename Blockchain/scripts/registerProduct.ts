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

// Product details
const productId = "PROD004";
const serialNumber = "SW2026X004";
const productName = "Smart Watch Max";
const manufacturer = "ABC Electronics";
const batchNumber = "B2026-004";
const manufacturingDate = "11-10-2026";
const expiryDate = "11-10-2028";


// Product metadata
const metadata =
    `${productId}|${serialNumber}|${productName}|${manufacturer}|${batchNumber}|${manufacturingDate}|${expiryDate}`;

const metadataHash =
    ethers.keccak256(
        ethers.toUtf8Bytes(metadata)
    );

// Secret authentication code
const secretCode = "5P7T-26LM-X9";

const secretHash =
    ethers.keccak256(
        ethers.toUtf8Bytes(secretCode)
    );

const tx =
    await productVerification.registerProduct(
        productId,
        serialNumber,
        productName,
        manufacturer,
        batchNumber,
        manufacturingDate,
        expiryDate,
        metadataHash,
        secretHash
    );

await tx.wait();

console.log("Product registered successfully!");
console.log("Product ID:", productId);
console.log("Serial Number:", serialNumber);
console.log("Secret Code:", secretCode);
console.log("Metadata Hash:", metadataHash);
console.log("Secret Hash:", secretHash);
console.log("Transaction Hash:", tx.hash);