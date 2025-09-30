// utils/transaction-monitor.ts
export async function monitorTransaction(transactionId: string): Promise<void> {
  const mirrorNodeUrl = 'https://mainnet-public.mirrornode.hedera.com';
  
  for (let i = 0; i < 10; i++) {
    try {
      const response = await fetch(`${mirrorNodeUrl}/api/v1/transactions/${transactionId}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.transactions && data.transactions.length > 0 && data.transactions[0].consensus_timestamp) {
          console.log('Transaction confirmed:', data);
          return;
        }
      }
    } catch (error) {
      console.warn('Monitor poll failed:', error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.warn(`Transaction ${transactionId} not confirmed after 10 polls`);
}