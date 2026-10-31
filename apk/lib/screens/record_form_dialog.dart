import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/ledger_record.dart';
import '../models/line_item.dart';

class RecordFormDialog extends StatefulWidget {
  final String activeTab; // 'customer' | 'supplier' | 'stock' | 'delala'
  final LedgerRecord? editingRecord;
  final String? shopId;

  const RecordFormDialog({
    super.key,
    required this.activeTab,
    this.editingRecord,
    this.shopId,
  });

  @override
  State<RecordFormDialog> createState() => _RecordFormDialogState();
}

class _RecordFormDialogState extends State<RecordFormDialog> {
  final _formKey = GlobalKey<FormState>();
  final _currencyFormat = NumberFormat('#,##0.00', 'en_US');

  late TextEditingController _titleController;
  late TextEditingController _notesController;
  late DateTime _selectedDate;
  late List<LineItemFormItem> _formItems;

  String _stockPackagingUnit = 'Carton';
  bool _showCustoms = false;

  static const List<String> _stockSuggestions = [
    '12W Safari',
    '3W Effishent',
    '6W Effishent',
    '9W Effishent',
    '5W Candel3000K',
    '5W Candel8000K',
    '12W Safari300K',
    'Portland Cement Bags (50kg)',
  ];

  static const List<String> _stockTypeOptions = [
    'Stock',
    'Goods',
    'Product',
    'Delivery',
    'Return',
  ];

  static const List<String> _bankOptions = [
    'Cash',
    'CBE',
    'Awash',
    'Dashen',
    'Abyssinia',
    'Telebirr',
    'Boa',
    'Hibret',
    'Coop',
    'Zemen',
    'Berhan',
    'Nib',
    'Oromia',
    'Wegagen',
    'Enat',
  ];

  @override
  void initState() {
    super.initState();
    final rec = widget.editingRecord;
    _titleController = TextEditingController(text: rec?.title ?? '');
    _notesController = TextEditingController(text: rec?.notes ?? '');

    if (rec != null && rec.date.isNotEmpty) {
      _selectedDate = DateTime.tryParse(rec.date) ?? DateTime.now();
    } else {
      _selectedDate = DateTime.now();
    }

    if (rec != null && rec.items.isNotEmpty) {
      _formItems = rec.items.map((it) => LineItemFormItem.fromLineItem(it)).toList();
      _showCustoms = rec.items.any((it) => (it.customs ?? 0.0) > 0);
    } else {
      _formItems = [
        LineItemFormItem(
          id: 'item-${DateTime.now().millisecondsSinceEpoch}-1',
          name: '',
          unitPrice: 0.0,
          quantity: 1.0,
          sign: '+',
          typeOrBank: 'Stock',
        ),
      ];
    }

    if (widget.activeTab == 'stock' && _formItems.isNotEmpty) {
      if (_titleController.text.isNotEmpty && _formItems.first.nameController.text.isEmpty) {
        _formItems.first.nameController.text = _titleController.text;
      }
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _notesController.dispose();
    for (final it in _formItems) {
      it.dispose();
    }
    super.dispose();
  }

  void _addItem() {
    setState(() {
      _formItems.add(
        LineItemFormItem(
          id: 'item-${DateTime.now().millisecondsSinceEpoch}-${_formItems.length}',
          name: '',
          unitPrice: 0.0,
          quantity: 1.0,
          sign: '+',
          typeOrBank: 'Stock',
        ),
      );
    });
  }

  void _removeItem(int index) {
    if (_formItems.length <= 1) return;
    setState(() {
      final removed = _formItems.removeAt(index);
      removed.dispose();
    });
  }

  void _toggleItemSign(LineItemFormItem item) {
    setState(() {
      if (item.sign == '+') {
        item.sign = '-';
        if (_stockTypeOptions.contains(item.typeOrBank)) {
          item.typeOrBank = 'CBE';
        }
      } else {
        item.sign = '+';
        if (_bankOptions.contains(item.typeOrBank)) {
          item.typeOrBank = 'Stock';
        }
      }
    });
  }

  double _calculateGrandTotal() {
    double total = 0;
    for (final item in _formItems) {
      final q = double.tryParse(item.qtyController.text) ?? item.quantity;
      final p = double.tryParse(item.priceController.text) ?? item.unitPrice;
      final customs = double.tryParse(item.customsController.text) ?? (item.customs ?? 0.0);
      final amount = q * p;
      if (item.sign == '+') {
        total += (amount + customs);
      } else {
        total -= amount;
      }
    }
    return total;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (picked != null) {
      setState(() {
        _selectedDate = picked;
      });
    }
  }

  void _handleSubmit() {
    if (!_formKey.currentState!.validate()) return;

    final dateStr = DateFormat('yyyy-MM-dd').format(_selectedDate);

    // In Stock tab, ensure title and item name are synchronized
    if (widget.activeTab == 'stock' && _formItems.isNotEmpty) {
      final item = _formItems.first;
      if (item.nameController.text.trim().isNotEmpty && _titleController.text.trim().isEmpty) {
        _titleController.text = item.nameController.text.trim();
      } else if (_titleController.text.trim().isNotEmpty && item.nameController.text.trim().isEmpty) {
        item.nameController.text = _titleController.text.trim();
      }

      // Auto compute total units if packaging is carton
      if (_stockPackagingUnit == 'Carton') {
        final c = double.tryParse(item.cartonsController.text) ?? 0.0;
        final p = double.tryParse(item.pcsController.text) ?? 0.0;
        if (c > 0 && p > 0) {
          item.qtyController.text = (c * p).toStringAsFixed(0);
        }
      }
    }

    final lineItems = _formItems.map((f) {
      final q = double.tryParse(f.qtyController.text) ?? f.quantity;
      final p = double.tryParse(f.priceController.text) ?? f.unitPrice;
      final ctns = double.tryParse(f.cartonsController.text);
      final pcs = double.tryParse(f.pcsController.text);
      final customs = double.tryParse(f.customsController.text);

      final isDeduct = f.sign == '-';

      return LineItem(
        id: f.id,
        name: f.nameController.text.trim(),
        unitPrice: p,
        quantity: q,
        sign: f.sign,
        bank: isDeduct ? f.typeOrBank : null,
        paymentMethod: isDeduct ? f.typeOrBank : null,
        customType: !isDeduct ? f.typeOrBank : null,
        cartons: ctns != null && ctns > 0 ? ctns : null,
        pcsPerCarton: pcs != null && pcs > 0 ? pcs : null,
        customs: customs != null && customs > 0 ? customs : null,
      );
    }).toList();

    final record = LedgerRecord(
      id: widget.editingRecord?.id ?? 'rec-${DateTime.now().millisecondsSinceEpoch}',
      type: widget.activeTab,
      title: _titleController.text.trim(),
      date: dateStr,
      notes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
      items: lineItems,
      shopId: widget.shopId ?? 'shop-1',
    );

    Navigator.of(context).pop(record);
  }

  @override
  Widget build(BuildContext context) {
    final isCustomer = widget.activeTab == 'customer';
    final isStock = widget.activeTab == 'stock';
    final isDelala = widget.activeTab == 'delala';

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    // When Stock In, render dedicated Google Stitch Stock In form layout
    if (isStock) {
      return _buildStockInDialog(theme, isDark);
    }

    // Otherwise render Excel Table Ledger Entry Form (Customer, Supplier, Delala)
    return _buildLedgerTableDialog(theme, isDark, isCustomer, isDelala);
  }

  /// Google Stitch Stock In Form (Pixel-Matched to Reference Screenshot)
  Widget _buildStockInDialog(ThemeData theme, bool isDark) {
    final item = _formItems.first;
    final cartons = double.tryParse(item.cartonsController.text) ?? 0.0;
    final pcs = double.tryParse(item.pcsController.text) ?? 0.0;
    final price = double.tryParse(item.priceController.text) ?? 0.0;

    double calculatedTotal = 0.0;
    if (_stockPackagingUnit == 'Carton' && cartons > 0 && pcs > 0 && price > 0) {
      calculatedTotal = cartons * pcs * price;
    } else {
      final q = double.tryParse(item.qtyController.text) ?? cartons;
      calculatedTotal = q * price;
    }

    final inputFill = isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC);
    final inputBorder = isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1);

    return Dialog(
      backgroundColor: theme.colorScheme.surface,
      insetPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
          child: Form(
            key: _formKey,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Header: Back Arrow & Title
                  Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, size: 22),
                        onPressed: () => Navigator.of(context).pop(),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        tooltip: 'Back',
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          widget.editingRecord == null
                              ? 'Stock In (Storekeeper)'
                              : 'Edit Stock Entry',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),

                  // 1. Item Field
                  _buildFieldLabel('Item', isDark),
                  const SizedBox(height: 6),
                  Autocomplete<String>(
                    initialValue: TextEditingValue(
                      text: item.nameController.text.isNotEmpty
                          ? item.nameController.text
                          : _titleController.text,
                    ),
                    optionsBuilder: (textEditingValue) {
                      if (textEditingValue.text.isEmpty) {
                        return _stockSuggestions;
                      }
                      return _stockSuggestions.where((s) => s
                          .toLowerCase()
                          .contains(textEditingValue.text.toLowerCase()));
                    },
                    onSelected: (selection) {
                      item.nameController.text = selection;
                      _titleController.text = selection;
                      setState(() {});
                    },
                    fieldViewBuilder: (ctx, textEditingController, focusNode, onFieldSubmitted) {
                      return TextFormField(
                        controller: textEditingController,
                        focusNode: focusNode,
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onSurface,
                        ),
                        decoration: InputDecoration(
                          hintText: '12W Safari',
                          hintStyle: TextStyle(
                            fontSize: 13,
                            color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                          ),
                          suffixIcon: const Icon(Icons.keyboard_arrow_down, size: 20),
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          filled: true,
                          fillColor: inputFill,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide(color: inputBorder),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide(color: inputBorder),
                          ),
                        ),
                        onChanged: (val) {
                          item.nameController.text = val;
                          _titleController.text = val;
                        },
                        validator: (v) =>
                            v == null || v.trim().isEmpty ? 'Please enter item name' : null,
                      );
                    },
                  ),
                  const SizedBox(height: 14),

                  // 2. Quantity (Cartons / Units) + Unit Dropdown
                  _buildFieldLabel('Quantity', isDark),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        flex: 6,
                        child: TextFormField(
                          controller: item.cartonsController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onSurface,
                          ),
                          decoration: InputDecoration(
                            hintText: '10',
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            filled: true,
                            fillColor: inputFill,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: BorderSide(color: inputBorder),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: BorderSide(color: inputBorder),
                            ),
                          ),
                          onChanged: (val) {
                            final c = double.tryParse(val) ?? 0.0;
                            final p = double.tryParse(item.pcsController.text) ?? 0.0;
                            if (c > 0 && p > 0) {
                              item.qtyController.text = (c * p).toStringAsFixed(0);
                            } else {
                              item.qtyController.text = val;
                            }
                            setState(() {});
                          },
                          validator: (v) =>
                              v == null || v.trim().isEmpty ? 'Enter qty' : null,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        flex: 4,
                        child: Container(
                          height: 44,
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          decoration: BoxDecoration(
                            color: inputFill,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: inputBorder),
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: _stockPackagingUnit,
                              isExpanded: true,
                              icon: const Icon(Icons.keyboard_arrow_down, size: 20),
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: theme.colorScheme.onSurface,
                              ),
                              items: const [
                                DropdownMenuItem(value: 'Carton', child: Text('Carton')),
                                DropdownMenuItem(value: 'Pcs', child: Text('Pcs')),
                                DropdownMenuItem(value: 'Dozen', child: Text('Dozen')),
                                DropdownMenuItem(value: 'Box', child: Text('Box')),
                              ],
                              onChanged: (val) {
                                if (val != null) setState(() => _stockPackagingUnit = val);
                              },
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // 3. Pieces per Carton
                  if (_stockPackagingUnit == 'Carton') ...[
                    _buildFieldLabel('Pieces per Carton', isDark),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: item.pcsController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.onSurface,
                      ),
                      decoration: InputDecoration(
                        hintText: '100',
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        filled: true,
                        fillColor: inputFill,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: inputBorder),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: inputBorder),
                        ),
                      ),
                      onChanged: (val) {
                        final p = double.tryParse(val) ?? 0.0;
                        final c = double.tryParse(item.cartonsController.text) ?? 0.0;
                        if (c > 0 && p > 0) {
                          item.qtyController.text = (c * p).toStringAsFixed(0);
                        }
                        setState(() {});
                      },
                    ),
                    const SizedBox(height: 14),
                  ],

                  // 4. Unit Price (ETB)
                  _buildFieldLabel('Unit Price (ETB)', isDark),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: item.priceController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.onSurface,
                    ),
                    decoration: InputDecoration(
                      hintText: '65',
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      filled: true,
                      fillColor: inputFill,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: inputBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: inputBorder),
                      ),
                    ),
                    onChanged: (_) => setState(() {}),
                    validator: (v) =>
                        v == null || v.trim().isEmpty ? 'Enter unit price' : null,
                  ),
                  const SizedBox(height: 14),

                  // 5. Total (ETB) Auto-Computed Field
                  _buildFieldLabel('Total (ETB)', isDark),
                  const SizedBox(height: 6),
                  Container(
                    height: 46,
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    alignment: Alignment.centerLeft,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1),
                      ),
                    ),
                    child: Text(
                      calculatedTotal > 0
                          ? _currencyFormat.format(calculatedTotal)
                          : '65,000',
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w900,
                        color: calculatedTotal > 0
                            ? (isDark ? const Color(0xFF68DBA9) : const Color(0xFF006948))
                            : (isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // 6. Date Field with Calendar Picker
                  _buildFieldLabel('Date', isDark),
                  const SizedBox(height: 6),
                  InkWell(
                    onTap: _pickDate,
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      height: 46,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: inputFill,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: inputBorder),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            DateFormat('dd/MM/yyyy').format(_selectedDate),
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                              color: theme.colorScheme.onSurface,
                            ),
                          ),
                          Icon(
                            Icons.calendar_today_outlined,
                            size: 18,
                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // 7. Note (optional)
                  _buildFieldLabel('Note (optional)', isDark),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _notesController,
                    style: TextStyle(
                      fontSize: 13,
                      color: theme.colorScheme.onSurface,
                    ),
                    decoration: InputDecoration(
                      hintText: 'From supplier',
                      hintStyle: TextStyle(
                        fontSize: 12.5,
                        color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                      ),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      filled: true,
                      fillColor: inputFill,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: inputBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: inputBorder),
                      ),
                    ),
                  ),
                  const SizedBox(height: 22),

                  // 8. Save Full-Width Action Button
                  SizedBox(
                    height: 48,
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _handleSubmit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB), // Stitch Primary Blue
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: const Text(
                        'Save',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFieldLabel(String label, bool isDark) {
    return Text(
      label,
      style: TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.bold,
        color: isDark ? const Color(0xFFE2E8F0) : const Color(0xFF1E293B),
      ),
    );
  }

  /// Authentic Horizontal Excel Spreadsheet Table Dialog for Ledger Accounts (Customer, Supplier, Delala)
  Widget _buildLedgerTableDialog(
    ThemeData theme,
    bool isDark,
    bool isCustomer,
    bool isDelala,
  ) {
    final badgeLabel = isCustomer
        ? 'Customer Credit Ledger'
        : isDelala
            ? 'Delala (Broker) Ledger'
            : 'Supplier Credit Ledger';

    final headerTitle = widget.editingRecord == null
        ? (isCustomer
            ? 'New Customer Ledger'
            : isDelala
                ? 'New Delala Entry'
                : 'New Supplier Ledger')
        : (isCustomer
            ? 'Edit Customer Ledger'
            : isDelala
                ? 'Edit Delala Entry'
                : 'Edit Supplier Ledger');

    final nameLabel = isCustomer
        ? 'Customer / Party Name'
        : isDelala
            ? 'Delala / Broker Name'
            : 'Supplier / Vendor Name';

    final nameHint = isCustomer
        ? 'e.g. Apex Construction Ltd. or Kelil Aginbi'
        : isDelala
            ? 'e.g. Abebe Delala, Merkato Agent'
            : 'e.g. Summit Raw Materials Ltd.';

    final grandTotal = _calculateGrandTotal();

    return Dialog(
      backgroundColor: theme.colorScheme.surface,
      insetPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 640,
          maxHeight: MediaQuery.of(context).size.height * 0.92,
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header with Badge & Title
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                          decoration: BoxDecoration(
                            color: isCustomer
                                ? const Color(0xFF006948).withOpacity(0.12)
                                : isDelala
                                    ? const Color(0xFFD97706).withOpacity(0.12)
                                    : const Color(0xFF2563EB).withOpacity(0.12),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            badgeLabel,
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.bold,
                              color: isCustomer
                                  ? const Color(0xFF006948)
                                  : isDelala
                                      ? const Color(0xFFD97706)
                                      : const Color(0xFF2563EB),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          headerTitle,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      onPressed: () => Navigator.of(context).pop(),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Divider(height: 1, thickness: 1, color: theme.dividerColor),
                const SizedBox(height: 10),

                // Party Name Field
                Text(
                  nameLabel,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                  ),
                ),
                const SizedBox(height: 4),
                TextFormField(
                  controller: _titleController,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.colorScheme.onSurface),
                  decoration: InputDecoration(
                    hintText: nameHint,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    filled: true,
                    fillColor: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF8FAFC),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  validator: (v) => v == null || v.trim().isEmpty ? 'Please enter name' : null,
                ),
                const SizedBox(height: 8),

                // Date & Notes Row
                Row(
                  children: [
                    Expanded(
                      flex: 5,
                      child: InkWell(
                        onTap: _pickDate,
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF8FAFC),
                            border: Border.all(color: isDark ? const Color(0xFF27272A) : Colors.grey.shade300),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                DateFormat('yyyy-MM-dd').format(_selectedDate),
                                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: theme.colorScheme.onSurface),
                              ),
                              Icon(Icons.calendar_today_outlined, size: 14, color: Colors.grey.shade600),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 7,
                      child: TextFormField(
                        controller: _notesController,
                        style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface),
                        decoration: InputDecoration(
                          hintText: 'Note / Phone (Optional)',
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                          filled: true,
                          fillColor: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF8FAFC),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Excel Spreadsheet Table Section Header with Add Row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.table_chart_outlined, size: 15, color: Color(0xFF006948)),
                        const SizedBox(width: 5),
                        Text(
                          'TRANSACTION ROWS (EXCEL TABLE)',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
                            letterSpacing: 0.4,
                          ),
                        ),
                      ],
                    ),
                    TextButton.icon(
                      onPressed: _addItem,
                      icon: const Icon(Icons.add, size: 15),
                      label: const Text('Add Row', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold)),
                      style: TextButton.styleFrom(
                        foregroundColor: const Color(0xFF006948),
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),

                // Authentic Excel Table Grid
                Expanded(
                  child: _buildExcelGrid(false),
                ),
                const SizedBox(height: 10),

                // Grand Total Bar
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Net Ledger Balance:',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 12.5,
                          color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                        ),
                      ),
                      Text(
                        'ETB ${_currencyFormat.format(grandTotal)}',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                          color: grandTotal >= 0 ? const Color(0xFF006948) : const Color(0xFFBA1A1A),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Save Action Button
                SizedBox(
                  height: 44,
                  child: ElevatedButton(
                    onPressed: _handleSubmit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF006948),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                    ),
                    child: Text(
                      widget.editingRecord == null ? 'Save Entry to Neon DB' : 'Update Entry in Neon DB',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Authentic Web-Style Horizontal Excel Spreadsheet Table
  Widget _buildExcelGrid(bool isStock) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF18181B) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isDark ? const Color(0xFF27272A) : const Color(0xFFE2E8F0),
        ),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: SingleChildScrollView(
          scrollDirection: Axis.vertical,
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header Row
                Row(
                  children: [
                    _gridHeaderCell('+/-', 36),
                    _gridHeaderCell(isStock ? 'Type' : 'Channel', 85),
                    _gridHeaderCell('Item / Description', 140),
                    _gridHeaderCell('Ctns', 50),
                    _gridHeaderCell('Pcs/Ctn', 55),
                    _gridHeaderCell('Total Pcs', 55),
                    _gridHeaderCell('Price (ETB)', 80),
                    if (isStock && _showCustoms) _gridHeaderCell('Customs', 65),
                    _gridHeaderCell('Amount', 90),
                    _gridHeaderCell('', 32),
                  ],
                ),
                const SizedBox(height: 6),
                Divider(height: 1, thickness: 1, color: isDark ? const Color(0xFF27272A) : Colors.grey.shade300),
                const SizedBox(height: 6),

                // Data Rows
                ...List.generate(_formItems.length, (idx) {
                  final item = _formItems[idx];
                  final isDebit = item.sign == '+';
                  final qty = double.tryParse(item.qtyController.text) ?? item.quantity;
                  final price = double.tryParse(item.priceController.text) ?? item.unitPrice;
                  final customs = double.tryParse(item.customsController.text) ?? (item.customs ?? 0.0);
                  final subtotal = (qty * price) + (isDebit ? customs : 0.0);

                  final currentOptions = isDebit ? _stockTypeOptions : _bankOptions;
                  final safeOpt = currentOptions.contains(item.typeOrBank)
                      ? item.typeOrBank
                      : (isDebit ? 'Stock' : 'CBE');

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6.0),
                    child: Row(
                      children: [
                        // +/- Sign Toggle
                        SizedBox(
                          width: 36,
                          height: 32,
                          child: OutlinedButton(
                            onPressed: () => _toggleItemSign(item),
                            style: OutlinedButton.styleFrom(
                              padding: EdgeInsets.zero,
                              side: BorderSide(
                                color: isDebit ? const Color(0xFF006948) : const Color(0xFFBA1A1A),
                              ),
                              backgroundColor: isDebit
                                  ? const Color(0xFF006948).withOpacity(0.1)
                                  : const Color(0xFFBA1A1A).withOpacity(0.1),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                            ),
                            child: Text(
                              item.sign,
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 14,
                                color: isDebit ? const Color(0xFF006948) : const Color(0xFFBA1A1A),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),

                        // Channel / Type Dropdown
                        SizedBox(
                          width: 85,
                          height: 32,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF27272A) : Colors.white,
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: isDark ? const Color(0xFF3F3F46) : Colors.grey.shade300,
                              ),
                            ),
                            child: DropdownButtonHideUnderline(
                              child: DropdownButton<String>(
                                value: safeOpt,
                                isDense: true,
                                isExpanded: true,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: theme.colorScheme.onSurface,
                                ),
                                items: currentOptions.map((opt) {
                                  return DropdownMenuItem(
                                    value: opt,
                                    child: Text(opt, overflow: TextOverflow.ellipsis),
                                  );
                                }).toList(),
                                onChanged: (val) {
                                  if (val != null) setState(() => item.typeOrBank = val);
                                },
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),

                        // Item / Description Field
                        SizedBox(
                          width: 140,
                          height: 32,
                          child: TextFormField(
                            controller: item.nameController,
                            style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurface),
                            decoration: InputDecoration(
                              hintText: isDebit ? 'Item (e.g. 12W Safari)' : 'Bank ref (e.g. CBE #1029)',
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                              filled: true,
                              fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                            ),
                            validator: (v) => v == null || v.trim().isEmpty ? 'Req' : null,
                          ),
                        ),
                        const SizedBox(width: 6),

                        // Cartons
                        SizedBox(
                          width: 50,
                          height: 32,
                          child: TextFormField(
                            controller: item.cartonsController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurface),
                            decoration: InputDecoration(
                              hintText: 'Ctns',
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                              filled: true,
                              fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                            ),
                            onChanged: (val) {
                              final c = double.tryParse(val) ?? 0.0;
                              final p = double.tryParse(item.pcsController.text) ?? 0.0;
                              if (c > 0 && p > 0) item.qtyController.text = (c * p).toStringAsFixed(0);
                              setState(() {});
                            },
                          ),
                        ),
                        const SizedBox(width: 6),

                        // Pcs / Carton
                        SizedBox(
                          width: 55,
                          height: 32,
                          child: TextFormField(
                            controller: item.pcsController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurface),
                            decoration: InputDecoration(
                              hintText: 'Pcs',
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                              filled: true,
                              fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                            ),
                            onChanged: (val) {
                              final c = double.tryParse(item.cartonsController.text) ?? 0.0;
                              final p = double.tryParse(val) ?? 0.0;
                              if (c > 0 && p > 0) item.qtyController.text = (c * p).toStringAsFixed(0);
                              setState(() {});
                            },
                          ),
                        ),
                        const SizedBox(width: 6),

                        // Total Quantity
                        SizedBox(
                          width: 55,
                          height: 32,
                          child: TextFormField(
                            controller: item.qtyController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                            decoration: InputDecoration(
                              hintText: 'Total',
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                              filled: true,
                              fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        const SizedBox(width: 6),

                        // Price
                        SizedBox(
                          width: 80,
                          height: 32,
                          child: TextFormField(
                            controller: item.priceController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                            decoration: InputDecoration(
                              hintText: 'Price',
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                              filled: true,
                              fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        const SizedBox(width: 6),

                        // Customs (Optional)
                        if (isStock && _showCustoms) ...[
                          SizedBox(
                            width: 65,
                            height: 32,
                            child: TextFormField(
                              controller: item.customsController,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface),
                              decoration: InputDecoration(
                                hintText: 'Duty',
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                                filled: true,
                                fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                              ),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                          const SizedBox(width: 6),
                        ],

                        // Amount
                        SizedBox(
                          width: 90,
                          child: Text(
                            _currencyFormat.format(subtotal),
                            textAlign: TextAlign.right,
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w800,
                              color: isDebit ? const Color(0xFF006948) : const Color(0xFFBA1A1A),
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),

                        // Delete
                        SizedBox(
                          width: 32,
                          child: _formItems.length > 1
                              ? IconButton(
                                  icon: const Icon(Icons.delete_outline, size: 16, color: Color(0xFFEF4444)),
                                  onPressed: () => _removeItem(idx),
                                  padding: EdgeInsets.zero,
                                )
                              : null,
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _gridHeaderCell(String text, double width) {
    return SizedBox(
      width: width,
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: Color(0xFF64748B),
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

class LineItemFormItem {
  final String id;
  late TextEditingController nameController;
  late TextEditingController qtyController;
  late TextEditingController priceController;
  late TextEditingController cartonsController;
  late TextEditingController pcsController;
  late TextEditingController customsController;
  String sign;
  String typeOrBank;
  double quantity;
  double unitPrice;
  double? customs;

  LineItemFormItem({
    required this.id,
    required String name,
    required this.unitPrice,
    required this.quantity,
    required this.sign,
    required this.typeOrBank,
    double? cartons,
    double? pcsPerCarton,
    this.customs,
  }) {
    nameController = TextEditingController(text: name);
    qtyController = TextEditingController(
        text: quantity.truncateToDouble() == quantity
            ? quantity.toInt().toString()
            : quantity.toString());
    priceController = TextEditingController(
        text: unitPrice.truncateToDouble() == unitPrice
            ? unitPrice.toInt().toString()
            : unitPrice.toString());
    cartonsController = TextEditingController(
        text: cartons != null && cartons > 0
            ? (cartons.truncateToDouble() == cartons
                ? cartons.toInt().toString()
                : cartons.toString())
            : '');
    final pcsVal = pcsPerCarton;
    pcsController = TextEditingController(
        text: pcsVal != null && pcsVal > 0
            ? (pcsVal.truncateToDouble() == pcsVal
                ? pcsVal.toInt().toString()
                : pcsVal.toString())
            : '');
    final cVal = customs;
    customsController = TextEditingController(
        text: cVal != null && cVal > 0
            ? (cVal.truncateToDouble() == cVal
                ? cVal.toInt().toString()
                : cVal.toString())
            : '');
  }

  factory LineItemFormItem.fromLineItem(LineItem item) {
    return LineItemFormItem(
      id: item.id,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      sign: item.sign,
      typeOrBank: item.sign == '-'
          ? (item.bank ?? item.paymentMethod ?? 'CBE')
          : (item.customType ?? 'Stock'),
      cartons: item.cartons,
      pcsPerCarton: item.pcsPerCarton,
      customs: item.customs,
    );
  }

  void dispose() {
    nameController.dispose();
    qtyController.dispose();
    priceController.dispose();
    cartonsController.dispose();
    pcsController.dispose();
    customsController.dispose();
  }
}
