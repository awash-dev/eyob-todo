class Broker {
  final String id;
  final String? storeId;
  final String fullName;
  final String? phone;
  final String? alternativePhone;
  final String? businessName;
  final String? location;
  final String? website;
  final String? referenceNumber;
  final String? notes;
  final String status;
  final String? createdBy;
  final String createdAt;
  final String updatedAt;
  final double currentBalance;
  final int transactionCount;
  final String accountId;

  Broker({
    required this.id,
    this.storeId,
    required this.fullName,
    this.phone,
    this.alternativePhone,
    this.businessName,
    this.location,
    this.website,
    this.referenceNumber,
    this.notes,
    this.status = 'active',
    this.createdBy,
    required this.createdAt,
    required this.updatedAt,
    this.currentBalance = 0.0,
    this.transactionCount = 0,
    required this.accountId,
  });

  factory Broker.fromMap(Map<String, dynamic> map) {
    return Broker(
      id: map['id']?.toString() ?? '',
      storeId: map['store_id']?.toString(),
      fullName: map['full_name']?.toString() ?? 'Delala Broker',
      phone: map['phone']?.toString(),
      alternativePhone: map['alternative_phone']?.toString(),
      businessName: map['business_name']?.toString(),
      location: map['location']?.toString(),
      website: map['website']?.toString(),
      referenceNumber: map['reference_number']?.toString(),
      notes: map['notes']?.toString(),
      status: map['status']?.toString() ?? 'active',
      createdBy: map['created_by']?.toString(),
      createdAt: map['created_at']?.toString() ?? '',
      updatedAt: map['updated_at']?.toString() ?? '',
      currentBalance: double.tryParse(map['current_balance']?.toString() ?? '0.0') ?? 0.0,
      transactionCount: int.tryParse(map['transaction_count']?.toString() ?? '0') ?? 0,
      accountId: map['account_id']?.toString() ?? map['id']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toMap() => {
    'id': id,
    'store_id': storeId,
    'full_name': fullName,
    'phone': phone,
    'alternative_phone': alternativePhone,
    'business_name': businessName,
    'location': location,
    'website': website,
    'reference_number': referenceNumber,
    'notes': notes,
    'status': status,
    'created_by': createdBy,
    'created_at': createdAt,
    'updated_at': updatedAt,
    'current_balance': currentBalance,
    'transaction_count': transactionCount,
    'account_id': accountId,
  };
}

