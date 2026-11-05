import 'package:flutter/material.dart';

import '../models/inventory_product.dart';
import '../services/api_service.dart';
import '../services/ethiopian_calendar.dart';
import '../models/user.dart';

class EditProductDialog extends StatefulWidget {
  final InventoryProduct product;
  final AppUser? currentUser;
  final bool isAmharic;

  const EditProductDialog({
    super.key,
    required this.product,
    this.currentUser,
    this.isAmharic = true,
  });

  @override
  State<EditProductDialog> createState() => _EditProductDialogState();
}

class _EditProductDialogState extends State<EditProductDialog> {
  final _formKey = GlobalKey<FormState>();

  late TextEditingController _nameController;
  late TextEditingController _unitPriceController;
  late TextEditingController _costPriceController;
  late TextEditingController _pcsPerCartonController;
  late TextEditingController _minStockController;
  late TextEditingController _categoryController;
  late TextEditingController _supplierController;
  late TextEditingController _quantityCartonsController;
  late TextEditingController _unitController;
  late TextEditingController _dateController;

  late bool _isActive;
  DateTime _selectedDate = DateTime.now();
  String _calendarMode = 'gregorian';

  bool _isSaving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    _nameController = TextEditingController(text: p.productName);
    _unitPriceController = TextEditingController(
      text: p.unitPrice > 0 ? '${p.unitPrice}' : '',
    );
    _costPriceController = TextEditingController(
      text: p.costPrice > 0 ? '${p.costPrice}' : '',
    );
    _pcsPerCartonController = TextEditingController(
      text: '${p.pcsPerCarton > 0 ? p.pcsPerCarton.toInt() : 1}',
    );
    _minStockController = TextEditingController(
      text: '${p.minimumStock.toInt()}',
    );
    _categoryController = TextEditingController(text: p.category);
    _supplierController = TextEditingController(text: p.supplierName ?? '');
    _unitController = TextEditingController(
      text: p.unit.isNotEmpty ? p.unit : 'PCS',
    );

    final cartons = p.quantityCartons > 0
        ? p.quantityCartons
        : (p.pcsPerCarton > 0 ? p.currentQuantity / p.pcsPerCarton : 0);
    _quantityCartonsController = TextEditingController(
      text: cartons.toStringAsFixed(cartons % 1 == 0 ? 0 : 3),
    );

    _isActive = p.isActive;

    final initialDateStr = p.lastTransactionDate ??
        DateTime.now().toIso8601String().split('T')[0];
    _dateController = TextEditingController(text: initialDateStr);
    try {
      _selectedDate = DateTime.parse(initialDateStr);
    } catch (_) {
      _selectedDate = DateTime.now();
    }

    _unitPriceController.addListener(_onChanged);
    _pcsPerCartonController.addListener(_onChanged);
    _quantityCartonsController.addListener(_onChanged);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _unitPriceController.dispose();
    _costPriceController.dispose();
    _pcsPerCartonController.dispose();
    _minStockController.dispose();
    _categoryController.dispose();
    _supplierController.dispose();
    _quantityCartonsController.dispose();
    _unitController.dispose();
    _dateController.dispose();

    _unitPriceController.removeListener(_onChanged);
    _pcsPerCartonController.removeListener(_onChanged);
    _quantityCartonsController.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() => setState(() {});

  double get _cartons =>
      double.tryParse(_quantityCartonsController.text.trim()) ?? 0;

  double get _piecesPerCarton {
    final v = double.tryParse(_pcsPerCartonController.text.trim()) ?? 1;
    return v > 0 ? v : 1;
  }

  double get _totalQuantity => _cartons * _piecesPerCarton;

  double get _unitPrice =>
      double.tryParse(_unitPriceController.text.trim()) ?? 0;

  double get _totalValue => _totalQuantity * _unitPrice;

  String get _displayDate {
    if (_calendarMode == 'gregorian') {
      return _dateController.text;
    }
    final eth = EthiopianCalendar.toEthiopian(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
    );
    return EthiopianCalendar.formatDisplay(
      eth,
      lang: widget.isAmharic ? 'am' : 'en',
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        _selectedDate = picked;
        _dateController.text =
            '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_cartons < 0 || _piecesPerCarton <= 0 || _unitPrice < 0) {
      setState(
        () => _errorMessage = widget.isAmharic
            ? 'መጠንና ዋጋ ትክክለኛና ከአሉታዊ በላይ መሆን አለባቸው'
            : 'Quantities and prices must be valid and non-negative',
      );
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final updated = await ApiService.updateInventoryProduct(
        id: widget.product.id,
        productName: _nameController.text.trim(),
        unitPrice: _unitPrice,
        costPrice: double.tryParse(_costPriceController.text.trim()),
        pcsPerCarton: _piecesPerCarton,
        quantityCartons: _cartons,
        minimumStock: double.tryParse(_minStockController.text.trim()),
        category: _categoryController.text.trim(),
        supplierName: _supplierController.text.trim().isNotEmpty
            ? _supplierController.text.trim()
            : null,
        updatedBy: widget.currentUser?.id,
        isActive: _isActive,
      );

      if (mounted) {
        Navigator.pop(context, updated);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isSaving = false;
          _errorMessage = e.toString().replaceAll('Exception:', '').trim();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final borderColor = isDark
        ? const Color(0xFF2E384D)
        : const Color(0xFFCBD5E1);

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 480),
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Dialog Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.edit_outlined,
                            size: 20,
                            color: Color(0xFF2563EB),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            widget.isAmharic
                                ? 'የዕቃ መረጃ ማስተካከያ'
                                : 'Edit Product Details',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 20),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  if (_errorMessage != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFFECACA)),
                      ),
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFFB91C1C),
                        ),
                      ),
                    ),

                  // 1. Product Name (Required)
                  TextFormField(
                    controller: _nameController,
                    decoration: InputDecoration(
                      labelText: widget.isAmharic ? 'የዕቃ ስም *' : 'Product Name *',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 12,
                      ),
                    ),
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) {
                        return widget.isAmharic
                            ? 'የዕቃ ስም ያስፈልጋል'
                            : 'Product name required';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),

                  // 2. Quantity in Cartons & Pieces per Carton
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _quantityCartonsController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic
                                ? 'የካርቶን ብዛት *'
                                : 'Cartons *',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                          ),
                          validator: (v) {
                            final value = double.tryParse(v?.trim() ?? '');
                            if (value == null || value < 0) {
                              return widget.isAmharic
                                  ? 'አሉታዊ ሊሆን አይችልም'
                                  : 'Cannot be negative';
                            }
                            return null;
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: _pcsPerCartonController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic
                                ? 'ፍሬ በካርቶን *'
                                : 'Pieces/Carton *',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                          ),
                          validator: (v) {
                            final value = double.tryParse(v?.trim() ?? '');
                            if (value == null || value <= 0) {
                              return widget.isAmharic
                                  ? '> 0 መሆን አለበት'
                                  : 'Must be > 0';
                            }
                            return null;
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // 3. Selling Price (Price per piece) & Cost Price
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _unitPriceController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic
                                ? 'የአንዱ ዋጋ (መሸጫ) *'
                                : 'Price / Piece *',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                          ),
                          validator: (v) {
                            final value = double.tryParse(v?.trim() ?? '');
                            if (value == null || value < 0) {
                              return widget.isAmharic
                                  ? 'ዋጋ ያስፈልጋል'
                                  : 'Valid price required';
                            }
                            return null;
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: _costPriceController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic
                                ? 'የመግዣ ዋጋ'
                                : 'Cost Price',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // 4. Live Automatic Calculations Box
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: isDark
                          ? const Color(0xFF1E2638)
                          : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: borderColor),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              widget.isAmharic ? 'ጠቅላላ ፍሬ / ብዛት:' : 'Total Quantity:',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                            Text(
                              '${_totalQuantity.toStringAsFixed(_totalQuantity % 1 == 0 ? 0 : 3)} ${_unitController.text.trim().isNotEmpty ? _unitController.text.trim() : "PCS"}',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 13.5,
                                color: theme.colorScheme.onSurface,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              widget.isAmharic ? 'ጠቅላላ የክምችት ዋጋ:' : 'Total Stock Value:',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                            Text(
                              '${_totalValue.toStringAsFixed(2)} ETB',
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 14,
                                color: Color(0xFF2563EB),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // 5. Ethiopian & Gregorian Calendar Date Selector
                  SegmentedButton<String>(
                    segments: [
                      ButtonSegment(
                        value: 'gregorian',
                        label: Text(widget.isAmharic ? 'ግሪጎሪያን' : 'Gregorian'),
                      ),
                      ButtonSegment(
                        value: 'ethiopian',
                        label: Text(widget.isAmharic ? 'ኢትዮጵያዊ' : 'Ethiopian'),
                      ),
                    ],
                    selected: {_calendarMode},
                    onSelectionChanged: (values) {
                      setState(() => _calendarMode = values.first);
                    },
                  ),
                  const SizedBox(height: 8),
                  InkWell(
                    onTap: _pickDate,
                    borderRadius: BorderRadius.circular(8),
                    child: InputDecorator(
                      decoration: InputDecoration(
                        labelText: widget.isAmharic ? 'ቀን' : 'Date',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 12,
                        ),
                      ),
                      child: Text(
                        _displayDate,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // 6. Unit & Minimum Stock
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _unitController,
                          decoration: InputDecoration(
                            labelText: widget.isAmharic ? 'መለኪያ' : 'Unit',
                            hintText: 'PCS',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: _minStockController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic
                                ? 'ዝቅተኛ ክምችት'
                                : 'Minimum Stock',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // 7. Category & Supplier
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _categoryController,
                          decoration: InputDecoration(
                            labelText: widget.isAmharic ? 'ምድብ' : 'Category',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: _supplierController,
                          decoration: InputDecoration(
                            labelText: widget.isAmharic ? 'አቅራቢ' : 'Supplier',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // 8. Active Status Switch
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      widget.isAmharic ? 'የዕቃው ሁኔታ (ንቁ)' : 'Product Status (Active)',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                    subtitle: Text(
                      _isActive
                          ? (widget.isAmharic ? 'ዕቃው በክምችት ዝርዝር ውስጥ ንቁ ነው' : 'Product is active and visible')
                          : (widget.isAmharic ? 'ዕቃው ለጊዜው እንቅስቃሴው ቆሟል' : 'Product is deactivated'),
                      style: const TextStyle(fontSize: 11),
                    ),
                    value: _isActive,
                    activeThumbColor: const Color(0xFF2563EB),
                    onChanged: (val) => setState(() => _isActive = val),
                  ),
                  const SizedBox(height: 16),

                  // 9. Action Buttons
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: _isSaving
                            ? null
                            : () => Navigator.pop(context),
                        child: Text(widget.isAmharic ? 'ይቅር' : 'Cancel'),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton.icon(
                        onPressed: _isSaving ? null : _submit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 10,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        icon: _isSaving
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.check, size: 16),
                        label: Text(
                          _isSaving
                              ? (widget.isAmharic
                                    ? 'በማስቀመጥ ላይ...'
                                    : 'Saving...')
                              : (widget.isAmharic ? 'አስቀምጥ' : 'Save Changes'),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
