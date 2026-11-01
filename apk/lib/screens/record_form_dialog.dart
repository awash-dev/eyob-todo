import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/ledger_record.dart';
import '../models/line_item.dart';

class RecordFormDialog extends StatefulWidget {
  final String activeTab; // 'customer' | 'supplier' | 'stock' | 'delala'
  final LedgerRecord? editingRecord;
  final List<LedgerRecord>? existingRecords;
  final String? shopId;

  const RecordFormDialog({
    super.key,
    required this.activeTab,
    this.editingRecord,
    this.existingRecords,
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
  int _activeItemIndex = 0;

  final TextEditingController _otherUnitController = TextEditingController();

  static const List<String> _stockSuggestions = [
    '12W Safari',
    '3W Effishent',
    '6W Effishent',
    '9W Effishent',
    '5W Candel3000K',
    '5W Candel8000K',
    '12W Safari300K',
    '2.5 bmt',
    '2.5 elusdy',
    'yebefit keri (የበፊት ቀሪ)',
    'Portland Cement Bags (50kg)',
  ];

  static const List<String> _packagingUnits = [
    'Carton',
    'Pcs',
    'Dozen',
    'Box',
    'Roll',
    'Meter',
    'Bag',
    'Other',
  ];

  static const List<String> _bankOptions = [
    'CBE',
    'CBE Birr',
    'Awash',
    'Dashen',
    'BoA',
    'Abyssinia',
    'Pawza',
    'Telebirr',
    'Amhara',
    'Oromia',
    'Coop',
    'Hibret',
    'Zemen',
    'Berhan',
    'Nib',
    'Wegagen',
    'Abay',
    'Bunna',
    'Enat',
    'Sinqee',
    'Cash',
    'Check',
    'Other',
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
      final firstItem = rec.items.first;
      if (firstItem.packagingUnit != null && firstItem.packagingUnit!.isNotEmpty) {
        final u = firstItem.packagingUnit!;
        if (_packagingUnits.contains(u)) {
          _formItems.first.packagingUnit = u;
        } else {
          _formItems.first.packagingUnit = 'Other';
          _otherUnitController.text = u;
        }
      }
    } else {
      _formItems = [
        LineItemFormItem(
          id: 'item-${DateTime.now().millisecondsSinceEpoch}-1',
          name: '',
          unitPrice: 0.0,
          quantity: 1.0,
          sign: '+',
          typeOrBank: 'CBE',
          packagingUnit: 'Carton',
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
    _otherUnitController.dispose();
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
          typeOrBank: 'CBE',
          packagingUnit: 'Carton',
        ),
      );
      _activeItemIndex = _formItems.length - 1;
    });
  }

  void _removeItem(int index) {
    if (_formItems.length <= 1) return;
    setState(() {
      final removed = _formItems.removeAt(index);
      removed.dispose();
      if (_activeItemIndex >= _formItems.length) {
        _activeItemIndex = _formItems.length - 1;
      }
    });
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

    // If Stock tab, ensure party name is the item name
    if (widget.activeTab == 'stock' && _formItems.isNotEmpty) {
      final first = _formItems.first;
      if (first.nameController.text.trim().isNotEmpty) {
        _titleController.text = first.nameController.text.trim();
      }
    }

    final lineItems = _formItems.map((f) {
      final isDebit = f.sign == '+';
      // Stock records (In or Out) always use the inventory path — never the bank-payment path.
      final bool useInventory = widget.activeTab == 'stock' || isDebit;
      final unitName = f.packagingUnit == 'Other'
          ? (_otherUnitController.text.trim().isNotEmpty ? _otherUnitController.text.trim() : 'Other')
          : f.packagingUnit;

      double price = double.tryParse(f.priceController.text) ?? f.unitPrice;
      double qty = double.tryParse(f.qtyController.text) ?? f.quantity;
      final ctns = double.tryParse(f.cartonsController.text);
      final pcs = double.tryParse(f.pcsController.text);

      String itemName = f.nameController.text.trim();

      // Resolved bank/channel name (uses custom text when "Other" is selected)
      final bankName = useInventory
          ? null
          : (f.typeOrBank == 'Other'
              ? (f.bankCustomController.text.trim().isNotEmpty
                  ? f.bankCustomController.text.trim()
                  : 'Other')
              : f.typeOrBank);

      if (!useInventory) {
        // Credit (payment) for customer/supplier/delala only
        itemName = 'Payment via $bankName';
        qty = 1.0;
      } else {
        if (unitName == 'Carton' && ctns != null && ctns > 0 && pcs != null && pcs > 0) {
          qty = ctns * pcs;
        }
      }

      return LineItem(
        id: f.id,
        name: itemName,
        unitPrice: price,
        quantity: qty,
        sign: f.sign,
        bank: bankName,
        paymentMethod: bankName,
        reference: !useInventory && _notesController.text.trim().isNotEmpty
            ? _notesController.text.trim()
            : null,
        customType: useInventory ? (isDebit ? 'Goods' : 'Stock Out') : null,
        cartons: useInventory ? ctns : null,
        pcsPerCarton: useInventory ? pcs : null,
        packagingUnit: useInventory ? unitName : null,
        date: dateStr,
        notes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
      );
    }).toList();

    final record = LedgerRecord(
      id: widget.editingRecord?.id ?? 'rec-${DateTime.now().millisecondsSinceEpoch}',
      type: widget.activeTab,
      title: _titleController.text.trim().isNotEmpty
          ? _titleController.text.trim()
          : (lineItems.isNotEmpty ? lineItems.first.name : 'Record'),
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

    final inputFill = isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC);
    final inputBorder = isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1);

    // Title label
    final headerTitle = widget.editingRecord == null
        ? (isStock
            ? 'Store Entry (Storekeeper)'
            : isCustomer
                ? 'Customer Credit Entry'
                : isDelala
                    ? 'Delala (Broker) Entry'
                    : 'Supplier Credit Entry')
        : (isStock
            ? 'Edit Store Entry'
            : isCustomer
                ? 'Edit Customer Entry'
                : isDelala
                    ? 'Edit Delala Entry'
                    : 'Edit Supplier Entry');

    final nameLabel = isCustomer
        ? 'Customer Name (የደንበኛ ስም)'
        : isDelala
            ? 'Delala / Broker Name (የደላላ ስም)'
            : isStock
                ? 'Item Name (የዕቃ ስም)'
                : 'Supplier Name (የአቅራቢ ስም)';

    final nameHint = isCustomer
        ? 'e.g. Apex Construction, Kelil Aginbi, Esmiz'
        : isDelala
            ? 'e.g. Abebe Delala, Merkato Agent'
            : isStock
                ? 'e.g. 12W Safari'
                : 'e.g. Summit Raw Materials Ltd.';

    // Current active line item
    if (_activeItemIndex >= _formItems.length) {
      _activeItemIndex = _formItems.length - 1;
    }
    final currentItem = _formItems[_activeItemIndex];
    final isDebit = currentItem.sign == '+';

    final cartons = double.tryParse(currentItem.cartonsController.text) ?? 0.0;
    final pcs = double.tryParse(currentItem.pcsController.text) ?? 0.0;
    final price = double.tryParse(currentItem.priceController.text) ?? 0.0;

    double calculatedTotal = 0.0;
    if (isDebit || isStock) {
      if (currentItem.packagingUnit == 'Carton' && cartons > 0 && pcs > 0 && price > 0) {
        calculatedTotal = cartons * pcs * price;
      } else {
        final q = double.tryParse(currentItem.qtyController.text) ?? cartons;
        calculatedTotal = q * price;
      }
    } else {
      calculatedTotal = price;
    }

    // Existing party names for auto-suggest
    final existingPartyNames = widget.existingRecords != null
        ? widget.existingRecords!
            .where((r) => r.type == widget.activeTab)
            .map((r) => r.title)
            .toSet()
            .toList()
        : <String>[];

    return Dialog(
      backgroundColor: theme.colorScheme.surface,
      insetPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
          child: Form(
            key: _formKey,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 1. Header: Back Arrow & Title
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
                          headerTitle,
                          style: TextStyle(
                            fontSize: 16.5,
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                      ),
                      if (!isStock && _formItems.length > 1)
                        Text(
                          '${_activeItemIndex + 1} of ${_formItems.length}',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // 2. Party Name (Customer, Supplier, Delala)
                  if (!isStock) ...[
                    _buildFieldLabel(nameLabel, isDark),
                    const SizedBox(height: 6),
                    Autocomplete<String>(
                      initialValue: TextEditingValue(text: _titleController.text),
                      optionsBuilder: (textEditingValue) {
                        if (textEditingValue.text.isEmpty) {
                          return existingPartyNames;
                        }
                        return existingPartyNames.where((s) => s
                            .toLowerCase()
                            .contains(textEditingValue.text.toLowerCase()));
                      },
                      onSelected: (selection) {
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
                            hintText: nameHint,
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
                          onChanged: (val) {
                            _titleController.text = val;
                          },
                          validator: (v) =>
                              v == null || v.trim().isEmpty ? 'Please enter party name' : null,
                        );
                      },
                    ),
                    const SizedBox(height: 14),

                    // 3. Transaction Type Toggle: Debit (+) Goods vs Credit (-) Payment / Loan Return
                    _buildFieldLabel('Transaction Type (የመዝገብ አይነት)', isDark),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        // Debit (+) Goods / Delivery / Loan Button
                        Expanded(
                          child: InkWell(
                            onTap: () => setState(() => currentItem.sign = '+'),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              height: 44,
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              decoration: BoxDecoration(
                                color: isDebit
                                    ? const Color(0xFF2563EB).withValues(alpha: 0.12)
                                    : inputFill,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: isDebit ? const Color(0xFF2563EB) : inputBorder,
                                  width: isDebit ? 1.8 : 1.0,
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.add_shopping_cart,
                                    size: 16,
                                    color: isDebit ? const Color(0xFF2563EB) : Colors.grey,
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    'Debit (+) Goods / Loan\n(ዕቃ / ብድር)',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      fontWeight: isDebit ? FontWeight.w900 : FontWeight.w600,
                                      color: isDebit
                                          ? (isDark ? const Color(0xFF93C5FD) : const Color(0xFF2563EB))
                                          : Colors.grey,
                                      height: 1.15,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),

                        // Credit (-) Payment / Bank Transfer Button
                        Expanded(
                          child: InkWell(
                            onTap: () {
                              setState(() {
                                currentItem.sign = '-';
                                if (!_bankOptions.contains(currentItem.typeOrBank)) {
                                  currentItem.typeOrBank = 'CBE';
                                }
                              });
                            },
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              height: 44,
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              decoration: BoxDecoration(
                                color: !isDebit
                                    ? const Color(0xFFB45309).withValues(alpha: 0.12)
                                    : inputFill,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: !isDebit ? const Color(0xFFB45309) : inputBorder,
                                  width: !isDebit ? 1.8 : 1.0,
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.account_balance,
                                    size: 16,
                                    color: !isDebit ? const Color(0xFFB45309) : Colors.grey,
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    'Credit (-) Payment\n(ክፍያ / ባንክ)',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      fontWeight: !isDebit ? FontWeight.w900 : FontWeight.w600,
                                      color: !isDebit
                                          ? (isDark ? const Color(0xFFFDE68A) : const Color(0xFFB45309))
                                          : Colors.grey,
                                      height: 1.15,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                  ],

                  // 3B. Stock-only toggle: Stock In (+) / Stock Out (-)
                  if (isStock) ...[
                    _buildFieldLabel('Stock Movement (የዕቃ አቅርቦት አይነት)', isDark),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        // Stock In (+)
                        Expanded(
                          child: InkWell(
                            onTap: () => setState(() => currentItem.sign = '+'),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              height: 44,
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              decoration: BoxDecoration(
                                color: isDebit
                                    ? const Color(0xFF2563EB).withValues(alpha: 0.12)
                                    : inputFill,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: isDebit ? const Color(0xFF2563EB) : inputBorder,
                                  width: isDebit ? 1.8 : 1.0,
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.add_circle_outline,
                                    size: 16,
                                    color: isDebit ? const Color(0xFF2563EB) : Colors.grey,
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    'Stock In (+)\n(ማገዝ / መግቢያ)',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      fontWeight: isDebit ? FontWeight.w900 : FontWeight.w600,
                                      color: isDebit
                                          ? (isDark ? const Color(0xFF93C5FD) : const Color(0xFF2563EB))
                                          : Colors.grey,
                                      height: 1.15,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),

                        // Stock Out (-)
                        Expanded(
                          child: InkWell(
                            onTap: () => setState(() => currentItem.sign = '-'),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              height: 44,
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              decoration: BoxDecoration(
                                color: !isDebit
                                    ? const Color(0xFFBA1A1A).withValues(alpha: 0.12)
                                    : inputFill,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: !isDebit ? const Color(0xFFBA1A1A) : inputBorder,
                                  width: !isDebit ? 1.8 : 1.0,
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.remove_circle_outline,
                                    size: 16,
                                    color: !isDebit ? const Color(0xFFBA1A1A) : Colors.grey,
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    'Stock Out (-)\n(መቆጣጠር / መውጫ)',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      fontWeight: !isDebit ? FontWeight.w900 : FontWeight.w600,
                                      color: !isDebit
                                          ? (isDark ? const Color(0xFFFFB4AB) : const Color(0xFFBA1A1A))
                                          : Colors.grey,
                                      height: 1.15,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                  ],

                  // 4A. Inventory fields (Goods). Shown for all debit records AND all stock records
                  //     (stock-out keeps these fields so the shopkeeper records what left the store).
                  if (isDebit || isStock) ...[
                    // Item Field (Clean Single Label matching Stitch UI)
                    _buildFieldLabel('Item (የዕቃ ስም)', isDark),
                    const SizedBox(height: 6),
                    Autocomplete<String>(
                      initialValue: TextEditingValue(text: currentItem.nameController.text),
                      optionsBuilder: (textEditingValue) {
                        if (textEditingValue.text.isEmpty) {
                          return _stockSuggestions;
                        }
                        return _stockSuggestions.where((s) => s
                            .toLowerCase()
                            .contains(textEditingValue.text.toLowerCase()));
                      },
                      onSelected: (selection) {
                        currentItem.nameController.text = selection;
                        if (isStock) _titleController.text = selection;
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
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                          ),
                          onChanged: (val) {
                            currentItem.nameController.text = val;
                            if (isStock) _titleController.text = val;
                          },
                          validator: (v) =>
                              v == null || v.trim().isEmpty ? 'Please enter item name' : null,
                        );
                      },
                    ),
                    const SizedBox(height: 14),

                    // Quantity (Cartons / Units) + Unit Selector
                    _buildFieldLabel('Quantity & Packaging (ብዛት)', isDark),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(
                          flex: 6,
                          child: TextFormField(
                            controller: currentItem.cartonsController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                            decoration: InputDecoration(
                              hintText: '10',
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              filled: true,
                              fillColor: inputFill,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                            ),
                            onChanged: (val) {
                              final c = double.tryParse(val) ?? 0.0;
                              final p = double.tryParse(currentItem.pcsController.text) ?? 0.0;
                              if (c > 0 && p > 0) {
                                currentItem.qtyController.text = (c * p).toStringAsFixed(0);
                              } else {
                                currentItem.qtyController.text = val;
                              }
                              setState(() {});
                            },
                            validator: (v) => v == null || v.trim().isEmpty ? 'Enter qty' : null,
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
                                value: _packagingUnits.contains(currentItem.packagingUnit)
                                    ? currentItem.packagingUnit
                                    : 'Carton',
                                isExpanded: true,
                                icon: const Icon(Icons.keyboard_arrow_down, size: 20),
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.colorScheme.onSurface),
                                items: _packagingUnits.map((u) {
                                  return DropdownMenuItem(value: u, child: Text(u));
                                }).toList(),
                                onChanged: (val) {
                                  if (val != null) {
                                    setState(() => currentItem.packagingUnit = val);
                                  }
                                },
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),

                    // Custom packaging unit field if "Other"
                    if (currentItem.packagingUnit == 'Other') ...[
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _otherUnitController,
                        style: TextStyle(fontSize: 12.5, color: theme.colorScheme.onSurface),
                        decoration: InputDecoration(
                          labelText: 'Specify Custom Unit (e.g. Bundle, Kg, Pack)',
                          labelStyle: TextStyle(fontSize: 11, color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          filled: true,
                          fillColor: inputFill,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),

                    // Pieces per Carton (visible if Carton)
                    if (currentItem.packagingUnit == 'Carton') ...[
                      _buildFieldLabel('Pieces per Carton (በካርቶን ውስጥ ያለው ብዛት)', isDark),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: currentItem.pcsController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                        decoration: InputDecoration(
                          hintText: '100',
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          filled: true,
                          fillColor: inputFill,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                        ),
                        onChanged: (val) {
                          final p = double.tryParse(val) ?? 0.0;
                          final c = double.tryParse(currentItem.cartonsController.text) ?? 0.0;
                          if (c > 0 && p > 0) {
                            currentItem.qtyController.text = (c * p).toStringAsFixed(0);
                          }
                          setState(() {});
                        },
                      ),
                      const SizedBox(height: 14),
                    ],

                    // Unit Price (ETB)
                    _buildFieldLabel('Unit Price (ETB) (የአንዱ ዋጋ)', isDark),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: currentItem.priceController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                      decoration: InputDecoration(
                        hintText: '65',
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        filled: true,
                        fillColor: inputFill,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                      ),
                      onChanged: (_) => setState(() {}),
                      validator: (v) => v == null || v.trim().isEmpty ? 'Enter unit price' : null,
                    ),
                    const SizedBox(height: 14),

                    // Total Price (ETB) Auto-Computed
                    _buildFieldLabel('Total Price (ETB) (ጠቅላላ ድምር)', isDark),
                    const SizedBox(height: 6),
                    Container(
                      height: 46,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      alignment: Alignment.centerLeft,
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1)),
                      ),
                      child: Text(
                        calculatedTotal > 0
                            ? _currencyFormat.format(calculatedTotal)
                            : '65,000.00',
                        style: TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w900,
                          color: calculatedTotal > 0
                              ? (isDark ? const Color(0xFF93C5FD) : const Color(0xFF2563EB))
                              : (isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                  ] else ...[
                    // 4B. If Credit (-) Payment / Bank Transfer / Loan Repayment
                    _buildFieldLabel('Which Bank Transfer? (የተከፈለበት ባንክ)', isDark),
                    const SizedBox(height: 6),
                    Container(
                      height: 44,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF382D05) : const Color(0xFFFEF9C3), // Yellow highlight matching Image 1
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFB45309)),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _bankOptions.contains(currentItem.typeOrBank)
                              ? currentItem.typeOrBank
                              : 'CBE',
                          isExpanded: true,
                          icon: const Icon(Icons.keyboard_arrow_down, size: 20),
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: isDark ? const Color(0xFFFDE68A) : const Color(0xFFB45309),
                          ),
                          items: _bankOptions.map((b) {
                            return DropdownMenuItem(value: b, child: Text(b));
                          }).toList(),
                          onChanged: (val) {
                            if (val != null) setState(() => currentItem.typeOrBank = val);
                          },
                        ),
                      ),
                    ),

                    // Custom bank / channel name field if "Other" selected
                    if (currentItem.typeOrBank == 'Other') ...[
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: currentItem.bankCustomController,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onSurface,
                        ),
                        decoration: InputDecoration(
                          labelText: 'Specify Bank / Channel (e.g. Amole, POA, M-Pesa)',
                          labelStyle: TextStyle(
                            fontSize: 11,
                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                          ),
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          filled: true,
                          fillColor: inputFill,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),

                    // Payment Amount (ETB)
                    _buildFieldLabel('Payment Amount (ETB) (የተከፈለ ብር)', isDark),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: currentItem.priceController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w900,
                        color: isDark ? const Color(0xFFFDE68A) : const Color(0xFFB45309),
                      ),
                      decoration: InputDecoration(
                        hintText: '180,000.00',
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        filled: true,
                        fillColor: inputFill,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                      ),
                      onChanged: (_) => setState(() {}),
                      validator: (v) => v == null || v.trim().isEmpty ? 'Enter payment amount' : null,
                    ),
                    const SizedBox(height: 14),
                  ],

                  // 5. Date Field with Calendar Picker
                  _buildFieldLabel('Date (ቀን)', isDark),
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

                  // 6. Note (optional)
                  _buildFieldLabel('Note (optional) (ማስታወሻ)', isDark),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _notesController,
                    style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface),
                    decoration: InputDecoration(
                      hintText: 'From supplier, 28-Aug, or reference',
                      hintStyle: TextStyle(
                        fontSize: 12.5,
                        color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                      ),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      filled: true,
                      fillColor: inputFill,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: inputBorder)),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Optional Add Another Row (for Customer / Supplier / Delala)
                  if (!isStock) ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        if (_formItems.length > 1)
                          TextButton.icon(
                            onPressed: () => _removeItem(_activeItemIndex),
                            icon: const Icon(Icons.delete_outline, size: 16, color: Color(0xFFEF4444)),
                            label: const Text('Delete this item', style: TextStyle(color: Color(0xFFEF4444), fontSize: 12)),
                          )
                        else
                          const SizedBox(),
                        TextButton.icon(
                          onPressed: _addItem,
                          icon: const Icon(Icons.add, size: 16),
                          label: const Text('+ Add Another Row', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5)),
                          style: TextButton.styleFrom(foregroundColor: const Color(0xFF2563EB)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                  ],

                  // 7. Save Full-Width Action Button (matching Stitch Image 3)
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
}

class LineItemFormItem {
  final String id;
  late TextEditingController nameController;
  late TextEditingController qtyController;
  late TextEditingController priceController;
  late TextEditingController cartonsController;
  late TextEditingController pcsController;
  late TextEditingController customsController;
  late TextEditingController bankCustomController;
  String sign;
  String typeOrBank;
  String packagingUnit;
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
    this.packagingUnit = 'Carton',
    double? cartons,
    double? pcsPerCarton,
    this.customs,
    String customBankName = '',
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
    bankCustomController = TextEditingController(text: customBankName);
  }

  factory LineItemFormItem.fromLineItem(LineItem item) {
    final isCredit = item.sign == '-';
    final rawBank = isCredit
        ? (item.bank ?? item.paymentMethod ?? 'CBE')
        : (item.customType ?? 'Store');
    var typeOrBank = rawBank;
    var customBankName = '';
    // A saved bank name that isn't in the dropdown list (custom input or
    // legacy 'Other Bank') maps to the "Other" option with the name prefilled.
    if (isCredit && !_RecordFormDialogState._bankOptions.contains(rawBank)) {
      typeOrBank = 'Other';
      if (rawBank != 'Other Bank') customBankName = rawBank;
    }
    return LineItemFormItem(
      id: item.id,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      sign: item.sign,
      typeOrBank: typeOrBank,
      customBankName: customBankName,
      packagingUnit: item.packagingUnit ?? (item.cartons != null && item.cartons! > 0 ? 'Carton' : 'Pcs'),
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
    bankCustomController.dispose();
  }
}
