import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../models/statement.dart';
import '../services/api_service.dart';

class StatementScreen extends StatefulWidget {
  final String accountName;
  final String accountType; // 'customer' | 'supplier'
  final String? shopId;

  const StatementScreen({
    super.key,
    required this.accountName,
    required this.accountType,
    this.shopId,
  });

  @override
  State<StatementScreen> createState() => _StatementScreenState();
}

class _StatementScreenState extends State<StatementScreen> {
  final _currencyFormat = NumberFormat('#,##0.00', 'en_US');
  AccountStatement? _statement;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadStatement();
  }

  Future<void> _loadStatement() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final st = await ApiService.getStatement(
        name: widget.accountName,
        type: widget.accountType,
        shopId: widget.shopId,
      );
      if (mounted) {
        setState(() {
          _statement = st;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _printOrExportPdf() async {
    if (_statement == null) return;
    final st = _statement!;

    final pdf = pw.Document();

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(28),
        build: (pw.Context context) {
          return [
            // Header
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      'MERKATO CREDIT RECORD',
                      style: pw.TextStyle(
                        fontSize: 18,
                        fontWeight: pw.FontWeight.bold,
                        color: PdfColors.blueGrey900,
                      ),
                    ),
                    pw.SizedBox(height: 3),
                    pw.Text(
                      '${st.shopName} - Account Statement',
                      style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700),
                    ),
                    pw.SizedBox(height: 2),
                    pw.Text(
                      'Account: ${st.accountName} (${st.accountType.toUpperCase()})',
                      style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold),
                    ),
                  ],
                ),
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    pw.Text(
                      'Generated: ${DateFormat('yyyy-MM-dd HH:mm').format(DateTime.now())}',
                      style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600),
                    ),
                    pw.SizedBox(height: 4),
                    pw.Container(
                      padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: pw.BoxDecoration(
                        color: PdfColors.grey200,
                        borderRadius: pw.BorderRadius.circular(4),
                      ),
                      child: pw.Text(
                        'Currency: ETB',
                        style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            pw.SizedBox(height: 16),
            pw.Divider(thickness: 1, color: PdfColors.grey400),
            pw.SizedBox(height: 8),

            // Excel-style Statement Table
            pw.TableHelper.fromTextArray(
              headers: ['Date', 'Item Description', 'Qty', 'Unit Price', 'Debit (+)', 'Credit (-)', 'Balance'],
              headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9, color: PdfColors.white),
              headerDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFF1E293B)),
              cellStyle: const pw.TextStyle(fontSize: 8.5),
              cellAlignment: pw.Alignment.centerLeft,
              cellAlignments: {
                0: pw.Alignment.centerLeft,
                1: pw.Alignment.centerLeft,
                2: pw.Alignment.centerRight,
                3: pw.Alignment.centerRight,
                4: pw.Alignment.centerRight,
                5: pw.Alignment.centerRight,
                6: pw.Alignment.centerRight,
              },
              data: st.entries.map((entry) {
                return [
                  entry.date,
                  entry.description + (entry.bank != null ? ' [${entry.bank}]' : ''),
                  entry.quantity > 0 ? entry.quantity.toStringAsFixed(0) : '-',
                  entry.unitPrice > 0 ? _currencyFormat.format(entry.unitPrice) : '-',
                  entry.debit > 0 ? _currencyFormat.format(entry.debit) : '-',
                  entry.credit > 0 ? _currencyFormat.format(entry.credit) : '-',
                  _currencyFormat.format(entry.balance),
                ];
              }).toList(),
            ),
            pw.SizedBox(height: 12),

            // Statement Totals matching Excel reference
            pw.Container(
              padding: const pw.EdgeInsets.all(10),
              decoration: pw.BoxDecoration(
                border: pw.Border.all(color: PdfColors.grey400),
                borderRadius: pw.BorderRadius.circular(4),
                color: PdfColors.grey100,
              ),
              child: pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text(
                    'TOTALS (${st.entries.length} entries)',
                    style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10),
                  ),
                  pw.Row(
                    children: [
                      pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.end,
                        children: [
                          pw.Text('Total Debit: ETB ${_currencyFormat.format(st.totals.totalDebit)}',
                              style: const pw.TextStyle(fontSize: 9)),
                          pw.Text('Total Credit: ETB ${_currencyFormat.format(st.totals.totalCredit)}',
                              style: const pw.TextStyle(fontSize: 9)),
                        ],
                      ),
                      pw.SizedBox(width: 18),
                      pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.end,
                        children: [
                          pw.Text('OUTSTANDING BALANCE',
                              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
                          pw.Text(
                            'ETB ${_currencyFormat.format(st.totals.outstanding)}',
                            style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: PdfColors.red900),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ];
        },
      ),
    );

    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => pdf.save(),
      name: 'statement-${st.accountName.replaceAll(' ', '_')}.pdf',
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
          statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
        ),
        title: Text(
          widget.accountName,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
            color: theme.colorScheme.onSurface,
          ),
        ),
        backgroundColor: theme.appBarTheme.backgroundColor ?? theme.colorScheme.surface,
        elevation: 0.5,
        foregroundColor: theme.colorScheme.onSurface,
        actions: [
          if (_statement != null)
            IconButton(
              icon: const Icon(Icons.print_outlined),
              tooltip: 'Print Statement',
              onPressed: _printOrExportPdf,
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
              : _statement == null || _statement!.entries.isEmpty
                  ? const Center(child: Text('No transaction records found for this account.'))
                  : _buildStatementContent(_statement!),
    );
  }

  Widget _buildStatementContent(AccountStatement st) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isCustomer = st.accountType == 'customer';
    final isDelala = st.accountType == 'delala';
    final isStock = st.accountType == 'stock';

    final String typeTitle = isStock
        ? 'Store Inventory'
        : isCustomer
            ? 'Customer Credit'
            : isDelala
                ? 'Delala (Broker)'
                : 'Supplier Credit';

    final formulaText = isStock
        ? 'Store On Hand = Stock In (+) - Stock Out (-)'
        : isCustomer
            ? 'Customer Balance = Total Debit - Total Credit'
            : isDelala
                ? 'Delala Balance = Commission Earned - Paid'
                : 'Supplier Balance = Total Credit - Total Debit';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(10.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Account Summary Card
          Container(
            padding: const EdgeInsets.all(12.0),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: theme.dividerColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        st.accountName,
                        style: TextStyle(
                          fontSize: 16.5,
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.onSurface,
                          height: 1.25,
                        ),
                        softWrap: true,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: isCustomer
                            ? (isDark ? const Color(0xFF1E1B4B) : const Color(0xFFEEF2FF))
                            : (isDark ? const Color(0xFF1E3A8A) : const Color(0xFFEFF6FF)),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: isCustomer
                              ? (isDark ? const Color(0xFF4F46E5) : const Color(0xFFC7D2FE))
                              : (isDark ? const Color(0xFF2563EB) : const Color(0xFFBFDBFE)),
                        ),
                      ),
                      child: Text(
                        typeTitle,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: isCustomer
                              ? (isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5))
                              : (isDark ? const Color(0xFF93C5FD) : const Color(0xFF2563EB)),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Shop: ${st.shopName}',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                      ),
                    ),
                    Text(
                      '${st.entries.length} transactions',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  formulaText,
                  style: TextStyle(
                    fontSize: 10,
                    fontStyle: FontStyle.italic,
                    color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // Authentic Excel Ledger Table (Zero Horizontal Scrolling, Authentic Gridlines)
          _buildMobileExcelTable(st),
          const SizedBox(height: 12),

          // Excel Totals Footer Card
          _buildExcelTotalsCard(st),
        ],
      ),
    );
  }

  /// Authentic Excel Table perfectly fitted to small mobile screens with real spreadsheet gridlines
  Widget _buildMobileExcelTable(AccountStatement st) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final gridColor = isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1);
    final isStock = st.accountType == 'stock';

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: gridColor, width: 1.2),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Excel Header Row (Classic Spreadsheet Header)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 7),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                border: Border(bottom: BorderSide(color: gridColor, width: 1.2)),
              ),
              child: Row(
                children: [
                  Expanded(
                    flex: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                      ),
                      child: Text(
                        'Date',
                        style: TextStyle(
                          color: isDark ? Colors.white : const Color(0xFF1E293B),
                          fontSize: 10.5,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 13,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      decoration: BoxDecoration(
                        border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                      ),
                      child: Text(
                        'Item / Description',
                        style: TextStyle(
                          color: isDark ? Colors.white : const Color(0xFF1E293B),
                          fontSize: 10.5,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                      ),
                      child: Text(
                        isStock ? 'Stock In (+)' : 'Debit (+)',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          color: isDark ? Colors.white : const Color(0xFF1E293B),
                          fontSize: 10.5,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                      ),
                      child: Text(
                        isStock ? 'Stock Out (-)' : 'Credit (-)',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          color: isDark ? const Color(0xFFFEF08A) : const Color(0xFF854D0E),
                          fontSize: 10.5,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Text(
                        isStock ? 'On Hand' : 'Balance',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          color: isDark ? Colors.white : const Color(0xFF1E293B),
                          fontSize: 10.5,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Excel Data Rows with Gridlines
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: st.entries.length,
              separatorBuilder: (_, _) => Divider(
                height: 1,
                thickness: 0.8,
                color: gridColor,
              ),
              itemBuilder: (context, index) {
                final entry = st.entries[index];
                final isPayment = entry.credit > 0;
                final isEven = index % 2 == 0;

                final rowBg = isPayment
                    ? (isDark ? const Color(0xFF3B2A06) : const Color(0xFFFEFCE8)) // Light yellow highlight for payment
                    : (isEven
                        ? (isDark ? const Color(0xFF1E1E1E) : Colors.white)
                        : (isDark ? const Color(0xFF18181B) : const Color(0xFFF8FAFC)));

                return Container(
                  color: rowBg,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Col 1: Date
                      Expanded(
                        flex: 6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
                          decoration: BoxDecoration(
                            border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                          ),
                          child: Text(
                            entry.date,
                            style: TextStyle(
                              fontSize: 9.5,
                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
                              fontWeight: FontWeight.w600,
                              letterSpacing: -0.2,
                            ),
                            maxLines: 1,
                            softWrap: false,
                          ),
                        ),
                      ),

                      // Col 2: Description & Qty/Price (NO TRUNCATION!)
                      Expanded(
                        flex: 13,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 7),
                          decoration: BoxDecoration(
                            border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                entry.description,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isPayment
                                      ? (isDark ? const Color(0xFFFDE047) : const Color(0xFF854D0E))
                                      : theme.colorScheme.onSurface,
                                  height: 1.25,
                                ),
                                softWrap: true, // FULL NAME ALWAYS VISIBLE
                              ),
                              if (entry.quantity > 0 && entry.unitPrice > 0)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(
                                    '${entry.quantity.toStringAsFixed(0)} pcs @ ${_currencyFormat.format(entry.unitPrice)}',
                                    style: TextStyle(
                                      fontSize: 9.5,
                                      color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                    ),
                                  ),
                                )
                              else if (entry.bank != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(
                                    '[${entry.bank}]',
                                    style: TextStyle(
                                      fontSize: 9.5,
                                      fontWeight: FontWeight.bold,
                                      color: isDark ? const Color(0xFFFDE047) : const Color(0xFF854D0E),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),

                      // Col 3: Debit
                      Expanded(
                        flex: 6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
                          decoration: BoxDecoration(
                            border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                          ),
                          alignment: Alignment.centerRight,
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerRight,
                            child: Text(
                              entry.debit > 0 ? _currencyFormat.format(entry.debit) : '-',
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: entry.debit > 0
                                    ? theme.colorScheme.onSurface
                                    : (isDark ? Colors.grey.shade700 : Colors.grey.shade400),
                              ),
                            ),
                          ),
                        ),
                      ),

                      // Col 4: Credit (Payment highlighted in yellow)
                      Expanded(
                        flex: 6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
                          decoration: BoxDecoration(
                            border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                          ),
                          alignment: Alignment.centerRight,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1.5),
                            decoration: BoxDecoration(
                              color: entry.credit > 0
                                  ? (isDark ? const Color(0xFF854D0E).withValues(alpha: 0.4) : const Color(0xFFFEF08A))
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(3),
                            ),
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerRight,
                              child: Text(
                                entry.credit > 0 ? _currencyFormat.format(entry.credit) : '-',
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w900,
                                  color: entry.credit > 0
                                      ? (isDark ? const Color(0xFFFEF08A) : const Color(0xFF713F12))
                                      : (isDark ? Colors.grey.shade700 : Colors.grey.shade400),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),

                      // Col 5: Balance
                      Expanded(
                        flex: 6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
                          alignment: Alignment.centerRight,
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerRight,
                            child: Text(
                              _currencyFormat.format(entry.balance),
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: entry.balance >= 0
                                    ? (isDark ? const Color(0xFF60A5FA) : const Color(0xFF2563EB))
                                    : (isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626)),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),

            // Excel Bottom Total Row (Authentic Spreadsheet Total with Double-Border)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                border: Border(
                  top: BorderSide(color: gridColor, width: 1.5),
                  bottom: BorderSide(color: isDark ? const Color(0xFF475569) : Colors.grey.shade700, width: 2.2),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    flex: 19, // 6 + 13
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      decoration: BoxDecoration(
                        border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                      ),
                      child: Text(
                        'TOTAL (ETB)',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 11,
                          color: theme.colorScheme.onSurface,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                      ),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerRight,
                        child: Text(
                          _currencyFormat.format(st.totals.totalDebit),
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 11),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        border: Border(right: BorderSide(color: gridColor, width: 0.8)),
                      ),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerRight,
                        child: Text(
                          _currencyFormat.format(st.totals.totalCredit),
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 11,
                            color: isDark ? const Color(0xFFFEF08A) : const Color(0xFF854D0E),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerRight,
                        child: Text(
                          _currencyFormat.format(st.totals.outstanding),
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 11.5,
                            color: st.totals.outstanding >= 0
                                ? (isDark ? const Color(0xFF60A5FA) : const Color(0xFF2563EB))
                                : (isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626)),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Totals Card matching the Excel reference photo
  Widget _buildExcelTotalsCard(AccountStatement st) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isStock = st.accountType == 'stock';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                isStock ? 'Total Stock In:' : 'Total Debit:',
                style: TextStyle(fontSize: 11, color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
              ),
              Text(
                'ETB ${_currencyFormat.format(st.totals.totalDebit)}',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                isStock ? 'Total Stock Out:' : 'Total Credit (Payments):',
                style: TextStyle(fontSize: 11, color: isDark ? const Color(0xFFFDE047) : const Color(0xFF854D0E)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF08A),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  'ETB ${_currencyFormat.format(st.totals.totalCredit)}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF713F12)),
                ),
              ),
            ],
          ),
          Divider(height: 16, thickness: 1, color: theme.dividerColor),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                isStock ? 'INVENTORY ON HAND VALUE:' : 'OUTSTANDING BALANCE:',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
              ),
              Text(
                'ETB ${_currencyFormat.format(st.totals.outstanding)}',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  color: st.totals.outstanding >= 0
                      ? (isDark ? const Color(0xFF60A5FA) : const Color(0xFF2563EB))
                      : (isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
