class DelalaTransaction {
  final String id;
  final String accountId;
  final String brokerId;
  final String? storeId;
  final String transactionType; // goods_given, goods_returned, money_received, money_paid, direct_sale, commission, adjustment
  final String description;
  final String? productId;
  final double? quantity;
  final String? unit;
  final double? unitPrice;
  final double amount;
  final int accountingEffect; // +1 or -1
  final String transactionDate;
  final String? paymentMethod;
  final String? referenceNumber;
  final String? notes;
  final String? createdBy;
  final String createdAt;
  final String updatedAt;

  DelalaTransaction({
    required this.id,
    required this.accountId,
    required this.brokerId,
    this.storeId,
    required this.transactionType,
    required this.description,
    this.productId,
    this.quantity,
    this.unit,
    this.unitPrice,
    required this.amount,
    required this.accountingEffect,
    required this.transactionDate,
    this.paymentMethod,
    this.referenceNumber,
    this.notes,
    this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });

  double get rowTotal => amount * accountingEffect;

  factory DelalaTransaction.fromMap(Map<String, dynamic> map) {
    return DelalaTransaction(
      id: map['id']?.toString() ?? '',
      accountId: map['account_id']?.toString() ?? '',
      brokerId: map['broker_id']?.toString() ?? '',
      storeId: map['store_id']?.toString(),
      transactionType: map['transaction_type']?.toString() ?? 'goods_given',
      description: map['description']?.toString() ?? '',
      productId: map['product_id']?.toString(),
      quantity: double.tryParse(map['quantity']?.toString() ?? ''),
      unit: map['unit']?.toString(),
      unitPrice: double.tryParse(map['unit_price']?.toString() ?? ''),
      amount: double.tryParse(map['amount']?.toString() ?? '0.0') ?? 0.0,
      accountingEffect: int.tryParse(map['accounting_effect']?.toString() ?? '1') ?? 1,
      transactionDate: map['transaction_date']?.toString() ?? '',
      paymentMethod: map['payment_method']?.toString(),
      referenceNumber: map['reference_number']?.toString(),
      notes: map['notes']?.toString(),
      createdBy: map['created_by']?.toString(),
      createdAt: map['created_at']?.toString() ?? '',
      updatedAt: map['updated_at']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toMap() => {
    'id': id,
    'account_id': accountId,
    'broker_id': brokerId,
    'store_id': storeId,
    'transaction_type': transactionType,
    'description': description,
    'product_id': productId,
    'quantity': quantity,
    'unit': unit,
    'unit_price': unitPrice,
    'amount': amount,
    'accounting_effect': accountingEffect,
    'transaction_date': transactionDate,
    'payment_method': paymentMethod,
    'reference_number': referenceNumber,
    'notes': notes,
    'created_by': createdBy,
    'created_at': createdAt,
    'updated_at': updatedAt,
  };
}

