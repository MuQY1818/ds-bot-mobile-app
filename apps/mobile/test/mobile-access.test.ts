import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { mobileActionAllowed, mobilePanelAllowed, notificationAccess, mobileCancelAllowed, mobileMediaAllowed } from '../src/logic/mobile-access.ts';
import { supportsMobileAction } from '../src/logic/mobile-capabilities.ts';
import { conversationStreams } from '../src/logic/conversation-streams.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const minimal = { send: true, history: true, groups: true, cancel: false, notifications: false, actions: [] };

test('group chat visibility never grants group management or progress endpoints', () => {
  for (const action of ['create-room','update-room','delete-room','stop-member-work','room-progress']) {
    assert.equal(mobileActionAllowed(minimal, action), false);
    assert.equal(mobileActionAllowed({ groups: true }, action), false);
  }
  assert.equal(mobileActionAllowed({ groups: true, actions: ['room-progress'] }, 'room-progress'), true);
  assert.equal(mobileActionAllowed({ groupManagement: false, actions: ['update-room'] }, 'update-room'), false);
});

test('legacy feature flags enable their own operations and explicit allowlists remain authoritative', () => {
  for (const [feature, action] of [['queue','queue'], ['notifications','notifications-list'], ['groupProgress','room-progress'], ['memory','memory-view'], ['schedules','schedules'], ['usage','usage'], ['references','reference-chats']] as const) {
    assert.equal(mobileActionAllowed({ [feature]: true }, action), true);
    assert.equal(mobileActionAllowed({ [feature]: true, actions: [] }, action), false);
    assert.equal(mobileActionAllowed({ [feature]: false, actions: [action] }, action), false);
    assert.equal(mobileActionAllowed({ actions: [action] }, action), true);
  }
  assert.equal(supportsMobileAction({modelSelection:true}, 'update-bot', 'modelSelection'), true);
  assert.equal(mobileActionAllowed({}, 'queue'), false);
  assert.equal(mobileActionAllowed({queue:true,actions:false}, 'queue'), false);
  assert.equal(mobileActionAllowed({groups:true,groupManagement:true,actions:false}, 'update-room'), false);
});

test('restored settings routes require all panel operations before mounting optional panels', () => {
  for (const panel of ['notifications','usage','schedules','skills','plugins','capabilities','connectors','secrets','feedback','harness','updates','tools']) {
    assert.equal(mobilePanelAllowed(minimal, panel), false, panel);
  }
  for (const panel of ['index','general','mobile','about']) assert.equal(mobilePanelAllowed(minimal, panel), true);
  assert.equal(mobilePanelAllowed({actions:['skills-list']}, 'skills'), false);
  assert.equal(mobilePanelAllowed({skills:true}, 'skills'), true);
  assert.equal(mobilePanelAllowed({actions:['bot-capability']}, 'capabilities'), true);
  assert.equal(mobilePanelAllowed({actions:['usage']}, 'usage'), true);
  assert.equal(mobilePanelAllowed({actions:['schedules','schedule-create','schedule-delete']}, 'schedules'), true);
});

test('notification transport rights and media endpoints are independent', () => {
  assert.deepEqual(notificationAccess(minimal), {list:false,push:false,background:false});
  assert.deepEqual(notificationAccess({actions:['notifications-list']}), {list:true,push:false,background:false});
  assert.deepEqual(notificationAccess({notifications:true}), {list:true,push:true,background:true});
  assert.equal(mobileMediaAllowed({images:true,files:false}, 'images'), true);
  assert.equal(mobileMediaAllowed({images:true,files:false}, 'files'), false);
  assert.equal(mobileMediaAllowed({}, 'transcription'), false);
  assert.equal(mobileCancelAllowed(minimal), false);
  assert.equal(mobileCancelAllowed({cancel:true,actions:[]}), true);
  assert.equal(mobileCancelAllowed({actions:['queue']}), true);
  assert.equal(mobileCancelAllowed({cancel:false,actions:['queue']}), false);
});

function mountHook(file: string, mocks: Record<string, unknown>, directory = 'hooks') {
  const effects: Array<() => void | (() => void)> = [];
  const cleanups: Array<() => void> = [];
  const react = {
    createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) { return {type,props:{...props,children}}; },
    useEffect(fn: () => void | (() => void)) { effects.push(fn); },
    useState(value: unknown) { return [typeof value === 'function' ? value() : value, () => {}]; },
    useRef(value: unknown) { return {current:value}; },
    useCallback(fn: unknown) { return fn; },
  };
  const module = {exports:{} as Record<string, (...args: any[]) => any>};
  const source = readFileSync(new URL('../src/' + directory + '/' + file + (directory === 'hooks' ? '.ts' : '.tsx'), import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  runInNewContext(output, {
    module, exports:module.exports,
    require(name: string) {
      if (name === 'react') return react;
      if (name === '../logic/mobile-access') return {mobileActionAllowed,mobilePanelAllowed,notificationAccess,mobileCancelAllowed};
      if (name in mocks) return mocks[name];
      throw new Error('Unexpected import ' + name);
    },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}, AbortController,
  });
  return {
    hook:module.exports[file],
    async run() { for (const effect of effects) { const cleanup=effect(); if(cleanup)cleanups.push(cleanup); } for(let i=0;i<12;i++)await Promise.resolve(); },
    dispose() { for (const cleanup of cleanups) cleanup(); },
  };
}
const native = {AppState:{currentState:'active',addEventListener:()=>({remove(){}})}};
const storage = {
  readCache:async()=>null, writeCache:async()=>{},
  cache:{getMessages:async()=>[],getDraft:async()=>'',setDraft:async()=>{}}, tokenStore:{get:async()=>null},
};

test('conversation hook never requests queue on minimal bridge and still connects text history', async () => {
  for (const capabilities of [minimal, {queue:true}, {actions:['queue']}]) {
    const calls:string[]=[];
    const client={messages:async()=>{calls.push('messages');return {messages:[],cursor:null};},connect:()=>{calls.push('connect');return {close(){}};},action:async(name:string)=>{calls.push(name);return {items:[],sessionId:'s'};}};
    const mounted=mountHook('useConversation',{'react-native':native,'expo-crypto':{},'@ds-bot/mobile-sdk':{mergeMessages:()=>[]},'../storage':storage,'../types':{errorText:String},'../logic/submissions':{},'../logic/conversation-streams':{conversationStreams},'../components/ScreenActivity':{useScreenActivity:()=>true}});
    mounted.hook(client,{serverId:'test'},'bot:a',capabilities);
    await mounted.run();
    assert.equal(calls.includes('queue'), capabilities !== minimal);
    assert.equal(calls.includes('messages'), true);
    assert.equal(calls.includes('connect'), true);
    mounted.dispose();
    conversationStreams.clear(client as any);
  }
});

test('notification hook skips unsupported inbox and transport registration without a request', async () => {
  for (const capabilities of [minimal, {actions:['notifications-list']}]) {
    const calls:string[]=[];
    const client={action:async(name:string)=>{calls.push(name);return {items:[],cursor:0,pushRegistered:false,preferences:{enabled:true,categories:[],readThrough:0}};}};
    const mounted=mountHook('useNotifications', {
      'react-native':native,'@ds-bot/mobile-sdk':{},'../i18n':{useI18n:()=>({locale:'zh'}),tr:(s:string)=>s},
      '../logic/notifications':{},'../storage':storage,
      '../media/notifications':{notificationResponses:()=>()=>{},localNotificationsAllowed:async()=>true},
      '../media/background-notifications':{syncBackgroundLanguage:async()=>{},backgroundNotificationsAvailable:true,advanceBackgroundCursor:async()=>{},stopBackgroundNotifications:async()=>{}},
    });
    mounted.hook(client,'test',true,()=>{},undefined,capabilities);
    await mounted.run();
    assert.deepEqual(calls, capabilities === minimal ? [] : ['notifications-list']);
    mounted.dispose();
  }
});


const ui = Object.fromEntries(['Button','Card','Field','Icon','IconButton','Label','Notice','PageHeader','Section','SettingRow','Sheet','Tag','ToggleRow','styles'].map(key => [key, key === 'styles' ? {} : key]));
const i18n = {useI18n:()=>({locale:'zh',tr:(s:string)=>s}),tr:(s:string)=>s};
const theme = {useTheme:()=>({}),THEMES:{}};

test('group progress polling requires its own action, independently of group chat support', async () => {
  for (const capabilities of [minimal, {actions:['room-progress']}]) {
    const calls:string[]=[];
    const mounted=mountHook('GroupProgress', {
      'react-native':{...native,Text:'Text',View:'View'},'../types':{errorText:String},'../theme':theme,'../i18n':i18n,
      './BotAvatar':{BotAvatar:'BotAvatar'},'./UI':ui,'./WorkCapsule':{WorkCapsule:'WorkCapsule'},
      '../logic/group-work':{groupWorkMembers:()=>[],workDescription:()=>''},
    },'components');
    mounted.hook({client:{action:async(name:string)=>{calls.push(name);return [];}},room:{id:'r',members:[]},team:{mobileCapabilities:capabilities},online:true,running:true});
    await mounted.run();
    assert.deepEqual(calls, capabilities === minimal ? [] : ['room-progress']);
    mounted.dispose();
  }
});

function elements(value:any):any[] {
  if(Array.isArray(value))return value.flatMap(elements);
  if(!value || typeof value !== 'object')return [];
  return [value,...elements(value.props?.children)];
}

test('an unsupported restored settings route cannot mount its network panel', () => {
  const mocks = {
    'react-native':{Platform:{OS:'ios'},ScrollView:'ScrollView',Switch:'Switch',Text:'Text',View:'View'},
    '../components/Motion':{AnimatedPressable:'Pressable',PageTransition:'PageTransition'},
    '../components/UI':ui,'../components/BotAvatar':{inks:{}},'../features':{UsagePanel:'UsagePanel',SchedulesPanel:'SchedulesPanel'},
    '../host-settings/AboutPanel':{AboutPanel:'AboutPanel'},'../host-settings/PluginUpdateCard':{PluginUpdateCard:'PluginUpdateCard'},
    '../host-settings/CapabilitiesPanel':{CapabilitiesPanel:'CapabilitiesPanel'},'../host-settings/SkillsPanel':{SkillsPanel:'SkillsPanel'},
    '../host-settings/PluginsPanel':{PluginsPanel:'PluginsPanel'},'../components/NotificationsPanel':{NotificationsPanel:'NotificationsPanel'},
    '../host-settings/HostSettingsPanel':{HostSettingsPanel:'HostSettingsPanel'},'../storage':storage,'../types':{errorText:String},'../theme':theme,'../i18n':i18n,
  };
  for (const capabilities of [minimal, {actions:['usage']}]) {
    const mounted=mountHook('SettingsScreen',mocks,'screens');
    const tree=mounted.hook({client:{},host:{url:'https://test.invalid'},team:{mobileCapabilities:capabilities},online:true,initialPage:'usage'});
    assert.equal(elements(tree).some(node=>node.type==='UsagePanel'), capabilities !== minimal);
  }
});

test('group details keep members and chat while unsupported management widgets stay unmounted', () => {
  const mocks = {
    'react-native':{ScrollView:'ScrollView',Text:'Text',View:'View'},
    '../components/Motion':{AnimatedPressable:'Pressable',PageTransition:'PageTransition'},
    '../components/UI':ui,'../components/BotAvatar':{BotAvatar:'BotAvatar',RoomAvatar:'RoomAvatar',defaultColor:()=>'',defaultShape:()=>''},
    '../components/WorkingFolderPicker':{WorkingFolderPicker:'WorkingFolderPicker'},
    '../components/AvatarEditor':{AvatarEditor:'AvatarEditor'},'../components/ThinkingLevelPicker':{ThinkingLevelPicker:'ThinkingLevelPicker'},
    '../components/ApprovalCards':{ApprovalCards:'ApprovalCards'},'../components/GroupProgress':{GroupProgress:'GroupProgress'},
    '../features':{MemoryPanel:'MemoryPanel',SchedulesPanel:'SchedulesPanel'},
    '../host-settings/CapabilitiesPanel':{BotCapabilities:'BotCapabilities'},
    '../types':{errorText:String},'../theme':theme,'../i18n':i18n,'../logic/mobile-capabilities':{supportsMobileAction},
  };
  for (const capabilities of [minimal, {actions:['update-room','folders','folder-list','approvals','approval-resolve']}]) {
    let opened='';
    const mounted=mountHook('TeamScreen',mocks,'screens');
    const tree=mounted.hook({client:{},team:{mobileCapabilities:capabilities,bots:[{id:'a',name:'Alice'}],rooms:[{id:'r',name:'Room',members:['a']}],models:[]},initialSection:'groups',initialId:'r',online:true,openConversation:(id:string)=>{opened=id;}});
    const nodes=elements(tree);
    assert.equal(nodes.some(node=>node.type==='WorkingFolderPicker'), capabilities !== minimal);
    assert.equal(nodes.some(node=>node.type==='ApprovalCards'), capabilities !== minimal);
    assert.equal(nodes.some(node=>node.props?.title==='Alice'), true);
    nodes.find(node=>node.type==='Button' && node.props.title==='Open chat').props.onPress();
    assert.equal(opened,'r');
  }
});
