/**
 * Script to trigger invoice generation for December 2025
 * This script makes a direct HTTP call to the cron endpoint
 *
 * Run with: node scripts/trigger-invoice-generation.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the CRON_SECRET from .env.local
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const cronSecretMatch = envContent.match(/CRON_SECRET=(.+)/);
const cronSecret = cronSecretMatch ? cronSecretMatch[1].trim() : null;

if (!cronSecret) {
    console.error('CRON_SECRET not found in .env.local');
    process.exit(1);
}

console.log('CRON_SECRET length:', cronSecret.length);
console.log('Calling cron endpoint...\n');

try {
    const response = await fetch('http://localhost:3000/api/cron/generate-invoices', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${cronSecret}`
        }
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
} catch (error) {
    console.error('Error:', error.message);
}
