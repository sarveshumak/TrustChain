import QRCode from "qrcode";

const productId = "PROD001";

const verificationData =
    `http://10.230.219.137:3000/verify/${productId}`;

QRCode.toFile(
    "PROD001-QR.png",
    verificationData,
    {
        width: 500,
        margin: 2
    },
    function (error) {
        if (error) throw error;

        console.log("QR Code generated successfully!");
        console.log("Product ID:", productId);
        console.log("Verification Data:", verificationData);
        console.log("QR File: PROD001-QR.png");
    }
);