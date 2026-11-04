import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Centralized Language / Translator Service for Ethiopian Amharic (አማርኛ) and English.
class LanguageService {
  static final ValueNotifier<String> currentLanguage = ValueNotifier<String>('en');

  static bool get isAmharic => currentLanguage.value == 'am';

  /// English to Amharic product dictionary
  static final Map<String, String> _enToAmProducts = {
    'paper': 'ወረቀት',
    'sugar': 'ስኳር',
    'oil': 'ዘይት',
    'cooking oil': 'የምግብ ዘይት',
    'rice': 'ሩዝ',
    'soap': 'ሳሙና',
    'pen': 'እስክሪብቶ',
    'pencil': 'እርሳስ',
    'notebook': 'ደብተር',
    'book': 'መጽሐፍ',
    'flour': 'ዱቄት',
    'wheat': 'ስንዴ',
    'milk': 'ወተት',
    'coffee': 'ቡና',
    'tea': 'ሻይ',
    'water': 'ውሃ',
    'salt': 'ጨው',
    'pasta': 'ፓስታ',
    'macaroni': 'መኮረኒ',
    'biscuit': 'ብስኩት',
    'matches': 'ክብሪት',
    'candle': 'ሻማ',
    'bag': 'ቦርሳ',
    'shoes': 'ጫማ',
    'shirt': 'ሸሚዝ',
    'trousers': 'ሱሪ',
    'fabric': 'ጨርቅ',
    'cloth': 'ጨርቅ',
    'blanket': 'ብርድ ልብስ',
    'sponge': 'ስፖንጅ',
    'detergent': 'ኦሞ',
    'battery': 'ባትሪ',
    'bulb': 'አምፑል',
    'tissue': 'ሶፍት',
    'box': 'ሳጥን',
  };

  /// Amharic to English product dictionary
  static final Map<String, String> _amToEnProducts = {
    'ወረቀት': 'Paper',
    'ስኳር': 'Sugar',
    'ዘይት': 'Oil',
    'የምግብ ዘይት': 'Cooking Oil',
    'ሩዝ': 'Rice',
    'ሳሙና': 'Soap',
    'እስክሪብቶ': 'Pen',
    'እርሳስ': 'Pencil',
    'ደብተር': 'Notebook',
    'መጽሐፍ': 'Book',
    'ዱቄት': 'Flour',
    'ስንዴ': 'Wheat',
    'ወተት': 'Milk',
    'ቡና': 'Coffee',
    'ሻይ': 'Tea',
    'ውሃ': 'Water',
    'ጨው': 'Salt',
    'ፓስታ': 'Pasta',
    'መኮረኒ': 'Macaroni',
    'ብስኩት': 'Biscuit',
    'ክብሪት': 'Matches',
    'ሻማ': 'Candle',
    'ቦርሳ': 'Bag',
    'ጫማ': 'Shoes',
    'ሸሚዝ': 'Shirt',
    'ሱሪ': 'Trousers',
    'ጨርቅ': 'Fabric',
    'ብርድ ልብስ': 'Blanket',
    'ስፖንጅ': 'Sponge',
    'ኦሞ': 'Detergent',
    'ባትሪ': 'Battery',
    'አምፑል': 'Bulb',
    'ሶፍት': 'Tissue',
    'ቲሹ': 'Tissue',
    'ሳጥን': 'Box',
  };

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

  /// Toggle language between English and Amharic
  static Future<void> toggleLanguage() async {
    await setLanguage(isAmharic ? 'en' : 'am');
  }

  /// Dynamic translation helper
  static String tr(String en, String am) {
    return isAmharic ? am : en;
  }

  /// Translate dynamic product name between Amharic and English while
  /// preserving original casing and untranslated names.
  static String translateProduct(String originalName) {
    final clean = originalName.trim();
    if (clean.isEmpty) return clean;

    if (isAmharic) {
      // Look up English -> Amharic
      final lower = clean.toLowerCase();
      if (_enToAmProducts.containsKey(lower)) {
        return _enToAmProducts[lower]!;
      }
      return clean;
    } else {
      // Look up Amharic -> English
      if (_amToEnProducts.containsKey(clean)) {
        return _amToEnProducts[clean]!;
      }
      return clean;
    }
  }
}
