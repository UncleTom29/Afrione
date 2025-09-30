// services/hedera/smart-contract.service.ts
import {
  Client,
  ContractCreateTransaction,
  ContractExecuteTransaction,
  ContractCallQuery,
  ContractFunctionParameters,
  ContractId,
  AccountId,
  PrivateKey,
  Hbar,
  FileCreateTransaction,
  FileAppendTransaction
} from '@hashgraph/sdk';
import * as fs from 'fs';
import { executeWithRetry } from '../../utils/error-handler';
import { estimateGas } from '../../utils/gas-estimator';
import { monitorTransaction } from '../../utils/transaction-monitor';

export class HederaSmartContractService {
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

  async deployContract(
    contractBytecode: string,
    constructorParams?: ContractFunctionParameters,
    gas: number = 100000
  ): Promise<ContractDeploymentResult> {
    return executeWithRetry(async () => {
      const bytecode = Buffer.from(contractBytecode, 'hex');

      const contractCreateTx = new ContractCreateTransaction()
        .setBytecode(bytecode)
        .setGas(gas)
        .setAdminKey(this.operatorPrivateKey.publicKey);

      if (constructorParams) {
        contractCreateTx.setConstructorParameters(constructorParams);
      }

      const contractCreateSubmit = await contractCreateTx.execute(this.client);
      const contractCreateReceipt = await contractCreateSubmit.getReceipt(this.client);
      const contractId = contractCreateReceipt.contractId!;

      console.log(`✅ Smart contract deployed: ${contractId.toString()}`);

      await monitorTransaction(contractCreateSubmit.transactionId.toString());

      return {
        success: true,
        contractId: contractId.toString(),
        transactionId: contractCreateSubmit.transactionId.toString(),
        explorerUrl: `https://hashscan.io/mainnet/contract/${contractId.toString()}`
      };
    });
  }

  async deployLargeContract(
    contractBytecode: string,
    constructorParams?: ContractFunctionParameters,
    gas: number = 200000
  ): Promise<ContractDeploymentResult> {
    return executeWithRetry(async () => {
      const bytecode = Buffer.from(contractBytecode, 'hex');

      // Step 1: Create file
      const fileCreateTx = new FileCreateTransaction()
        .setKeys([this.operatorPrivateKey.publicKey])
        .setContents(bytecode.slice(0, 4096));

      const fileCreateSubmit = await fileCreateTx.execute(this.client);
      const fileCreateReceipt = await fileCreateSubmit.getReceipt(this.client);
      const fileId = fileCreateReceipt.fileId!;

      console.log(`File created for large contract: ${fileId.toString()}`);

      // Step 2: Append chunks
      let offset = 4096;
      while (offset < bytecode.length) {
        const chunk = bytecode.slice(offset, offset + 4096);
        const fileAppendTx = new FileAppendTransaction()
          .setFileId(fileId)
          .setContents(chunk);
        await fileAppendTx.execute(this.client);
        offset += 4096;
      }

      // Step 3: Deploy from file
      const contractCreateTx = new ContractCreateTransaction()
        .setBytecodeFileId(fileId)
        .setGas(gas)
        .setAdminKey(this.operatorPrivateKey.publicKey);

      if (constructorParams) {
        contractCreateTx.setConstructorParameters(constructorParams);
      }

      const contractCreateSubmit = await contractCreateTx.execute(this.client);
      const contractCreateReceipt = await contractCreateSubmit.getReceipt(this.client);
      const contractId = contractCreateReceipt.contractId!;

      console.log(`✅ Large contract deployed: ${contractId.toString()}`);

      await monitorTransaction(contractCreateSubmit.transactionId.toString());

      return {
        success: true,
        contractId: contractId.toString(),
        transactionId: contractCreateSubmit.transactionId.toString(),
        explorerUrl: `https://hashscan.io/mainnet/contract/${contractId.toString()}`
      };
    });
  }

  async executeContractFunction(
    contractId: string,
    functionName: string,
    functionParams?: ContractFunctionParameters,
    gas: number = 100000,
    payableAmount?: Hbar
  ): Promise<ContractExecutionResult> {
    return executeWithRetry(async () => {
      const contract = ContractId.fromString(contractId);

      const estimatedGas = await estimateGas(contractId, functionName, functionParams || new ContractFunctionParameters());
      const finalGas = Math.max(gas, estimatedGas);

      const contractExecuteTx = new ContractExecuteTransaction()
        .setContractId(contract)
        .setGas(finalGas)
        .setFunction(functionName, functionParams);

      if (payableAmount) {
        contractExecuteTx.setPayableAmount(payableAmount);
      }

      const contractExecuteSubmit = await contractExecuteTx.execute(this.client);
      const contractExecuteReceipt = await contractExecuteSubmit.getReceipt(this.client);

      console.log(`✅ Contract function executed: ${functionName}`);

      await monitorTransaction(contractExecuteSubmit.transactionId.toString());

      return {
        success: true,
        contractId,
        functionName,
        transactionId: contractExecuteSubmit.transactionId.toString(),
        status: contractExecuteReceipt.status.toString(),
        gasUsed: contractExecuteReceipt.gasUsed?.toNumber() || 0
      };
    });
  }

  async queryContractFunction(
    contractId: string,
    functionName: string,
    functionParams?: ContractFunctionParameters
  ): Promise<any> {
    return executeWithRetry(async () => {
      const contract = ContractId.fromString(contractId);

      const contractQuery = new ContractCallQuery()
        .setContractId(contract)
        .setGas(50000)
        .setFunction(functionName, functionParams);

      const contractCallResult = await contractQuery.execute(this.client);

      console.log(`✅ Contract queried: ${functionName}`);

      return {
        success: true,
        result: contractCallResult,
        getString: (index: number) => contractCallResult.getString(index),
        getUint256: (index: number) => contractCallResult.getUint256(index),
        getAddress: (index: number) => contractCallResult.getAddress(index),
        getBool: (index: number) => contractCallResult.getBool(index)
      };
    });
  }

  async createTontineCircle(tontineParams: {
    name: string;
    monthlyAmount: number;
    totalMembers: number;
    cycleDuration: number;
  }): Promise<TontineCreationResult> {
    if (!process.env.TONTINE_FACTORY_CONTRACT_ID) {
      throw new Error('Missing TONTINE_FACTORY_CONTRACT_ID in environment');
    }
    return executeWithRetry(async () => {
      const TONTINE_FACTORY_CONTRACT = process.env.TONTINE_FACTORY_CONTRACT_ID;

      const functionParams = new ContractFunctionParameters()
        .addString(tontineParams.name)
        .addUint256(BigInt(tontineParams.monthlyAmount))
        .addUint8(tontineParams.totalMembers)
        .addUint256(BigInt(tontineParams.cycleDuration));

      const result = await this.executeContractFunction(
        TONTINE_FACTORY_CONTRACT,
        'createTontine',
        functionParams,
        150000
      );

      const queryResult = await this.queryContractFunction(
        TONTINE_FACTORY_CONTRACT,
        'getLatestTontineId'
      );

      const tontineContractId = queryResult.getAddress(0).toString();

      return {
        success: true,
        tontineContractId,
        factoryTransactionId: result.transactionId,
        explorerUrl: `https://hashscan.io/mainnet/contract/${tontineContractId}`
      };
    });
  }

  async joinTontineCircle(
    tontineContractId: string,
    position: number
  ): Promise<ContractExecutionResult> {
    return executeWithRetry(async () => {
      const functionParams = new ContractFunctionParameters()
        .addUint8(position);

      const result = await this.executeContractFunction(
        tontineContractId,
        'joinTontine',
        functionParams,
        100000
      );

      console.log(`Joined tontine at position ${position}`);

      return result;
    });
  }

  async makeTontineContribution(
    tontineContractId: string,
    amount: number
  ): Promise<ContractExecutionResult> {
    return executeWithRetry(async () => {
      const payableAmount = new Hbar(amount / 100000000); // Assuming HBAR units

      const result = await this.executeContractFunction(
        tontineContractId,
        'contributeMonthly',
        undefined,
        150000,
        payableAmount
      );

      console.log(`Contributed ${amount} to tontine`);

      return result;
    });
  }

  async getTontineStatus(tontineContractId: string): Promise<TontineStatus> {
    return executeWithRetry(async () => {
      const result = await this.queryContractFunction(
        tontineContractId,
        'getTontineInfo'
      );

      return {
        name: result.getString(0),
        monthlyAmount: result.getUint256(1).toNumber(),
        totalMembers: result.getUint256(2).toNumber(),
        currentMembers: result.getUint256(3).toNumber(),
        currentCycle: result.getUint256(4).toNumber(),
        isActive: result.getBool(5)
      };
    });
  }
}

// Type definitions (unchanged)
interface ContractDeploymentResult {
  success: boolean;
  contractId: string;
  transactionId: string;
  explorerUrl: string;
}

interface ContractExecutionResult {
  success: boolean;
  contractId: string;
  functionName: string;
  transactionId: string;
  status: string;
  gasUsed: number;
}

interface TontineCreationResult {
  success: boolean;
  tontineContractId: string;
  factoryTransactionId: string;
  explorerUrl: string;
}

interface TontineStatus {
  name: string;
  monthlyAmount: number;
  totalMembers: number;
  currentMembers: number;
  currentCycle: number;
  isActive: boolean;
}