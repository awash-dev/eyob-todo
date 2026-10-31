class AppUser {
  final String id;
  final String name;
  final String email;
  final String role; // 'admin' | 'shopkeeper'
  final String? shopId;
  final String? shopName;
  final bool active;

  AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.shopId,
    this.shopName,
    this.active = true,
  });

  bool get isAdmin => role == 'admin';
  bool get isShopkeeper => role == 'shopkeeper';

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      role: json['role']?.toString() ?? 'shopkeeper',
      shopId: json['shopId']?.toString(),
      shopName: json['shopName']?.toString(),
      active: json['active'] != false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'role': role,
      'shopId': shopId,
      'shopName': shopName,
      'active': active,
    };
  }
}

