import 'package:flutter_test/flutter_test.dart';
import 'package:apk/main.dart';

void main() {
  testWidgets('App loads smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const MerkatoCreditApp());
    expect(find.text('Merkato Credit Record'), findsWidgets);
  });
}
