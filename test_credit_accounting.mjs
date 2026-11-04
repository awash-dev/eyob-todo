import { calculateAccountBalances, validateTransaction, buildTransactionLineItem } from './src/lib/creditAccounting.ts';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('====================================================');
console.log('🧪 TESTING CUSTOMER & SUPPLIER CREDIT LOGIC');
console.log('====================================================\n');

// --------------------------------------------------------------------------
// TEST 1: Customer Credit & Payments (Ahmed Scenario)
// --------------------------------------------------------------------------
console.log('--- Test 1: Customer Ahmed Scenario (10,000 + 5,000 - 5,000 - 3,000 = 7,000) ---');

let ahmedItems = [];

// 1. First credit sale: Paper 10,000 ETB
const sale1 = buildTransactionLineItem({
  type: 'customer',
  partyName: 'Ahmed',
  transactionCategory: 'credit_sale',
  amount: 10000,
  description: 'Paper',
  date: '2026-11-01',
});
ahmedItems.push(sale1);
let stats = calculateAccountBalances('customer', ahmedItems);
assert(stats.outstanding === 10000, `Step 1: Ahmed outstanding is 10,000 ETB (got ${stats.outstanding})`);
assert(stats.totalCreditSalesOrPurchases === 10000, `Step 1: Total credit sales is 10,000 ETB`);
assert(stats.totalPayments === 0, `Step 1: Total payments is 0 ETB`);

// 2. Second credit sale: Wire 5,000 ETB
const sale2 = buildTransactionLineItem({
  type: 'customer',
  partyName: 'Ahmed',
  transactionCategory: 'credit_sale',
  amount: 5000,
  description: 'Wire',
  date: '2026-11-02',
});
ahmedItems.push(sale2);
stats = calculateAccountBalances('customer', ahmedItems);
assert(stats.outstanding === 15000, `Step 2: Ahmed outstanding is 15,000 ETB (got ${stats.outstanding})`);
assert(stats.totalCreditSalesOrPurchases === 15000, `Step 2: Total credit sales is 15,000 ETB`);

// 3. First payment: 5,000 ETB
const pay1 = buildTransactionLineItem({
  type: 'customer',
  partyName: 'Ahmed',
  transactionCategory: 'payment_received',
  amount: 5000,
  description: 'First payment received',
  paymentMethod: 'CBE',
  date: '2026-11-03',
});
ahmedItems.push(pay1);
stats = calculateAccountBalances('customer', ahmedItems);
assert(stats.outstanding === 10000, `Step 3: Ahmed outstanding is 10,000 ETB (got ${stats.outstanding})`);
assert(stats.totalPayments === 5000, `Step 3: Total payments is 5,000 ETB`);

// 4. Second payment: 3,000 ETB
const pay2 = buildTransactionLineItem({
  type: 'customer',
  partyName: 'Ahmed',
  transactionCategory: 'payment_received',
  amount: 3000,
  description: 'Second payment received',
  paymentMethod: 'Telebirr',
  date: '2026-11-04',
});
ahmedItems.push(pay2);
stats = calculateAccountBalances('customer', ahmedItems);
assert(stats.outstanding === 7000, `Step 4: Ahmed remaining debt is 7,000 ETB (got ${stats.outstanding})`);
assert(stats.totalPayments === 8000, `Step 4: Total payments is 8,000 ETB`);

// --------------------------------------------------------------------------
// TEST 2: Supplier Credit & Payments (Supplier A Scenario)
// --------------------------------------------------------------------------
console.log('\n--- Test 2: Supplier A Scenario (20,000 + 10,000 - 10,000 - 5,000 = 15,000) ---');

let suppAItems = [];

// 1. First purchase: Paper 20,000 ETB
const purch1 = buildTransactionLineItem({
  type: 'supplier',
  partyName: 'Supplier A',
  transactionCategory: 'credit_purchase',
  amount: 20000,
  description: 'Paper',
  date: '2026-11-01',
});
suppAItems.push(purch1);
stats = calculateAccountBalances('supplier', suppAItems);
assert(stats.outstanding === 20000, `Step 1: Supplier A payable is 20,000 ETB (got ${stats.outstanding})`);

// 2. Second purchase: Wire 10,000 ETB
const purch2 = buildTransactionLineItem({
  type: 'supplier',
  partyName: 'Supplier A',
  transactionCategory: 'credit_purchase',
  amount: 10000,
  description: 'Wire',
  date: '2026-11-02',
});
suppAItems.push(purch2);
stats = calculateAccountBalances('supplier', suppAItems);
assert(stats.outstanding === 30000, `Step 2: Supplier A payable is 30,000 ETB (got ${stats.outstanding})`);

// 3. First installment payment: 10,000 ETB
const suppPay1 = buildTransactionLineItem({
  type: 'supplier',
  partyName: 'Supplier A',
  transactionCategory: 'payment_made',
  amount: 10000,
  description: 'First installment payment',
  paymentMethod: 'Awash Bank',
  date: '2026-11-03',
});
suppAItems.push(suppPay1);
stats = calculateAccountBalances('supplier', suppAItems);
assert(stats.outstanding === 20000, `Step 3: Supplier A payable is 20,000 ETB (got ${stats.outstanding})`);

// 4. Second installment payment: 5,000 ETB
const suppPay2 = buildTransactionLineItem({
  type: 'supplier',
  partyName: 'Supplier A',
  transactionCategory: 'payment_made',
  amount: 5000,
  description: 'Second installment payment',
  paymentMethod: 'Telebirr',
  date: '2026-11-04',
});
suppAItems.push(suppPay2);
stats = calculateAccountBalances('supplier', suppAItems);
assert(stats.outstanding === 15000, `Step 4: Supplier A remaining payable is 15,000 ETB (got ${stats.outstanding})`);
assert(stats.totalPayments === 15000, `Step 4: Total payments made is 15,000 ETB`);

// --------------------------------------------------------------------------
// TEST 3: Customer Advance & Allocation
// --------------------------------------------------------------------------
console.log('\n--- Test 3: Customer Advance & Allocation (5,000 advance, 3,000 applied -> 2,000 remaining) ---');

let advCustItems = [];

// Customer owes 10,000
advCustItems.push(buildTransactionLineItem({
  type: 'customer',
  partyName: 'Customer X',
  transactionCategory: 'credit_sale',
  amount: 10000,
  description: 'Goods on credit',
  date: '2026-11-01',
}));

// Customer makes advance deposit of 5,000
const custAdv = buildTransactionLineItem({
  type: 'customer',
  partyName: 'Customer X',
  transactionCategory: 'advance_received',
  amount: 5000,
  description: 'Advance deposit for upcoming orders',
  date: '2026-11-02',
});
advCustItems.push(custAdv);

stats = calculateAccountBalances('customer', advCustItems);
assert(stats.outstanding === 10000, `Advance deposit does NOT reduce debt until allocated (outstanding is 10,000 ETB)`);
assert(stats.unappliedAdvance === 5000, `Available advance deposit is 5,000 ETB`);

// Allocate 3,000 of advance to debt
const custAlloc = buildTransactionLineItem({
  type: 'customer',
  partyName: 'Customer X',
  transactionCategory: 'allocate_advance',
  amount: 3000,
  description: 'Applied advance deposit to invoice',
  date: '2026-11-03',
});
advCustItems.push(custAlloc);

stats = calculateAccountBalances('customer', advCustItems);
assert(stats.unappliedAdvance === 2000, `Remaining advance deposit is 2,000 ETB (got ${stats.unappliedAdvance})`);
assert(stats.outstanding === 7000, `Debt reduced by allocated amount: 10,000 - 3,000 = 7,000 ETB (got ${stats.outstanding})`);

// --------------------------------------------------------------------------
// TEST 4: Supplier Advance & Allocation
// --------------------------------------------------------------------------
console.log('\n--- Test 4: Supplier Advance & Allocation (5,000 advance, 3,000 applied -> 2,000 remaining) ---');

let advSuppItems = [];

// Supplier purchase 20,000
advSuppItems.push(buildTransactionLineItem({
  type: 'supplier',
  partyName: 'Supplier Y',
  transactionCategory: 'credit_purchase',
  amount: 20000,
  description: 'Initial purchase',
  date: '2026-11-01',
}));

// Store pays advance to supplier: 5,000
const suppAdv = buildTransactionLineItem({
  type: 'supplier',
  partyName: 'Supplier Y',
  transactionCategory: 'advance_paid',
  amount: 5000,
  description: 'Advance payment to factory',
  date: '2026-11-02',
});
advSuppItems.push(suppAdv);

stats = calculateAccountBalances('supplier', advSuppItems);
assert(stats.outstanding === 20000, `Supplier advance does not reduce payable until allocated (outstanding is 20,000 ETB)`);
assert(stats.unappliedAdvance === 5000, `Available supplier advance is 5,000 ETB`);

// Allocate 3,000 of supplier advance to purchase
const suppAlloc = buildTransactionLineItem({
  type: 'supplier',
  partyName: 'Supplier Y',
  transactionCategory: 'allocate_advance',
  amount: 3000,
  description: 'Applied advance to purchase bill',
  date: '2026-11-03',
});
advSuppItems.push(suppAlloc);

stats = calculateAccountBalances('supplier', advSuppItems);
assert(stats.unappliedAdvance === 2000, `Remaining supplier advance is 2,000 ETB (got ${stats.unappliedAdvance})`);
assert(stats.outstanding === 17000, `Payable reduced by allocated amount: 20,000 - 3,000 = 17,000 ETB (got ${stats.outstanding})`);

// --------------------------------------------------------------------------
// TEST 5: Business Rule Validation
// --------------------------------------------------------------------------
console.log('\n--- Test 5: Transaction Validation & Accounting Guards ---');

// Zero or negative amount rejected
const invalidZero = validateTransaction({
  type: 'customer',
  partyName: 'Ahmed',
  transactionCategory: 'credit_sale',
  amount: 0,
  description: 'Zero amount',
  date: '2026-11-04',
}, { totalCreditSalesOrPurchases: 100, totalPayments: 0, totalAdvances: 0, totalAdvancesAllocated: 0, unappliedAdvance: 0, outstanding: 100 });
assert(!invalidZero.valid, 'Zero or negative amount is correctly rejected');

// Overpayment rejected without advance
const invalidOverpay = validateTransaction({
  type: 'customer',
  partyName: 'Ahmed',
  transactionCategory: 'payment_received',
  amount: 15000,
  description: 'Overpayment',
  date: '2026-11-04',
}, { totalCreditSalesOrPurchases: 10000, totalPayments: 0, totalAdvances: 0, totalAdvancesAllocated: 0, unappliedAdvance: 0, outstanding: 10000 });
assert(!invalidOverpay.valid, 'Payment exceeding outstanding balance is correctly rejected with informative message');

// Over-allocation of advance rejected
const invalidAlloc = validateTransaction({
  type: 'customer',
  partyName: 'Ahmed',
  transactionCategory: 'allocate_advance',
  amount: 6000,
  description: 'Over allocation',
  date: '2026-11-04',
}, { totalCreditSalesOrPurchases: 10000, totalPayments: 0, totalAdvances: 5000, totalAdvancesAllocated: 0, unappliedAdvance: 5000, outstanding: 10000 });
assert(!invalidAlloc.valid, 'Allocation exceeding available advance is correctly rejected');

console.log('\n====================================================');
console.log('🎉 ALL ACCEPTANCE CRITERIA VERIFIED 100% SUCCESSFULLY');
console.log('====================================================\n');

