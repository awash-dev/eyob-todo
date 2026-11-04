class InventoryProduct {
  final String id;
  final String? storeId;
  final String productName;
  final String? sku;
  final String category;
  final String baseUnit;
  final double currentQuantity; // authoritative stock in pieces
  final double minimumStock;
  final double unitPrice; // selling price
  final double costPrice; // purchase price
  final double pcsPerCarton;
  final String? supplierName;
  final String? lastTransactionDate;
  final String? description;
  final String? createdBy;
  final bool isDeleted;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  InventoryProduct({
    required this.id,
    this.storeId,
    required this.productName,
    this.sku,
    this.category = 'General',
    this.baseUnit = 'Pcs',
    required this.currentQuantity,
    this.minimumStock = 0,
    required this.unitPrice,
    this.costPrice = 0,
    this.pcsPerCarton = 1,
    this.supplierName,
    this.lastTransactionDate,
    this.description,
    this.createdBy,
    this.isDeleted = false,
    this.createdAt,
    this.updatedAt,
  });

  /// Total cartons derived from pieces and pcsPerCarton:
  /// Total Available Pieces = Cartons × Pieces per Carton
  int get cartons {
    if (pcsPerCarton <= 0) return 0;
    return (currentQuantity / pcsPerCarton).floor();
  }

  /// Loose pieces remainder: pieces left over after full cartons
  int get loosePieces {
    if (pcsPerCarton <= 0) return 0;
    final rem = currentQuantity - (cartons * pcsPerCarton);
    return rem > 0 ? rem.round() : 0;
  }

  /// Total available pieces = Cartons × Pieces per Carton
  int get totalPieces {
    if (pcsPerCarton <= 0) return currentQuantity.toInt();
    return (cartons * pcsPerCarton).round();
  }

  /// Whether product is currently out of stock
  bool get isOutOfStock => currentQuantity <= 0;

  /// Whether product is low on stock
  bool get isLowStock => minimumStock > 0 && currentQuantity <= minimumStock;

  factory InventoryProduct.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(dynamic val) {
      if (val == null) return null;
      try {
        return DateTime.parse(val.toString());
      } catch (_) {
        return null;
      }
    }

    double parseDouble(dynamic val, [double def = 0.0]) {
      if (val == null) return def;
      if (val is num) return val.toDouble();
      return double.tryParse(val.toString()) ?? def;
    }

    bool parseBool(dynamic val) {
      if (val is bool) return val;
      final text = val?.toString().trim().toLowerCase() ?? '';
      return text == 'true' || text == 't' || text == '1';
    }

    return InventoryProduct(
      id: json['id']?.toString() ?? '',
      storeId: json['store_id']?.toString(),
      productName: json['product_name']?.toString() ?? '',
      sku: json['sku']?.toString(),
      category: json['category']?.toString() ?? 'General',
      baseUnit: json['base_unit']?.toString() ?? 'Pcs',
      currentQuantity: parseDouble(json['current_quantity']),
      minimumStock: parseDouble(json['minimum_stock']),
      unitPrice: parseDouble(json['unit_price']),
      costPrice: parseDouble(json['cost_price']),
      pcsPerCarton: parseDouble(json['pcs_per_carton'], 1.0),
      supplierName: json['supplier_name']?.toString(),
      lastTransactionDate: json['last_transaction_date']?.toString(),
      description: json['description']?.toString(),
      createdBy: json['created_by']?.toString(),
      isDeleted: parseBool(json['is_deleted']),
      createdAt: parseDate(json['created_at']),
      updatedAt: parseDate(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'store_id': storeId,
      'product_name': productName,
      'sku': sku,
      'category': category,
      'base_unit': baseUnit,
      'current_quantity': currentQuantity,
      'minimum_stock': minimumStock,
      'unit_price': unitPrice,
      'cost_price': costPrice,
      'pcs_per_carton': pcsPerCarton,
      'supplier_name': supplierName,
      'last_transaction_date': lastTransactionDate,
      'description': description,
      'created_by': createdBy,
      'is_deleted': isDeleted,
    };
  }
}
