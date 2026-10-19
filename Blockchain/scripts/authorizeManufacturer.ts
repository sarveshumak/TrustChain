import { network } from "hardhat";

const { ethers } = await network.connect();

const contractAddress =
    "0xEdEce5bed943F320e6b76f1B839DdAbD460A4412";

const productVerification =
    await ethers.getContractAt(
        "ProductVerification",
        contractAddress
    );

const manufacturerAddress =
    "0x349Ff014F12F28aF13aE68d51C5C3bcbaeBA6C33";

const tx =
    await productVerification.authorizeManufacturer(
        manufacturerAddress
    );

await tx.wait();

console.log("Manufacturer authorized successfully!");
console.log("Manufacturer wallet:", manufacturerAddress);
console.log("Transaction Hash:", tx.hash);