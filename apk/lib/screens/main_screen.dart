import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../models/user.dart';
import '../models/store.dart';
import '../models/ledger_record.dart';
import '../models/delala_entry.dart';
import '../services/api_service.dart';
import '../services/language_service.dart';
import 'login_screen.dart';
import 'record_form_dialog.dart';
import 'statement_screen.dart';
import '../models/inventory_product.dart';
import 'new_product_dialog.dart';
import 'stock_transaction_dialog.dart';
import 'product_history_dialog.dart';
import 'edit_product_dialog.dart';
import 'admin_users_screen.dart';

class MainScreen extends StatefulWidget {
  final AppUser currentUser;

  const MainScreen({super.key, required this.currentUser});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  final _currencyFormat = NumberFormat('#,##0.00', 'en_US');

  // Language / Translator state backed by LanguageService
  bool get _isAmharic => LanguageService.isAmharic;

  // Tabs: 0: Customer, 1: Supplier, 2: Delala, 3: Stocks
  int _currentTabIndex = 0;
  List<Store> _stores = [];
  String? _selectedStoreId;
  List<LedgerRecord> _records = [];
  List<DelalaEntry> _delalaEntries = [];
  List<InventoryProduct> _inventoryProducts = [];
  bool _isLoading = true;
  String? _errorMessage;
  String _searchQuery = '';
  final _searchController = TextEditingController();

  // Records collapsed by default (tap header to expand) — mobile friendly cards
  final Set<String> _expandedRecordIds = <String>{};

  void _toggleRecordExpanded(String id) {
    setState(() {
      if (!_expandedRecordIds.remove(id)) {
        _expandedRecordIds.add(id);
      }
    });
  }

  @override
  void initState() {
    super.initState();

    // Admin sees all 4 tabs: Customer, Supplier, Delala, Store (opens on Customer).
    // Storekeepers only have store pages, so they open straight on the Store tab
    // and the party/delala tabs are hidden from the bottom bar.
    _currentTabIndex = widget.currentUser.isStorekeeper ? 3 : 0;
    if (widget.currentUser.isStorekeeper) {
      // The store comes from the signed-in user row in the database; when it
      // is missing we keep null instead of inventing a store id.
      _selectedStoreId = widget.currentUser.storeId;
    } else {
      _selectedStoreId = 'all';
    }

    _loadLanguagePreference();
    _loadStoresAndRecords();
  }

  Future<void> _loadLanguagePreference() async {
    try {
      await LanguageService.init();
      if (mounted) setState(() {});
    } catch (_) {}
  }

  static String cleanDelalaName(String name) {
    return name
        .replaceFirst(RegExp(r'^(delala|ደላላ)\s+', caseSensitive: false), '')
        .trim();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String get _currentTabType {
    switch (_currentTabIndex) {
      case 0:
        return 'customer';
      case 1:
        return 'supplier';
      case 2:
        return 'delala';
      case 3:
        return 'stock';
      default:
        return 'customer';
    }
  }

  String get _currentTabLabel {
    if (_isAmharic) {
      switch (_currentTabIndex) {
        case 0:
          return 'የደንበኛ ብድር';
        case 1:
          return 'የአቅራቢ ብድር';
        case 2:
          return 'የደላላ ሂሳብ';
        case 3:
          return 'የመደብር እቃዎች';
        default:
          return 'የደንበኛ ብድር';
      }
    }
    switch (_currentTabIndex) {
      case 0:
        return 'Customer Credit';
      case 1:
        return 'Supplier Credit';
      case 2:
        return 'Delala Ledger';
      case 3:
        return 'Store Inventory';
      default:
        return 'Customer Credit';
    }
  }

  /// Store name shown in the header. Resolved from the signed-in user row and
  /// the `stores` table — never from a hardcoded store list.
  String get _activeStoreLabel {
    if (widget.currentUser.isAdmin) {
      if (_selectedStoreId == 'all') return 'All Stores (Central)';
      final match = _stores.where((s) => s.id == _selectedStoreId);
      return match.isNotEmpty ? match.first.name : 'All Stores';
    }

    final ownName = widget.currentUser.storeName;
    if (ownName != null && ownName.isNotEmpty) return ownName;

    final match = _stores.where((s) => s.id == widget.currentUser.storeId);
    return match.isNotEmpty ? match.first.name : 'No store assigned';
  }

  Future<void> _loadStoresAndRecords() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final stores = await ApiService.getStores();
      String? targetStoreId = _selectedStoreId;
      if (widget.currentUser.isStorekeeper) {
        targetStoreId = widget.currentUser.storeId ?? _selectedStoreId;
        if ((targetStoreId == null || targetStoreId.isEmpty) && stores.isNotEmpty) {
          targetStoreId = stores.first.id;
        }
        _selectedStoreId = targetStoreId;
      }
      final records = await ApiService.getRecords(storeId: targetStoreId);
      final delalaEntries = await ApiService.getDelalaEntries(targetStoreId);
      final inventoryProducts = await ApiService.getInventoryProducts(storeId: targetStoreId);
      if (mounted) {
        setState(() {
          _stores = stores;
          _records = records;
          _delalaEntries = delalaEntries;
          _inventoryProducts = inventoryProducts;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.toString().replaceAll('Exception:', '').trim();
        });
      }
    }
  }

  Future<void> _reloadRecordsOnly() async {
    try {
      String? targetStoreId = _selectedStoreId;
      if (widget.currentUser.isStorekeeper) {
        targetStoreId = widget.currentUser.storeId ?? _selectedStoreId;
        if ((targetStoreId == null || targetStoreId.isEmpty) && _stores.isNotEmpty) {
          targetStoreId = _stores.first.id;
        }
        _selectedStoreId = targetStoreId;
      }
      final records = await ApiService.getRecords(storeId: targetStoreId);
      final delalaEntries = await ApiService.getDelalaEntries(targetStoreId);
      final inventoryProducts = await ApiService.getInventoryProducts(storeId: targetStoreId);
      if (mounted) {
        setState(() {
          _records = records;
          _delalaEntries = delalaEntries;
          _inventoryProducts = inventoryProducts;
          _errorMessage = null;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception:', '').trim()),
            backgroundColor: const Color(0xFFBA1A1A),
          ),
        );
      }
    }
  }

  void _onStoreChanged(String? newStoreId) {
    if (widget.currentUser.isStorekeeper) return;
    setState(() {
      _selectedStoreId = newStoreId;
    });
    _reloadRecordsOnly();
  }

  List<LedgerRecord> get _filteredRecords {
    final type = _currentTabType;
    return _records.where((r) {
      if (widget.currentUser.isStorekeeper) {
        if (r.type != 'stock') return false;
        if (_selectedStoreId != null && _selectedStoreId!.isNotEmpty && _selectedStoreId != 'all') {
          if (r.storeId != null && r.storeId != _selectedStoreId) return false;
        }
      } else {
        if (r.type != type) return false;
        if (_selectedStoreId != null &&
            _selectedStoreId != 'all' &&
            r.storeId != null &&
            r.storeId != _selectedStoreId) {
          return false;
        }
      }
      if (_searchQuery.trim().isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final matchTitle = r.title.toLowerCase().contains(q);
        final matchNotes = r.notes?.toLowerCase().contains(q) ?? false;
        final matchItems = r.items.any(
          (it) => it.name.toLowerCase().contains(q),
        );
        if (!matchTitle && !matchNotes && !matchItems) return false;
      }
      return true;
    }).toList();
  }

  Future<void> _openCreateRecordDialog() async {
    final result = await showDialog<LedgerRecord>(
      context: context,
      builder: (ctx) => RecordFormDialog(
        activeTab: _currentTabType,
        existingRecords: _records,
        storeId: widget.currentUser.isStorekeeper
            ? widget.currentUser.storeId
            : (_selectedStoreId == 'all'
                  ? (_stores.isNotEmpty ? _stores.first.id : null)
                  : _selectedStoreId),
      ),
    );

    if (result != null) {
      try {
        // Smart merge: if party ledger already exists in this store, append the new transaction rows
        final existingIdx = _records.indexWhere(
          (r) =>
              r.type == result.type &&
              r.title.trim().toLowerCase() ==
                  result.title.trim().toLowerCase() &&
              (r.storeId == result.storeId ||
                  r.storeId == null ||
                  result.storeId == null),
        );

        if (existingIdx >= 0 && result.type != 'stock') {
          final existing = _records[existingIdx];
          final updated = existing.copyWith(
            items: [...existing.items, ...result.items],
            notes: (result.notes != null && result.notes!.isNotEmpty)
                ? result.notes
                : existing.notes,
            updatedAt: DateTime.now().millisecondsSinceEpoch,
          );
          await ApiService.updateRecord(updated);
          _reloadRecordsOnly();
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Added transaction to "${existing.title}" in Neon DB',
              ),
              backgroundColor: const Color(0xFF2563EB),
            ),
          );
        } else {
          await ApiService.createRecord(result, storeId: result.storeId);
          _reloadRecordsOnly();
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Saved "${result.title}" to Neon DB'),
              backgroundColor: const Color(0xFF2563EB),
            ),
          );
        }
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceAll('Exception:', ''))),
        );
      }
    }
  }

  Future<void> _openEditRecordDialog(LedgerRecord record) async {
    final result = await showDialog<LedgerRecord>(
      context: context,
      builder: (ctx) => RecordFormDialog(
        activeTab: record.type,
        editingRecord: record,
        existingRecords: _records,
        storeId: record.storeId,
      ),
    );

    if (result != null) {
      try {
        await ApiService.updateRecord(result);
        _reloadRecordsOnly();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Updated "${result.title}" in Neon DB'),
            backgroundColor: const Color(0xFF2563EB),
          ),
        );
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceAll('Exception:', ''))),
        );
      }
    }
  }

  Future<void> _deleteRecord(LedgerRecord record) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Record'),
        content: Text('Delete "${record.title}" from ledger?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFBA1A1A),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ApiService.deleteRecord(record.id);
      _reloadRecordsOnly();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Deleted "${record.title}"')));
    }
  }

  void _openStatement(LedgerRecord record) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => StatementScreen(
          accountName: record.title,
          accountType: record.type,
          storeId: record.storeId,
        ),
      ),
    );
  }

  void _showRecordActions(LedgerRecord record) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: isDark ? Colors.grey.shade700 : Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            record.title,
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                              color: Theme.of(context).colorScheme.onSurface,
                              height: 1.25,
                            ),
                            softWrap: true,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Balance: ETB ${_currencyFormat.format(record.balance)}',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).colorScheme.onSurface,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(height: 16),
              ListTile(
                leading: const Icon(
                  Icons.table_chart_outlined,
                  color: Color(0xFF2563EB),
                ),
                title: const Text('View Full Statement & PDF'),
                onTap: () {
                  Navigator.pop(ctx);
                  _openStatement(record);
                },
              ),
              ListTile(
                leading: const Icon(
                  Icons.edit_outlined,
                  color: Color(0xFF4059AA),
                ),
                title: const Text('Edit Entry'),
                onTap: () {
                  Navigator.pop(ctx);
                  _openEditRecordDialog(record);
                },
              ),
              ListTile(
                leading: const Icon(
                  Icons.delete_outline,
                  color: Color(0xFFBA1A1A),
                ),
                title: const Text('Delete Entry'),
                onTap: () {
                  Navigator.pop(ctx);
                  _deleteRecord(record);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleLogout() async {
    await ApiService.logout();
    if (!mounted) return;
    Navigator.of(
      context,
    ).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
  }

  Widget _buildStatementSummary(ThemeData theme, bool isDark) {
    final records = _filteredRecords;
    double totalDebit = 0;
    double totalCredit = 0;
    for (final r in records) {
      totalDebit += r.totalDebit;
      totalCredit += r.totalCredit;
    }

    double netBalance = 0;
    String balanceTitle = 'Total Receivables:';
    String debitTitle = 'Total Debit (Invoiced)';
    String creditTitle = 'Total Credit (Received)';

    if (_currentTabType == 'customer') {
      netBalance = totalDebit - totalCredit;
      balanceTitle = 'Total Receivables:';
      debitTitle = 'Total Debit (Invoiced)';
      creditTitle = 'Total Credit (Received)';
    } else if (_currentTabType == 'supplier') {
      netBalance = totalCredit - totalDebit;
      balanceTitle = 'Total Payables:';
      debitTitle = 'Total Debit (Purchased)';
      creditTitle = 'Total Credit (Paid)';
    } else if (_currentTabType == 'delala') {
      netBalance = totalDebit - totalCredit;
      balanceTitle = 'Total Delala Balance:';
      debitTitle = 'Total Debit (Commission/Goods)';
      creditTitle = 'Total Credit (Settled)';
    } else {
      netBalance = records.fold(0.0, (sum, r) => sum + r.totalAmount);
      balanceTitle = 'Total Inventory:';
      debitTitle = 'Total Goods In';
      creditTitle = 'Goods Out / Value Paid';
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(14, 6, 14, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1B2234) : Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isDark ? const Color(0xFF2E384D) : const Color(0xFFDAE2FD),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Flexible(
                child: Row(
                  children: [
                    const Icon(
                      Icons.table_view_outlined,
                      size: 16,
                      color: Color(0xFF2563EB),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'Statement Summary',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13.5,
                          color: theme.colorScheme.onSurface,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Wrap(
                  alignment: WrapAlignment.end,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 4,
                  children: [
                    Text(
                      balanceTitle,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: isDark
                            ? const Color(0xFF94A3B8)
                            : const Color(0xFF64748B),
                      ),
                    ),
                    Text(
                      'ETB ${_currencyFormat.format(netBalance)}',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        letterSpacing: -0.2,
                        color: theme.colorScheme.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Divider(
            height: 1,
            thickness: 0.8,
            color: isDark ? const Color(0xFF2E384D) : const Color(0xFFDAE2FD),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    debitTitle,
                    style: TextStyle(
                      fontSize: 10.5,
                      color: isDark
                          ? const Color(0xFF94A3B8)
                          : const Color(0xFF64748B),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'ETB ${_currencyFormat.format(totalDebit)}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    creditTitle,
                    style: TextStyle(
                      fontSize: 10.5,
                      color: isDark
                          ? const Color(0xFF94A3B8)
                          : const Color(0xFF64748B),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'ETB ${_currencyFormat.format(totalCredit)}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _todayEthiopianText() {
    final now = DateTime.now();
    final d = now.day.toString().padLeft(2, '0');
    final m = now.month.toString().padLeft(2, '0');
    final y = now.year;
    return '$d/$m/$y';
  }

  /// DELALA Spreadsheet View (Dedicated external broker ledger with signed totals & Ethiopian date input)
  Widget _buildDelalaSpreadsheet(ThemeData theme, bool isDark) {
    final gridBorderColor = isDark
        ? const Color(0xFF2E384D)
        : const Color(0xFFCBD5E1);

    final filtered = _delalaEntries.where((e) {
      if (_searchQuery.trim().isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final matchName = e.delalaName.toLowerCase().contains(q);
        final matchProduct = e.productName.toLowerCase().contains(q);
        final matchDate = e.transactionDate.toLowerCase().contains(q);
        if (!matchName && !matchProduct && !matchDate) return false;
      }
      return true;
    }).toList();

    double totalPositive = 0.0;
    double totalNegative = 0.0;
    double totalPieces = 0.0;
    for (final e in filtered) {
      totalPieces += e.pieces;
      if (e.total >= 0) {
        totalPositive += e.total;
      } else {
        totalNegative += e.total.abs();
      }
    }
    final double finalBalance = totalPositive - totalNegative;

    return Column(
      children: [
        // Spreadsheet Table (Full screen width, zero X-axis scrolling, rows given vertical height)
        Expanded(
          child: filtered.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.table_chart_outlined, size: 40, color: Colors.grey.shade400),
                      const SizedBox(height: 10),
                      Text(
                        _searchQuery.isNotEmpty
                            ? (_isAmharic
                                ? '"$_searchQuery" ጋር የሚዛመድ የደላላ መዝገብ አልተገኘም'
                                : 'No Delala entries match "$_searchQuery"')
                            : (_isAmharic
                                ? 'ምንም የደላላ መዝገብ አልተመዘገበም'
                                : 'No Delala entries recorded yet'),
                        style: TextStyle(
                          fontSize: 13,
                          color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                        ),
                      ),
                      const SizedBox(height: 12),
                      ElevatedButton.icon(
                        onPressed: () => _openDelalaEntryDialog(),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        icon: const Icon(Icons.add, size: 16),
                        label: Text(_isAmharic ? 'አዲስ መዝግብ' : 'Add First Entry'),
                      ),
                    ],
                  ),
                )
              : SingleChildScrollView(
                  scrollDirection: Axis.vertical,
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 90),
                  child: Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E293B) : Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: gridBorderColor, width: 1.2),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.03),
                          blurRadius: 4,
                          offset: const Offset(0, 1),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Spreadsheet Table Header Bar (Fits screen width - Zero X scrolling)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF172033) : const Color(0xFFF1F5F9),
                            borderRadius: const BorderRadius.vertical(top: Radius.circular(11)),
                            border: Border(bottom: BorderSide(color: gridBorderColor, width: 1.2)),
                          ),
                          child: Row(
                            children: [
                              SizedBox(
                                width: 28,
                                child: Text(
                                  _isAmharic ? 'ተ.ቁ' : '#',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
                                ),
                              ),
                              Expanded(
                                flex: 5,
                                child: Text(
                                  _isAmharic ? 'ስም & የዕቃ ዓይነት' : 'Name & Product',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
                                ),
                              ),
                              Expanded(
                                flex: 3,
                                child: Text(
                                  _isAmharic ? 'ዋጋ × ብዛት' : 'Price × Pcs',
                                  textAlign: TextAlign.right,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
                                ),
                              ),
                              Expanded(
                                flex: 4,
                                child: Text(
                                  _isAmharic ? 'ድምር & እርምጃ' : 'Total & Action',
                                  textAlign: TextAlign.right,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
                                ),
                              ),
                            ],
                          ),
                        ),

                        // Spreadsheet Data Rows (Given comfortable vertical height, zero X scrolling)
                        ListView.separated(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: filtered.length,
                          separatorBuilder: (_, index) => Divider(height: 1, thickness: 0.8, color: gridBorderColor),
                          itemBuilder: (context, idx) {
                            final row = filtered[idx];
                            final isNeg = row.sign == -1;
                            final rowBg = idx % 2 == 1
                                ? (isDark ? const Color(0xFF161F30) : const Color(0xFFF8FAFC))
                                : (isDark ? const Color(0xFF1E293B) : Colors.white);

                            return Container(
                              color: rowBg,
                              constraints: const BoxConstraints(minHeight: 64),
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.center,
                                children: [
                                  // Row # Badge
                                  Container(
                                    width: 26,
                                    height: 26,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: isDark ? const Color(0xFF242C40) : const Color(0xFFF1F5F9),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(color: gridBorderColor.withValues(alpha: 0.5)),
                                    ),
                                    child: Text(
                                      '${idx + 1}',
                                      style: TextStyle(
                                        fontSize: 10.5,
                                        fontWeight: FontWeight.bold,
                                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),

                                  // Name, Sign badge, and Product
                                  Expanded(
                                    flex: 5,
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Row(
                                          children: [
                                            Flexible(
                                              child: Text(
                                                cleanDelalaName(row.delalaName),
                                                style: TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 13,
                                                  color: theme.colorScheme.onSurface,
                                                ),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            const SizedBox(width: 5),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                              decoration: BoxDecoration(
                                                color: isNeg ? const Color(0xFFFFE4E6) : const Color(0xFFD1FAE5),
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: Text(
                                                isNeg ? '-1' : '+1',
                                                style: TextStyle(
                                                  color: isNeg ? const Color(0xFFE11D48) : const Color(0xFF059669),
                                                  fontWeight: FontWeight.w900,
                                                  fontSize: 9.5,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          row.productName,
                                          style: TextStyle(
                                            fontSize: 11.5,
                                            fontWeight: FontWeight.w500,
                                            color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                                          ),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 1),
                                        Text(
                                          row.transactionDate,
                                          style: const TextStyle(fontSize: 10, color: Colors.grey),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 6),

                                  // Calculation: Unit Price × Pieces
                                  Expanded(
                                    flex: 3,
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          _currencyFormat.format(row.unitPrice),
                                          style: TextStyle(
                                            fontSize: 11.5,
                                            fontWeight: FontWeight.bold,
                                            color: theme.colorScheme.onSurface,
                                          ),
                                        ),
                                        const SizedBox(height: 1),
                                        Text(
                                          '× ${row.pieces.toStringAsFixed(row.pieces.truncateToDouble() == row.pieces ? 0 : 2)} pcs',
                                          style: const TextStyle(
                                            fontSize: 10,
                                            color: Colors.grey,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 6),

                                  // Total & Actions
                                  Expanded(
                                    flex: 4,
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          '${row.total >= 0 ? '+' : ''}${_currencyFormat.format(row.total)} ETB',
                                          style: TextStyle(
                                            fontWeight: FontWeight.w900,
                                            fontSize: 12.5,
                                            color: isNeg
                                                ? const Color(0xFF2563EB)
                                                : const Color(0xFF059669),
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            IconButton(
                                              icon: const Icon(Icons.edit_outlined, size: 16, color: Color(0xFF2563EB)),
                                              tooltip: _isAmharic ? 'አርትዕ' : 'Edit entry',
                                              padding: EdgeInsets.zero,
                                              constraints: const BoxConstraints(minWidth: 26, minHeight: 26),
                                              onPressed: () => _openDelalaEntryDialog(row),
                                            ),
                                            const SizedBox(width: 4),
                                            IconButton(
                                              icon: const Icon(Icons.delete_outline, size: 16, color: Color(0xFFE11D48)),
                                              tooltip: _isAmharic ? 'አጥፋ' : 'Delete entry',
                                              padding: EdgeInsets.zero,
                                              constraints: const BoxConstraints(minWidth: 26, minHeight: 26),
                                              onPressed: () => _deleteDelalaEntry(row),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),

                        // Final Total Row (pinned at bottom of spreadsheet, zero X scrolling)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF131D31) : const Color(0xFFF1F5F9),
                            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(11)),
                            border: Border(top: BorderSide(color: gridBorderColor, width: 1.2)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _isAmharic ? 'ጠቅላላ ድምር' : 'Final Total',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 13,
                                      color: theme.colorScheme.onSurface,
                                    ),
                                  ),
                                  Text(
                                    _isAmharic
                                        ? 'ጠቅላላ ፍሬ፦ ${totalPieces.toStringAsFixed(totalPieces.truncateToDouble() == totalPieces ? 0 : 2)} pcs'
                                        : 'Total Pieces: ${totalPieces.toStringAsFixed(totalPieces.truncateToDouble() == totalPieces ? 0 : 2)} pcs',
                                    style: const TextStyle(fontSize: 10.5, color: Colors.grey),
                                  ),
                                ],
                              ),
                              Text(
                                '${finalBalance >= 0 ? '+' : ''}${_currencyFormat.format(finalBalance)} ETB',
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 15,
                                  color: finalBalance < 0
                                      ? const Color(0xFF2563EB)
                                      : const Color(0xFF059669),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
        ),
      ],
    );
  }

  /// Open Add / Edit Delala Entry Dialog
  Future<void> _openDelalaEntryDialog([DelalaEntry? existing]) async {
    final nameCtrl = TextEditingController(text: existing != null ? cleanDelalaName(existing.delalaName) : '');
    final productCtrl = TextEditingController(text: existing?.productName ?? '');
    final priceCtrl = TextEditingController(
      text: existing != null ? existing.unitPrice.toString() : '',
    );
    final piecesCtrl = TextEditingController(
      text: existing != null ? existing.pieces.toString() : '',
    );
    int selectedSign = existing?.sign ?? 1;
    final dateCtrl = TextEditingController(
      text: existing?.transactionDate ?? _todayEthiopianText(),
    );

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (dialogCtx, setDialogState) {
            final p = double.tryParse(priceCtrl.text.trim()) ?? 0.0;
            final pcs = double.tryParse(piecesCtrl.text.trim()) ?? 0.0;
            final total = double.parse((p * pcs * selectedSign).toStringAsFixed(2));

            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              title: Row(
                children: [
                  const Icon(Icons.table_chart, color: Color(0xFF2563EB), size: 20),
                  const SizedBox(width: 8),
                  Text(
                    existing == null
                        ? (_isAmharic ? 'አዲስ መዝገብ' : 'New Entry')
                        : (_isAmharic ? 'መዝገብ አርትዕ' : 'Edit Entry'),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              content: SingleChildScrollView(
                child: SizedBox(
                  width: 360,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Name (No prefix)
                      Text(
                        _isAmharic ? '1. ስም (Name) *' : '1. Name (ስም) *',
                        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      TextField(
                        controller: nameCtrl,
                        decoration: InputDecoration(
                          hintText: 'John Doe',
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Product
                      Text(
                        _isAmharic ? '2. የዕቃ ዓይነት (Item / Product) *' : '2. Item / Product (የዕቃ ዓይነት) *',
                        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      TextField(
                        controller: productCtrl,
                        decoration: InputDecoration(
                          hintText: 'e.g. 12W Safari / 2.5 bmt',
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Price & Pieces
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _isAmharic ? '3. ዋጋ (Price ETB) *' : '3. Unit Price (ዋጋ ETB) *',
                                  style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 4),
                                TextField(
                                  controller: priceCtrl,
                                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                  onChanged: (_) => setDialogState(() {}),
                                  decoration: InputDecoration(
                                    hintText: '65',
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _isAmharic ? '4. ብዛት (Pieces) *' : '4. Pieces (ብዛት) *',
                                  style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 4),
                                TextField(
                                  controller: piecesCtrl,
                                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                  onChanged: (_) => setDialogState(() {}),
                                  decoration: InputDecoration(
                                    hintText: '10',
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Sign Selector (+ / -)
                      Text(
                        _isAmharic ? '5. ምልክት (Sign) *' : '5. Sign (ምልክት) *',
                        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: InkWell(
                              onTap: () => setDialogState(() => selectedSign = 1),
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 9),
                                decoration: BoxDecoration(
                                  color: selectedSign == 1 ? const Color(0xFF059669) : Colors.transparent,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: selectedSign == 1 ? const Color(0xFF059669) : Colors.grey.shade400,
                                  ),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  _isAmharic ? '+ ተቀባይ (+1)' : '+ Positive (+1)',
                                  style: TextStyle(
                                    color: selectedSign == 1 ? Colors.white : Colors.grey.shade700,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: InkWell(
                              onTap: () => setDialogState(() => selectedSign = -1),
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 9),
                                decoration: BoxDecoration(
                                  color: selectedSign == -1 ? const Color(0xFFE11D48) : Colors.transparent,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: selectedSign == -1 ? const Color(0xFFE11D48) : Colors.grey.shade400,
                                  ),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  _isAmharic ? '- ተከፋይ (-1)' : '- Negative (-1)',
                                  style: TextStyle(
                                    color: selectedSign == -1 ? Colors.white : Colors.grey.shade700,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Live Total Calculation
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFCBD5E1)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              _isAmharic ? '6. ድምር (ዋጋ × ብዛት × ምልክት):' : '6. Total (Price × Pcs × Sign):',
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF334155)),
                            ),
                            Text(
                              '${total >= 0 ? '+' : ''}${_currencyFormat.format(total)} ETB',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                                color: total < 0
                                    ? const Color(0xFF2563EB)
                                    : total > 0
                                    ? const Color(0xFF059669)
                                    : const Color(0xFF334155),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Ethiopian Date Text Input
                      Text(
                        _isAmharic ? '7. ቀን (የኢትዮጵያ የቀን አቆጣጠር) *' : '7. Date (Ethiopian Calendar) *',
                        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      TextField(
                        controller: dateCtrl,
                        keyboardType: TextInputType.datetime,
                        decoration: InputDecoration(
                          hintText: 'e.g. 02/11/2026 or 24/02/2018',
                          helperText: _isAmharic
                              ? 'ቀን በኢትዮጵያ አቆጣጠር ወይም በምርጫ ያስገቡ'
                              : 'Type date text or tap calendar icon',
                          helperStyle: const TextStyle(fontSize: 10, color: Colors.grey),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                          suffixIcon: IconButton(
                            icon: const Icon(
                              Icons.calendar_month_outlined,
                              size: 18,
                              color: Color(0xFF2563EB),
                            ),
                            tooltip: _isAmharic ? 'ቀን ምረጥ' : 'Pick Date',
                            onPressed: () async {
                              FocusScope.of(context).unfocus();
                              DateTime initial = DateTime.now();
                              final picked = await showDatePicker(
                                context: context,
                                initialDate: initial,
                                firstDate: DateTime(1970),
                                lastDate: DateTime(2100),
                              );
                              if (picked != null) {
                                final d = picked.day.toString().padLeft(2, '0');
                                final m = picked.month.toString().padLeft(2, '0');
                                final y = picked.year;
                                dateCtrl.text = '$d/$m/$y';
                              }
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: Text(_isAmharic ? 'ይቅር' : 'Cancel'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: () async {
                    final name = cleanDelalaName(nameCtrl.text.trim());
                    final prod = productCtrl.text.trim();
                    final date = dateCtrl.text.trim();
                    if (name.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(_isAmharic ? 'እባክዎ ስም ያስገቡ' : 'Please enter Name')),
                      );
                      return;
                    }
                    if (prod.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(_isAmharic ? 'እባክዎ የዕቃ ዓይነት ያስገቡ' : 'Please enter Item/Product name')),
                      );
                      return;
                    }
                    if (p <= 0) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(_isAmharic ? 'እባክዎ ትክክለኛ ዋጋ ያስገቡ' : 'Please enter valid unit price')),
                      );
                      return;
                    }
                    if (pcs <= 0) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(_isAmharic ? 'እባክዎ ትክክለኛ ብዛት ያስገቡ' : 'Please enter valid pieces')),
                      );
                      return;
                    }

                    Navigator.pop(ctx);
                    try {
                      if (existing != null) {
                        await ApiService.updateDelalaEntry(
                          id: existing.id,
                          delalaName: name,
                          productName: prod,
                          unitPrice: p,
                          pieces: pcs,
                          sign: selectedSign,
                          transactionDate: date,
                          storeId: _selectedStoreId,
                        );
                      } else {
                        await ApiService.createDelalaEntry(
                          delalaName: name,
                          productName: prod,
                          unitPrice: p,
                          pieces: pcs,
                          sign: selectedSign,
                          transactionDate: date,
                          storeId: _selectedStoreId,
                        );
                      }
                      await _reloadRecordsOnly();
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(existing == null ? (_isAmharic ? 'መዝገቡ ተመዝግቧል!' : 'Entry saved successfully!') : (_isAmharic ? 'መዝገቡ ታድሷል!' : 'Entry updated!')),
                            backgroundColor: const Color(0xFF059669),
                          ),
                        );
                      }
                    } catch (err) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(err.toString().replaceAll('Exception:', '').trim()), backgroundColor: const Color(0xFFBA1A1A)),
                        );
                      }
                    }
                  },
                  child: Text(existing == null ? (_isAmharic ? 'መዝግብ' : 'Save Entry') : (_isAmharic ? 'አድስ' : 'Update Entry')),
                ),
              ],
            );
          },
        );
      },
    );
  }

  /// Delete Delala Entry
  Future<void> _deleteDelalaEntry(DelalaEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Delete Entry? (መዝገቡ ይጥፋ?)', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
        content: Text('Are you sure you want to delete ${entry.delalaName} - ${entry.productName}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFE11D48), foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await ApiService.deleteDelalaEntry(entry.id);
        await _reloadRecordsOnly();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Entry deleted'), backgroundColor: Color(0xFF059669)),
          );
        }
      } catch (err) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(err.toString().replaceAll('Exception:', '').trim()), backgroundColor: const Color(0xFFBA1A1A)),
          );
        }
      }
    }
  }

  /* ------------------- Advanced Store Inventory Methods ------------------- */

  Future<void> _openNewProductDialog() async {
    final result = await showDialog<InventoryProduct>(
      context: context,
      builder: (ctx) => NewProductDialog(
        currentUser: widget.currentUser,
        activeStoreId: _selectedStoreId,
        isAmharic: _isAmharic,
      ),
    );

    if (result != null && mounted) {
      await _reloadRecordsOnly();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isAmharic
                ? '"${result.productName}" በተሳካ ሁኔታ ተመዝግቧል'
                : 'Product "${result.productName}" registered successfully',
          ),
          backgroundColor: const Color(0xFF16A34A),
        ),
      );
    }
  }

  Future<void> _openStockTransactionDialog([InventoryProduct? preselected, String initialType = 'IN']) async {
    final result = await showDialog<InventoryProduct>(
      context: context,
      builder: (ctx) => StockTransactionDialog(
        currentUser: widget.currentUser,
        activeStoreId: _selectedStoreId,
        availableProducts: _inventoryProducts,
        preselectedProduct: preselected,
        initialMovementType: initialType,
        isAmharic: _isAmharic,
      ),
    );

    if (result != null && mounted) {
      await _reloadRecordsOnly();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isAmharic
                ? 'የክምችት ዝውውር በተሳካ ሁኔታ ተመዝግቧል'
                : 'Stock movement recorded successfully',
          ),
          backgroundColor: const Color(0xFF16A34A),
        ),
      );
    }
  }

  Future<void> _openProductHistoryDialog(InventoryProduct prod) async {
    await showDialog(
      context: context,
      builder: (ctx) => ProductHistoryDialog(
        product: prod,
        isAmharic: _isAmharic,
      ),
    );
  }

  Future<void> _openEditProductDialog(InventoryProduct prod) async {
    final result = await showDialog<InventoryProduct>(
      context: context,
      builder: (ctx) => EditProductDialog(
        product: prod,
        isAmharic: _isAmharic,
      ),
    );

    if (result != null && mounted) {
      await _reloadRecordsOnly();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isAmharic ? 'የዕቃ መረጃ ተስተካክሏል' : 'Product updated successfully',
          ),
          backgroundColor: const Color(0xFF16A34A),
        ),
      );
    }
  }

  Future<void> _deleteInventoryProduct(InventoryProduct prod) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_isAmharic ? 'ዕቃ መሰረዝ' : 'Delete Product'),
        content: Text(
          _isAmharic
              ? 'እርግጠኛ ነዎት "${prod.productName}"ን መሰረዝ ይፈልጋሉ?'
              : 'Are you sure you want to delete "${prod.productName}"?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(_isAmharic ? 'ይቅር' : 'Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFDC2626),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(_isAmharic ? 'ሰርዝ' : 'Delete'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await ApiService.deleteInventoryProduct(prod.id);
        await _reloadRecordsOnly();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                _isAmharic ? 'ዕቃው ተሰርዟል' : 'Product deleted successfully',
              ),
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(e.toString().replaceAll('Exception:', '').trim()),
              backgroundColor: const Color(0xFFBA1A1A),
            ),
          );
        }
      }
    }
  }

  void _openSettingsModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        final cardColor = isDark ? const Color(0xFF1B2234) : Colors.white;
        return Container(
          decoration: BoxDecoration(
            color: cardColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    _isAmharic ? 'ቅንብሮች' : 'Settings',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Language Switch Row
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF242C40) : const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isDark ? const Color(0xFF2E384D) : const Color(0xFFE2E8F0),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isAmharic ? 'ቋንቋ (Language)' : 'Language',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: () async {
                              await LanguageService.setLanguage('en');
                              if (mounted) setState(() {});
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                color: !_isAmharic ? const Color(0xFF2563EB) : Colors.transparent,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: !_isAmharic ? const Color(0xFF2563EB) : const Color(0xFFCBD5E1),
                                ),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                'English',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: !_isAmharic ? Colors.white : (isDark ? Colors.white70 : const Color(0xFF334155)),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: InkWell(
                            onTap: () async {
                              await LanguageService.setLanguage('am');
                              if (mounted) setState(() {});
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                color: _isAmharic ? const Color(0xFF2563EB) : Colors.transparent,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: _isAmharic ? const Color(0xFF2563EB) : const Color(0xFFCBD5E1),
                                ),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                'አማርኛ',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: _isAmharic ? Colors.white : (isDark ? Colors.white70 : const Color(0xFF334155)),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (widget.currentUser.isAdmin) ...[
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.people_alt_outlined, color: Color(0xFF2563EB)),
                  title: Text(
                    _isAmharic ? 'የመደብር ሠራተኞች አስተዳደር' : 'Manage Storekeepers',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  trailing: const Icon(Icons.chevron_right, size: 20),
                  onTap: () {
                    Navigator.pop(ctx);
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const AdminUsersScreen()),
                    );
                  },
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  /// Advanced Mobile Store Inventory View (Real Inventory System)
  Widget _buildStockInventorySheet(ThemeData theme, bool isDark) {
    final gridBorderColor = isDark
        ? const Color(0xFF2E384D)
        : const Color(0xFFCBD5E1);

    final query = _searchQuery.trim().toLowerCase();
    final filteredProducts = _inventoryProducts.where((p) {
      if (query.isEmpty) return true;
      return p.productName.toLowerCase().contains(query) ||
          (p.supplierName?.toLowerCase().contains(query) ?? false) ||
          (p.description?.toLowerCase().contains(query) ?? false) ||
          (p.category.toLowerCase().contains(query));
    }).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 85),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. Available Store Items Header Bar (Occupies space naturally below search)
          Container(
            margin: const EdgeInsets.fromLTRB(14, 2, 14, 8),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF242C40) : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(7),
              border: Border.all(color: gridBorderColor, width: 1.0),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _isAmharic ? 'በመደብር ውስጥ ያሉ ዕቃዎች' : 'Available Store Items',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 12.5,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
                Text(
                  _isAmharic
                      ? '${filteredProducts.length} ዕቃዎች'
                      : '${filteredProducts.length} Products',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),

          // 2. Products List or Empty State
          if (filteredProducts.isEmpty)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 20),
              padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1B2234) : Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: gridBorderColor),
              ),
              child: Column(
                children: [
                  Icon(
                    Icons.inventory_2_outlined,
                    size: 44,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    query.isNotEmpty
                        ? (_isAmharic ? 'የሚዛመድ ዕቃ አልተገኘም' : 'No matching products found')
                        : (_isAmharic ? 'በመደብር ውስጥ የተመዘገበ ዕቃ የለም' : 'No registered products yet'),
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13.5,
                      color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _isAmharic
                        ? 'የመጀመሪያውን ዕቃ ለመመዝገብ ከታች "+ የመደብር መዝገብ" የሚለውን ይጫኑ'
                        : 'Tap "+ Store Entry" below to record inventory',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 11.5, color: Color(0xFF94A3B8)),
                  ),
                  const SizedBox(height: 10),
                  TextButton.icon(
                    onPressed: _openNewProductDialog,
                    icon: const Icon(Icons.add_box_outlined, size: 16),
                    label: Text(
                      _isAmharic ? '+ አዲስ ምርት መዝግብ' : '+ Register New Product',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                  ),
                ],
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Column(
                children: filteredProducts.map((prod) {
                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1B2234) : Colors.white,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: gridBorderColor, width: 1.0),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.03),
                          blurRadius: 3,
                          offset: const Offset(0, 1),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Product Name Title Header (Bilingual)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(14, 11, 14, 8),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  LanguageService.translateProduct(prod.productName),
                                  style: TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 14,
                                    letterSpacing: 0.2,
                                    color: theme.colorScheme.onSurface,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (prod.isOutOfStock)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFEF2F2),
                                    borderRadius: BorderRadius.circular(4),
                                    border: Border.all(color: const Color(0xFFFECACA)),
                                  ),
                                  child: Text(
                                    _isAmharic ? 'አልቋል' : 'Out of Stock',
                                    style: const TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFFDC2626),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        Divider(height: 1, color: gridBorderColor),

                        // Specifications Grid (Cartons | Pieces/Carton | Loose Pieces | Total Available | Unit Price)
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          child: Column(
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _isAmharic ? 'ካርቶን' : 'Cartons',
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w600,
                                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          '${prod.cartons}',
                                          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _isAmharic ? 'በካርቶን ፍሬ' : 'Pieces per Carton',
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w600,
                                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          '${prod.pcsPerCarton.toInt()}',
                                          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _isAmharic ? 'ተርፍ ፍሬ' : 'Loose Pieces',
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w600,
                                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          '${prod.loosePieces}',
                                          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _isAmharic ? 'ያለው ጠቅላላ' : 'Total Available',
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w600,
                                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          _isAmharic
                                              ? '${NumberFormat('#,##0').format(prod.totalPieces)} ፍሬ'
                                              : '${NumberFormat('#,##0').format(prod.totalPieces)} Pieces',
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w900,
                                            color: theme.colorScheme.onSurface,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _isAmharic ? 'የአንዱ ዋጋ' : 'Unit Price',
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w600,
                                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          '${_currencyFormat.format(prod.unitPrice > 0 ? prod.unitPrice : prod.costPrice)} ETB',
                                          style: TextStyle(
                                            fontSize: 13.5,
                                            fontWeight: FontWeight.w900,
                                            color: theme.colorScheme.onSurface,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        Divider(height: 1, color: gridBorderColor),

                        // Product Action Buttons: Add / Out | Edit | History | Delete
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          child: Row(
                            children: [
                              // 1. Add / Out
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () => _openStockTransactionDialog(prod),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: isDark ? Colors.white : const Color(0xFF1E293B),
                                    side: BorderSide(color: gridBorderColor),
                                    padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                  ),
                                  icon: const Icon(Icons.swap_horiz, size: 14),
                                  label: Text(
                                    _isAmharic ? 'ገቢ / ወጪ' : 'Add / Out',
                                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              // 2. Edit
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () => _openEditProductDialog(prod),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: isDark ? Colors.white : const Color(0xFF1E293B),
                                    side: BorderSide(color: gridBorderColor),
                                    padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                  ),
                                  icon: const Icon(Icons.edit_outlined, size: 14),
                                  label: Text(
                                    _isAmharic ? 'አስተካክል' : 'Edit',
                                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              // 3. History
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () => _openProductHistoryDialog(prod),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: isDark ? Colors.white : const Color(0xFF1E293B),
                                    side: BorderSide(color: gridBorderColor),
                                    padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                  ),
                                  icon: const Icon(Icons.history, size: 14),
                                  label: Text(
                                    _isAmharic ? 'ታሪክ' : 'History',
                                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              // 4. Delete
                              OutlinedButton(
                                onPressed: () => _deleteInventoryProduct(prod),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                  side: BorderSide(color: gridBorderColor),
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                  minimumSize: const Size(36, 32),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                ),
                                child: const Icon(Icons.delete_outline, size: 16),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
        ],
      ),
    );
  }

  /// Authentic Excel Spreadsheet Table View matching the User's Excel Ledger
  Widget _buildRecordTable(LedgerRecord rec, ThemeData theme, bool isDark) {
    final isExpanded = _expandedRecordIds.contains(rec.id);

    // Grid border color for card separators
    final gridBorderColor = isDark
        ? const Color(0xFF2E384D)
        : const Color(0xFFCBD5E1);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1B2234) : Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: gridBorderColor, width: 1.2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Card Header (mobile friendly): chevron + type badge + name + date | Net Balance + actions
          InkWell(
            onTap: () => _toggleRecordExpanded(rec.id),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(7)),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
              decoration: BoxDecoration(
                color: isDark
                    ? const Color(0xFF242C40)
                    : const Color(0xFFF8FAFC),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(7),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Expand / Collapse chevron
                  Icon(
                    isExpanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    size: 22,
                    color: isDark
                        ? const Color(0xFF94A3B8)
                        : const Color(0xFF64748B),
                  ),
                  const SizedBox(width: 4),

                  // Name and date / notes (no type badge)
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        InkWell(
                          onTap: () => _openStatement(rec),
                          child: Text(
                            rec.title,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: theme.colorScheme.onSurface,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          rec.notes != null && rec.notes!.isNotEmpty
                              ? '${rec.date} · ${rec.notes}'
                              : rec.date,
                          style: TextStyle(
                            fontSize: 10.5,
                            color: isDark
                                ? const Color(0xFF94A3B8)
                                : const Color(0xFF64748B),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 6),

                  // Right: Net Balance + eye icon + actions
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        rec.type == 'stock' ? 'STOCK TOTAL' : 'NET BALANCE',
                        style: TextStyle(
                          fontSize: 8.5,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                          color: isDark
                              ? const Color(0xFF94A3B8)
                              : const Color(0xFF64748B),
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        'ETB ${_currencyFormat.format(rec.balance)}',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (rec.type == 'customer' ||
                              rec.type == 'supplier' ||
                              rec.type == 'delala') ...[
                            IconButton(
                              icon: const Icon(
                                Icons.visibility_outlined,
                                size: 19,
                                color: Color(0xFF2563EB),
                              ),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(
                                minWidth: 28,
                                minHeight: 28,
                              ),
                              tooltip: 'View Statement Details',
                              onPressed: () => _openStatement(rec),
                            ),
                            const SizedBox(width: 4),
                          ],
                          IconButton(
                            icon: const Icon(Icons.more_vert, size: 18),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(
                              minWidth: 28,
                              minHeight: 28,
                            ),
                            tooltip: 'Actions',
                            onPressed: () => _showRecordActions(rec),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // Expanded body: Authentic Table View matching Image 5
          if (isExpanded) ...[
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF161D2E) : Colors.white,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: gridBorderColor, width: 1.0),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(5),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Table Header Row matching Image 5
                    // # | የዕቃው አይነት | ዋጋ | ብዛት | ድምር
                    Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 8,
                        horizontal: 4,
                      ),
                      decoration: BoxDecoration(
                        color: isDark
                            ? const Color(0xFF1E293B)
                            : const Color(0xFFF1F5F9),
                        border: Border(
                          bottom: BorderSide(
                            color: gridBorderColor,
                            width: 1.0,
                          ),
                        ),
                      ),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 24,
                            child: Text(
                              '#',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: isDark
                                    ? const Color(0xFFCBD5E1)
                                    : const Color(0xFF334155),
                              ),
                            ),
                          ),
                          Container(
                            width: 1,
                            height: 16,
                            color: gridBorderColor,
                          ),
                          Expanded(
                            flex: 12,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                              ),
                              child: Text(
                                'የዕቃው አይነት',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isDark
                                      ? const Color(0xFFCBD5E1)
                                      : const Color(0xFF334155),
                                ),
                              ),
                            ),
                          ),
                          Container(
                            width: 1,
                            height: 16,
                            color: gridBorderColor,
                          ),
                          Expanded(
                            flex: 7,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              child: Text(
                                'ዋጋ',
                                textAlign: TextAlign.right,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isDark
                                      ? const Color(0xFFCBD5E1)
                                      : const Color(0xFF334155),
                                ),
                              ),
                            ),
                          ),
                          Container(
                            width: 1,
                            height: 16,
                            color: gridBorderColor,
                          ),
                          Expanded(
                            flex: 5,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              child: Text(
                                'ብዛት',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isDark
                                      ? const Color(0xFFCBD5E1)
                                      : const Color(0xFF334155),
                                ),
                              ),
                            ),
                          ),
                          Container(
                            width: 1,
                            height: 16,
                            color: gridBorderColor,
                          ),
                          Expanded(
                            flex: 8,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                              ),
                              child: Text(
                                'ድምር',
                                textAlign: TextAlign.right,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isDark
                                      ? const Color(0xFFCBD5E1)
                                      : const Color(0xFF334155),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Table Data Rows
                    ...rec.items.asMap().entries.map((entry) {
                      final itemIdx = entry.key + 1;
                      final item = entry.value;
                      final subtotal = item.subtotal;

                      final bank =
                          (item.paymentMethod != null &&
                              item.paymentMethod!.isNotEmpty)
                          ? item.paymentMethod
                          : item.bank;
                      final ctns = item.cartons ?? 0;
                      final pcs = item.pcsPerCarton ?? 0;
                      final unit =
                          item.packagingUnit ?? (ctns > 0 ? 'Carton' : 'Pcs');
                      final isPayment = item.sign == '-';
                      final packDetail = isPayment
                          ? (bank != null && bank.isNotEmpty
                                ? 'Bank: $bank'
                                : null)
                          : (unit == 'Carton' && ctns > 0 && pcs > 0
                                ? '${ctns.toInt()} ctn × ${pcs.toInt()} pcs'
                                : (ctns > 0
                                      ? '${ctns.toInt()} $unit'
                                      : (item.quantity > 0 && unit != 'Pcs'
                                            ? '${item.quantity.toInt()} $unit'
                                            : null)));

                      return Container(
                        padding: const EdgeInsets.symmetric(
                          vertical: 7,
                          horizontal: 4,
                        ),
                        decoration: BoxDecoration(
                          color: (itemIdx % 2 == 0)
                              ? (isDark
                                    ? const Color(0xFF1E2638)
                                    : const Color(0xFFFAFAFA))
                              : (isDark
                                    ? const Color(0xFF161D2E)
                                    : Colors.white),
                          border: Border(
                            bottom: BorderSide(
                              color: gridBorderColor,
                              width: 0.8,
                            ),
                          ),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            // #
                            SizedBox(
                              width: 24,
                              child: Text(
                                '$itemIdx',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w600,
                                  color: isDark
                                      ? const Color(0xFF94A3B8)
                                      : const Color(0xFF64748B),
                                ),
                              ),
                            ),
                            Container(
                              width: 1,
                              height: 28,
                              color: gridBorderColor,
                            ),

                            // የዕቃው አይነት (Item)
                            Expanded(
                              flex: 12,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      item.name,
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: theme.colorScheme.onSurface,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    Builder(
                                      builder: (context) {
                                        final subDetails = <String>[];
                                        if (packDetail != null &&
                                            packDetail.isNotEmpty) {
                                          subDetails.add(packDetail);
                                        }
                                        if (item.date != null &&
                                            item.date!.isNotEmpty) {
                                          subDetails.add(item.date!);
                                        }
                                        if (item.notes != null &&
                                            item.notes!.isNotEmpty) {
                                          subDetails.add(item.notes!);
                                        } else if (item.reference != null &&
                                            item.reference!.isNotEmpty) {
                                          subDetails.add(item.reference!);
                                        }
                                        if (subDetails.isEmpty) {
                                          return const SizedBox.shrink();
                                        }

                                        return Text(
                                          subDetails.join(' · '),
                                          style: TextStyle(
                                            fontSize: 9.5,
                                            color: isDark
                                                ? const Color(0xFF94A3B8)
                                                : const Color(0xFF64748B),
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        );
                                      },
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            Container(
                              width: 1,
                              height: 28,
                              color: gridBorderColor,
                            ),

                            // ዋጋ (Price)
                            Expanded(
                              flex: 7,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                ),
                                child: Text(
                                  _currencyFormat.format(item.unitPrice),
                                  textAlign: TextAlign.right,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    fontFamily: 'monospace',
                                    color: theme.colorScheme.onSurface,
                                  ),
                                ),
                              ),
                            ),
                            Container(
                              width: 1,
                              height: 28,
                              color: gridBorderColor,
                            ),

                            // ብዛት (Qty)
                            Expanded(
                              flex: 5,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                ),
                                child: Text(
                                  item.sign == '-'
                                      ? '-${item.quantity.toInt()}'
                                      : '${item.quantity.toInt()}',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    fontFamily: 'monospace',
                                    color: theme.colorScheme.onSurface,
                                  ),
                                ),
                              ),
                            ),
                            Container(
                              width: 1,
                              height: 28,
                              color: gridBorderColor,
                            ),

                            // ድምር (Total)
                            Expanded(
                              flex: 8,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                ),
                                child: Text(
                                  item.sign == '-'
                                      ? '-${_currencyFormat.format(subtotal)}'
                                      : _currencyFormat.format(subtotal),
                                  textAlign: TextAlign.right,
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w800,
                                    fontFamily: 'monospace',
                                    color: theme.colorScheme.onSurface,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),

                    // ጠቅላላ ድምር Footer Row (exactly like Image 5)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 9,
                        horizontal: 8,
                      ),
                      decoration: BoxDecoration(
                        color: isDark
                            ? const Color(0xFF1E293B)
                            : const Color(0xFFF1F5F9),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'ጠቅላላ ድምር',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          Text(
                            rec.balance < 0
                                ? '-${_currencyFormat.format(rec.balance.abs())}'
                                : _currencyFormat.format(rec.balance),
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w900,
                              fontFamily: 'monospace',
                              color: theme.colorScheme.onSurface,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Subtotal Footer Summary
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isDark
                    ? const Color(0xFF242C40)
                    : const Color(0xFFE2E8F0),
                borderRadius: const BorderRadius.vertical(
                  bottom: Radius.circular(7),
                ),
                border: Border(
                  top: BorderSide(color: gridBorderColor, width: 1.2),
                ),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Goods (Debit +)',
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: isDark
                              ? const Color(0xFF94A3B8)
                              : const Color(0xFF334155),
                        ),
                      ),
                      Text(
                        'ETB ${_currencyFormat.format(rec.totalDebit)}',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 11.5,
                          fontFamily: 'monospace',
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Paid (Credit −)',
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: isDark
                              ? const Color(0xFF94A3B8)
                              : const Color(0xFF334155),
                        ),
                      ),
                      Text(
                        'ETB ${_currencyFormat.format(rec.totalCredit)}',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 11.5,
                          fontFamily: 'monospace',
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Outstanding Balance (ቀሪ)',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 11.5,
                        ),
                      ),
                      Text(
                        'ETB ${_currencyFormat.format(rec.balance)}',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 13,
                          fontFamily: 'monospace',
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final records = _filteredRecords;

    return Scaffold(
      backgroundColor: isDark
          ? const Color(0xFF131B2E)
          : const Color(0xFFFAF8FF),
      appBar: AppBar(
        backgroundColor: isDark
            ? const Color(0xFF182036)
            : const Color(0xFFFFFFFF),
        elevation: 0.5,
        titleSpacing: 12,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
          statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
        ),
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFF2563EB).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.storefront_rounded,
                color: Color(0xFF2563EB),
                size: 18,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.currentUser.isAdmin)
                    DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value:
                            (_selectedStoreId == 'all' ||
                                _stores.any((s) => s.id == _selectedStoreId))
                            ? _selectedStoreId
                            : 'all',
                        isDense: true,
                        isExpanded: true,
                        dropdownColor: theme.colorScheme.surface,
                        icon: Icon(
                          Icons.arrow_drop_down,
                          size: 18,
                          color: isDark
                              ? const Color(0xFF94A3B8)
                              : const Color(0xFF64748B),
                        ),
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                          color: theme.colorScheme.onSurface,
                          letterSpacing: -0.2,
                        ),
                        items: [
                          const DropdownMenuItem(
                            value: 'all',
                            child: Text('All Stores'),
                          ),
                          ..._stores.map(
                            (s) => DropdownMenuItem(
                              value: s.id,
                              child: Text(
                                s.name,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ],
                        onChanged: _onStoreChanged,
                      ),
                    )
                  else
                    Text(
                      _activeStoreLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                        color: theme.colorScheme.onSurface,
                        letterSpacing: -0.2,
                      ),
                    ),
                  Text(
                    _currentTabLabel,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: isDark
                          ? const Color(0xFF94A3B8)
                          : const Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          // Settings icon
          IconButton(
            icon: Icon(
              Icons.settings_outlined,
              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF1E293B),
              size: 20,
            ),
            tooltip: _isAmharic ? 'ቅንብሮች' : 'Settings',
            onPressed: _openSettingsModal,
          ),

          // Sign out / Logout icon
          IconButton(
            icon: const Icon(
              Icons.logout_rounded,
              color: Color(0xFFBA1A1A),
              size: 19,
            ),
            tooltip: _isAmharic ? 'ውጣ' : 'Sign Out',
            onPressed: _handleLogout,
          ),
        ],
      ),

      // BOTTOM NAVIGATION TABS
      // Admin: Customer, Supplier, Delala, Store. Storekeeper: Store only (no bottom bar needed).
      bottomNavigationBar: widget.currentUser.isStorekeeper
          ? null
          : Container(
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(
                    color: isDark ? const Color(0xFF2E384D) : const Color(0xFFDAE2FD),
                    width: 1,
                  ),
                ),
              ),
              child: BottomNavigationBar(
                currentIndex: _currentTabIndex,
                onTap: (index) {
                  setState(() {
                    _currentTabIndex = index;
                  });
                },
                selectedItemColor: isDark
                    ? const Color(0xFF93C5FD)
                    : const Color(0xFF2563EB),
                unselectedItemColor: isDark
                    ? const Color(0xFF94A3B8)
                    : const Color(0xFF64748B),
                selectedLabelStyle: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 11.5,
                ),
                unselectedLabelStyle: const TextStyle(fontSize: 11),
                type: BottomNavigationBarType.fixed,
                backgroundColor: isDark ? const Color(0xFF182036) : Colors.white,
                elevation: 6,
                items: [
                  BottomNavigationBarItem(
                    icon: const Icon(Icons.people_outline),
                    activeIcon: const Icon(Icons.people),
                    label: _isAmharic ? 'ደንበኛ' : 'Customer',
                  ),
                  BottomNavigationBarItem(
                    icon: const Icon(Icons.business_outlined),
                    activeIcon: const Icon(Icons.business),
                    label: _isAmharic ? 'አቅራቢ' : 'Supplier',
                  ),
                  BottomNavigationBarItem(
                    icon: const Icon(Icons.handshake_outlined),
                    activeIcon: const Icon(Icons.handshake),
                    label: _isAmharic ? 'ደላላ' : 'Delala',
                  ),
                  BottomNavigationBarItem(
                    icon: const Icon(Icons.inventory_2_outlined),
                    activeIcon: const Icon(Icons.inventory_2),
                    label: _isAmharic ? 'መደብር' : 'Store',
                  ),
                ],
              ),
            ),

      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _reloadRecordsOnly,
              child: Column(
                children: [
                  // Search Bar directly at the top of the screen content
                  Container(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
                    child: TextField(
                      controller: _searchController,
                      style: TextStyle(
                        fontSize: 12,
                        color: theme.colorScheme.onSurface,
                      ),
                      decoration: InputDecoration(
                        hintText: _currentTabIndex == 3
                            ? (_isAmharic ? 'የመደብር ዕቃዎችን በስም ወይም በዝርዝር ፈልግ...' : 'Search Store Inventory by name, item...')
                            : _currentTabIndex == 2
                            ? (_isAmharic ? 'በስም ወይም በዕቃ ፈልግ...' : 'Search by name or product...')
                            : (_isAmharic ? 'በስም ወይም በማስታወሻ ፈልግ...' : 'Search $_currentTabLabel by name, item...'),
                        hintStyle: TextStyle(
                          fontSize: 11.5,
                          color: isDark
                              ? const Color(0xFF64748B)
                              : const Color(0xFF94A3B8),
                        ),
                        prefixIcon: Icon(
                          Icons.search,
                          size: 16,
                          color: isDark
                              ? const Color(0xFF64748B)
                              : const Color(0xFF94A3B8),
                        ),
                        suffixIcon: _searchQuery.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear, size: 14),
                                onPressed: () {
                                  _searchController.clear();
                                  setState(() => _searchQuery = '');
                                },
                              )
                            : null,
                        filled: true,
                        fillColor: isDark
                            ? const Color(0xFF1B2234)
                            : Colors.white,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 7,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(
                            color: isDark
                                ? const Color(0xFF2E384D)
                                : const Color(0xFFDAE2FD),
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(
                            color: isDark
                                ? const Color(0xFF2E384D)
                                : const Color(0xFFDAE2FD),
                          ),
                        ),
                      ),
                      onChanged: (val) {
                        setState(() => _searchQuery = val);
                      },
                    ),
                  ),

                  // Stitch Statement Summary Card (for Customer/Supplier only)
                  if (_currentTabIndex != 3 && _currentTabIndex != 2)
                    _buildStatementSummary(theme, isDark),

                  // Store summary card removed per requirements

                  // Content view: Store Inventory on Hand for Stock; Delala Ledger for Delala; Excel Ledgers for Parties
                  Expanded(
                    child: _currentTabIndex == 3
                        ? _buildStockInventorySheet(theme, isDark)
                        : _currentTabIndex == 2
                        ? _buildDelalaSpreadsheet(theme, isDark)
                        : (records.isEmpty
                              ? (_errorMessage != null
                                    ? Center(
                                        child: Padding(
                                          padding: const EdgeInsets.all(24.0),
                                          child: Column(
                                            mainAxisAlignment:
                                                MainAxisAlignment.center,
                                            children: [
                                              const Icon(
                                                Icons.cloud_off_rounded,
                                                size: 42,
                                                color: Color(0xFFBA1A1A),
                                              ),
                                              const SizedBox(height: 12),
                                              const Text(
                                                'Online Connection Required',
                                                style: TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 14,
                                                ),
                                              ),
                                              const SizedBox(height: 6),
                                              Text(
                                                _errorMessage!,
                                                textAlign: TextAlign.center,
                                                style: TextStyle(
                                                  fontSize: 11.5,
                                                  color: isDark
                                                      ? const Color(0xFF94A3B8)
                                                      : const Color(0xFF64748B),
                                                ),
                                              ),
                                              const SizedBox(height: 16),
                                              ElevatedButton.icon(
                                                onPressed: _loadStoresAndRecords,
                                                style: ElevatedButton.styleFrom(
                                                  backgroundColor: const Color(
                                                    0xFF2563EB,
                                                  ),
                                                  foregroundColor: Colors.white,
                                                ),
                                                icon: const Icon(
                                                  Icons.refresh,
                                                  size: 16,
                                                ),
                                                label: const Text(
                                                  'Retry Connection',
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      )
                                    : Center(
                                        child: Column(
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            Icon(
                                              Icons.table_chart_outlined,
                                              size: 38,
                                              color: Colors.grey.shade400,
                                            ),
                                            const SizedBox(height: 8),
                                            Text(
                                              _isAmharic
                                                  ? 'ምንም $_currentTabLabel አልተገኘም'
                                                  : 'No $_currentTabLabel entries found',
                                              style: TextStyle(
                                                fontWeight: FontWeight.bold,
                                                fontSize: 13.5,
                                                color: isDark
                                                    ? const Color(0xFF94A3B8)
                                                    : const Color(0xFF64748B),
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              _isAmharic
                                                  ? 'አዲስ መዝገብ ለማስገባት "+" ይጫኑ'
                                                  : 'Tap "+" to add a new transaction entry',
                                              style: const TextStyle(
                                                fontSize: 11.5,
                                                color: Color(0xFF94A3B8),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ))
                              : ListView.builder(
                                  padding: const EdgeInsets.only(bottom: 75),
                                  itemCount: records.length,
                                  itemBuilder: (ctx, index) {
                                    return _buildRecordTable(
                                      records[index],
                                      theme,
                                      isDark,
                                    );
                                  },
                                )),
                  ),
                ],
              ),
            ),

      // Floating Add Transaction / Store Entry Button
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF2563EB), // Primary Blue
        foregroundColor: Colors.white,
        elevation: 3,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        icon: const Icon(Icons.add, size: 18),
        label: Text(
          _currentTabIndex == 3
              ? (_isAmharic ? 'የመደብር መዝገብ' : 'Store Entry')
              : _currentTabIndex == 2
              ? (_isAmharic ? 'የደላላ መዝገብ' : 'Broker Entry')
              : _currentTabIndex == 1
              ? (_isAmharic ? 'የአቅራቢ መዝገብ' : 'Supplier Entry')
              : (_isAmharic ? 'የደንበኛ መዝገብ' : 'Customer Entry'),
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        ),
        onPressed: _currentTabIndex == 3
            ? () => _openStockTransactionDialog()
            : _currentTabIndex == 2
            ? () => _openDelalaEntryDialog()
            : _openCreateRecordDialog,
      ),
    );
  }
}
