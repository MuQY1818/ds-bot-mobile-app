import assert from 'node:assert/strict';
import test from 'node:test';
import { backgroundNotificationLink } from '../src/logic/notifications.ts';

test('native notification links preserve encoded conversation IDs without allowing other link actions', () => {
  assert.deepEqual(backgroundNotificationLink('dsbot://notification?serverId=server-one&conversationId=agent%3Aone%3Asession%2Ftwo&notificationId=42'), {serverId:'server-one',conversationId:'agent:one:session/two',notificationId:42});
  for (const value of [null, 'https://notification?serverId=s&conversationId=c&notificationId=1', 'dsbot://pair?serverId=s&conversationId=c&notificationId=1', 'dsbot://notification/delete?serverId=s&conversationId=c&notificationId=1', 'dsbot://user:pass@notification?serverId=s&conversationId=c&notificationId=1', 'dsbot://notification?serverId=s&conversationId=c&notificationId=9007199254740992', 'dsbot://notification?serverId=s&notificationId=1', 'dsbot://notification?serverId=s&conversationId=c&notificationId=-1']) assert.equal(backgroundNotificationLink(value),null);
});
