// services/hedera/token.service.ts
import {
  Client,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenAssociateTransaction,
  TransferTransaction,
  AccountId,
  PrivateKey,
  TokenId,
  Hbar,
  TokenMintTransaction,
  TokenBurnTransaction,
  AccountBalanceQuery
} from '@hashgraph/sdk';
import { executeWithRetry } from '../../utils/error-handler';

export class HederaTokenService {
  private client: Client;
  private treasuryAccountId: AccountId;
  private treasuryPrivateKey: PrivateKey;

  constructor() {
    if (!process.env.HEDERA_TREASURY_ACCOUNT_ID || !process.env.HEDERA_TREASURY_PRIVATE_KEY) {
      throw new Error('Missing treasury credentials in environment');
    }
    this.client = Client.forMainnet();
    this.treasuryAccountId = AccountId.fromString(process.env.HEDERA_TREASURY_ACCOUNT_ID);
    this.treasuryPrivateKey = PrivateKey.fromString(process.env.HEDERA_TREASURY_PRIVATE_KEY);
    this.client.setOperator(this.treasuryAccountId, this.treasuryPrivateKey);
  }

  async createFungibleToken(tokenConfig: {
    name: string;
    symbol: string;
    decimals: number;
    initialSupply: number;
    maxSupply?: number;
    kycRequired?: boolean;
    freezeDefault?: boolean;
  }): Promise<TokenCreationResult> {
    return executeWithRetry(async () => {
      const tokenCreateTx = new TokenCreateTransaction()
        .setTokenName(tokenConfig.name)
        .setTokenSymbol(tokenConfig.symbol)
        .setDecimals(tokenConfig.decimals)
        .setInitialSupply(tokenConfig.initialSupply)
        .setTreasuryAccountId(this.treasuryAccountId)
        .setAdminKey(this.treasuryPrivateKey.publicKey)
        .setSupplyKey(this.treasuryPrivateKey.publicKey)
        .setTokenType(TokenType.FungibleCommon)
        .setSupplyType(tokenConfig.maxSupply ? TokenSupplyType.Finite : TokenSupplyType.Infinite);

      if (tokenConfig.kycRequired) {
        tokenCreateTx.setKycKey(this.treasuryPrivateKey.publicKey);
      }

      if (tokenConfig.freezeDefault !== undefined) {
        tokenCreateTx.setFreezeKey(this.treasuryPrivateKey.publicKey).setFreezeDefault(tokenConfig.freezeDefault);
      }

      if (tokenConfig.maxSupply) {
        tokenCreateTx.setMaxSupply(tokenConfig.maxSupply);
      }

      const tokenCreateSubmit = await tokenCreateTx.execute(this.client);
      const tokenCreateReceipt = await tokenCreateSubmit.getReceipt(this.client);
      const tokenId = tokenCreateReceipt.tokenId!;

      console.log(`✅ Token created: ${tokenId.toString()}`);

      await this.storeTokenMetadata({
        tokenId: tokenId.toString(),
        name: tokenConfig.name,
        symbol: tokenConfig.symbol,
        decimals: tokenConfig.decimals,
        type: 'FUNGIBLE',
        createdAt: new Date(),
        transactionId: tokenCreateSubmit.transactionId.toString()
      });

      return {
        success: true,
        tokenId: tokenId.toString(),
        transactionId: tokenCreateSubmit.transactionId.toString(),
        explorerUrl: `https://hashscan.io/mainnet/token/${tokenId.toString()}`
      };
    });
  }

  async createNFTCollection(nftConfig: {
    name: string;
    symbol: string;
    maxSupply: number;
  }): Promise<TokenCreationResult> {
    return executeWithRetry(async () => {
      const nftCreate = new TokenCreateTransaction()
        .setTokenName(nftConfig.name)
        .setTokenSymbol(nftConfig.symbol)
        .setTokenType(TokenType.NonFungibleUnique)
        .setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(nftConfig.maxSupply)
        .setTreasuryAccountId(this.treasuryAccountId)
        .setAdminKey(this.treasuryPrivateKey.publicKey)
        .setSupplyKey(this.treasuryPrivateKey.publicKey)
        .setFreezeDefault(false);

      const nftCreateSubmit = await nftCreate.execute(this.client);
      const nftCreateReceipt = await nftCreateSubmit.getReceipt(this.client);
      const tokenId = nftCreateReceipt.tokenId!;

      console.log(`✅ NFT Collection created: ${tokenId.toString()}`);

      return {
        success: true,
        tokenId: tokenId.toString(),
        transactionId: nftCreateSubmit.transactionId.toString(),
        explorerUrl: `https://hashscan.io/mainnet/token/${tokenId.toString()}`
      };
    });
  }

  async associateTokenToAccount(
    userAccountId: string,
    userPrivateKey: string,
    tokenId: string
  ): Promise<AssociationResult> {
    return executeWithRetry(async () => {
      const accountId = AccountId.fromString(userAccountId);
      const privateKey = PrivateKey.fromString(userPrivateKey);
      const token = TokenId.fromString(tokenId);

      const associateTx = new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([token])
        .freezeWith(this.client);

      const signTx = await associateTx.sign(privateKey);
      const txResponse = await signTx.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);

      console.log(`✅ Token ${tokenId} associated with account ${userAccountId}`);

      await monitorTransaction(txResponse.transactionId.toString());

      return {
        success: true,
        transactionId: txResponse.transactionId.toString(),
        status: receipt.status.toString()
      };
    });
  }

  async transferTokens(transferDetails: {
    tokenId: string;
    fromAccountId: string;
    fromPrivateKey: string;
    toAccountId: string;
    amount: number;
    memo?: string;
  }): Promise<TransferResult> {
    return executeWithRetry(async () => {
      const tokenIdObj = TokenId.fromString(transferDetails.tokenId);
      const fromAccount = AccountId.fromString(transferDetails.fromAccountId);
      const toAccount = AccountId.fromString(transferDetails.toAccountId);
      const privateKey = PrivateKey.fromString(transferDetails.fromPrivateKey);

      const transferTx = new TransferTransaction()
        .addTokenTransfer(tokenIdObj, fromAccount, -transferDetails.amount)
        .addTokenTransfer(tokenIdObj, toAccount, transferDetails.amount);

      if (transferDetails.memo) {
        transferTx.setTransactionMemo(transferDetails.memo);
      }

      const freezeTx = await transferTx.freezeWith(this.client);
      const signTx = await freezeTx.sign(privateKey);
      const txResponse = await signTx.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);

      console.log(`✅ Transferred ${transferDetails.amount} tokens from ${transferDetails.fromAccountId} to ${transferDetails.toAccountId}`);

      await this.recordTokenTransfer({
        tokenId: transferDetails.tokenId,
        from: transferDetails.fromAccountId,
        to: transferDetails.toAccountId,
        amount: transferDetails.amount,
        transactionId: txResponse.transactionId.toString(),
        timestamp: new Date()
      });

      await monitorTransaction(txResponse.transactionId.toString());

      return {
        success: true,
        transactionId: txResponse.transactionId.toString(),
        status: receipt.status.toString(),
        explorerUrl: `https://hashscan.io/mainnet/transaction/${txResponse.transactionId.toString()}`
      };
    });
  }

  async mintTokenSupply(
    tokenId: string,
    amount: number,
    recipientAccountId?: string
  ): Promise<MintResult> {
    return executeWithRetry(async () => {
      const token = TokenId.fromString(tokenId);

      const mintTx = await new TokenMintTransaction()
        .setTokenId(token)
        .setAmount(new Hbar(amount))
        .execute(this.client);

      const receipt = await mintTx.getReceipt(this.client);

      if (recipientAccountId) {
        await this.transferTokens({
          tokenId,
          fromAccountId: this.treasuryAccountId.toString(),
          fromPrivateKey: this.treasuryPrivateKey.toString(),
          toAccountId: recipientAccountId,
          amount
        });
      }

      return {
        success: true,
        tokenId,
        amountMinted: amount,
        transactionId: mintTx.transactionId.toString()
      };
    });
  }

  async burnTokenSupply(
    tokenId: string,
    amount: number
  ): Promise<BurnResult> {
    return executeWithRetry(async () => {
      const token = TokenId.fromString(tokenId);

      const burnTx = await new TokenBurnTransaction()
        .setTokenId(token)
        .setAmount(new Hbar(amount))
        .execute(this.client);

      const receipt = await burnTx.getReceipt(this.client);

      console.log(`✅ Burned ${amount} tokens from ${tokenId}`);

      return {
        success: true,
        tokenId,
        amountBurned: amount,
        transactionId: burnTx.transactionId.toString()
      };
    });
  }

  async getTokenBalance(
    accountId: string,
    tokenId: string
  ): Promise<number> {
    return executeWithRetry(async () => {
      const query = new AccountBalanceQuery()
        .setAccountId(AccountId.fromString(accountId));

      const balance = await query.execute(this.client);
      const tokenBalance = balance.tokens?.get(TokenId.fromString(tokenId));

      return tokenBalance ? tokenBalance.toBigNumber().toNumber() : 0;
    });
  }

  // Helper methods for database operations (implement with your DB client)
  private async storeTokenMetadata(metadata: any): Promise<void> {
    // e.g., await prisma.token.create({ data: metadata });
    console.log('Stored metadata:', metadata);
  }

  private async recordTokenTransfer(transfer: any): Promise<void> {
    // e.g., await prisma.transfer.create({ data: transfer });
    console.log('Recorded transfer:', transfer);
  }
}

// Type definitions (unchanged)
interface TokenCreationResult {
  success: boolean;
  tokenId: string;
  transactionId: string;
  explorerUrl: string;
}

interface AssociationResult {
  success: boolean;
  transactionId: string;
  status: string;
}

interface TransferResult {
  success: boolean;
  transactionId: string;
  status: string;
  explorerUrl: string;
}

interface MintResult {
  success: boolean;
  tokenId: string;
  amountMinted: number;
  transactionId: string;
}

interface BurnResult {
  success: boolean;
  tokenId: string;
  amountBurned: number;
  transactionId: string;
}