# מערכות חיצוניות — הדמיה (`integrations-mock`)

אתר קטן ועצמאי שמדמה שתי מערכות חיצוניות לצורך הוכחת יכולת:

- **CPR** — מנפיקה ימי מחלה (גימלים). N גימלים שהונפקו היום נרשמים בדוח 1 על מחר … היום+N (SPEC F11).
- **אנשים בדיגיטל** — מאשרת חופשה שנתית מתאריך התחלה עד תאריך סיום, כולל (SPEC F12).

האתר מזין את דוח 1 **רק** דרך ה-API של האינטגרציות (`/api/v1/integrations/*`, SPEC §6, SECURITY.md §15).
הוא לא נוגע במסד הנתונים, ואין לו `DATABASE_URL` או סוד כלשהו של Supabase. כל הנתונים באתר בדויים.

## איך זה עובד

```
 דפדפן
   │  Basic Auth (MOCK_USER / MOCK_PASSWORD) — רק לאותו מקור (same-origin)
   ▼
 שרת ההדמיה  apps/integrations-mock   (Fastify, doch1-integrations)
   │  • בודק Basic Auth בזמן קבוע (SHA-256 + timingSafeEqual)
   │  • מאמת את הבקשה (zod, strict)
   │  • ב-CPR קובע issueDate = היום לפי Asia/Jerusalem
   │  • מוסיף X-Integration-Key של המערכת המתאימה (המפתח לא מגיע לדפדפן)
   ▼
 Doch1 API  /api/v1/integrations/*   (doch1-api)
   │  • בודק את המפתח, חלון התאריכים והחייל
   ▼
 מסד הנתונים (Supabase Postgres) — דיווחים + report_audit
```

הדפדפן פונה רק לשרת ההדמיה, ולכן **אין שינוי ב-CORS** של ה-API.
שרת ההדמיה מעביר את הסטטוס ואת גוף התשובה של דוח 1 כמו שהם. אם דוח 1 לא עונה תוך 15 שניות (למשל כשהשירות החינמי ב-Render מתעורר), מוחזר 502 עם ההודעה "מערכת דוח 1 לא זמינה, נסו שוב בעוד דקה".

## הרצה מקומית לצד ה-API

1. **יצירת מפתחות** — מפתח נפרד לכל מערכת, לפחות 32 תווים:

   ```sh
   openssl rand -hex 32   # מפתח CPR
   openssl rand -hex 32   # מפתח אנשים בדיגיטל
   openssl rand -hex 16   # סיסמה לאתר (לפחות 16 תווים)
   ```

2. **אותם ערכים בשני קובצי `.env`** (הקבצים לא נשמרים ב-git):

   | `apps/api/.env`                                       | `apps/integrations-mock/.env`        |
   | ----------------------------------------------------- | ------------------------------------ |
   | `INTEGRATION_CPR_KEY=<מפתח CPR>`                      | `CPR_API_KEY=<אותו מפתח CPR>`        |
   | `INTEGRATION_PEOPLE_DIGITAL_KEY=<מפתח אנשים בדיגיטל>` | `PEOPLE_DIGITAL_API_KEY=<אותו מפתח>` |

   ```sh
   cp apps/integrations-mock/.env.example apps/integrations-mock/.env
   # ומלאו: CPR_API_KEY, PEOPLE_DIGITAL_API_KEY, MOCK_USER, MOCK_PASSWORD
   ```

   `DOCH1_API_URL` נשאר `http://localhost:3000/api/v1`. אם משתנה חסר או קצר מדי, השרת לא עולה ומציין את שם המשתנה.

3. **הרצה** (בשני טרמינלים):

   ```sh
   pnpm --filter api dev                 # http://localhost:3000
   pnpm --filter integrations-mock dev   # http://localhost:4000
   ```

   פתחו http://localhost:4000, התחברו עם `MOCK_USER` / `MOCK_PASSWORD`, בחרו לשונית, חפשו חייל ושלחו.

בדיקות: `pnpm --filter integrations-mock test` (ה-`fetch` אל דוח 1 מדומה, אין צורך ב-API או במסד נתונים).

## פריסה ב-Render

השירות `doch1-integrations` מוגדר ב-`render.yaml` (שירות web נפרד, עם כתובת משלו):
https://doch1-integrations.onrender.com

משתני סביבה שיש להזין ב-Render (הם `sync: false`, ולכן Render מבקש אותם ולא שומר אותם ב-repo):

| משתנה                    | ערך                                                               |
| ------------------------ | ----------------------------------------------------------------- |
| `DOCH1_API_URL`          | כבר מוגדר: `https://doch1-api.onrender.com/api/v1`                |
| `CPR_API_KEY`            | בדיוק הערך של `INTEGRATION_CPR_KEY` בשירות `doch1-api`            |
| `PEOPLE_DIGITAL_API_KEY` | בדיוק הערך של `INTEGRATION_PEOPLE_DIGITAL_KEY` בשירות `doch1-api` |
| `MOCK_USER`              | שם משתמש לאתר                                                     |
| `MOCK_PASSWORD`          | סיסמה, לפחות 16 תווים                                             |

את `PORT` ו-`NODE_ENV=production` Render מגדיר. **אסור** להוסיף כאן `DATABASE_URL` או מפתחות Supabase.
להחלפת מפתח: משנים אותו בשני השירותים (`doch1-api` ו-`doch1-integrations`).

## דומיין מותאם (אופציונלי)

1. ב-Render: השירות `doch1-integrations` ← **Settings** ← **Custom Domains** ← **Add Custom Domain**, והזינו את הדומיין (למשל `integrations.example.org`).
2. אצל ספק ה-DNS: הוסיפו את רשומת ה-**CNAME** ש-Render מציג (מהדומיין אל `doch1-integrations.onrender.com`).
3. חכו ש-Render יאמת את הדומיין ויוציא תעודת TLS. אין צורך לשנות דבר בקוד או ב-CORS של ה-API.

## אבטחה בקצרה

- Basic Auth על כל האתר, חוץ מ-`GET /healthz` (בדיקת הבריאות של Render).
- המפתחות נשארים בשרת בלבד, והשרת לא מחזיר אותם בשום תשובה.
- CSP קשוחה: רק `'self'`, ובנוסף Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`). הממשק בונה את כל ה-DOM עם `createElement` ו-`textContent`, בלי `innerHTML`.
- הלוגים כוללים רק method, נתיב, סטטוס ומשך. לא נרשמים מפתחות, כותרת `authorization`, גופי בקשות או מספרים אישיים.
- גוף בקשה עד 10KB. כל שדה לא מוכר מוחזר כ-400.
