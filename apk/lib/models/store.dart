class Store {
  final String id;
  final String name;
  final String code;

  Store({
    required this.id,
    required this.name,
    this.code = '',
  });

  factory Store.fromJson(Map<String, dynamic> json) {
    return Store(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      code: json['code']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'code': code,
    };
  }
}

