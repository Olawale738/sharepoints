import { strict as assert } from "node:assert";
import test from "node:test";

import { chatCollaborationSchema, createChatMessageSchema, createDirectMessageSchema } from "@/lib/validators";

const legacyMessageId = "cmq53oc6c000au3hshs9ixg8l-welcome";

test("chat message schemas accept legacy system message IDs", () => {
  assert.equal(
    createChatMessageSchema.safeParse({
      body: "Forwarded message",
      forwardedFromId: legacyMessageId
    }).success,
    true
  );
  assert.equal(
    createDirectMessageSchema.safeParse({
      body: "Reply",
      replyToId: legacyMessageId
    }).success,
    true
  );
  assert.equal(
    chatCollaborationSchema.safeParse({
      action: "BOOKMARK",
      messageKind: "channel",
      messageId: legacyMessageId
    }).success,
    true
  );
});

test("chat message schemas reject unsafe identifiers", () => {
  assert.equal(
    createChatMessageSchema.safeParse({
      body: "Forwarded message",
      forwardedFromId: "../../unsafe"
    }).success,
    false
  );
});
