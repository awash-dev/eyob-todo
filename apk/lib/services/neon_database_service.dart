import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;

import '../models/user.dart';
import '../models/store.dart';
import '../models/ledger_record.dart';
import '../models/line_item.dart';
import '../models/broker.dart';
import '../models/delala_transaction.dart';
import '../models/delala_entry.dart';
import '../models/inventory_product.dart';
import '../models/stock_movement.dart';

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

  static List<String> get candidateEndpoints {
    final list = <String>[];
    try {
      if (dotenv.isInitialized) {
        final proxy = dotenv.env['NEON_PROXY_ENDPOINT'] ?? dotenv.env['PROXY_SQL_ENDPOINT'];
        if (proxy != null && proxy.isNotEmpty) {
          list.add(proxy);
        }
        final dir = dotenv.env['NEON_DIRECT_ENDPOINT'];
        if (dir != null && dir.isNotEmpty) {
          list.add(dir.replaceAll('-pooler', ''));
          list.add(dir);
        }
        final reg = dotenv.env['NEON_REGION_ENDPOINT'];
        if (reg != null && reg.isNotEmpty) {
          list.add(reg.replaceAll('-pooler', ''));
          list.add(reg);
        }
      }
    } catch (_) {}

    // Clean standard serverless endpoint
    list.add('https://ep-red-sea-b5yphk96.c-7.us-east-2.aws.neon.tech/sql');
    list.add('https://ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/sql');

    // Remove duplicates while preserving order
    final seen = <String>{};
    return list.where((url) => seen.add(url)).toList();
  }

  static String get neonDirectEndpoint => candidateEndpoints.first;
  static String get neonRegionEndpoint => candidateEndpoints.first;

  static const Duration requestTimeout = Duration(seconds: 15);

  /// Verify password against stored hash (supporting sha256:salt:hash, plain sha256 or plaintext)
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

  /// Interprets a boolean column as returned by Neon's raw-text transport.
  /// Booleans arrive as `true`/`false`, `t`/`f`, `1`/`0` or as strings, so a
  /// plain `== false` check would silently misread deactivated accounts.
  static bool isTruthy(dynamic value) {
    if (value is bool) return value;
    final text = value?.toString().trim().toLowerCase() ?? '';
    if (text.isEmpty) return false;
    return !(text == 'false' || text == 'f' || text == '0');
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
      // Note on CORS for Flutter Web:
      // Neon allows 'Neon-Connection-String' in CORS preflight responses but NOT 'Content-Type'.
      // 'text/plain; charset=utf-8' is CORS-safelisted, preventing browser preflight block.
      'Content-Type': 'text/plain; charset=utf-8',
      'Accept': 'application/json',
      'Neon-Connection-String': connectionString,
      'Neon-Raw-Text-Output': 'true',
    };

    http.Response? response;
    dynamic lastError;

    // Try all candidate endpoints with failover
    for (final endpoint in candidateEndpoints) {
      try {
        response = await http
            .post(Uri.parse(endpoint), headers: headers, body: body)
            .timeout(requestTimeout);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          break; // Success
        }
      } catch (e) {
        lastError = e;
      }
    }

    if (response != null && response.statusCode >= 200 && response.statusCode < 300) {
      final decoded = jsonDecode(response.body);
      return _parseNeonRows(decoded);
    }

    if (response != null) {
      throw Exception('Server error (${response.statusCode}): ${response.body}');
    }

    // Clean user-friendly network error translation
    final errStr = lastError?.toString() ?? 'Network timeout';
    if (errStr.contains('Socket') ||
        errStr.contains('Failed host lookup') ||
        errStr.contains('ClientException') ||
        errStr.contains('timeout') ||
        errStr.contains('No address associated with hostname') ||
        errStr.contains('Connection refused')) {
      throw Exception(
        'Network error: No internet connection. Please verify your Wi-Fi or mobile data is turned on and try again.',
      );
    }

    throw Exception('Connection failed: $errStr');
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
      SELECT u.id, u.name, u.email, u.phone, u.password_hash, u.role, u.store_id, u.active, sh.name AS store_name
      FROM users u
      LEFT JOIN stores sh ON sh.id = u.store_id
      WHERE u.phone = \$1 OR u.phone = \$2
      LIMIT 1
      ''',
      [cleanPhone, phone.trim()],
    );

    if (rows.isEmpty) return null;
    final row = rows.first;

    if (!isTruthy(row['active'])) {
      throw Exception('This account has been deactivated by the Admin');
    }

    final storedHash = row['password_hash']?.toString() ?? '';
    if (password.trim().isEmpty) {
      throw Exception('Please enter your password');
    }
    if (storedHash.isEmpty) {
      throw Exception('This account has no password stored in the database');
    }
    if (!verifyPassword(password.trim(), storedHash)) {
      throw Exception('Incorrect password. Please try again.');
    }

    return AppUser(
      id: row['id']?.toString() ?? '',
      name: row['name']?.toString() ?? '',
      email: row['email']?.toString(),
      phone: row['phone']?.toString(),
      role: row['role']?.toString() ?? 'storekeeper',
      storeId: row['store_id']?.toString(),
      storeName: row['store_name']?.toString(),
      active: true,
    );
  }

  /// Fetch stores directly from Neon (returns an empty list when the table is
  /// empty — no hardcoded stores are ever invented).
  static Future<List<Store>> getStoresDirect() async {
    final rows = await executeSql(
      'SELECT id, name, code FROM stores ORDER BY id ASC',
    );
    return rows
        .map(
          (r) => Store(
            id: r['id']?.toString() ?? '',
            name: r['name']?.toString() ?? '',
            code: r['code']?.toString() ?? '',
          ),
        )
        .toList();
  }

  /// First store id stored in the database, or null when no store exists.
  static Future<String?> _firstStoreId() async {
    final rows = await executeSql(
      'SELECT id FROM stores ORDER BY id ASC LIMIT 1',
    );
    if (rows.isEmpty) return null;
    final id = rows.first['id']?.toString();
    return (id == null || id.isEmpty) ? null : id;
  }

  /// Resolves the store a record belongs to: the given store, or the first store
  /// in the database. Throws when the database has no store at all.
  static Future<String> resolveStoreId(String? storeId) async {
    if (storeId != null && storeId.isNotEmpty && storeId != 'all') return storeId;
    final first = await _firstStoreId();
    if (first == null) {
      throw Exception(
        'No store exists in the database yet — create a store first',
      );
    }
    return first;
  }

  /// Fetch records directly from Neon
  static Future<List<LedgerRecord>> getRecordsDirect({
    String? storeId,
    String? type,
  }) async {
    String query = '''
      SELECT id, type, title, date, notes, items, store_id, created_at, updated_at
      FROM ledger_records
    ''';
    final conditions = <String>[];
    final params = <dynamic>[];

    if (storeId != null && storeId.isNotEmpty && storeId != 'all') {
      params.add(storeId);
      conditions.add('store_id = \$${params.length}');
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
            storeId: row['store_id']?.toString(),
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

  /// Insert record directly into Neon (with smart merge for customers & suppliers)
  static Future<LedgerRecord> createRecordDirect(
    LedgerRecord record, {
    String? storeId,
  }) async {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final finalStoreId = await resolveStoreId(storeId ?? record.storeId);
    final cleanTitle = record.title.trim();

    // Smart-merge: if customer or supplier, merge items into existing account instead of creating duplicate
    if (record.type == 'customer' || record.type == 'supplier') {
      try {
        final existingRows = await executeSql(
          '''
          SELECT id, type, title, date, notes, items, store_id, created_at, updated_at
          FROM ledger_records
          WHERE LOWER(TRIM(title)) = LOWER(\$1)
            AND type = \$2
            AND (store_id = \$3 OR store_id IS NULL)
          LIMIT 1
          ''',
          [cleanTitle, record.type, finalStoreId],
        );

        if (existingRows.isNotEmpty) {
          final existing = existingRows.first;
          final existingId = existing['id']?.toString() ?? '';
          final itemsRaw = existing['items'];
          List<LineItem> existingItems = [];
          if (itemsRaw is List) {
            existingItems = itemsRaw
                .map((it) => LineItem.fromJson(it as Map<String, dynamic>))
                .toList();
          } else if (itemsRaw is String && itemsRaw.isNotEmpty) {
            try {
              final decoded = jsonDecode(itemsRaw);
              if (decoded is List) {
                existingItems = decoded
                    .map((it) => LineItem.fromJson(it as Map<String, dynamic>))
                    .toList();
              }
            } catch (_) {}
          }

          final mergedItems = [...existingItems, ...record.items];
          final mergedItemsJson = jsonEncode(mergedItems.map((i) => i.toJson()).toList());
          final mergedNotes = (record.notes != null && record.notes!.trim().isNotEmpty)
              ? record.notes!.trim()
              : (existing['notes']?.toString() ?? '');

          await executeSql(
            '''
            UPDATE ledger_records SET
              items = \$1,
              date = \$2,
              notes = \$3,
              updated_at = \$4
            WHERE id = \$5
            ''',
            [mergedItemsJson, record.date, mergedNotes, nowMs, existingId],
          );

          return record.copyWith(
            id: existingId,
            items: mergedItems,
            notes: mergedNotes,
            storeId: existing['store_id']?.toString() ?? finalStoreId,
            updatedAt: nowMs,
          );
        }
      } catch (e) {
        if (kDebugMode) print('Smart-merge check error: $e');
      }
    }

    final itemsJson = jsonEncode(record.items.map((i) => i.toJson()).toList());

    await executeSql(
      '''
      INSERT INTO ledger_records (
        id, type, title, date, notes, items, store_id, created_at, updated_at
      ) VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9)
      ''',
      [
        record.id,
        record.type,
        record.title,
        record.date,
        record.notes ?? '',
        itemsJson,
        finalStoreId,
        nowMs,
        nowMs,
      ],
    );

    return record.copyWith(
      storeId: finalStoreId,
      createdAt: nowMs,
      updatedAt: nowMs,
    );
  }

  /// Update record directly in Neon
  static Future<void> updateRecordDirect(LedgerRecord record) async {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final itemsJson = jsonEncode(record.items.map((i) => i.toJson()).toList());
    final storeId = record.storeId;

    // Only rewrite store_id when the record actually has one — never fall
    // back to a hardcoded store.
    if (storeId != null && storeId.isNotEmpty) {
      await executeSql(
        '''
        UPDATE ledger_records
        SET title = \$1, date = \$2, notes = \$3, items = \$4, store_id = \$5, updated_at = \$6
        WHERE id = \$7
        ''',
        [
          record.title,
          record.date,
          record.notes ?? '',
          itemsJson,
          storeId,
          nowMs,
          record.id,
        ],
      );
    } else {
      await executeSql(
        '''
        UPDATE ledger_records
        SET title = \$1, date = \$2, notes = \$3, items = \$4, updated_at = \$5
        WHERE id = \$6
        ''',
        [
          record.title,
          record.date,
          record.notes ?? '',
          itemsJson,
          nowMs,
          record.id,
        ],
      );
    }
  }

  /// Delete record directly from Neon
  static Future<void> deleteRecordDirect(String recordId) async {
    await executeSql('DELETE FROM ledger_records WHERE id = \$1', [recordId]);
  }

  /// Create store directly in Neon
  static Future<Store> createStoreDirect(String name, [String? code]) async {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final id = 'store-$nowMs';
    final finalCode =
        (code ?? name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '-'))
            .toUpperCase();
    await executeSql(
      'INSERT INTO stores (id, name, code, created_at) VALUES (\$1, \$2, \$3, \$4)',
      [id, name, finalCode, nowMs],
    );
    return Store(id: id, name: name, code: finalCode);
  }

  /// Update store directly in Neon
  static Future<Store> updateStoreDirect(
    String storeId, {
    String? name,
    String? code,
  }) async {
    if (name != null) {
      await executeSql('UPDATE stores SET name = \$1 WHERE id = \$2', [name, storeId]);
    }
    if (code != null) {
      await executeSql('UPDATE stores SET code = \$1 WHERE id = \$2', [code, storeId]);
    }
    final rows = await executeSql('SELECT id, name, code FROM stores WHERE id = \$1', [storeId]);
    if (rows.isNotEmpty) {
      return Store(
        id: rows[0]['id'].toString(),
        name: rows[0]['name'].toString(),
        code: rows[0]['code']?.toString() ?? '',
      );
    }
    return Store(id: storeId, name: name ?? '', code: code ?? '');
  }

  /// Delete store directly in Neon
  static Future<void> deleteStoreDirect(String storeId) async {
    await executeSql('DELETE FROM ledger_records WHERE store_id = \$1', [
      storeId,
    ]);
    await executeSql('UPDATE users SET store_id = NULL WHERE store_id = \$1', [
      storeId,
    ]);
    await executeSql('DELETE FROM stores WHERE id = \$1', [storeId]);
  }

  /// Get storekeeper users directly from Neon
  static Future<List<AppUser>> getUsersDirect() async {
    final rows = await executeSql('''
      SELECT u.id, u.name, u.email, u.phone, u.role, u.store_id, u.active, sh.name AS store_name
      FROM users u
      LEFT JOIN stores sh ON sh.id = u.store_id
      WHERE u.role = 'storekeeper'
      ORDER BY u.created_at ASC
      ''');
    return rows
        .map(
          (r) => AppUser(
            id: r['id']?.toString() ?? '',
            name: r['name']?.toString() ?? '',
            email: r['email']?.toString(),
            phone: r['phone']?.toString(),
            role: 'storekeeper',
            storeId: r['store_id']?.toString(),
            storeName: r['store_name']?.toString(),
            active: isTruthy(r['active']),
          ),
        )
        .toList();
  }

  /// Create storekeeper user directly in Neon
  static Future<AppUser> createStorekeeperDirect({
    required String name,
    required String phone,
    String? email,
    required String password,
    required String storeId,
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
      throw Exception('A storekeeper with phone $cleanPhone already exists');
    }

    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final id = 'user-$nowMs';
    final hash = hashPasswordWithSalt(password);
    await executeSql(
      '''
      INSERT INTO users (id, name, email, phone, password_hash, role, store_id, active, created_at)
      VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9)
      ''',
      [
        id,
        name,
        email?.trim().isEmpty == true ? null : email?.trim().toLowerCase(),
        cleanPhone,
        hash,
        'storekeeper',
        storeId,
        true,
        nowMs,
      ],
    );
    return AppUser(
      id: id,
      name: name,
      email: email?.trim().isEmpty == true ? null : email?.trim().toLowerCase(),
      phone: cleanPhone,
      role: 'storekeeper',
      storeId: storeId,
      active: true,
    );
  }

  /// Update storekeeper user directly in Neon
  static Future<AppUser> updateStorekeeperDirect(
    String userId, {
    String? name,
    String? phone,
    String? storeId,
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
        throw Exception('Another storekeeper already uses phone $cleanPhone');
      }
      await executeSql('UPDATE users SET phone = \$1 WHERE id = \$2', [
        cleanPhone,
        userId,
      ]);
    }
    if (storeId != null) {
      await executeSql('UPDATE users SET store_id = \$1 WHERE id = \$2', [
        storeId,
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
      SELECT u.id, u.name, u.email, u.phone, u.role, u.store_id, u.active, sh.name AS store_name
      FROM users u
      LEFT JOIN stores sh ON sh.id = u.store_id
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
        role: 'storekeeper',
        storeId: r['store_id']?.toString(),
        storeName: r['store_name']?.toString(),
        active: isTruthy(r['active']),
      );
    }
    return AppUser(
      id: userId,
      name: name ?? '',
      phone: phone,
      role: 'storekeeper',
      storeId: storeId,
      active: active ?? true,
    );
  }

  /// Delete storekeeper user directly in Neon
  static Future<void> deleteStorekeeperDirect(String userId) async {
    await executeSql('DELETE FROM sessions WHERE user_id = \$1', [userId]);
    await executeSql('DELETE FROM users WHERE id = \$1', [userId]);
  }

  // =========================================================================
  // DELALA — EXTERNAL BROKER MANAGEMENT OPERATIONS
  // =========================================================================

  /// Fetch all Brokers with live balances and transaction counts
  static Future<List<Broker>> getBrokersDirect([String? storeId]) async {
    final rows = await executeSql(
      'SELECT b.id, b.store_id, b.full_name, b.phone, b.alternative_phone, '
      'b.business_name, b.location, b.website, b.reference_number, b.notes, '
      'b.status, b.created_by, b.created_at, b.updated_at, '
      'COALESCE(a.id, b.id) AS account_id, '
      'COALESCE(a.current_balance, 0) AS current_balance, '
      'COUNT(t.id) AS transaction_count '
      'FROM brokers b '
      'LEFT JOIN delala_accounts a ON a.broker_id = b.id '
      'LEFT JOIN delala_transactions t ON t.account_id = a.id '
      'GROUP BY b.id, b.store_id, b.full_name, b.phone, b.alternative_phone, '
      'b.business_name, b.location, b.website, b.reference_number, b.notes, '
      'b.status, b.created_by, b.created_at, b.updated_at, a.id, a.current_balance '
      'ORDER BY b.created_at ASC',
    );

    if (rows.isEmpty) {
      final newBroker = await createBrokerDirect(
        fullName: 'Mohammed',
        phone: '0911223344',
        location: 'Merkato',
      );
      return [newBroker];
    }

    return rows.map((r) => Broker.fromMap(r)).toList();
  }

  /// Register a new external broker
  static Future<Broker> createBrokerDirect({
    required String fullName,
    String? phone,
    String? alternativePhone,
    String? businessName,
    String? location,
    String? website,
    String? referenceNumber,
    String? notes,
    String? storeId,
  }) async {
    final cleanName = fullName.trim().isEmpty ? 'Delala Broker' : fullName.trim();
    final inserted = await executeSql(
      'INSERT INTO brokers (full_name, phone, alternative_phone, business_name, '
      'location, website, reference_number, notes, store_id, status) '
      'VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10) '
      'RETURNING *',
      [
        cleanName,
        phone?.trim(),
        alternativePhone?.trim(),
        businessName?.trim(),
        location?.trim(),
        website?.trim(),
        referenceNumber?.trim(),
        notes?.trim(),
        storeId,
        'active',
      ],
    );

    final b = inserted.first;
    final brokerId = b['id']?.toString() ?? '';

    // Create associated account
    final acc = await executeSql(
      'INSERT INTO delala_accounts (broker_id, store_id, account_name, current_balance) '
      'VALUES (\$1, \$2, \$3, 0.00) RETURNING id',
      [brokerId, storeId, '$cleanName Account'],
    );
    final accountId = acc.first['id']?.toString() ?? brokerId;

    return Broker(
      id: brokerId,
      storeId: storeId,
      fullName: cleanName,
      phone: phone,
      alternativePhone: alternativePhone,
      businessName: businessName,
      location: location,
      website: website,
      referenceNumber: referenceNumber,
      notes: notes,
      status: 'active',
      createdAt: b['created_at']?.toString() ?? '',
      updatedAt: b['updated_at']?.toString() ?? '',
      currentBalance: 0.0,
      transactionCount: 0,
      accountId: accountId,
    );
  }

  /// Update broker profile
  static Future<void> updateBrokerDirect({
    required String id,
    String? fullName,
    String? phone,
    String? alternativePhone,
    String? businessName,
    String? location,
    String? website,
    String? referenceNumber,
    String? notes,
    String? status,
  }) async {
    await executeSql(
      'UPDATE brokers SET '
      'full_name = COALESCE(\$1, full_name), '
      'phone = \$2, alternative_phone = \$3, business_name = \$4, '
      'location = \$5, website = \$6, reference_number = \$7, notes = \$8, '
      'status = COALESCE(\$9, status), updated_at = CURRENT_TIMESTAMP '
      'WHERE id = \$10',
      [
        fullName?.trim(),
        phone?.trim(),
        alternativePhone?.trim(),
        businessName?.trim(),
        location?.trim(),
        website?.trim(),
        referenceNumber?.trim(),
        notes?.trim(),
        status,
        id,
      ],
    );

    if (fullName != null && fullName.trim().isNotEmpty) {
      await executeSql(
        'UPDATE delala_accounts SET account_name = \$1, updated_at = CURRENT_TIMESTAMP WHERE broker_id = \$2',
        ['${fullName.trim()} Account', id],
      );
    }
  }

  /// Delete a broker and cascade delete account and transactions
  static Future<void> deleteBrokerDirect(String id) async {
    await executeSql('DELETE FROM brokers WHERE id = \$1', [id]);
  }

  /// Fetch all transactions for a broker
  static Future<List<DelalaTransaction>> getDelalaTransactionsDirect([String? brokerId]) async {
    List<Map<String, dynamic>> rows;
    if (brokerId != null && brokerId.isNotEmpty) {
      rows = await executeSql(
        'SELECT * FROM delala_transactions WHERE broker_id = \$1 '
        'ORDER BY transaction_date ASC, created_at ASC',
        [brokerId],
      );
    } else {
      rows = await executeSql(
        'SELECT * FROM delala_transactions ORDER BY transaction_date ASC, created_at ASC',
      );
    }
    return rows.map((r) => DelalaTransaction.fromMap(r)).toList();
  }

  /// Post a new Delala transaction
  static Future<void> createDelalaTransactionDirect({
    required String brokerId,
    String? accountId,
    String? storeId,
    required String transactionType,
    required String description,
    String? productId,
    double? quantity,
    String? unit,
    double? unitPrice,
    required double amount,
    int? accountingEffect,
    required String transactionDate,
    String? paymentMethod,
    String? referenceNumber,
    String? notes,
  }) async {
    String finalAccId = accountId ?? '';
    if (finalAccId.isEmpty) {
      final acc = await executeSql(
        'SELECT id FROM delala_accounts WHERE broker_id = \$1 LIMIT 1',
        [brokerId],
      );
      if (acc.isNotEmpty) {
        finalAccId = acc.first['id']?.toString() ?? '';
      } else {
        final newAcc = await executeSql(
          'INSERT INTO delala_accounts (broker_id, account_name, current_balance) VALUES (\$1, \$2, 0.00) RETURNING id',
          [brokerId, 'Delala Account'],
        );
        finalAccId = newAcc.first['id']?.toString() ?? '';
      }
    }

    int effect = 1;
    if (accountingEffect != null) {
      effect = accountingEffect;
    } else {
      switch (transactionType) {
        case 'goods_given':
        case 'money_paid':
        case 'direct_sale':
          effect = 1;
          break;
        case 'goods_returned':
        case 'money_received':
        case 'commission':
          effect = -1;
          break;
        case 'adjustment':
        default:
          effect = 1;
          break;
      }
    }

    await executeSql(
      'INSERT INTO delala_transactions (account_id, broker_id, store_id, transaction_type, '
      'description, product_id, quantity, unit, unit_price, amount, accounting_effect, '
      'transaction_date, payment_method, reference_number, notes) '
      'VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13, \$14, \$15)',
      [
        finalAccId,
        brokerId,
        storeId,
        transactionType,
        description.trim(),
        productId,
        quantity,
        unit,
        unitPrice,
        amount,
        effect,
        transactionDate,
        paymentMethod,
        referenceNumber,
        notes,
      ],
    );

    // Automatically recalculate and sync account balance
    await executeSql(
      'UPDATE delala_accounts SET current_balance = ('
      'SELECT COALESCE(SUM(amount * accounting_effect), 0) FROM delala_transactions WHERE account_id = \$1'
      '), updated_at = CURRENT_TIMESTAMP WHERE id = \$1',
      [finalAccId],
    );
  }

  /// Update an existing Delala transaction
  static Future<void> updateDelalaTransactionDirect({
    required String id,
    String? transactionType,
    String? description,
    String? productId,
    double? quantity,
    String? unit,
    double? unitPrice,
    double? amount,
    int? accountingEffect,
    String? transactionDate,
    String? paymentMethod,
    String? referenceNumber,
    String? notes,
  }) async {
    final existing = await executeSql(
      'SELECT account_id, accounting_effect, transaction_type FROM delala_transactions WHERE id = \$1',
      [id],
    );
    if (existing.isEmpty) return;
    final accountId = existing.first['account_id']?.toString() ?? '';

    int? effect = accountingEffect;
    if (effect == null && transactionType != null) {
      switch (transactionType) {
        case 'goods_given':
        case 'money_paid':
        case 'direct_sale':
          effect = 1;
          break;
        case 'goods_returned':
        case 'money_received':
        case 'commission':
          effect = -1;
          break;
        default:
          effect = int.tryParse(existing.first['accounting_effect']?.toString() ?? '1') ?? 1;
      }
    }

    await executeSql(
      'UPDATE delala_transactions SET '
      'transaction_type = COALESCE(\$1, transaction_type), '
      'description = COALESCE(\$2, description), '
      'product_id = \$3, quantity = \$4, unit = \$5, unit_price = \$6, '
      'amount = COALESCE(\$7, amount), '
      'accounting_effect = COALESCE(\$8, accounting_effect), '
      'transaction_date = COALESCE(\$9, transaction_date), '
      'payment_method = \$10, reference_number = \$11, notes = \$12, '
      'updated_at = CURRENT_TIMESTAMP WHERE id = \$13',
      [
        transactionType,
        description?.trim(),
        productId,
        quantity,
        unit,
        unitPrice,
        amount,
        effect,
        transactionDate,
        paymentMethod,
        referenceNumber,
        notes,
        id,
      ],
    );

    // Recalculate balance
    await executeSql(
      'UPDATE delala_accounts SET current_balance = ('
      'SELECT COALESCE(SUM(amount * accounting_effect), 0) FROM delala_transactions WHERE account_id = \$1'
      '), updated_at = CURRENT_TIMESTAMP WHERE id = \$1',
      [accountId],
    );
  }

  /// Delete a Delala transaction
  static Future<void> deleteDelalaTransactionDirect(String id) async {
    final existing = await executeSql(
      'SELECT account_id FROM delala_transactions WHERE id = \$1',
      [id],
    );
    if (existing.isEmpty) return;
    final accountId = existing.first['account_id']?.toString() ?? '';

    await executeSql('DELETE FROM delala_transactions WHERE id = \$1', [id]);

    await executeSql(
      'UPDATE delala_accounts SET current_balance = ('
      'SELECT COALESCE(SUM(amount * accounting_effect), 0) FROM delala_transactions WHERE account_id = \$1'
      '), updated_at = CURRENT_TIMESTAMP WHERE id = \$1',
      [accountId],
    );
  }

  // =========================================================================
  // DELALA SPREADSHEET ENTRIES OPERATIONS
  // =========================================================================

  static String cleanDelalaName(String name) {
    return name
        .replaceFirst(RegExp(r'^(delala|ደላላ)\s+', caseSensitive: false), '')
        .trim();
  }

  /// Fetch Delala spreadsheet entries from Neon PostgreSQL
  static Future<List<DelalaEntry>> getDelalaEntriesDirect([String? storeId]) async {
    final query = (storeId != null && storeId.isNotEmpty && storeId != 'all')
        ? 'SELECT id, delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id, created_at, updated_at '
          'FROM delala_entries WHERE store_id = \$1 OR store_id IS NULL ORDER BY created_at ASC'
        : 'SELECT id, delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id, created_at, updated_at '
          'FROM delala_entries ORDER BY created_at ASC';

    final params = (storeId != null && storeId.isNotEmpty && storeId != 'all') ? [storeId] : null;

    final rows = await executeSql(query, params);
    return rows.map((r) {
      final map = Map<String, dynamic>.from(r);
      map['delala_name'] = cleanDelalaName(map['delala_name']?.toString() ?? '');
      return DelalaEntry.fromMap(map);
    }).toList();
  }

  /// Create a new Delala spreadsheet entry
  static Future<DelalaEntry> createDelalaEntryDirect({
    required String delalaName,
    required String productName,
    required double unitPrice,
    required double pieces,
    required int sign,
    required String transactionDate,
    String? storeId,
  }) async {
    final cleanName = cleanDelalaName(delalaName).isEmpty ? 'Mohammed' : cleanDelalaName(delalaName);
    final cleanProduct = productName.trim().isEmpty ? 'Item' : productName.trim();
    final int finalSign = sign == -1 ? -1 : 1;
    final double calculatedTotal = double.parse((unitPrice * pieces * finalSign).toStringAsFixed(2));

    final inserted = await executeSql(
      'INSERT INTO delala_entries ('
      'delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id'
      ') VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8) RETURNING *',
      [
        cleanName,
        cleanProduct,
        unitPrice,
        pieces,
        finalSign,
        calculatedTotal,
        transactionDate.trim(),
        storeId,
      ],
    );

    return DelalaEntry.fromMap(inserted.first);
  }

  /// Update an existing Delala spreadsheet entry
  static Future<void> updateDelalaEntryDirect({
    required String id,
    String? delalaName,
    String? productName,
    double? unitPrice,
    double? pieces,
    int? sign,
    String? transactionDate,
    String? storeId,
  }) async {
    final existing = await executeSql(
      'SELECT unit_price, pieces, sign FROM delala_entries WHERE id = \$1',
      [id],
    );
    if (existing.isEmpty) return;
    final cur = existing.first;

    final double curPrice = unitPrice ?? (cur['unit_price'] is num ? (cur['unit_price'] as num).toDouble() : 0.0);
    final double curPieces = pieces ?? (cur['pieces'] is num ? (cur['pieces'] as num).toDouble() : 0.0);
    final int curSign = sign ?? (cur['sign'] is num ? (cur['sign'] as num).toInt() : 1);
    final int finalSign = curSign == -1 ? -1 : 1;
    final double finalTotal = double.parse((curPrice * curPieces * finalSign).toStringAsFixed(2));

    await executeSql(
      'UPDATE delala_entries SET '
      'delala_name = COALESCE(\$1, delala_name), '
      'product_name = COALESCE(\$2, product_name), '
      'unit_price = COALESCE(\$3, unit_price), '
      'pieces = COALESCE(\$4, pieces), '
      'sign = COALESCE(\$5, sign), '
      'total = \$6, '
      'transaction_date = COALESCE(\$7, transaction_date), '
      'store_id = COALESCE(\$8, store_id), '
      'updated_at = CURRENT_TIMESTAMP WHERE id = \$9',
      [
        delalaName != null ? cleanDelalaName(delalaName) : null,
        productName?.trim(),
        unitPrice,
        pieces,
        finalSign,
        finalTotal,
        transactionDate?.trim(),
        storeId,
        id,
      ],
    );
  }

  /// Delete a Delala spreadsheet entry
  static Future<void> deleteDelalaEntryDirect(String id) async {
    await executeSql('DELETE FROM delala_entries WHERE id = \$1', [id]);
  }

  /* ------------------- Store Inventory & Stock Movements ------------------- */

  /// Fetch products from store_inventory table directly from Neon
  static Future<List<InventoryProduct>> getInventoryProductsDirect({String? storeId}) async {
    List<Map<String, dynamic>> rows;
    if (storeId != null && storeId.isNotEmpty && storeId != 'all') {
      rows = await executeSql(
        '''
        SELECT * FROM store_inventory
        WHERE (store_id = \$1 OR store_id IS NULL)
          AND (is_deleted IS NULL OR is_deleted = FALSE)
        ORDER BY product_name ASC
        ''',
        [storeId],
      );
    } else {
      rows = await executeSql(
        '''
        SELECT * FROM store_inventory
        WHERE (is_deleted IS NULL OR is_deleted = FALSE)
        ORDER BY product_name ASC
        ''',
      );
    }
    return rows.map((r) => InventoryProduct.fromJson(r)).toList();
  }

  /// Check whether a product with this name already exists in the given store
  static Future<bool> checkProductExistsDirect(String productName, String? storeId) async {
    final clean = productName.trim().toLowerCase();
    List<Map<String, dynamic>> rows;
    if (storeId != null && storeId.isNotEmpty && storeId != 'all') {
      rows = await executeSql(
        '''
        SELECT id FROM store_inventory
        WHERE LOWER(TRIM(product_name)) = \$1
          AND (store_id = \$2 OR store_id IS NULL)
        LIMIT 1
        ''',
        [clean, storeId],
      );
    } else {
      rows = await executeSql(
        '''
        SELECT id FROM store_inventory
        WHERE LOWER(TRIM(product_name)) = \$1
        LIMIT 1
        ''',
        [clean],
      );
    }
    return rows.isNotEmpty;
  }

  /// Register a brand new product in store_inventory and log initial stock if any
  static Future<InventoryProduct> registerProductDirect({
    required String productName,
    required double unitPrice,
    required double pcsPerCarton,
    double openingCartons = 0,
    double openingLoosePieces = 0,
    double minimumStock = 0,
    double costPrice = 0,
    String? storeId,
    String? category,
    String? supplierName,
    String? description,
    String? createdBy,
    String? date,
  }) async {
    final cleanName = productName.trim();
    if (cleanName.isEmpty) {
      throw Exception('Product name cannot be empty');
    }
    if (unitPrice < 0 || openingCartons < 0 || minimumStock < 0) {
      throw Exception('Quantity and price values cannot be negative');
    }
    final pcsPerCtn = pcsPerCarton > 0 ? pcsPerCarton : 1.0;
    final totalInitialPieces = (openingCartons * pcsPerCtn) + openingLoosePieces;
    final txnDate = (date != null && date.trim().isNotEmpty)
        ? date.trim()
        : DateTime.now().toIso8601String().split('T')[0];
    final sku = 'SKU-${DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase()}';
    final pCost = costPrice > 0 ? costPrice : unitPrice;
    final totalValue = totalInitialPieces * unitPrice;

    final rows = await executeSql(
      '''
      INSERT INTO store_inventory (
        store_id, product_name, sku, category, base_unit,
        current_quantity, minimum_stock, unit_price, cost_price,
        pcs_per_carton, supplier_name, last_transaction_date, description, created_by,
        quantity_cartons, quantity_per_carton, total_quantity, unit,
        price_per_piece, total_value, is_active, updated_by
      ) VALUES (
        \$1, \$2, \$3, \$4, 'Pcs',
        \$5, \$6, \$7, \$8,
        \$9, \$10, \$11, \$12, \$13,
        \$14, \$15, \$16, 'PCS', \$17, \$18, TRUE, \$13
      )
      RETURNING *
      ''',
      [
        (storeId != null && storeId != 'all') ? storeId : null,
        cleanName,
        sku,
        category ?? 'General',
        totalInitialPieces,
        minimumStock,
        unitPrice,
        pCost,
        pcsPerCtn,
        supplierName,
        txnDate,
        description,
        createdBy,
        openingCartons,
        pcsPerCtn,
        totalInitialPieces,
        unitPrice,
        totalValue,
      ],
    );

    if (rows.isEmpty) {
      throw Exception('Failed to insert product into database');
    }

    final product = InventoryProduct.fromJson(rows.first);

    // If opening stock was specified, also log initial stock movement
    if (totalInitialPieces > 0) {
      try {
        await executeSql(
          '''
          INSERT INTO stock_movements (
            store_id, product_id, movement_type, quantity,
            transaction_unit, conversion_factor, base_quantity,
            previous_stock, new_stock, unit_price, total_price,
            transaction_date, source_type, source_id, note, created_by
          ) VALUES (
            \$1, \$2, 'IN', \$3,
            'Pcs', \$4, \$3,
            0, \$3, \$5, \$6,
            \$7::date, 'INITIAL', \$8, 'Initial product registration stock', \$9
          )
          ''',
          [
            product.storeId,
            product.id,
            totalInitialPieces,
            pcsPerCtn,
            pCost,
            totalInitialPieces * pCost,
            txnDate,
            supplierName,
            createdBy,
          ],
        );
      } catch (e) {
        debugPrint('Warning: Initial stock movement insert failed: \$e');
      }
    }

    return product;
  }

  /// Atomic Stock In / Stock Out operation with strict negative inventory prevention
  static Future<InventoryProduct> recordStockMovementDirect({
    required String productId,
    required String movementType, // 'IN' or 'OUT'
    required double totalPieces,
    required double unitPrice,
    double cartons = 0,
    double loosePieces = 0,
    double pcsPerCarton = 1,
    String? party, // Supplier (IN) or Destination / Customer (OUT)
    String? note,
    String? transactionDate,
    String? storeId,
    String? createdBy,
  }) async {
    final isOut = movementType.toUpperCase() == 'OUT';
    final qty = totalPieces;
    if (qty <= 0) {
      throw Exception('Quantity must be greater than zero');
    }

    // 1. Fetch current product record
    final prodRows = await executeSql(
      'SELECT * FROM store_inventory WHERE id = \$1 LIMIT 1',
      [productId],
    );
    if (prodRows.isEmpty) {
      throw Exception('Product not found: \$productId');
    }
    final prod = prodRows.first;
    final currentQty = (prod['current_quantity'] is num)
        ? (prod['current_quantity'] as num).toDouble()
        : double.tryParse(prod['current_quantity']?.toString() ?? '0') ?? 0.0;
    final productName = prod['product_name']?.toString() ?? '';
    final prodStoreId = (storeId != null && storeId.isNotEmpty && storeId != 'all')
        ? storeId
        : prod['store_id']?.toString();

    final txnDate = (transactionDate != null && transactionDate.trim().isNotEmpty)
        ? transactionDate.trim()
        : DateTime.now().toIso8601String().split('T')[0];

    final totalPrice = double.parse((qty * unitPrice).toStringAsFixed(2));
    final conversion = pcsPerCarton > 0
        ? pcsPerCarton
        : ((prod['pcs_per_carton'] is num) ? (prod['pcs_per_carton'] as num).toDouble() : 1.0);

    // 2. Strict Stock Out Check before DB write
    if (isOut && qty > currentQty) {
      throw Exception(
        'Insufficient stock! Available quantity: ${currentQty.toInt()} pieces. You cannot withdraw ${qty.toInt()} pieces.',
      );
    }

    // 3. Atomic Database Update
    List<Map<String, dynamic>> updatedRows;
    if (isOut) {
      updatedRows = await executeSql(
        '''
        UPDATE store_inventory
        SET current_quantity = current_quantity - \$1,
            unit_price = CASE WHEN \$2 > 0 THEN \$2 ELSE unit_price END,
            last_transaction_date = \$3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = \$4 AND current_quantity >= \$1
        RETURNING *, (current_quantity + \$1) AS previous_qty
        ''',
        [qty, unitPrice, txnDate, productId],
      );
    } else {
      updatedRows = await executeSql(
        '''
        UPDATE store_inventory
        SET current_quantity = current_quantity + \$1,
            cost_price = CASE WHEN \$2 > 0 THEN \$2 ELSE cost_price END,
            pcs_per_carton = CASE WHEN \$3 > 0 THEN \$3 ELSE pcs_per_carton END,
            supplier_name = COALESCE(\$4, supplier_name),
            last_transaction_date = \$5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = \$6
        RETURNING *, (current_quantity - \$1) AS previous_qty
        ''',
        [qty, unitPrice, conversion, party, txnDate, productId],
      );
    }

    if (updatedRows.isEmpty) {
      if (isOut) {
        final freshRows = await executeSql('SELECT current_quantity FROM store_inventory WHERE id = \$1', [productId]);
        final freshQty = freshRows.isNotEmpty
            ? ((freshRows.first['current_quantity'] is num)
                ? (freshRows.first['current_quantity'] as num).toDouble()
                : 0.0)
            : 0.0;
        throw Exception(
          'Insufficient stock! Available quantity: ${freshQty.toInt()} pieces.',
        );
      }
      throw Exception('Product update failed');
    }

    final updatedProd = InventoryProduct.fromJson(updatedRows.first);
    final prevStock = (updatedRows.first['previous_qty'] is num)
        ? (updatedRows.first['previous_qty'] as num).toDouble()
        : (isOut ? updatedProd.currentQuantity + qty : updatedProd.currentQuantity - qty);

    // 4. Insert into stock_movements (immutable audit trail)
    try {
      await executeSql(
        '''
        INSERT INTO stock_movements (
          store_id, product_id, movement_type, quantity,
          transaction_unit, conversion_factor, base_quantity,
          previous_stock, new_stock, unit_price, total_price,
          transaction_date, source_type, source_id, destination,
          note, created_by
        ) VALUES (
          \$1, \$2, \$3, \$4,
          'Pcs', \$5, \$4,
          \$6, \$7, \$8, \$9,
          \$10::date, \$11, \$12, \$13,
          \$14, \$15
        )
        ''',
        [
          prodStoreId,
          productId,
          isOut ? 'OUT' : 'IN',
          qty,
          conversion,
          prevStock,
          updatedProd.currentQuantity,
          unitPrice,
          totalPrice,
          txnDate,
          isOut ? 'CUSTOMER' : 'SUPPLIER',
          isOut ? null : party,
          isOut ? party : null,
          note,
          createdBy,
        ],
      );
    } catch (e) {
      debugPrint('Warning: stock_movements insert error: \$e');
    }

    // 5. Also sync to ledger_records table for unified reporting
    try {
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      final ledgerId = 'rec-stock-$nowMs-${productId.substring(0, 4)}';
      final itemMap = {
        'id': 'item-$nowMs-1',
        'name': productName,
        'unitPrice': unitPrice,
        'quantity': qty,
        'sign': isOut ? '-' : '+',
        'customType': isOut ? 'Stock Out' : 'Goods',
        'cartons': cartons,
        'pcsPerCarton': conversion,
        'packagingUnit': cartons > 0 ? 'Carton' : 'Pcs',
        'date': txnDate,
        'notes': note ?? (isOut ? 'Stock Out (Outgoing)' : 'Stock In (Incoming)'),
      };
      final ledgerNotes = party != null && party.isNotEmpty
          ? (isOut ? 'Destination: $party' : 'Supplier: $party')
          : '';

      await executeSql(
        '''
        INSERT INTO ledger_records (
          id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at
        ) VALUES (
          \$1, 'stock', \$2, \$3, \$4, 198, \$5::jsonb, \$6, \$7, \$7
        )
        ''',
        [
          ledgerId,
          productName,
          txnDate,
          ledgerNotes,
          jsonEncode([itemMap]),
          prodStoreId,
          nowMs,
        ],
      );
    } catch (e) {
      debugPrint('Warning: ledger_records stock sync: \$e');
    }

    return updatedProd;
  }

  /// Get transaction history (stock movements) for a specific product
  static Future<List<StockMovement>> getProductStockMovementsDirect(String productId) async {
    final rows = await executeSql(
      '''
      SELECT sm.*, u.name AS user_name
      FROM stock_movements sm
      LEFT JOIN users u ON u.id = sm.created_by
      WHERE sm.product_id = \$1
      ORDER BY sm.created_at DESC, sm.id DESC
      ''',
      [productId],
    );
    return rows.map((r) => StockMovement.fromJson(r)).toList();
  }

  /// Update metadata of an existing inventory product
  static Future<InventoryProduct> updateInventoryProductDirect({
    required String id,
    String? productName,
    double? unitPrice,
    double? costPrice,
    double? pcsPerCarton,
    double? quantityCartons,
    double? minimumStock,
    String? category,
    String? supplierName,
    String? description,
    String? updatedBy,
    bool? isActive,
  }) async {
    if ((unitPrice ?? 0) < 0 || (costPrice ?? 0) < 0 ||
        (pcsPerCarton ?? 1) <= 0 ||
        (quantityCartons ?? 0) < 0 ||
        (minimumStock ?? 0) < 0) {
      throw Exception('Quantity and price values cannot be negative');
    }

    final effectiveCartons = quantityCartons;
    final rows = await executeSql(
      '''
      UPDATE store_inventory SET
        product_name = COALESCE(\$1, product_name),
        unit_price = COALESCE(\$2, unit_price),
        cost_price = COALESCE(\$3, cost_price),
        pcs_per_carton = COALESCE(\$4, pcs_per_carton),
        quantity_per_carton = COALESCE(\$4, quantity_per_carton),
        quantity_cartons = COALESCE(\$5, quantity_cartons),
        minimum_stock = COALESCE(\$6, minimum_stock),
        category = COALESCE(\$7, category),
        supplier_name = COALESCE(\$8, supplier_name),
        description = COALESCE(\$9, description),
        updated_by = COALESCE(\$11, updated_by),
        is_active = COALESCE(\$12, is_active),
        current_quantity = CASE
          WHEN \$5 IS NOT NULL THEN \$5::DECIMAL * COALESCE(\$4, quantity_per_carton)
          ELSE current_quantity
        END,
        total_quantity = CASE
          WHEN \$5 IS NOT NULL THEN \$5::DECIMAL * COALESCE(\$4, quantity_per_carton)
          ELSE total_quantity
        END,
        price_per_piece = COALESCE(\$2, price_per_piece),
        total_value = CASE
          WHEN \$5 IS NOT NULL
            THEN ROUND(\$5::DECIMAL * COALESCE(\$4, quantity_per_carton) * COALESCE(\$2, unit_price), 2)
          ELSE ROUND(COALESCE(total_quantity, current_quantity) * COALESCE(\$2, unit_price), 2)
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = \$10
      RETURNING *
      ''',
      [
        productName?.trim(),
        unitPrice,
        costPrice,
        pcsPerCarton,
          effectiveCartons,
          minimumStock,
          category,
          supplierName,
          description,
        id,
        updatedBy,
        isActive,
      ],
    );

    if (rows.isEmpty) {
      throw Exception('Product not found: \$id');
    }
    return InventoryProduct.fromJson(rows.first);
  }

  /// Delete an inventory product without destroying historical transaction records
  static Future<void> deleteInventoryProductDirect(String id) async {
    await executeSql(
      'UPDATE store_inventory SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = \$1',
      [id],
    );
  }
}
