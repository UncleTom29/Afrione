// examples/complete-tontine-cycle.ts
import { HederaTokenService } from '../services/hedera/token.service';
import { HederaConsensusService } from '../services/hedera/consensus.service';
import { HederaSmartContractService } from '../services/hedera/smart-contract.service';

async function completeTontineCycleExample() {
  const tokenService = new HederaTokenService();
  const consensusService = new HederaConsensusService();
  const contractService = new HederaSmartContractService();

  // Step 1: Create tontine smart contract
  const tontine = await contractService.createTontineCircle({
    name: 'Lagos Tech Workers 2025',
    monthlyAmount: 1000000, // 10,000 NGN in smallest units
    totalMembers: 12,
    cycleDuration: 2592000 // 30 days in seconds
  });

  console.log(`Tontine created: ${tontine.tontineContractId}`);

  // Step 2: Log creation to HCS
  await consensusService.logTontineActivity({
    tontineId: tontine.tontineContractId,
    activityType: 'CREATED',
    metadata: {
      name: 'Lagos Tech Workers 2025',
      timestamp: new Date().toISOString()
    }
  });

  // Step 3: Members join tontine (simulated)
  for (let position = 1; position <= 12; position++) {
    await contractService.joinTontineCircle(
      tontine.tontineContractId,
      position
    );

    await consensusService.logTontineActivity({
      tontineId: tontine.tontineContractId,
      activityType: 'MEMBER_JOINED',
      metadata: { position }
    });
  }

  // Step 4: Monthly contributions (simulated for one cycle)
  for (let cycle = 1; cycle <= 1; cycle++) { // Shortened for demo
    for (let member = 1; member <= 12; member++) {
      await contractService.makeTontineContribution(
        tontine.tontineContractId,
        1000000
      );

      await consensusService.logTontineActivity({
        tontineId: tontine.tontineContractId,
        activityType: 'CONTRIBUTION',
        cycle,
        amount: 1000000
      });
    }

    await consensusService.logTontineActivity({
      tontineId: tontine.tontineContractId,
      activityType: 'PAYOUT',
      cycle,
      amount: 12000000 // 12 x 1M
    });
  }

  // Step 5: Mark as completed (simulated)
  await consensusService.logTontineActivity({
    tontineId: tontine.tontineContractId,
    activityType: 'COMPLETED',
    metadata: {
      totalCycles: 12,
      totalDistributed: 144000000,
      completedAt: new Date().toISOString()
    }
  });

  console.log('Complete tontine cycle executed on Hedera!');
}

completeTontineCycleExample().catch(console.error);