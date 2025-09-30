// services/hedera/consensus.service.ts
import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
  TopicInfoQuery,
  PrivateKey,
  AccountId
} from '@hashgraph/sdk';
import * as crypto from 'crypto';
import { executeWithRetry } from '../../utils/error-handler';
import { monitorTransaction } from '../../utils/transaction-monitor';

export class HederaConsensusService {
  private client: Client;
  private operatorAccountId: AccountId;
  private operatorPrivateKey: PrivateKey;
  
  private topicIds: {
    transactions: TopicId | null;
    tontines: TopicId | null;
    compliance: TopicId | null;
    security: TopicId | null;
  } = {
    transactions: null,
    tontines: null,
    compliance: null,
    security: null
  };

  constructor() {
    if (!process.env.HEDERA_OPERATOR_ACCOUNT_ID || !process.env.HEDERA_OPERATOR_PRIVATE_KEY) {
      throw new Error('Missing operator credentials in environment');
    }
    this.client = Client.forMainnet();
    this.operatorAccountId = AccountId.fromString(process.env.HEDERA_OPERATOR_ACCOUNT_ID);
    this.operatorPrivateKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_PRIVATE_KEY);
    this.client.setOperator(this.operatorAccountId, this.operatorPrivateKey);
    this.loadTopicIds();
  }

  async createTopic(topicConfig: {
    memo: string;
    adminKey?: PrivateKey;
    submitKey?: PrivateKey;
    autoRenewPeriod?: number;
  }): Promise<TopicCreationResult> {
    return executeWithRetry(async () => {
      const topicCreateTx = new TopicCreateTransaction()
        .setTopicMemo(topicConfig.memo);

      if (topicConfig.adminKey) {
        topicCreateTx.setAdminKey(topicConfig.adminKey);
      }

      if (topicConfig.submitKey) {
        topicCreateTx.setSubmitKey(topicConfig.submitKey);
      }

      if (topicConfig.autoRenewPeriod) {
        topicCreateTx.setAutoRenewPeriod(topicConfig.autoRenewPeriod);
      }

      const topicCreateSubmit = await topicCreateTx.execute(this.client);
      const topicCreateReceipt = await topicCreateSubmit.getReceipt(this.client);
      const topicId = topicCreateReceipt.topicId!;

      console.log(`✅ HCS Topic created: ${topicId.toString()}`);

      await monitorTransaction(topicCreateSubmit.transactionId.toString());

      return {
        success: true,
        topicId: topicId.toString(),
        transactionId: topicCreateSubmit.transactionId.toString(),
        explorerUrl: `https://hashscan.io/mainnet/topic/${topicId.toString()}`
      };
    });
  }

  async submitMessage(
    topicId: string,
    message: any,
    encrypt: boolean = false
  ): Promise<MessageSubmitResult> {
    return executeWithRetry(async () => {
      const topic = TopicId.fromString(topicId);
      
      let messageString = JSON.stringify(message);

      if (encrypt) {
        if (!process.env.HCS_ENCRYPTION_KEY) {
          throw new Error('Missing HCS_ENCRYPTION_KEY in environment');
        }
        messageString = this.encryptMessage(messageString);
      }

      const messageBuffer = Buffer.from(messageString, 'utf-8');

      const submitTx = new TopicMessageSubmitTransaction()
        .setTopicId(topic)
        .setMessage(messageBuffer);

      const submitResponse = await submitTx.execute(this.client);
      const submitReceipt = await submitResponse.getReceipt(this.client);

      const consensusTimestamp = new Date(); // Approximate; use mirror node for exact

      console.log(`✅ Message submitted to topic ${topicId}`);

      await monitorTransaction(submitResponse.transactionId.toString());

      return {
        success: true,
        topicId,
        transactionId: submitResponse.transactionId.toString(),
        consensusTimestamp: consensusTimestamp.toISOString(),
        sequenceNumber: submitReceipt.topicSequenceNumber?.toNumber() || 0
      };
    });
  }

  async logTransaction(transaction: {
    transactionId: string;
    userId: string;
    type: string;
    amount: number;
    currency: string;
    recipientId?: string;
    status: string;
    metadata?: any;
  }): Promise<void> {
    if (!this.topicIds.transactions) {
      throw new Error('Transactions topic not initialized');
    }

    const logEntry = {
      type: 'TRANSACTION_LOG',
      timestamp: new Date().toISOString(),
      data: {
        transactionId: transaction.transactionId,
        userId: this.hashUserId(transaction.userId),
        transactionType: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        recipientId: transaction.recipientId ? this.hashUserId(transaction.recipientId) : null,
        status: transaction.status,
        metadata: transaction.metadata
      }
    };

    await this.submitMessage(
      this.topicIds.transactions.toString(),
      logEntry,
      false
    );

    console.log(`Transaction ${transaction.transactionId} logged to HCS`);
  }

  async logTontineActivity(activity: {
    tontineId: string;
    activityType: 'CREATED' | 'MEMBER_JOINED' | 'CONTRIBUTION' | 'PAYOUT' | 'COMPLETED';
    userId?: string;
    amount?: number;
    cycle?: number;
    metadata?: any;
  }): Promise<void> {
    if (!this.topicIds.tontines) {
      throw new Error('Tontines topic not initialized');
    }

    const logEntry = {
      type: 'TONTINE_ACTIVITY',
      timestamp: new Date().toISOString(),
      data: {
        tontineId: activity.tontineId,
        activityType: activity.activityType,
        userId: activity.userId ? this.hashUserId(activity.userId) : null,
        amount: activity.amount,
        cycle: activity.cycle,
        metadata: activity.metadata
      }
    };

    await this.submitMessage(
      this.topicIds.tontines.toString(),
      logEntry,
      false
    );

    console.log(`Tontine activity logged: ${activity.activityType}`);
  }

  async logComplianceEvent(complianceEvent: {
    userId: string;
    eventType: 'KYC_COMPLETED' | 'AML_SCREENING' | 'SANCTIONS_CHECK' | 'RISK_ASSESSMENT';
    result: string;
    score?: number;
    metadata?: any;
  }): Promise<void> {
    if (!this.topicIds.compliance) {
      throw new Error('Compliance topic not initialized');
    }

    const logEntry = {
      type: 'COMPLIANCE_EVENT',
      timestamp: new Date().toISOString(),
      data: {
        userId: this.hashUserId(complianceEvent.userId),
        eventType: complianceEvent.eventType,
        result: complianceEvent.result,
        score: complianceEvent.score,
        metadata: complianceEvent.metadata
      }
    };

    await this.submitMessage(
      this.topicIds.compliance.toString(),
      logEntry,
      true
    );

    console.log(`Compliance event logged: ${complianceEvent.eventType}`);
  }

  async logSecurityEvent(securityEvent: {
    userId?: string;
    eventType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    ipAddress?: string;
    deviceId?: string;
    description: string;
  }): Promise<void> {
    if (!this.topicIds.security) {
      throw new Error('Security topic not initialized');
    }

    const logEntry = {
      type: 'SECURITY_EVENT',
      timestamp: new Date().toISOString(),
      data: {
        userId: securityEvent.userId ? this.hashUserId(securityEvent.userId) : null,
        eventType: securityEvent.eventType,
        severity: securityEvent.severity,
        ipAddress: securityEvent.ipAddress ? this.hashIpAddress(securityEvent.ipAddress) : null,
        deviceId: securityEvent.deviceId,
        description: securityEvent.description
      }
    };

    await this.submitMessage(
      this.topicIds.security.toString(),
      logEntry,
      true
    );

    console.log(`Security event logged: ${securityEvent.eventType} - ${securityEvent.severity}`);
  }

  async getTopicInfo(topicId: string): Promise<any> {
    return executeWithRetry(async () => {
      const query = new TopicInfoQuery()
        .setTopicId(TopicId.fromString(topicId));

      const info = await query.execute(this.client);

      return {
        topicId: info.topicId.toString(),
        memo: info.topicMemo,
        runningHash: info.runningHash.toString(),
        sequenceNumber: info.sequenceNumber.toNumber(),
        expirationTime: info.expirationTime,
        adminKey: info.adminKey?.toString(),
        submitKey: info.submitKey?.toString(),
        autoRenewPeriod: info.autoRenewPeriod
      };
    });
  }

  private loadTopicIds(): void {
    this.topicIds = {
      transactions: process.env.HCS_TRANSACTIONS_TOPIC_ID ? TopicId.fromString(process.env.HCS_TRANSACTIONS_TOPIC_ID) : null,
      tontines: process.env.HCS_TONTINES_TOPIC_ID ? TopicId.fromString(process.env.HCS_TONTINES_TOPIC_ID) : null,
      compliance: process.env.HCS_COMPLIANCE_TOPIC_ID ? TopicId.fromString(process.env.HCS_COMPLIANCE_TOPIC_ID) : null,
      security: process.env.HCS_SECURITY_TOPIC_ID ? TopicId.fromString(process.env.HCS_SECURITY_TOPIC_ID) : null
    };
  }

  private encryptMessage(message: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.HCS_ENCRYPTION_KEY!, 'hex');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private hashUserId(userId: string): string {
    return crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);
  }

  private hashIpAddress(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }
}

// Type definitions (unchanged)
interface TopicCreationResult {
  success: boolean;
  topicId: string;
  transactionId: string;
  explorerUrl: string;
}

interface MessageSubmitResult {
  success: boolean;
  topicId: string;
  transactionId: string;
  consensusTimestamp: string;
  sequenceNumber: number;
}