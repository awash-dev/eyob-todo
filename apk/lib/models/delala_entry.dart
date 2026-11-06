/// DelalaEntry model representing a row in the Delala spreadsheet ledger
class DelalaEntry {
  final String id;
  final String delalaName;
  final String productName;
  final double unitPrice;
  final double pieces;
  final int sign; // +1 or -1
  final double total;
  final String transactionDate; // Ethiopian calendar text, e.g. "02/11/2026"
  final String? storeId;
  final String? createdAt;
  final String? updatedAt;
  final String operationType;
  final String? notes;

  const DelalaEntry({
    required this.id,
    required this.delalaName,
    required this.productName,
    required this.unitPrice,
    required this.pieces,
    required this.sign,
    required this.total,
    required this.transactionDate,
    this.storeId,
    this.createdAt,
    this.updatedAt,
    this.operationType = 'item_cash',
    this.notes,
  });

  factory DelalaEntry.fromMap(Map<String, dynamic> map) {
    final rawSign = map['sign'];
    final int signVal = (rawSign is num
        ? rawSign.toInt()
        : int.tryParse(rawSign?.toString() ?? '1') ?? 1);
    final finalSign = signVal == -1 ? -1 : 1;

    final rawPrice = map['unit_price'];
    final double priceVal = (rawPrice is num
        ? rawPrice.toDouble()
        : double.tryParse(rawPrice?.toString() ?? '0') ?? 0.0);

    final rawPieces = map['pieces'];
    final double piecesVal = (rawPieces is num
        ? rawPieces.toDouble()
        : double.tryParse(rawPieces?.toString() ?? '0') ?? 0.0);

    final rawTotal = map['total'];
    double totalVal = (rawTotal is num
        ? rawTotal.toDouble()
        : double.tryParse(rawTotal?.toString() ?? '0') ?? 0.0);
    // If total in DB is 0 or uncalculated, calculate automatically
    if (totalVal == 0.0 && priceVal > 0 && piecesVal > 0) {
      totalVal = double.parse(
        (priceVal * piecesVal * finalSign).toStringAsFixed(2),
      );
    }

    return DelalaEntry(
      id: map['id']?.toString() ?? '',
      delalaName: map['delala_name']?.toString() ?? '',
      productName: map['product_name']?.toString() ?? '',
      unitPrice: priceVal,
      pieces: piecesVal,
      sign: finalSign,
      total: totalVal,
      transactionDate: map['transaction_date']?.toString() ?? '',
      storeId: map['store_id']?.toString(),
      createdAt: map['created_at']?.toString(),
      updatedAt: map['updated_at']?.toString(),
      operationType: map['operation_type']?.toString() ?? 'item_cash',
      notes: map['notes']?.toString(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'delala_name': delalaName,
      'product_name': productName,
      'unit_price': unitPrice,
      'pieces': pieces,
      'sign': sign,
      'total': total,
      'transaction_date': transactionDate,
      'store_id': storeId,
      'created_at': createdAt,
      'updated_at': updatedAt,
      'operation_type': operationType,
      'notes': notes,
    };
  }

  DelalaEntry copyWith({
    String? id,
    String? delalaName,
    String? productName,
    double? unitPrice,
    double? pieces,
    int? sign,
    double? total,
    String? transactionDate,
    String? storeId,
    String? createdAt,
    String? updatedAt,
    String? operationType,
    String? notes,
  }) {
    return DelalaEntry(
      id: id ?? this.id,
      delalaName: delalaName ?? this.delalaName,
      productName: productName ?? this.productName,
      unitPrice: unitPrice ?? this.unitPrice,
      pieces: pieces ?? this.pieces,
      sign: sign ?? this.sign,
      total: total ?? this.total,
      transactionDate: transactionDate ?? this.transactionDate,
      storeId: storeId ?? this.storeId,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      operationType: operationType ?? this.operationType,
      notes: notes ?? this.notes,
    );
  }
}
