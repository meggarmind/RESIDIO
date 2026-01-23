import { matchEmailTransactions } from './src/actions/email-imports/process-email-import';

async function run() {
    const importId = '3b39f59c-dfef-4c95-99fc-89b507df8e6d';
    console.log(`Re-running matching for import: ${importId}`);
    const result = await matchEmailTransactions(importId);
    console.log('Result:', JSON.stringify(result, null, 2));
}

run().catch(console.error);
