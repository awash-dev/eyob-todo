import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../models/user.dart';
import '../models/shop.dart';
import '../models/ledger_record.dart';
import '../models/line_item.dart';
import '../services/api_service.dart';
import 'login_screen.dart';
import 'record_form_dialog.dart';
import 'statement_screen.dart';

class MainScreen extends StatefulWidget {
  final AppUser currentUser;

  const MainScreen({super.key, required this.currentUser});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  final _currencyFormat = NumberFormat('#,##0.00', 'en_US');

  // Tabs: 0: Customer, 1: Supplier, 2: Delala, 3: Stocks
  int _currentTabIndex = 0;
  List<Shop> _shops = [];
  String? _selectedShopId;
  List<LedgerRecord> _records = [];
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

    // All roles see the 4 tabs: Customer, Supplier, Delala, Store (opens on Customer)
    _currentTabIndex = 0;
    if (widget.currentUser.isShopkeeper) {
      _selectedShopId = widget.currentUser.shopId ?? 'shop-1';
    } else {
      _selectedShopId = 'all';
    }

    _loadShopsAndRecords();
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
    switch (_currentTabIndex) {
      case 0:
        return 'Customer Credit';
      case 1:
        return 'Supplier Credit';
      case 2:
        return 'Delala Credit';
      case 3:
        return 'Store Inventory';
      default:
        return 'Customer Credit';
    }
  }

  Future<void> _loadShopsAndRecords() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final shops = await ApiService.getShops();
      final records = await ApiService.getRecords(shopId: _selectedShopId);
      if (mounted) {
        setState(() {
          _shops = shops;
          _records = records;
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
      final records = await ApiService.getRecords(shopId: _selectedShopId);
      if (mounted) {
        setState(() {
          _records = records;
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

  void _onShopChanged(String? newShopId) {
    if (widget.currentUser.isShopkeeper) return;
    setState(() {
      _selectedShopId = newShopId;
    });
    _reloadRecordsOnly();
  }

  List<LedgerRecord> get _filteredRecords {
    final type = _currentTabType;
    return _records.where((r) {
      if (r.type != type) return false;
      if (_selectedShopId != null &&
          _selectedShopId != 'all' &&
          r.shopId != null &&
          r.shopId != _selectedShopId) {
        return false;
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
        shopId: widget.currentUser.isShopkeeper
            ? widget.currentUser.shopId
            : (_selectedShopId == 'all' ? 'shop-1' : _selectedShopId),
      ),
    );

    if (result != null) {
      try {
        // Smart merge: if party ledger already exists in this shop, append the new transaction rows
        final existingIdx = _records.indexWhere(
          (r) =>
              r.type == result.type &&
              r.title.trim().toLowerCase() ==
                  result.title.trim().toLowerCase() &&
              (r.shopId == result.shopId ||
                  r.shopId == null ||
                  result.shopId == null),
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
          await ApiService.createRecord(result, shopId: result.shopId);
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
        shopId: record.shopId,
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
          shopId: record.shopId,
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
                              color: record.balance >= 0
                                  ? (isDark
                                        ? const Color(0xFF93C5FD)
                                        : const Color(0xFF2563EB))
                                  : (isDark
                                        ? const Color(0xFFFFB4AB)
                                        : const Color(0xFFBA1A1A)),
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
                        color: netBalance >= 0
                            ? (isDark
                                  ? const Color(0xFF93C5FD)
                                  : const Color(0xFF2563EB))
                            : (isDark
                                  ? const Color(0xFFFFB4AB)
                                  : const Color(0xFFBA1A1A)),
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

  Widget _buildStatColumn(String label, String value, bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 10.5,
            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }



  /// Store Inventory on Hand View (Showing how much store items have, matching Storekeeper requirement)
  Widget _buildStockInventorySheet(ThemeData theme, bool isDark) {
    final gridBorderColor = isDark
        ? const Color(0xFF2E384D)
        : const Color(0xFFCBD5E1);

    // Filter stock records by shop and search query
    final stockRecords = _records.where((r) {
      if (r.type != 'stock') return false;
      if (_selectedShopId != null &&
          _selectedShopId != 'all' &&
          r.shopId != null &&
          r.shopId != _selectedShopId) {
        return false;
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

    // Flatten all items into Store Inventory items
    final List<_StockInventoryItem> items = [];
    for (final rec in stockRecords) {
      if (rec.items.isEmpty) {
        items.add(
          _StockInventoryItem(
            record: rec,
            itemName: rec.title,
            cartons: 0,
            pcsPerCarton: 0,
            totalQty: 1,
            unitPrice: rec.totalAmount,
            totalValue: rec.totalAmount,
            packagingUnit: 'Pcs',
            date: rec.date,
            notes: rec.notes,
            sign: '+',
          ),
        );
      } else {
        for (final item in rec.items) {
          final ctns = item.cartons ?? 0.0;
          final pcs = item.pcsPerCarton ?? 0.0;
          final unit = item.packagingUnit ?? (ctns > 0 ? 'Carton' : 'Pcs');
          double qty = item.quantity;
          if (unit == 'Carton' && ctns > 0 && pcs > 0) {
            qty = ctns * pcs;
          }
          final price = item.unitPrice;
          double value = item.subtotal;
          if (value <= 0) {
            value = (unit == 'Carton' && ctns > 0 && pcs > 0)
                ? (ctns * pcs * price)
                : (qty * price);
          }

          items.add(
            _StockInventoryItem(
              record: rec,
              lineItem: item,
              itemName: item.name.isNotEmpty ? item.name : rec.title,
              cartons: ctns,
              pcsPerCarton: pcs,
              totalQty: qty,
              unitPrice: price,
              totalValue: value,
              packagingUnit: unit,
              date: item.date ?? rec.date,
              notes: item.notes ?? rec.notes,
              sign: item.sign,
            ),
          );
        }
      }
    }

    // Store Inventory Totals — signed so Stock Out (-) decrements on-hand
    final distinctNames = items
        .map((i) => i.itemName.toLowerCase().trim())
        .toSet();
    final double totalCartons = items.fold(0.0, (s, i) => s + i.signedCartons);
    final double totalPieces = items.fold(0.0, (s, i) => s + i.signedQty);
    final double totalValuation = items.fold(0.0, (s, i) => s + i.signedValue);
    // Gross movement (for the footer summary)
    final double grossInValue = items
        .where((i) => !i.isOut)
        .fold(0.0, (s, i) => s + i.totalValue);
    final double grossOutValue = items
        .where((i) => i.isOut)
        .fold(0.0, (s, i) => s + i.totalValue);

    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 85),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Store Inventory Summary Header Card
          Container(
            margin: const EdgeInsets.fromLTRB(14, 4, 14, 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1B2234) : Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: gridBorderColor),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.warehouse_outlined,
                          size: 18,
                          color: Color(0xFF2563EB),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Store Inventory on Hand',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13.5,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      'ETB ${_currencyFormat.format(totalValuation)}',
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w900,
                        color: isDark
                            ? const Color(0xFF93C5FD)
                            : const Color(0xFF2563EB),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Divider(height: 1, thickness: 0.8, color: gridBorderColor),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _buildStatColumn(
                      'Products in Store',
                      '${distinctNames.length} items',
                      isDark,
                    ),
                    _buildStatColumn(
                      'Cartons on Hand',
                      '${totalCartons.toInt()} cartons',
                      isDark,
                    ),
                    _buildStatColumn(
                      'Total Pieces',
                      '${totalPieces.toInt()} pcs',
                      isDark,
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Inventory Table or Empty State
          if (items.isEmpty)
            Container(
              margin: const EdgeInsets.all(24),
              padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
              alignment: Alignment.center,
              child: _errorMessage != null
                  ? Column(
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
                          onPressed: _loadShopsAndRecords,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2563EB),
                            foregroundColor: Colors.white,
                          ),
                          icon: const Icon(Icons.refresh, size: 16),
                          label: const Text('Retry Connection'),
                        ),
                      ],
                    )
                  : Column(
                      children: [
                        Icon(
                          Icons.inventory_2_outlined,
                          size: 48,
                          color: Colors.grey.shade400,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'No items in store inventory',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                            color: isDark
                                ? const Color(0xFF94A3B8)
                                : const Color(0xFF64748B),
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Tap "+ Store" below to record items in store',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                        ),
                      ],
                    ),
            )
          else
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
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
                  // Table Header Bar
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: isDark
                          ? const Color(0xFF242C40)
                          : const Color(0xFFF1F5F9),
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(7),
                      ),
                      border: Border(
                        bottom: BorderSide(color: gridBorderColor, width: 1.2),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Available Store Items (በመጋዘን ያለው ዕቃ)',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 12.5,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                        Text(
                          '${items.length} items',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: isDark
                                ? const Color(0xFF94A3B8)
                                : const Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Mobile-friendly item cards (clear display on phones — no squeeze)
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    child: Column(
                      children: items.asMap().entries.map((entry) {
                        final idx = entry.key + 1;
                        final it = entry.value;

                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF161D2E) : Colors.white,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: isDark ? const Color(0xFF2E384D) : const Color(0xFFCBD5E1),
                              width: 1.0,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              // Header: Index + Item Name + Subtitle + Action buttons
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                decoration: BoxDecoration(
                                  color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(7)),
                                  border: Border(
                                    bottom: BorderSide(
                                      color: isDark ? const Color(0xFF2E384D) : const Color(0xFFE2E8F0),
                                      width: 0.8,
                                    ),
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Text(
                                      '#$idx',
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w800,
                                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Flexible(
                                                child: Text(
                                                  it.itemName,
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.w800,
                                                    fontSize: 13.5,
                                                    color: theme.colorScheme.onSurface,
                                                  ),
                                                ),
                                              ),
                                              if (it.isOut) ...[
                                                const SizedBox(width: 6),
                                                const Text(
                                                  '(Stock Out)',
                                                  style: TextStyle(
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.w700,
                                                    color: Color(0xFFBA1A1A),
                                                  ),
                                                ),
                                              ],
                                            ],
                                          ),
                                          if (it.notes != null && it.notes!.isNotEmpty)
                                            Padding(
                                              padding: const EdgeInsets.only(top: 2),
                                              child: Text(
                                                it.notes!,
                                                style: TextStyle(
                                                  fontSize: 10.5,
                                                  color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                        ],
                                      ),
                                    ),
                                    IconButton(
                                      icon: Icon(
                                        Icons.edit_outlined,
                                        size: 16,
                                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
                                      ),
                                      padding: EdgeInsets.zero,
                                      constraints: const BoxConstraints(),
                                      tooltip: 'Edit Store',
                                      onPressed: () => _openEditRecordDialog(it.record),
                                    ),
                                    const SizedBox(width: 12),
                                    IconButton(
                                      icon: Icon(
                                        Icons.delete_outline,
                                        size: 16,
                                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
                                      ),
                                      padding: EdgeInsets.zero,
                                      constraints: const BoxConstraints(),
                                      tooltip: 'Delete Store',
                                      onPressed: () => _deleteRecord(it.record),
                                    ),
                                  ],
                                ),
                              ),

                              // Metric Cells (Cartons | Pcs/Ctn | Qty | Unit Price)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'ካርቶን (Cartons)',
                                            style: TextStyle(
                                              fontSize: 9.5,
                                              fontWeight: FontWeight.w600,
                                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            it.cartons > 0 ? '${it.cartons.toInt()}' : '-',
                                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'በካርቶን (Pcs/Ctn)',
                                            style: TextStyle(
                                              fontSize: 9.5,
                                              fontWeight: FontWeight.w600,
                                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            it.pcsPerCarton > 0 ? '${it.pcsPerCarton.toInt()}' : '-',
                                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'ብዛት (Qty)',
                                            style: TextStyle(
                                              fontSize: 9.5,
                                              fontWeight: FontWeight.w600,
                                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            '${it.signedQty.toInt()} ${it.packagingUnit == "Carton" ? "pcs" : it.packagingUnit}',
                                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          Text(
                                            'ዋጋ (Unit)',
                                            style: TextStyle(
                                              fontSize: 9.5,
                                              fontWeight: FontWeight.w600,
                                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            _currencyFormat.format(it.unitPrice),
                                            style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w700,
                                              fontFamily: 'monospace',
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),

                              // Bottom Bar: Date & Total Value
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                                decoration: BoxDecoration(
                                  color: isDark ? const Color(0xFF1E2638) : const Color(0xFFF8FAFC),
                                  borderRadius: const BorderRadius.vertical(bottom: Radius.circular(7)),
                                  border: Border(
                                    top: BorderSide(
                                      color: isDark ? const Color(0xFF2E384D) : const Color(0xFFE2E8F0),
                                      width: 0.8,
                                    ),
                                  ),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      it.date,
                                      style: TextStyle(
                                        fontSize: 10.5,
                                        fontFamily: 'monospace',
                                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                      ),
                                    ),
                                    Row(
                                      children: [
                                        Text(
                                          'ድምር ዋጋ: ',
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w600,
                                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
                                          ),
                                        ),
                                        Text(
                                          'ETB ${_currencyFormat.format(it.signedValue)}',
                                          style: TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w900,
                                            fontFamily: 'monospace',
                                            color: it.isOut ? const Color(0xFFBA1A1A) : const Color(0xFF1D4ED8),
                                          ),
                                        ),
                                      ],
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

                  // Table Footer Summary Bar
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
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
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Store Net Value (ጠቅላላ ድምር)',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 11.5,
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              'Net: ETB ${_currencyFormat.format(totalValuation)}',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 11.5,
                                color: totalValuation >= 0
                                    ? const Color(0xFF2563EB)
                                    : const Color(0xFFBA1A1A),
                              ),
                            ),
                            const SizedBox(height: 1),
                            Text(
                              'In: ${_currencyFormat.format(grossInValue)}  ·  Out: ${_currencyFormat.format(grossOutValue)}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 9.5,
                                color: Color(0xFF64748B),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// Authentic Excel Spreadsheet Table View matching the User's Excel Ledger
  Widget _buildRecordTable(LedgerRecord rec, ThemeData theme, bool isDark) {
    final isExpanded = _expandedRecordIds.contains(rec.id);

    // Type badge label (mirrors the web record card)
    final String typeLabel = rec.type == 'customer'
        ? 'Customer'
        : rec.type == 'supplier'
            ? 'Supplier'
            : rec.type == 'delala'
                ? 'Delala'
                : 'Store';
    final IconData typeIcon = rec.type == 'customer'
        ? Icons.people_outline
        : rec.type == 'supplier'
            ? Icons.local_shipping_outlined
            : rec.type == 'delala'
                ? Icons.handshake_outlined
                : Icons.inventory_2_outlined;

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
                color: isDark ? const Color(0xFF242C40) : const Color(0xFFF8FAFC),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(7)),
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

                  // Name, badge, date / notes
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEFF6FF),
                                borderRadius: BorderRadius.circular(5),
                                border: Border.all(
                                  color: const Color(0xFFBFDBFE),
                                  width: 0.8,
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    typeIcon,
                                    size: 11,
                                    color: const Color(0xFF2563EB),
                                  ),
                                  const SizedBox(width: 3),
                                  Text(
                                    typeLabel,
                                    style: const TextStyle(
                                      fontSize: 9.5,
                                      fontWeight: FontWeight.w900,
                                      color: Color(0xFF2563EB),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: InkWell(
                                onTap: () => _openStatement(rec),
                                child: Text(
                                  rec.title,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 14,
                                    color: theme.colorScheme.onSurface,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          rec.notes != null && rec.notes!.isNotEmpty
                              ? '${rec.date} · ${rec.notes}'
                              : '${rec.items.length} ${rec.items.length == 1 ? "item" : "items"} · ${rec.date}',
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
                          color: rec.balance >= 0
                              ? (isDark
                                    ? const Color(0xFF93C5FD)
                                    : const Color(0xFF2563EB))
                              : (isDark
                                    ? const Color(0xFFFFB4AB)
                                    : const Color(0xFFBA1A1A)),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (rec.type == 'customer' || rec.type == 'supplier' || rec.type == 'delala') ...[
                            IconButton(
                              icon: const Icon(
                                Icons.visibility_outlined,
                                size: 19,
                                color: Color(0xFF2563EB),
                              ),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                              tooltip: 'View Statement Details',
                              onPressed: () => _openStatement(rec),
                            ),
                            const SizedBox(width: 4),
                          ],
                          IconButton(
                            icon: const Icon(Icons.more_vert, size: 18),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
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
                      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                        border: Border(bottom: BorderSide(color: gridBorderColor, width: 1.0)),
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
                                color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                              ),
                            ),
                          ),
                          Container(width: 1, height: 16, color: gridBorderColor),
                          Expanded(
                            flex: 12,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 6),
                              child: Text(
                                'የዕቃው አይነት',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                                ),
                              ),
                            ),
                          ),
                          Container(width: 1, height: 16, color: gridBorderColor),
                          Expanded(
                            flex: 7,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                              child: Text(
                                'ዋጋ',
                                textAlign: TextAlign.right,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                                ),
                              ),
                            ),
                          ),
                          Container(width: 1, height: 16, color: gridBorderColor),
                          Expanded(
                            flex: 5,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                              child: Text(
                                'ብዛት',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                                ),
                              ),
                            ),
                          ),
                          Container(width: 1, height: 16, color: gridBorderColor),
                          Expanded(
                            flex: 8,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 6),
                              child: Text(
                                'ድምር',
                                textAlign: TextAlign.right,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
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

                      final bank = (item.paymentMethod != null && item.paymentMethod!.isNotEmpty)
                          ? item.paymentMethod
                          : item.bank;
                      final ctns = item.cartons ?? 0;
                      final pcs = item.pcsPerCarton ?? 0;
                      final unit = item.packagingUnit ?? (ctns > 0 ? 'Carton' : 'Pcs');
                      final isPayment = item.sign == '-';
                      final packDetail = isPayment
                          ? (bank != null && bank.isNotEmpty ? 'Bank: $bank' : null)
                          : (unit == 'Carton' && ctns > 0 && pcs > 0
                              ? '${ctns.toInt()} ctn × ${pcs.toInt()} pcs'
                              : (ctns > 0
                                  ? '${ctns.toInt()} $unit'
                                  : (item.quantity > 0 && unit != 'Pcs' ? '${item.quantity.toInt()} $unit' : null)));

                      return Container(
                        padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 4),
                        decoration: BoxDecoration(
                          color: (itemIdx % 2 == 0)
                              ? (isDark ? const Color(0xFF1E2638) : const Color(0xFFFAFAFA))
                              : (isDark ? const Color(0xFF161D2E) : Colors.white),
                          border: Border(bottom: BorderSide(color: gridBorderColor, width: 0.8)),
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
                                  color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                ),
                              ),
                            ),
                            Container(width: 1, height: 28, color: gridBorderColor),

                            // የዕቃው አይነት (Item)
                            Expanded(
                              flex: 12,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 6),
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
                                        if (packDetail != null && packDetail.isNotEmpty) {
                                          subDetails.add(packDetail);
                                        }
                                        if (item.date != null && item.date!.isNotEmpty) {
                                          subDetails.add(item.date!);
                                        }
                                        if (item.notes != null && item.notes!.isNotEmpty) {
                                          subDetails.add(item.notes!);
                                        } else if (item.reference != null && item.reference!.isNotEmpty) {
                                          subDetails.add(item.reference!);
                                        }
                                        if (subDetails.isEmpty) return const SizedBox.shrink();

                                        return Text(
                                          subDetails.join(' · '),
                                          style: TextStyle(
                                            fontSize: 9.5,
                                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
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
                            Container(width: 1, height: 28, color: gridBorderColor),

                            // ዋጋ (Price)
                            Expanded(
                              flex: 7,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 4),
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
                            Container(width: 1, height: 28, color: gridBorderColor),

                            // ብዛት (Qty)
                            Expanded(
                              flex: 5,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 4),
                                child: Text(
                                  item.sign == '-'
                                      ? '-${item.quantity.toInt()}'
                                      : '${item.quantity.toInt()}',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    fontFamily: 'monospace',
                                    color: item.sign == '-'
                                        ? const Color(0xFFBA1A1A)
                                        : theme.colorScheme.onSurface,
                                  ),
                                ),
                              ),
                            ),
                            Container(width: 1, height: 28, color: gridBorderColor),

                            // ድምር (Total)
                            Expanded(
                              flex: 8,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 6),
                                child: Text(
                                  item.sign == '-'
                                      ? '-${_currencyFormat.format(subtotal)}'
                                      : _currencyFormat.format(subtotal),
                                  textAlign: TextAlign.right,
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w800,
                                    fontFamily: 'monospace',
                                    color: item.sign == '-'
                                        ? const Color(0xFFBA1A1A)
                                        : const Color(0xFF1D4ED8),
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
                      padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 8),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
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
                              color: rec.balance < 0
                                  ? const Color(0xFFBA1A1A)
                                  : const Color(0xFF1D4ED8),
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
              color: isDark ? const Color(0xFF242C40) : const Color(0xFFE2E8F0),
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
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 11.5,
                        fontFamily: 'monospace',
                        color: Color(0xFF2563EB),
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
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 11.5,
                        fontFamily: 'monospace',
                        color: Color(0xFFBA1A1A),
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
                        color: rec.balance >= 0
                            ? const Color(0xFF2563EB)
                            : const Color(0xFFBA1A1A),
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

    double tabTotalBalance = 0;
    for (final r in records) {
      tabTotalBalance += r.balance;
    }

    return Scaffold(
      backgroundColor: isDark
          ? const Color(0xFF131B2E)
          : const Color(0xFFFAF8FF),
      appBar: AppBar(
        backgroundColor: isDark
            ? const Color(0xFF182036)
            : const Color(0xFFFFFFFF),
        elevation: 0.5,
        titleSpacing: 14,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
          statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
        ),
        title: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: const Color(0xFF2563EB),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Icon(
                Icons.table_chart,
                color: Colors.white,
                size: 16,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        _currentTabLabel,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.onSurface,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    widget.currentUser.isAdmin
                        ? (_selectedShopId == 'all'
                              ? 'All Shops (Central)'
                              : (_shops
                                    .firstWhere(
                                      (s) => s.id == _selectedShopId,
                                      orElse: () =>
                                          Shop(id: '', name: 'Shop', code: ''),
                                    )
                                    .name))
                        : (widget.currentUser.shopName ?? 'Shop 1 - Merkato'),
                    style: TextStyle(
                      fontSize: 10,
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
          // Sign out
          IconButton(
            icon: const Icon(
              Icons.logout_rounded,
              color: Color(0xFFBA1A1A),
              size: 19,
            ),
            tooltip: 'Sign Out',
            onPressed: _handleLogout,
          ),
        ],
      ),

      // BOTTOM NAVIGATION TABS (Customer, Supplier, Delala, Store — visible for all roles)
      bottomNavigationBar: Container(
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(
                    color: isDark
                        ? const Color(0xFF2E384D)
                        : const Color(0xFFDAE2FD),
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
                backgroundColor: isDark
                    ? const Color(0xFF182036)
                    : Colors.white,
                elevation: 6,
                items: const [
                  BottomNavigationBarItem(
                    icon: Icon(Icons.people_outline),
                    activeIcon: Icon(Icons.people),
                    label: 'Customer',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.business_outlined),
                    activeIcon: Icon(Icons.business),
                    label: 'Supplier',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.handshake_outlined),
                    activeIcon: Icon(Icons.handshake),
                    label: 'Delala',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.inventory_2_outlined),
                    activeIcon: Icon(Icons.inventory_2),
                    label: 'Store',
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
                  // Sub-header: Shop selector & Tab Balance pill
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 6,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        if (widget.currentUser.isAdmin)
                          Flexible(
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.storefront,
                                  size: 16,
                                  color: isDark
                                      ? const Color(0xFF93C5FD)
                                      : const Color(0xFF2563EB),
                                ),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: DropdownButton<String>(
                                    value: (_selectedShopId == 'all' ||
                                            _shops.any((s) => s.id == _selectedShopId))
                                        ? _selectedShopId
                                        : 'all',
                                    underline: const SizedBox(),
                                    isDense: true,
                                    isExpanded: true,
                                    dropdownColor: theme.colorScheme.surface,
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 12,
                                      color: theme.colorScheme.onSurface,
                                    ),
                                    items: [
                                      const DropdownMenuItem(
                                        value: 'all',
                                        child: Text('All Shops'),
                                      ),
                                      ..._shops.map(
                                        (s) => DropdownMenuItem(
                                          value: s.id,
                                          child: Text(
                                            s.name,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ),
                                    ],
                                    onChanged: _onShopChanged,
                                  ),
                                ),
                              ],
                            ),
                          )
                        else
                          Flexible(
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.storefront,
                                  size: 16,
                                  color: isDark
                                      ? const Color(0xFF93C5FD)
                                      : const Color(0xFF2563EB),
                                ),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Text(
                                    widget.currentUser.shopName ?? 'Shop 1',
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 12,
                                      color: theme.colorScheme.onSurface,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),

                        const SizedBox(width: 8),

                        // Tab Total Balance Pill
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: tabTotalBalance >= 0
                                ? (isDark
                                      ? const Color(0xFF172554)
                                      : const Color(0xFFEFF6FF))
                                : (isDark
                                      ? const Color(0xFF7F1D1D)
                                      : const Color(0xFFFEF2F2)),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: tabTotalBalance >= 0
                                  ? (isDark
                                        ? const Color(0xFF2563EB)
                                        : const Color(0xFFBFDBFE))
                                  : (isDark
                                        ? const Color(0xFFBA1A1A)
                                        : const Color(0xFFFCA5A5)),
                            ),
                          ),
                          child: Text(
                            'ETB ${_currencyFormat.format(tabTotalBalance)}',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              color: tabTotalBalance >= 0
                                  ? (isDark
                                        ? const Color(0xFF93C5FD)
                                        : const Color(0xFF2563EB))
                                  : (isDark
                                        ? const Color(0xFFFFB4AB)
                                        : const Color(0xFFBA1A1A)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Search Bar
                  Container(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
                    child: TextField(
                      controller: _searchController,
                      style: TextStyle(
                        fontSize: 12,
                        color: theme.colorScheme.onSurface,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Search $_currentTabLabel by name, item...',
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

                  // Stitch Statement Summary Card (for Customer/Supplier/Delala)
                  if (_currentTabIndex != 3)
                    _buildStatementSummary(theme, isDark),

                  // Content view: Store Inventory on Hand for Stock; Excel Ledgers for Parties
                  Expanded(
                    child: _currentTabIndex == 3
                        ? _buildStockInventorySheet(theme, isDark)
                        : (records.isEmpty
                            ? (_errorMessage != null
                                ? Center(
                                    child: Padding(
                                      padding: const EdgeInsets.all(24.0),
                                      child: Column(
                                        mainAxisAlignment: MainAxisAlignment.center,
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
                                            onPressed: _loadShopsAndRecords,
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor: const Color(0xFF2563EB),
                                              foregroundColor: Colors.white,
                                            ),
                                            icon: const Icon(Icons.refresh, size: 16),
                                            label: const Text('Retry Connection'),
                                          ),
                                        ],
                                      ),
                                    ),
                                  )
                                : Center(
                                    child: Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Icon(
                                          Icons.table_chart_outlined,
                                          size: 38,
                                          color: Colors.grey.shade400,
                                        ),
                                        const SizedBox(height: 8),
                                        Text(
                                          'No $_currentTabLabel entries found',
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 13.5,
                                            color: isDark
                                                ? const Color(0xFF94A3B8)
                                                : const Color(0xFF64748B),
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        const Text(
                                          'Tap "+" to add a new transaction entry',
                                          style: TextStyle(
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

      // Floating Add Transaction Entry Button
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF2563EB), // Primary Blue
        foregroundColor: Colors.white,
        elevation: 3,
        icon: const Icon(Icons.add, size: 18),
        label: Text(
          _currentTabIndex == 3
              ? 'Store Entry'
              : _currentTabIndex == 2
                  ? 'Delala Entry'
                  : _currentTabIndex == 1
                      ? 'Supplier Entry'
                      : 'Customer Entry',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        ),
        onPressed: _openCreateRecordDialog,
      ),
    );
  }
}

/// Helper model for Stock Inventory On Hand Table
class _StockInventoryItem {
  final LedgerRecord record;
  final LineItem? lineItem;
  final String itemName;
  final double cartons;
  final double pcsPerCarton;
  final double totalQty;
  final double unitPrice;
  final double totalValue;
  final String packagingUnit;
  final String date;
  final String? notes;
  final String sign; // '+' = Stock In (increment), '-' = Stock Out (decrement)

  _StockInventoryItem({
    required this.record,
    this.lineItem,
    required this.itemName,
    required this.cartons,
    required this.pcsPerCarton,
    required this.totalQty,
    required this.unitPrice,
    required this.totalValue,
    required this.packagingUnit,
    required this.date,
    this.notes,
    this.sign = '+',
  });

  bool get isOut => sign == '-';

  /// Signed contribution to on-hand quantity (negative when stock out)
  double get signedQty => isOut ? -totalQty : totalQty;
  /// Signed contribution to on-hand cartons (negative when stock out)
  double get signedCartons => isOut ? -cartons : cartons;
  /// Signed contribution to total valuation (negative when stock out)
  double get signedValue => isOut ? -totalValue : totalValue;
}
