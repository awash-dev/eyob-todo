class LineItem {
  String id;
  String name;
  double unitPrice;
  double quantity;
  String sign; // '+' (Debit/Add) or '-' (Credit/Deduct)
  String? bank; // Which bank transfer: CBE, Awash, Dashen, Telebirr, Pawza, etc.
  String? customType;
  String? paymentMethod;
  String? reference;
  double? cartons;
  double? pcsPerCarton;
  double? customs;
  String? packagingUnit; // 'Carton', 'Pcs', 'Dozen', 'Box', 'Roll', 'Meter', 'Bag', 'Other'
  String? date;
  String? notes;

  LineItem({
    required this.id,
    required this.name,
    this.unitPrice = 0.0,
    this.quantity = 1.0,
    this.sign = '+',
    this.bank,
    this.customType,
    this.paymentMethod,
    this.reference,
    this.cartons,
    this.pcsPerCarton,
    this.customs,
    this.packagingUnit,
    this.date,
    this.notes,
  });

  /// Total calculated price:
  /// If Cartons and Pieces per Carton are specified, Total = Cartons * Pieces per Carton * Unit Price
  /// Otherwise, Total = Quantity * Unit Price
  double get subtotal {
    if (cartons != null && cartons! > 0 && pcsPerCarton != null && pcsPerCarton! > 0) {
      return cartons! * pcsPerCarton! * unitPrice;
    }
    return unitPrice * quantity;
  }

  double get signedAmount {
    if (sign == '-') {
      return -subtotal;
    }
    return subtotal + (customs ?? 0.0);
  }

  factory LineItem.fromJson(Map<String, dynamic> json) {
    return LineItem(
      id: json['id']?.toString() ?? 'item-${DateTime.now().millisecondsSinceEpoch}',
      name: json['name']?.toString() ?? '',
      unitPrice: (json['unitPrice'] as num?)?.toDouble() ?? 0.0,
      quantity: (json['quantity'] as num?)?.toDouble() ?? 1.0,
      sign: json['sign'] == '-' ? '-' : '+',
      bank: json['bank']?.toString(),
      customType: json['customType']?.toString(),
      paymentMethod: json['paymentMethod']?.toString(),
      reference: json['reference']?.toString(),
      cartons: (json['cartons'] as num?)?.toDouble(),
      pcsPerCarton: (json['pcsPerCarton'] as num?)?.toDouble(),
      customs: (json['customs'] as num?)?.toDouble(),
      packagingUnit: json['packagingUnit']?.toString(),
      date: json['date']?.toString(),
      notes: json['notes']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{
      'id': id,
      'name': name,
      'unitPrice': unitPrice,
      'quantity': quantity,
      'sign': sign,
    };
    if (bank != null && bank!.trim().isNotEmpty) map['bank'] = bank!.trim();
    if (customType != null && customType!.trim().isNotEmpty) map['customType'] = customType!.trim();
    if (paymentMethod != null && paymentMethod!.trim().isNotEmpty) map['paymentMethod'] = paymentMethod!.trim();
    if (reference != null && reference!.trim().isNotEmpty) map['reference'] = reference!.trim();
    if (cartons != null && cartons! > 0) map['cartons'] = cartons;
    if (pcsPerCarton != null && pcsPerCarton! > 0) map['pcsPerCarton'] = pcsPerCarton;
    if (customs != null && customs! > 0) map['customs'] = customs;
    if (packagingUnit != null && packagingUnit!.trim().isNotEmpty) map['packagingUnit'] = packagingUnit!.trim();
    if (date != null && date!.trim().isNotEmpty) map['date'] = date!.trim();
    if (notes != null && notes!.trim().isNotEmpty) map['notes'] = notes!.trim();
    return map;
  }
}
