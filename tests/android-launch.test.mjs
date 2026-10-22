import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const manifest = await fs.readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const gradle = await fs.readFile(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
const shortcuts = await fs.readFile(new URL('../android/app/src/main/res/xml/shortcuts.xml', import.meta.url), 'utf8');
const attributes = text => Object.fromEntries([...text.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(([, key, value]) => [key, value]));
const activities = [...manifest.matchAll(/<activity\b([^>]*?)(?:\/>|>([\s\S]*?)<\/activity>)/g)].map(([, tag, body = '']) => ({ attributes: attributes(tag), body }));
const activity = name => activities.find(item => item.attributes['android:name'] === `com.google.androidbrowserhelper.trusted.${name}`);
const metadata = (body, name) => [...body.matchAll(/<meta-data\b([^>]*)\/?\s*>/g)].map(([, tag]) => attributes(tag)).find(item => item['android:name'] === name)?.['android:value'];

test('the component toggled by Android Browser Helper exists and has same-origin manage-space metadata', () => {
  const manage = activity('ManageDataLauncherActivity');
  assert.ok(manage, 'ABH calls setComponentEnabledSetting for this activity on every launch');
  assert.equal(manage.attributes['android:exported'], 'false');
  assert.notEqual(manage.attributes['android:enabled'], 'false');
  const url = new URL(metadata(manage.body, 'android.support.customtabs.trusted.MANAGE_SPACE_URL'));
  assert.equal(url.origin, 'https://feanoria-web.github.io');
  const launch = activity('LauncherActivity');
  assert.ok(launch);
  assert.equal(launch.attributes['android:exported'], 'true');
  assert.equal(new URL(metadata(launch.body, 'android.support.customtabs.trusted.DEFAULT_URL')).origin, url.origin);
});

test('the fixed native release can upgrade the original 1.0.0 APK', () => {
  const code = Number(gradle.match(/\bversionCode\s+(\d+)/)?.[1]);
  const version = gradle.match(/\bversionName\s+['"]([\d.]+)['"]/)?.[1];
  assert.ok(Number.isInteger(code) && code >= 2, 'Android updates require a higher versionCode');
  assert.match(version || '', /^\d+\.\d+\.\d+$/);
  const [major, minor, patch] = version.split('.').map(Number);
  assert.ok(major > 1 || major === 1 && (minor > 0 || minor === 0 && patch >= 1));
  assert.match(gradle, /applicationId\s+['"]io\.github\.feanoriaweb\.english['"]/);
});

test('the four course shortcuts keep their original destinations and the safe ABH trampoline', () => {
  const items = [...shortcuts.matchAll(/<shortcut\b([^>]*?)>([\s\S]*?)<\/shortcut>/g)];
  assert.equal(items.length, 4);
  for (const [index, level] of ['A1', 'A2', 'B1', 'YDS'].entries()) {
    const intent = attributes(items[index][2].match(/<intent\b([^>]*)\/?\s*>/)?.[1] || '');
    assert.equal(intent['android:targetPackage'], 'io.github.feanoriaweb.english');
    assert.equal(intent['android:targetClass'], 'com.google.androidbrowserhelper.trusted.ShortcutTrampolineActivity');
    assert.equal(intent['android:data'], `https://feanoria-web.github.io/ingilizce-dersler/index.html#${level}`);
  }
});
