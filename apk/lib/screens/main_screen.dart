import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../models/user.dart';
import '../models/shop.dart';
import '../models/ledger_record.dart';
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
  String _searchQuery = '';
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();

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
        return 'Stock & Inventory';
      default:
        return 'Customer Credit';
    }
  }

  Future<void> _loadShopsAndRecords() async {
    setState(() => _isLoading = true);
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
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _reloadRecordsOnly() async {
    try {
      final records = await ApiService.getRecords(shopId: _selectedShopId);
      if (mounted) {
        setState(() {
          _records = records;
        });
      }
    } catch (_) {}
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
        final matchItems = r.items.any((it) => it.name.toLowerCase().contains(q));
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
        shopId: widget.currentUser.isShopkeeper
            ? widget.currentUser.shopId
            : (_selectedShopId == 'all' ? 'shop-1' : _selectedShopId),
      ),
    );

    if (result != null) {
      try {
        await ApiService.createRecord(result, shopId: result.shopId);
        _reloadRecordsOnly();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Saved "${result.title}" to Neon DB'),
            backgroundColor: const Color(0xFF006948),
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

  Future<void> _openEditRecordDialog(LedgerRecord record) async {
    final result = await showDialog<LedgerRecord>(
      context: context,
      builder: (ctx) => RecordFormDialog(
        activeTab: record.type,
        editingRecord: record,
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
            backgroundColor: const Color(0xFF006948),
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
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFBA1A1A), foregroundColor: Colors.white),
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Deleted "${record.title}"')),
      );
    }
  }

  void _openStatement(LedgerRecord record) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => StatementScreen(
          accountName: record.title,
          accountType: record.type == 'stock' ? 'customer' : record.type,
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
                                  ? (isDark ? const Color(0xFF68DBA9) : const Color(0xFF006948))
                                  : (isDark ? const Color(0xFFFFB4AB) : const Color(0xFFBA1A1A)),
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
                leading: const Icon(Icons.table_chart_outlined, color: Color(0xFF006948)),
                title: const Text('View Full Statement & PDF'),
                onTap: () {
                  Navigator.pop(ctx);
                  _openStatement(record);
                },
              ),
              ListTile(
                leading: const Icon(Icons.edit_outlined, color: Color(0xFF4059AA)),
                title: const Text('Edit Entry'),
                onTap: () {
                  Navigator.pop(ctx);
                  _openEditRecordDialog(record);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline, color: Color(0xFFBA1A1A)),
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
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
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
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Row(
                children: [
                  const Icon(Icons.table_view_outlined, size: 16, color: Color(0xFF006948)),
                  const SizedBox(width: 6),
                  Text(
                    'Statement Summary',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13.5,
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                ],
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    balanceTitle,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF6D7A72),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'ETB ${_currencyFormat.format(netBalance)}',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      letterSpacing: -0.2,
                      color: netBalance >= 0
                          ? (isDark ? const Color(0xFF68DBA9) : const Color(0xFF006948))
                          : (isDark ? const Color(0xFFFFB4AB) : const Color(0xFFBA1A1A)),
                    ),
                  ),
                ],
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
                      color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF6D7A72),
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
                      color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF6D7A72),
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

  /// Authentic Excel Spreadsheet Table View matching the User's Excel Ledger
  Widget _buildRecordTable(LedgerRecord rec, ThemeData theme, bool isDark) {
    double runningBalance = 0;
    final isCustomerOrDelala = rec.type == 'customer' || rec.type == 'delala';

    // Yellow highlight color for Credit/Payment column matching Column G in reference Excel
    final paymentBgColor = isDark ? const Color(0xFF382D05) : const Color(0xFFFEF9C3);
    final gridBorderColor = isDark ? const Color(0xFF2E384D) : const Color(0xFFCBD5E1);

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
          // Account Name Bar with Balance & Quick Actions
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF242C40) : const Color(0xFFF1F5F9),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(7)),
              border: Border(bottom: BorderSide(color: gridBorderColor, width: 1.2)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () => _openStatement(rec),
                    child: Row(
                      children: [
                        Flexible(
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
                        const SizedBox(width: 6),
                        Icon(
                          Icons.open_in_new,
                          size: 13,
                          color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF4059AA),
                        ),
                      ],
                    ),
                  ),
                ),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Balance: ',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF6D7A72),
                      ),
                    ),
                    Text(
                      'ETB ${_currencyFormat.format(rec.balance)}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                        color: rec.balance >= 0
                            ? (isDark ? const Color(0xFF68DBA9) : const Color(0xFF006948))
                            : (isDark ? const Color(0xFFFFB4AB) : const Color(0xFFBA1A1A)),
                      ),
                    ),
                    const SizedBox(width: 4),
                    IconButton(
                      icon: const Icon(Icons.more_vert, size: 18),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      tooltip: 'Actions',
                      onPressed: () => _showRecordActions(rec),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Horizontal Scrolling Excel Spreadsheet Table
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              columnSpacing: 12,
              headingRowHeight: 34,
              dataRowMinHeight: 32,
              dataRowMaxHeight: 52,
              border: TableBorder(
                horizontalInside: BorderSide(color: gridBorderColor, width: 0.8),
                verticalInside: BorderSide(color: gridBorderColor, width: 0.8),
              ),
              headingRowColor: WidgetStateProperty.all(
                isDark ? const Color(0xFF1E2638) : const Color(0xFFE2E8F0),
              ),
              columns: const [
                DataColumn(label: Text('Date', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                DataColumn(label: Text('Item (የዕቃው አይነት)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                DataColumn(numeric: true, label: Text('Ctns', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                DataColumn(numeric: true, label: Text('Pcs/Ctn', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                DataColumn(numeric: true, label: Text('Price (ዋጋ)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                DataColumn(numeric: true, label: Text('Debit (+) (ዕቃ)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: Color(0xFF006948)))),
                DataColumn(numeric: true, label: Text('Credit (-) (ክፍያ)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: Color(0xFFB45309)))),
                DataColumn(numeric: true, label: Text('Balance (ቀሪ)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
              ],
              rows: rec.items.map((item) {
                final isDebit = item.sign == '+';
                final subtotal = item.subtotal;
                if (isCustomerOrDelala) {
                  if (isDebit) {
                    runningBalance += subtotal;
                  } else {
                    runningBalance -= subtotal;
                  }
                } else {
                  if (isDebit) {
                    runningBalance -= subtotal;
                  } else {
                    runningBalance += subtotal;
                  }
                }

                return DataRow(
                  cells: [
                    // Date
                    DataCell(Text(rec.date, style: const TextStyle(fontSize: 10.5, fontFamily: 'monospace'))),

                    // Item / Description
                    DataCell(
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            item.name,
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 11),
                          ),
                          if ((item.paymentMethod != null && item.paymentMethod!.isNotEmpty) || (item.bank != null && item.bank!.isNotEmpty))
                            Text(
                              'via ${item.paymentMethod ?? item.bank}${item.reference != null ? " (${item.reference})" : ""}',
                              style: TextStyle(
                                fontSize: 9.5,
                                color: isDark ? const Color(0xFFFBBF24) : const Color(0xFFB45309),
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                        ],
                      ),
                    ),

                    // Cartons
                    DataCell(
                      Text(
                        item.cartons != null && item.cartons! > 0 ? item.cartons!.toInt().toString() : '-',
                        style: const TextStyle(fontSize: 10.5, fontFamily: 'monospace'),
                      ),
                    ),

                    // Pcs / Carton
                    DataCell(
                      Text(
                        item.pcsPerCarton != null && item.pcsPerCarton! > 0 ? item.pcsPerCarton!.toInt().toString() : '-',
                        style: const TextStyle(fontSize: 10.5, fontFamily: 'monospace'),
                      ),
                    ),

                    // Unit Price
                    DataCell(
                      Text(
                        item.unitPrice > 0 ? _currencyFormat.format(item.unitPrice) : '-',
                        style: const TextStyle(fontSize: 10.5, fontFamily: 'monospace'),
                      ),
                    ),

                    // Debit (+) [Goods Invoiced / Consignment]
                    DataCell(
                      Text(
                        isDebit ? _currencyFormat.format(subtotal) : '-',
                        style: TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: isDebit ? const Color(0xFF006948) : Colors.grey,
                          fontWeight: isDebit ? FontWeight.bold : FontWeight.normal,
                        ),
                      ),
                    ),

                    // Credit (-) [Payment via CBE/Awash/Telebirr highlighted in yellow like Excel Column G]
                    DataCell(
                      Container(
                        color: !isDebit ? paymentBgColor : Colors.transparent,
                        alignment: Alignment.centerRight,
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Text(
                          !isDebit ? _currencyFormat.format(subtotal) : '-',
                          style: TextStyle(
                            fontSize: 11,
                            fontFamily: 'monospace',
                            color: !isDebit
                                ? (isDark ? const Color(0xFFFDE68A) : const Color(0xFFB45309))
                                : Colors.grey,
                            fontWeight: !isDebit ? FontWeight.bold : FontWeight.normal,
                          ),
                        ),
                      ),
                    ),

                    // Running Balance
                    DataCell(
                      Text(
                        _currencyFormat.format(runningBalance),
                        style: TextStyle(
                          fontSize: 11.5,
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w900,
                          color: runningBalance >= 0 ? const Color(0xFF006948) : const Color(0xFFBA1A1A),
                        ),
                      ),
                    ),
                  ],
                );
              }).toList(),
            ),
          ),

          // Excel Subtotal Footer Summary
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF242C40) : const Color(0xFFE2E8F0),
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(7)),
              border: Border(top: BorderSide(color: gridBorderColor, width: 1.2)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${rec.title} Total',
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 11.5),
                ),
                Row(
                  children: [
                    Text(
                      'Goods: ${_currencyFormat.format(rec.totalDebit)}  |  Paid: ${_currencyFormat.format(rec.totalCredit)}  |  Due: ',
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF334155),
                      ),
                    ),
                    Text(
                      'ETB ${_currencyFormat.format(rec.balance)}',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 12,
                        color: rec.balance >= 0 ? const Color(0xFF006948) : const Color(0xFFBA1A1A),
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
      backgroundColor: isDark ? const Color(0xFF131B2E) : const Color(0xFFFAF8FF),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF182036) : const Color(0xFFFFFFFF),
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
                color: const Color(0xFF006948),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Icon(Icons.table_chart, color: Colors.white, size: 16),
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
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF2E384D) : const Color(0xFFEAEDFF),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: isDark ? const Color(0xFF3F4E6E) : const Color(0xFFDAE2FD)),
                        ),
                        child: const Text(
                          'Excel View',
                          style: TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF006948),
                          ),
                        ),
                      ),
                    ],
                  ),
                  Text(
                    widget.currentUser.isAdmin
                        ? (_selectedShopId == 'all'
                            ? 'All Shops (Central)'
                            : (_shops.firstWhere((s) => s.id == _selectedShopId, orElse: () => Shop(id: '', name: 'Shop', code: '')).name))
                        : (widget.currentUser.shopName ?? 'Shop 1 - Merkato'),
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF6D7A72),
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
            icon: const Icon(Icons.logout_rounded, color: Color(0xFFBA1A1A), size: 19),
            tooltip: 'Sign Out',
            onPressed: _handleLogout,
          ),
        ],
      ),

      // 4 BOTTOM NAVIGATION TABS (Customer, Supplier, Delala, Stocks)
      bottomNavigationBar: Container(
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
          selectedItemColor: isDark ? const Color(0xFF68DBA9) : const Color(0xFF006948),
          unselectedItemColor: isDark ? const Color(0xFF94A3B8) : const Color(0xFF6D7A72),
          selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11.5),
          unselectedLabelStyle: const TextStyle(fontSize: 11),
          type: BottomNavigationBarType.fixed,
          backgroundColor: isDark ? const Color(0xFF182036) : Colors.white,
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
              label: 'Stocks',
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
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        if (widget.currentUser.isAdmin)
                          Row(
                            children: [
                              Icon(
                                Icons.storefront,
                                size: 16,
                                color: isDark ? const Color(0xFF68DBA9) : const Color(0xFF006948),
                              ),
                              const SizedBox(width: 6),
                              DropdownButton<String>(
                                value: _selectedShopId,
                                underline: const SizedBox(),
                                isDense: true,
                                dropdownColor: theme.colorScheme.surface,
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                  color: theme.colorScheme.onSurface,
                                ),
                                items: [
                                  const DropdownMenuItem(value: 'all', child: Text('All Shops')),
                                  ..._shops.map((s) => DropdownMenuItem(value: s.id, child: Text(s.name))),
                                ],
                                onChanged: _onShopChanged,
                              ),
                            ],
                          )
                        else
                          Row(
                            children: [
                              Icon(
                                Icons.storefront,
                                size: 16,
                                color: isDark ? const Color(0xFF68DBA9) : const Color(0xFF006948),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                widget.currentUser.shopName ?? 'Shop 1',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                  color: theme.colorScheme.onSurface,
                                ),
                              ),
                            ],
                          ),

                        // Tab Total Balance Pill
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: tabTotalBalance >= 0
                                ? (isDark ? const Color(0xFF064E3B) : const Color(0xFFECFDF5))
                                : (isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFEF2F2)),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: tabTotalBalance >= 0
                                  ? (isDark ? const Color(0xFF006948) : const Color(0xFFA7F3D0))
                                  : (isDark ? const Color(0xFFBA1A1A) : const Color(0xFFFCA5A5)),
                            ),
                          ),
                          child: Text(
                            'ETB ${_currencyFormat.format(tabTotalBalance)}',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              color: tabTotalBalance >= 0
                                  ? (isDark ? const Color(0xFF68DBA9) : const Color(0xFF006948))
                                  : (isDark ? const Color(0xFFFFB4AB) : const Color(0xFFBA1A1A)),
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
                          color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                        ),
                        prefixIcon: Icon(
                          Icons.search,
                          size: 16,
                          color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
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
                        fillColor: isDark ? const Color(0xFF1B2234) : Colors.white,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(
                            color: isDark ? const Color(0xFF2E384D) : const Color(0xFFDAE2FD),
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(
                            color: isDark ? const Color(0xFF2E384D) : const Color(0xFFDAE2FD),
                          ),
                        ),
                      ),
                      onChanged: (val) {
                        setState(() => _searchQuery = val);
                      },
                    ),
                  ),

                  // Stitch Statement Summary Card
                  _buildStatementSummary(theme, isDark),

                  // Pure Excel Table View List
                  Expanded(
                    child: records.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.table_chart_outlined, size: 38, color: Colors.grey.shade400),
                                const SizedBox(height: 8),
                                Text(
                                  'No $_currentTabLabel entries found',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13.5,
                                    color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                const Text(
                                  'Tap "+" to add a new transaction entry',
                                  style: TextStyle(fontSize: 11.5, color: Color(0xFF94A3B8)),
                                ),
                              ],
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.only(bottom: 75),
                            itemCount: records.length,
                            itemBuilder: (ctx, index) {
                              return _buildRecordTable(records[index], theme, isDark);
                            },
                          ),
                  ),
                ],
              ),
            ),

      // Floating Add Transaction Entry Button
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF006948),
        foregroundColor: Colors.white,
        elevation: 4,
        icon: const Icon(Icons.add, size: 20),
        label: Text(
          'Add ${_currentTabIndex == 3 ? "Stock" : _currentTabIndex == 2 ? "Delala" : _currentTabIndex == 1 ? "Supplier" : "Customer"}',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        ),
        onPressed: _openCreateRecordDialog,
      ),
    );
  }
}
