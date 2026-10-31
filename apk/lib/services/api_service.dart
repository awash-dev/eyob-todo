import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import '../models/shop.dart';
import '../models/ledger_record.dart';
import '../models/statement.dart';
import '../models/line_item.dart';
import 'neon_database_service.dart';

enum DatabaseSource {
  neonCloud,
  offlineCache,
}

/// Application service layer.
///
/// Talks directly to Neon PostgreSQL via [NeonDatabaseService] — there is
/// no middle-man REST API. Records keep a local offline cache so the app
/// remains usable without a network connection.
class ApiService {
  static const String keyToken = 'merkato_token';
  static const String keyUser = 'merkato_user';
  static const String keyActiveShopId = 'merkato_active_shop_id';
  static const String keyCachedRecords = 'merkato_cached_records';

  static DatabaseSource currentSource = DatabaseSource.neonCloud;

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

  /* ------------------- Auth (direct Neon) ------------------- */
  static Future<AppUser> login(String phone, String password) async {
    try {
      final user = await NeonDatabaseService.loginDirect(phone, password);
      if (user == null) {
        throw Exception('Invalid phone number or password');
      }
      currentSource = DatabaseSource.neonCloud;
      final token = 'neon-session-${DateTime.now().millisecondsSinceEpoch}';
      await saveSession(token, user);
      return user;
    } catch (e) {
      final err = e.toString().toLowerCase();
      // Deactivated / invalid-credential / bad-phone errors are real answers
      // from the DB — never fall back to demo mode for these.
      if (err.contains('deactivated') ||
          err.contains('invalid phone') ||
          err.contains('valid ethiopian phone')) {
        rethrow;
      }
      // Network / timeout — fall back to offline demo login
      currentSource = DatabaseSource.offlineCache;
      return _offlineLogin(phone, password);
    }
  }

  static Future<void> logout() async {
    await clearSession();
  }

  /* ------------------- Shops (direct Neon) ------------------- */
  static Future<List<Shop>> getShops() async {
    try {
      final shops = await NeonDatabaseService.getShopsDirect();
      currentSource = DatabaseSource.neonCloud;
      return shops;
    } catch (_) {
      // Offline fallback
      currentSource = DatabaseSource.offlineCache;
      return [
        Shop(id: 'shop-1', name: 'Shop 1 - Merkato', code: 'SHOP1'),
        Shop(id: 'shop-2', name: 'Shop 2 - Bole', code: 'SHOP2'),
      ];
    }
  }

  /* ------------------- Records (direct Neon + offline cache) ------------------- */
  static Future<List<LedgerRecord>> getRecords({
    String? shopId,
    String? type,
  }) async {
    try {
      final records = await NeonDatabaseService.getRecordsDirect(
        shopId: shopId,
        type: type,
      );
      currentSource = DatabaseSource.neonCloud;
      await _cacheRecords(records);
      return records;
    } catch (_) {
      // Offline: serve cached records
      currentSource = DatabaseSource.offlineCache;
      return _getCachedRecords(shopId: shopId, type: type);
    }
  }

  static Future<LedgerRecord> createRecord(
    LedgerRecord record, {
    String? shopId,
  }) async {
    final created = await NeonDatabaseService.createRecordDirect(
      record,
      shopId: shopId,
    );
    currentSource = DatabaseSource.neonCloud;
    await _upsertLocalRecord(created);
    return created;
  }

  static Future<LedgerRecord> updateRecord(LedgerRecord record) async {
    await NeonDatabaseService.updateRecordDirect(record);
    currentSource = DatabaseSource.neonCloud;
    await _upsertLocalRecord(record);
    return record;
  }

  static Future<void> deleteRecord(String recordId) async {
    await NeonDatabaseService.deleteRecordDirect(recordId);
    currentSource = DatabaseSource.neonCloud;
    await _deleteLocalRecord(recordId);
  }

  /* ------------------- Statements (computed locally from records) ------------------- */
  static Future<AccountStatement> getStatement({
    required String name,
    required String type,
    String? shopId,
  }) async {
    final records = await getRecords(shopId: shopId, type: type);
    final matching = records
        .where((r) => r.title.trim().toLowerCase() == name.trim().toLowerCase())
        .toList();

    return _generateLocalStatement(name, type, shopId, matching);
  }

  /* ------------------- Shopkeeper Admin Management (direct Neon) ------------------- */
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
    final user = await NeonDatabaseService.createShopkeeperDirect(
      name: name,
      phone: phone,
      email: email,
      password: password,
      shopId: shopId,
    );
    currentSource = DatabaseSource.neonCloud;
    return user;
  }

  static Future<AppUser> updateShopkeeper(
    String userId, {
    String? name,
    String? phone,
    String? shopId,
    bool? active,
    String? password,
  }) async {
    final user = await NeonDatabaseService.updateShopkeeperDirect(
      userId,
      name: name,
      phone: phone,
      shopId: shopId,
      active: active,
      password: password,
    );
    currentSource = DatabaseSource.neonCloud;
    return user;
  }

  static Future<void> deleteShopkeeper(String userId) async {
    await NeonDatabaseService.deleteShopkeeperDirect(userId);
    currentSource = DatabaseSource.neonCloud;
  }

  static Future<Shop> createShop(String name, [String? code]) async {
    final shop = await NeonDatabaseService.createShopDirect(name, code);
    currentSource = DatabaseSource.neonCloud;
    return shop;
  }

  static Future<void> deleteShop(String shopId) async {
    await NeonDatabaseService.deleteShopDirect(shopId);
    currentSource = DatabaseSource.neonCloud;
  }

  /* ------------------- Offline Demo Login ------------------- */
  static AppUser _offlineLogin(String phone, String password) {
    final clean = NeonDatabaseService.normalizePhone(phone) ?? phone.trim();
    if (clean == '+251911111111' && password == 'Admin@123') {
      return AppUser(
        id: 'admin-id',
        name: 'Central Admin',
        phone: clean,
        role: 'admin',
        active: true,
      );
    }
    if (clean == '+251922222222' && password == 'Shop@123') {
      return AppUser(
        id: 'shop1-id',
        name: 'Shopkeeper 1',
        phone: clean,
        role: 'shopkeeper',
        shopId: 'shop-1',
        shopName: 'Shop 1 - Merkato',
        active: true,
      );
    }
    if (clean == '+251933333333' && password == 'Shop@123') {
      return AppUser(
        id: 'shop2-id',
        name: 'Shopkeeper 2',
        phone: clean,
        role: 'shopkeeper',
        shopId: 'shop-2',
        shopName: 'Shop 2 - Bole',
        active: true,
      );
    }
    throw Exception('Could not reach the database. Check your connection and try again.');
  }

  /* ------------------- Cache Helpers ------------------- */

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
              pcsPerCarton: 100.0,
              packagingUnit: 'Carton',
              date: '2026-10-28'),
          LineItem(
              id: 'k2',
              name: '3W EFFISHENT (5 ctns × 100 pcs)',
              unitPrice: 85.0,
              quantity: 500.0,
              sign: '+',
              customType: 'Stock',
              cartons: 5.0,
              pcsPerCarton: 100.0,
              packagingUnit: 'Carton',
              date: '2026-10-28'),
          LineItem(
              id: 'k3',
              name: '6W EFFSHENT (5 ctns × 100 pcs)',
              unitPrice: 90.0,
              quantity: 500.0,
              sign: '+',
              customType: 'Stock',
              cartons: 5.0,
              pcsPerCarton: 100.0,
              packagingUnit: 'Carton',
              date: '2026-10-28'),
          LineItem(
              id: 'k4',
              name: '9W EFFSHENT (3 ctns × 100 pcs)',
              unitPrice: 100.0,
              quantity: 300.0,
              sign: '+',
              customType: 'Stock',
              cartons: 3.0,
              pcsPerCarton: 100.0,
              packagingUnit: 'Carton',
              date: '2026-10-28'),
          LineItem(
              id: 'k5',
              name: 'Bank Transfer - CBE (22/12/17)',
              unitPrice: 180000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'CBE',
              paymentMethod: 'CBE',
              reference: 'CBE-221217',
              date: '2026-10-28'),
          LineItem(
              id: 'k6',
              name: 'Bank Transfer - AWASHI (4/2/2018)',
              unitPrice: 200000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Awash',
              paymentMethod: 'Awash',
              reference: 'AW-040218',
              date: '2026-10-28'),
          LineItem(
              id: 'k7',
              name: 'Bank Transfer - DASHEN (16/03/18)',
              unitPrice: 100000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Dashen',
              paymentMethod: 'Dashen',
              reference: 'DA-160318',
              date: '2026-10-28'),
          LineItem(
              id: 'k8',
              name: 'Bank Transfer - CBE (16/03/18)',
              unitPrice: 100000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'CBE',
              paymentMethod: 'CBE',
              reference: 'CBE-160318',
              date: '2026-10-28'),
          LineItem(
              id: 'k9',
              name: '12W SAFARI 3000K (10 ctns × 100 pcs)',
              unitPrice: 78.0,
              quantity: 1000.0,
              sign: '+',
              customType: 'Stock',
              cartons: 10.0,
              pcsPerCarton: 100.0,
              packagingUnit: 'Carton',
              date: '2026-10-28'),
          LineItem(
              id: 'k10',
              name: '5W CANDEL 3000K (5 ctns × 100 pcs)',
              unitPrice: 94.0,
              quantity: 500.0,
              sign: '+',
              customType: 'Stock',
              cartons: 5.0,
              pcsPerCarton: 100.0,
              packagingUnit: 'Carton',
              date: '2026-10-28'),
          LineItem(
              id: 'k11',
              name: 'Bank Transfer - AWASHI (2/11/2018)',
              unitPrice: 200000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Awash',
              paymentMethod: 'Awash',
              reference: 'AW-021118',
              date: '2026-10-28'),
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
              sign: '+',
              customType: 'Goods',
              packagingUnit: 'Pcs',
              date: '2026-10-29'),
          LineItem(
              id: 'c2',
              name: 'Industrial Breaker 63A',
              unitPrice: 1200.0,
              quantity: 10.0,
              sign: '+',
              customType: 'Goods',
              packagingUnit: 'Pcs',
              date: '2026-10-29'),
          LineItem(
              id: 'c3',
              name: 'Payment received via Telebirr',
              unitPrice: 15000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Telebirr',
              paymentMethod: 'Telebirr',
              date: '2026-10-29'),
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
              sign: '+',
              customType: 'Goods',
              packagingUnit: 'Roll',
              date: '2026-10-27'),
          LineItem(
              id: 's2',
              name: 'Payment via Awash Bank Wire',
              unitPrice: 30000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Awash',
              paymentMethod: 'Awash',
              date: '2026-10-27'),
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
              sign: '+',
              customType: 'Goods',
              packagingUnit: 'Pcs',
              date: '2026-10-30'),
          LineItem(
              id: 'b2',
              name: 'Deposit via CBE Birr',
              unitPrice: 5000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'CBE Birr',
              paymentMethod: 'CBE Birr',
              date: '2026-10-30'),
        ],
      ),
      // Delala (Broker) Credit: Abebe Delala (Merkato Broker)
      LedgerRecord(
        id: 'rec-delala-1',
        type: 'delala',
        title: 'Abebe Delala (Merkato Broker)',
        date: '2026-10-29',
        notes: 'Commission on electric goods brokered to regional clients',
        shopId: 'shop-1',
        shopName: 'Shop 1 - Merkato',
        createdAt: 1720000400000,
        updatedAt: 1720000400000,
        items: [
          LineItem(
            id: 'd1',
            name: 'Commission: 12W Safari 20 Ctns consignment',
            unitPrice: 50.0,
            quantity: 2000.0,
            sign: '+',
            customType: 'Goods',
            cartons: 20.0,
            pcsPerCarton: 100.0,
            packagingUnit: 'Carton',
            date: '2026-10-29',
          ),
          LineItem(
            id: 'd2',
            name: 'Settlement via Telebirr',
            unitPrice: 40000.0,
            quantity: 1.0,
            sign: '-',
            bank: 'Telebirr',
            paymentMethod: 'Telebirr',
            date: '2026-10-29',
          ),
        ],
      ),
      // Stock (Store): Bole Shop 2 Inventory
      LedgerRecord(
        id: 'rec-stock-bole',
        type: 'stock',
        title: 'BOLE Lighting Hub - Downlights & Strips',
        date: '2026-10-30',
        notes: 'Shop 2 decorative lighting restock',
        shopId: 'shop-2',
        shopName: 'Shop 2 - Bole',
        createdAt: 1720000500000,
        updatedAt: 1720000500000,
        items: [
          LineItem(
              id: 'bs1',
              name: 'LED Downlight 12W (8 ctns × 50 pcs)',
              unitPrice: 210.0,
              quantity: 400.0,
              sign: '+',
              customType: 'Stock',
              cartons: 8.0,
              pcsPerCarton: 50.0,
              packagingUnit: 'Carton',
              date: '2026-10-30'),
          LineItem(
              id: 'bs2',
              name: 'RGB LED Strip 5m (4 ctns × 20 pcs)',
              unitPrice: 340.0,
              quantity: 80.0,
              sign: '+',
              customType: 'Stock',
              cartons: 4.0,
              pcsPerCarton: 20.0,
              packagingUnit: 'Carton',
              date: '2026-10-30'),
          LineItem(
              id: 'bs3',
              name: 'Bank Transfer - CBE Birr (30/10/2026)',
              unitPrice: 95000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'CBE Birr',
              paymentMethod: 'CBE Birr',
              reference: 'CBB-301030',
              date: '2026-10-30'),
        ],
      ),
      // Supplier Credit: Bole Shop 2
      LedgerRecord(
        id: 'rec-supp-bole',
        type: 'supplier',
        title: 'Nile Electronics Import PLC',
        date: '2026-10-29',
        notes: 'Downlight housings and LED drivers monthly order',
        shopId: 'shop-2',
        shopName: 'Shop 2 - Bole',
        createdAt: 1720000600000,
        updatedAt: 1720000600000,
        items: [
          LineItem(
              id: 'sn1',
              name: 'Recessed Downlight Housing',
              unitPrice: 1450.0,
              quantity: 60.0,
              sign: '+',
              customType: 'Goods',
              packagingUnit: 'Pcs',
              date: '2026-10-29'),
          LineItem(
              id: 'sn2',
              name: 'LED Driver 30W',
              unitPrice: 900.0,
              quantity: 100.0,
              sign: '+',
              customType: 'Goods',
              packagingUnit: 'Pcs',
              date: '2026-10-29'),
          LineItem(
              id: 'sn3',
              name: 'Bank Transfer - CBE (29/10/2026)',
              unitPrice: 72000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'CBE',
              paymentMethod: 'CBE',
              reference: 'CBE-291026',
              date: '2026-10-29'),
        ],
      ),
      // Delala (Broker) Credit: Bole Shop 2
      LedgerRecord(
        id: 'rec-delala-bole',
        type: 'delala',
        title: 'Mekdes Delala (Bole Broker)',
        date: '2026-10-30',
        notes: 'Commission on downlight consignment brokered to hotels',
        shopId: 'shop-2',
        shopName: 'Shop 2 - Bole',
        createdAt: 1720000700000,
        updatedAt: 1720000700000,
        items: [
          LineItem(
              id: 'bd1',
              name: 'Commission: Downlight 8 Ctns consignment',
              unitPrice: 40.0,
              quantity: 400.0,
              sign: '+',
              customType: 'Goods',
              cartons: 8.0,
              pcsPerCarton: 50.0,
              packagingUnit: 'Carton',
              date: '2026-10-30'),
          LineItem(
              id: 'bd2',
              name: 'Settlement via Amole (custom channel)',
              unitPrice: 12000.0,
              quantity: 1.0,
              sign: '-',
              bank: 'Amole', // Custom bank name -> opens as "Other" with Amole prefilled
              paymentMethod: 'Amole',
              date: '2026-10-30'),
        ],
      ),
    ];
  }
}
