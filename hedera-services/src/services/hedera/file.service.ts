// services/hedera/file.service.ts
import {
  Client,
  FileCreateTransaction,
  FileAppendTransaction,
  FileUpdateTransaction,
  FileDeleteTransaction,
  FileContentsQuery,
  FileId,
  AccountId,
  PrivateKey,
  Hbar
} from '@hashgraph/sdk';
import { executeWithRetry } from '../../utils/error-handler';
import { monitorTransaction } from '../../utils/transaction-monitor';

export class HederaFileService {
  private client: Client;
  private operatorAccountId: AccountId;
  private operatorPrivateKey: PrivateKey;

  constructor() {
    if (!process.env.HEDERA_OPERATOR_ACCOUNT_ID || !process.env.HEDERA_OPERATOR_PRIVATE_KEY) {
      throw new Error('Missing operator credentials in environment');
    }
    this.client = Client.forMainnet();
    this.operatorAccountId = AccountId.fromString(process.env.HEDERA_OPERATOR_ACCOUNT_ID);
    this.operatorPrivateKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_PRIVATE_KEY);
    this.client.setOperator(this.operatorAccountId, this.operatorPrivateKey);
  }

  /**
   * Creates a new file on Hedera with contents
   * Supports chunking for files >6KB
   * @param fileConfig - File configuration
   * @returns File ID and transaction details
   */
  async createFile(fileConfig: {
    contents: Buffer | string;
    fileName?: string;
    keys?: PrivateKey[]; // Access keys
    expirationTime?: Date; // Optional expiration
    memo?: string;
  }): Promise<FileOperationResult> {
    return executeWithRetry(async () => {
      let contents = typeof fileConfig.contents === 'string' 
        ? Buffer.from(fileConfig.contents, 'utf-8') 
        : fileConfig.contents;

      // Chunk if >6KB (Hedera limit)
      const chunks: Buffer[] = [];
      const chunkSize = 6144; // 6KB
      for (let i = 0; i < contents.length; i += chunkSize) {
        chunks.push(contents.slice(i, i + chunkSize));
      }

      // Create first chunk
      let fileCreateTx = new FileCreateTransaction()
        .setContents(chunks[0])
        .setKeys(fileConfig.keys || [this.operatorPrivateKey.publicKey]);

      if (fileConfig.expirationTime) {
        fileCreateTx.setExpirationTime(fileConfig.expirationTime);
      }

      if (fileConfig.memo) {
        fileCreateTx.setTransactionMemo(fileConfig.memo);
      }

      const fileCreateSubmit = await fileCreateTx.execute(this.client);
      const fileCreateReceipt = await fileCreateSubmit.getReceipt(this.client);
      let fileId = fileCreateReceipt.fileId!;

      console.log(`✅ File created: ${fileId.toString()}`);

      // Append remaining chunks
      for (let i = 1; i < chunks.length; i++) {
        const appendTx = new FileAppendTransaction()
          .setFileId(fileId)
          .setContents(chunks[i]);

        await appendTx.execute(this.client);
      }

      // Store metadata (e.g., fileName -> fileId mapping)
      await this.storeFileMetadata({
        fileId: fileId.toString(),
        fileName: fileConfig.fileName || 'unnamed',
        size: contents.length,
        createdAt: new Date(),
        transactionId: fileCreateSubmit.transactionId.toString()
      });

      await monitorTransaction(fileCreateSubmit.transactionId.toString());

      return {
        success: true,
        fileId: fileId.toString(),
        transactionId: fileCreateSubmit.transactionId.toString(),
        explorerUrl: `https://hashscan.io/mainnet/file/${fileId.toString()}`
      };
    });
  }

  /**
   * Updates an existing file by appending contents
   * @param fileId - Target file ID
   * @param contents - Data to append
   */
  async updateFile(
    fileId: string,
    contents: Buffer | string
  ): Promise<FileOperationResult> {
    return executeWithRetry(async () => {
      const file = FileId.fromString(fileId);
      let appendContents = typeof contents === 'string' 
        ? Buffer.from(contents, 'utf-8') 
        : contents;

      const updateTx = new FileAppendTransaction()
        .setFileId(file)
        .setContents(appendContents);

      const updateSubmit = await updateTx.execute(this.client);
      const updateReceipt = await updateSubmit.getReceipt(this.client);

      console.log(`✅ File ${fileId} updated`);

      await monitorTransaction(updateSubmit.transactionId.toString());

      return {
        success: true,
        fileId,
        transactionId: updateSubmit.transactionId.toString(),
        explorerUrl: `https://hashscan.io/mainnet/file/${fileId}`
      };
    });
  }

  /**
   * Retrieves file contents (up to 6KB; use pagination for larger)
   * @param fileId - File ID to query
   * @returns File contents as Buffer
   */
  async getFileContents(fileId: string): Promise<Buffer> {
    return executeWithRetry(async () => {
      const query = new FileContentsQuery()
        .setFileId(FileId.fromString(fileId));

      const contents = await query.execute(this.client);

      console.log(`✅ Retrieved contents for file ${fileId}`);

      return contents;
    });
  }

  /**
   * Deletes a file from the network
   * @param fileId - File ID to delete
   */
  async deleteFile(fileId: string): Promise<FileOperationResult> {
    return executeWithRetry(async () => {
      const deleteTx = new FileDeleteTransaction()
        .setFileId(FileId.fromString(fileId));

      const deleteSubmit = await deleteTx.execute(this.client);
      const deleteReceipt = await deleteSubmit.getReceipt(this.client);

      console.log(`✅ File ${fileId} deleted`);

      await monitorTransaction(deleteSubmit.transactionId.toString());

      return {
        success: true,
        fileId,
        transactionId: deleteSubmit.transactionId.toString(),
        explorerUrl: `https://hashscan.io/mainnet/file/${fileId}`
      };
    });
  }

  /**
   * Grants access to a file by adding keys
   * @param fileId - Target file ID
   * @param keys - Public keys to add (read/write)
   */
  async grantAccess(
    fileId: string,
    keys: PrivateKey[]
  ): Promise<FileOperationResult> {
    return executeWithRetry(async () => {
      // For simplicity, update file with new keys (full update required for key changes)
      const updateTx = new FileUpdateTransaction()
        .setFileId(FileId.fromString(fileId))
        .setKeys(keys.map(k => k.publicKey));

      const updateSubmit = await updateTx.execute(this.client);
      const updateReceipt = await updateSubmit.getReceipt(this.client);

      console.log(`✅ Access granted to file ${fileId}`);

      await monitorTransaction(updateSubmit.transactionId.toString());

      return {
        success: true,
        fileId,
        transactionId: updateSubmit.transactionId.toString(),
        explorerUrl: `https://hashscan.io/mainnet/file/${fileId}`
      };
    });
  }

  // Helper method for database operations
  private async storeFileMetadata(metadata: any): Promise<void> {
    // e.g., await prisma.file.create({ data: metadata });
    console.log('Stored file metadata:', metadata);
  }
}

// Type definitions
interface FileOperationResult {
  success: boolean;
  fileId: string;
  transactionId: string;
  explorerUrl: string;
}