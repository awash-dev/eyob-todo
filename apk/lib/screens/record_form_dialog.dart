import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/ledger_record.dart';
import '../models/line_item.dart';

class RecordFormDialog extends StatefulWidget {
  final String activeTab; // 'customer' | 'supplier' | 'stock'
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

  bool _isExcelGridView = false;
  bool _showCustoms = false;

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

    final badgeLabel = isCustomer
        ? 'Customer Credit'
        : isStock
            ? 'Stock & Inventory'
            : isDelala
                ? 'Delala (Broker) Credit'
                : 'Supplier Credit';

    final headerTitle = widget.editingRecord == null
        ? (isCustomer
            ? 'New Customer Entry'
            : isStock
                ? 'Stock In (Storekeeper)'
                : isDelala
                    ? 'New Delala Entry'
                    : 'New Supplier Entry')
        : (isCustomer
            ? 'Edit Customer Entry'
            : isStock
                ? 'Edit Stock Entry'
                : isDelala
                    ? 'Edit Delala Entry'
                    : 'Edit Supplier Entry');

    final nameLabel = isCustomer
        ? 'Customer Name (የደንበኛ ስም)'
        : isStock
            ? 'Item / Batch Name (የዕቃ ስም)'
            : isDelala
                ? 'Delala / Broker Name (የደላላ ስም)'
                : 'Supplier Name (የአቅራቢ ስም)';

    final nameHint = isCustomer
        ? 'e.g. Apex Construction Ltd., Kelil Aginbi, Sarah Connor'
        : isStock
            ? 'e.g. 12W SAFARI LED Bulbs Batch #4'
            : isDelala
                ? 'e.g. Abebe Delala, Merkato Broker Agent'
                : 'e.g. Summit Raw Materials, Global Tech';

    final grandTotal = _calculateGrandTotal();

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final badgeBg = isCustomer
        ? (isDark ? const Color(0xFF064E3B) : const Color(0xFFECFDF5))
        : isStock
            ? (isDark ? const Color(0xFF3B0764) : const Color(0xFFFAF5FF))
            : isDelala
                ? (isDark ? const Color(0xFF451A03) : const Color(0xFFFFFBEB))
                : (isDark ? const Color(0xFF1E3A8A) : const Color(0xFFEFF6FF));

    final badgeBorder = isCustomer
        ? (isDark ? const Color(0xFF059669) : const Color(0xFFA7F3D0))
        : isStock
            ? (isDark ? const Color(0xFF9333EA) : const Color(0xFFE9D5FF))
            : isDelala
                ? (isDark ? const Color(0xFFD97706) : const Color(0xFFFDE68A))
                : (isDark ? const Color(0xFF2563EB) : const Color(0xFFBFDBFE));

    final badgeColor = isCustomer
        ? (isDark ? const Color(0xFF6EE7B7) : const Color(0xFF059669))
        : isStock
            ? (isDark ? const Color(0xFFD8B4FE) : const Color(0xFF7C3AED))
            : isDelala
                ? (isDark ? const Color(0xFFFCD34D) : const Color(0xFFD97706))
                : (isDark ? const Color(0xFF93C5FD) : const Color(0xFF1D4ED8));

    final badgeIcon = isCustomer
        ? Icons.people_outline
        : isStock
            ? Icons.layers_outlined
            : isDelala
                ? Icons.handshake_outlined
                : Icons.business_outlined;

    return Dialog(
      backgroundColor: theme.colorScheme.surface,
      insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: _isExcelGridView ? 620 : 500,
          maxHeight: MediaQuery.of(context).size.height * 0.9,
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 1. Header with Web-Aligned Badge, Title, Customs Toggle & Close
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                            decoration: BoxDecoration(
                              color: badgeBg,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: badgeBorder),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(badgeIcon, size: 12, color: badgeColor),
                                const SizedBox(width: 4),
                                Text(
                                  badgeLabel,
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: badgeColor,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              headerTitle,
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                                color: theme.colorScheme.onSurface,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),

                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (isStock)
                          TextButton.icon(
                            onPressed: () => setState(() => _showCustoms = !_showCustoms),
                            icon: Icon(
                              _showCustoms ? Icons.check_circle : Icons.shield_outlined,
                              size: 13,
                              color: _showCustoms ? const Color(0xFFD97706) : const Color(0xFF64748B),
                            ),
                            label: Text(
                              _showCustoms ? 'Customs On' : '+ Customs',
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.bold,
                                color: _showCustoms ? const Color(0xFFD97706) : const Color(0xFF64748B),
                              ),
                            ),
                            style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              visualDensity: VisualDensity.compact,
                            ),
                          ),
                        IconButton(
                          icon: const Icon(Icons.close, size: 20),
                          onPressed: () => Navigator.of(context).pop(),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          tooltip: 'Close',
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Divider(height: 1, thickness: 1, color: theme.dividerColor),
                const SizedBox(height: 12),

                // 2. Scrollable Form Body
                Expanded(
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Account / Item Name Field
                        Text(
                          nameLabel,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                          ),
                        ),
                        const SizedBox(height: 5),
                        TextFormField(
                          controller: _titleController,
                          style: TextStyle(
                            fontSize: 13,
                            color: theme.colorScheme.onSurface,
                            fontWeight: FontWeight.w500,
                          ),
                          decoration: InputDecoration(
                            hintText: nameHint,
                            hintStyle: TextStyle(
                              fontSize: 12,
                              color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                            ),
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            filled: true,
                            fillColor: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF8FAFC),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: BorderSide(
                                color: isDark ? const Color(0xFF27272A) : Colors.grey.shade300,
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: BorderSide(
                                color: isDark ? const Color(0xFF27272A) : Colors.grey.shade300,
                              ),
                            ),
                          ),
                          validator: (v) => v == null || v.trim().isEmpty ? 'Please enter name' : null,
                        ),
                        const SizedBox(height: 10),

                        // Date & Notes Row
                        Row(
                          children: [
                            // Date
                            Expanded(
                              flex: 5,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Date',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  InkWell(
                                    onTap: _pickDate,
                                    borderRadius: BorderRadius.circular(10),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                                      decoration: BoxDecoration(
                                        color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF8FAFC),
                                        border: Border.all(
                                          color: isDark ? const Color(0xFF27272A) : Colors.grey.shade300,
                                        ),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            DateFormat('yyyy-MM-dd').format(_selectedDate),
                                            style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                              color: theme.colorScheme.onSurface,
                                            ),
                                          ),
                                          Icon(
                                            Icons.calendar_today_outlined,
                                            size: 15,
                                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),

                            // Invoice / Notes
                            Expanded(
                              flex: 6,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Invoice / Notes',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  TextFormField(
                                    controller: _notesController,
                                    style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface),
                                    decoration: InputDecoration(
                                      hintText: 'Optional ref or phone',
                                      hintStyle: TextStyle(
                                        fontSize: 11,
                                        color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                                      ),
                                      isDense: true,
                                      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                                      filled: true,
                                      fillColor: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF8FAFC),
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(10),
                                        borderSide: BorderSide(
                                          color: isDark ? const Color(0xFF27272A) : Colors.grey.shade300,
                                        ),
                                      ),
                                      enabledBorder: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(10),
                                        borderSide: BorderSide(
                                          color: isDark ? const Color(0xFF27272A) : Colors.grey.shade300,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),

                        // 3. TRANSACTION ITEMS Header with View Switcher & Add Button
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Text(
                                  isStock ? 'STOCK INVENTORY ITEMS' : 'TRANSACTION ITEMS',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
                                    letterSpacing: 0.5,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                // View Mode Toggle (Grid vs Cards)
                                InkWell(
                                  onTap: () => setState(() => _isExcelGridView = !_isExcelGridView),
                                  borderRadius: BorderRadius.circular(6),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _isExcelGridView
                                          ? const Color(0xFF059669).withValues(alpha: 0.15)
                                          : (isDark ? Colors.grey.shade800 : Colors.grey.shade200),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(
                                          _isExcelGridView ? Icons.table_chart : Icons.view_agenda_outlined,
                                          size: 11,
                                          color: _isExcelGridView ? const Color(0xFF059669) : Colors.grey.shade600,
                                        ),
                                        const SizedBox(width: 3),
                                        Text(
                                          _isExcelGridView ? 'Excel Grid' : 'Card View',
                                          style: TextStyle(
                                            fontSize: 9.5,
                                            fontWeight: FontWeight.bold,
                                            color: _isExcelGridView ? const Color(0xFF059669) : Colors.grey.shade600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            TextButton.icon(
                              onPressed: _addItem,
                              icon: const Icon(Icons.add_circle_outline, size: 14),
                              label: const Text('Add Row', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold)),
                              style: TextButton.styleFrom(
                                foregroundColor: const Color(0xFF059669),
                                visualDensity: VisualDensity.compact,
                                padding: const EdgeInsets.symmetric(horizontal: 4),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),

                        // 4. Line Items List (Excel Grid Mode OR Compact Cards Mode)
                        if (_isExcelGridView)
                          _buildExcelGrid(isStock)
                        else
                          ListView.separated(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: _formItems.length,
                            separatorBuilder: (_, _) => const SizedBox(height: 8),
                            itemBuilder: (ctx, index) {
                              return _buildWebStyleItemCard(_formItems[index], index, isStock);
                            },
                          ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 10),
                Divider(height: 1, thickness: 1, color: theme.dividerColor),
                const SizedBox(height: 10),

                // 5. Total Summary Footer
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        isStock ? 'Total Inventory Valuation:' : 'Net Balance Amount:',
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
                          color: grandTotal >= 0 ? const Color(0xFF059669) : const Color(0xFFDC2626),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // 6. Action Buttons
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: TextButton.styleFrom(
                        foregroundColor: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      ),
                      child: const Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      onPressed: _handleSubmit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF059669),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        elevation: 0,
                      ),
                      child: Text(
                        widget.editingRecord == null ? 'Save Entry' : 'Save Changes',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Compact Web-Style Card View
  Widget _buildWebStyleItemCard(LineItemFormItem item, int index, bool isStock) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isDebit = item.sign == '+';

    final qty = double.tryParse(item.qtyController.text) ?? item.quantity;
    final price = double.tryParse(item.priceController.text) ?? item.unitPrice;
    final customs = double.tryParse(item.customsController.text) ?? (item.customs ?? 0.0);
    final subtotal = (qty * price) + (isDebit ? customs : 0.0);

    final currentOptions = isDebit ? _stockTypeOptions : _bankOptions;
    final safeSelectedOption = currentOptions.contains(item.typeOrBank)
        ? item.typeOrBank
        : (isDebit ? 'Stock' : 'CBE');

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF18181B) : const Color(0xFFFAFAFA),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isDark ? const Color(0xFF27272A) : const Color(0xFFE4E4E7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Row 1: Sign Toggle Pill + Type/Bank Dropdown + Delete
          Row(
            children: [
              // Sign Toggle Pill (+/-)
              InkWell(
                onTap: () => _toggleItemSign(item),
                borderRadius: BorderRadius.circular(6),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: isDebit
                        ? (isDark ? const Color(0xFF064E3B) : const Color(0xFFECFDF5))
                        : (isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFEF2F2)),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: isDebit
                          ? (isDark ? const Color(0xFF059669) : const Color(0xFFA7F3D0))
                          : (isDark ? const Color(0xFFDC2626) : const Color(0xFFFCA5A5)),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        item.sign,
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 13,
                          color: isDebit ? const Color(0xFF059669) : const Color(0xFFDC2626),
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        isStock
                            ? (isDebit ? 'Stock In (+)' : 'Stock Out (-)')
                            : (isDebit ? 'Debit (+ Goods)' : 'Credit (- Payment)'),
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.bold,
                          color: isDebit ? const Color(0xFF059669) : const Color(0xFFDC2626),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const Spacer(),

              // Type / Bank Dropdown
              Container(
                height: 30,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF27272A) : Colors.white,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: isDark ? const Color(0xFF3F3F46) : Colors.grey.shade300,
                  ),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: safeSelectedOption,
                    isDense: true,
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.onSurface,
                    ),
                    items: currentOptions.map((opt) {
                      return DropdownMenuItem(
                        value: opt,
                        child: Text(opt),
                      );
                    }).toList(),
                    onChanged: (val) {
                      if (val != null) setState(() => item.typeOrBank = val);
                    },
                  ),
                ),
              ),

              if (_formItems.length > 1) ...[
                const SizedBox(width: 6),
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444), size: 18),
                  onPressed: () => _removeItem(index),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  tooltip: 'Delete row',
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),

          // Row 2: Item Description
          TextFormField(
            controller: item.nameController,
            style: TextStyle(fontSize: 12.5, color: theme.colorScheme.onSurface),
            decoration: InputDecoration(
              labelText: isDebit ? 'Item / Goods Description' : 'Payment / Bank Reference',
              labelStyle: TextStyle(
                fontSize: 11,
                color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
              ),
              hintText: isDebit ? 'e.g. 12W SAFARI or Cement Bags' : 'e.g. CBE Bank Transfer #4829',
              hintStyle: TextStyle(
                fontSize: 11,
                color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
              ),
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              filled: true,
              fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(
                  color: isDark ? const Color(0xFF3F3F46) : Colors.grey.shade300,
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(
                  color: isDark ? const Color(0xFF3F3F46) : Colors.grey.shade300,
                ),
              ),
            ),
            validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
          ),
          const SizedBox(height: 8),

          // Row 3: Packaging Breakdown (if Stock)
          if (isStock) ...[
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: item.cartonsController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface),
                    decoration: InputDecoration(
                      labelText: 'Cartons (Ctns)',
                      labelStyle: TextStyle(fontSize: 10.5, color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                      hintText: '10',
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                      filled: true,
                      fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onChanged: (val) {
                      final c = double.tryParse(val) ?? 0.0;
                      final p = double.tryParse(item.pcsController.text) ?? 0.0;
                      if (c > 0 && p > 0) {
                        item.qtyController.text = (c * p).toStringAsFixed(0);
                      }
                      setState(() {});
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextFormField(
                    controller: item.pcsController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface),
                    decoration: InputDecoration(
                      labelText: 'Pcs / Carton',
                      labelStyle: TextStyle(fontSize: 10.5, color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                      hintText: '100',
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                      filled: true,
                      fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onChanged: (val) {
                      final c = double.tryParse(item.cartonsController.text) ?? 0.0;
                      final p = double.tryParse(val) ?? 0.0;
                      if (c > 0 && p > 0) {
                        item.qtyController.text = (c * p).toStringAsFixed(0);
                      }
                      setState(() {});
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],

          // Row 4: Total Quantity & Unit Price
          Row(
            children: [
              Expanded(
                flex: 5,
                child: TextFormField(
                  controller: item.qtyController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                  decoration: InputDecoration(
                    labelText: isStock ? 'Total Units (Pcs)' : 'Total Quantity',
                    labelStyle: TextStyle(fontSize: 11, color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                    filled: true,
                    fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onChanged: (_) => setState(() {}),
                  validator: (v) {
                    final num = double.tryParse(v ?? '');
                    if (num == null || num <= 0) return 'Invalid';
                    return null;
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 6,
                child: TextFormField(
                  controller: item.priceController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                  decoration: InputDecoration(
                    labelText: isStock ? 'Unit Cost (ETB)' : 'Unit Price (ETB)',
                    labelStyle: TextStyle(fontSize: 11, color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                    filled: true,
                    fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onChanged: (_) => setState(() {}),
                  validator: (v) {
                    final num = double.tryParse(v ?? '');
                    if (num == null || num < 0) return 'Invalid';
                    return null;
                  },
                ),
              ),
            ],
          ),

          // Optional Customs Duty (for Stock)
          if (isStock && _showCustoms) ...[
            const SizedBox(height: 8),
            TextFormField(
              controller: item.customsController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface),
              decoration: InputDecoration(
                labelText: 'Customs Duty / Tariff (ETB)',
                labelStyle: TextStyle(fontSize: 11, color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                hintText: '0',
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                filled: true,
                fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onChanged: (_) => setState(() {}),
            ),
          ],

          const SizedBox(height: 6),

          // Subtotal display
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            alignment: Alignment.centerRight,
            child: Text(
              'Subtotal: ETB ${_currencyFormat.format(subtotal)}',
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w800,
                color: isDebit ? const Color(0xFF059669) : const Color(0xFFDC2626),
              ),
            ),
          ),
        ],
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
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isDark ? const Color(0xFF27272A) : const Color(0xFFE2E8F0),
        ),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
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
                  if (isStock) ...[
                    _gridHeaderCell('Ctns', 50),
                    _gridHeaderCell('Pcs/Ctn', 55),
                  ],
                  _gridHeaderCell(isStock ? 'Units' : 'Qty', 55),
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
                              color: isDebit ? const Color(0xFF059669) : const Color(0xFFDC2626),
                            ),
                            backgroundColor: isDebit
                                ? const Color(0xFF059669).withValues(alpha: 0.1)
                                : const Color(0xFFDC2626).withValues(alpha: 0.1),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                          ),
                          child: Text(
                            item.sign,
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 14,
                              color: isDebit ? const Color(0xFF059669) : const Color(0xFFDC2626),
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
                            border: Border.all(color: Colors.grey.shade300),
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: safeOpt,
                              isDense: true,
                              style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface),
                              items: currentOptions.map((opt) {
                                return DropdownMenuItem(value: opt, child: Text(opt));
                              }).toList(),
                              onChanged: (val) {
                                if (val != null) setState(() => item.typeOrBank = val);
                              },
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),

                      // Item Description
                      SizedBox(
                        width: 140,
                        height: 32,
                        child: TextFormField(
                          controller: item.nameController,
                          style: TextStyle(fontSize: 11.5, color: theme.colorScheme.onSurface),
                          decoration: InputDecoration(
                            hintText: 'Item name / ref',
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                            filled: true,
                            fillColor: isDark ? const Color(0xFF27272A) : Colors.white,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),

                      // Stock Cartons & Pcs
                      if (isStock) ...[
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
                      ],

                      // Total Quantity
                      SizedBox(
                        width: 55,
                        height: 32,
                        child: TextFormField(
                          controller: item.qtyController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                          decoration: InputDecoration(
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

                      // Customs Duty (optional)
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
                            color: isDebit ? const Color(0xFF059669) : const Color(0xFFDC2626),
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
