import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Centralized Language / Translator Service for Ethiopian Amharic (አማርኛ) and English.
class LanguageService {
  static final ValueNotifier<String> currentLanguage = ValueNotifier<String>('en');

  static bool get isAmharic => currentLanguage.value == 'am';

  /// Initialize language preference on startup
  static Future<void> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final lang = prefs.getString('app_language');
      if (lang != null && (lang == 'am' || lang == 'en')) {
        currentLanguage.value = lang;
      }
    } catch (e) {
      debugPrint('LanguageService init notice: $e');
    }
  }

  /// Change active language and persist to SharedPreferences
  static Future<void> setLanguage(String lang) async {
    if (lang != 'am' && lang != 'en') return;
    currentLanguage.value = lang;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('app_language', lang);
    } catch (e) {
      debugPrint('LanguageService persist error: $e');
    }
  }

  /// Dynamic translation helper
  static String tr(String en, String am) {
    return isAmharic ? am : en;
  }
}

