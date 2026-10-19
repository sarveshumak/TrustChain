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

const productId = "PROD001";

// Customer enters this code
const secretCode = "7K9P-42XM-Q8";

const secretHash =
    ethers.keccak256(
        ethers.toUtf8Bytes(secretCode)
    );

const product =
    await productVerification.verifyProduct(
        productId,
        secretHash
    );

console.log("\n===== PRODUCT VERIFICATION =====");

console.log("Product ID:", product[0]);
console.log("Serial Number:", product[1]);
console.log("Product Name:", product[2]);
console.log("Manufacturer:", product[3]);
console.log("Batch Number:", product[4]);
console.log("Manufacturing Date:", product[5]);
console.log("Expiry Date:", product[6]);
console.log("Metadata Hash:", product[7]);

console.log("Status:", product[8]);
console.log("Activated:", product[9]);
console.log("Current Owner:", product[10]);
console.log("Created At:", product[11].toString());

console.log("Secret Valid:", product[12]);
console.log("Product Exists:", product[13]);

console.log("\n===== VERIFICATION RESULT =====");

if (!product[13]) {
    console.log("VERDICT: PRODUCT NOT VERIFIED");
    console.log("Reason: Product does not exist on blockchain");
}
else if (!product[12]) {
    console.log("VERDICT: PRODUCT NOT VERIFIED");
    console.log("Reason: Invalid authentication code");
}
else if (product[8] === 5n) {
    console.log("VERDICT: PRODUCT BLOCKED");
}
else if (product[8] === 4n) {
    console.log("VERDICT: PRODUCT RECALLED");
}
else if (product[8] === 3n) {
    console.log("VERDICT: PRODUCT SUSPENDED");
}
else if (product[8] === 1n && product[9]) {
    console.log("VERDICT: AUTHENTIC PRODUCT");
    console.log("Risk Level: LOW");
    console.log("Blockchain Record: VALID");
    console.log("Secret Authentication: VALID");
    console.log("Product Status: ACTIVE");
}
else {
    console.log("VERDICT: PRODUCT NOT VERIFIED");
}

console.log("===============================");