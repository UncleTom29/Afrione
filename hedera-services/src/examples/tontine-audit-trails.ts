// examples/tontine-audit-trail.ts
import { HederaConsensusService } from '../services/hedera/consensus.service';

async function createTontineAuditTrail() {
  const consensusService = new HederaConsensusService();

  // 1. Log tontine creation
  await consensusService.logTontineActivity({
    tontineId: 'ton_abc123',
    activityType: 'CREATED',
    userId: 'usr_creator123',
    metadata: {
      name: 'Lagos Tech Workers Circle',
      monthlyAmount: 10000,
      totalMembers: 12,
      currency: 'NGN'
    }
  });

  // 2. Log member joining
  await consensusService.logTontineActivity({
    tontineId: 'ton_abc123',
    activityType: 'MEMBER_JOINED',
    userId: 'usr_member456',
    metadata: {
      position: 5,
      joinedAt: new Date().toISOString()
    }
  });

  // 3. Log monthly contribution
  await consensusService.logTontineActivity({
    tontineId: 'ton_abc123',
    activityType: 'CONTRIBUTION',
    userId: 'usr_member456',
    amount: 10000,
    cycle: 1,
    metadata: {
      transactionId: 'txn_xyz789',
      contributionDate: new Date().toISOString()
    }
  });

  // 4. Log payout execution
  await consensusService.logTontineActivity({
    tontineId: 'ton_abc123',
    activityType: 'PAYOUT',
    userId: 'usr_recipient789',
    amount: 120000,
    cycle: 1,
    metadata: {
      transactionId: 'txn_payout123',
      yieldBonus: 5000,
      payoutDate: new Date().toISOString()
    }
  });

  // 5. Log cycle completion
  await consensusService.logTontineActivity({
    tontineId: 'ton_abc123',
    activityType: 'COMPLETED',
    cycle: 12,
    metadata: {
      totalDistributed: 1440000,
      successRate: 100,
      completedAt: new Date().toISOString()
    }
  });

  console.log('Complete tontine audit trail created on Hedera Consensus Service');
}

createTontineAuditTrail().catch(console.error);