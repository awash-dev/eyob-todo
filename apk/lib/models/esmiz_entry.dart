/// Esmiz Entry model for Delala Esmiz accounting table
class EsmizEntry {
  final String id;
  final String esmizId;
  final String description;
  final double amount;
  final int sign; // -1 or +1
  final int position;
  final String transactionDate;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const EsmizEntry({
    required this.id,
    required this.esmizId,
    required this.description,
    required this.amount,
    required this.sign,
    required this.position,
    required this.transactionDate,
    this.createdAt,
    this.updatedAt,
  });

  /// Row total calculated as amount * sign
  double get rowTotal => amount * sign;

  factory EsmizEntry.fromMap(Map<String, dynamic> map, [int fallbackPos = 1]) {
    final rawAmount = map['amount'];
    final double parsedAmount = rawAmount is num
        ? rawAmount.toDouble()
        : double.tryParse(rawAmount?.toString() ?? '0') ?? 0.0;

    final rawSign = map['sign'];
    final int parsedSign = (rawSign is num ? rawSign.toInt() : int.tryParse(rawSign?.toString() ?? '-1')) == 1 ? 1 : -1;

    final rawPos = map['position'];
    final int parsedPos = rawPos is num
        ? rawPos.toInt()
        : int.tryParse(rawPos?.toString() ?? '$fallbackPos') ?? fallbackPos;

    return EsmizEntry(
      id: map['id']?.toString() ?? '',
      esmizId: map['esmiz_id']?.toString() ?? '',
      description: map['description']?.toString() ?? '',
      amount: parsedAmount,
      sign: parsedSign,
      position: parsedPos,
      transactionDate: map['transaction_date']?.toString() ??
          DateTime.now().toIso8601String().split('T').first,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString())
          : null,
      updatedAt: map['updated_at'] != null
          ? DateTime.tryParse(map['updated_at'].toString())
          : null,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'esmiz_id': esmizId,
      'description': description,
      'amount': amount,
      'sign': sign,
      'position': position,
      'transaction_date': transactionDate,
    };
  }
}

