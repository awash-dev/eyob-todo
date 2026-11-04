import {
  generateLedgerTableEntries,
  calculateAccountBalances,
  validateTransaction,
  buildTransactionLineItem,
  isDemoRecord,
} from './src/lib/creditAccounting.ts';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('================================================================');
console.log('🧪 VERIFYING MERKATO LEDGER – CUSTOMER & SUPPLIER ACCOUNTING');
console.log('================================================================\n');

// --------------------------------------------------------------------------
// SCENARIO 1: CUSTOMER CREDIT & PAYMENT (Tests 1-5)
// --------------------------------------------------------------------------
console.log('--- SCENARIO 1: Customer Credit & Payment (Ahmed) ---');

let customerItems = [];

// 1. Customer buys 10 pieces at ETB 2 each.
const saleItem = buildTransactionLineItem({
  type: 'customer',
  partyName: 'Ahmed',
  transactionCategory: 'credit_sale',
  amount: 20,
  quantity: 10,
  unitPrice: 2,
  description: 'Paper',
  date: '2026-11-01',
});
customerItems.push(saleItem);

let custData = generateLedgerTableEntries('customer', customerItems);
assert(custData.entries.length === 1, 'Step 1: 1 transaction entry exists');
assert(custData.entries[0].quantity === 10, 'Step 1: Quantity is 10');
assert(custData.entries[0].unitPrice === 2, 'Step 1: Unit Price is ETB 2');
assert(custData.entries[0].totalAmount === 20, 'Step 1: Total Amount is ETB 20 (10 × 2)');
assert(custData.entries[0].debit === 20, 'Step 2: Total debit = ETB 20');
assert(custData.entries[0].credit === 0, 'Step 2: Credit = ETB 0');
assert(custData.entries[0].balance === 20, 'Step 2: Running balance = ETB 20');

// 3. Customer pays ETB 10 through CBE.
const paymentItem = buildTransactionLineItem({
  type: 'customer',
  partyName: 'Ahmed',
  transactionCategory: 'payment_received',
  amount: 10,
  description: 'Payment',
  paymentMethod: 'CBE',
  date: '2026-11-02',
});
customerItems.push(paymentItem);

custData = generateLedgerTableEntries('customer', customerItems);
assert(custData.entries.length === 2, 'Step 3: 2 transaction entries exist');

const payRow = custData.entries[1];
assert(payRow.quantity === null, 'Step 3: Payment row quantity is null (displays as dash)');
assert(payRow.unitPrice === null, 'Step 3: Payment row unit price is null (displays as dash)');
assert(payRow.totalAmount === 10, 'Step 3: Payment total amount = ETB 10');
assert(payRow.paymentMethod === 'CBE', 'Step 3: Payment method = CBE');
assert(payRow.debit === 0, 'Step 3: Payment row debit = ETB 0');
assert(payRow.credit === 10, 'Step 4: Credit = ETB 10');
assert(payRow.balance === 10, 'Step 4: Running balance after payment = ETB 10 (20 - 10)');

assert(custData.totalDebit === 20, 'Step 5: Total customer debit = ETB 20');
assert(custData.totalCredit === 10, 'Step 5: Total customer credit = ETB 10');
assert(custData.outstandingBalance === 10, 'Step 5: Customer outstanding balance = ETB 10 (20 - 10)');

// --------------------------------------------------------------------------
// SCENARIO 2: SUPPLIER CREDIT & PAYMENT (Tests 6-9)
// --------------------------------------------------------------------------
console.log('\n--- SCENARIO 2: Supplier Credit & Payment (Supplier A) ---');

let supplierItems = [];

// 6. Supplier delivers 100 pieces at ETB 2 each.
const purchaseItem = buildTransactionLineItem({
  type: 'supplier',
  partyName: 'Supplier A',
  transactionCategory: 'credit_purchase',
  amount: 200,
  quantity: 100,
  unitPrice: 2,
  description: 'Paper',
  date: '2026-11-01',
});
supplierItems.push(purchaseItem);

let suppData = generateLedgerTableEntries('supplier', supplierItems);
assert(suppData.entries.length === 1, 'Step 6: 1 transaction entry exists');
assert(suppData.entries[0].quantity === 100, 'Step 6: Quantity is 100 pieces');
assert(suppData.entries[0].unitPrice === 2, 'Step 6: Unit Price is ETB 2');
assert(suppData.entries[0].totalAmount === 200, 'Step 6: Total Amount is ETB 200 (100 × 2)');
assert(suppData.entries[0].debit === 0, 'Step 7: Debit is ETB 0');
assert(suppData.entries[0].credit === 200, 'Step 7: Credit (payable increase) = ETB 200');
assert(suppData.entries[0].balance === 200, 'Step 7: Supplier payable = ETB 200');

// 8. Pay supplier ETB 50 through Awash Bank.
const suppPayItem = buildTransactionLineItem({
  type: 'supplier',
  partyName: 'Supplier A',
  transactionCategory: 'payment_made',
  amount: 50,
  description: 'Payment',
  paymentMethod: 'Awash Bank',
  date: '2026-11-02',
});
supplierItems.push(suppPayItem);

suppData = generateLedgerTableEntries('supplier', supplierItems);
assert(suppData.entries.length === 2, 'Step 8: 2 transaction entries exist');

const suppPayRow = suppData.entries[1];
assert(suppPayRow.quantity === null, 'Step 8: Payment quantity is null (displays as dash)');
assert(suppPayRow.unitPrice === null, 'Step 8: Payment unit price is null (displays as dash)');
assert(suppPayRow.totalAmount === 50, 'Step 8: Total amount = ETB 50');
assert(suppPayRow.paymentMethod === 'Awash Bank', 'Step 8: Payment method = Awash Bank');
assert(suppPayRow.debit === 50, 'Step 8: Payment debit = ETB 50');
assert(suppPayRow.credit === 0, 'Step 8: Payment credit = ETB 0');
assert(suppPayRow.balance === 150, 'Step 9: Supplier outstanding = ETB 150 (200 - 50)');

assert(suppData.totalDebit === 50, 'Step 9: Total supplier payments (debit) = ETB 50');
assert(suppData.totalCredit === 200, 'Step 9: Total supplier purchases (credit) = ETB 200');
assert(suppData.outstandingBalance === 150, 'Step 9: Supplier outstanding payable = ETB 150 (200 - 50)');

// --------------------------------------------------------------------------
// SCENARIO 3: DEMO RECORD DETECTION & HISTORICAL FIXES
// --------------------------------------------------------------------------
console.log('\n--- SCENARIO 3: Demo Record Detection & Historical Fixes ---');

assert(isDemoRecord('sample') === true, 'Detected "sample" as a confirmed demo record');
assert(isDemoRecord('Sample Customer') === true, 'Detected "Sample Customer" as demo');
assert(isDemoRecord('Alex Johnson') === false, 'Preserved real record "Alex Johnson" as NOT demo');
assert(isDemoRecord('Awash Cable Factory') === false, 'Preserved real record "Awash Cable Factory" as NOT demo');

// Historical record check: Alex Johnson
const alexItems = [
  { id: '1', name: '2.5 BMT Wire', quantity: 1, unitPrice: 13450, sign: '+', date: '2026-11-02' },
  { id: '2', name: 'Returned Wire', quantity: 1, unitPrice: 2000, sign: '-', date: '2026-11-02', customType: 'Return' },
  { id: '3', name: 'Cash Payment Received', quantity: null, unitPrice: null, amount: 5000, sign: '-', date: '2026-11-02', isPayment: true, bank: 'Telebirr' },
];
const alexData = generateLedgerTableEntries('customer', alexItems);
assert(alexData.entries[0].debit === 13450, 'Alex Johnson: Item 1 debit is 13,450 ETB');
assert(alexData.entries[1].credit === 2000, 'Alex Johnson: Return credit is 2,000 ETB');
assert(alexData.entries[2].credit === 5000, 'Alex Johnson: Payment credit is 5,000 ETB');
assert(alexData.outstandingBalance === 6450, 'Alex Johnson: Outstanding balance is 6,450 ETB (13,450 - 2,000 - 5,000)');

// --------------------------------------------------------------------------
// SCENARIO 4: BROKER CREDIT & PAYMENT
// --------------------------------------------------------------------------
console.log('\n--- SCENARIO 4: Broker Credit & Payment (Broker Kebede) ---');

let brokerItems = [];

// 1. Broker Kebede mediates / takes 50 pieces at ETB 10 each.
const brokerDeal = buildTransactionLineItem({
  type: 'delala',
  partyName: 'Kebede',
  transactionCategory: 'credit_sale',
  amount: 500,
  quantity: 50,
  unitPrice: 10,
  description: 'Cable deal',
  date: '2026-11-03',
});
brokerItems.push(brokerDeal);

let brokerData = generateLedgerTableEntries('delala', brokerItems);
assert(brokerData.entries.length === 1, 'Broker Step 1: 1 transaction entry exists');
assert(brokerData.entries[0].quantity === 50, 'Broker Step 1: Quantity is 50');
assert(brokerData.entries[0].unitPrice === 10, 'Broker Step 1: Unit Price is ETB 10');
assert(brokerData.entries[0].totalAmount === 500, 'Broker Step 1: Total Amount is ETB 500');
assert(brokerData.entries[0].debit === 500, 'Broker Step 1: Debit = ETB 500');
assert(brokerData.entries[0].credit === 0, 'Broker Step 1: Credit = ETB 0');
assert(brokerData.entries[0].balance === 500, 'Broker Step 1: Running balance = ETB 500');

// 2. Broker Kebede makes a payment of ETB 200 via Telebirr.
const brokerPayment = buildTransactionLineItem({
  type: 'delala',
  partyName: 'Kebede',
  transactionCategory: 'payment_received',
  amount: 200,
  description: 'Telebirr Payment',
  paymentMethod: 'Telebirr',
  date: '2026-11-04',
});
brokerItems.push(brokerPayment);

brokerData = generateLedgerTableEntries('delala', brokerItems);
assert(brokerData.entries.length === 2, 'Broker Step 2: 2 transactions recorded');
assert(brokerData.entries[1].quantity === null, 'Broker Step 2: Payment quantity is null');
assert(brokerData.entries[1].unitPrice === null, 'Broker Step 2: Payment unit price is null');
assert(brokerData.entries[1].totalAmount === 200, 'Broker Step 2: Total payment is ETB 200');
assert(brokerData.entries[1].debit === 0, 'Broker Step 2: Payment debit is 0');
assert(brokerData.entries[1].credit === 200, 'Broker Step 2: Payment credit is ETB 200');
assert(brokerData.entries[1].balance === 300, 'Broker Step 2: Outstanding balance = ETB 300 (500 - 200)');
assert(brokerData.totalDebit === 500, 'Broker Step 2: Total debit = ETB 500');
assert(brokerData.totalCredit === 200, 'Broker Step 2: Total credit = ETB 200');
assert(brokerData.outstandingBalance === 300, 'Broker Step 2: Outstanding broker balance = ETB 300');

console.log('\n================================================================');
console.log('🎉 ALL 14 TESTS VERIFIED 100% SUCCESSFULLY WITH ZERO ERRORS');
console.log('================================================================\n');

