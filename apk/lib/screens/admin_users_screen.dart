import 'package:flutter/material.dart';
import '../models/user.dart';
import '../models/store.dart';
import '../services/api_service.dart';

class AdminUsersScreen extends StatefulWidget {
  const AdminUsersScreen({super.key});

  @override
  State<AdminUsersScreen> createState() => _AdminUsersScreenState();
}

class _AdminUsersScreenState extends State<AdminUsersScreen> {
  List<AppUser> _users = [];
  List<Store> _stores = [];
  bool _isLoading = true;
  String? _error;
  final _storeNameController = TextEditingController();
  final _userNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  String? _selectedStoreId;
  bool _isCreatingStore = false;
  bool _isCreatingUser = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _storeNameController.dispose();
    _userNameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      // Both lists come straight from the database.
      final users = await ApiService.getStorekeepers();
      final stores = await ApiService.getStores();
      if (mounted) {
        setState(() {
          _users = users;
          _stores = stores;
          if (_selectedStoreId == null ||
              !_stores.any((store) => store.id == _selectedStoreId)) {
            _selectedStoreId = _stores.isNotEmpty ? _stores.first.id : null;
          }
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceAll('Exception:', '').trim();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _fetchUsers() async {
    await _loadData();
  }

  Future<void> _createStore() async {
    final name = _storeNameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a store name')),
      );
      return;
    }

    setState(() => _isCreatingStore = true);
    try {
      final store = await ApiService.createStore(name: name);
      _storeNameController.clear();
      await _loadData();
      if (!mounted) return;
      setState(() => _selectedStoreId = store.id);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Created ${store.name}')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception:', ''))),
      );
    } finally {
      if (mounted) setState(() => _isCreatingStore = false);
    }
  }

  Future<void> _createStorekeeper() async {
    final name = _userNameController.text.trim();
    final phone = _phoneController.text.trim();
    final password = _passwordController.text;
    final storeId = _selectedStoreId;

    if (name.isEmpty || phone.isEmpty || password.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter name, phone and a password of at least 6 characters'),
        ),
      );
      return;
    }
    if (storeId == null || storeId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Create or select a store first')),
      );
      return;
    }

    setState(() => _isCreatingUser = true);
    try {
      await ApiService.createStorekeeper(
        name: name,
        phone: phone,
        password: password,
        storeId: storeId,
      );
      _userNameController.clear();
      _phoneController.clear();
      _passwordController.clear();
      await _loadData();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Created storekeeper account for $name')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception:', ''))),
      );
    } finally {
      if (mounted) setState(() => _isCreatingUser = false);
    }
  }

  Future<void> _deleteStorekeeper(AppUser user) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete Account'),
        content: Text('Delete ${user.name}? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFDC2626),
              foregroundColor: Colors.white,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ApiService.deleteStorekeeper(user.id);
      await _loadData();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Deleted ${user.name}')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception:', ''))),
      );
    }
  }

  Future<void> _showEditUserDialog(AppUser user) async {
    final nameCtrl = TextEditingController(text: user.name);
    final phoneCtrl = TextEditingController(text: user.phone ?? '');
    final passCtrl = TextEditingController();
    final storeIds = _stores.map((s) => s.id).toSet();
    String selectedStoreId = (user.storeId != null && storeIds.contains(user.storeId))
        ? user.storeId!
        : (_stores.isNotEmpty ? _stores.first.id : '');
    bool active = user.active;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) {
          return AlertDialog(
            title: Text('Edit: ${user.name}'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(labelText: 'Full Name'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: phoneCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Phone Number',
                      hintText: 'e.g. 0911111111',
                    ),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: selectedStoreId.isEmpty ? null : selectedStoreId,
                    decoration: const InputDecoration(labelText: 'Assigned Store'),
                    items: [
                      for (final store in _stores)
                        DropdownMenuItem(value: store.id, child: Text(store.name)),
                    ],
                    onChanged: (val) {
                      if (val != null) {
                        setDlgState(() => selectedStoreId = val);
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  SwitchListTile(
                    title: const Text('Account Active'),
                    subtitle: Text(active ? 'Allowed to log in' : 'Deactivated / blocked'),
                    value: active,
                    onChanged: (val) {
                      setDlgState(() => active = val);
                    },
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: passCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Reset Password (optional)',
                      hintText: 'Leave empty to keep unchanged',
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  foregroundColor: Colors.white,
                ),
                onPressed: () async {
                  Navigator.pop(ctx);
                  try {
                    await ApiService.updateStorekeeper(
                      user.id,
                      name: nameCtrl.text.trim(),
                      phone: phoneCtrl.text.trim(),
                      storeId: selectedStoreId.isEmpty ? null : selectedStoreId,
                      active: active,
                      password: passCtrl.text.isNotEmpty ? passCtrl.text : null,
                    );
                    _fetchUsers();
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Updated ${user.name}')),
                    );
                  } catch (e) {
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(e.toString().replaceAll('Exception:', ''))),
                    );
                  }
                },
                child: const Text('Save'),
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Storekeeper Accounts'),
        backgroundColor: Colors.white,
        elevation: 0.5,
        foregroundColor: const Color(0xFF0F172A),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
              : LayoutBuilder(
                  builder: (context, constraints) {
                    final horizontalPadding = constraints.maxWidth >= 700 ? 24.0 : 12.0;
                    return Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 900),
                        child: ListView(
                          padding: EdgeInsets.fromLTRB(
                            horizontalPadding,
                            12,
                            horizontalPadding,
                            24,
                          ),
                          children: [
                            _buildCreateStoreCard(),
                            const SizedBox(height: 12),
                            _buildCreateUserCard(),
                            const SizedBox(height: 18),
                            Text(
                              'Storekeepers (${_users.length})',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF334155),
                              ),
                            ),
                            const SizedBox(height: 8),
                            if (_users.isEmpty)
                              const Card(
                                elevation: 0,
                                color: Colors.white,
                                child: Padding(
                                  padding: EdgeInsets.all(20),
                                  child: Center(
                                    child: Text('No storekeeper accounts found'),
                                  ),
                                ),
                              )
                            else
                              ..._users.map(_buildUserCard),
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }

  Widget _buildCreateStoreCard() {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Create Store',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            LayoutBuilder(
              builder: (context, constraints) {
                final field = TextField(
                  controller: _storeNameController,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _createStore(),
                  decoration: const InputDecoration(
                    labelText: 'Store name',
                    hintText: 'e.g. Merkato Store',
                    isDense: true,
                  ),
                );
                final button = SizedBox(
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: _isCreatingStore ? null : _createStore,
                    icon: _isCreatingStore
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.add, size: 18),
                    label: const Text('Create'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                    ),
                  ),
                );
                if (constraints.maxWidth < 520) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [field, const SizedBox(height: 10), button],
                  );
                }
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(child: field),
                    const SizedBox(width: 10),
                    button,
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCreateUserCard() {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Create Storekeeper',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _userNameController,
              decoration: const InputDecoration(
                labelText: 'Full name',
                isDense: true,
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Phone number',
                hintText: '0911111111',
                isDense: true,
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Password',
                hintText: 'At least 6 characters',
                isDense: true,
              ),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _selectedStoreId,
              decoration: const InputDecoration(
                labelText: 'Assign store',
                isDense: true,
              ),
              items: [
                for (final store in _stores)
                  DropdownMenuItem(value: store.id, child: Text(store.name)),
              ],
              onChanged: _stores.isEmpty
                  ? null
                  : (value) => setState(() => _selectedStoreId = value),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _isCreatingUser ? null : _createStorekeeper,
                icon: _isCreatingUser
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.person_add_alt_1_outlined, size: 18),
                label: const Text('Create Account'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  foregroundColor: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUserCard(AppUser user) {
    final storeLabel = user.storeName ?? 'No store assigned';
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: user.active
                  ? const Color(0xFFEFF6FF)
                  : const Color(0xFFF1F5F9),
              child: Icon(
                Icons.storefront_outlined,
                size: 20,
                color: user.active ? const Color(0xFF2563EB) : Colors.grey,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      decoration: user.active ? null : TextDecoration.lineThrough,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    storeLabel,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Color(0xFF2563EB),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    user.phone ?? 'No phone',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF64748B),
                    ),
                  ),
                  Text(
                    user.active ? 'Status: Active' : 'Status: Deactivated',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: user.active
                          ? const Color(0xFF2563EB)
                          : const Color(0xFFDC2626),
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              width: 68,
              child: Wrap(
                alignment: WrapAlignment.end,
                spacing: 0,
                runSpacing: 0,
                children: [
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints.tightFor(
                      width: 34,
                      height: 34,
                    ),
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    tooltip: 'Edit',
                    onPressed: () => _showEditUserDialog(user),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints.tightFor(
                      width: 34,
                      height: 34,
                    ),
                    icon: const Icon(
                      Icons.delete_outline,
                      size: 18,
                      color: Color(0xFFDC2626),
                    ),
                    tooltip: 'Delete',
                    onPressed: () => _deleteStorekeeper(user),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
