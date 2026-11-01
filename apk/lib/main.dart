import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'models/user.dart';
import 'services/api_service.dart';
import 'screens/login_screen.dart';
import 'screens/main_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Protect against blank white screen: register custom error widget
  ErrorWidget.builder = (FlutterErrorDetails details) {
    return Material(
      color: Colors.white,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Color(0xFFBA1A1A), size: 48),
              const SizedBox(height: 14),
              const Text(
                'Application Display Error',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                details.exceptionAsString(),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
              ),
            ],
          ),
        ),
      ),
    );
  };

  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
    debugPrint('Flutter Error: ${details.exceptionAsString()}');
  };

  // Safe dotenv load
  try {
    await dotenv.load(fileName: ".env");
  } catch (e) {
    debugPrint("Notice: could not load .env asset: $e");
  }

  // Safe user session load
  AppUser? storedUser;
  try {
    storedUser = await ApiService.getStoredUser();
  } catch (e) {
    debugPrint("Notice: could not load stored user: $e");
  }

  runApp(MerkatoCreditApp(initialUser: storedUser));
}

class MerkatoCreditApp extends StatelessWidget {
  final AppUser? initialUser;

  const MerkatoCreditApp({super.key, this.initialUser});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Merkato Credit Record',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.system, // Accepts system bg color and text color
      builder: (context, child) {
        final isDark = Theme.of(context).brightness == Brightness.dark;
        SystemChrome.setSystemUIOverlayStyle(
          SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
            statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
            systemNavigationBarColor: isDark ? const Color(0xFF121212) : Colors.white,
            systemNavigationBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
          ),
        );
        return child ?? const SizedBox();
      },
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2563EB),
          primary: const Color(0xFF2563EB),
          surface: Colors.white,
          onSurface: const Color(0xFF0F172A),
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor:
            Colors.white, // Pure white background as requested
        dividerColor: const Color(0xFFE2E8F0),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          elevation: 0.5,
          scrolledUnderElevation: 0.5,
          centerTitle: false,
          systemOverlayStyle: SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.dark,
            statusBarBrightness: Brightness.light,
            systemNavigationBarColor: Colors.white,
            systemNavigationBarIconBrightness: Brightness.dark,
          ),
          iconTheme: IconThemeData(color: Color(0xFF0F172A)),
          titleTextStyle: TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: Colors.white,
          selectedItemColor: Color(0xFF2563EB),
          unselectedItemColor: Color(0xFF64748B),
          elevation: 8,
        ),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2563EB),
          primary: const Color(0xFF3B82F6),
          surface: const Color(0xFF1E1E1E),
          onSurface: const Color(0xFFF8FAFC),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF121212),
        dividerColor: const Color(0xFF27272A),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1E1E1E),
          elevation: 0.5,
          scrolledUnderElevation: 0.5,
          centerTitle: false,
          systemOverlayStyle: SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.light,
            statusBarBrightness: Brightness.dark,
            systemNavigationBarColor: Color(0xFF121212),
            systemNavigationBarIconBrightness: Brightness.light,
          ),
          iconTheme: IconThemeData(color: Color(0xFFF8FAFC)),
          titleTextStyle: TextStyle(
            color: Color(0xFFF8FAFC),
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: Color(0xFF1E1E1E),
          selectedItemColor: Color(0xFF3B82F6),
          unselectedItemColor: Color(0xFF94A3B8),
          elevation: 8,
        ),
      ),
      home: initialUser != null
          ? MainScreen(currentUser: initialUser!)
          : const LoginScreen(),
    );
  }
}
