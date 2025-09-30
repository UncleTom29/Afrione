// utils/gas-estimator.ts
import { Client, ContractCallQuery, ContractFunctionParameters, ContractId } from '@hashgraph/sdk';

const client = Client.forMainnet(); 

export async function estimateGas(
  contractId: string,
  functionName: string,
  params: ContractFunctionParameters
): Promise<number> {
  try {
    const query = new ContractCallQuery()
      .setContractId(ContractId.fromString(contractId))
      .setGas(50000)
      .setFunction(functionName, params);

    await query.execute(client);
    
    return Math.ceil(50000 * 1.2); // 20% buffer
  } catch (error: any) {
    console.warn('Gas estimation failed:', error.message);
    return 100000; // Default
  }
}