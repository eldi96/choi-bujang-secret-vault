import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class Element {
  hidden = false; value = ''; textContent = ''; children = []; disabled = false; listeners = {};
  addEventListener(name, fn) { this.listeners[name] = fn; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  get firstChild() { return this.children[0]; }
  focus() {}
  querySelector() { return new Element(); }
}
const source = (await readFile(new URL('../public/index.html', import.meta.url), 'utf8'))
  .match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test('screen never fetches notes before approval; shows approved notes and clears them on revoke', async () => {
  const elements = new Map();
  const element = selector => { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); };
  const state = { status: 'pending', noteReads: 0, registered: false };
  const context = vm.createContext({
    document: { querySelector: element, createElement: () => new Element(), addEventListener() {}, hidden: false },
    addEventListener() {}, setInterval() {}, navigator: { onLine: true }, confirm: () => false,
    fetch: async path => {
      if (path === '/api/auth') return new Response(JSON.stringify({ email: null }));
      if (path === '/api/device') return new Response(JSON.stringify({ status: state.status, registered: state.registered }));
      if (path === '/api/notes') { state.noteReads++; return new Response(JSON.stringify({ notes: [{ id: 'synthetic', title: 'fixture title', body: 'fixture body' }] })); }
      throw Error('unexpected path');
    },
  });
  const program = new vm.Script('(async()=>{' + source + '})()');
  await program.runInContext(context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.noteReads, 0);
  assert.equal(element('#editor').hidden, true);
  assert.match(element('#notes').firstChild.textContent, /서버 승인 전/);
  // An inconsistent status response cannot open the screen.
  state.registered = true;
  await element('#refresh-device').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.noteReads, 0);
  state.status = 'approved';
  await element('#refresh-device').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.noteReads, 1);
  assert.equal(element('#editor').hidden, false);
  assert.equal(element('#notes').firstChild.children[0].textContent, 'fixture title');
  element('#note-body').value = 'unsaved fixture';
  state.status = 'revoked'; state.registered = false;
  await element('#refresh-device').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(element('#editor').hidden, true);
  assert.equal(element('#note-body').value, '');
  assert.equal(element('#notes').firstChild.children.length, 0);
  assert.equal(state.noteReads, 1);
});
