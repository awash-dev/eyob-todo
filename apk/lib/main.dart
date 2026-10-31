import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'models/user.dart';
import 'services/api_service.dart';
import 'screens/login_screen.dart';
import 'screens/main_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final storedUser = await ApiService.getStoredUser();
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
          seedColor: const Color(0xFF059669),
          primary: const Color(0xFF059669),
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
          selectedItemColor: Color(0xFF059669),
          unselectedItemColor: Color(0xFF64748B),
          elevation: 8,
        ),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF059669),
          primary: const Color(0xFF10B981),
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
          selectedItemColor: Color(0xFF10B981),
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
