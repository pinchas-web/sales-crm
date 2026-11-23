/**
 * גשר דרייב לשאלונים של ה-CRM — רץ בחשבון הגוגל של פנחס.
 * מקבל קובץ PDF מה-CRM ושומר אותו בדרייב, בתיקייה "לקוחות - שאלונים" / <שם הלקוח>.
 *
 * התקנה: ראו docs/questionnaires/README.md (שלב 2).
 * אבטחה:
 *  - כל בקשה חייבת לכלול את הסיסמה המשותפת (SECRET), אחרת נדחית.
 *  - הרשאה מצומצמת (drive.file): הסקריפט רואה ונוגע רק בתיקיות ובקבצים שהוא עצמו יצר.
 *    לכן עובדים מול ה-API של דרייב ישירות, ולא דרך DriveApp (שדורש גישה לכל הדרייב).
 */

const ROOT_NAME = 'לקוחות - שאלונים';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || secret.length < 24 || body.secret !== secret) return reply({ ok: false, error: 'unauthorized' });

    const folderName = clean(body.folderName) || 'ללא שם';
    const fileName = clean(body.fileName) || 'שאלון.pdf';
    const bytes = Utilities.base64Decode(String(body.base64 || ''));
    if (bytes.length < 5 || bytes.length > 8 * 1024 * 1024) return reply({ ok: false, error: 'bad_file' });

    const rootId = getRoot();
    const folderId = findFolder(folderName, rootId) || createFolder(folderName, rootId);
    const file = uploadPdf(fileName, folderId, bytes);
    return reply({ ok: true, url: file.webViewLink || ('https://drive.google.com/file/d/' + file.id + '/view') });
  } catch (err) {
    return reply({ ok: false, error: String(err).slice(0, 200) });
  }
}

function api(method, url, opts) {
  const res = UrlFetchApp.fetch(url, Object.assign({
    method: method,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  }, opts || {}));
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code >= 300) throw new Error('Drive ' + code + ': ' + text.slice(0, 150));
  return text ? JSON.parse(text) : {};
}

function createFolder(name, parentId) {
  const meta = { name: name, mimeType: FOLDER_MIME };
  if (parentId) meta.parents = [parentId];
  return api('post', 'https://www.googleapis.com/drive/v3/files?fields=id', {
    contentType: 'application/json', payload: JSON.stringify(meta),
  }).id;
}

function findFolder(name, parentId) {
  const q = "name = '" + name.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "' and mimeType = '" + FOLDER_MIME +
    "' and '" + parentId + "' in parents and trashed = false";
  const r = api('get', 'https://www.googleapis.com/drive/v3/files?fields=files(id)&pageSize=1&q=' + encodeURIComponent(q));
  return r.files && r.files.length ? r.files[0].id : null;
}

function uploadPdf(name, parentId, bytes) {
  const boundary = 'b' + Utilities.getUuid().replace(/-/g, '');
  const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify({ name: name, parents: [parentId], mimeType: 'application/pdf' }) +
    '\r\n--' + boundary + '\r\nContent-Type: application/pdf\r\n\r\n';
  const tail = '\r\n--' + boundary + '--';
  const payload = [].concat(Utilities.newBlob(head).getBytes(), bytes, Utilities.newBlob(tail).getBytes());
  return api('post', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    contentType: 'multipart/related; boundary=' + boundary, payload: payload,
  });
}

function getRoot() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_ID');
  if (id) {
    try {
      const f = api('get', 'https://www.googleapis.com/drive/v3/files/' + id + '?fields=id,trashed');
      if (!f.trashed) return id;
    } catch (e) { /* התיקייה נמחקה — יוצרים מחדש */ }
  }
  const newId = createFolder(ROOT_NAME, null);
  props.setProperty('ROOT_ID', newId);
  return newId;
}

function clean(s) {
  return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 150);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * להרצה ידנית פעם אחת מהעורך: יוצר את התיקייה, מאשר הרשאות,
 * ויוצר סיסמה משותפת אקראית (SECRET) אם עוד אין. את הסיסמה מעתיקים ל-Vercel.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('SECRET');
  if (!secret || secret.length < 24) {
    secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('SECRET', secret);
  }
  Logger.log('מוכן. התיקייה: https://drive.google.com/drive/folders/' + getRoot());
  Logger.log('הסיסמה להעתקה ל-Vercel (DRIVE_BRIDGE_SECRET): ' + secret);
}
