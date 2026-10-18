import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { mainDestinations, chatReturnRoute, routeBack, selectConversation, showMainNavigation, teamChatOrigin } from '../src/logic/app-navigation.ts';
import { mobileActionAllowed, mobilePanelAllowed, BRIDGE_UNAVAILABLE } from '../src/logic/mobile-access.ts';
import { supportsMobileAction } from '../src/logic/mobile-capabilities.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const minimal = { groups: true, actions: [] };

test('main destinations stay in a fixed order without advertising an unimplemented pending page', () => {
  assert.deepEqual(mainDestinations.map(item => [item.id, item.label]), [['home', '会话'], ['team', '团队'], ['settings', '设置']]);
  for (const item of mainDestinations) {
    assert.equal(showMainNavigation(item.route), item.id === 'home');
    assert.deepEqual(routeBack(item.route, {page:'home'}), {page:'home'});
  }
  assert.equal(showMainNavigation({page:'chat'}), false);
  assert.equal(showMainNavigation({page:'team',section:'bots',id:'a'}), false);
});

test('chat back restores home, settings and the exact bot or group profile', () => {
  const origins = [
    {page:'home'} as const, {page:'settings',initial:'mobile'} as const,
    teamChatOrigin('bot:a', ['r']), teamChatOrigin('room:r', ['r']), teamChatOrigin('r', ['r']),
  ];
  assert.deepEqual(origins[2], {page:'team',section:'bots',id:'a'});
  assert.deepEqual(origins[3], {page:'team',section:'groups',id:'r'});
  for (const origin of origins) assert.deepEqual(routeBack({page:'chat'}, chatReturnRoute(origin)), origin);
  assert.deepEqual(chatReturnRoute({page:'team',section:'bots',create:'bot'}), {page:'home'});
  assert.deepEqual(routeBack({page:'chat'}, {page:'chat'}), {page:'home'});
});

test('conversation fallback handles an empty team, a removed selection, chief and classic agents', () => {
  const bot = {id:'bot:a',kind:'bot',sessionId:'s1'} as any;
  const room = {id:'room:r',kind:'room'} as any;
  const agent = {id:'agent:x',kind:'agent',sessionId:'s2'} as any;
  assert.equal(selectConversation([], 'missing', false), undefined);
  assert.equal(selectConversation([], '', true), undefined);
  assert.equal(selectConversation([room,bot,agent], 'missing', false, 's1'), bot);
  assert.equal(selectConversation([room,bot], 'missing', false, 'removed'), room);
  assert.equal(selectConversation([room,bot,agent], '', true), agent);
  assert.equal(selectConversation([room,bot], '', true), undefined);
  assert.equal(selectConversation([room,bot,agent], room.id, false, 's1'), room);
});

function mountComponent(file: string, mocks: Record<string, unknown>) {
  const effects: Array<() => unknown> = [];
  const state: unknown[] = [];
  let cursor = 0;
  const react = {
    createElement(type: unknown, props: any, ...children: unknown[]) { return {type,props:{...props,children}}; },
    useState(initial: any) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value: any) => {state[index] = typeof value === 'function' ? value(state[index]) : value;}];
    },
    useEffect(fn: () => unknown) { effects.push(fn); },
    useRef(value: unknown) { return {current:value}; },
  };
  const module = {exports:{} as any};
  const source = readFileSync(new URL('../src/' + file + '.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  runInNewContext(output, {module,exports:module.exports,URL,require(name: string) {
    if (name === 'react') return react;
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected component import: ' + name);
  }});
  return {
    render(props: any) {cursor=0;return module.exports[file.split('/').at(-1)!](props);},
    async runEffects() {for (const effect of effects.splice(0)) effect();await Promise.resolve();},
  };
}
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...elements(tree.props?.children)];
}
const ui = Object.fromEntries(['Button','Field','Icon','IconButton','Label','Notice','PageHeader','Section','SettingRow','Sheet','Tag','ToggleRow','styles'].map(key=>[key,key==='styles'?{}:key]));
const sharedMocks = {
  'react-native':{Text:'Text',View:'View',ScrollView:'ScrollView'},
  '../components/Motion':{AnimatedPressable:'Pressable',PageTransition:'PageTransition'},
  '../theme':{useTheme:()=>({})},
  '../i18n':{useI18n:()=>({tr:(value:string)=>value})},
  '../logic/mobile-access':{mobileActionAllowed,mobilePanelAllowed,BRIDGE_UNAVAILABLE},
  '../logic/mobile-capabilities':{supportsMobileAction},
  '../components/UI':ui,
  '../components/BotAvatar':{BotAvatar:'BotAvatar',RoomAvatar:'RoomAvatar',defaultColor:()=>'',defaultShape:()=>''},
  '../components/WorkingFolderPicker':{WorkingFolderPicker:'WorkingFolderPicker'},
  '../components/AvatarEditor':{AvatarEditor:'AvatarEditor'},
  '../components/ThinkingLevelPicker':{ThinkingLevelPicker:'ThinkingLevelPicker'},
  '../components/ApprovalCards':{ApprovalCards:'ApprovalCards'},
  '../components/GroupProgress':{GroupProgress:'GroupProgress'},
  '../features':{MemoryPanel:'MemoryPanel',SchedulesPanel:'SchedulesPanel'},
  '../host-settings/CapabilitiesPanel':{BotCapabilities:'BotCapabilities'},
  '../types':{errorText:String},
};

test('navigation component exposes three accessible 44pt targets and only navigates on a press', async () => {
  const calls: unknown[] = [];
  const mounted=mountComponent('components/AppNavigation', {
    'react-native':{View:'View',Text:'Text',Keyboard:{dismiss:()=>calls.push('dismiss')}},
    './Motion':{AnimatedPressable:'Pressable'}, './UI':ui,
    '../theme':sharedMocks['../theme'], '../logic/app-navigation':{mainDestinations},
  });
  const nodes=elements(mounted.render({selected:'home',onNavigate:(route:unknown)=>calls.push(route)}));
  await mounted.runEffects();
  assert.deepEqual(calls, []);
  const tabs=nodes.filter(node=>node.props.accessibilityRole==='tab');
  assert.deepEqual(tabs.map(node=>node.props.accessibilityLabel), ['会话','团队','设置']);
  assert.deepEqual(tabs.map(node=>node.props.accessibilityState.selected), [true,false,false]);
  for (const tab of tabs) assert.ok(tab.props.style({pressed:false}).minHeight>=44);
  tabs[1].props.onPress();
  assert.deepEqual(calls, ['dismiss', {page:'team',section:'bots'}]);
  tabs[2].props.onPress();
  assert.deepEqual(calls.at(-1), {page:'settings'});
});

test('minimal bridge team mounts readable profiles without actions or editable management fields', async () => {
  const calls: string[] = [];
  let opened='';
  const mounted=mountComponent('screens/TeamScreen',sharedMocks);
  const props={
    client:{action:async(name:string)=>{calls.push(name);return {};}},
    team:{mobileCapabilities:minimal,bots:[{id:'a',name:'Alice',role:'Writer'}],rooms:[],models:[]},
    online:true,refresh:async()=>{calls.push('refresh');},openConversation:(id:string)=>{opened=id;},
  };
  let nodes=elements(mounted.render(props));
  nodes.find(node=>node.type==='SettingRow' && node.props.title==='Alice').props.onPress();
  nodes=elements(mounted.render(props));
  await mounted.runEffects();
  assert.deepEqual(calls, []);
  assert.equal(nodes.some(node=>node.type==='Field'), false);
  assert.equal(nodes.some(node=>node.type==='WorkingFolderPicker'), false);
  assert.equal(nodes.some(node=>node.type==='Label' && node.props.children.includes('Alice')), true);
  nodes.find(node=>node.type==='Button' && node.props.title==='Open chat').props.onPress();
  assert.equal(opened,'a');
  assert.deepEqual(calls, []);
});

test('team management fields appear only with the independent management capability', () => {
  for (const capabilities of [minimal, {botManagement:true}, {botManagement:true,actions:[]}, {actions:['update-bot']}]) {
    const mounted=mountComponent('screens/TeamScreen',sharedMocks);
    const tree=mounted.render({client:{},team:{mobileCapabilities:capabilities,bots:[{id:'a',name:'Alice'}],rooms:[],models:[]},initialId:'a',online:true});
    assert.equal(elements(tree).some(node=>node.type==='Field'), mobileActionAllowed(capabilities,'update-bot'));
  }
});


test('native team page callbacks push a profile without changing the retained list page', () => {
  const calls: unknown[] = [];
  const mounted = mountComponent('screens/TeamScreen', sharedMocks);
  const props = {
    client: {}, team: { mobileCapabilities: minimal, bots: [{ id: 'a', name: 'Alice' }], rooms: [], models: [] },
    online: true, onNavigatePage: (...args: unknown[]) => calls.push(args),
  };
  let nodes = elements(mounted.render(props));
  nodes.find(node => node.type === 'SettingRow' && node.props.title === 'Alice').props.onPress();
  assert.deepEqual(calls, [['bot', 'a', 'bots']]);
  nodes = elements(mounted.render(props));
  assert.equal(nodes.find(node => node.type === 'PageHeader').props.title, 'Bots');
  assert.equal(nodes.some(node => node.type === 'Button' && node.props.title === 'Open chat'), false);
  let pops = 0;
  const profile = mountComponent('screens/TeamScreen', sharedMocks);
  const tree = profile.render({ ...props, initialId: 'a', initialPage: 'model', onBack: () => { pops++; } });
  elements(tree).find(node => node.type === 'PageHeader').props.onBack();
  assert.equal(pops, 1);
  assert.equal(calls.length, 1);
});

test('Settings delegates Appearance and tools children to native routes and its header pops', () => {
  const mocks = {
    ...sharedMocks,
    '../features': { UsagePanel: 'UsagePanel', SchedulesPanel: 'SchedulesPanel' },
    '../host-settings/AboutPanel': { AboutPanel: 'AboutPanel' },
    '../host-settings/PluginUpdateCard': { PluginUpdateCard: 'PluginUpdateCard' },
    '../host-settings/CapabilitiesPanel': { CapabilitiesPanel: 'CapabilitiesPanel' },
    '../host-settings/SkillsPanel': { SkillsPanel: 'SkillsPanel' },
    '../host-settings/PluginsPanel': { PluginsPanel: 'PluginsPanel' },
    '../components/NotificationsPanel': { NotificationsPanel: 'NotificationsPanel' },
    '../host-settings/HostSettingsPanel': { HostSettingsPanel: 'HostSettingsPanel' },
    '../storage': {}, '../theme': { useTheme: () => ({}), THEMES: {} },
    '../components/BotAvatar': { inks: Object.fromEntries(['deepseek', 'charcoal', 'graphite', 'rose', 'sky', 'tangerine', 'cobalt'].map(name => [name, ['#000000', '#ffffff']])) },
  };
  const calls: string[] = [];
  const props = { client: {}, host: { url: 'https://fixture.invalid' }, team: { mobileCapabilities: { skills: true }, prefs: {} }, online: true, onNavigatePage: (page: string) => calls.push(page) };
  const mounted = mountComponent('screens/SettingsScreen', mocks);
  let nodes = elements(mounted.render(props));
  nodes.find(node => node.type === 'SettingRow' && node.props.title === 'Appearance').props.onPress();
  assert.deepEqual(calls, ['general']);
  nodes = elements(mounted.render(props));
  assert.equal(nodes.some(node => node.type === 'SettingRow' && node.props.title === 'Appearance'), true);
  const tools = mountComponent('screens/SettingsScreen', mocks);
  nodes = elements(tools.render({ ...props, initialPage: 'tools' }));
  nodes.find(node => node.type === 'SettingRow' && node.props.title === 'Skills').props.onPress();
  assert.deepEqual(calls, ['general', 'skills']);
  let pops = 0;
  const appearance = mountComponent('screens/SettingsScreen', mocks);
  nodes = elements(appearance.render({ ...props, initialPage: 'general', onBack: () => { pops++; } }));
  nodes.find(node => node.type === 'PageHeader').props.onBack();
  assert.equal(pops, 1);
  assert.deepEqual(calls, ['general', 'skills']);
});
