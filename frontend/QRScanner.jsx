import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function QRScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let scanner;
    let stopped = false;

    const startScanner = async () => {
      try {
        scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: {
              width: 250,
              height: 250,
            },
          },
          async (decodedText) => {
            if (stopped) return;

            stopped = true;

            try {
              await scanner.stop();
            } catch (e) {
              console.log(e);
            }

            onScan(decodedText);
          },
          () => {
            // Normal scan errors are ignored
          }
        );
      } catch (err) {
        console.error("Camera error:", err);

        setError(
          "Unable to access camera. Please allow camera permission and try again."
        );
      }
    };

    startScanner();

    return () => {
      stopped = true;

      if (scanner) {
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            scanner.clear().catch(() => {});
          });
      }
    };
  }, [onScan]);

  const closeScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (e) {}

      try {
        scannerRef.current.clear();
      } catch (e) {}
    }

    onClose();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Scan QR Code</h2>

            <p style={styles.subtitle}>
              Point your camera at the product QR code
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

          {!error ? (
            <>
              <div id="qr-reader" style={styles.reader}></div>

              <p style={styles.hint}>
                📷 Position the QR code inside the scanning box
              </p>
            </>
          ) : (
            <div style={styles.errorBox}>

              <div style={styles.errorIcon}>
                ⚠️
              </div>

              <h3>Camera Access Required</h3>

              <p>{error}</p>

              <button
                onClick={() => window.location.reload()}
                style={styles.retryButton}
              >
                Try Again
              </button>

            </div>
          )}

        </div>

        <div style={styles.footer}>

          <span style={styles.security}>
            🔐 Secure QR-based product identification
          </span>

          <button
            onClick={closeScanner}
            style={styles.cancelButton}
          >
            Cancel
          </button>

        </div>

      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.75)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    padding: "20px",
  },

  modal: {
    width: "100%",
    maxWidth: "520px",
    background: "#ffffff",
    borderRadius: "20px",
    overflow: "hidden",
    boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "22px 25px",
    borderBottom: "1px solid #eaecf0",
  },

  title: {
    margin: 0,
    fontSize: "24px",
    color: "#172033",
  },

  subtitle: {
    margin: "6px 0 0",
    color: "#667085",
    fontSize: "14px",
  },

  closeButton: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    border: "none",
    background: "#f2f4f7",
    color: "#344054",
    fontSize: "18px",
    cursor: "pointer",
  },

  scannerArea: {
    background: "#101828",
    padding: "25px",
  },

  reader: {
    width: "100%",
    minHeight: "350px",
    borderRadius: "14px",
    overflow: "hidden",
  },

  hint: {
    textAlign: "center",
    color: "#ffffff",
    margin: "15px 0 0",
    fontSize: "14px",
  },

  errorBox: {
    minHeight: "350px",
    background: "#ffffff",
    borderRadius: "14px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    padding: "25px",
    boxSizing: "border-box",
  },

  errorIcon: {
    fontSize: "42px",
  },

  retryButton: {
    marginTop: "15px",
    padding: "11px 22px",
    border: "none",
    borderRadius: "8px",
    background: "#315dcc",
    color: "#ffffff",
    fontWeight: "600",
    cursor: "pointer",
  },

  footer: {
    padding: "18px 25px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "15px",
  },

  security: {
    color: "#667085",
    fontSize: "13px",
  },

  cancelButton: {
    padding: "10px 20px",
    border: "1px solid #d0d5dd",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#344054",
    fontWeight: "600",
    cursor: "pointer",
  },
};