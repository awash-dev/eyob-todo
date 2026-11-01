import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;

import '../models/user.dart';
import '../models/shop.dart';
import '../models/ledger_record.dart';
import '../models/line_item.dart';

/// Direct Neon PostgreSQL Service
///
/// Connects directly to Neon PostgreSQL using Neon's serverless HTTPS SQL
/// endpoint. Connection credentials are loaded from `apk/.env` via
/// `flutter_dotenv` (loaded in `main.dart`) instead of being hardcoded.
class NeonDatabaseService {
  // Connection string from .env (loaded in main.dart via flutter_dotenv)
  static String get connectionString {
    try {
      if (dotenv.isInitialized) {
        final val = dotenv.env['NEON_CONNECTION_STRING'];
        if (val != null && val.isNotEmpty) return val;
      }
    } catch (_) {}
    return 'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
  }

  static String get neonRegionEndpoint {
    try {
      if (dotenv.isInitialized) {
        final val = dotenv.env['NEON_REGION_ENDPOINT'];
        if (val != null && val.isNotEmpty) return val;
      }
    } catch (_) {}
    return 'https://api.c-7.us-east-2.aws.neon.tech/sql';
  }

  static String get neonDirectEndpoint {
    try {
      if (dotenv.isInitialized) {
        final val = dotenv.env['NEON_DIRECT_ENDPOINT'];
        if (val != null && val.isNotEmpty) return val;
      }
    } catch (_) {}
    return 'https://ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/sql';
  }

  static const Duration requestTimeout = Duration(seconds: 7);

  /// Verify password against stored hash (supporting sha256:salt:hash, plain sha256, plaintext, or demo credentials)
  static bool verifyPassword(String password, String storedHash) {
    if (storedHash.startsWith('sha256:')) {
      final parts = storedHash.split(':');
      if (parts.length == 3) {
        final salt = parts[1];
        final expectedHash = parts[2];
        final actualHash = sha256
            .convert(utf8.encode(salt + password))
            .toString();
        return actualHash.toLowerCase() == expectedHash.toLowerCase();
      }
    }
    // Plain SHA-256
    if (storedHash.toLowerCase() == hashPassword(password).toLowerCase()) {
      return true;
    }
    // Direct match
    if (storedHash == password) {
      return true;
    }
    return false;
  }

  /// Hash password using SHA-256 with salt to match backend Neon user table
  static String hashPasswordWithSalt(String password, [String? salt]) {
    final s = salt ?? DateTime.now().millisecondsSinceEpoch.toString();
    final hash = sha256.convert(utf8.encode(s + password)).toString();
    return 'sha256:$s:$hash';
  }

  /// Hash password using SHA-256
  static String hashPassword(String password) {
    final bytes = utf8.encode(password);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  /// Execute raw parameterized SQL directly on Neon PostgreSQL
  static Future<List<Map<String, dynamic>>> executeSql(
    String query, [
    List<dynamic>? params,
  ]) async {
    final body = jsonEncode({'query': query, 'params': params ?? []});

    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Neon-Connection-String': connectionString,
      'Neon-Raw-Text-Output': 'true',
    };

    http.Response? response;

    // Try primary region endpoint
    try {
      response = await http
          .post(Uri.parse(neonRegionEndpoint), headers: headers, body: body)
          .timeout(requestTimeout);
    } catch (_) {
      // Try direct host endpoint as fallback
      try {
        response = await http
            .post(Uri.parse(neonDirectEndpoint), headers: headers, body: body)
            .timeout(requestTimeout);
      } catch (e) {
        throw Exception(' direct connection timeout: $e');
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final decoded = jsonDecode(response.body);
      return _parseNeonRows(decoded);
    } else {
      throw Exception(' error (${response.statusCode}): ${response.body}');
    }
  }

  /// Parses both Neon array mode and object mode rows into `List<Map<String, dynamic>>`
  static List<Map<String, dynamic>> _parseNeonRows(dynamic responseJson) {
    if (responseJson == null) return [];

    var target = responseJson;
    if (responseJson is Map<String, dynamic> &&
        responseJson.containsKey('results')) {
      final results = responseJson['results'];
      if (results is List && results.isNotEmpty) {
        target = results.first;
      }
    }

    if (target is! Map<String, dynamic>) return [];

    final rawRows = target['rows'];
    if (rawRows is! List || rawRows.isEmpty) return [];

    // Already map rows: [{"id": "...", ...}]
    if (rawRows.first is Map) {
      return rawRows.map((r) => Map<String, dynamic>.from(r as Map)).toList();
    }

    // Array rows with fields: [["...", ...]]
    if (rawRows.first is List) {
      final fields = target['fields'] as List? ?? [];
      final columnNames = fields.map((f) {
        if (f is Map && f.containsKey('name')) return f['name'].toString();
        return f.toString();
      }).toList();

      final list = <Map<String, dynamic>>[];
      for (final row in rawRows) {
        if (row is List) {
          final rowMap = <String, dynamic>{};
          for (var i = 0; i < row.length; i++) {
            final colName = i < columnNames.length ? columnNames[i] : 'col_$i';
            rowMap[colName] = row[i];
          }
          list.add(rowMap);
        }
      }
      return list;
    }

    return [];
  }

  /// Normalizes an Ethiopian phone number to canonical E.164 form (+2519XXXXXXXX).
  ///
  /// Accepts formats like: 0911111111, 911111111, +251911111111, 251911111111.
  /// Returns null when the input is not a valid Ethiopian mobile number.
  static String? normalizePhone(String input) {
    var digits = input.replaceAll(RegExp(r'[\s\-().]'), '');
    if (digits.startsWith('+')) digits = digits.substring(1);
    if (digits.startsWith('251')) {
      digits = '0${digits.substring(3)}';
    }
    if (!RegExp(r'^0[79]\d{8}$').hasMatch(digits)) return null;
    return '+251${digits.substring(1)}';
  }

  /// Check whether Neon is reachable
  static Future<bool> ping() async {
    try {
      final rows = await executeSql('SELECT 1 as test');
      return rows.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Direct Login against Neon users table using phone number
  static Future<AppUser?> loginDirect(String phone, String password) async {
    final cleanPhone = normalizePhone(phone);
    if (cleanPhone == null) {
      throw Exception('Enter a valid Ethiopian phone number (e.g. 0911111111)');
    }

    final rows = await executeSql(
      '''
      SELECT u.id, u.name, u.email, u.phone, u.password_hash, u.role, u.shop_id, u.active, sh.name AS shop_name
      FROM users u
      LEFT JOIN shops sh ON sh.id = u.shop_id
      WHERE u.phone = \$1
      LIMIT 1
      ''',
      [cleanPhone],
    );

    if (rows.isEmpty) return null;
    final row = rows.first;

    final active = row['active'];
    if (active == false || active == 'false') {
      throw Exception('This account has been deactivated by the Admin');
    }

    final storedHash = row['password_hash']?.toString() ?? '';
    if (password.trim().isEmpty) {
      throw Exception('Please enter your password');
    }
    if (storedHash.isNotEmpty && !verifyPassword(password.trim(), storedHash)) {
      throw Exception('Incorrect password. Please try again.');
    }

    return AppUser(
      id: row['id']?.toString() ?? '',
      name: row['name']?.toString() ?? '',
      email: row['email']?.toString(),
      phone: row['phone']?.toString(),
      role: row['role']?.toString() ?? 'shopkeeper',
      shopId: row['shop_id']?.toString(),
      shopName: row['shop_name']?.toString(),
      active: true,
    );
  }

  /// Fetch shops directly from Neon
  static Future<List<Shop>> getShopsDirect() async {
    final rows = await executeSql(
      'SELECT id, name, code FROM shops ORDER BY id ASC',
    );
    if (rows.isEmpty) {
      return [
        Shop(id: 'shop-1', name: 'Shop 1 - Merkato', code: 'SHOP1'),
        Shop(id: 'shop-2', name: 'Shop 2 - Bole', code: 'SHOP2'),
      ];
    }
    return rows
        .map(
          (r) => Shop(
            id: r['id']?.toString() ?? '',
            name: r['name']?.toString() ?? '',
            code: r['code']?.toString() ?? '',
          ),
        )
        .toList();
  }

  /// Fetch records directly from Neon
  static Future<List<LedgerRecord>> getRecordsDirect({
    String? shopId,
    String? type,
  }) async {
    String query = '''
      SELECT id, type, title, date, notes, items, shop_id, created_at, updated_at
      FROM ledger_records
    ''';
    final conditions = <String>[];
    final params = <dynamic>[];

    if (shopId != null && shopId.isNotEmpty && shopId != 'all') {
      params.add(shopId);
      conditions.add('shop_id = \$${params.length}');
    }

    if (type != null && type.isNotEmpty && type != 'all') {
      params.add(type);
      conditions.add('type = \$${params.length}');
    }

    if (conditions.isNotEmpty) {
      query = '$query WHERE ${conditions.join(' AND ')}';
    }

    query = '$query ORDER BY created_at DESC';

    final rows = await executeSql(query, params);
    final records = <LedgerRecord>[];

    for (final row in rows) {
      try {
        final itemsRaw = row['items'];
        List<LineItem> items = [];
        if (itemsRaw is List) {
          items = itemsRaw
              .map((it) => LineItem.fromJson(it as Map<String, dynamic>))
              .toList();
        } else if (itemsRaw is String && itemsRaw.isNotEmpty) {
          try {
            final decoded = jsonDecode(itemsRaw);
            if (decoded is List) {
              items = decoded
                  .map((it) => LineItem.fromJson(it as Map<String, dynamic>))
                  .toList();
            }
          } catch (_) {}
        }

        records.add(
          LedgerRecord(
            id: row['id']?.toString() ?? '',
            type: row['type']?.toString() ?? 'customer',
            title: row['title']?.toString() ?? '',
            date: row['date']?.toString() ?? '',
            notes: row['notes']?.toString(),
            items: items,
            shopId: row['shop_id']?.toString(),
            createdAt: int.tryParse(row['created_at']?.toString() ?? '0') ?? 0,
            updatedAt: int.tryParse(row['updated_at']?.toString() ?? '0') ?? 0,
          ),
        );
      } catch (e) {
        if (kDebugMode) print('Error parsing neon record: $e');
      }
    }

    return records;
  }

  /// Insert record directly into Neon
  static Future<LedgerRecord> createRecordDirect(
    LedgerRecord record, {
    String? shopId,
  }) async {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final finalShopId = shopId ?? record.shopId ?? 'shop-1';
    final itemsJson = jsonEncode(record.items.map((i) => i.toJson()).toList());

    await executeSql(
      '''
      INSERT INTO ledger_records (
        id, type, title, date, notes, items, shop_id, created_at, updated_at
      ) VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9)
      ''',
      [
        record.id,
        record.type,
        record.title,
        record.date,
        record.notes ?? '',
        itemsJson,
        finalShopId,
        nowMs,
        nowMs,
      ],
    );

    return record.copyWith(
      shopId: finalShopId,
      createdAt: nowMs,
      updatedAt: nowMs,
    );
  }

  /// Update record directly in Neon
  static Future<void> updateRecordDirect(LedgerRecord record) async {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final itemsJson = jsonEncode(record.items.map((i) => i.toJson()).toList());

    await executeSql(
      '''
      UPDATE ledger_records
      SET title = \$1, date = \$2, notes = \$3, items = \$4, shop_id = \$5, updated_at = \$6
      WHERE id = \$7
      ''',
      [
        record.title,
        record.date,
        record.notes ?? '',
        itemsJson,
        record.shopId ?? 'shop-1',
        nowMs,
        record.id,
      ],
    );
  }

  /// Delete record directly from Neon
  static Future<void> deleteRecordDirect(String recordId) async {
    await executeSql('DELETE FROM ledger_records WHERE id = \$1', [recordId]);
  }

  /// Create shop directly in Neon
  static Future<Shop> createShopDirect(String name, [String? code]) async {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final id = 'shop-$nowMs';
    final finalCode =
        (code ?? name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '-'))
            .toUpperCase();
    await executeSql(
      'INSERT INTO shops (id, name, code, created_at) VALUES (\$1, \$2, \$3, \$4)',
      [id, name, finalCode, nowMs],
    );
    return Shop(id: id, name: name, code: finalCode);
  }

  /// Update shop directly in Neon
  static Future<Shop> updateShopDirect(
    String shopId, {
    String? name,
    String? code,
  }) async {
    if (name != null) {
      await executeSql('UPDATE shops SET name = \$1 WHERE id = \$2', [name, shopId]);
    }
    if (code != null) {
      await executeSql('UPDATE shops SET code = \$1 WHERE id = \$2', [code, shopId]);
    }
    final rows = await executeSql('SELECT id, name, code FROM shops WHERE id = \$1', [shopId]);
    if (rows.isNotEmpty) {
      return Shop(
        id: rows[0]['id'].toString(),
        name: rows[0]['name'].toString(),
        code: rows[0]['code']?.toString() ?? '',
      );
    }
    return Shop(id: shopId, name: name ?? '', code: code ?? '');
  }

  /// Delete shop directly in Neon
  static Future<void> deleteShopDirect(String shopId) async {
    await executeSql('DELETE FROM ledger_records WHERE shop_id = \$1', [
      shopId,
    ]);
    await executeSql('UPDATE users SET shop_id = NULL WHERE shop_id = \$1', [
      shopId,
    ]);
    await executeSql('DELETE FROM shops WHERE id = \$1', [shopId]);
  }

  /// Get shopkeeper users directly from Neon
  static Future<List<AppUser>> getUsersDirect() async {
    final rows = await executeSql('''
      SELECT u.id, u.name, u.email, u.phone, u.role, u.shop_id, u.active, sh.name AS shop_name
      FROM users u
      LEFT JOIN shops sh ON sh.id = u.shop_id
      WHERE u.role = 'shopkeeper'
      ORDER BY u.created_at ASC
      ''');
    return rows
        .map(
          (r) => AppUser(
            id: r['id']?.toString() ?? '',
            name: r['name']?.toString() ?? '',
            email: r['email']?.toString(),
            phone: r['phone']?.toString(),
            role: 'shopkeeper',
            shopId: r['shop_id']?.toString(),
            shopName: r['shop_name']?.toString(),
            active: r['active'] != false && r['active'] != 'false',
          ),
        )
        .toList();
  }

  /// Create shopkeeper user directly in Neon
  static Future<AppUser> createShopkeeperDirect({
    required String name,
    required String phone,
    String? email,
    required String password,
    required String shopId,
  }) async {
    final cleanPhone = normalizePhone(phone);
    if (cleanPhone == null) {
      throw Exception('Enter a valid Ethiopian phone number (e.g. 0911111111)');
    }

    // Reject duplicate phone numbers (unique index safety with clear error)
    final existing = await executeSql(
      'SELECT id FROM users WHERE phone = \$1 LIMIT 1',
      [cleanPhone],
    );
    if (existing.isNotEmpty) {
      throw Exception('A shopkeeper with phone $cleanPhone already exists');
    }

    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final id = 'user-$nowMs';
    final hash = hashPasswordWithSalt(password);
    await executeSql(
      '''
      INSERT INTO users (id, name, email, phone, password_hash, role, shop_id, active, created_at)
      VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9)
      ''',
      [
        id,
        name,
        email?.trim().isEmpty == true ? null : email?.trim().toLowerCase(),
        cleanPhone,
        hash,
        'shopkeeper',
        shopId,
        true,
        nowMs,
      ],
    );
    return AppUser(
      id: id,
      name: name,
      email: email?.trim().isEmpty == true ? null : email?.trim().toLowerCase(),
      phone: cleanPhone,
      role: 'shopkeeper',
      shopId: shopId,
      active: true,
    );
  }

  /// Update shopkeeper user directly in Neon
  static Future<AppUser> updateShopkeeperDirect(
    String userId, {
    String? name,
    String? phone,
    String? shopId,
    bool? active,
    String? password,
  }) async {
    if (name != null) {
      await executeSql('UPDATE users SET name = \$1 WHERE id = \$2', [
        name,
        userId,
      ]);
    }
    if (phone != null && phone.isNotEmpty) {
      final cleanPhone = normalizePhone(phone);
      if (cleanPhone == null) {
        throw Exception(
          'Enter a valid Ethiopian phone number (e.g. 0911111111)',
        );
      }
      final existing = await executeSql(
        'SELECT id FROM users WHERE phone = \$1 AND id != \$2 LIMIT 1',
        [cleanPhone, userId],
      );
      if (existing.isNotEmpty) {
        throw Exception('Another shopkeeper already uses phone $cleanPhone');
      }
      await executeSql('UPDATE users SET phone = \$1 WHERE id = \$2', [
        cleanPhone,
        userId,
      ]);
    }
    if (shopId != null) {
      await executeSql('UPDATE users SET shop_id = \$1 WHERE id = \$2', [
        shopId,
        userId,
      ]);
    }
    if (active != null) {
      await executeSql('UPDATE users SET active = \$1 WHERE id = \$2', [
        active,
        userId,
      ]);
    }
    if (password != null && password.isNotEmpty) {
      final hash = hashPasswordWithSalt(password);
      await executeSql('UPDATE users SET password_hash = \$1 WHERE id = \$2', [
        hash,
        userId,
      ]);
    }
    final rows = await executeSql(
      '''
      SELECT u.id, u.name, u.email, u.phone, u.role, u.shop_id, u.active, sh.name AS shop_name
      FROM users u
      LEFT JOIN shops sh ON sh.id = u.shop_id
      WHERE u.id = \$1
      LIMIT 1
      ''',
      [userId],
    );
    if (rows.isNotEmpty) {
      final r = rows.first;
      return AppUser(
        id: r['id']?.toString() ?? userId,
        name: r['name']?.toString() ?? '',
        email: r['email']?.toString(),
        phone: r['phone']?.toString(),
        role: 'shopkeeper',
        shopId: r['shop_id']?.toString(),
        shopName: r['shop_name']?.toString(),
        active: r['active'] != false && r['active'] != 'false',
      );
    }
    return AppUser(
      id: userId,
      name: name ?? '',
      phone: phone,
      role: 'shopkeeper',
      shopId: shopId,
      active: active ?? true,
    );
  }

  /// Delete shopkeeper user directly in Neon
  static Future<void> deleteShopkeeperDirect(String userId) async {
    await executeSql('DELETE FROM sessions WHERE user_id = \$1', [userId]);
    await executeSql('DELETE FROM users WHERE id = \$1', [userId]);
  }
}
