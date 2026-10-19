// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProductVerification {

    enum ProductStatus {
        REGISTERED,
        ACTIVE,
        SOLD,
        SUSPENDED,
        RECALLED,
        BLOCKED
    }

    struct Product {
        string productId;
        string serialNumber;
        string productName;
        string manufacturer;
        string batchNumber;
        string manufacturingDate;
        string expiryDate;
        string metadataHash;
        bytes32 secretHash;

        ProductStatus status;

        bool activated;
        address currentOwner;
        uint256 createdAt;
        bool exists;
    }

    mapping(string => Product) private products;

    mapping(address => bool) public authorizedManufacturers;

    address public admin;

    event ManufacturerAuthorized(
        address indexed manufacturer
    );

    event ProductRegistered(
        string indexed productId,
        string serialNumber,
        string manufacturer,
        address indexed manufacturerWallet
    );

    event ProductActivated(
        string indexed productId,
        address indexed owner
    );

    event OwnershipTransferred(
        string indexed productId,
        address indexed from,
        address indexed to
    );

    event ProductStatusUpdated(
        string indexed productId,
        ProductStatus status
    );

    modifier onlyAdmin() {
        require(
            msg.sender == admin,
            "Only admin can perform this action"
        );
        _;
    }

    modifier onlyManufacturer() {
        require(
            authorizedManufacturers[msg.sender],
            "Unauthorized manufacturer"
        );
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function authorizeManufacturer(
        address _manufacturer
    ) public onlyAdmin {

        authorizedManufacturers[_manufacturer] = true;

        emit ManufacturerAuthorized(_manufacturer);
    }

    function registerProduct(
        string memory _productId,
        string memory _serialNumber,
        string memory _productName,
        string memory _manufacturer,
        string memory _batchNumber,
        string memory _manufacturingDate,
        string memory _expiryDate,
        string memory _metadataHash,
        bytes32 _secretHash
    ) public onlyManufacturer {

        require(
            !products[_productId].exists,
            "Product already registered"
        );

        products[_productId] = Product({
            productId: _productId,
            serialNumber: _serialNumber,
            productName: _productName,
            manufacturer: _manufacturer,
            batchNumber: _batchNumber,
            manufacturingDate: _manufacturingDate,
            expiryDate: _expiryDate,
            metadataHash: _metadataHash,
            secretHash: _secretHash,
            status: ProductStatus.REGISTERED,
            activated: false,
            currentOwner: msg.sender,
            createdAt: block.timestamp,
            exists: true
        });

        emit ProductRegistered(
            _productId,
            _serialNumber,
            _manufacturer,
            msg.sender
        );
    }

    function activateProduct(
        string memory _productId,
        bytes32 _secretHash
    ) public {

        Product storage product = products[_productId];

        require(
            product.exists,
            "Product does not exist"
        );

        require(
            !product.activated,
            "Product already activated"
        );

        require(
            product.secretHash == _secretHash,
            "Invalid authentication code"
        );

        require(
            product.status != ProductStatus.BLOCKED,
            "Product is blocked"
        );

        require(
            product.status != ProductStatus.RECALLED,
            "Product is recalled"
        );

        product.activated = true;
        product.status = ProductStatus.ACTIVE;
        product.currentOwner = msg.sender;

        emit ProductActivated(
            _productId,
            msg.sender
        );
    }

    function transferOwnership(
        string memory _productId,
        address _newOwner
    ) public {

        Product storage product = products[_productId];

        require(
            product.exists,
            "Product does not exist"
        );

        require(
            msg.sender == product.currentOwner,
            "Only current owner can transfer"
        );

        require(
            _newOwner != address(0),
            "Invalid new owner"
        );

        address oldOwner = product.currentOwner;

        product.currentOwner = _newOwner;

        emit OwnershipTransferred(
            _productId,
            oldOwner,
            _newOwner
        );
    }

    function updateStatus(
        string memory _productId,
        ProductStatus _status
    ) public onlyAdmin {

        require(
            products[_productId].exists,
            "Product does not exist"
        );

        products[_productId].status = _status;

        emit ProductStatusUpdated(
            _productId,
            _status
        );
    }

    function verifyProduct(
        string memory _productId,
        bytes32 _secretHash
    )
        public
        view
        returns (
            string memory productId,
            string memory serialNumber,
            string memory productName,
            string memory manufacturer,
            string memory batchNumber,
            string memory manufacturingDate,
            string memory expiryDate,
            string memory metadataHash,
            ProductStatus status,
            bool activated,
            address currentOwner,
            uint256 createdAt,
            bool secretValid,
            bool exists
        )
    {
        Product memory product = products[_productId];

        bool validSecret =
            product.secretHash == _secretHash;

        return (
            product.productId,
            product.serialNumber,
            product.productName,
            product.manufacturer,
            product.batchNumber,
            product.manufacturingDate,
            product.expiryDate,
            product.metadataHash,
            product.status,
            product.activated,
            product.currentOwner,
            product.createdAt,
            validSecret,
            product.exists
        );
    }

    function getProduct(
        string memory _productId
    )
        public
        view
        returns (Product memory)
    {
        require(
            products[_productId].exists,
            "Product does not exist"
        );

        return products[_productId];
    }
}