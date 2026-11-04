class AppUser {
  final String id;
  final String name;
  final String? email;
  final String? phone; // login identifier (e.g. +2519...)
  final String role; // 'admin' | 'storekeeper'
  final String? storeId;
  final String? storeName;
  final bool active;

  AppUser({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    required this.role,
    this.storeId,
    this.storeName,
    this.active = true,
  });

  bool get isAdmin => role == 'admin';
  bool get isStorekeeper => role == 'storekeeper';

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      email: json['email']?.toString(),
      phone: json['phone']?.toString(),
      role: json['role']?.toString() ?? 'storekeeper',
      storeId: json['storeId']?.toString(),
      storeName: json['storeName']?.toString(),
      active: json['active'] != false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'phone': phone,
      'role': role,
      'storeId': storeId,
      'storeName': storeName,
      'active': active,
    };
  }
}
