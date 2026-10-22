import express from "express";
import Database from "better-sqlite3";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import "dotenv/config";
import cors from "cors";



const app = express();

app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://trustchain-frontend-fl3x.onrender.com"
    ],
    credentials: true
}));

const PORT = Number(process.env.PORT) || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================



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


async function discoverProducts(): Promise<
    {
        productId: string;
        transactionHash: string | null;
    }[]
> {
    const discoveredProducts = new Map<
        string,
        string | null
    >();

    const latestBlock =
        await provider.getBlockNumber();

    const LOOKBACK_BLOCKS = 30000;
    const CHUNK_SIZE = 5000;

    const fromBlock = Math.max(
        0,
        latestBlock - LOOKBACK_BLOCKS
    );

    console.log(
        `Discovering products from blocks ${fromBlock} to ${latestBlock}`
    );

    for (
        let startBlock = fromBlock;
        startBlock <= latestBlock;
        startBlock += CHUNK_SIZE
    ) {
        const endBlock = Math.min(
            startBlock + CHUNK_SIZE - 1,
            latestBlock
        );

        try {
            const events =
                await productVerification.queryFilter(
                    productVerification.filters.ProductRegistered(),
                    startBlock,
                    endBlock
                );

            console.log(
                `Blocks ${startBlock}-${endBlock}: ${events.length} registration events`
            );

            for (const event of events) {
                if (
                    "args" in event &&
                    event.args
                ) {
                    const productId =
                        event.args.productId ??
                        event.args[0];

                    if (
                        typeof productId ===
                        "string"
                    ) {
                        discoveredProducts.set(
                            productId,
                            event.transactionHash
                        );
                    }
                }
            }

            await new Promise((resolve) =>
                setTimeout(resolve, 300)
            );
        } catch (error) {
            console.error(
                `Failed scanning ${startBlock}-${endBlock}:`,
                error
            );

            await new Promise((resolve) =>
                setTimeout(resolve, 1500)
            );
        }
    }

    // These products are already confirmed
    // to exist on-chain.
    //
    // We only add their IDs here.
    // Their registration transaction hash
    // will be filled by the blockchain event scan
    // whenever that event is discovered.

    for (const productId of [
        "PROD001",
        "PROD002",
        "PROD003"
    ]) {
        if (!discoveredProducts.has(productId)) {
            discoveredProducts.set(
                productId,
                null
            );
        }
    }

    return [...discoveredProducts.entries()]
        .map(
            ([
                productId,
                transactionHash
            ]) => ({
                productId,
                transactionHash
            })
        );
}

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

// =====================================================
// GET ALL PRODUCTS
// BLOCKCHAIN + DATABASE
// =====================================================

// =====================================================
// GET ALL PRODUCTS
// DATABASE PRODUCT IDS + BLOCKCHAIN DATA
// =====================================================



// =====================================================
// ONE-TIME SYNC EXISTING BLOCKCHAIN PRODUCT TO DATABASE
// =====================================================

app.post("/api/products/sync/:productId", async (req, res) => {
    try {
        const productId = req.params.productId.trim();

        // Fetch product from blockchain
        const product =
            await productVerification.verifyProduct(
                productId,
                ethers.ZeroHash
            );

        const exists = product[13];

        if (!exists) {
            return res.status(404).json({
                success: false,
                message: "Product not found on blockchain."
            });
        }

        // Check if already in database
        const existing =
            db.prepare(`
                SELECT productId
                FROM products
                WHERE productId = ?
            `).get(productId);

        if (existing) {
            return res.json({
                success: true,
                message: "Product already exists in database."
            });
        }

        // Insert blockchain product into SQLite
        db.prepare(`
            INSERT INTO products (
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
            product[0],
            product[1],
            product[2],
            product[3],
            product[4],
            product[5],
            product[6],
            null,
            new Date().toISOString()
        );

        console.log(
            "Synced blockchain product to database:",
            productId
        );

        return res.json({
            success: true,
            message: "Product synced successfully.",
            productId
        });

    } catch (error: any) {
        console.error(
            "Product Sync Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Product sync failed."
        });
    }
});

// =====================================================
// GET ALL PRODUCTS
// =====================================================

app.post("/api/products/update-transaction/:productId", async (req, res) => {
    try {
        const productId = req.params.productId.trim();
        const { transactionHash } = req.body;

        if (!transactionHash) {
            return res.status(400).json({
                success: false,
                message: "Transaction hash is required."
            });
        }

        const result = db.prepare(`
            UPDATE products
            SET transactionHash = ?
            WHERE productId = ?
        `).run(transactionHash, productId);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found in database."
            });
        }

        return res.json({
            success: true,
            message: "Transaction hash updated successfully.",
            productId,
            transactionHash
        });

    } catch (error: any) {
        console.error("Transaction Hash Update Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update transaction hash."
        });
    }
});

app.get("/api/products", async (req, res) => {
    try {
        // SQLite is used as the stable product index.
        const dbProducts = db.prepare(`
            SELECT
                productId,
                serialNumber,
                productName,
                manufacturer,
                batchNumber,
                manufacturingDate,
                expiryDate,
                transactionHash,
                createdAt
            FROM products
            ORDER BY id ASC
        `).all() as {
            productId: string;
            serialNumber: string;
            productName: string;
            manufacturer: string;
            batchNumber: string;
            manufacturingDate: string;
            expiryDate: string;
            transactionHash: string | null;
            createdAt: string;
        }[];

        console.log(
            `Loading ${dbProducts.length} products from database`
        );

        const products: any[] = [];

        for (const dbProduct of dbProducts) {
            try {
                // Try to refresh live blockchain information.
                const blockchainProduct =
                    await productVerification.verifyProduct(
                        dbProduct.productId,
                        ethers.ZeroHash
                    );

                const exists = blockchainProduct[13];

                if (exists) {
                    products.push({
                        productId: blockchainProduct[0],
                        serialNumber: blockchainProduct[1],
                        productName: blockchainProduct[2],
                        manufacturer: blockchainProduct[3],
                        batchNumber: blockchainProduct[4],
                        manufacturingDate: blockchainProduct[5],
                        expiryDate: blockchainProduct[6],
                        metadataHash: blockchainProduct[7],
                        status: getStatusName(
                            blockchainProduct[8]
                        ),
                        activated: blockchainProduct[9],
                        currentOwner: blockchainProduct[10],
                        createdAt:
                            dbProduct.createdAt ||
                            new Date(
                                Number(blockchainProduct[11]) * 1000
                            ).toISOString(),
                        transactionHash:
                            dbProduct.transactionHash || null
                    });

                    console.log(
                        `Loaded ${dbProduct.productId} from blockchain`
                    );
                } else {
                    // Product is in DB but not found on blockchain.
                    // Keep it visible instead of silently removing it.
                    products.push({
                        productId: dbProduct.productId,
                        serialNumber: dbProduct.serialNumber,
                        productName: dbProduct.productName,
                        manufacturer: dbProduct.manufacturer,
                        batchNumber: dbProduct.batchNumber,
                        manufacturingDate:
                            dbProduct.manufacturingDate,
                        expiryDate: dbProduct.expiryDate,
                        metadataHash: null,
                        status: "UNKNOWN",
                        activated: false,
                        currentOwner: null,
                        createdAt: dbProduct.createdAt,
                        transactionHash:
                            dbProduct.transactionHash || null
                    });

                    console.warn(
                        `Product ${dbProduct.productId} exists in DB but not on blockchain`
                    );
                }

            } catch (error) {
                // IMPORTANT:
                // A temporary RPC failure must NOT make
                // the product disappear from the list.
                console.error(
                    `Blockchain lookup failed for ${dbProduct.productId}. Using database data.`,
                    error
                );

                products.push({
                    productId: dbProduct.productId,
                    serialNumber: dbProduct.serialNumber,
                    productName: dbProduct.productName,
                    manufacturer: dbProduct.manufacturer,
                    batchNumber: dbProduct.batchNumber,
                    manufacturingDate:
                        dbProduct.manufacturingDate,
                    expiryDate: dbProduct.expiryDate,
                    metadataHash: null,
                    status: "UNKNOWN",
                    activated: false,
                    currentOwner: null,
                    createdAt: dbProduct.createdAt,
                    transactionHash:
                        dbProduct.transactionHash || null
                });
            }

            // Small delay between RPC calls.
            await new Promise((resolve) =>
                setTimeout(resolve, 300)
            );
        }

        return res.json({
            success: true,
            count: products.length,
            products
        });

    } catch (error) {
        console.error(
            "Get Products Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to fetch products."
        });
    }
});
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
<head>
    <title>TrustChain - Verification Failed</title>

    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: #f4f7fb;
            color: #101828;
        }

        .page {
            min-height: 100vh;
            padding: 55px 20px;
        }

        .container {
            width: 100%;
            max-width: 720px;
            margin: 0 auto;
        }

        .brand {
            text-align: center;
            margin-bottom: 28px;
        }

        .brand h1 {
            margin: 0;
            color: #315dcc;
            font-size: 32px;
            font-weight: 800;
        }

        .brand p {
            margin: 7px 0 0;
            color: #667085;
            font-size: 15px;
        }

        .verification-card {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 12px 35px rgba(16, 24, 40, 0.10);
            border: 1px solid #e4e7ec;
        }

        .warning-header {
            text-align: center;
            padding-bottom: 28px;
            border-bottom: 1px solid #eaecf0;
        }

        .warning-icon {
            width: 70px;
            height: 70px;
            margin: 0 auto 16px;
            border-radius: 50%;
            background: #fee4e2;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
        }

        .warning-header h2 {
            margin: 0;
            color: #b42318;
            font-size: 30px;
        }

        .warning-header p {
            margin: 10px 0 0;
            color: #667085;
            font-size: 15px;
            line-height: 1.5;
        }

        .record-card {
            margin-top: 28px;
            padding: 22px;
            border-radius: 14px;
            background: #fff7ed;
            border: 1px solid #fed7aa;
            text-align: center;
        }

        .record-title {
            color: #9a3412;
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .record-status {
            color: #c2410c;
            font-size: 20px;
            font-weight: 800;
        }

        .product-id {
            margin-top: 25px;
            padding: 18px;
            border-radius: 12px;
            background: #f8fafc;
            border: 1px solid #eaecf0;
            text-align: center;
        }

        .product-id-label {
            display: block;
            color: #667085;
            font-size: 13px;
            margin-bottom: 6px;
        }

        .product-id-value {
            font-size: 20px;
            font-weight: 800;
        }

        .verdict {
            margin-top: 25px;
            padding: 18px;
            border-radius: 12px;
            background: #fef3f2;
            color: #b42318;
            text-align: center;
            font-size: 20px;
            font-weight: 800;
        }

        .message {
            margin-top: 20px;
            text-align: center;
            color: #667085;
            font-size: 14px;
            line-height: 1.6;
        }

        .footer {
            text-align: center;
            margin-top: 20px;
            color: #98a2b3;
            font-size: 13px;
        }

        @media (max-width: 600px) {
            .page {
                padding: 30px 14px;
            }

            .verification-card {
                padding: 25px 20px;
            }

            .warning-header h2 {
                font-size: 25px;
            }
        }
    </style>
</head>

<body>

<div class="page">

    <div class="container">

        <div class="brand">
            <h1>TrustChain</h1>
            <p>Blockchain-Based Product Authentication</p>
        </div>

        <div class="verification-card">

            <div class="warning-header">

                <div class="warning-icon">
                    ✕
                </div>

                <h2>Product Not Verified</h2>

                <p>
                    This product could not be found
                    on the blockchain.
                </p>

            </div>

            <div class="product-id">

                <span class="product-id-label">
                    Product ID
                </span>

                <span class="product-id-value">
                    ${productId}
                </span>

            </div>

            <div class="record-card">

                <div class="record-title">
                    BLOCKCHAIN RECORD
                </div>

                <div class="record-status">
                    NOT FOUND
                </div>

            </div>

            <div class="verdict">
                ✕ VERDICT: NOT VERIFIED
            </div>

            <div class="message">
                No matching blockchain record exists for this
                product ID. The product cannot be authenticated
                through TrustChain.
            </div>

        </div>

        <div class="footer">
            TrustChain • Blockchain-Based Product Authentication
        </div>

    </div>

</div>

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
<head>
    <title>TrustChain - Authentication Failed</title>

    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: #f4f7fb;
            color: #101828;
        }

        .page {
            min-height: 100vh;
            padding: 50px 20px;
        }

        .container {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
        }

        .brand {
            text-align: center;
            margin-bottom: 28px;
        }

        .brand h1 {
            margin: 0;
            color: #315dcc;
            font-size: 32px;
            font-weight: 800;
        }

        .brand p {
            margin: 7px 0 0;
            color: #667085;
            font-size: 15px;
        }

        .card {
            background: #ffffff;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 12px 35px rgba(16, 24, 40, 0.10);
            border: 1px solid #e4e7ec;
        }

        .header {
            text-align: center;
            padding-bottom: 28px;
            border-bottom: 1px solid #eaecf0;
        }

        .warning-icon {
            width: 72px;
            height: 72px;
            margin: 0 auto 16px;
            border-radius: 50%;
            background: #ffedd5;
            color: #c2410c;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 38px;
            font-weight: bold;
        }

        .header h2 {
            margin: 0;
            color: #c2410c;
            font-size: 30px;
        }

        .header p {
            margin: 10px 0 0;
            color: #667085;
            font-size: 15px;
            line-height: 1.5;
        }

        .section-title {
            margin-top: 30px;
            margin-bottom: 16px;
            font-size: 20px;
            font-weight: 800;
        }

        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
        }

        .info-box {
            padding: 17px;
            border-radius: 12px;
            background: #f8fafc;
            border: 1px solid #e4e7ec;
        }

        .label {
            display: block;
            color: #667085;
            font-size: 13px;
            margin-bottom: 6px;
        }

        .value {
            font-size: 16px;
            font-weight: 700;
        }

        .verification {
            margin-top: 30px;
            padding-top: 28px;
            border-top: 1px solid #eaecf0;
        }

        .check-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 17px 0;
            border-bottom: 1px solid #eaecf0;
            font-size: 15px;
        }

        .check-name {
            font-weight: 700;
            color: #344054;
        }

        .badge {
            padding: 7px 13px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 800;
        }

        .verified {
            background: #dcfae6;
            color: #067647;
        }

        .invalid {
            background: #fee4e2;
            color: #b42318;
        }

        .risk-card {
            margin-top: 28px;
            padding: 25px;
            border-radius: 14px;
            background: #fff7ed;
            border: 1px solid #fdba74;
            text-align: center;
        }

        .risk-title {
            color: #9a3412;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.5px;
        }

        .risk-score {
            margin-top: 6px;
            color: #c2410c;
            font-size: 42px;
            font-weight: 900;
        }

        .risk-level {
            display: inline-block;
            margin-top: 8px;
            padding: 8px 16px;
            border-radius: 999px;
            background: #ffedd5;
            color: #c2410c;
            font-weight: 800;
        }

        .verdict {
            margin-top: 24px;
            padding: 20px;
            border-radius: 13px;
            background: #fef3f2;
            color: #b42318;
            text-align: center;
            font-size: 20px;
            font-weight: 900;
        }

        .notice {
            margin-top: 20px;
            padding: 16px 18px;
            border-radius: 12px;
            background: #fff7ed;
            color: #9a3412;
            text-align: center;
            font-size: 14px;
            line-height: 1.6;
        }

        .footer {
            text-align: center;
            margin-top: 20px;
            color: #98a2b3;
            font-size: 13px;
        }

        @media (max-width: 600px) {
            .page {
                padding: 30px 14px;
            }

            .card {
                padding: 25px 20px;
            }

            .info-grid {
                grid-template-columns: 1fr;
            }

            .header h2 {
                font-size: 25px;
            }
        }
    </style>
</head>

<body>

<div class="page">

    <div class="container">

        <div class="brand">
            <h1>TrustChain</h1>
            <p>Blockchain-Based Product Authentication</p>
        </div>

        <div class="card">

            <div class="header">

                <div class="warning-icon">
                    !
                </div>

                <h2>Authentication Failed</h2>

                <p>
                    The product exists on the blockchain,
                    but the authentication secret is invalid.
                </p>

            </div>

            <div class="section-title">
                Product Information
            </div>

            <div class="info-grid">

                <div class="info-box">
                    <span class="label">Product ID</span>
                    <span class="value">${product[0]}</span>
                </div>

                <div class="info-box">
                    <span class="label">Serial Number</span>
                    <span class="value">${product[1]}</span>
                </div>

                <div class="info-box">
                    <span class="label">Product Name</span>
                    <span class="value">${product[2]}</span>
                </div>

                <div class="info-box">
                    <span class="label">Manufacturer</span>
                    <span class="value">${product[3]}</span>
                </div>

            </div>

            <div class="verification">

                <div class="section-title">
                    Blockchain Verification
                </div>

                <div class="check-row">
                    <span class="check-name">
                        Blockchain Record
                    </span>

                    <span class="badge verified">
                        ✓ VERIFIED
                    </span>
                </div>

                <div class="check-row">
                    <span class="check-name">
                        Secret Authentication
                    </span>

                    <span class="badge invalid">
                        ✕ INVALID
                    </span>
                </div>

            </div>

            <div class="risk-card">

                <div class="risk-title">
                    RISK SCORE
                </div>

                <div class="risk-score">
                    ${risk.riskScore}/100
                </div>

                <div class="risk-level">
                    ⚠ ${risk.riskLevel} RISK
                </div>

            </div>

            <div class="verdict">
                ⚠ VERDICT: SUSPICIOUS / NOT VERIFIED
            </div>

            <div class="notice">
                The blockchain record exists, but the supplied
                authentication secret does not match the registered
                product credentials. The product should not be
                considered authentic.
            </div>

        </div>

        <div class="footer">
            TrustChain • Blockchain-Based Product Authentication
        </div>

    </div>

</div>

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
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>Product Registered - TrustChain</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: #f5f7fb;
            color: #101828;
        }

        .header {
            background: #ffffff;
            border-bottom: 1px solid #e4e7ec;
            padding: 18px 7%;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 24px;
            font-weight: 700;
            color: #2563eb;
        }

        .brand-icon {
            width: 34px;
            height: 34px;
            border-radius: 10px;
            background: #2563eb;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }

        .container {
            max-width: 900px;
            margin: 45px auto;
            padding: 0 22px;
        }

        .success-card {
            background: white;
            border-radius: 18px;
            padding: 38px;
            box-shadow: 0 10px 30px rgba(16, 24, 40, 0.08);
            border: 1px solid #eaecf0;
        }

        .status-icon {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            background: #fff7e6;
            color: #f59e0b;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            margin-bottom: 20px;
        }

        h1 {
            margin: 0;
            font-size: 32px;
            line-height: 1.2;
        }

        .subtitle {
            margin-top: 10px;
            color: #667085;
            font-size: 16px;
            line-height: 1.6;
        }

        .section-title {
            margin: 32px 0 15px;
            font-size: 18px;
            font-weight: 700;
        }

        .product-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
        }

        .info-box {
            background: #f9fafb;
            border: 1px solid #eaecf0;
            border-radius: 12px;
            padding: 17px;
        }

        .label {
            display: block;
            color: #667085;
            font-size: 13px;
            margin-bottom: 6px;
        }

        .value {
            font-size: 15px;
            font-weight: 600;
            word-break: break-word;
        }

        .verification-card {
            margin-top: 25px;
            border: 1px solid #eaecf0;
            border-radius: 14px;
            overflow: hidden;
        }

        .verification-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 17px 20px;
            border-bottom: 1px solid #eaecf0;
        }

        .verification-row:last-child {
            border-bottom: none;
        }

        .verification-label {
            font-weight: 600;
        }

        .badge {
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
        }

        .green {
            background: #ecfdf3;
            color: #027a48;
        }

        .yellow {
            background: #fffaeb;
            color: #b54708;
        }

        .activation-box {
            margin-top: 25px;
            background: #fffaeb;
            border: 1px solid #fedf89;
            border-radius: 14px;
            padding: 20px;
        }

        .activation-title {
            color: #b54708;
            font-size: 16px;
            font-weight: 700;
            margin-bottom: 7px;
        }

        .activation-text {
            color: #7a2e0e;
            line-height: 1.5;
            font-size: 14px;
        }

        .verdict {
            margin-top: 30px;
            background: #f0f9ff;
            border: 1px solid #b9e6fe;
            border-radius: 14px;
            padding: 24px;
            text-align: center;
        }

        .verdict-label {
            color: #475467;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }

        .verdict-text {
            color: #0369a1;
            font-size: 22px;
            font-weight: 800;
        }

        .footer {
            text-align: center;
            margin-top: 25px;
            color: #98a2b3;
            font-size: 13px;
        }

        @media (max-width: 650px) {
            .container {
                margin: 25px auto;
            }

            .success-card {
                padding: 25px;
            }

            .product-grid {
                grid-template-columns: 1fr;
            }

            .verification-row {
                gap: 15px;
                align-items: flex-start;
                flex-direction: column;
            }

            h1 {
                font-size: 27px;
            }
        }
    </style>
</head>

<body>

    <div class="header">
        <div class="brand">
            <div class="brand-icon">T</div>
            TrustChain
        </div>
    </div>

    <div class="container">

        <div class="success-card">

            <div class="status-icon">✓</div>

            <h1>Product Registered</h1>

            <div class="subtitle">
                The product has been successfully registered on the blockchain.
                Authentication is valid, but activation is still required.
            </div>

            <div class="section-title">
                Product Information
            </div>

            <div class="product-grid">

                <div class="info-box">
                    <span class="label">Product ID</span>
                    <span class="value">${product[0]}</span>
                </div>

                <div class="info-box">
                    <span class="label">Serial Number</span>
                    <span class="value">${product[1]}</span>
                </div>

                <div class="info-box">
                    <span class="label">Product Name</span>
                    <span class="value">${product[2]}</span>
                </div>

                <div class="info-box">
                    <span class="label">Manufacturer</span>
                    <span class="value">${product[3]}</span>
                </div>

            </div>

            <div class="section-title">
                Blockchain Verification
            </div>

            <div class="verification-card">

                <div class="verification-row">
                    <span class="verification-label">
                        Blockchain Record
                    </span>

                    <span class="badge green">
                        VERIFIED
                    </span>
                </div>

                <div class="verification-row">
                    <span class="verification-label">
                        Secret Authentication
                    </span>

                    <span class="badge green">
                        VALID
                    </span>
                </div>

                <div class="verification-row">
                    <span class="verification-label">
                        Product Status
                    </span>

                    <span class="badge yellow">
                        REGISTERED
                    </span>
                </div>

                <div class="verification-row">
                    <span class="verification-label">
                        Activation Status
                    </span>

                    <span class="badge yellow">
                        NOT ACTIVATED
                    </span>
                </div>

            </div>

            <div class="activation-box">

                <div class="activation-title">
                    Activation Required
                </div>

                <div class="activation-text">
                    This product is authentic and exists on the blockchain,
                    but it has not been activated yet. The product must be
                    activated before it can be considered fully active.
                </div>

            </div>

            <div class="verdict">

                <div class="verdict-label">
                    VERDICT
                </div>

                <div class="verdict-text">
                    AUTHENTICATION VALID — ACTIVATION REQUIRED
                </div>

            </div>

        </div>

        <div class="footer">
            Secured by TrustChain Blockchain Verification
        </div>

    </div>

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
<head>
    <title>TrustChain - Product Verification</title>

    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: #f4f7fb;
            color: #101828;
        }

        .page {
            min-height: 100vh;
            padding: 45px 20px;
        }

        .container {
            width: 100%;
            max-width: 850px;
            margin: 0 auto;
        }

        .brand {
            text-align: center;
            margin-bottom: 28px;
        }

        .brand h1 {
            margin: 0;
            color: #315dcc;
            font-size: 32px;
            font-weight: 800;
        }

        .brand p {
            margin: 7px 0 0;
            color: #667085;
            font-size: 15px;
        }

        .verification-card {
            background: white;
            border-radius: 20px;
            padding: 35px;
            box-shadow: 0 12px 35px rgba(16, 24, 40, 0.10);
            border: 1px solid #e4e7ec;
        }

        .success-header {
            text-align: center;
            padding-bottom: 28px;
            border-bottom: 1px solid #eaecf0;
        }

        .success-icon {
            width: 68px;
            height: 68px;
            margin: 0 auto 14px;
            border-radius: 50%;
            background: #dcfae6;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
        }

        .success-header h2 {
            margin: 0;
            font-size: 30px;
            color: #067647;
        }

        .success-header p {
            margin: 8px 0 0;
            color: #667085;
            font-size: 15px;
        }

        .section-title {
            margin: 28px 0 18px;
            font-size: 19px;
            font-weight: 700;
        }

        .product-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
        }

        .info-box {
            background: #f8fafc;
            border: 1px solid #eaecf0;
            border-radius: 12px;
            padding: 15px 17px;
        }

        .info-label {
            display: block;
            color: #667085;
            font-size: 13px;
            margin-bottom: 5px;
        }

        .info-value {
            font-size: 16px;
            font-weight: 700;
            word-break: break-word;
        }

        .blockchain-section {
            margin-top: 30px;
            padding-top: 26px;
            border-top: 1px solid #eaecf0;
        }

        .verification-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 15px;
            padding: 14px 0;
            border-bottom: 1px solid #f2f4f7;
        }

        .verification-row:last-child {
            border-bottom: none;
        }

        .verification-label {
            color: #475467;
            font-weight: 600;
        }

        .success-badge {
            background: #dcfae6;
            color: #067647;
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 700;
        }

        .risk-card {
            margin-top: 30px;
            padding: 25px;
            border-radius: 16px;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            text-align: center;
        }

        .risk-title {
            color: #475467;
            font-size: 14px;
            font-weight: 600;
        }

        .risk-score {
            margin: 8px 0;
            font-size: 42px;
            font-weight: 800;
            color: #067647;
        }

        .risk-level {
            display: inline-block;
            padding: 7px 16px;
            border-radius: 999px;
            background: #dcfae6;
            color: #067647;
            font-weight: 700;
            font-size: 14px;
        }

        .verdict {
            margin-top: 25px;
            padding: 18px;
            border-radius: 12px;
            background: #ecfdf3;
            color: #067647;
            text-align: center;
            font-size: 20px;
            font-weight: 800;
        }

        .footer {
            text-align: center;
            margin-top: 20px;
            color: #98a2b3;
            font-size: 13px;
        }

        @media (max-width: 650px) {
            .page {
                padding: 25px 12px;
            }

            .verification-card {
                padding: 22px;
            }

            .product-grid {
                grid-template-columns: 1fr;
            }

            .success-header h2 {
                font-size: 25px;
            }

            .verification-row {
                align-items: flex-start;
                flex-direction: column;
            }
        }
    </style>
</head>

<body>

<div class="page">

    <div class="container">

        <div class="brand">
            <h1>TrustChain</h1>
            <p>Blockchain-Based Product Authentication</p>
        </div>

        <div class="verification-card">

            <div class="success-header">
                <div class="success-icon">✓</div>

                <h2>Authentic Product</h2>

                <p>
                    This product has been successfully verified
                    on the blockchain.
                </p>
            </div>

            <h3 class="section-title">
                Product Information
            </h3>

            <div class="product-grid">

                <div class="info-box">
                    <span class="info-label">Product ID</span>
                    <span class="info-value">${product[0]}</span>
                </div>

                <div class="info-box">
                    <span class="info-label">Serial Number</span>
                    <span class="info-value">${product[1]}</span>
                </div>

                <div class="info-box">
                    <span class="info-label">Product Name</span>
                    <span class="info-value">${product[2]}</span>
                </div>

                <div class="info-box">
                    <span class="info-label">Manufacturer</span>
                    <span class="info-value">${product[3]}</span>
                </div>

                <div class="info-box">
                    <span class="info-label">Batch Number</span>
                    <span class="info-value">${product[4]}</span>
                </div>

                <div class="info-box">
                    <span class="info-label">Manufacturing Date</span>
                    <span class="info-value">${product[5]}</span>
                </div>

                <div class="info-box">
                    <span class="info-label">Expiry Date</span>
                    <span class="info-value">${product[6]}</span>
                </div>

            </div>

            <div class="blockchain-section">

                <h3 class="section-title">
                    Blockchain Verification
                </h3>

                <div class="verification-row">
                    <span class="verification-label">
                        Blockchain Verification
                    </span>

                    <span class="success-badge">
                        ✓ SUCCESS
                    </span>
                </div>

                <div class="verification-row">
                    <span class="verification-label">
                        Secret Authentication
                    </span>

                    <span class="success-badge">
                        ✓ VALID
                    </span>
                </div>

                <div class="verification-row">
                    <span class="verification-label">
                        Product Status
                    </span>

                    <span class="success-badge">
                        ${getStatusName(status)}
                    </span>
                </div>

                <div class="verification-row">
                    <span class="verification-label">
                        Activated
                    </span>

                    <span class="success-badge">
                        ${activated ? "YES" : "NO"}
                    </span>
                </div>

            </div>

            <div class="risk-card">

                <div class="risk-title">
                    RISK SCORE
                </div>

                <div class="risk-score">
                    ${risk.riskScore}/100
                </div>

                <span class="risk-level">
                    🟢 ${risk.riskLevel} RISK
                </span>

            </div>

            <div class="verdict">
                ✓ VERDICT: AUTHENTIC PRODUCT
            </div>

        </div>

        <div class="footer">
            Verified securely using blockchain technology
        </div>

    </div>

</div>

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