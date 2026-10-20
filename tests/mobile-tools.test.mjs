import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const source = await fs.readFile(new URL('../assets/mobile-tools.js', import.meta.url), 'utf8');

class Node {
  constructor(name, document) { this.name=name;this.document=document;this.childNodes=[];this.parentNode=null;this.listeners=new Map();this.moves=0; }
  get firstChild() { return this.childNodes[0]||null; }
  get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null; }
  get isConnected() { return this===this.document.body||Boolean(this.parentNode?.isConnected); }
  contains(node) { return node===this||this.childNodes.some(child => child.contains(node)); }
  insertBefore(node, before) {
    node.remove();
    const index = before ? this.childNodes.indexOf(before) : this.childNodes.length;
    assert.ok(index>=0,'reference node belongs to destination');
    this.childNodes.splice(index,0,node);node.parentNode=this;this.moves++;
    return node;
  }
  moveBefore(node,before) { return this.insertBefore(node,before); }
  remove() { if(this.parentNode){const siblings=this.parentNode.childNodes;siblings.splice(siblings.indexOf(this),1);this.parentNode=null;} }
  append(...nodes) { nodes.forEach(node => this.insertBefore(node,null)); }
  addEventListener(name,fn) { this.listeners.set(name,fn); }
  click() { this.listeners.get('click')?.(); }
}

function page({mobile=true,rail=true,home=true,dictionary=true,legacy=false,mediaAvailable=true}={}) {
  const selectors=new Map(), classes=new Set(), windowListeners=new Map(), mediaListeners=[];
  const document={createComment:() => new Node('#comment',document),querySelector:selector => selectors.get(selector)||null};
  document.body=new Node('body',document);
  document.body.classList={toggle:(name,value) => value?classes.add(name):classes.delete(name),contains:name => classes.has(name)};
  const before=new Node('before',document),header=new Node('header',document),middle=new Node('middle',document),after=new Node('after',document);
  const topActions=new Node('rail',document),originalControl=new Node('original-control',document);
  topActions.append(originalControl);header.append(topActions);
  const homeNode=new Node('home',document),dictionaryNode=new Node('dictionary',document);
  document.body.append(before,header,...(home?[homeNode]:[]),middle,...(dictionary?[dictionaryNode]:[]),after);
  if(rail)selectors.set('.top-actions',topActions);
  if(home)selectors.set('.lesson-panel-return',homeNode);
  if(dictionary)selectors.set('.ewl-launcher',dictionaryNode);
  const media={matches:mobile};
  if(legacy)media.addListener=listener => mediaListeners.push(listener);
  else media.addEventListener=(event,listener) => {assert.equal(event,'change');mediaListeners.push(listener);};
  const window={addEventListener:(event,listener) => windowListeners.set(event,listener)};
  if(mediaAvailable)window.matchMedia=query => {assert.equal(query,'(max-width:760px)');return media;};
  const context={window,document};
  const run=() => vm.runInNewContext(source,context);
  const originalChildren=[...document.body.childNodes];
  return {document,window,topActions,homeNode,dictionaryNode,originalControl,originalChildren,classes,mediaListeners,
    run,
    load:() => windowListeners.get('load')?.(),
    resize:value => {media.matches=value;mediaListeners.forEach(listener => listener());},
    appendDictionary:() => {document.body.append(dictionaryNode);selectors.set('.ewl-launcher',dictionaryNode);},
  };
}

test('mobile tools are the original live nodes, ordered before the original header controls', () => {
  const fixture=page();
  let clicks=0;fixture.dictionaryNode.addEventListener('click',()=>clicks++);
  fixture.document.activeElement=fixture.dictionaryNode;
  fixture.dictionaryNode.customLessonState={selectedWord:'example'};
  fixture.run();
  assert.deepEqual(fixture.topActions.childNodes,[fixture.homeNode,fixture.dictionaryNode,fixture.originalControl]);
  fixture.dictionaryNode.click();
  assert.equal(clicks,1);
  assert.equal(fixture.document.activeElement,fixture.dictionaryNode);
  assert.equal(fixture.dictionaryNode.customLessonState.selectedWord,'example');
  assert.ok(fixture.classes.has('mobile-tools-docked'));
  assert.equal(fixture.document.body.childNodes.filter(node=>node.name==='#comment').length,2);
});

test('switching to desktop restores exact original placements and removes the docking class', () => {
  const fixture=page();fixture.run();fixture.resize(false);
  assert.deepEqual(fixture.document.body.childNodes,fixture.originalChildren);
  assert.deepEqual(fixture.topActions.childNodes,[fixture.originalControl]);
  assert.ok(!fixture.classes.has('mobile-tools-docked'));
  assert.equal(fixture.document.body.childNodes.filter(node=>node.name==='#comment').length,0);
  fixture.resize(true);fixture.resize(false);
  assert.deepEqual(fixture.document.body.childNodes,fixture.originalChildren);
});

test('repeat load, resize and accidental double script execution never duplicate or move already ordered controls', () => {
  const fixture=page();fixture.run();
  const moves=fixture.topActions.moves;
  fixture.load();fixture.resize(true);fixture.run();fixture.load();
  assert.equal(fixture.topActions.moves,moves);
  assert.equal(fixture.mediaListeners.length,1);
  assert.deepEqual(fixture.topActions.childNodes,[fixture.homeNode,fixture.dictionaryNode,fixture.originalControl]);
  assert.equal(fixture.document.body.childNodes.filter(node=>node.name==='#comment').length,2);
});

test('a dictionary launcher created later is docked once on load and its late original position is restored', () => {
  const fixture=page({dictionary:false});fixture.run();
  assert.deepEqual(fixture.topActions.childNodes,[fixture.homeNode,fixture.originalControl]);
  fixture.appendDictionary();const last=fixture.dictionaryNode;
  fixture.load();
  assert.deepEqual(fixture.topActions.childNodes,[fixture.homeNode,last,fixture.originalControl]);
  fixture.resize(false);
  assert.deepEqual(fixture.document.body.childNodes,[...fixture.originalChildren,last]);
});

test('desktop startup makes no changes until a mobile breakpoint is reached', () => {
  const fixture=page({mobile:false});fixture.run();fixture.load();
  assert.deepEqual(fixture.document.body.childNodes,fixture.originalChildren);
  assert.deepEqual(fixture.topActions.childNodes,[fixture.originalControl]);
  assert.ok(!fixture.classes.has('mobile-tools-docked'));
  fixture.resize(true);
  assert.equal(fixture.homeNode.parentNode,fixture.topActions);
});

test('pages without the lesson header or media API are untouched', () => {
  for(const options of [{rail:false},{mediaAvailable:false}]){
    const fixture=page(options);fixture.run();fixture.load();
    assert.deepEqual(fixture.document.body.childNodes,fixture.originalChildren);
    assert.deepEqual(fixture.topActions.childNodes,[fixture.originalControl]);
    assert.equal(fixture.mediaListeners.length,0);
    assert.equal(fixture.classes.size,0);
  }
  const empty=page({home:false,dictionary:false});empty.run();
  assert.equal(empty.classes.size,0);
  assert.deepEqual(empty.topActions.childNodes,[empty.originalControl]);
});

test('legacy breakpoint listener and browsers without moveBefore retain node identity and restoration', () => {
  const fixture=page({legacy:true});fixture.topActions.moveBefore=undefined;fixture.document.body.moveBefore=undefined;
  fixture.run();fixture.dictionaryNode.click();
  assert.deepEqual(fixture.topActions.childNodes,[fixture.homeNode,fixture.dictionaryNode,fixture.originalControl]);
  fixture.resize(false);
  assert.deepEqual(fixture.document.body.childNodes,fixture.originalChildren);
});
