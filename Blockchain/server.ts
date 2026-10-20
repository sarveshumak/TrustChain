import express from "express";
import Database from "better-sqlite3";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import "dotenv/config";

const app = express();

const PORT = Number(process.env.PORT) || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use((req, res, next) => {
    res.header(
        "Access-Control-Allow-Origin",
        "https://trustchain-frontend-fl3x.onrender.com"
    );

    res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,DELETE,OPTIONS"
    );

    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

app.use(express.json());

// =====================================================
// DATABASE
// =====================================================

const db = new Database("scanHistory.db");

// =====================================================
// USERS TABLE
// =====================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'MANUFACTURER',
        created_at TEXT NOT NULL
    )
`);

// =====================================================
// PRODUCTS TABLE
// =====================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId TEXT UNIQUE NOT NULL,
        serialNumber TEXT NOT NULL,
        productName TEXT NOT NULL,
        manufacturer TEXT NOT NULL,
        batchNumber TEXT NOT NULL,
        manufacturingDate TEXT NOT NULL,
        expiryDate TEXT NOT NULL,
        transactionHash TEXT,
        createdAt TEXT NOT NULL
    )
`);

// =====================================================
// SCANS TABLE
// =====================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId TEXT NOT NULL,
        scanTime TEXT NOT NULL,
        status TEXT NOT NULL,
        secretValid INTEGER NOT NULL
    )
`);

// =====================================================
// DEMO MANUFACTURER
// =====================================================

const existingManufacturer = db
    .prepare(
        `
        SELECT id
        FROM users
        WHERE email = ?
        `
    )
    .get("manufacturer@trustchain.com");

if (!existingManufacturer) {
    db.prepare(
        `
        INSERT INTO users
        (
            name,
            email,
            password,
            role,
            created_at
        )
        VALUES (?, ?, ?, ?, ?)
        `
    ).run(
        "ABC Electronics",
        "manufacturer@trustchain.com",
        "admin123",
        "MANUFACTURER",
        new Date().toISOString()
    );

    console.log(
        "Demo manufacturer account created."
    );
}

// =====================================================
// BLOCKCHAIN CONFIGURATION
// =====================================================

const contractAddress =
    process.env.CONTRACT_ADDRESS!;

const provider = new ethers.JsonRpcProvider(
    process.env.RPC_URL
);

// =====================================================
// LOAD CONTRACT ABI
// =====================================================

const artifactPath = path.join(
    process.cwd(),
    "artifacts",
    "contracts",
    "ProductVerification.sol",
    "ProductVerification.json"
);

const artifact = JSON.parse(
    fs.readFileSync(
        artifactPath,
        "utf8"
    )
);

const productVerification =
    new ethers.Contract(
        contractAddress,
        artifact.abi,
        provider
    );

// =====================================================
// STATUS HELPER
// =====================================================

function getStatusName(
    status: bigint
): string {

    switch (status) {

        case 0n:
            return "REGISTERED";

        case 1n:
            return "ACTIVE";

        case 2n:
            return "SOLD";

        case 3n:
            return "SUSPENDED";

        case 4n:
            return "RECALLED";

        case 5n:
            return "BLOCKED";

        default:
            return "UNKNOWN";
    }
}

function formatCreatedDate(value: any): string {
    if (!value) {
        return "Not available";
    }

    const raw = Number(value);

    if (Number.isFinite(raw)) {
        let timestamp = raw;

        // Handle unusually scaled blockchain timestamps
        if (timestamp > 10000000000) {
            timestamp = Math.floor(timestamp / 10);
        }

        const date = new Date(timestamp * 1000);

        if (!isNaN(date.getTime())) {
            return date.toISOString().split("T")[0];
        }
    }

    return String(value);
}

// =====================================================
// RISK ENGINE
// =====================================================

function calculateRisk(
    failedAttempts: number
) {

    let riskScore =
        failedAttempts * 10;

    if (riskScore > 100) {
        riskScore = 100;
    }

    let riskLevel = "LOW";

    if (
        riskScore >= 30 &&
        riskScore < 60
    ) {
        riskLevel = "SUSPICIOUS";
    }

    if (riskScore >= 60) {
        riskLevel = "HIGH";
    }

    return {
        riskScore,
        riskLevel
    };
}

// =====================================================
// SCAN HELPERS
// =====================================================

const insertScan = db.prepare(`
    INSERT INTO scans
    (
        productId,
        scanTime,
        status,
        secretValid
    )
    VALUES (?, ?, ?, ?)
`);

const getScanCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM scans
    WHERE productId = ?
`);

const getFailedAttemptCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM scans
    WHERE productId = ?
    AND status = 'NOT_VERIFIED'
    AND secretValid = 0
`);

// =====================================================
// MANUFACTURER LOGIN
// =====================================================

app.post(
    "/api/manufacturer/login",
    (req, res) => {

        try {

            const {
                email,
                password
            } = req.body;

            if (
                !email ||
                !password
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Email and password are required."
                });
            }

            const manufacturer =
                db.prepare(`
                    SELECT
                        id,
                        name,
                        email,
                        role
                    FROM users
                    WHERE email = ?
                    AND password = ?
                    AND role = 'MANUFACTURER'
                `).get(
                    email.trim(),
                    password
                ) as
                    | {
                        id: number;
                        name: string;
                        email: string;
                        role: string;
                    }
                    | undefined;

            if (!manufacturer) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid manufacturer email or password."
                });
            }

            return res.json({
                success: true,
                message:
                    "Login successful.",
                manufacturer
            });

        } catch (error) {

            console.error(
                "Manufacturer Login Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to login."
            });
        }
    }
);

// =====================================================
// REGISTER PRODUCT
// =====================================================

app.post(
    "/api/products/register",
    async (req, res) => {

        try {

            const {
                productId,
                serialNumber,
                productName,
                manufacturer,
                batchNumber,
                manufacturingDate,
                expiryDate,
                secret
            } = req.body;

            // -------------------------------------------------
            // VALIDATION
            // -------------------------------------------------

            if (
                !productId ||
                !serialNumber ||
                !productName ||
                !manufacturer ||
                !batchNumber ||
                !manufacturingDate ||
                !expiryDate ||
                !secret
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "All product fields are required."
                });
            }

            const cleanProductId =
                productId.trim();

            // -------------------------------------------------
            // CHECK SQLITE
            // -------------------------------------------------

            const existingDB =
                db.prepare(`
                    SELECT productId
                    FROM products
                    WHERE productId = ?
                `).get(
                    cleanProductId
                );

            if (existingDB) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Product ID already exists."
                });
            }

            // -------------------------------------------------
            // CHECK BLOCKCHAIN
            // -------------------------------------------------

            try {

                const existingBlockchain =
                    await productVerification.verifyProduct(
                        cleanProductId,
                        ethers.ZeroHash
                    );

                if (existingBlockchain[13]) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Product ID already exists on blockchain."
                    });
                }

            } catch {
                // Product does not exist.
                // Continue registration.
            }

            // -------------------------------------------------
            // HASH SECRET
            // -------------------------------------------------

            const secretHash =
                ethers.keccak256(
                    ethers.toUtf8Bytes(
                        secret.trim()
                    )
                );

            // -------------------------------------------------
            // HASH METADATA
            // -------------------------------------------------

            const metadata =
                JSON.stringify({
                    productId:
                        cleanProductId,

                    serialNumber:
                        serialNumber.trim(),

                    productName:
                        productName.trim(),

                    manufacturer:
                        manufacturer.trim(),

                    batchNumber:
                        batchNumber.trim(),

                    manufacturingDate,

                    expiryDate
                });

            const metadataHash =
                ethers.keccak256(
                    ethers.toUtf8Bytes(
                        metadata
                    )
                );

            // -------------------------------------------------
            // MANUFACTURER WALLET
            // -------------------------------------------------

            // -------------------------------------------------
            // MANUFACTURER WALLET
            // -------------------------------------------------

            const privateKey =
                process.env.MANUFACTURER_PRIVATE_KEY;

            if (!privateKey) {
                return res.status(500).json({
                    success: false,
                    message:
                        "MANUFACTURER_PRIVATE_KEY is not configured."
                });
            }

            const wallet =
                new ethers.Wallet(
                    privateKey,
                    provider
                );

            const contractWithWallet =
                productVerification.connect(
                    wallet
                );

            // -------------------------------------------------
            // BLOCKCHAIN REGISTRATION
            // -------------------------------------------------

            const tx =
                await contractWithWallet.registerProduct(
                    cleanProductId,
                    serialNumber.trim(),
                    productName.trim(),
                    manufacturer.trim(),
                    batchNumber.trim(),
                    manufacturingDate,
                    expiryDate,
                    metadataHash,
                    secretHash
                );

            await tx.wait();

            // -------------------------------------------------
            // SAVE DATABASE
            // -------------------------------------------------

            db.prepare(`
                INSERT INTO products
                (
                    productId,
                    serialNumber,
                    productName,
                    manufacturer,
                    batchNumber,
                    manufacturingDate,
                    expiryDate,
                    transactionHash,
                    createdAt
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                cleanProductId,
                serialNumber.trim(),
                productName.trim(),
                manufacturer.trim(),
                batchNumber.trim(),
                manufacturingDate,
                expiryDate,
                tx.hash,
                new Date().toISOString()
            );

            console.log(
                "Product registered:",
                cleanProductId
            );

            return res.json({
                success: true,
                message:
                    "Product registered successfully.",
                productId:
                    cleanProductId,
                transactionHash:
                    tx.hash
            });

        } catch (error: any) {

            console.error(
                "Registration Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.reason ||
                    error.message ||
                    "Product registration failed."
            });
        }
    }
);

// =====================================================
// GET ALL PRODUCTS
//
// IMPORTANT:
// Existing products PROD004/PROD005 were registered
// before DB-saving was added. Therefore we first check
// known blockchain products and then add DB products.
// =====================================================

app.get(
    "/api/products",
    async (req, res) => {

        try {

            const products: any[] = [];

            // -------------------------------------------------
            // DISCOVER PRODUCTS DIRECTLY FROM BLOCKCHAIN EVENTS
            // -------------------------------------------------

            const provider =
    new ethers.JsonRpcProvider(
        process.env.RPC_URL!
    );

const currentBlock =
    await provider.getBlockNumber();

const fromBlock =
    Math.max(0, currentBlock - 20000);

const events: any[] = [];

const filter =
    productVerification.filters.ProductRegistered();

for (
    let startBlock = fromBlock;
    startBlock <= currentBlock;
    startBlock += 10000
) {

    const endBlock =
        Math.min(
            startBlock + 9999,
            currentBlock
        );

    const chunkEvents =
    await productVerification.queryFilter(
        filter,
        startBlock,
        endBlock
    );

events.push(...chunkEvents);

// Small delay to avoid RPC rate limiting
await new Promise(
    resolve => setTimeout(resolve, 1000)
);
}

            const productIds = [
                "PROD001",
                ...new Set(
                    events.map(
                        event => String(event.args[0])
                    )
                )
            ];

            // -------------------------------------------------
            // ALSO INCLUDE PRODUCTS PRESENT IN DATABASE
            // -------------------------------------------------

            const dbProducts =
                db.prepare(`
                    SELECT
                        productId,
                        transactionHash,
                        createdAt
                    FROM products
                    ORDER BY id DESC
                `).all() as any[];

            for (const dbProduct of dbProducts) {

                if (!productIds.includes(dbProduct.productId)) {
                    productIds.push(dbProduct.productId);
                }

            }

            // -------------------------------------------------
            // LOAD COMPLETE PRODUCT DATA FROM BLOCKCHAIN
            // -------------------------------------------------

            for (const productId of productIds) {

                try {

                    const product =
                        await productVerification.verifyProduct(
                            productId,
                            ethers.ZeroHash
                        );

                    const exists = product[13];

                    if (!exists) {
                        continue;
                    }

                    const dbProduct =
                        dbProducts.find(
                            p =>
                                p.productId === productId
                        );

                    const blockchainEvent =
                        events.find(
                            event =>
                                String(event.args[0]) ===
                                productId
                        );

                    products.push({

                        productId:
                            product[0],

                        serialNumber:
                            product[1],

                        productName:
                            product[2],

                        manufacturer:
                            product[3],

                        batchNumber:
                            product[4],

                        manufacturingDate:
                            product[5],

                        expiryDate:
                            product[6],

                        metadataHash:
                            product[7],

                        status:
                            getStatusName(
                                product[8]
                            ),

                        activated:
                            product[9],

                        currentOwner:
                            product[10],

                        createdAt:
                            dbProduct?.createdAt ||
                            String(product[11]),

                        transactionHash:
                            dbProduct?.transactionHash ||
                            blockchainEvent?.transactionHash ||
                            null
                    });

                } catch (error) {

                    console.error(
                        `Blockchain lookup failed for ${productId}:`,
                        error
                    );

                }

            }

            // -------------------------------------------------
            // SORT
            // -------------------------------------------------

            products.sort(
                (a, b) =>
                    String(b.productId).localeCompare(
                        String(a.productId),
                        undefined,
                        {
                            numeric: true
                        }
                    )
            );

            console.log(
                "Products returned:",
                products.map(
                    p => p.productId
                )
            );

            return res.json({

                success: true,

                count:
                    products.length,

                products

            });

        } catch (error) {

            console.error(
                "Get Products Error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to fetch products."

            });

        }

    }
);

// =====================================================
// GET SINGLE PRODUCT
// =====================================================

app.get(
    "/api/products/:productId",
    async (req, res) => {

        try {

            const productId =
                req.params.productId;

            console.log(
                "API Product Lookup:",
                productId
            );

            const product =
                await productVerification.verifyProduct(
                    productId,
                    ethers.ZeroHash
                );

            const exists =
                product[13];

            if (!exists) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Product not found on blockchain."
                });
            }

            const dbProduct =
                db.prepare(`
                    SELECT
                        transactionHash,
                        createdAt
                    FROM products
                    WHERE productId = ?
                `).get(
                    productId
                ) as
                    | {
                        transactionHash:
                            string | null;
                        createdAt:
                            string | null;
                    }
                    | undefined;

            const legacyTransactionHashes: Record<string, string> = {
                PROD004:
                    "0x5b8a77a88886825890dd61e6ef873be3d94aed1fe0cf003fa5871b05d1a5b9fb",

                PROD005:
                    "0x1feebd17af017ece30cff01e9148dfffb571ae494fdaa7c6bddfb4ae5d21a490"
            };

            const transactionHash =
                dbProduct?.transactionHash ||
                legacyTransactionHashes[productId] ||
                null;

            return res.json({

                success: true,

                product: {

                    productId:
                        product[0],

                    serialNumber:
                        product[1],

                    productName:
                        product[2],

                    manufacturer:
                        product[3],

                    batchNumber:
                        product[4],

                    manufacturingDate:
                        product[5],

                    expiryDate:
                        product[6],

                    metadataHash:
                        product[7],

                    status:
                        getStatusName(
                            product[8]
                        ),

                    activated:
                        product[9],

                    currentOwner:
                        product[10],

                    createdAt:
                        dbProduct?.createdAt ||
                        formatCreatedDate(product[11]),

                    transactionHash:
                        transactionHash
                }
            });

        } catch (error: any) {

            console.error(
                "Product API Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to fetch product information."
            });
        }
    }
);

// =====================================================
// ACTIVATE PRODUCT
// =====================================================

app.post(
    "/api/products/:productId/activate",
    async (req, res) => {

        try {

            const productId =
                req.params.productId;

            const {
                secret
            } = req.body;

            if (!secret) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Secret is required."
                });
            }

            const secretHash =
                ethers.keccak256(
                    ethers.toUtf8Bytes(
                        secret.trim()
                    )
                );

            const privateKey =
                process.env
                    .MANUFACTURER_PRIVATE_KEY;

            if (!privateKey) {
                return res.status(500).json({
                    success: false,
                    message:
                        "MANUFACTURER_PRIVATE_KEY is not configured."
                });
            }

            const wallet =
                new ethers.Wallet(
                    privateKey,
                    provider
                );

            const contractWithWallet =
                productVerification.connect(
                    wallet
                );

            const tx =
                await contractWithWallet.activateProduct(
                    productId,
                    secretHash
                );

            await tx.wait();

            console.log(
                "Product activated:",
                productId
            );

            return res.json({

                success: true,

                message:
                    "Product activated successfully.",

                productId,

                transactionHash:
                    tx.hash
            });

        } catch (error: any) {

            console.error(
                "Activation Error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    error.reason ||
                    error.message ||
                    "Product activation failed."
            });
        }
    }
);


// =====================================================
// UPDATE PRODUCT STATUS
// =====================================================

app.put(
    "/api/products/:productId/status",
    async (req, res) => {

        try {

            const productId =
                req.params.productId;

            const { status } =
                req.body;

            // ---------------------------------------------
            // VALID STATUS VALUES
            // ---------------------------------------------

            const allowedStatuses = [
                "ACTIVE",
                "SOLD",
                "SUSPENDED",
                "RECALLED",
                "BLOCKED"
            ];

            if (
                !status ||
                !allowedStatuses.includes(
                    status.toUpperCase()
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid product status."
                });
            }

            const newStatus =
                status.toUpperCase();

            // ---------------------------------------------
            // CHECK PRODUCT EXISTS
            // ---------------------------------------------

            const product =
                await productVerification.verifyProduct(
                    productId,
                    ethers.ZeroHash
                );

            const exists =
                product[13];

            if (!exists) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Product not found on blockchain."
                });
            }

            // ---------------------------------------------
            // STATUS NUMBER
            // ---------------------------------------------

            const statusMap: Record<
                string,
                number
            > = {

                ACTIVE: 1,

                SOLD: 2,

                SUSPENDED: 3,

                RECALLED: 4,

                BLOCKED: 5
            };

            const statusNumber =
                statusMap[newStatus];

            // ---------------------------------------------
            // MANUFACTURER / ADMIN WALLET
            // ---------------------------------------------

            const privateKey =
                process.env
                    .MANUFACTURER_PRIVATE_KEY;

            if (!privateKey) {
                return res.status(500).json({
                    success: false,
                    message:
                        "MANUFACTURER_PRIVATE_KEY is not configured."
                });
            }

            const wallet =
                new ethers.Wallet(
                    privateKey,
                    provider
                );

            const contractWithWallet =
                productVerification.connect(
                    wallet
                );

            // ---------------------------------------------
            // BLOCKCHAIN STATUS UPDATE
            // ---------------------------------------------

            const tx =
                await contractWithWallet.updateStatus(
                    productId,
                    statusNumber
                );

            await tx.wait();

            console.log(
                `Product ${productId} status updated to ${newStatus}`
            );

            return res.json({

                success: true,

                message:
                    "Product status updated successfully.",

                productId,

                status:
                    newStatus,

                transactionHash:
                    tx.hash
            });

        } catch (error: any) {

            console.error(
                "Status Update Error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    error.reason ||
                    error.message ||
                    "Unable to update product status."
            });
        }
    }
);

// =====================================================
// REACT FRONTEND VERIFICATION API
// =====================================================

app.get(
    "/api/products/:productId/verify",
    async (req, res) => {

        try {

            const productId =
                req.params.productId;

            const authToken =
                req.query.secret as string;

            if (
                !authToken ||
                authToken.trim() === ""
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Authentication code is required."
                });
            }

            const secretHash =
                ethers.keccak256(
                    ethers.toUtf8Bytes(
                        authToken.trim()
                    )
                );

            const product =
                await productVerification.verifyProduct(
                    productId,
                    secretHash
                );

            const status =
                product[8];

            const activated =
                product[9];

            const secretValid =
                product[12];

            const exists =
                product[13];

            // -------------------------------------------------
            // PRODUCT DOES NOT EXIST
            // -------------------------------------------------

            if (!exists) {

                insertScan.run(
                    productId,
                    new Date().toISOString(),
                    "NOT_VERIFIED",
                    0
                );

                return res.json({

                    success: false,

                    verified: false,

                    message:
                        "Product does not exist on the blockchain."
                });
            }

            const statusName =
                getStatusName(status);

            const currentTime =
                new Date().toISOString();

            // -------------------------------------------------
            // RECORD SCAN
            // -------------------------------------------------

            if (secretValid) {

                insertScan.run(
                    productId,
                    currentTime,
                    "AUTHENTIC",
                    1
                );

            } else {

                insertScan.run(
                    productId,
                    currentTime,
                    "NOT_VERIFIED",
                    0
                );
            }

            // -------------------------------------------------
            // RISK
            // -------------------------------------------------

            const failed =
                getFailedAttemptCount.get(
                    productId
                ) as {
                    count: number
                };

            const risk =
                calculateRisk(
                    failed.count
                );

            // -------------------------------------------------
            // RETURN RESULT
            // -------------------------------------------------

            return res.json({

                success: true,

                verified:
                    secretValid,

                productId:
                    product[0],

                serialNumber:
                    product[1],

                productName:
                    product[2],

                manufacturer:
                    product[3],

                batchNumber:
                    product[4],

                manufacturingDate:
                    product[5],

                expiryDate:
                    product[6],

                status:
                    statusName,

                activated:
                    activated,

                blockchainVerified:
                    true,

                secretValid:
                    secretValid,

                riskScore:
                    risk.riskScore,

                riskLevel:
                    risk.riskLevel
            });

        } catch (error: any) {

            console.error(
                "API Verification Error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to verify product."
            });
        }
    }
);

// =====================================================
// QR VERIFICATION PAGE
// =====================================================

app.get(
    "/verify/:productId",
    async (req, res) => {

        const productId =
            req.params.productId;

        console.log("");
        console.log(
            "================================"
        );
        console.log(
            "QR VERIFICATION PAGE"
        );
        console.log(
            "Product ID:",
            productId
        );
        console.log(
            "================================"
        );

        res.send(`
<!DOCTYPE html>

<html>

<head>

    <title>
        TrustChain Product Verification
    </title>

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
    >

    <style>

        body {
            font-family:
                Arial,
                sans-serif;

            max-width:
                600px;

            margin:
                50px auto;

            padding:
                20px;

            text-align:
                center;

            background:
                #f5f7fb;
        }

        .card {

            background:
                white;

            padding:
                30px;

            border-radius:
                15px;

            box-shadow:
                0 10px 30px
                rgba(0,0,0,0.08);
        }

        input {

            width:
                90%;

            padding:
                13px;

            margin:
                15px 0;

            font-size:
                16px;

            border:
                1px solid #d0d5dd;

            border-radius:
                8px;

            box-sizing:
                border-box;
        }

        button {

            padding:
                13px 25px;

            font-size:
                16px;

            cursor:
                pointer;

            background:
                #315dcc;

            color:
                white;

            border:
                none;

            border-radius:
                8px;
        }

    </style>

</head>

<body>

    <div class="card">

        <h1>
            🔍 Verify Product
        </h1>

        <p>
            <b>Product ID:</b>
            ${productId}
        </p>

        <hr>

        <h3>
            Enter Authentication Code
        </h3>

        <p>
            Enter the secret code printed
            on the product/package.
        </p>

        <form
            method="GET"
            action="/verify/${encodeURIComponent(
                productId
            )}/check"
        >

            <input
                type="text"
                name="secret"
                placeholder="Example: 7K9P-42XM-Q8"
                required
            >

            <br>

            <button
                type="submit"
            >
                Verify Product
            </button>

        </form>

    </div>

</body>

</html>
        `);
    }
);

// =====================================================
// HTML VERIFICATION RESULT
// =====================================================

app.get(
    "/verify/:productId/check",
    async (req, res) => {

        try {

            const productId =
                req.params.productId;

            const authToken =
                req.query.secret as string;

            if (
                !authToken ||
                authToken.trim() === ""
            ) {

                return res.status(400).send(`
                    <h1>
                        ❌ Invalid Request
                    </h1>

                    <p>
                        Authentication code is required.
                    </p>
                `);
            }

            const secretHash =
                ethers.keccak256(
                    ethers.toUtf8Bytes(
                        authToken.trim()
                    )
                );

            const product =
                await productVerification.verifyProduct(
                    productId,
                    secretHash
                );

            const status =
                product[8];

            const activated =
                product[9];

            const secretValid =
                product[12];

            const exists =
                product[13];

            const currentTime =
                new Date().toISOString();

            // -------------------------------------------------
            // NOT FOUND
            // -------------------------------------------------

            if (!exists) {

                insertScan.run(
                    productId,
                    currentTime,
                    "NOT_VERIFIED",
                    0
                );

                return res.send(`
                    <html>

                    <body>

                        <h1>
                            ❌ Product Not Verified
                        </h1>

                        <p>
                            Product ID does not exist
                            on the blockchain.
                        </p>

                        <p>
                            <b>Blockchain Record:</b>
                            NOT FOUND
                        </p>

                        <h2>
                            VERDICT:
                            NOT VERIFIED
                        </h2>

                    </body>

                    </html>
                `);
            }

            // -------------------------------------------------
            // WRONG SECRET
            // -------------------------------------------------

            if (!secretValid) {

                insertScan.run(
                    productId,
                    currentTime,
                    "NOT_VERIFIED",
                    0
                );

                const failed =
                    getFailedAttemptCount.get(
                        productId
                    ) as {
                        count: number
                    };

                const risk =
                    calculateRisk(
                        failed.count
                    );

                return res.send(`
                    <html>

                    <body>

                        <h1>
                            ❌ Authentication Failed
                        </h1>

                        <p>
                            <b>Product ID:</b>
                            ${product[0]}
                        </p>

                        <p>
                            <b>Serial Number:</b>
                            ${product[1]}
                        </p>

                        <p>
                            <b>Product Name:</b>
                            ${product[2]}
                        </p>

                        <p>
                            <b>Manufacturer:</b>
                            ${product[3]}
                        </p>

                        <hr>

                        <p>
                            <b>Blockchain:</b>
                            VERIFIED
                        </p>

                        <p>
                            <b>Secret:</b>
                            INVALID
                        </p>

                        <p>
                            <b>Risk Score:</b>
                            ${risk.riskScore}/100
                        </p>

                        <p>
                            <b>Risk Level:</b>
                            ${risk.riskLevel}
                        </p>

                        <h2>
                            VERDICT:
                            SUSPICIOUS / NOT VERIFIED
                        </h2>

                    </body>

                    </html>
                `);
            }

            // -------------------------------------------------
            // SUSPENDED
            // -------------------------------------------------

            if (status === 3n) {

                insertScan.run(
                    productId,
                    currentTime,
                    "SUSPENDED",
                    1
                );

                return res.send(`
                    <html>

                    <body>

                        <h1>
                            ⚠️ Product Suspended
                        </h1>

                        <p>
                            Verification of this product
                            is currently suspended.
                        </p>

                    </body>

                    </html>
                `);
            }

            // -------------------------------------------------
            // RECALLED
            // -------------------------------------------------

            if (status === 4n) {

                insertScan.run(
                    productId,
                    currentTime,
                    "RECALLED",
                    1
                );

                return res.send(`
                    <html>

                    <body>

                        <h1>
                            ⚠️ Product Recalled
                        </h1>

                        <p>
                            This product has been
                            recalled by the manufacturer.
                        </p>

                    </body>

                    </html>
                `);
            }

            // -------------------------------------------------
            // BLOCKED
            // -------------------------------------------------

            if (status === 5n) {

                insertScan.run(
                    productId,
                    currentTime,
                    "BLOCKED",
                    1
                );

                return res.send(`
                    <html>

                    <body>

                        <h1>
                            🚫 Product Blocked
                        </h1>

                        <p>
                            This product has been
                            blocked.
                        </p>

                    </body>

                    </html>
                `);
            }

            // -------------------------------------------------
            // RISK
            // -------------------------------------------------

            const failed =
                getFailedAttemptCount.get(
                    productId
                ) as {
                    count: number
                };

            const risk =
                calculateRisk(
                    failed.count
                );

            // -------------------------------------------------
            // REGISTERED BUT NOT ACTIVATED
            // -------------------------------------------------

            if (
                status === 0n &&
                !activated
            ) {

                insertScan.run(
                    productId,
                    currentTime,
                    "REGISTERED",
                    1
                );

                return res.send(`
                    <html>

                    <body>

                        <h1>
                            🟡 Product Registered
                        </h1>

                        <p>
                            <b>Product ID:</b>
                            ${product[0]}
                        </p>

                        <p>
                            <b>Serial Number:</b>
                            ${product[1]}
                        </p>

                        <p>
                            <b>Product Name:</b>
                            ${product[2]}
                        </p>

                        <p>
                            <b>Manufacturer:</b>
                            ${product[3]}
                        </p>

                        <hr>

                        <p>
                            <b>Blockchain:</b>
                            SUCCESS
                        </p>

                        <p>
                            <b>Secret Authentication:</b>
                            VALID
                        </p>

                        <p>
                            <b>Product Status:</b>
                            REGISTERED
                        </p>

                        <p>
                            <b>Activated:</b>
                            NO
                        </p>

                        <h2>
                            VERDICT:
                            AUTHENTICATION VALID —
                            ACTIVATION REQUIRED
                        </h2>

                    </body>

                    </html>
                `);
            }

            // -------------------------------------------------
            // AUTHENTIC PRODUCT
            // -------------------------------------------------

            insertScan.run(
                productId,
                currentTime,
                "AUTHENTIC",
                1
            );

            return res.send(`
                <html>

                <body>

                    <h1>
                        ✅ Authentic Product
                    </h1>

                    <p>
                        <b>Product ID:</b>
                        ${product[0]}
                    </p>

                    <p>
                        <b>Serial Number:</b>
                        ${product[1]}
                    </p>

                    <p>
                        <b>Product Name:</b>
                        ${product[2]}
                    </p>

                    <p>
                        <b>Manufacturer:</b>
                        ${product[3]}
                    </p>

                    <p>
                        <b>Batch Number:</b>
                        ${product[4]}
                    </p>

                    <p>
                        <b>Manufacturing Date:</b>
                        ${product[5]}
                    </p>

                    <p>
                        <b>Expiry Date:</b>
                        ${product[6]}
                    </p>

                    <hr>

                    <h3>
                        Blockchain Verification:
                        SUCCESS
                    </h3>

                    <p>
                        <b>Secret Authentication:</b>
                        VALID
                    </p>

                    <p>
                        <b>Product Status:</b>
                        ${getStatusName(status)}
                    </p>

                    <p>
                        <b>Activated:</b>
                        ${activated ? "YES" : "NO"}
                    </p>

                    <h2>
                        VERDICT:
                        AUTHENTIC PRODUCT
                    </h2>

                    <p>
                        <b>Risk Score:</b>
                        ${risk.riskScore}/100
                    </p>

                    <p>
                        <b>Risk Level:</b>
                        ${risk.riskLevel}
                    </p>

                </body>

                </html>
            `);

        } catch (error: any) {

            console.error(
                "Verification Error:",
                error
            );

            return res.status(500).send(`
                <html>

                <body>

                    <h1>
                        ❌ Verification Error
                    </h1>

                    <p>
                        ${
                            error.message ||
                            "Unable to verify product."
                        }
                    </p>

                </body>

                </html>
            `);
        }
    }
);

// =====================================================
// SERVER START
// =====================================================

app.listen(
    PORT,
    () => {

        console.log(
            `Verification server running at http://localhost:${PORT}`
        );

        console.log(
            `Blockchain contract: ${contractAddress}`
        );

        console.log(
            "TrustChain backend ready."
        );
    }
);