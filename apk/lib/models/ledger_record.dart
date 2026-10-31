import 'line_item.dart';

class LedgerRecord {
  final String id;
  final String type; // 'customer' | 'supplier' | 'stock'
  final String title;
  final String date;
  final String? notes;
  final List<LineItem> items;
  final String? shopId;
  final String? shopName;
  final int? createdAt;
  final int? updatedAt;

  LedgerRecord({
    required this.id,
    required this.type,
    required this.title,
    required this.date,
    this.notes,
    required this.items,
    this.shopId,
    this.shopName,
    this.createdAt,
    this.updatedAt,
  });

  double get totalAmount {
    return items.fold(0.0, (sum, item) => sum + item.signedAmount);
  }

  double get totalQuantity {
    return items.fold(0.0, (sum, item) => sum + item.quantity);
  }

  double get totalDebit {
    return items
        .where((i) => i.sign == '+')
        .fold(0.0, (sum, item) => sum + item.subtotal);
  }

  double get totalCredit {
    return items
        .where((i) => i.sign == '-')
        .fold(0.0, (sum, item) => sum + item.subtotal);
  }

  // Formula:
  // Customer & Delala: Total Debit - Total Credit
  // Supplier: Total Credit - Total Debit
  // Stock: Remaining Value
  double get balance {
    if (type == 'customer' || type == 'delala') {
      return totalDebit - totalCredit;
    } else if (type == 'supplier') {
      return totalCredit - totalDebit;
    }
    return totalAmount;
  }

  LedgerRecord copyWith({
    String? id,
    String? type,
    String? title,
    String? date,
    String? notes,
    List<LineItem>? items,
    String? shopId,
    String? shopName,
    int? createdAt,
    int? updatedAt,
  }) {
    return LedgerRecord(
      id: id ?? this.id,
      type: type ?? this.type,
      title: title ?? this.title,
      date: date ?? this.date,
      notes: notes ?? this.notes,
      items: items ?? this.items,
      shopId: shopId ?? this.shopId,
      shopName: shopName ?? this.shopName,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  factory LedgerRecord.fromJson(Map<String, dynamic> json) {
    var rawItems = json['items'];
    List<LineItem> itemsList = [];
    if (rawItems is List) {
      itemsList = rawItems
          .map((it) => LineItem.fromJson(it as Map<String, dynamic>))
          .toList();
    }

    return LedgerRecord(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'customer',
      title: json['title']?.toString() ?? '',
      date: json['date']?.toString() ??
          DateTime.now().toIso8601String().split('T')[0],
      notes: json['notes']?.toString(),
      items: itemsList,
      shopId: json['shopId']?.toString(),
      shopName: json['shopName']?.toString(),
      createdAt:
          json['createdAt'] is num ? (json['createdAt'] as num).toInt() : null,
      updatedAt:
          json['updatedAt'] is num ? (json['updatedAt'] as num).toInt() : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type,
      'title': title,
      'date': date,
      'notes': notes,
      'items': items.map((i) => i.toJson()).toList(),
      'shopId': shopId,
    };
  }
}
