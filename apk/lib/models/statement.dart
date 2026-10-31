class StatementEntry {
  final String date;
  final String description;
  final double quantity;
  final double unitPrice;
  final double debit;
  final double credit;
  final double balance;
  final String? bank;
  final String? paymentMethod;
  final String? reference;
  final String? notes;

  StatementEntry({
    required this.date,
    required this.description,
    required this.quantity,
    required this.unitPrice,
    required this.debit,
    required this.credit,
    required this.balance,
    this.bank,
    this.paymentMethod,
    this.reference,
    this.notes,
  });

  factory StatementEntry.fromJson(Map<String, dynamic> json) {
    return StatementEntry(
      date: json['date']?.toString() ?? '',
      description: json['description']?.toString() ?? '',
      quantity: (json['quantity'] as num?)?.toDouble() ?? 0.0,
      unitPrice: (json['unitPrice'] as num?)?.toDouble() ?? 0.0,
      debit: (json['debit'] as num?)?.toDouble() ?? 0.0,
      credit: (json['credit'] as num?)?.toDouble() ?? 0.0,
      balance: (json['balance'] as num?)?.toDouble() ?? 0.0,
      bank: json['bank']?.toString(),
      paymentMethod: json['paymentMethod']?.toString(),
      reference: json['reference']?.toString(),
      notes: json['notes']?.toString(),
    );
  }
}

class StatementPayment {
  final String date;
  final double amount;
  final String? paymentMethod;
  final String? reference;
  final String? notes;
  final String description;

  StatementPayment({
    required this.date,
    required this.amount,
    this.paymentMethod,
    this.reference,
    this.notes,
    required this.description,
  });

  factory StatementPayment.fromJson(Map<String, dynamic> json) {
    return StatementPayment(
      date: json['date']?.toString() ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      paymentMethod: json['paymentMethod']?.toString(),
      reference: json['reference']?.toString(),
      notes: json['notes']?.toString(),
      description: json['description']?.toString() ?? '',
    );
  }
}

class StatementTotals {
  final double totalDebit;
  final double totalCredit;
  final double outstanding;
  final int entryCount;

  StatementTotals({
    required this.totalDebit,
    required this.totalCredit,
    required this.outstanding,
    required this.entryCount,
  });

  factory StatementTotals.fromJson(Map<String, dynamic> json) {
    return StatementTotals(
      totalDebit: (json['totalDebit'] as num?)?.toDouble() ?? 0.0,
      totalCredit: (json['totalCredit'] as num?)?.toDouble() ?? 0.0,
      outstanding: (json['outstanding'] as num?)?.toDouble() ?? 0.0,
      entryCount: (json['entryCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class AccountStatement {
  final String accountName;
  final String accountType; // 'customer' | 'supplier'
  final String? shopId;
  final String shopName;
  final List<StatementEntry> entries;
  final List<StatementPayment> payments;
  final StatementTotals totals;

  AccountStatement({
    required this.accountName,
    required this.accountType,
    this.shopId,
    required this.shopName,
    required this.entries,
    required this.payments,
    required this.totals,
  });

  factory AccountStatement.fromJson(Map<String, dynamic> json) {
    final rawEntries = json['entries'] as List? ?? [];
    final rawPayments = json['payments'] as List? ?? [];

    return AccountStatement(
      accountName: json['accountName']?.toString() ?? '',
      accountType: json['accountType']?.toString() ?? 'customer',
      shopId: json['shopId']?.toString(),
      shopName: json['shopName']?.toString() ?? 'Merkato Store',
      entries: rawEntries
          .map((e) => StatementEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
      payments: rawPayments
          .map((p) => StatementPayment.fromJson(p as Map<String, dynamic>))
          .toList(),
      totals: json['totals'] != null
          ? StatementTotals.fromJson(json['totals'] as Map<String, dynamic>)
          : StatementTotals(
              totalDebit: 0,
              totalCredit: 0,
              outstanding: 0,
              entryCount: 0,
            ),
    );
  }
}
