import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import QRCode from "qrcode";

const API = "https://trustchain-s9a6.onrender.com";

function App() {
  // =========================
  // CUSTOMER
  // =========================
  const [productId, setProductId] = useState("");
  const [secret, setSecret] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);

  // =========================
  // QR SCANNER
  // =========================
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const scannerRef = useRef(null);

  // =========================
  // MANUFACTURER LOGIN
  // =========================
  const [showManufacturerLogin, setShowManufacturerLogin] = useState(false);
  const [manufacturerEmail, setManufacturerEmail] = useState("");
  const [manufacturerPassword, setManufacturerPassword] = useState("");

  // =========================
  // DASHBOARD
  // =========================
  const [dashboardView, setDashboardView] = useState("home");
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // =========================
  // REGISTER PRODUCT
  // =========================
  const [registerForm, setRegisterForm] = useState({
    productId: "",
    serialNumber: "",
    productName: "",
    manufacturer: "ABC Electronics",
    batchNumber: "",
    manufacturingDate: "",
    expiryDate: "",
    secret: "",
  });

  const [registerLoading, setRegisterLoading] = useState(false);

  // =========================
  // QR GENERATION
  // =========================
  const [qrProduct, setQrProduct] = useState(null);
  const [qrImage, setQrImage] = useState("");

  // =========================
  // HELPERS
  // =========================

  const statusLabel = (status) => {
    if (status === undefined || status === null || status === "") {
      return "UNKNOWN";
    }

    return String(status).toUpperCase();
  };

  const statusStyle = (status) => {
    const s = statusLabel(status);

    if (s === "ACTIVE" || s === "REGISTERED") {
      return {
        background: "#e8f5e9",
        color: "#2e7d32",
      };
    }

    if (s === "SOLD") {
      return {
        background: "#e8f0ff",
        color: "#315dcc",
      };
    }

    if (s === "SUSPENDED" || s === "RECALLED") {
      return {
        background: "#fff4e5",
        color: "#b54708",
      };
    }

    if (s === "BLOCKED") {
      return {
        background: "#ffebee",
        color: "#c62828",
      };
    }

    return {
      background: "#f2f4f7",
      color: "#475467",
    };
  };

  const formatDate = (value) => {
    if (!value) return "Not available";

    return String(value).slice(0, 10);
  };

  // =========================================================
  // CUSTOMER VERIFICATION
  // =========================================================

  const verifyProduct = () => {
    if (!productId.trim()) {
      alert("Please enter a Product ID");
      return;
    }

    window.location.href =
      `${API}/verify/${encodeURIComponent(productId.trim())}`;
  };

  const authenticateProduct = async () => {
    if (!productId.trim()) {
      alert("Please enter Product ID");
      return;
    }

    if (!secret.trim()) {
      alert("Please enter the authentication code");
      return;
    }

    setCustomerLoading(true);
    setVerificationResult(null);

    try {
      const response = await fetch(
        `${API}/api/products/${encodeURIComponent(
          productId.trim()
        )}/verify?secret=${encodeURIComponent(secret.trim())}`
      );

      const data = await response.json();

      setVerificationResult({
        verified: Boolean(data.verified),
        ...data,
      });
    } catch (error) {
      console.error("Verification Error:", error);

      setVerificationResult({
        verified: false,
        success: false,
        message: "Unable to connect to verification server.",
      });
    } finally {
      setCustomerLoading(false);
    }
  };

  // =========================================================
  // QR SCANNER
  // =========================================================

  const stopScanner = async () => {
    const scanner = scannerRef.current;

    if (!scanner) return;

    try {
      const state = scanner.getState();

      if (state === 2) {
        await scanner.stop();
      }
    } catch (error) {
      console.log("Scanner stop:", error);
    }

    try {
      scanner.clear();
    } catch (error) {
      console.log("Scanner clear:", error);
    }

    scannerRef.current = null;
  };

  const handleQRScan = (decodedText) => {
    try {
      const url = new URL(decodedText);

      const parts = url.pathname.split("/").filter(Boolean);

      const verifyIndex = parts.indexOf("verify");

      if (verifyIndex !== -1 && parts[verifyIndex + 1]) {
        const scannedProductId = decodeURIComponent(
          parts[verifyIndex + 1]
        );

        setProductId(scannedProductId);
        setShowQRScanner(false);

        window.location.href =
          `${API}/verify/${encodeURIComponent(scannedProductId)}`;

        return;
      }

      // QR contains only Product ID
      if (!decodedText.includes("/") && decodedText.trim()) {
        setProductId(decodedText.trim());
        setShowQRScanner(false);

        return;
      }

      alert("Invalid TrustChain QR code.");
    } catch (error) {
      console.error("QR parsing error:", error);

      if (decodedText && decodedText.trim()) {
        setProductId(decodedText.trim());
        setShowQRScanner(false);
      } else {
        alert("Invalid QR code.");
      }
    }
  };

  const startQRScanner = async () => {
    setScannerError("");

    setTimeout(async () => {
      try {
        await stopScanner();

        const scanner = new Html5Qrcode("trustchain-qr-reader");

        scannerRef.current = scanner;

        await scanner.start(
          {
            facingMode: "environment",
          },
          {
            fps: 10,
            qrbox: {
              width: 250,
              height: 250,
            },
          },
          async (decodedText) => {
            await stopScanner();

            handleQRScan(decodedText);
          },
          () => {}
        );
      } catch (error) {
        console.error("QR Scanner Error:", error);

        setScannerError(
          "Unable to access camera. Please allow camera permission and try again."
        );
      }
    }, 150);
  };

  const openScanner = () => {
    setScannerError("");
    setShowQRScanner(true);
  };

  const closeScanner = async () => {
    await stopScanner();

    setShowQRScanner(false);
    setScannerError("");
  };

  useEffect(() => {
    if (showQRScanner) {
      startQRScanner();
    }

    return () => {
      stopScanner();
    };
  }, [showQRScanner]);

  // =========================================================
  // MANUFACTURER LOGIN
  // =========================================================

  const manufacturerLogin = async () => {
    if (
      !manufacturerEmail.trim() ||
      !manufacturerPassword.trim()
    ) {
      alert("Please enter email and password");
      return;
    }

    try {
      const response = await fetch(
        `${API}/api/manufacturer/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: manufacturerEmail.trim(),
            password: manufacturerPassword,
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        alert(data.message || "Invalid login credentials");
        return;
      }

      setShowManufacturerLogin("dashboard");

      await loadProducts();
    } catch (error) {
      console.error("Login Error:", error);

      alert("Unable to connect to server");
    }
  };

  // =========================================================
  // PRODUCTS
  // =========================================================

  const loadProducts = async () => {
    setProductsLoading(true);

    try {
      const response = await fetch(`${API}/api/products`);

      const data = await response.json();

      if (data.success) {
        setProducts(
          Array.isArray(data.products)
            ? data.products
            : []
        );
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error("Products loading error:", error);

      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  const filteredProducts = products.filter((product) => {
    const query = dashboardSearch.trim().toLowerCase();

    const matchesSearch =
      !query ||
      [
        product.productId,
        product.serialNumber,
        product.productName,
        product.manufacturer,
        product.batchNumber,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(query)
        );

    const productStatus = statusLabel(
      product.status || "REGISTERED"
    );

    const matchesStatus =
      statusFilter === "ALL" ||
      productStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const productCounts = {
    total: products.length,

    active: products.filter(
      (p) => statusLabel(p.status) === "ACTIVE"
    ).length,

    registered: products.filter(
      (p) => statusLabel(p.status) === "REGISTERED"
    ).length,

    blocked: products.filter(
      (p) => statusLabel(p.status) === "BLOCKED"
    ).length,
  };

  // =========================================================
  // REGISTER PRODUCT
  // =========================================================

  const registerProduct = async () => {
    const requiredFields = [
      "productId",
      "serialNumber",
      "productName",
      "manufacturer",
      "batchNumber",
      "manufacturingDate",
      "expiryDate",
      "secret",
    ];

    for (const field of requiredFields) {
      if (!String(registerForm[field] || "").trim()) {
        alert(`Please enter ${field}`);
        return;
      }
    }

    if (
      registerForm.manufacturingDate &&
      registerForm.expiryDate &&
      registerForm.expiryDate <
        registerForm.manufacturingDate
    ) {
      alert(
        "Expiry date cannot be before manufacturing date."
      );

      return;
    }

    setRegisterLoading(true);

    try {
      const response = await fetch(
        `${API}/api/products/register`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(registerForm),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(
          data.message ||
            "Product registration failed"
        );

        return;
      }

      alert(
        `Product registered successfully!\n\nTransaction Hash:\n${
          data.transactionHash ||
          data.txHash ||
          "Available on blockchain"
        }`
      );

      setRegisterForm({
        productId: "",
        serialNumber: "",
        productName: "",
        manufacturer: "ABC Electronics",
        batchNumber: "",
        manufacturingDate: "",
        expiryDate: "",
        secret: "",
      });

      await loadProducts();

      setDashboardView("products");
    } catch (error) {
      console.error("Registration Error:", error);

      alert(
        "Unable to connect to registration server"
      );
    } finally {
      setRegisterLoading(false);
    }
  };

  // =========================================================
  // PRODUCT DETAILS
  // =========================================================

  const openProductDetails = async (product) => {
    try {
      const response = await fetch(
        `${API}/api/products/${encodeURIComponent(
          product.productId
        )}`
      );

      const data = await response.json();

      if (data.success && data.product) {
        setSelectedProduct(data.product);
      } else {
        setSelectedProduct(product);
      }
    } catch (error) {
      console.error(
        "Product details error:",
        error
      );

      setSelectedProduct(product);
    }

    setDashboardView("product-details");
  };

  // =========================================================
  // QR GENERATION
  // =========================================================

  const generateQR = async (product) => {
    try {
      const verificationURL =
        `${API}/verify/${encodeURIComponent(
          product.productId
        )}`;

      const image = await QRCode.toDataURL(
        verificationURL,
        {
          width: 500,
          margin: 3,
          errorCorrectionLevel: "H",
        }
      );

      setQrProduct({
        ...product,
        verificationURL,
      });

      setQrImage(image);

      setDashboardView("qr-preview");
    } catch (error) {
      console.error(
        "QR generation error:",
        error
      );

      alert("Unable to generate QR code");
    }
  };

  const downloadQR = () => {
    if (!qrImage || !qrProduct) return;

    const link =
      document.createElement("a");

    link.href = qrImage;

    link.download =
      `${qrProduct.productId}-TrustChain-QR.png`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
  };

  // =========================================================
  // DASHBOARD LOAD
  // =========================================================

  useEffect(() => {
    if (
      showManufacturerLogin ===
      "dashboard"
    ) {
      loadProducts();
    }
  }, [showManufacturerLogin]);

  // =========================================================
  // CUSTOMER PAGE
  // =========================================================

  if (!showManufacturerLogin) {
    return (
      <div style={styles.page}>

        <nav style={styles.navbar}>

          <div style={styles.logo}>
            TrustChain
          </div>

          <div style={styles.navLinks}>

            <span>Home</span>

            <span>How It Works</span>

            <span>About</span>

            <button
              onClick={() =>
                setShowManufacturerLogin(true)
              }
              style={styles.navButton}
            >
              Manufacturer
            </button>

          </div>

        </nav>

        <main style={styles.hero}>

          <div style={styles.badge}>
            🔐 Blockchain Powered Verification
          </div>

          <h1 style={styles.title}>
            Verify Before
            <br />
            <span style={styles.highlight}>
              You Trust
            </span>
          </h1>

          <p style={styles.description}>
            Verify product identity using a
            unique Product ID, secure
            authentication code and
            tamper-resistant blockchain records.
          </p>

          <div style={styles.card}>

            <h2>
              Verify Your Product
            </h2>

            <p style={styles.cardText}>
              Scan the product QR code or
              enter the Product ID manually.
            </p>

            <button
              style={styles.scanButton}
              onClick={openScanner}
            >
              📷 Scan QR Code
            </button>

            <div style={styles.divider}>
              OR
            </div>

            <input
              type="text"
              placeholder="Enter Product ID (e.g. PROD007)"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setVerificationResult(null);
              }}
              style={styles.input}
            />

            <button
              onClick={verifyProduct}
              style={
                styles.secondaryWideButton
              }
            >
              Open Verification Page →
            </button>

            <div style={styles.orSmall}>
              Enter authentication code below
            </div>

            <input
              type="text"
              placeholder="Authentication Code / Scratch Code"
              value={secret}
              onChange={(e) =>
                setSecret(e.target.value)
              }
              style={styles.input}
            />

            <button
              onClick={authenticateProduct}
              disabled={customerLoading}
              style={{
                ...styles.verifyButton,

                opacity:
                  customerLoading
                    ? 0.7
                    : 1,
              }}
            >
              {customerLoading
                ? "Verifying..."
                : "Authenticate Product →"}
            </button>

            {verificationResult && (
              <div
                style={{
                  ...styles.resultCard,

                  ...(verificationResult.verified
                    ? styles.resultSuccess
                    : styles.resultFailure),
                }}
              >

                <h2
                  style={{
                    color:
                      verificationResult.verified
                        ? "#2e7d32"
                        : "#c62828",
                  }}
                >
                  {verificationResult.verified
                    ? "✅ AUTHENTIC PRODUCT"
                    : "❌ PRODUCT NOT VERIFIED"}
                </h2>

                <p>
                  <b>Message:</b>{" "}
                  {verificationResult.message ||
                    (verificationResult.verified
                      ? "Authentication successful."
                      : "Authentication failed.")}
                </p>

                {verificationResult.productId && (
                  <>
                    <p>
                      <b>
                        Product ID:
                      </b>{" "}
                      {
                        verificationResult.productId
                      }
                    </p>

                    <p>
                      <b>
                        Product:
                      </b>{" "}
                      {
                        verificationResult.productName
                      }
                    </p>

                    <p>
                      <b>
                        Serial Number:
                      </b>{" "}
                      {
                        verificationResult.serialNumber
                      }
                    </p>

                    <p>
                      <b>
                        Manufacturer:
                      </b>{" "}
                      {
                        verificationResult.manufacturer
                      }
                    </p>

                    <p>
                      <b>
                        Batch:
                      </b>{" "}
                      {
                        verificationResult.batchNumber
                      }
                    </p>

                    <hr />

                    <p>
                      <b>
                        Blockchain:
                      </b>{" "}
                      {verificationResult
                        .blockchainVerified
                        ? "✅ VERIFIED"
                        : "❌ NOT VERIFIED"}
                    </p>

                    <p>
                      <b>
                        Authentication:
                      </b>{" "}
                      {verificationResult.secretValid
                        ? "✅ VALID"
                        : "❌ INVALID"}
                    </p>

                    <p>
                      <b>
                        Status:
                      </b>{" "}
                      {
                        verificationResult.status ||
                        "UNKNOWN"
                      }
                    </p>

                    <p>
                      <b>
                        Activated:
                      </b>{" "}
                      {verificationResult.activated
                        ? "YES"
                        : "NO"}
                    </p>
                  </>
                )}

              </div>
            )}

          </div>

          <div style={styles.features}>

            <div style={styles.featureItem}>
              <strong>
                ⛓ Blockchain
              </strong>

              <span>
                Tamper-resistant product records
              </span>
            </div>

            <div style={styles.featureItem}>
              <strong>
                🔑 Authentication
              </strong>

              <span>
                Secret-based verification
              </span>
            </div>

            <div style={styles.featureItem}>
              <strong>
                🛡️ Anti-Counterfeit
              </strong>

              <span>
                Detect suspicious products
              </span>
            </div>

          </div>

        </main>

        <footer style={styles.footer}>
          © 2026 TrustChain · Blockchain-Based
          Product Authentication
        </footer>

        {showQRScanner && (
          <div style={styles.overlay}>

            <div style={styles.scannerModal}>

              <div style={styles.scannerHeader}>

                <div>

                  <h2 style={{ margin: 0 }}>
                    Scan QR Code
                  </h2>

                  <p
                    style={{
                      color: "#667085",
                      marginBottom: 0,
                    }}
                  >
                    Point your camera at the
                    product QR code
                  </p>

                </div>

                <button
                  onClick={closeScanner}
                  style={styles.closeButton}
                >
                  ✕
                </button>

              </div>

              <div style={styles.scannerArea}>

                {!scannerError ? (
                  <>
                    <div
                      id="trustchain-qr-reader"
                      style={{
                        width: "100%",
                      }}
                    />

                    <p
                      style={
                        styles.scannerHint
                      }
                    >
                      📷 Position the QR code
                      inside the box
                    </p>
                  </>
                ) : (
                  <div
                    style={
                      styles.cameraError
                    }
                  >

                    <h2>
                      ⚠️ Camera Access
                    </h2>

                    <p>
                      {scannerError}
                    </p>

                    <button
                      onClick={() => {
                        setScannerError("");
                        startQRScanner();
                      }}
                      style={
                        styles.verifyButton
                      }
                    >
                      Try Again
                    </button>

                  </div>
                )}

              </div>

              <div
                style={
                  styles.scannerFooter
                }
              >

                <span>
                  🔐 Secure QR-based
                  product identification
                </span>

                <button
                  onClick={closeScanner}
                  style={
                    styles.cancelButton
                  }
                >
                  Cancel
                </button>

              </div>

            </div>

          </div>
        )}

      </div>
    );
  }

  // =========================================================
  // LOGIN PAGE
  // =========================================================

  if (
    showManufacturerLogin === true
  ) {
    return (
      <div style={styles.loginPage}>

        <div style={styles.loginCard}>

          <div style={styles.loginLogo}>
            TrustChain
          </div>

          <h1>
            Manufacturer Login
          </h1>

          <p
            style={{
              color: "#667085",
            }}
          >
            Login to manage
            blockchain-backed products.
          </p>

          <input
            type="email"
            placeholder="Manufacturer Email"
            value={manufacturerEmail}
            onChange={(e) =>
              setManufacturerEmail(
                e.target.value
              )
            }
            style={styles.input}
          />

          <input
            type="password"
            placeholder="Password"
            value={manufacturerPassword}
            onChange={(e) =>
              setManufacturerPassword(
                e.target.value
              )
            }
            style={styles.input}
          />

          <button
            onClick={manufacturerLogin}
            style={styles.verifyButton}
          >
            Login →
          </button>

          <button
            onClick={() =>
              setShowManufacturerLogin(false)
            }
            style={styles.backButton}
          >
            ← Back to Customer Verification
          </button>

        </div>

      </div>
    );
  }

  // =========================================================
  // MANUFACTURER DASHBOARD
  // =========================================================

  return (
    <div style={styles.dashboardPage}>

      <nav style={styles.dashboardNav}>

        <div style={styles.logo}>
          TrustChain
        </div>

        <div
          style={
            styles.dashboardNavRight
          }
        >

          <span
            style={
              styles.companyName
            }
          >
            ABC Electronics
          </span>

          <button
            onClick={() => {
              setShowManufacturerLogin(
                false
              );

              setDashboardView("home");

              setSelectedProduct(null);
            }}
            style={
              styles.logoutButton
            }
          >
            Logout
          </button>

        </div>

      </nav>

      <div
        style={
          styles.dashboardLayout
        }
      >

        <aside style={styles.sidebar}>

          <h3
            style={{
              marginTop: 0,
            }}
          >
            Manufacturer
          </h3>

          <button
            onClick={() =>
              setDashboardView("home")
            }
            style={
              dashboardView === "home"
                ? styles.activeSideButton
                : styles.sideButton
            }
          >
            🏠 Dashboard
          </button>

          <button
            onClick={() => {
              setDashboardView(
                "products"
              );

              loadProducts();
            }}
            style={
              dashboardView ===
                "products" ||
              dashboardView ===
                "product-details"
                ? styles.activeSideButton
                : styles.sideButton
            }
          >
            📦 Products
          </button>

          <button
            onClick={() =>
              setDashboardView(
                "register"
              )
            }
            style={
              dashboardView ===
              "register"
                ? styles.activeSideButton
                : styles.sideButton
            }
          >
            ➕ Register Product
          </button>

          <button
            onClick={() => {
              setDashboardView("qr");

              loadProducts();
            }}
            style={
              dashboardView === "qr" ||
              dashboardView ===
                "qr-preview"
                ? styles.activeSideButton
                : styles.sideButton
            }
          >
            🔳 QR Codes
          </button>

          <button
            onClick={() =>
              setDashboardView(
                "alerts"
              )
            }
            style={
              dashboardView ===
              "alerts"
                ? styles.activeSideButton
                : styles.sideButton
            }
          >
            🔔 Alerts
          </button>

        </aside>

        <main
          style={
            styles.dashboardMain
          }
        >

          {/* ================= HOME ================= */}

          {dashboardView === "home" && (
            <>
              <h1>
                Manufacturer Dashboard
              </h1>

              <p
                style={
                  styles.dashboardSubtitle
                }
              >
                Manage products,
                blockchain records and
                authentication QR codes.
              </p>

              <div
                style={
                  styles.statsGrid
                }
              >

                <div
                  style={
                    styles.statCard
                  }
                >
                  <span>
                    Total Products
                  </span>

                  <strong>
                    {productCounts.total}
                  </strong>
                </div>

                <div
                  style={
                    styles.statCard
                  }
                >
                  <span>
                    Active Products
                  </span>

                  <strong>
                    {productCounts.active}
                  </strong>
                </div>

                <div
                  style={
                    styles.statCard
                  }
                >
                  <span>
                    Registered / Pending
                  </span>

                  <strong>
                    {
                      productCounts.registered
                    }
                  </strong>
                </div>

                <div
                  style={
                    styles.statCard
                  }
                >
                  <span>
                    Blocked
                  </span>

                  <strong>
                    {productCounts.blocked}
                  </strong>
                </div>

              </div>

              <h2
                style={{
                  marginTop: 38,
                }}
              >
                Quick Actions
              </h2>

              <div
                style={
                  styles.actionGrid
                }
              >

                <button
                  onClick={() =>
                    setDashboardView(
                      "register"
                    )
                  }
                  style={
                    styles.actionCard
                  }
                >
                  <span
                    style={
                      styles.actionIcon
                    }
                  >
                    ➕
                  </span>

                  <strong>
                    Register Product
                  </strong>

                  <small>
                    Add a new product to
                    the blockchain.
                  </small>
                </button>

                <button
                  onClick={() => {
                    setDashboardView(
                      "products"
                    );

                    loadProducts();
                  }}
                  style={
                    styles.actionCard
                  }
                >
                  <span
                    style={
                      styles.actionIcon
                    }
                  >
                    📦
                  </span>

                  <strong>
                    Manage Products
                  </strong>

                  <small>
                    Search and inspect
                    registered products.
                  </small>
                </button>

                <button
                  onClick={() => {
                    setDashboardView(
                      "qr"
                    );

                    loadProducts();
                  }}
                  style={
                    styles.actionCard
                  }
                >
                  <span
                    style={
                      styles.actionIcon
                    }
                  >
                    🔳
                  </span>

                  <strong>
                    QR Codes
                  </strong>

                  <small>
                    Generate and download
                    verification QR codes.
                  </small>
                </button>

                <button
                  onClick={() =>
                    setDashboardView(
                      "alerts"
                    )
                  }
                  style={
                    styles.actionCard
                  }
                >
                  <span
                    style={
                      styles.actionIcon
                    }
                  >
                    🔔
                  </span>

                  <strong>
                    Security Alerts
                  </strong>

                  <small>
                    Review products
                    requiring attention.
                  </small>
                </button>

              </div>

              <h2
                style={{
                  marginTop: 40,
                }}
              >
                System Status
              </h2>

              <div
                style={
                  styles.activityCard
                }
              >

                <div
                  style={
                    styles.statusRow
                  }
                >
                  <span>
                    Blockchain integration
                  </span>

                  <strong
                    style={{
                      color: "#2e7d32",
                    }}
                  >
                    ● Connected
                  </strong>
                </div>

                <div
                  style={
                    styles.statusRow
                  }
                >
                  <span>
                    Product registration
                  </span>

                  <strong
                    style={{
                      color: "#2e7d32",
                    }}
                  >
                    ● Enabled
                  </strong>
                </div>

                <div
                  style={
                    styles.statusRow
                  }
                >
                  <span>
                    QR verification
                  </span>

                  <strong
                    style={{
                      color: "#2e7d32",
                    }}
                  >
                    ● Enabled
                  </strong>
                </div>

                <div
                  style={
                    styles.statusRow
                  }
                >
                  <span>
                    Secret authentication
                  </span>

                  <strong
                    style={{
                      color: "#2e7d32",
                    }}
                  >
                    ● Enabled
                  </strong>
                </div>

              </div>
            </>
          )}

          {/* ================= PRODUCTS ================= */}

          {dashboardView === "products" && (
            <>
              <div
                style={
                  styles.pageHeader
                }
              >

                <div>

                  <h1
                    style={{
                      marginBottom: 5,
                    }}
                  >
                    Products
                  </h1>

                  <p
                    style={{
                      margin: 0,
                      color: "#667085",
                    }}
                  >
                    Search and manage
                    all registered
                    products.
                  </p>

                </div>

                <button
                  onClick={() =>
                    setDashboardView(
                      "register"
                    )
                  }
                  style={
                    styles.primarySmallButton
                  }
                >
                  + Register Product
                </button>

              </div>

              <div
                style={
                  styles.filterBar
                }
              >

                <input
                  value={
                    dashboardSearch
                  }
                  onChange={(e) =>
                    setDashboardSearch(
                      e.target.value
                    )
                  }
                  placeholder="Search Product ID, serial, name, batch..."
                  style={
                    styles.searchInput
                  }
                />

                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value
                    )
                  }
                  style={
                    styles.selectInput
                  }
                >
                  <option value="ALL">
                    All Status
                  </option>

                  <option value="REGISTERED">
                    Registered
                  </option>

                  <option value="ACTIVE">
                    Active
                  </option>

                  <option value="SOLD">
                    Sold
                  </option>

                  <option value="SUSPENDED">
                    Suspended
                  </option>

                  <option value="RECALLED">
                    Recalled
                  </option>

                  <option value="BLOCKED">
                    Blocked
                  </option>
                </select>

                <button
                  onClick={
                    loadProducts
                  }
                  style={
                    styles.secondaryButton
                  }
                >
                  ↻ Refresh
                </button>

              </div>

              {productsLoading ? (
                <div
                  style={
                    styles.emptyCard
                  }
                >
                  Loading products...
                </div>
              ) : filteredProducts.length ===
                0 ? (
                <div
                  style={
                    styles.emptyCard
                  }
                >

                  <div
                    style={{
                      fontSize: 45,
                    }}
                  >
                    📦
                  </div>

                  <h2>
                    No Products Found
                  </h2>

                  <p
                    style={{
                      color: "#667085",
                    }}
                  >
                    {products.length ===
                    0
                      ? "Register your first product to get started."
                      : "Try changing the search or status filter."}
                  </p>

                </div>
              ) : (
                <div
                  style={
                    styles.productGrid
                  }
                >

                  {filteredProducts.map(
                    (product) => {
                      const status =
                        statusLabel(
                          product.status ||
                            "REGISTERED"
                        );

                      return (
                        <div
                          key={
                            product.productId
                          }
                          style={
                            styles.productCard
                          }
                        >

                          <div
                            style={
                              styles.productCardTop
                            }
                          >

                            <div>

                              <span
                                style={
                                  styles.productIdBadge
                                }
                              >
                                {
                                  product.productId
                                }
                              </span>

                              <h2
                                style={{
                                  margin:
                                    "12px 0 4px",
                                }}
                              >
                                {product.productName ||
                                  "Unnamed Product"}
                              </h2>

                            </div>

                            <span
                              style={{
                                ...styles.statusBadge,
                                ...statusStyle(
                                  status
                                ),
                              }}
                            >
                              {status}
                            </span>

                          </div>

                          <div
                            style={
                              styles.productInfoList
                            }
                          >

                            <p>
                              <b>
                                Serial:
                              </b>{" "}
                              {product.serialNumber ||
                                "—"}
                            </p>

                            <p>
                              <b>
                                Batch:
                              </b>{" "}
                              {product.batchNumber ||
                                "—"}
                            </p>

                            <p>
                              <b>
                                Manufacturer:
                              </b>{" "}
                              {product.manufacturer ||
                                "—"}
                            </p>

                            <p>
                              <b>
                                Registered:
                              </b>{" "}
                              {formatDate(
                                product.createdAt
                              )}
                            </p>

                          </div>

                          <div
                            style={
                              styles.productActions
                            }
                          >

                            <button
                              onClick={() =>
                                openProductDetails(
                                  product
                                )
                              }
                              style={
                                styles.secondaryButton
                              }
                            >
                              View Details
                            </button>

                            <button
                              onClick={() =>
                                generateQR(
                                  product
                                )
                              }
                              style={
                                styles.primarySmallButton
                              }
                            >
                              🔳 QR
                            </button>

                          </div>

                        </div>
                      );
                    }
                  )}

                </div>
              )}
            </>
          )}

          {/* ================= REGISTER ================= */}

          {dashboardView === "register" && (
            <div
              style={
                styles.formContainer
              }
            >

              <div
                style={
                  styles.pageHeader
                }
              >

                <div>

                  <h1
                    style={{
                      marginBottom: 5,
                    }}
                  >
                    Register New Product
                  </h1>

                  <p
                    style={{
                      margin: 0,
                      color: "#667085",
                    }}
                  >
                    Create a
                    blockchain-backed
                    product identity.
                  </p>

                </div>

                <button
                  onClick={() =>
                    setDashboardView(
                      "home"
                    )
                  }
                  style={
                    styles.secondaryButton
                  }
                >
                  ← Back
                </button>

              </div>

              <div
                style={
                  styles.formCard
                }
              >

                <div
                  style={
                    styles.formNotice
                  }
                >
                  🔐 The authentication
                  secret is hashed by the
                  backend before blockchain
                  storage. Keep the physical
                  scratch code private.
                </div>

                <div
                  style={
                    styles.formGrid
                  }
                >

                  {[
                    [
                      "productId",
                      "Product ID",
                      "PROD007",
                    ],

                    [
                      "serialNumber",
                      "Serial Number",
                      "SW2026X007",
                    ],

                    [
                      "productName",
                      "Product Name",
                      "Smart Watch Pro Max",
                    ],

                    [
                      "manufacturer",
                      "Manufacturer",
                      "ABC Electronics",
                    ],

                    [
                      "batchNumber",
                      "Batch Number",
                      "B2026-007",
                    ],
                  ].map(
                    ([
                      key,
                      label,
                      placeholder,
                    ]) => (
                      <div key={key}>

                        <label
                          style={
                            styles.label
                          }
                        >
                          {label}
                        </label>

                        <input
                          value={
                            registerForm[
                              key
                            ]
                          }
                          onChange={(e) =>
                            setRegisterForm(
                              {
                                ...registerForm,
                                [key]:
                                  e.target
                                    .value,
                              }
                            )
                          }
                          placeholder={
                            placeholder
                          }
                          style={
                            styles.formInput
                          }
                        />

                      </div>
                    )
                  )}

                  <div>

                    <label
                      style={
                        styles.label
                      }
                    >
                      Authentication
                      Secret
                    </label>

                    <input
                      type="text"
                      value={
                        registerForm.secret
                      }
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          secret:
                            e.target.value,
                        })
                      }
                      placeholder="9Q7M-35KP-X2"
                      style={
                        styles.formInput
                      }
                    />

                  </div>

                  <div>

                    <label
                      style={
                        styles.label
                      }
                    >
                      Manufacturing Date
                    </label>

                    <input
                      type="date"
                      value={
                        registerForm.manufacturingDate
                      }
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          manufacturingDate:
                            e.target.value,
                        })
                      }
                      style={
                        styles.formInput
                      }
                    />

                  </div>

                  <div>

                    <label
                      style={
                        styles.label
                      }
                    >
                      Expiry Date
                    </label>

                    <input
                      type="date"
                      value={
                        registerForm.expiryDate
                      }
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          expiryDate:
                            e.target.value,
                        })
                      }
                      style={
                        styles.formInput
                      }
                    />

                  </div>

                </div>

                <button
                  onClick={
                    registerProduct
                  }
                  disabled={
                    registerLoading
                  }
                  style={{
                    ...styles.registerButton,

                    opacity:
                      registerLoading
                        ? 0.7
                        : 1,
                  }}
                >
                  {registerLoading
                    ? "Registering on Blockchain..."
                    : "Register Product on Blockchain →"}
                </button>

              </div>

            </div>
          )}

          {/* ================= QR CODES ================= */}

          {dashboardView === "qr" && (
            <>
              <div
                style={
                  styles.pageHeader
                }
              >

                <div>

                  <h1
                    style={{
                      marginBottom: 5,
                    }}
                  >
                    QR Codes
                  </h1>

                  <p
                    style={{
                      margin: 0,
                      color: "#667085",
                    }}
                  >
                    Generate QR codes for
                    registered products.
                  </p>

                </div>

              </div>

              {products.length === 0 ? (
                <div
                  style={
                    styles.emptyCard
                  }
                >

                  <div
                    style={{
                      fontSize: 45,
                    }}
                  >
                    🔳
                  </div>

                  <h2>
                    No Products Available
                  </h2>

                  <p
                    style={{
                      color: "#667085",
                    }}
                  >
                    Register a product
                    first.
                  </p>

                  <button
                    onClick={() =>
                      setDashboardView(
                        "register"
                      )
                    }
                    style={
                      styles.primarySmallButton
                    }
                  >
                    Register Product
                  </button>

                </div>
              ) : (
                <div
                  style={
                    styles.productGrid
                  }
                >

                  {products.map(
                    (product) => (
                      <div
                        key={
                          product.productId
                        }
                        style={
                          styles.productCard
                        }
                      >

                        <span
                          style={
                            styles.productIdBadge
                          }
                        >
                          {
                            product.productId
                          }
                        </span>

                        <h2>
                          {
                            product.productName
                          }
                        </h2>

                        <p>
                          <b>
                            Serial:
                          </b>{" "}
                          {
                            product.serialNumber
                          }
                        </p>

                        <button
                          onClick={() =>
                            generateQR(
                              product
                            )
                          }
                          style={
                            styles.primarySmallButton
                          }
                        >
                          Generate QR Code
                        </button>

                      </div>
                    )
                  )}

                </div>
              )}
            </>
          )}

          {/* ================= QR PREVIEW ================= */}

          {dashboardView ===
            "qr-preview" &&
            qrProduct && (
              <div
                style={
                  styles.qrPreviewContainer
                }
              >

                <button
                  onClick={() =>
                    setDashboardView(
                      "qr"
                    )
                  }
                  style={
                    styles.secondaryButton
                  }
                >
                  ← Back to QR Codes
                </button>

                <div
                  style={
                    styles.qrCard
                  }
                >

                  <div
                    style={
                      styles.qrHeaderBadge
                    }
                  >
                    TrustChain Product QR
                  </div>

                  <h1>
                    QR Code
                  </h1>

                  <p
                    style={{
                      color: "#667085",
                    }}
                  >
                    {
                      qrProduct.productName
                    }
                  </p>

                  <img
                    src={qrImage}
                    alt="Product QR Code"
                    style={
                      styles.qrImage
                    }
                  />

                  <h2>
                    {
                      qrProduct.productId
                    }
                  </h2>

                  <p>
                    <b>
                      Serial Number:
                    </b>{" "}
                    {
                      qrProduct.serialNumber
                    }
                  </p>

                  <p
                    style={
                      styles.urlText
                    }
                  >
                    {
                      qrProduct.verificationURL
                    }
                  </p>

                  <button
                    onClick={
                      downloadQR
                    }
                    style={
                      styles.registerButton
                    }
                  >
                    ⬇ Download QR Code
                  </button>

                </div>

              </div>
            )}

          {/* ================= PRODUCT DETAILS ================= */}

          {dashboardView ===
            "product-details" &&
            selectedProduct && (
              <div>

                <button
                  onClick={() => {
                    setDashboardView(
                      "products"
                    );

                    loadProducts();
                  }}
                  style={
                    styles.secondaryButton
                  }
                >
                  ← Back to Products
                </button>

                <div
                  style={
                    styles.detailsTitleRow
                  }
                >

                  <div>

                    <span
                      style={
                        styles.productIdBadge
                      }
                    >
                      {
                        selectedProduct.productId
                      }
                    </span>

                    <h1>
                      {
                        selectedProduct.productName
                      }
                    </h1>

                    <p
                      style={{
                        color: "#667085",
                      }}
                    >
                      Blockchain-backed
                      product identity
                    </p>

                  </div>

                  <span
                    style={{
                      ...styles.statusBadgeLarge,
                      ...statusStyle(
                        selectedProduct.status
                      ),
                    }}
                  >
                    {statusLabel(
                      selectedProduct.status
                    )}
                  </span>

                </div>

                <div
                  style={
                    styles.detailsCard
                  }
                >

                  <h3>
                    Product Information
                  </h3>

                  <div
                    style={
                      styles.detailsGrid
                    }
                  >

                    <Detail
                      label="Product ID"
                      value={
                        selectedProduct.productId
                      }
                    />

                    <Detail
                      label="Serial Number"
                      value={
                        selectedProduct.serialNumber
                      }
                    />

                    <Detail
                      label="Manufacturer"
                      value={
                        selectedProduct.manufacturer
                      }
                    />

                    <Detail
                      label="Batch Number"
                      value={
                        selectedProduct.batchNumber
                      }
                    />

                    <Detail
                      label="Manufacturing Date"
                      value={formatDate(
                        selectedProduct.manufacturingDate
                      )}
                    />

                    <Detail
                      label="Expiry Date"
                      value={formatDate(
                        selectedProduct.expiryDate
                      )}
                    />

                    <Detail
                      label="Product Status"
                      value={statusLabel(
                        selectedProduct.status
                      )}
                    />

                    <Detail
                      label="Activated"
                      value={
                        selectedProduct.activated
                          ? "YES"
                          : "NO"
                      }
                    />

                  </div>

                  <hr
                    style={
                      styles.hr
                    }
                  />

                  <h3>
                    Blockchain Record
                  </h3>

                  <HashField
                    label="Transaction Hash"
                    value={
                      selectedProduct.transactionHash ||
                      selectedProduct.blockchainTxHash
                    }
                  />

                  <HashField
                    label="Metadata Hash"
                    value={
                      selectedProduct.metadataHash
                    }
                  />

                  <div
                    style={
                      styles.detailsActions
                    }
                  >

                    <button
                      onClick={() =>
                        generateQR(
                          selectedProduct
                        )
                      }
                      style={
                        styles.primarySmallButton
                      }
                    >
                      🔳 Generate QR
                    </button>

                    <button
                      onClick={() => {
                        setProductId(
                          selectedProduct.productId
                        );

                        setShowManufacturerLogin(
                          false
                        );
                      }}
                      style={
                        styles.secondaryButton
                      }
                    >
                      Customer Verification
                    </button>

                  </div>

                </div>

              </div>
            )}

          {/* ================= ALERTS ================= */}

          {dashboardView ===
            "alerts" && (
              <>
                <div
                  style={
                    styles.pageHeader
                  }
                >

                  <div>

                    <h1
                      style={{
                        marginBottom: 5,
                      }}
                    >
                      Security Alerts
                    </h1>

                    <p
                      style={{
                        margin: 0,
                        color: "#667085",
                      }}
                    >
                      Products that require
                      manufacturer attention.
                    </p>

                  </div>

                </div>

                <div
                  style={
                    styles.alertInfo
                  }
                >
                  <strong>
                    Important:
                  </strong>{" "}
                  Repeated scans alone are
                  not proof of counterfeit.
                  TrustChain uses
                  authentication,
                  blockchain status and
                  risk signals as
                  supporting evidence.
                </div>

                {products.filter(
                  (p) =>
                    [
                      "BLOCKED",
                      "RECALLED",
                      "SUSPENDED",
                    ].includes(
                      statusLabel(
                        p.status
                      )
                    )
                ).length === 0 ? (
                  <div
                    style={
                      styles.emptyCard
                    }
                  >

                    <div
                      style={{
                        fontSize: 45,
                      }}
                    >
                      🛡️
                    </div>

                    <h2>
                      No Critical
                      Product Alerts
                    </h2>

                    <p
                      style={{
                        color: "#667085",
                      }}
                    >
                      No blocked,
                      recalled or
                      suspended products
                      were returned by
                      the current product
                      list.
                    </p>

                  </div>
                ) : (
                  <div
                    style={
                      styles.productGrid
                    }
                  >

                    {products
                      .filter(
                        (p) =>
                          [
                            "BLOCKED",
                            "RECALLED",
                            "SUSPENDED",
                          ].includes(
                            statusLabel(
                              p.status
                            )
                          )
                      )
                      .map(
                        (product) => (
                          <div
                            key={
                              product.productId
                            }
                            style={
                              styles.alertCard
                            }
                          >

                            <span
                              style={
                                styles.alertIcon
                              }
                            >
                              ⚠️
                            </span>

                            <h2>
                              {
                                product.productId
                              }
                            </h2>

                            <p>
                              {
                                product.productName
                              }
                            </p>

                            <strong>
                              Status:{" "}
                              {statusLabel(
                                product.status
                              )}
                            </strong>

                            <button
                              onClick={() =>
                                openProductDetails(
                                  product
                                )
                              }
                              style={
                                styles.secondaryButton
                              }
                            >
                              View Product
                            </button>

                          </div>
                        )
                      )}

                  </div>
                )}

              </>
            )}

        </main>

      </div>

    </div>
  );
}

// =========================================================
// REUSABLE COMPONENTS
// =========================================================

function Detail({ label, value }) {
  return (
    <div style={styles.detailItem}>
      <span
        style={{
          color: "#667085",
        }}
      >
        {label}
      </span>

      <strong>
        {value || "Not available"}
      </strong>
    </div>
  );
}

function HashField({ label, value }) {
  return (
    <div
      style={{
        marginBottom: 20,
      }}
    >
      <span
        style={
          styles.hashLabel
        }
      >
        {label}
      </span>

      <div
        style={
          styles.hashBox
        }
      >
        {value || "Not available"}
      </div>
    </div>
  );
}

// =========================================================
// STYLES
// =========================================================

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fb",
    color: "#172033",
    fontFamily: "Arial, sans-serif",
  },

  navbar: {
    minHeight: "70px",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 7%",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.05)",
    boxSizing: "border-box",
  },

  logo: {
    fontSize: "24px",
    fontWeight: "700",
    color: "#172033",
  },

  navLinks: {
    display: "flex",
    gap: "28px",
    alignItems: "center",
    color: "#596579",
  },

  navButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
    color: "#315dcc",
  },

  hero: {
    textAlign: "center",
    padding: "65px 20px 35px",
  },

  badge: {
    display: "inline-block",
    background: "#e8f0ff",
    color: "#315dcc",
    padding: "8px 16px",
    borderRadius: "20px",
    fontSize: "14px",
    marginBottom: "18px",
  },

  title: {
    fontSize: "52px",
    lineHeight: "1.1",
    margin: "10px 0 20px",
  },

  highlight: {
    color: "#315dcc",
  },

  description: {
    maxWidth: "680px",
    margin: "0 auto 32px",
    color: "#667085",
    fontSize: "18px",
    lineHeight: "1.6",
  },

  card: {
    background: "#ffffff",
    maxWidth: "520px",
    margin: "0 auto",
    padding: "35px",
    borderRadius: "18px",
    boxShadow:
      "0 10px 35px rgba(0,0,0,0.08)",
    boxSizing: "border-box",
  },

  cardText: {
    color: "#667085",
    marginBottom: "25px",
  },

  scanButton: {
    width: "100%",
    padding: "14px",
    border: "none",
    borderRadius: "9px",
    background: "#172033",
    color: "#ffffff",
    fontSize: "16px",
    cursor: "pointer",
    fontWeight: "600",
  },

  divider: {
    margin: "22px 0",
    color: "#98a2b3",
    fontSize: "13px",
    fontWeight: "600",
  },

  orSmall: {
    margin: "16px 0 10px",
    color: "#667085",
    fontSize: "13px",
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px",
    border:
      "1px solid #d0d5dd",
    borderRadius: "9px",
    fontSize: "15px",
    marginBottom: "12px",
    outline: "none",
  },

  verifyButton: {
    width: "100%",
    padding: "14px",
    border: "none",
    borderRadius: "9px",
    background: "#315dcc",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },

  secondaryWideButton: {
    width: "100%",
    padding: "13px",
    border:
      "1px solid #d0d5dd",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#344054",
    fontSize: "15px",
    cursor: "pointer",
    fontWeight: "600",
  },

  resultCard: {
    marginTop: "25px",
    padding: "24px",
    borderRadius: "14px",
    textAlign: "left",
  },

  resultSuccess: {
    background: "#e8f5e9",
    border:
      "2px solid #4caf50",
  },

  resultFailure: {
    background: "#ffebee",
    border:
      "2px solid #f44336",
  },

  features: {
    display: "flex",
    justifyContent: "center",
    gap: "55px",
    marginTop: "45px",
    flexWrap: "wrap",
  },

  featureItem: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
  },

  footer: {
    textAlign: "center",
    padding: "30px",
    color: "#667085",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background:
      "rgba(15,23,42,0.78)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    padding: "20px",
    boxSizing: "border-box",
  },

  scannerModal: {
    width: "100%",
    maxWidth: "540px",
    background: "#ffffff",
    borderRadius: "20px",
    overflow: "hidden",
  },

  scannerHeader: {
    padding: "22px 25px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  closeButton: {
    border: "none",
    background: "#f2f4f7",
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    cursor: "pointer",
    fontSize: "18px",
  },

  scannerArea: {
    background: "#101828",
    padding: "25px",
  },

  scannerHint: {
    color: "#ffffff",
    textAlign: "center",
  },

  cameraError: {
    background: "#ffffff",
    padding: "30px",
    borderRadius: "15px",
    textAlign: "center",
  },

  scannerFooter: {
    padding: "18px 25px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#667085",
    fontSize: "13px",
  },

  cancelButton: {
    padding: "10px 20px",
    border:
      "1px solid #d0d5dd",
    borderRadius: "8px",
    background: "#ffffff",
    cursor: "pointer",
  },

  loginPage: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#f5f7fb",
    padding: "20px",
    boxSizing: "border-box",
  },

  loginCard: {
    width: "100%",
    maxWidth: "420px",
    background: "#ffffff",
    padding: "40px",
    borderRadius: "20px",
    boxShadow:
      "0 10px 30px rgba(0,0,0,0.08)",
    boxSizing: "border-box",
  },

  loginLogo: {
    fontSize: "25px",
    fontWeight: "700",
    color: "#315dcc",
    marginBottom: "25px",
  },

  backButton: {
    marginTop: "15px",
    width: "100%",
    padding: "12px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "#667085",
    fontSize: "15px",
  },

  dashboardPage: {
    minHeight: "100vh",
    background: "#f5f7fb",
    color: "#172033",
    fontFamily: "Arial, sans-serif",
  },

  dashboardNav: {
    minHeight: "70px",
    background: "#ffffff",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 4%",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.05)",
    boxSizing: "border-box",
  },

  dashboardNavRight: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
  },

  companyName: {
    color: "#667085",
    fontWeight: "600",
  },

  logoutButton: {
    border:
      "1px solid #d0d5dd",
    background: "#ffffff",
    padding: "9px 16px",
    borderRadius: "8px",
    cursor: "pointer",
  },

  dashboardLayout: {
    display: "flex",
    minHeight:
      "calc(100vh - 70px)",
  },

  sidebar: {
    width: "240px",
    flexShrink: 0,
    background: "#ffffff",
    padding: "25px 15px",
    boxSizing: "border-box",
    borderRight:
      "1px solid #eaecf0",
  },

  sideButton: {
    width: "100%",
    textAlign: "left",
    padding: "13px 15px",
    border: "none",
    background: "transparent",
    borderRadius: "8px",
    cursor: "pointer",
    color: "#596579",
    fontSize: "14px",
    marginBottom: "5px",
  },

  activeSideButton: {
    width: "100%",
    textAlign: "left",
    padding: "13px 15px",
    border: "none",
    background: "#e8f0ff",
    borderRadius: "8px",
    cursor: "pointer",
    color: "#315dcc",
    fontSize: "14px",
    fontWeight: "600",
    marginBottom: "5px",
  },

  dashboardMain: {
    flex: 1,
    padding: "40px",
    overflow: "auto",
    boxSizing: "border-box",
  },

  dashboardSubtitle: {
    color: "#667085",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "18px",
    marginTop: "30px",
  },

  statCard: {
    background: "#ffffff",
    padding: "23px",
    borderRadius: "14px",
    boxShadow:
      "0 4px 15px rgba(0,0,0,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  actionGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "18px",
  },

  actionCard: {
    background: "#ffffff",
    border:
      "1px solid #eaecf0",
    borderRadius: "14px",
    padding: "23px",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  actionIcon: {
    fontSize: "25px",
  },

  activityCard: {
    background: "#ffffff",
    padding: "22px",
    borderRadius: "14px",
  },

  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "14px 0",
    borderBottom:
      "1px solid #eaecf0",
  },

  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "25px",
    gap: "20px",
  },

  primarySmallButton: {
    background: "#315dcc",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    padding: "11px 18px",
    cursor: "pointer",
    fontWeight: "600",
  },

  secondaryButton: {
    background: "#ffffff",
    color: "#344054",
    border:
      "1px solid #d0d5dd",
    borderRadius: "8px",
    padding: "11px 18px",
    cursor: "pointer",
    fontWeight: "500",
  },

  filterBar: {
    background: "#ffffff",
    padding: "15px",
    borderRadius: "12px",
    display: "flex",
    gap: "12px",
    marginBottom: "25px",
    flexWrap: "wrap",
    boxShadow:
      "0 3px 12px rgba(0,0,0,0.04)",
  },

  searchInput: {
    flex: "1 1 300px",
    minWidth: "250px",
    padding: "12px 14px",
    border:
      "1px solid #d0d5dd",
    borderRadius: "8px",
    fontSize: "14px",
  },

  selectInput: {
    padding: "12px 14px",
    border:
      "1px solid #d0d5dd",
    borderRadius: "8px",
    background: "#ffffff",
    minWidth: "150px",
  },

  productGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fill,minmax(300px,1fr))",
    gap: "20px",
  },

  productCard: {
    background: "#ffffff",
    padding: "22px",
    borderRadius: "14px",
    boxShadow:
      "0 4px 15px rgba(0,0,0,0.05)",
  },

  productCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "10px",
  },

  productIdBadge: {
    display: "inline-block",
    background: "#e8f0ff",
    color: "#315dcc",
    padding: "5px 9px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
  },

  statusBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: "700",
  },

  statusBadgeLarge: {
    display: "inline-block",
    padding: "10px 15px",
    borderRadius: "25px",
    fontSize: "13px",
    fontWeight: "700",
  },

  productInfoList: {
    color: "#475467",
    lineHeight: "1.4",
  },

  productActions: {
    display: "flex",
    gap: "10px",
    marginTop: "20px",
  },

  emptyCard: {
    background: "#ffffff",
    padding: "55px",
    borderRadius: "14px",
    textAlign: "center",
  },

  formContainer: {
    maxWidth: "950px",
  },

  formCard: {
    background: "#ffffff",
    padding: "30px",
    borderRadius: "15px",
    boxShadow:
      "0 4px 15px rgba(0,0,0,0.04)",
  },

  formNotice: {
    background: "#eef4ff",
    color: "#315dcc",
    padding: "13px 15px",
    borderRadius: "9px",
    marginBottom: "25px",
    fontSize: "14px",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0,1fr))",
    gap: "20px",
  },

  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    color: "#344054",
    marginBottom: "7px",
  },

  formInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "13px",
    border:
      "1px solid #d0d5dd",
    borderRadius: "8px",
    fontSize: "14px",
  },

  registerButton: {
    width: "100%",
    marginTop: "25px",
    padding: "14px",
    background: "#315dcc",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
  },

  qrPreviewContainer: {
    maxWidth: "620px",
    margin: "0 auto",
  },

  qrCard: {
    marginTop: "25px",
    background: "#ffffff",
    padding: "35px",
    borderRadius: "16px",
    textAlign: "center",
    boxShadow:
      "0 4px 15px rgba(0,0,0,0.05)",
  },

  qrHeaderBadge: {
    display: "inline-block",
    background: "#e8f0ff",
    color: "#315dcc",
    padding: "7px 12px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "700",
  },

  qrImage: {
    width: "360px",
    maxWidth: "100%",
    height: "auto",
    margin: "20px auto",
    display: "block",
  },

  urlText: {
    wordBreak: "break-all",
    color: "#667085",
    background: "#f8fafc",
    padding: "12px",
    borderRadius: "8px",
    fontSize: "12px",
    textAlign: "left",
  },

  detailsTitleRow: {
    marginTop: "30px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
  },

  detailsCard: {
    background: "#ffffff",
    padding: "30px",
    borderRadius: "15px",
    marginTop: "20px",
    boxShadow:
      "0 4px 15px rgba(0,0,0,0.05)",
  },

  detailsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0,1fr))",
    gap: "22px",
    marginTop: "25px",
  },

  detailItem: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
  },

  hr: {
    border: "none",
    borderTop:
      "1px solid #eaecf0",
    margin: "30px 0",
  },

  hashLabel: {
    display: "block",
    color: "#667085",
    fontSize: "13px",
    marginBottom: "7px",
  },

  hashBox: {
    background: "#f8fafc",
    border:
      "1px solid #eaecf0",
    padding: "12px",
    borderRadius: "8px",
    wordBreak: "break-all",
    fontFamily: "monospace",
    fontSize: "12px",
  },

  detailsActions: {
    display: "flex",
    gap: "12px",
    marginTop: "25px",
    flexWrap: "wrap",
  },

  alertInfo: {
    background: "#fff8eb",
    border:
      "1px solid #fedf89",
    color: "#7a4b00",
    padding: "15px",
    borderRadius: "10px",
    marginBottom: "25px",
  },

  alertCard: {
    background: "#ffffff",
    padding: "25px",
    borderRadius: "14px",
    borderLeft:
      "5px solid #f79009",
    boxShadow:
      "0 4px 15px rgba(0,0,0,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  alertIcon: {
    fontSize: "28px",
  },
};

export default App;