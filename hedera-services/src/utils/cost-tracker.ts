// utils/cost-tracker.ts
export interface CostTracker {
  htsTransfers: number;
  hcsMessages: number;
  contractExecutions: number;
  totalCost: number;
}

export async function calculateDailyCosts(htsCount: number = 10000, hcsCount: number = 5000, hscsCount: number = 500): Promise<CostTracker> {
  const htsCost = htsCount * 0.001; // $0.001 per transfer
  const hcsCost = hcsCount * 0.0001; // $0.0001 per message
  const hscsCost = hscsCount * 0.05; // $0.05 per execution (avg)

  return {
    htsTransfers: htsCost,
    hcsMessages: hcsCost,
    contractExecutions: hscsCost,
    totalCost: htsCost + hcsCost + hscsCost
  };
}