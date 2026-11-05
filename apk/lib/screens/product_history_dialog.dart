import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/inventory_product.dart';
import '../models/stock_movement.dart';
import '../services/api_service.dart';

class ProductHistoryDialog extends StatefulWidget {
  final InventoryProduct product;
  final bool isAmharic;

  const ProductHistoryDialog({
    super.key,
    required this.product,
    this.isAmharic = true,
  });

  @override
  State<ProductHistoryDialog> createState() => _ProductHistoryDialogState();
}

class _ProductHistoryDialogState extends State<ProductHistoryDialog> {
  bool _isLoading = true;
  String? _errorMessage;
  List<StockMovement> _movements = [];

  final _currencyFormat = NumberFormat('#,##0.00', 'en_US');

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final list = await ApiService.getProductStockMovements(widget.product.id);
      if (mounted) {
        setState(() {
          _movements = list;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString().replaceAll('Exception:', '').trim();
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final borderColor = isDark ? const Color(0xFF2E384D) : const Color(0xFFCBD5E1);

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 550, maxHeight: 600),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.product.productName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${widget.isAmharic ? "የዕቃ እንቅስቃሴ" : "Stock History"} · ${widget.product.cartons} ${widget.isAmharic ? "ካርቶን" : "ctns"} (${widget.product.totalPieces.toInt()} ${widget.isAmharic ? "ፍሬ" : "pcs"})',
                          style: TextStyle(
                            fontSize: 11,
                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),

            // Content
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _errorMessage != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(_errorMessage!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFB91C1C))),
                                const SizedBox(height: 10),
                                ElevatedButton(
                                  onPressed: _loadHistory,
                                  child: Text(widget.isAmharic ? 'እንደገና ሞክር' : 'Retry'),
                                ),
                              ],
                            ),
                          ),
                        )
                      : _movements.isEmpty
                          ? Center(
                              child: Text(
                                widget.isAmharic ? 'ምንም የእንቅስቃሴ መዝገብ የለም' : 'No stock movements recorded yet',
                                style: TextStyle(
                                  color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                ),
                              ),
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.all(12),
                              itemCount: _movements.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 8),
                              itemBuilder: (context, index) {
                                final m = _movements[index];
                                final isOut = m.isOut;

                                return Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: isDark ? const Color(0xFF1E2638) : Colors.white,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: borderColor),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      // Row 1: Type + Date + User
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            isOut
                                                ? (widget.isAmharic ? 'ወጪ (-)' : 'Stock Out (-)')
                                                : (widget.isAmharic ? 'ገቢ (+)' : 'Stock In (+)'),
                                            style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                          Text(
                                            m.transactionDate,
                                            style: TextStyle(
                                              fontSize: 11,
                                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 6),

                                      // Row 2: Quantity breakdown (Cartons, Loose, Total Pieces)
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            '${isOut ? "-" : "+"}${m.cartons} ctns · ${m.loosePieces} loose (${m.quantity.toInt()} pcs)',
                                            style: TextStyle(
                                              fontSize: 12.5,
                                              fontWeight: FontWeight.w800,
                                              color: theme.colorScheme.onSurface,
                                            ),
                                          ),
                                          Text(
                                            'ETB ${_currencyFormat.format(m.unitPrice)}/pc',
                                            style: TextStyle(
                                              fontSize: 11.5,
                                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),

                                      // Row 3: Balance transition & party
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            'Balance: ${m.previousStock.toInt()} → ${m.newStock.toInt()} pcs',
                                            style: TextStyle(
                                              fontSize: 11,
                                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                            ),
                                          ),
                                          if (m.userName != null && m.userName!.isNotEmpty)
                                            Text(
                                              'By: ${m.userName}',
                                              style: TextStyle(
                                                fontSize: 10.5,
                                                color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                              ),
                                            ),
                                        ],
                                      ),

                                      if ((m.destination != null && m.destination!.isNotEmpty) ||
                                          (m.sourceId != null && m.sourceId!.isNotEmpty) ||
                                          (m.note != null && m.note!.isNotEmpty))
                                        Padding(
                                          padding: const EdgeInsets.only(top: 4),
                                          child: Text(
                                            m.destination != null && m.destination!.isNotEmpty
                                                ? 'To: ${m.destination}'
                                                : m.sourceId != null && m.sourceId!.isNotEmpty
                                                    ? 'From: ${m.sourceId}'
                                                    : 'Note: ${m.note}',
                                            style: TextStyle(
                                              fontSize: 10.5,
                                              fontStyle: FontStyle.italic,
                                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                );
                              },
                            ),
            ),
          ],
        ),
      ),
    );
  }
}

