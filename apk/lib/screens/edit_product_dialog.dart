import 'package:flutter/material.dart';
import '../models/inventory_product.dart';
import '../services/api_service.dart';
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

  bool _isSaving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    _nameController = TextEditingController(text: p.productName);
    _unitPriceController = TextEditingController(text: p.unitPrice > 0 ? '${p.unitPrice}' : '');
    _costPriceController = TextEditingController(text: p.costPrice > 0 ? '${p.costPrice}' : '');
    _pcsPerCartonController = TextEditingController(text: '${p.pcsPerCarton.toInt()}');
    _minStockController = TextEditingController(text: '${p.minimumStock.toInt()}');
    _categoryController = TextEditingController(text: p.category);
    _supplierController = TextEditingController(text: p.supplierName ?? '');
    final cartons = p.quantityCartons > 0
        ? p.quantityCartons
        : (p.pcsPerCarton > 0 ? p.currentQuantity / p.pcsPerCarton : 0);
    _quantityCartonsController =
        TextEditingController(text: cartons.toStringAsFixed(cartons % 1 == 0 ? 0 : 3));
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
    _unitPriceController.removeListener(_onChanged);
    _pcsPerCartonController.removeListener(_onChanged);
    _quantityCartonsController.removeListener(_onChanged);
    _quantityCartonsController.dispose();
    super.dispose();
  }

  void _onChanged() => setState(() {});

  double get _cartons =>
      double.tryParse(_quantityCartonsController.text.trim()) ?? 0;

  double get _piecesPerCarton =>
      double.tryParse(_pcsPerCartonController.text.trim()) ?? 1;

  double get _totalQuantity => _cartons * _piecesPerCarton;

  double get _unitPrice =>
      double.tryParse(_unitPriceController.text.trim()) ?? 0;

  double get _totalValue => _totalQuantity * _unitPrice;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_cartons < 0 || _piecesPerCarton <= 0 || _unitPrice < 0) {
      setState(() => _errorMessage = widget.isAmharic
          ? 'መጠንና ዋጋ ትክክለኛ መሆን አለባቸው'
          : 'Quantities and prices must be valid and non-negative');
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
        unitPrice: double.tryParse(_unitPriceController.text.trim()),
        costPrice: double.tryParse(_costPriceController.text.trim()),
        pcsPerCarton: double.tryParse(_pcsPerCartonController.text.trim()),
        quantityCartons: double.tryParse(_quantityCartonsController.text.trim()),
        minimumStock: double.tryParse(_minStockController.text.trim()),
        category: _categoryController.text.trim(),
        supplierName: _supplierController.text.trim().isNotEmpty ? _supplierController.text.trim() : null,
        updatedBy: widget.currentUser?.id,
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
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.edit_outlined, size: 20, color: Color(0xFF2563EB)),
                          const SizedBox(width: 8),
                          Text(
                            widget.isAmharic ? 'የዕቃ መረጃ ማስተካከያ' : 'Edit Product Details',
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
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
                        style: const TextStyle(fontSize: 12, color: Color(0xFFB91C1C)),
                      ),
                    ),

                  TextFormField(
                    controller: _nameController,
                    decoration: InputDecoration(
                      labelText: widget.isAmharic ? 'የዕቃ ስም' : 'Product Name',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    ),
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) {
                        return widget.isAmharic ? 'የዕቃ ስም ያስፈልጋል' : 'Product name required';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),

                  TextFormField(
                    controller: _quantityCartonsController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(
                      labelText: widget.isAmharic ? 'የካርቶን ብዛት' : 'Quantity in Cartons',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    ),
                    validator: (v) {
                      final value = double.tryParse(v?.trim() ?? '');
                      if (value == null || value < 0) return widget.isAmharic ? 'አሉታዊ ሊሆን አይችልም' : 'Cannot be negative';
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),

                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _unitPriceController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic ? 'የመሸጫ ዋጋ' : 'Selling Price',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: _costPriceController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic ? 'የመግዣ ዋጋ' : 'Cost Price',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _pcsPerCartonController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic ? 'ፍሬ በካርቶን' : 'Pieces / Carton',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: _minStockController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            labelText: widget.isAmharic ? 'ዝቅተኛ ክምችት' : 'Minimum Stock',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFCBD5E1)),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              widget.isAmharic ? 'ጠቅላላ ብዛት' : 'Total Quantity',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                            ),
                            Text(
                              '${_totalQuantity.toStringAsFixed(_totalQuantity % 1 == 0 ? 0 : 3)} pcs',
                              style: const TextStyle(fontWeight: FontWeight.w900),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              widget.isAmharic ? 'ጠቅላላ ዋጋ' : 'Total Value',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                            ),
                            Text(
                              '${_totalValue.toStringAsFixed(2)} ETB',
                              style: const TextStyle(fontWeight: FontWeight.w900),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _supplierController,
                    decoration: InputDecoration(
                      labelText: widget.isAmharic ? 'አቅራቢ' : 'Supplier',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    ),
                  ),
                  const SizedBox(height: 20),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: _isSaving ? null : () => Navigator.pop(context),
                        child: Text(widget.isAmharic ? 'ይቅር' : 'Cancel'),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton.icon(
                        onPressed: _isSaving ? null : _submit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        icon: _isSaving
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.check, size: 16),
                        label: Text(
                          _isSaving
                              ? (widget.isAmharic ? 'በማስቀመጥ ላይ...' : 'Saving...')
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
