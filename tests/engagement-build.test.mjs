import test from 'node:test';
import assert from 'node:assert/strict';
import {instrumentHtml} from '../scripts/inject-access.mjs';

test('published lessons load the current tracker and access styles rather than an older cached client', () => {
  const source='<html lang="en"><head><title>Lesson</title></head><body><main>Lesson</main></body></html>';
  const html=instrumentHtml(source,'lessons/a1/day-03.html',{versions:{'activity-tracker.js':'1234abcdef12','access.css':'abcdef123456','auth-client.js':'9876abcdef12'}});
  assert.match(html,/src="\.\.\/\.\.\/assets\/activity-tracker\.js\?v=1234abcdef12" defer/);
  assert.match(html,/href="\.\.\/\.\.\/assets\/access\.css\?v=abcdef123456"/);
  assert.match(html,/src="\.\.\/\.\.\/assets\/auth-client\.js\?v=9876abcdef12" defer/);
  assert.ok(html.includes('access-pending'));
  assert.equal(instrumentHtml(html,'lessons/a1/day-03.html'),html);
});
