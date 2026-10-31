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

  int _currentTabIndex = 0; // 0: Customer, 1: Supplier, 2: Stock
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
    return _currentTabIndex == 0 ? 'customer' : 'supplier';
  }

  Future<void> _loadShopsAndRecords() async {
    setState(() => _isLoading = true);
    try {
      final shops = await ApiService.getShops();
      final records = await ApiService.getRecords(
        shopId: _selectedShopId,
      );
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
      final records = await ApiService.getRecords(
        shopId: _selectedShopId,
      );
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
            backgroundColor: const Color(0xFF059669),
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
            backgroundColor: const Color(0xFF059669),
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
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, foregroundColor: Colors.white),
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
                                  ? (isDark ? const Color(0xFF34D399) : const Color(0xFF059669))
                                  : (isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626)),
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
                leading: const Icon(Icons.table_chart_outlined, color: Color(0xFF059669)),
                title: const Text('View Ledger Table & Items'),
                onTap: () {
                  Navigator.pop(ctx);
                  _openStatement(record);
                },
              ),
              ListTile(
                leading: const Icon(Icons.edit_outlined, color: Color(0xFF2563EB)),
                title: const Text('Edit Entry'),
                onTap: () {
                  Navigator.pop(ctx);
                  _openEditRecordDialog(record);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline, color: Colors.redAccent),
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final records = _filteredRecords;

    // Total balance of currently viewed tab
    double tabTotalBalance = 0;
    for (final r in records) {
      tabTotalBalance += r.balance;
    }

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor, // Clean white in light mode, system dark in dark mode
      appBar: AppBar(
        backgroundColor: theme.appBarTheme.backgroundColor ?? theme.colorScheme.surface,
        elevation: 0.5,
        titleSpacing: 16,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
          statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
        ),
        title: Text(
          'Merkato Credit',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.bold,
            color: theme.colorScheme.onSurface,
            letterSpacing: -0.3,
          ),
        ),
        actions: [
          // Sign out
          IconButton(
            icon: const Icon(Icons.logout_rounded, color: Color(0xFFDC2626), size: 20),
            tooltip: 'Sign Out',
            onPressed: _handleLogout,
          ),
        ],
      ),

      // BOTTOM TABS (Customer Credit & Supplier Credit Only)
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentTabIndex,
        onTap: (index) {
          setState(() {
            _currentTabIndex = index;
          });
        },
        selectedItemColor: isDark ? const Color(0xFF10B981) : const Color(0xFF059669),
        unselectedItemColor: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelStyle: const TextStyle(fontSize: 12),
        type: BottomNavigationBarType.fixed,
        backgroundColor: theme.bottomNavigationBarTheme.backgroundColor ?? theme.colorScheme.surface,
        elevation: 8,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.people_outline),
            activeIcon: Icon(Icons.people),
            label: 'Customer Credit',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.business_outlined),
            activeIcon: Icon(Icons.business),
            label: 'Supplier Credit',
          ),
        ],
      ),

      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _reloadRecordsOnly,
              child: Column(
                children: [
                  // Sub-header: Shop selector / shopkeeper indicator
                  Container(
                    color: theme.scaffoldBackgroundColor,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // Shop Switcher
                        if (widget.currentUser.isAdmin)
                          Row(
                            children: [
                              Icon(
                                Icons.storefront,
                                size: 16,
                                color: isDark ? const Color(0xFF34D399) : const Color(0xFF059669),
                              ),
                              const SizedBox(width: 6),
                              DropdownButton<String>(
                                value: _selectedShopId,
                                underline: const SizedBox(),
                                isDense: true,
                                dropdownColor: theme.colorScheme.surface,
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12.5,
                                  color: theme.colorScheme.onSurface,
                                ),
                                items: [
                                  const DropdownMenuItem(value: 'all', child: Text('All Shops (Combined)')),
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
                                color: isDark ? const Color(0xFF34D399) : const Color(0xFF059669),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                widget.currentUser.shopName ?? 'Assigned Shop',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12.5,
                                  color: theme.colorScheme.onSurface,
                                ),
                              ),
                            ],
                          ),

                        // Tab Total Balance summary pill
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3.5),
                          decoration: BoxDecoration(
                            color: tabTotalBalance >= 0
                                ? (isDark ? const Color(0xFF064E3B) : const Color(0xFFECFDF5))
                                : (isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFEF2F2)),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: tabTotalBalance >= 0
                                  ? (isDark ? const Color(0xFF059669) : const Color(0xFFA7F3D0))
                                  : (isDark ? const Color(0xFFDC2626) : const Color(0xFFFCA5A5)),
                            ),
                          ),
                          child: Text(
                            'ETB ${_currencyFormat.format(tabTotalBalance)}',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w900,
                              color: tabTotalBalance >= 0
                                  ? (isDark ? const Color(0xFF6EE7B7) : const Color(0xFF059669))
                                  : (isDark ? const Color(0xFFFCA5A5) : const Color(0xFFDC2626)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Search Bar
                  Container(
                    color: theme.scaffoldBackgroundColor,
                    padding: const EdgeInsets.fromLTRB(16, 2, 16, 10),
                    child: TextField(
                      controller: _searchController,
                      style: TextStyle(
                        fontSize: 12.5,
                        color: theme.colorScheme.onSurface,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Search $_currentTabType by name or item...',
                        hintStyle: TextStyle(
                          fontSize: 12,
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
                        fillColor: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF8FAFC),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(
                            color: isDark ? const Color(0xFF27272A) : Colors.grey.shade300,
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(
                            color: isDark ? const Color(0xFF27272A) : Colors.grey.shade200,
                          ),
                        ),
                      ),
                      onChanged: (val) {
                        setState(() => _searchQuery = val);
                      },
                    ),
                  ),

                  // Thin divider below search
                  Divider(height: 1, thickness: 1, color: theme.dividerColor),

                  // CLEAN SCREENSHOT-STYLE LIST (Title on line 1, Date on line 2, blue double-chevron on right, thin line divider)
                  Expanded(
                    child: records.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.receipt_long_outlined, size: 42, color: Colors.grey.shade400),
                                const SizedBox(height: 8),
                                Text(
                                  'No $_currentTabType entries found',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                    color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                const Text(
                                  'Tap the circular pen button below to add an entry',
                                  style: TextStyle(fontSize: 11.5, color: Color(0xFF94A3B8)),
                                ),
                              ],
                            ),
                          )
                        : ListView.separated(
                            itemCount: records.length,
                            separatorBuilder: (ctx, _) => Divider(
                              height: 1,
                              thickness: 0.8,
                              color: Theme.of(ctx).dividerColor,
                            ),
                            itemBuilder: (ctx, index) {
                              final rec = records[index];

                              return InkWell(
                                onTap: () => _openStatement(rec),
                                onLongPress: () => _showRecordActions(rec),
                                child: Container(
                                  color: theme.scaffoldBackgroundColor, // Clean white in light mode, system dark in dark mode
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.center,
                                    children: [
                                      // LEFT: Title on Line 1, Date / Time on Line 2 (exactly like user screenshot)
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              rec.title,
                                              style: TextStyle(
                                                fontSize: 15.5,
                                                fontWeight: FontWeight.bold,
                                                color: theme.colorScheme.onSurface,
                                                height: 1.25,
                                                letterSpacing: -0.2,
                                              ),
                                              softWrap: true,
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              '${rec.date} • ${rec.items.length} items • ${rec.shopName ?? 'Shop 1'}',
                                              style: TextStyle(
                                                fontSize: 12,
                                                color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 8),

                                      // RIGHT: Balance amount + Vivid Blue Double Chevron (like user screenshot)
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        crossAxisAlignment: CrossAxisAlignment.center,
                                        children: [
                                          Flexible(
                                            child: FittedBox(
                                              fit: BoxFit.scaleDown,
                                              alignment: Alignment.centerRight,
                                              child: Text(
                                                'ETB ${_currencyFormat.format(rec.balance)}',
                                                style: TextStyle(
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w800,
                                                  color: rec.balance >= 0
                                                      ? (isDark ? const Color(0xFF34D399) : const Color(0xFF059669))
                                                      : (isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626)),
                                                ),
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 6),

                                          // Blue double chevron (unfold_more) as seen in user's image
                                          IconButton(
                                            icon: const Icon(
                                              Icons.unfold_more,
                                              color: Color(0xFF2563EB), // Vivid blue icon from reference
                                              size: 22,
                                            ),
                                            padding: EdgeInsets.zero,
                                            constraints: const BoxConstraints(),
                                            tooltip: 'Entry actions',
                                            onPressed: () => _showRecordActions(rec),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),

      // CIRCULAR ENTRY BUTTON WITH PEN ICON
      floatingActionButton: FloatingActionButton(
        shape: const CircleBorder(),
        backgroundColor: const Color(0xFF059669),
        foregroundColor: Colors.white,
        elevation: 4,
        tooltip: 'Add Entry (አዲስ መዝገብ)',
        onPressed: _openCreateRecordDialog,
        child: const Icon(Icons.edit, size: 24),
      ),
    );
  }
}
