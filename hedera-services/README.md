# AfriOne Hedera Services 

This repository contains production-ready TypeScript implementations of Hedera services integrated into AfriOne, a multi-currency wallet and asset tokenization platform for African markets. The services leverage Hedera's Token Service (HTS), Consensus Service (HCS), and Smart Contract Service (HSCS) and Hedera File Service for low-cost, compliant financial operations.

## Directory Structure

```
hedera-services/
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── src/
    ├── services/
    │   └── hedera/
    │       ├── token.service.ts
    │       ├── consensus.service.ts
    │       ├── smart-contract.service.ts
    │       └── file.service.ts          
    ├── utils/
    │   ├── error-handler.ts
    │   ├── transaction-monitor.ts
    │   ├── gas-estimator.ts
    │   └── cost-tracker.ts
    └── examples/
        ├── property-tokenization.ts
        ├── tontine-audit-trail.ts
        ├── complete-tontine-cycle.ts
        └── file-storage.ts 
```


## Overview

- **Hedera Token Service (HTS)**: Handles fungible tokens for currencies, stablecoins, rewards, real estate fractionalization, and agricultural assets. Supports KYC/AML, mint/burn, and atomic swaps.
- **Hedera Consensus Service (HCS)**: Provides immutable audit trails for transactions, tontine activities, compliance, and security events. Includes encryption for sensitive data.
- **Hedera Smart Contract Service (HSCS)**: Executes Solidity contracts for tontine automation, lending, governance, and DeFi primitives.
- **Hedera File Service (HFS)**: Secure file storage for documents, metadata, and bytecode. Supports versioning, access controls, and integration with other services (e.g., storing KYC proofs or property deeds).

These services are designed for scalability, with fixed low fees (~$0.001/operation), regulatory compliance features, and integration with PostgreSQL for metadata storage.

## Key Features

- **Production Enhancements**: Error handling with retries, gas estimation, transaction monitoring, and cost tracking.
- **Compliance**: Built-in KYC keys, freezing, and encrypted logging.
- **Use Cases**: Multi-currency wallets, real estate tokenization, agricultural investments, tontine circles, document storage.
- **Dependencies**: `@hashgraph/sdk`, `crypto`, `fs` (Node.js built-in).

## Setup Instructions

1. **Clone and Install**:
   ```
   git clone https://github.com/UncleTom29/Afrione.git
   cd hedera-services
   npm install
   ```

2. **Environment Variables**:
   Copy `.env.example` to `.env` and fill in:
   ```
   HEDERA_TREASURY_ACCOUNT_ID=0.0.xxxx
   HEDERA_TREASURY_PRIVATE_KEY=302e...
   HEDERA_OPERATOR_ACCOUNT_ID=0.0.xxxx
   HEDERA_OPERATOR_PRIVATE_KEY=302e...
   HCS_TRANSACTIONS_TOPIC_ID=0.0.xxxx
   HCS_TONTINES_TOPIC_ID=0.0.xxxx
   HCS_COMPLIANCE_TOPIC_ID=0.0.xxxx
   HCS_SECURITY_TOPIC_ID=0.0.xxxx
   HCS_ENCRYPTION_KEY=your-32-byte-hex-key
   TONTINE_FACTORY_CONTRACT_ID=0.0.xxxx
   DATABASE_URL=postgresql://...
   ```

3. **Build and Run**:
   - Build: `npm run build`
  - Run examples:
  - Property Tokenization: `npm run example:property`
  - Tontine Audit Trail: `npm run example:tontine-audit`
  - Complete Tontine Cycle: `npm run example:full-cycle`
  - File Storage: `npm run example:file`  

## Implementation Details

### 1. HTS (token.service.ts)
- **Core Methods**:
- `createFungibleToken()`: Creates fungible tokens with optional KYC/freeze.
- `createNFTCollection()`: For NFTs like tontine badges.
- `associateTokenToAccount()`: Links tokens to user accounts.
- `transferTokens()`: Atomic transfers with memos.
- `mintTokenSupply()` / `burnTokenSupply()`: Supply management.
- `getTokenBalance()`: Query balances.
- **Integration**: Uses treasury account for operations; stores metadata in DB.
- **Run**: Import `HederaTokenService` and call methods (see `examples/property-tokenization.ts`).

### 2. HCS (consensus.service.ts)
- **Core Methods**:
- `createTopic()`: Initializes logging topics.
- `submitMessage()`: Submits encrypted/hashed messages.
- `logTransaction()` / `logTontineActivity()` / `logComplianceEvent()` / `logSecurityEvent()`: Specialized loggers.
- `getTopicInfo()`: Queries topic status.
- **Integration**: Loads topic IDs from env; uses SHA-256 hashing and AES-256-GCM encryption.
- **Run**: Import `HederaConsensusService` and call log methods (see `examples/tontine-audit-trail.ts`).

### 3. HSCS (smart-contract.service.ts)
- **Core Methods**:
- `deployContract()` / `deployLargeContract()`: Deploys bytecode (handles >24KB via files).
- `executeContractFunction()`: Calls payable/non-payable functions.
- `queryContractFunction()`: Gas-free reads.
- Tontine-specific: `createTontineCircle()`, `joinTontineCircle()`, `makeTontineContribution()`, `getTontineStatus()`.
- **Integration**: Uses operator account; supports constructor params and gas limits.
- **Run**: Import `HederaSmartContractService` and deploy/execute (see `examples/complete-tontine-cycle.ts`).

### 4. HFS (file.service.ts)  
- **Core Methods**:
- `createFile()`: Uploads file contents with optional keys and expiration.
- `updateFile()`: Appends data to existing file.
- `getFileContents()`: Retrieves file data via query.
- `deleteFile()`: Deletes file (requires admin key).
- `grantAccess()`: Adds read/write keys for shared access (e.g., multi-user docs).
- **Integration**: Uses operator account; supports chunked uploads for large files (>6KB); stores file metadata in DB.
- **Run**: Import `HederaFileService` and call methods (see `examples/file-storage.ts`).

### Utilities
- `error-handler.ts`: Retry logic with exponential backoff.
- `transaction-monitor.ts`: Polls mirror node for confirmations.
- `gas-estimator.ts`: Estimates gas for contract calls.
- `cost-tracker.ts`: Tracks daily costs (HTS/HCS/HSCS/HFS).

## Running in Production
- **Database**: Implement `storeTokenMetadata` and `recordTokenTransfer` using Prisma/Knex for PostgreSQL.
- **Monitoring**: Integrate with Prometheus for metrics.
- **Security**: Rotate keys regularly; use HSM for private keys.
- **Testing**: Add unit tests with Hedera testnet.
- **Deployment**: Use Vercel/Netlify for API, or Docker for self-hosting.

## Contributing
Fork, PR with tests. For hackathon demo: Run `npm run example:full-cycle` to showcase integrated tontine flow.

License: MIT
```