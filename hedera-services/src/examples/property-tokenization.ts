// examples/property-tokenization.ts
import { HederaTokenService } from '../services/hedera/token.service';

const TREASURY_ACCOUNT = process.env.HEDERA_TREASURY_ACCOUNT_ID!;
const TREASURY_PRIVATE_KEY = process.env.HEDERA_TREASURY_PRIVATE_KEY!;

async function tokenizeLagosProperty() {
  const tokenService = new HederaTokenService();

  const propertyToken = await tokenService.createFungibleToken({
    name: "Victoria Island Apartment Block A",
    symbol: "VIA-BLK-A",
    decimals: 2,
    initialSupply: 500000, // 5,000 shares
    maxSupply: 500000,
    kycRequired: true,
    freezeDefault: false
  });

  console.log(`Property tokenized: ${propertyToken.tokenId}`);
  
  // Simulate investor (replace with real user data)
  const investorAccountId = '0.0.9999'; // Example
  const investorPrivateKey = 'example-key'; // From DB
  
  await tokenService.associateTokenToAccount(
    investorAccountId,
    investorPrivateKey,
    propertyToken.tokenId
  );

  await tokenService.transferTokens({
    tokenId: propertyToken.tokenId,
    fromAccountId: TREASURY_ACCOUNT,
    fromPrivateKey: TREASURY_PRIVATE_KEY,
    toAccountId: investorAccountId,
    amount: 1000, // 10.00 shares
    memo: "Property investment - VIA Block A"
  });

  return {
    propertyTokenId: propertyToken.tokenId,
    investorShares: 10,
    investmentValue: 100000 // NGN
  };
}

tokenizeLagosProperty().catch(console.error);