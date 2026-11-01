import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import '../models/shop.dart';
import '../models/ledger_record.dart';
import '../models/statement.dart';
import 'neon_database_service.dart';

/// Application service layer (Online-Only via Neon PostgreSQL).
///
/// Connects directly and exclusively to Neon PostgreSQL via [NeonDatabaseService].
/// Offline fallback and mock data have been completely removed.
class ApiService {
  static const String keyToken = 'merkato_token';
  static const String keyUser = 'merkato_user';
  static const String keyActiveShopId = 'merkato_active_shop_id';

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

  /* ------------------- Auth (Online Neon) ------------------- */
  static Future<AppUser> login(String phone, String password) async {
    final user = await NeonDatabaseService.loginDirect(phone, password);
    if (user == null) {
      throw Exception('Invalid phone number or password');
    }
    final token = 'neon-session-${DateTime.now().millisecondsSinceEpoch}';
    await saveSession(token, user);
    return user;
  }

  static Future<void> logout() async {
    await clearSession();
  }

  /* ------------------- Shops (Online Neon) ------------------- */
  static Future<List<Shop>> getShops() async {
    return await NeonDatabaseService.getShopsDirect();
  }

  /* ------------------- Records (Online Neon) ------------------- */
  static Future<List<LedgerRecord>> getRecords({
    String? shopId,
    String? type,
  }) async {
    return await NeonDatabaseService.getRecordsDirect(
      shopId: shopId,
      type: type,
    );
  }

  static Future<LedgerRecord> createRecord(
    LedgerRecord record, {
    String? shopId,
  }) async {
    return await NeonDatabaseService.createRecordDirect(
      record,
      shopId: shopId,
    );
  }

  static Future<LedgerRecord> updateRecord(LedgerRecord record) async {
    await NeonDatabaseService.updateRecordDirect(record);
    return record;
  }

  static Future<void> deleteRecord(String recordId) async {
    await NeonDatabaseService.deleteRecordDirect(recordId);
  }

  /* ------------------- Statements (computed from online records) ------------------- */
  static Future<AccountStatement> getStatement({
    required String name,
    required String type,
    String? shopId,
  }) async {
    final records = await getRecords(shopId: shopId, type: type);
    final target = name.trim().toLowerCase();
    final matching = records.where((r) {
      if (r.title.trim().toLowerCase() == target) return true;
      if (type == 'stock') {
        return r.items.any((it) => it.name.trim().toLowerCase() == target);
      }
      return false;
    }).toList();

    return _generateLocalStatement(name, type, shopId, matching);
  }

  /* ------------------- Shopkeeper Admin Management (Online Neon) ------------------- */
  static Future<List<AppUser>> getShopkeepers() async {
    return NeonDatabaseService.getUsersDirect();
  }

  static Future<AppUser> createShopkeeper({
    required String name,
    required String phone,
    String? email,
    required String password,
    required String shopId,
  }) async {
    return await NeonDatabaseService.createShopkeeperDirect(
      name: name,
      phone: phone,
      email: email,
      password: password,
      shopId: shopId,
    );
  }

  static Future<AppUser> updateShopkeeper(
    String userId, {
    String? name,
    String? phone,
    String? email,
    String? password,
    String? shopId,
    bool? active,
  }) async {
    return await NeonDatabaseService.updateShopkeeperDirect(
      userId,
      name: name,
      phone: phone,
      password: password,
      shopId: shopId,
      active: active,
    );
  }

  static Future<void> deleteShopkeeper(String userId) async {
    await NeonDatabaseService.deleteShopkeeperDirect(userId);
  }

  /* ------------------- Shop Admin Management (Online Neon) ------------------- */
  static Future<Shop> createShop({
    required String name,
    String? code,
  }) async {
    return await NeonDatabaseService.createShopDirect(
      name,
      code,
    );
  }

  static Future<Shop> updateShop(
    String shopId, {
    String? name,
    String? code,
  }) async {
    return await NeonDatabaseService.updateShopDirect(
      shopId,
      name: name,
      code: code,
    );
  }

  static Future<void> deleteShop(String shopId) async {
    await NeonDatabaseService.deleteShopDirect(shopId);
  }

  static AccountStatement _generateLocalStatement(
    String name,
    String type,
    String? shopId,
    List<LedgerRecord> records,
  ) {
    final entries = <Map<String, dynamic>>[];
    final target = name.trim().toLowerCase();

    for (final rec in records) {
      for (final item in rec.items) {
        if (type == 'stock' && target.isNotEmpty) {
          final itName = item.name.trim().toLowerCase();
          final recTitle = rec.title.trim().toLowerCase();
          if (itName != target && recTitle != target) {
            continue;
          }
        }
        final isDebit = item.sign == '+';
        final isPayment = item.sign == '-';
        final subtotal = item.subtotal;

        double debit = 0;
        double credit = 0;

        if (type == 'customer' || type == 'stock') {
          if (isDebit) debit = subtotal;
          if (isPayment) credit = subtotal;
        } else {
          if (isDebit) credit = subtotal;
          if (isPayment) debit = subtotal;
        }

        final desc = item.name.isNotEmpty
            ? item.name
            : (rec.title.isNotEmpty ? rec.title : (isDebit ? 'Goods' : 'Payment'));

        entries.add({
          'id': item.id,
          'date': item.date ?? rec.date,
          'description': desc,
          'quantity': item.quantity,
          'unitPrice': item.unitPrice,
          'debit': debit,
          'credit': credit,
          'bank': item.bank,
          'paymentMethod': item.paymentMethod,
          'reference': item.reference,
          'notes': item.notes ?? rec.notes,
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

      if (type == 'customer' || type == 'stock') {
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
}
