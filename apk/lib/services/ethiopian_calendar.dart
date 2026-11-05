// Ethiopian Calendar & Gregorian Date Converter for Flutter / Dart
// Matches src/lib/ethiopianCalendar.ts algorithm exactly.

class EthiopianDate {
  final int year;
  final int month;
  final int day;

  const EthiopianDate({
    required this.year,
    required this.month,
    required this.day,
  });

  @override
  String toString() {
    final y = year.toString().padLeft(4, '0');
    final m = month.toString().padLeft(2, '0');
    final d = day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }
}

class GregorianDate {
  final int year;
  final int month;
  final int day;

  const GregorianDate({
    required this.year,
    required this.month,
    required this.day,
  });

  @override
  String toString() {
    final y = year.toString().padLeft(4, '0');
    final m = month.toString().padLeft(2, '0');
    final d = day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }
}

class EthiopianCalendar {
  static const List<String> monthsAm = [
    '',
    'መስከረም',
    'ጥቅምት',
    'ኅዳር',
    'ታኅሣሥ',
    'ጥር',
    'የካቲት',
    'መጋቢት',
    'ሚያዝያ',
    'ግንቦት',
    'ሰኔ',
    'ሐምሌ',
    'ነሐሴ',
    'ጳጉሜን',
  ];

  static const List<String> monthsEn = [
    '',
    'Meskerem',
    'Tikimt',
    'Hidar',
    'Tahsas',
    'Tir',
    'Yakatit',
    'Megabit',
    'Miazia',
    'Ginbot',
    'Sene',
    'Hamle',
    'Nehase',
    'Pagume',
  ];

  static const int anchorEthYear = 2017;
  static const int anchorUnixDay = 19977;

  static bool isLeapYear(int year) {
    return ((year % 4) + 4) % 4 == 3;
  }

  static int getDaysInMonth(int year, int month) {
    if (month < 1 || month > 13) return 30;
    if (month == 13) {
      return isLeapYear(year) ? 6 : 5;
    }
    return 30;
  }

  static int _ethiopianNewYearUnixDay(int ethYear) {
    if (ethYear == anchorEthYear) return anchorUnixDay;

    if (ethYear > anchorEthYear) {
      int days = (ethYear - anchorEthYear) * 365;
      for (int y = anchorEthYear; y < ethYear; y++) {
        if (isLeapYear(y)) days += 1;
      }
      return anchorUnixDay + days;
    } else {
      int days = (anchorEthYear - ethYear) * 365;
      for (int y = ethYear; y < anchorEthYear; y++) {
        if (isLeapYear(y)) days += 1;
      }
      return anchorUnixDay - days;
    }
  }

  static int _gregorianToUnixDay(int year, int month, int day) {
    final utc = DateTime.utc(year, month, day);
    return utc.millisecondsSinceEpoch ~/ 86400000;
  }

  static GregorianDate _unixDayToGregorian(int unixDay) {
    final d = DateTime.fromMillisecondsSinceEpoch(unixDay * 86400000, isUtc: true);
    return GregorianDate(year: d.year, month: d.month, day: d.day);
  }

  static GregorianDate toGregorian(int ethYear, int ethMonth, int ethDay) {
    final clampedMonth = ethMonth.clamp(1, 13);
    final maxDay = getDaysInMonth(ethYear, clampedMonth);
    final clampedDay = ethDay.clamp(1, maxDay);

    final newYearUnixDay = _ethiopianNewYearUnixDay(ethYear);
    final dayInYear = (clampedMonth - 1) * 30 + (clampedDay - 1);
    final targetUnixDay = newYearUnixDay + dayInYear;
    return _unixDayToGregorian(targetUnixDay);
  }

  static EthiopianDate toEthiopian(int gYear, int gMonth, int gDay) {
    final targetUnixDay = _gregorianToUnixDay(gYear, gMonth, gDay);

    int ethYear = gYear - 8;
    while (_ethiopianNewYearUnixDay(ethYear + 1) <= targetUnixDay) {
      ethYear++;
    }
    while (_ethiopianNewYearUnixDay(ethYear) > targetUnixDay) {
      ethYear--;
    }

    final daysIntoYear = targetUnixDay - _ethiopianNewYearUnixDay(ethYear);
    final ethMonth = (daysIntoYear ~/ 30) + 1;
    final ethDay = (daysIntoYear % 30) + 1;

    return EthiopianDate(year: ethYear, month: ethMonth, day: ethDay);
  }

  static String formatDisplay(EthiopianDate eth, {String lang = 'am'}) {
    final monthName = lang == 'am'
        ? (eth.month <= 13 ? monthsAm[eth.month] : 'ወር ${eth.month}')
        : (eth.month <= 13 ? monthsEn[eth.month] : 'Month ${eth.month}');
    return '$monthName ${eth.day}, ${eth.year}';
  }
}

