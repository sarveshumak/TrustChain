import { network } from "hardhat";

const { ethers } = await network.connect();

const productVerification =
    await ethers.deployContract("ProductVerification");

await productVerification.waitForDeployment();

console.log(
    "ProductVerification deployed to:",
    await productVerification.getAddress()
);