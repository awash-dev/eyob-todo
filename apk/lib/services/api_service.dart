import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import '../models/shop.dart';
import '../models/ledger_record.dart';
import '../models/statement.dart';
import '../models/line_item.dart';
import 'neon_database_service.dart';

enum DatabaseSource {
  neonCloud,
  localServer,
  offlineCache,
}

class ApiService {
  static const String keyToken = 'merkato_token';
  static const String keyUser = 'merkato_user';
  static const String keyBaseUrl = 'merkato_base_url';
  static const String keyActiveShopId = 'merkato_active_shop_id';
  static const String keyCachedRecords = 'merkato_cached_records';

  static DatabaseSource currentSource = DatabaseSource.neonCloud;

  static String get defaultBaseUrl {
    if (kIsWeb) return 'http://localhost:8787';
    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:8787'; // Android emulator host alias
      }
    } catch (_) {}
    return 'http://localhost:8787';
  }

  static Future<String> getBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(keyBaseUrl) ?? defaultBaseUrl;
  }

  static Future<void> setBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyBaseUrl, url.trim().replaceAll(RegExp(r'/+$'), ''));
  }

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(keyToken);
  }

  static Future<AppUser?> getStoredUser() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(keyUser);
    if (raw == null) return null;
    try {
      return AppUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  static Future<void> saveSession(String token, AppUser user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyToken, token);
    await prefs.setString(keyUser, jsonEncode(user.toJson()));
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(keyToken);
    await prefs.remove(keyUser);
  }

  static Future<String?> getActiveShopId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(keyActiveShopId);
  }

  static Future<void> setActiveShopId(String? shopId) async {
    final prefs = await SharedPreferences.getInstance();
    if (shopId == null) {
      await prefs.remove(keyActiveShopId);
    } else {
      await prefs.setString(keyActiveShopId, shopId);
    }
  }

  /* ------------------- HTTP Headers ------------------- */
  static Future<Map<String, String>> _headers() async {
    final token = await getToken();
    final headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  /* ------------------- Auth ------------------- */
  static Future<AppUser> login(String email, String password) async {
    // 1. Try Direct Neon DB First
    try {
      final user = await NeonDatabaseService.loginDirect(email, password);
      if (user != null) {
        currentSource = DatabaseSource.neonCloud;
        final token = 'neon-session-${DateTime.now().millisecondsSinceEpoch}';
        await saveSession(token, user);
        return user;
      }
    } catch (e) {
      final err = e.toString().toLowerCase();
      if (err.contains('deactivated')) {
        rethrow;
      }
      // If network, auth mismatch, or timeout, continue to server / offline fallback
    }

    // 2. Try Local REST Server
    final baseUrl = await getBaseUrl();
    try {
      final response = await http
          .post(
            Uri.parse('$baseUrl/api/auth/login'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'email': email.trim().toLowerCase(),
              'password': password,
            }),
          )
          .timeout(const Duration(seconds: 4));

      if (response.statusCode == 200) {
        currentSource = DatabaseSource.localServer;
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final token = data['token']?.toString() ??
            'token-${DateTime.now().millisecondsSinceEpoch}';
        final user = AppUser.fromJson(data['user'] as Map<String, dynamic>);
        await saveSession(token, user);
        return user;
      } else {
        final errorMsg = _extractError(response.body) ?? 'Invalid email or password';
        throw Exception(errorMsg);
      }
    } catch (e) {
      if (e.toString().contains('Invalid email') ||
          e.toString().contains('deactivated')) {
        rethrow;
      }
      // 3. Fallback to offline demo login
      currentSource = DatabaseSource.offlineCache;
      return _offlineLogin(email, password);
    }
  }

  static Future<void> logout() async {
    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      await http
          .post(Uri.parse('$baseUrl/api/auth/logout'), headers: headers)
          .timeout(const Duration(seconds: 2));
    } catch (_) {}
    await clearSession();
  }

  /* ------------------- Shops ------------------- */
  static Future<List<Shop>> getShops() async {
    // 1. Try Direct Neon DB
    try {
      final shops = await NeonDatabaseService.getShopsDirect();
      if (shops.isNotEmpty) {
        currentSource = DatabaseSource.neonCloud;
        return shops;
      }
    } catch (_) {}

    // 2. Try Local Server
    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      final res = await http
          .get(Uri.parse('$baseUrl/api/shops'), headers: headers)
          .timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        currentSource = DatabaseSource.localServer;
        final data = jsonDecode(res.body);
        final list = data['shops'] as List? ?? [];
        return list.map((s) => Shop.fromJson(s as Map<String, dynamic>)).toList();
      }
    } catch (_) {}

    // 3. Default fallback
    currentSource = DatabaseSource.offlineCache;
    return [
      Shop(id: 'shop-1', name: 'Shop 1 - Merkato', code: 'SHOP1'),
      Shop(id: 'shop-2', name: 'Shop 2 - Bole', code: 'SHOP2'),
    ];
  }

  /* ------------------- Records ------------------- */
  static Future<List<LedgerRecord>> getRecords({
    String? shopId,
    String? type,
  }) async {
    // 1. Try Direct Neon DB
    try {
      final records = await NeonDatabaseService.getRecordsDirect(
        shopId: shopId,
        type: type,
      );
      if (records.isNotEmpty) {
        currentSource = DatabaseSource.neonCloud;
        await _cacheRecords(records);
        return records;
      }
    } catch (_) {}

    // 2. Try Local REST Server
    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      final queryParams = <String, String>{};
      if (shopId != null && shopId.isNotEmpty) queryParams['shopId'] = shopId;
      if (type != null && type.isNotEmpty) queryParams['type'] = type;

      final uri = Uri.parse('$baseUrl/api/records')
          .replace(queryParameters: queryParams.isEmpty ? null : queryParams);
      final res = await http.get(uri, headers: headers).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        currentSource = DatabaseSource.localServer;
        final data = jsonDecode(res.body);
        final list = data['records'] as List? ?? [];
        final records =
            list.map((r) => LedgerRecord.fromJson(r as Map<String, dynamic>)).toList();
        await _cacheRecords(records);
        return records;
      }
    } catch (_) {}

    // 3. Return cached or offline seed records
    currentSource = DatabaseSource.offlineCache;
    return _getCachedRecords(shopId: shopId, type: type);
  }

  static Future<LedgerRecord> createRecord(
    LedgerRecord record, {
    String? shopId,
  }) async {
    // 1. Try Direct Neon DB
    try {
      final created = await NeonDatabaseService.createRecordDirect(
        record,
        shopId: shopId,
      );
      currentSource = DatabaseSource.neonCloud;
      await _upsertLocalRecord(created);
      return created;
    } catch (_) {}

    // 2. Try Local REST Server
    final baseUrl = await getBaseUrl();
    final bodyMap = record.toJson();
    if (shopId != null) bodyMap['shopId'] = shopId;

    try {
      final headers = await _headers();
      final res = await http
          .post(
            Uri.parse('$baseUrl/api/records'),
            headers: headers,
            body: jsonEncode(bodyMap),
          )
          .timeout(const Duration(seconds: 4));

      if (res.statusCode == 201 || res.statusCode == 200) {
        currentSource = DatabaseSource.localServer;
        final data = jsonDecode(res.body);
        final created =
            LedgerRecord.fromJson(data['record'] as Map<String, dynamic>);
        await _upsertLocalRecord(created);
        return created;
      }
    } catch (_) {}

    // 3. Save locally in offline cache
    currentSource = DatabaseSource.offlineCache;
    await _upsertLocalRecord(record);
    return record;
  }

  static Future<LedgerRecord> updateRecord(LedgerRecord record) async {
    // 1. Try Direct Neon DB
    try {
      await NeonDatabaseService.updateRecordDirect(record);
      currentSource = DatabaseSource.neonCloud;
      await _upsertLocalRecord(record);
      return record;
    } catch (_) {}

    // 2. Try Local REST Server
    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      final res = await http
          .put(
            Uri.parse('$baseUrl/api/records/${record.id}'),
            headers: headers,
            body: jsonEncode(record.toJson()),
          )
          .timeout(const Duration(seconds: 4));

      if (res.statusCode == 200) {
        currentSource = DatabaseSource.localServer;
        final data = jsonDecode(res.body);
        final updated =
            LedgerRecord.fromJson(data['record'] as Map<String, dynamic>);
        await _upsertLocalRecord(updated);
        return updated;
      }
    } catch (_) {}

    // 3. Update locally
    currentSource = DatabaseSource.offlineCache;
    await _upsertLocalRecord(record);
    return record;
  }

  static Future<void> deleteRecord(String recordId) async {
    // 1. Try Direct Neon DB
    try {
      await NeonDatabaseService.deleteRecordDirect(recordId);
      currentSource = DatabaseSource.neonCloud;
      await _deleteLocalRecord(recordId);
      return;
    } catch (_) {}

    // 2. Try Local REST Server
    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      await http
          .delete(Uri.parse('$baseUrl/api/records/$recordId'), headers: headers)
          .timeout(const Duration(seconds: 4));
    } catch (_) {}

    // 3. Remove locally
    await _deleteLocalRecord(recordId);
  }

  /* ------------------- Statements ------------------- */
  static Future<AccountStatement> getStatement({
    required String name,
    required String type,
    String? shopId,
  }) async {
    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      final uri = Uri.parse('$baseUrl/api/statements').replace(
        queryParameters: {
          'name': name,
          'type': type,
          if (shopId != null && shopId.isNotEmpty) 'shopId': shopId,
        },
      );
      final res =
          await http.get(uri, headers: headers).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return AccountStatement.fromJson(
            data['statement'] as Map<String, dynamic>);
      }
    } catch (_) {}

    // Calculate local statement from records
    final records = await getRecords(shopId: shopId, type: type);
    final matching = records
        .where((r) => r.title.trim().toLowerCase() == name.trim().toLowerCase())
        .toList();

    return _generateLocalStatement(name, type, shopId, matching);
  }

  /* ------------------- Shopkeeper Admin Management ------------------- */
  static Future<List<AppUser>> getShopkeepers() async {
    // 1. Try Direct Neon DB
    try {
      final users = await NeonDatabaseService.getUsersDirect();
      if (users.isNotEmpty) {
        currentSource = DatabaseSource.neonCloud;
        return users;
      }
    } catch (_) {}

    // 2. Try Local REST Server
    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      final res = await http
          .get(Uri.parse('$baseUrl/api/users'), headers: headers)
          .timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        currentSource = DatabaseSource.localServer;
        final data = jsonDecode(res.body);
        final list = data['users'] as List? ?? [];
        return list.map((u) => AppUser.fromJson(u as Map<String, dynamic>)).toList();
      }
    } catch (_) {}

    return [
      AppUser(
        id: 'u-1',
        name: 'Shopkeeper 1',
        email: 'shop1@click.et',
        role: 'shopkeeper',
        shopId: 'shop-1',
        shopName: 'Shop 1 - Merkato',
        active: true,
      ),
      AppUser(
        id: 'u-2',
        name: 'Shopkeeper 2',
        email: 'shop2@click.et',
        role: 'shopkeeper',
        shopId: 'shop-2',
        shopName: 'Shop 2 - Bole',
        active: true,
      ),
    ];
  }

  static Future<AppUser> createShopkeeper({
    required String name,
    required String email,
    required String password,
    required String shopId,
  }) async {
    // 1. Try Direct Neon DB
    try {
      final user = await NeonDatabaseService.createShopkeeperDirect(
        name: name,
        email: email,
        password: password,
        shopId: shopId,
      );
      currentSource = DatabaseSource.neonCloud;
      return user;
    } catch (_) {}

    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      final res = await http
          .post(
            Uri.parse('$baseUrl/api/users'),
            headers: headers,
            body: jsonEncode({
              'name': name,
              'email': email,
              'password': password,
              'shopId': shopId,
            }),
          )
          .timeout(const Duration(seconds: 4));
      if (res.statusCode == 201 || res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return AppUser.fromJson(data['user'] as Map<String, dynamic>);
      }
    } catch (_) {}

    return AppUser(
      id: 'u-${DateTime.now().millisecondsSinceEpoch}',
      name: name,
      email: email,
      role: 'shopkeeper',
      shopId: shopId,
      shopName: shopId == 'shop-2' ? 'Shop 2 - Bole' : 'Shop 1 - Merkato',
      active: true,
    );
  }

  static Future<AppUser> updateShopkeeper(
    String userId, {
    String? name,
    String? shopId,
    bool? active,
    String? password,
  }) async {
    // 1. Try Direct Neon DB
    try {
      final user = await NeonDatabaseService.updateShopkeeperDirect(
        userId,
        name: name,
        shopId: shopId,
        active: active,
        password: password,
      );
      currentSource = DatabaseSource.neonCloud;
      return user;
    } catch (_) {}

    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      final body = <String, dynamic>{};
      if (name != null) body['name'] = name;
      if (shopId != null) body['shopId'] = shopId;
      if (active != null) body['active'] = active;
      if (password != null && password.isNotEmpty) body['password'] = password;

      final res = await http
          .patch(
            Uri.parse('$baseUrl/api/users/$userId'),
            headers: headers,
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return AppUser.fromJson(data['user'] as Map<String, dynamic>);
      }
    } catch (_) {}

    return AppUser(
      id: userId,
      name: name ?? 'Shopkeeper',
      email: 'shop@click.et',
      role: 'shopkeeper',
      shopId: shopId ?? 'shop-1',
      shopName: shopId == 'shop-2' ? 'Shop 2 - Bole' : 'Shop 1 - Merkato',
      active: active ?? true,
    );
  }

  static Future<void> deleteShopkeeper(String userId) async {
    try {
      await NeonDatabaseService.deleteShopkeeperDirect(userId);
      currentSource = DatabaseSource.neonCloud;
      return;
    } catch (_) {}

    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      await http
          .delete(Uri.parse('$baseUrl/api/users/$userId'), headers: headers)
          .timeout(const Duration(seconds: 4));
    } catch (_) {}
  }

  static Future<Shop> createShop(String name, [String? code]) async {
    try {
      final shop = await NeonDatabaseService.createShopDirect(name, code);
      currentSource = DatabaseSource.neonCloud;
      return shop;
    } catch (_) {}

    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      final res = await http
          .post(
            Uri.parse('$baseUrl/api/shops'),
            headers: headers,
            body: jsonEncode({'name': name, 'code': code}),
          )
          .timeout(const Duration(seconds: 4));
      if (res.statusCode == 201 || res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return Shop.fromJson(data['shop'] as Map<String, dynamic>);
      }
    } catch (_) {}

    return Shop(
      id: 'shop-${DateTime.now().millisecondsSinceEpoch}',
      name: name,
      code: code ?? name.toUpperCase(),
    );
  }

  static Future<void> deleteShop(String shopId) async {
    try {
      await NeonDatabaseService.deleteShopDirect(shopId);
      currentSource = DatabaseSource.neonCloud;
      return;
    } catch (_) {}

    final baseUrl = await getBaseUrl();
    try {
      final headers = await _headers();
      await http
          .delete(Uri.parse('$baseUrl/api/shops/$shopId'), headers: headers)
          .timeout(const Duration(seconds: 4));
    } catch (_) {}
  }

  /* ------------------- Offline & Cache Helpers ------------------- */

  static Future<void> _cacheRecords(List<LedgerRecord> records) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonList = records.map((r) => r.toJson()).toList();
      await prefs.setString(keyCachedRecords, jsonEncode(jsonList));
    } catch (_) {}
  }

  static Future<List<LedgerRecord>> _getCachedRecords({
    String? shopId,
    String? type,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(keyCachedRecords);
      List<LedgerRecord> all = [];
      if (raw != null) {
        final list = jsonDecode(raw) as List? ?? [];
        all = list
            .map((r) => LedgerRecord.fromJson(r as Map<String, dynamic>))
            .toList();
      }
      if (all.isEmpty) {
        all = _defaultSeedRecords();
        await _cacheRecords(all);
      }

      return all.where((r) {
        if (type != null && type.isNotEmpty && type != 'all' && r.type != type) {
          return false;
        }
        if (shopId != null &&
            shopId.isNotEmpty &&
            shopId != 'all' &&
            r.shopId != null &&
            r.shopId != shopId) {
          return false;
        }
        return true;
      }).toList();
    } catch (_) {
      return _defaultSeedRecords();
    }
  }

  static Future<void> _upsertLocalRecord(LedgerRecord rec) async {
    final all = await _getCachedRecords();
    final idx = all.indexWhere((r) => r.id == rec.id);
    if (idx >= 0) {
      all[idx] = rec;
    } else {
      all.insert(0, rec);
    }
    await _cacheRecords(all);
  }

  static Future<void> _deleteLocalRecord(String id) async {
    final all = await _getCachedRecords();
    all.removeWhere((r) => r.id == id);
    await _cacheRecords(all);
  }

  static AppUser _offlineLogin(String email, String password) {
    final clean = email.trim().toLowerCase();
    if (clean == 'admin@click.et' && password == 'Admin@123') {
      return AppUser(
        id: 'admin-id',
        name: 'Central Admin',
        email: 'admin@click.et',
        role: 'admin',
        active: true,
      );
    }
    if (clean == 'shop1@click.et' && password == 'Shop@123') {
      return AppUser(
        id: 'shop1-id',
        name: 'Shopkeeper 1',
        email: 'shop1@click.et',
        role: 'shopkeeper',
        shopId: 'shop-1',
        shopName: 'Shop 1 - Merkato',
        active: true,
      );
    }
    if (clean == 'shop2@click.et' && password == 'Shop@123') {
      return AppUser(
        id: 'shop2-id',
        name: 'Shopkeeper 2',
        email: 'shop2@click.et',
        role: 'shopkeeper',
        shopId: 'shop-2',
        shopName: 'Shop 2 - Bole',
        active: true,
      );
    }
    throw Exception('Invalid email or password (offline demo mode)');
  }

  static String? _extractError(String body) {
    try {
      final data = jsonDecode(body);
      return data['error']?.toString();
    } catch (_) {
      return null;
    }
  }

  static AccountStatement _generateLocalStatement(
    String name,
    String type,
    String? shopId,
    List<LedgerRecord> records,
  ) {
    final entries = <Map<String, dynamic>>[];

    for (final rec in records) {
      for (final item in rec.items) {
        final isDebit = item.sign == '+';
        final isPayment = item.sign == '-';
        final subtotal = item.subtotal;

        double debit = 0;
        double credit = 0;

        if (type == 'customer') {
          if (isDebit) debit = subtotal;
          if (isPayment) credit = subtotal;
        } else {
          if (isDebit) credit = subtotal;
          if (isPayment) debit = subtotal;
        }

        entries.add({
          'id': item.id,
          'date': rec.date,
          'description': item.name,
          'quantity': item.quantity,
          'unitPrice': item.unitPrice,
          'debit': debit,
          'credit': credit,
          'bank': item.bank,
          'paymentMethod': item.paymentMethod,
          'reference': item.reference,
          'notes': rec.notes,
        });
      }
    }

    double runningBalance = 0;
    double totalDebit = 0;
    double totalCredit = 0;

    final computedEntries = <StatementEntry>[];

    for (final e in entries) {
      final debit = (e['debit'] as num?)?.toDouble() ?? 0;
      final credit = (e['credit'] as num?)?.toDouble() ?? 0;

      totalDebit += debit;
      totalCredit += credit;

      if (type == 'customer') {
        runningBalance = totalDebit - totalCredit;
      } else {
        runningBalance = totalCredit - totalDebit;
      }

      computedEntries.add(
        StatementEntry(
          date: e['date']?.toString() ?? '',
          description: e['description']?.toString() ?? '',
          quantity: (e['quantity'] as num?)?.toDouble() ?? 0,
          unitPrice: (e['unitPrice'] as num?)?.toDouble() ?? 0,
          debit: debit,
          credit: credit,
          balance: runningBalance,
          bank: e['bank']?.toString(),
          paymentMethod: e['paymentMethod']?.toString(),
          reference: e['reference']?.toString(),
          notes: e['notes']?.toString(),
        ),
      );
    }

    final outstanding = type == 'customer'
        ? (totalDebit - totalCredit)
        : (totalCredit - totalDebit);

    return AccountStatement(
      accountName: name,
      accountType: type,
      shopId: shopId,
      shopName: shopId == 'shop-2' ? 'Shop 2 - Bole' : 'Shop 1 - Merkato',
      entries: computedEntries,
      payments: computedEntries
          .where((e) => type == 'customer' ? e.credit > 0 : e.debit > 0)
          .map((e) => StatementPayment(
                date: e.date,
                amount: type == 'customer' ? e.credit : e.debit,
                paymentMethod: e.paymentMethod,
                reference: e.reference,
                notes: e.notes,
                description: e.description,
              ))
          .toList(),
      totals: StatementTotals(
        totalDebit: totalDebit,
        totalCredit: totalCredit,
        outstanding: outstanding,
        entryCount: entries.length,
      ),
    );
  }

  static List<LedgerRecord> _defaultSeedRecords() {
    return [
      // KELIL AGINBI - Electrical & LED Lighting (Merkato Stock)
      LedgerRecord(
        id: 'rec-kelil-stock',
        type: 'stock',
        title: 'KELIL AGINBI - Electrical & LED Lighting',
        date: '2026-10-28',
        notes:
            'Excel Ledger: Total Goods Delivered 870,950 ETB vs Bank Payments 811,200 ETB',
        shopId: 'shop-1',
        shopName: 'Shop 1 - Merkato',
        createdAt: 1720000000000,
        updatedAt: 1720000000000,
        items: [
          LineItem(
              id: 'k1',
              name: '12W SAFARI (10 ctns × 100 pcs)',
              unitPrice: 65.0,
              quantity: 1000.0,
              sign: '+',
              customType: 'Stock',
              cartons: 10.0,
              pcsPerCarton: 100.0),
          LineItem(
              id: 'k2',
              name: '3W EFFISHENT (5 ctns × 100 pcs)',
              unitPrice: 85.0,
              quantity: 500.0,
              sign: '+',
              customType: 'Stock',
              cartons: 5.0,
              pcsPerCarton: 100.0),
          LineItem(
              id: 'k3',
              name: '6W EFFSHENT (5 ctns × 100 pcs)',
              unitPrice: 90.0,
              quantity: 500.0,
              sign: '+',
              customType: 'Stock',
              cartons: 5.0,
              pcsPerCarton: 100.0),
          LineItem(
              id: 'k4',
              name: '9W EFFSHENT (3 ctns × 100 pcs)',
              unitPrice: 100.0,
              quantity: 300.0,
              sign: '+',
              customType: 'Stock',
              cartons: 3.0,
              pcsPerCarton: 100.0),
          LineItem(
              id: 'k5',
              name: 'Bank Transfer - CBE (22/12/17)',
              unitPrice: 180000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'CBE',
              paymentMethod: 'CBE',
              reference: 'CBE-221217'),
          LineItem(
              id: 'k6',
              name: 'Bank Transfer - AWASHI (4/2/2018)',
              unitPrice: 200000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Awash',
              paymentMethod: 'Awash',
              reference: 'AW-040218'),
          LineItem(
              id: 'k7',
              name: 'Bank Transfer - DASHEN (16/03/18)',
              unitPrice: 100000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Dashen',
              paymentMethod: 'Dashen',
              reference: 'DA-160318'),
          LineItem(
              id: 'k8',
              name: 'Bank Transfer - CBE (16/03/18)',
              unitPrice: 100000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'CBE',
              paymentMethod: 'CBE',
              reference: 'CBE-160318'),
          LineItem(
              id: 'k9',
              name: '12W SAFARI 3000K (10 ctns × 100 pcs)',
              unitPrice: 78.0,
              quantity: 1000.0,
              sign: '+',
              customType: 'Stock',
              cartons: 10.0,
              pcsPerCarton: 100.0),
          LineItem(
              id: 'k10',
              name: '5W CANDEL 3000K (5 ctns × 100 pcs)',
              unitPrice: 94.0,
              quantity: 500.0,
              sign: '+',
              customType: 'Stock',
              cartons: 5.0,
              pcsPerCarton: 100.0),
          LineItem(
              id: 'k11',
              name: 'Bank Transfer - AWASHI (2/11/2018)',
              unitPrice: 200000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Awash',
              paymentMethod: 'Awash',
              reference: 'AW-021118'),
        ],
      ),
      // Customer Credit: Alazar General Trading
      LedgerRecord(
        id: 'rec-cust-1',
        type: 'customer',
        title: 'Alazar General Trading',
        date: '2026-10-29',
        notes: 'Merkato wholesale electrical customer',
        shopId: 'shop-1',
        shopName: 'Shop 1 - Merkato',
        createdAt: 1720000100000,
        updatedAt: 1720000100000,
        items: [
          LineItem(
              id: 'c1',
              name: 'LED Floodlight 50W',
              unitPrice: 850.0,
              quantity: 20.0,
              sign: '+'),
          LineItem(
              id: 'c2',
              name: 'Industrial Breaker 63A',
              unitPrice: 1200.0,
              quantity: 10.0,
              sign: '+'),
          LineItem(
              id: 'c3',
              name: 'Payment received via Telebirr',
              unitPrice: 15000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Telebirr',
              paymentMethod: 'Telebirr'),
        ],
      ),
      // Supplier Credit: Global Cable Importers
      LedgerRecord(
        id: 'rec-supp-1',
        type: 'supplier',
        title: 'Global Cable Importers',
        date: '2026-10-27',
        notes: 'Monthly batch invoice for copper wire rolls',
        shopId: 'shop-1',
        shopName: 'Shop 1 - Merkato',
        createdAt: 1720000200000,
        updatedAt: 1720000200000,
        items: [
          LineItem(
              id: 's1',
              name: '2.5mm Copper Wire Roll',
              unitPrice: 3800.0,
              quantity: 15.0,
              sign: '+'),
          LineItem(
              id: 's2',
              name: 'Payment via Awash Bank Wire',
              unitPrice: 30000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Awash',
              paymentMethod: 'Awash'),
        ],
      ),
      // Bole Shop 2 Customer Credit: Selam Cafe & Hotel
      LedgerRecord(
        id: 'rec-cust-bole',
        type: 'customer',
        title: 'Selam Cafe & Hotel',
        date: '2026-10-30',
        notes: 'Spotlights and decor lighting installed on credit',
        shopId: 'shop-2',
        shopName: 'Shop 2 - Bole',
        createdAt: 1720000300000,
        updatedAt: 1720000300000,
        items: [
          LineItem(
              id: 'b1',
              name: 'Warm White Ceiling Spots',
              unitPrice: 320.0,
              quantity: 40.0,
              sign: '+'),
          LineItem(
              id: 'b2',
              name: 'Deposit via CBE Birr',
              unitPrice: 5000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'CBE',
              paymentMethod: 'CBE'),
        ],
      ),
    ];
  }
}
