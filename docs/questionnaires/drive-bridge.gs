/**
 * גשר דרייב לשאלונים של ה-CRM — רץ בחשבון הגוגל של פנחס.
 * מקבל קובץ PDF מה-CRM ושומר אותו בדרייב, בתיקייה "לקוחות - שאלונים" / <שם הלקוח>.
 *
 * התקנה: ראו docs/questionnaires/README.md (שלב 2).
 * אבטחה:
 *  - כל בקשה חייבת לכלול את הסיסמה המשותפת (SECRET), אחרת נדחית.
 *  - הסקריפט יוצר ונוגע רק בתיקייה שלו. הוא לא קורא שום קובץ אחר בדרייב.
 */

const ROOT_NAME = 'לקוחות - שאלונים';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || secret.length < 24 || body.secret !== secret) return reply({ ok: false, error: 'unauthorized' });

    const folderName = clean(body.folderName) || 'ללא שם';
    const fileName = clean(body.fileName) || 'שאלון.pdf';
    const bytes = Utilities.base64Decode(String(body.base64 || ''));
    if (bytes.length < 5 || bytes.length > 8 * 1024 * 1024) return reply({ ok: false, error: 'bad_file' });

    const root = getRoot();
    const sub = root.getFoldersByName(folderName);
    const folder = sub.hasNext() ? sub.next() : root.createFolder(folderName);
    const file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', fileName));
    return reply({ ok: true, url: file.getUrl() });
  } catch (err) {
    return reply({ ok: false, error: String(err).slice(0, 200) });
  }
}

function getRoot() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* התיקייה נמחקה — יוצרים מחדש */ }
  }
  const folder = DriveApp.createFolder(ROOT_NAME);
  props.setProperty('ROOT_ID', folder.getId());
  return folder;
}

function clean(s) {
  return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 150);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** להרצה ידנית פעם אחת מהעורך: יוצר את התיקייה ומאשר הרשאות */
function setup() {
  getRoot();
  Logger.log('מוכן. התיקייה: ' + getRoot().getUrl());
}
