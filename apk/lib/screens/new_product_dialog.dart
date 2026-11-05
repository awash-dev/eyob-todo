import 'package:flutter/material.dart';

import '../models/user.dart';
import '../services/api_service.dart';

class NewProductDialog extends StatefulWidget {
  final AppUser currentUser;
  final String? activeStoreId;
  final bool isAmharic;

  const NewProductDialog({
    super.key,
    required this.currentUser,
    this.activeStoreId,
    this.isAmharic = true,
  });

  @override
  State<NewProductDialog> createState() => _NewProductDialogState();
}

class _NewProductDialogState extends State<NewProductDialog> {
  final _formKey = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _unitPriceController = TextEditingController();
  final _pcsPerCartonController = TextEditingController(text: '1');
  final _openingCartonsController = TextEditingController(text: '0');
  final _minStockController = TextEditingController(text: '0');
  final _dateController = TextEditingController();

  bool _isSaving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _dateController.text = DateTime.now().toIso8601String().split('T')[0];

    _pcsPerCartonController.addListener(_onCalculationsChanged);
    _openingCartonsController.addListener(_onCalculationsChanged);
  }

  @override
  void dispose() {
    _pcsPerCartonController.removeListener(_onCalculationsChanged);
    _openingCartonsController.removeListener(_onCalculationsChanged);
    _nameController.dispose();
    _unitPriceController.dispose();
    _pcsPerCartonController.dispose();
    _openingCartonsController.dispose();
    _minStockController.dispose();
    _dateController.dispose();
    super.dispose();
  }

  void _onCalculationsChanged() {
    setState(() {});
  }

  double get _pcsPerCarton {
    final v = double.tryParse(_pcsPerCartonController.text.trim()) ?? 1.0;
    return v > 0 ? v : 1.0;
  }

  double get _openingCartons =>
      double.tryParse(_openingCartonsController.text.trim()) ?? 0.0;

  /// Total Pieces = Opening Cartons × Pieces per Carton
  int get _totalInitialPieces => (_openingCartons * _pcsPerCarton).round();

  double get _unitPrice =>
      double.tryParse(_unitPriceController.text.trim()) ?? 0.0;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final name = _nameController.text.trim();
    final targetStoreId = widget.currentUser.isStorekeeper
        ? (widget.currentUser.storeId ?? widget.activeStoreId)
        : (widget.activeStoreId == 'all' ? null : widget.activeStoreId);

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      // Duplicate check
      final exists = await ApiService.checkProductExists(name, targetStoreId);
      if (exists && mounted) {
        final proceed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(widget.isAmharic ? 'ተመሳሳይ ዕቃ አለ' : 'Duplicate Product'),
            content: Text(
              widget.isAmharic
                  ? '"$name" የሚል ዕቃ ቀድሞ በመደብሩ ተመዝግቧል። ቢሆንም አዲስ ሆኖ እንዲመዘገብ ይፈልጋሉ?'
                  : 'A product named "$name" already exists in this store. Do you still want to register it as a new product?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text(widget.isAmharic ? 'ይቅር' : 'Cancel'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text(widget.isAmharic ? 'ይቀጥሉ' : 'Confirm'),
              ),
            ],
          ),
        );

        if (proceed != true) {
          setState(() {
            _isSaving = false;
          });
          return;
        }
      }

      final product = await ApiService.registerProduct(
        productName: name,
        unitPrice: _unitPrice,
        pcsPerCarton: _pcsPerCarton,
        openingCartons: _openingCartons,
        openingLoosePieces: 0,
        minimumStock: double.tryParse(_minStockController.text.trim()) ?? 0.0,
        costPrice: _unitPrice,
        storeId: targetStoreId,
        createdBy: widget.currentUser.id,
        date: _dateController.text.trim(),
      );

      if (mounted) {
        Navigator.pop(context, product);
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
        constraints: const BoxConstraints(maxWidth: 460),
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Title
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.add_box_outlined,
                            size: 22,
                            color: Color(0xFF2563EB),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            widget.isAmharic ? 'አዲስ ምርት መመዝገቢያ' : 'New Product Registration',
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
                      margin: const EdgeInsets.only(bottom: 14),
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

                  // 1. Product Name (Text input, NOT dropdown)
                  TextFormField(
                    controller: _nameController,
                    decoration: InputDecoration(
                      labelText: widget.isAmharic ? 'የዕቃ ስም *' : 'Product Name *',
                      hintText: widget.isAmharic ? 'ምሳሌ፦ ወረቀት' : 'e.g. Paper',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    ),
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) {
                        return widget.isAmharic ? 'እባክዎ የምርቱን ስም ያስገቡ' : 'Please enter product name';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),

                  // 2. Pieces per Carton & Opening Cartons
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _pcsPerCartonController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic ? 'ፍሬ በካርቶን' : 'Pieces / Carton',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          ),
                          validator: (v) {
                            final n = double.tryParse(v?.trim() ?? '');
                            if (n == null || n <= 0) {
                              return widget.isAmharic
                                  ? '> 0 መሆን አለበት'
                                  : 'Must be > 0';
                            }
                            return null;
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: _openingCartonsController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic
                                ? 'የመጀመሪያ ካርቶን'
                                : 'Opening Cartons',
                            hintText: '0',
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
                  const SizedBox(height: 10),

                  // 3. Automatic Calculation Box (Opening Cartons × Pieces per Carton)
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
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              widget.isAmharic ? 'ጠቅላላ ፍሬ:' : 'Total Pieces:',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: isDark
                                    ? const Color(0xFF94A3B8)
                                    : const Color(0xFF64748B),
                              ),
                            ),
                            Text(
                              '$_totalInitialPieces ${widget.isAmharic ? "ፍሬ" : "Pieces"}',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w900,
                                color: theme.colorScheme.onSurface,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          widget.isAmharic
                              ? 'ቀመር፦ ${_openingCartons.toInt()} ካርቶን × ${_pcsPerCarton.toInt()} ፍሬ = $_totalInitialPieces ፍሬ'
                              : 'Formula: ${_openingCartons.toInt()} ctns × ${_pcsPerCarton.toInt()} pcs = $_totalInitialPieces pcs',
                          style: TextStyle(
                            fontSize: 10,
                            fontFamily: 'monospace',
                            color: isDark
                                ? const Color(0xFF94A3B8)
                                : const Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // 4. Unit Price & Minimum Stock
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _unitPriceController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic ? 'የአንዱ ዋጋ (ብር)' : 'Unit Price (ETB)',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          ),
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) {
                              return widget.isAmharic ? 'ዋጋ ያስፈልጋል' : 'Price required';
                            }
                            if (double.tryParse(v.trim()) == null) {
                              return widget.isAmharic ? 'ትክክለኛ ቁጥር ያስገቡ' : 'Invalid number';
                            }
                            return null;
                          },
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

                  // 5. Date
                  TextFormField(
                    controller: _dateController,
                    keyboardType: TextInputType.datetime,
                    decoration: InputDecoration(
                      labelText: widget.isAmharic ? 'ቀን' : 'Date',
                      hintText: 'YYYY-MM-DD',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 12,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Action Buttons
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: _isSaving
                            ? null
                            : () => Navigator.pop(context),
                        child: Text(
                          widget.isAmharic ? 'ይቅር' : 'Cancel',
                        ),
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
                              ? (widget.isAmharic ? 'በመመዝገብ ላይ...' : 'Saving...')
                              : (widget.isAmharic ? 'ምርት መዝግብ' : 'Register Product'),
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
      ),
    );
  }
}