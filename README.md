# PureNotes

אפליקציית פתקים מודרנית עם אינטגרציה מלאה ל-Obsidian דרך URI scheme.

## תכונות עיקריות

- ✅ יצירה ועריכה של פתקים בפורמט Markdown
- ✅ חיפוש מתקדם בכל הפתקים עם Fuzzy Search
- ✅ סנכרון דו-כיווני עם Obsidian דרך URI (PureNotes → Obsidian)
- ✅ תצוגת preview של Markdown
- ✅ תמיכה בתגיות (hashtags)
- ✅ ממשק משתמש נקי ומודרני
- ✅ אחסון מקומי בפורמט .md

## טכנולוגיות

- **React Native (Expo)** - פלטפורמת פיתוח
- **TypeScript** - שפת פיתוח
- **Zustand** - ניהול state
- **Fuse.js** - חיפוש מתקדם
- **React Navigation** - ניווט
- **Expo File System** - ניהול קבצים

## התקנה

```bash
npm install
```

## הרצה

```bash
# iOS
npm run ios

# Android
npm run android

# Web (לבדיקות)
npm run web
```

## שימוש עם Obsidian

1. התקן את Obsidian במכשיר
2. צור Vault חדש או השתמש בקיים
3. בהגדרות האפליקציה, הזן את שם ה-Vault
4. צור פתק חדש ובחר "סנכרן ל-Obsidian"
5. הפתק יופיע ב-Vault שלך

## מבנה הפרויקט

```
src/
├── components/       # קומפוננטות UI
├── screens/         # מסכים
├── services/        # לוגיקה עסקית
├── stores/          # ניהול state
└── types/           # TypeScript types
```

## רישיון

MIT
