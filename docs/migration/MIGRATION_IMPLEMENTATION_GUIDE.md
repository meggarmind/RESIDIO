# Legacy Data Migration Implementation Guide
**Project**: Residio
**Data Source**: `security_dues_import_main.json` (Transformed from Excel)
**Created**: 2026-01-08

## Overview

This guide provides step-by-step implementation details for migrating legacy security dues data from the JSON format into the Residio system.

---

## Data Source Analysis

### JSON Structure Overview

```json
{
  "export_metadata": {
    "export_date": "2026-01-05",
    "source": "Legacy Security Dues Payment Tracker",
    "total_houses": 150,
    "total_flagged": 12,
    "data_period": "2015-2025"
  },
  "houses": [
    {
      "house": { "house_number": "21", "street_code": "OJO.K", "property_type": "COMPOUND", "rate_tier": "STANDARD" },
      "resident": { "primary_name": "GBENGA RAHEEM", "aliases": ["..."] },
      "occupancy": { "move_in_month": "2022-05", "charge_start_month": "2022-07", "move_out_month": null, "status": "ACTIVE" },
      "summary": { "total_expected": 270000, "total_paid": 250000, "net_position": -20000 },
      "transactions": [
        { "year": 2025, "rate": 10000, "chargeable_months": 12, "payments": [...] }
      ]
    }
  ]
}
```

### Data Quality Observations

| Aspect | Status | Notes |
|--------|--------|-------|
| **Total Houses** | 150 properties | Good data volume for migration |
| **Flagged Records** | 12 (8% of total) | Need manual review before import |
| **Data Period** | 2015-2025 (10 years) | Extensive historical transaction data |
| **Payment Aliases** | Multiple per resident | Critical for payment matching |
| **Move-in Tracking** | Month-level granularity | Supports pro-rata billing |

---

## Migration Strategy

### Phase 1: Pre-Migration Validation (Week 1)

#### 1.1 Create JSON Validation Script

**File**: `scripts/validation/validate-legacy-json.ts`

```typescript
import fs from 'fs/promises';
import { z } from 'zod';

// Schema for legacy data
const LegacyHouseSchema = z.object({
  house: z.object({
    house_number: z.string(),
    street_code: z.string(),
    property_type: z.enum(['COMPOUND', 'FLAT', 'DUPLEX', 'BUNGALOW']),
    rate_tier: z.enum(['STANDARD', 'PREMIUM', 'BASIC']),
  }),
  resident: z.object({
    primary_name: z.string(),
    aliases: z.array(z.string()).optional(),
  }),
  occupancy: z.object({
    move_in_month: z.string().regex(/^\d{4}-\d{2}$/),
    move_in_free_month: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    charge_start_month: z.string().regex(/^\d{4}-\d{2}$/),
    move_out_month: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    status: z.enum(['ACTIVE', 'MOVED_OUT', 'VACANT']),
  }),
  summary: z.object({
    total_expected: z.number(),
    total_paid: z.number(),
    net_position: z.number(),
    net_position_type: z.enum(['DEBT', 'CREDIT', 'SETTLED']),
    currency: z.literal('NGN'),
  }),
  transactions: z.array(z.object({
    year: z.number(),
    rate: z.number(),
    chargeable_months: z.number().min(0).max(12),
    expected: z.number(),
    payments: z.array(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      amount: z.number(),
    })),
    total_paid: z.number(),
    year_balance: z.number(),
    year_balance_type: z.enum(['DEBT', 'CREDIT', 'SETTLED']),
    notes: z.string().optional(),
  })),
});

const LegacyDataSchema = z.object({
  export_metadata: z.object({
    export_date: z.string(),
    source: z.string(),
    total_houses: z.number(),
    total_flagged: z.number(),
    data_period: z.string(),
  }),
  houses: z.array(LegacyHouseSchema),
});

export async function validateLegacyJSON(filePath: string) {
  console.log('🔍 Validating legacy JSON file...');

  // Read file
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(fileContent);

  // Validate schema
  const result = LegacyDataSchema.safeParse(data);

  if (!result.success) {
    console.error('❌ Validation failed:');
    console.error(result.error.errors);
    return { valid: false, errors: result.error.errors };
  }

  // Business rule validations
  const validationErrors = [];

  for (const [index, house] of data.houses.entries()) {
    // Check summary calculations
    const calculatedExpected = house.transactions.reduce((sum, t) => sum + t.expected, 0);
    const calculatedPaid = house.transactions.reduce((sum, t) => sum + t.total_paid, 0);

    if (Math.abs(calculatedExpected - house.summary.total_expected) > 1) {
      validationErrors.push({
        house: house.house.house_number,
        error: 'Summary total_expected does not match transaction totals',
        expected: calculatedExpected,
        actual: house.summary.total_expected,
      });
    }

    if (Math.abs(calculatedPaid - house.summary.total_paid) > 1) {
      validationErrors.push({
        house: house.house.house_number,
        error: 'Summary total_paid does not match transaction totals',
        expected: calculatedPaid,
        actual: house.summary.total_paid,
      });
    }

    // Check net_position calculation
    const calculatedNetPosition = calculatedPaid - calculatedExpected;
    if (Math.abs(calculatedNetPosition - house.summary.net_position) > 1) {
      validationErrors.push({
        house: house.house.house_number,
        error: 'Net position calculation mismatch',
        expected: calculatedNetPosition,
        actual: house.summary.net_position,
      });
    }
  }

  // Generate validation report
  const report = {
    valid: validationErrors.length === 0,
    metadata: data.export_metadata,
    totals: {
      houses: data.houses.length,
      activeHouses: data.houses.filter(h => h.occupancy.status === 'ACTIVE').length,
      movedOut: data.houses.filter(h => h.occupancy.status === 'MOVED_OUT').length,
      totalPayments: data.houses.reduce((sum, h) =>
        sum + h.transactions.reduce((s, t) => s + t.payments.length, 0), 0
      ),
    },
    validationErrors,
  };

  console.log('✅ Validation complete');
  console.log(`   Total houses: ${report.totals.houses}`);
  console.log(`   Active: ${report.totals.activeHouses}`);
  console.log(`   Moved out: ${report.totals.movedOut}`);
  console.log(`   Total payments: ${report.totals.totalPayments}`);
  console.log(`   Validation errors: ${validationErrors.length}`);

  return report;
}

// Run validation
if (require.main === module) {
  validateLegacyJSON('docs/legacydata/security_dues_import_main.json')
    .then(report => {
      if (!report.valid) {
        console.error('❌ Validation failed - fix errors before migration');
        process.exit(1);
      }
      console.log('✅ All validations passed');
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}
```

#### 1.2 Run Pre-Migration Checks

```bash
# Create validation script
npm install -D zod

# Run validation
npx tsx scripts/validation/validate-legacy-json.ts
```

**Expected Output:**
```
🔍 Validating legacy JSON file...
✅ Validation complete
   Total houses: 150
   Active: 138
   Moved out: 12
   Total payments: 1,247
   Validation errors: 0
✅ All validations passed
```

---

### Phase 2: Data Transformation (Week 2)

#### 2.1 Street Code Mapping

**Challenge**: Legacy uses street codes like "OJO.K", Residio uses full street names.

**Solution**: Create mapping table

**File**: `scripts/migration/mappings/street-mapping.json`

```json
{
  "OJO.K": "OjOjo Kadiri",
  "KOA": "Kayode Oni Animashaun",
  "GLB": "Gbolahon Bishi",
  "IBB": "Ibrahim Babatunde"
}
```

**Migration Script**: `scripts/migration/transform/map-streets.ts`

```typescript
import streetMapping from '../mappings/street-mapping.json';

export function mapStreetCode(streetCode: string): string {
  const mapped = streetMapping[streetCode];
  if (!mapped) {
    throw new Error(`Unknown street code: ${streetCode}`);
  }
  return mapped;
}

export function mapPropertyType(legacyType: string): string {
  const mapping = {
    'COMPOUND': 'Compound',
    'FLAT': 'Flat',
    'DUPLEX': 'Duplex',
    'BUNGALOW': 'Bungalow',
  };
  return mapping[legacyType] || legacyType;
}
```

#### 2.2 Transform Legacy Data to Residio Format

**File**: `scripts/migration/transform/legacy-to-residio.ts`

```typescript
import { mapStreetCode, mapPropertyType } from './map-streets';

interface ResidioResident {
  full_name: string;
  entity_type: 'individual' | 'corporate';
  account_status: 'active' | 'inactive';
  portal_access_enabled: boolean;
  payment_aliases: string[];
}

interface ResidioHouse {
  house_number: string;
  street_name: string;
  house_type: string;
  is_occupied: boolean;
}

interface ResidioPayment {
  resident_id: string;
  house_id: string;
  amount: number;
  payment_date: string;
  period_start: string;
  period_end: string;
  payment_method: 'cash' | 'transfer';
  status: 'paid' | 'pending';
}

interface ResidioInvoice {
  resident_id: string;
  house_id: string;
  billing_month: string;
  total_amount: number;
  status: 'paid' | 'pending' | 'overdue';
  due_date: string;
}

export function transformLegacyData(legacyData: any) {
  const residents: ResidioResident[] = [];
  const houses: ResidioHouse[] = [];
  const payments: ResidioPayment[] = [];
  const invoices: ResidioInvoice[] = [];
  const residentHouses: any[] = [];

  for (const legacyHouse of legacyData.houses) {
    // 1. Create Resident
    const resident: ResidioResident = {
      full_name: legacyHouse.resident.primary_name,
      entity_type: 'individual', // Detect corporate from name patterns
      account_status: legacyHouse.occupancy.status === 'ACTIVE' ? 'active' : 'inactive',
      portal_access_enabled: true,
      payment_aliases: legacyHouse.resident.aliases || [],
    };
    residents.push(resident);

    // 2. Create House
    const house: ResidioHouse = {
      house_number: legacyHouse.house.house_number,
      street_name: mapStreetCode(legacyHouse.house.street_code),
      house_type: mapPropertyType(legacyHouse.house.property_type),
      is_occupied: legacyHouse.occupancy.status === 'ACTIVE',
    };
    houses.push(house);

    // 3. Create Resident-House Assignment
    residentHouses.push({
      resident_name: resident.full_name,
      house_number: house.house_number,
      resident_role: 'resident_landlord', // Assume landlord for legacy data
      move_in_date: `${legacyHouse.occupancy.move_in_month}-01`,
      move_out_date: legacyHouse.occupancy.move_out_month
        ? `${legacyHouse.occupancy.move_out_month}-01`
        : null,
      is_active: legacyHouse.occupancy.status === 'ACTIVE',
    });

    // 4. Create Invoices and Payments
    for (const transaction of legacyHouse.transactions) {
      // Create monthly invoices for the year
      for (let month = 1; month <= transaction.chargeable_months; month++) {
        const billingMonth = `${transaction.year}-${String(month).padStart(2, '0')}`;

        invoices.push({
          resident_id: resident.full_name, // Will be resolved to ID later
          house_id: house.house_number,
          billing_month: billingMonth,
          total_amount: transaction.rate,
          status: 'pending', // Will be updated based on payments
          due_date: `${billingMonth}-15`, // 15th of each month
        });
      }

      // Create payments
      for (const payment of transaction.payments) {
        payments.push({
          resident_id: resident.full_name,
          house_id: house.house_number,
          amount: payment.amount,
          payment_date: `${payment.month}-01`,
          period_start: `${transaction.year}-01-01`,
          period_end: `${transaction.year}-12-31`,
          payment_method: 'transfer', // Assume transfer for historical
          status: 'paid',
        });
      }
    }
  }

  return {
    residents,
    houses,
    residentHouses,
    invoices,
    payments,
    metadata: legacyData.export_metadata,
  };
}
```

---

### Phase 3: Migration Execution (Week 3-4)

#### 3.1 Main Migration Script

**File**: `scripts/migration/import-legacy-data.ts`

```typescript
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { validateLegacyJSON } from '../validation/validate-legacy-json';
import { transformLegacyData } from './transform/legacy-to-residio';
import fs from 'fs/promises';

async function importLegacyData(jsonFilePath: string, dryRun = false) {
  console.log('🚀 Starting legacy data migration...');
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);

  // Step 1: Validate
  console.log('\n📋 Step 1: Validating legacy data...');
  const validationReport = await validateLegacyJSON(jsonFilePath);

  if (!validationReport.valid) {
    console.error('❌ Validation failed - aborting migration');
    return;
  }

  // Step 2: Load and transform
  console.log('\n🔄 Step 2: Transforming data...');
  const legacyData = JSON.parse(await fs.readFile(jsonFilePath, 'utf-8'));
  const transformed = transformLegacyData(legacyData);

  console.log(`   Residents: ${transformed.residents.length}`);
  console.log(`   Houses: ${transformed.houses.length}`);
  console.log(`   Payments: ${transformed.payments.length}`);
  console.log(`   Invoices: ${transformed.invoices.length}`);

  if (dryRun) {
    console.log('\n✅ Dry run complete - no data written');
    return transformed;
  }

  // Step 3: Import to database
  const supabase = createAdminSupabaseClient();

  // 3.1 Import Streets (deduplicated)
  console.log('\n📍 Step 3.1: Importing streets...');
  const uniqueStreets = [...new Set(transformed.houses.map(h => h.street_name))];

  for (const streetName of uniqueStreets) {
    const { error } = await supabase.from('streets').insert({
      name: streetName,
      short_name: streetName.substring(0, 3).toUpperCase(),
      is_active: true,
    }).select().single();

    if (error && !error.message.includes('duplicate')) {
      console.error(`   ❌ Error importing street ${streetName}:`, error.message);
    }
  }

  // 3.2 Import House Types (deduplicated)
  console.log('\n🏠 Step 3.2: Importing house types...');
  const uniqueTypes = [...new Set(transformed.houses.map(h => h.house_type))];

  for (const typeName of uniqueTypes) {
    const { error } = await supabase.from('house_types').insert({
      name: typeName,
      is_active: true,
    }).select().single();

    if (error && !error.message.includes('duplicate')) {
      console.error(`   ❌ Error importing house type ${typeName}:`, error.message);
    }
  }

  // 3.3 Import Houses
  console.log('\n🏡 Step 3.3: Importing houses...');
  const streetMap = new Map();
  const houseTypeMap = new Map();

  // Get street IDs
  const { data: streets } = await supabase.from('streets').select('id, name');
  streets?.forEach(s => streetMap.set(s.name, s.id));

  // Get house type IDs
  const { data: houseTypes } = await supabase.from('house_types').select('id, name');
  houseTypes?.forEach(ht => houseTypeMap.set(ht.name, ht.id));

  const houseMap = new Map();

  for (const house of transformed.houses) {
    const { data, error } = await supabase.from('houses').insert({
      house_number: house.house_number,
      street_id: streetMap.get(house.street_name),
      house_type_id: houseTypeMap.get(house.house_type),
      is_occupied: house.is_occupied,
    }).select().single();

    if (error) {
      console.error(`   ❌ Error importing house ${house.house_number}:`, error.message);
    } else {
      houseMap.set(house.house_number, data.id);
    }
  }

  // 3.4 Import Residents
  console.log('\n👥 Step 3.4: Importing residents...');
  const residentMap = new Map();

  for (const resident of transformed.residents) {
    const { data, error } = await supabase.from('residents').insert({
      full_name: resident.full_name,
      entity_type: resident.entity_type,
      account_status: resident.account_status,
      portal_access_enabled: resident.portal_access_enabled,
    }).select().single();

    if (error) {
      console.error(`   ❌ Error importing resident ${resident.full_name}:`, error.message);
    } else {
      residentMap.set(resident.full_name, data.id);

      // Import payment aliases
      for (const alias of resident.payment_aliases) {
        await supabase.from('resident_payment_aliases').insert({
          resident_id: data.id,
          alias_name: alias,
        });
      }
    }
  }

  // 3.5 Import Resident-House Assignments
  console.log('\n🔗 Step 3.5: Importing resident-house assignments...');

  for (const assignment of transformed.residentHouses) {
    const residentId = residentMap.get(assignment.resident_name);
    const houseId = houseMap.get(assignment.house_number);

    if (!residentId || !houseId) {
      console.error(`   ❌ Missing resident or house for assignment`);
      continue;
    }

    const { error } = await supabase.from('resident_houses').insert({
      resident_id: residentId,
      house_id: houseId,
      resident_role: assignment.resident_role,
      move_in_date: assignment.move_in_date,
      move_out_date: assignment.move_out_date,
      is_active: assignment.is_active,
      is_primary: true, // Assume primary for legacy
    });

    if (error) {
      console.error(`   ❌ Error creating assignment:`, error.message);
    }
  }

  // 3.6 Import Invoices
  console.log('\n📄 Step 3.6: Importing invoices...');

  for (const invoice of transformed.invoices) {
    const residentId = residentMap.get(invoice.resident_id);
    const houseId = houseMap.get(invoice.house_id);

    if (!residentId || !houseId) continue;

    await supabase.from('invoices').insert({
      resident_id: residentId,
      house_id: houseId,
      billing_month: invoice.billing_month,
      total_amount: invoice.total_amount,
      status: invoice.status,
      due_date: invoice.due_date,
    });
  }

  // 3.7 Import Payments
  console.log('\n💰 Step 3.7: Importing payments...');

  for (const payment of transformed.payments) {
    const residentId = residentMap.get(payment.resident_id);
    const houseId = houseMap.get(payment.house_id);

    if (!residentId || !houseId) continue;

    await supabase.from('payment_records').insert({
      resident_id: residentId,
      house_id: houseId,
      amount: payment.amount,
      payment_date: payment.payment_date,
      period_start: payment.period_start,
      period_end: payment.period_end,
      payment_method: payment.payment_method,
      status: payment.status,
    });
  }

  console.log('\n✅ Migration complete!');

  // Generate summary report
  const report = {
    timestamp: new Date().toISOString(),
    imported: {
      residents: transformed.residents.length,
      houses: transformed.houses.length,
      payments: transformed.payments.length,
      invoices: transformed.invoices.length,
    },
  };

  await fs.writeFile(
    `docs/migration/import-report-${Date.now()}.json`,
    JSON.stringify(report, null, 2)
  );

  return report;
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filePath = args.find(arg => !arg.startsWith('--')) ||
    'docs/legacydata/security_dues_import_main.json';

  importLegacyData(filePath, dryRun)
    .then(report => {
      console.log('\n📊 Final Report:');
      console.log(JSON.stringify(report, null, 2));
    })
    .catch(err => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
```

---

### Phase 4: Post-Migration Validation (Week 4)

#### 4.1 Reconciliation Script

**File**: `scripts/validation/post-migration-reconciliation.ts`

```typescript
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import fs from 'fs/promises';

export async function reconcileMigration(legacyDataPath: string) {
  console.log('🔍 Starting post-migration reconciliation...');

  const supabase = createAdminSupabaseClient();
  const legacyData = JSON.parse(await fs.readFile(legacyDataPath, 'utf-8'));

  // 1. Count verification
  console.log('\n📊 Step 1: Count Verification');

  const { count: residentCount } = await supabase
    .from('residents')
    .select('*', { count: 'exact', head: true });

  const { count: houseCount } = await supabase
    .from('houses')
    .select('*', { count: 'exact', head: true });

  const legacyHouseCount = legacyData.houses.length;
  const legacyResidentCount = legacyData.houses.length; // 1:1 in legacy

  console.log(`   Residents: ${residentCount} (expected: ${legacyResidentCount}) ` +
    (residentCount === legacyResidentCount ? '✅' : '❌'));
  console.log(`   Houses: ${houseCount} (expected: ${legacyHouseCount}) ` +
    (houseCount === legacyHouseCount ? '✅' : '❌'));

  // 2. Financial reconciliation
  console.log('\n💰 Step 2: Financial Reconciliation');

  const legacyTotalPaid = legacyData.houses.reduce(
    (sum, h) => sum + h.summary.total_paid, 0
  );

  const { data: payments } = await supabase
    .from('payment_records')
    .select('amount');

  const dbTotalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;

  const difference = Math.abs(legacyTotalPaid - dbTotalPaid);
  console.log(`   Legacy total paid: ₦${legacyTotalPaid.toLocaleString()}`);
  console.log(`   Database total paid: ₦${dbTotalPaid.toLocaleString()}`);
  console.log(`   Difference: ₦${difference.toLocaleString()} ` +
    (difference <= 100 ? '✅' : '❌'));

  // 3. Spot check (10 random houses)
  console.log('\n🎯 Step 3: Spot Check (10 Random Houses)');

  const randomHouses = legacyData.houses
    .sort(() => Math.random() - 0.5)
    .slice(0, 10);

  let spotCheckPassed = 0;

  for (const legacyHouse of randomHouses) {
    const { data: house } = await supabase
      .from('houses')
      .select(`
        *,
        resident_houses!inner(
          resident:residents(full_name)
        )
      `)
      .eq('house_number', legacyHouse.house.house_number)
      .single();

    if (!house) {
      console.log(`   ❌ House ${legacyHouse.house.house_number} not found`);
      continue;
    }

    const dbResidentName = house.resident_houses[0]?.resident?.full_name;
    const legacyResidentName = legacyHouse.resident.primary_name;

    if (dbResidentName === legacyResidentName) {
      spotCheckPassed++;
      console.log(`   ✅ House ${legacyHouse.house.house_number}: ${dbResidentName}`);
    } else {
      console.log(`   ❌ House ${legacyHouse.house.house_number}: ` +
        `Expected ${legacyResidentName}, got ${dbResidentName}`);
    }
  }

  console.log(`\n   Spot check pass rate: ${spotCheckPassed}/10 ` +
    (spotCheckPassed >= 9 ? '✅' : '❌'));

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    counts: {
      residents: { expected: legacyResidentCount, actual: residentCount, match: residentCount === legacyResidentCount },
      houses: { expected: legacyHouseCount, actual: houseCount, match: houseCount === legacyHouseCount },
    },
    financial: {
      expected: legacyTotalPaid,
      actual: dbTotalPaid,
      difference,
      withinTolerance: difference <= 100,
    },
    spotCheck: {
      passed: spotCheckPassed,
      total: 10,
      passRate: (spotCheckPassed / 10) * 100,
    },
    overallStatus: (
      residentCount === legacyResidentCount &&
      houseCount === legacyHouseCount &&
      difference <= 100 &&
      spotCheckPassed >= 9
    ) ? 'PASSED' : 'FAILED',
  };

  console.log('\n📋 Reconciliation Report:');
  console.log(JSON.stringify(report, null, 2));

  await fs.writeFile(
    `docs/migration/reconciliation-${Date.now()}.json`,
    JSON.stringify(report, null, 2)
  );

  return report;
}

// CLI execution
if (require.main === module) {
  reconcileMigration('docs/legacydata/security_dues_import_main.json')
    .then(report => {
      if (report.overallStatus === 'PASSED') {
        console.log('\n✅ Migration PASSED all checks');
        process.exit(0);
      } else {
        console.log('\n❌ Migration FAILED - review discrepancies');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}
```

---

## Execution Checklist

### Pre-Migration
- [ ] Run `validate-legacy-json.ts` - ensure no schema errors
- [ ] Create street mapping file with all legacy street codes
- [ ] Review flagged records (12 houses marked in metadata)
- [ ] Create database snapshot for rollback

### Migration Day
- [ ] Set maintenance mode: `UPDATE system_settings SET value = 'true' WHERE key = 'maintenance_mode'`
- [ ] Run dry-run: `npx tsx scripts/migration/import-legacy-data.ts --dry-run`
- [ ] Review dry-run output
- [ ] Execute production import: `npx tsx scripts/migration/import-legacy-data.ts`
- [ ] Monitor for errors

### Post-Migration
- [ ] Run reconciliation: `npx tsx scripts/validation/post-migration-reconciliation.ts`
- [ ] Review reconciliation report
- [ ] Spot-check 20 random residents manually
- [ ] Disable maintenance mode if all checks pass
- [ ] Monitor for 24 hours

---

## Rollback Procedure

If critical issues are found:

```bash
# 1. Enable maintenance mode
psql -c "UPDATE system_settings SET value = 'true' WHERE key = 'maintenance_mode'"

# 2. Restore from snapshot
pg_restore -d residio < backup-YYYYMMDD-HHMMSS.dump

# 3. Verify restoration
psql -c "SELECT COUNT(*) FROM residents"

# 4. Notify stakeholders
# 5. Review and fix migration scripts
# 6. Schedule re-migration
```

---

## Next Steps

1. **Week 1**: Create and test validation scripts
2. **Week 2**: Build transformation logic, test with sample data
3. **Week 3**: Dry run on staging environment
4. **Week 4**: Production migration with stakeholder approval
5. **Week 5**: Post-migration monitoring and fixes

---

**Document Status**: Ready for Implementation
**Owner**: Development Team
**Last Updated**: 2026-01-08
