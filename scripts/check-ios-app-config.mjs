import { execFileSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';

const infoPath = process.argv[2];
if (!infoPath) {
  console.error('Usage: node scripts/check-ios-app-config.mjs <built-app/Info.plist>');
  process.exit(2);
}

// Check the processed build product, including Xcode's device-family settings.
const info = JSON.parse(
  execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', infoPath], { encoding: 'utf8' })
);
const phone =
  info['UISupportedInterfaceOrientations~iphone'] ?? info.UISupportedInterfaceOrientations;
const ipad = info['UISupportedInterfaceOrientations~ipad'] ?? info.UISupportedInterfaceOrientations;
const phoneExpected = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight',
];
const ipadExpected = [...phoneExpected, 'UIInterfaceOrientationPortraitUpsideDown'];
const sameOrientations = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  expected.every((orientation) => actual.includes(orientation));
const errors = [];
if (!sameOrientations(phone, phoneExpected))
  errors.push('iPhone orientations changed unexpectedly.');
if (!sameOrientations(ipad, ipadExpected))
  errors.push('iPad multitasking requires portrait, upside-down portrait, and both landscapes.');
if (![1, 2].every((family) => info.UIDeviceFamily?.includes(family)))
  errors.push('The app must continue supporting both iPhone and iPad.');
if ((info['UIRequiresFullScreen~ipad'] ?? info.UIRequiresFullScreen) === true)
  errors.push('Full-screen-only mode must not disable iPad multitasking.');

console.log(JSON.stringify({ ok: errors.length === 0, phone, ipad, errors }, null, 2));
if (errors.length > 0) process.exit(1);
