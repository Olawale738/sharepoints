import * as Ably from "ably";

export type RealtimeScopeKind = "channel" | "direct" | "organization" | "notifications";

export function realtimeChannelName(kind: RealtimeScopeKind, scopeId: string) {
  return `letw:${kind}:${scopeId}`;
}

function getRealtimeClient() {
  const key = process.env.ABLY_API_KEY;

  if (!key) {
    return null;
  }

  return new Ably.Rest({ key });
}

export function isRealtimeConfigured() {
  return Boolean(process.env.ABLY_API_KEY);
}

export async function publishRealtime(
  kind: RealtimeScopeKind,
  scopeId: string,
  event: string,
  data: unknown
) {
  const client = getRealtimeClient();

  if (!client) {
    return false;
  }

  await client.channels.get(realtimeChannelName(kind, scopeId)).publish(event, data);
  return true;
}

export async function createRealtimeToken(userId: string, capabilities: string[]) {
  const client = getRealtimeClient();

  if (!client) {
    return null;
  }

  return client.auth.requestToken({
    clientId: userId,
    capability: Object.fromEntries(capabilities.map((channel) => [channel, ["subscribe", "presence"]]))
  });
}
