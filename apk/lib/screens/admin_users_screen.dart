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

  @override
  void initState() {
    super.initState();
    _loadData();
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

  Future<void> _showCreateUserDialog() async {
    if (_stores.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No stores exist in the database yet — create a store first'),
        ),
      );
      return;
    }

    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    final passCtrl = TextEditingController();
    String selectedStoreId = _stores.first.id;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) {
          return AlertDialog(
            title: const Text('Create Storekeeper Account'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(labelText: 'Full Name', hintText: 'e.g. Abebe Bekele'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: phoneCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'Phone Number', hintText: 'e.g. 0911111111'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: passCtrl,
                    decoration: const InputDecoration(labelText: 'Initial Password', hintText: 'At least 6 characters'),
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    initialValue: selectedStoreId,
                    decoration: const InputDecoration(labelText: 'Assign Retail Store'),
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
                  final name = nameCtrl.text.trim();
                  final phone = phoneCtrl.text.trim();
                  final pass = passCtrl.text;
                  if (name.isEmpty || phone.isEmpty || pass.length < 6) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Please fill all fields (password min 6 chars)')),
                    );
                    return;
                  }
                  Navigator.pop(ctx);
                  try {
                    await ApiService.createStorekeeper(
                      name: name,
                      phone: phone,
                      password: pass,
                      storeId: selectedStoreId,
                    );
                    _fetchUsers();
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Created storekeeper account for $name')),
                    );
                  } catch (e) {
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(e.toString().replaceAll('Exception:', ''))),
                    );
                  }
                },
                child: const Text('Create Account'),
              ),
            ],
          );
        },
      ),
    );
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
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add_alt_1_outlined),
            tooltip: 'Add Storekeeper',
            onPressed: _showCreateUserDialog,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
              : _users.isEmpty
                  ? const Center(child: Text('No storekeeper accounts found'))
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: _users.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (ctx, index) {
                        final u = _users[index];
                        final storeLabel = u.storeName ?? 'No store assigned';
                        return Card(
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                            side: BorderSide(color: Colors.grey.shade200),
                          ),
                          color: Colors.white,
                          child: ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                            leading: CircleAvatar(
                              backgroundColor: u.active
                                  ? const Color(0xFFEFF6FF)
                                  : const Color(0xFFF1F5F9),
                              child: Icon(
                                Icons.storefront,
                                color: u.active
                                    ? const Color(0xFF2563EB)
                                    : Colors.grey,
                              ),
                            ),
                            title: Row(
                              children: [
                                Text(
                                  u.name,
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                    decoration: u.active ? null : TextDecoration.lineThrough,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFEFF6FF),
                                    borderRadius: BorderRadius.circular(4),
                                    border: Border.all(
                                      color: const Color(0xFFBFDBFE),
                                    ),
                                  ),
                                  child: Text(
                                    storeLabel,
                                    style: const TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF2563EB),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(u.phone ?? 'No phone', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                                Text(
                                  u.active ? 'Status: Active' : 'Status: Deactivated',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: u.active ? const Color(0xFF2563EB) : const Color(0xFFDC2626),
                                  ),
                                ),
                              ],
                            ),
                            trailing: IconButton(
                              icon: const Icon(Icons.edit_outlined, size: 20),
                              onPressed: () => _showEditUserDialog(u),
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}
