class InventoryProduct {
  final String id;
  final String? storeId;
  final String productName;
  final String? sku;
  final String category;
  final String baseUnit;
  final double quantityCartons;
  final double quantityPerCarton;
  final double totalQuantity;
  final String unit;
  final double pricePerPiece;
  final double totalValue;
  final double currentQuantity; // authoritative stock in pieces
  final double minimumStock;
  final double unitPrice; // selling price
  final double costPrice; // purchase price
  final double pcsPerCarton;
  final String? supplierName;
  final String? lastTransactionDate;
  final String? description;
  final String? createdBy;
  final String? updatedBy;
  final bool isDeleted;
  final bool isActive;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  InventoryProduct({
    required this.id,
    this.storeId,
    required this.productName,
    this.sku,
    this.category = 'General',
    this.baseUnit = 'Pcs',
    this.quantityCartons = 0,
    this.quantityPerCarton = 1,
    this.totalQuantity = 0,
    this.unit = 'PCS',
    this.pricePerPiece = 0,
    this.totalValue = 0,
    required this.currentQuantity,
    this.minimumStock = 0,
    required this.unitPrice,
    this.costPrice = 0,
    this.pcsPerCarton = 1,
    this.supplierName,
    this.lastTransactionDate,
    this.description,
    this.createdBy,
    this.updatedBy,
    this.isDeleted = false,
    this.isActive = true,
    this.createdAt,
    this.updatedAt,
  });

  /// Total cartons derived from pieces and pcsPerCarton:
  /// Total Available Pieces = Cartons × Pieces per Carton
  int get cartons {
    if (pcsPerCarton <= 0) return 0;
    return (currentQuantity / pcsPerCarton).floor();
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
      quantityCartons: parseDouble(json['quantity_cartons']),
      quantityPerCarton: parseDouble(json['quantity_per_carton'], 1.0),
      totalQuantity: parseDouble(json['total_quantity']),
      unit: json['unit']?.toString() ?? 'PCS',
      pricePerPiece: parseDouble(json['price_per_piece']),
      totalValue: parseDouble(json['total_value']),
      currentQuantity: parseDouble(json['current_quantity']),
      minimumStock: parseDouble(json['minimum_stock']),
      unitPrice: parseDouble(json['unit_price']),
      costPrice: parseDouble(json['cost_price']),
      pcsPerCarton: parseDouble(json['pcs_per_carton'], 1.0),
      supplierName: json['supplier_name']?.toString(),
      lastTransactionDate: json['last_transaction_date']?.toString(),
      description: json['description']?.toString(),
      createdBy: json['created_by']?.toString(),
      updatedBy: json['updated_by']?.toString(),
      isDeleted: parseBool(json['is_deleted']),
      isActive: json['is_active'] == null
          ? !parseBool(json['is_deleted'])
          : parseBool(json['is_active']),
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
      'quantity_cartons': quantityCartons,
      'quantity_per_carton': quantityPerCarton,
      'total_quantity': totalQuantity,
      'unit': unit,
      'price_per_piece': pricePerPiece,
      'total_value': totalValue,
      'current_quantity': currentQuantity,
      'minimum_stock': minimumStock,
      'unit_price': unitPrice,
      'cost_price': costPrice,
      'pcs_per_carton': pcsPerCarton,
      'supplier_name': supplierName,
      'last_transaction_date': lastTransactionDate,
      'description': description,
      'created_by': createdBy,
      'updated_by': updatedBy,
      'is_deleted': isDeleted,
      'is_active': isActive,
    };
  }
}
