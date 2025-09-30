// examples/file-storage.ts
import { HederaFileService } from '../services/hedera/file.service';
import * as fs from 'fs';

async function demoFileStorage() {
  const fileService = new HederaFileService();

  // Example 1: Store a property deed document
  const deedContent = fs.readFileSync('path/to/deed.pdf'); // Replace with actual file
  const deedFile = await fileService.createFile({
    contents: deedContent,
    fileName: 'Victoria_Island_Deed_2025.pdf',
    memo: 'Property deed for tokenized real estate',
    expirationTime: new Date('2026-09-30') // 1 year
  });

  console.log(`Property deed stored: ${deedFile.fileId}`);

  // Example 2: Append update (e.g., amendment)
  await fileService.updateFile(deedFile.fileId, Buffer.from('Amendment: Updated ownership details'));

  // Example 3: Retrieve contents
  const retrieved = await fileService.getFileContents(deedFile.fileId);
  console.log(`Retrieved ${retrieved.length} bytes from file`);

  // Example 4: Grant access to investor (add their public key)
  const investorKey = PrivateKey.generate(); // Simulate
  await fileService.grantAccess(deedFile.fileId, [investorKey]);

  // Example 5: Clean up (in prod, only on expiration)
   await fileService.deleteFile(deedFile.fileId);

  console.log('File storage demo complete!');
}

demoFileStorage().catch(console.error);