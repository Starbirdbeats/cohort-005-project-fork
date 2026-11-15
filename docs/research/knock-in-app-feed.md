# How does Knock work for an in-app feed and toasts in a React Router app?

Research for [#4](https://github.com/Starbirdbeats/cohort-005-project-fork/issues/4), child of the map [#2](https://github.com/Starbirdbeats/cohort-005-project-fork/issues/2). Sources are Knock's own docs, its GitHub repos (`knocklabs/javascript`, `knocklabs/knock-node`) and the npm registry, read on 2026-11-15. Nothing was signed up for and no keys were used. Prices and limits change, so re-check them before signing up.

## Short answer

Knock fits the in-app feed. The server triggers workflows with `@knocklabs/node`; the browser shows the feed with `@knocklabs/react`. Three things to plan for:

1. **There is no ready-made toast component.** Toasts are built by listening for a real-time feed event and rendering with a toast library (Knock's own example uses `react-hot-toast`) [T1].
2. **The React SDK has no SSR handling.** `KnockProvider` creates and authenticates the client during render, and the default sends a user-identify call [S1, S2, S3]. Under React Router SSR, mount it client-only or turn it off until hydration (see "React Router v7 SSR").
3. **Production needs enhanced security mode.** The client then needs a signed (RS256) user token from our server [A1].

## Facts

### Server-side workflow triggers (Node SDK)

- Package `@knocklabs/node`; `npm install @knocklabs/node`. It supports "Node.js 20 LTS or later" [N1].
- Init and trigger [N1]:
  ```ts
  import Knock from '@knocklabs/node';
  const client = new Knock({ apiKey: process.env['KNOCK_API_KEY'] });
  const response = await client.workflows.trigger('dinosaurs-loose', {
    recipients: ['dnedry'],
    data: { dinosaur: 'triceratops' },
  });
  console.log(response.workflow_run_id);
  ```
- Trigger parameters [W1]: `key` (workflow key) and `recipients` are required. Optional: `actor`, `data` (payload up to 10MB), `tenant`, `cancellation_key`, `settings` (`sandbox_mode`, `skip_delay`).
- The call returns a `workflow_run_id` (UUID v4) [W1].
- Idempotency is an `Idempotency-Key` header, not a body field. A retry with the same key within 24 hours returns the original response [W1].
- The Node SDK 1.0 renamed `notify()` to `workflows.trigger()` and `cancellationKey` to `cancellation_key` [N2].
- Use the secret API key (`sk_...`) server-side only [K1].

### Identifying users and keeping properties in sync

- `id` is the only required property. Reserved properties: `name`, `email`, `avatar`, `locale`, `phone_number` (E.164), `timezone`, `created_at`. Custom properties are allowed up to 256 kB total (a direct identify over that returns 422) [I1].
- Three methods [I1]:
  - Direct: `PUT /v1/users/{id}`. In Node SDK 1.0 this is `client.users.update(id, {...})` [N2].
  - Inline: pass user objects instead of ID strings in a trigger's `recipients`. Knock identifies them "before executing any other action".
  - Bulk: `POST /v1/users/bulk/identify`, up to 1,000 users per request, asynchronous (returns a bulk operation to poll) [I2]. The Node method name for it is not documented on that page.
- Identification is an upsert, so existing data is merged [I1].
- Docs advise calling identify when a user signs up or when data like `name` or `email` changes, often in a deferred job, or sending full recipient data with each trigger [I1].
- Users, audiences, objects, messages, logs and so on are per environment and never copied between them [E1]. Every environment needs its own import or inline identification.

### Signed user tokens (enhanced security mode)

- Off by default: a public key alone can then authenticate any user. Docs: "Production environments should enable enhanced security mode." In development it can stay off [A1]. The docs mention no plan gating [A1], and the pricing page lists none [P1].
- The signing key is in the dashboard under Platform > API keys. The private key is shown once. Use the base-64 PEM format; the plain PEM format produces the error `secretOrPrivateKey must be an asymmetric key when using RS256`. Convention: store it as `KNOCK_SIGNING_KEY` [A1].
- Token is an RS256 JWT with claims `sub` (required, the user id), `iat` and `exp` (recommended). Optional `grants` and `explicit_grants` narrow access [A1].
- Sign in Node with `import { signUserToken } from "@knocklabs/node/lib/tokenSigner"`; the default expiry is 3600 seconds [A1, N2].
- Pass it to the client as `userToken` on `KnockProvider` [A1]. Docs suggest matching token expiry to session expiry, or using a short token plus `onUserTokenExpiring` to refresh. The client default is to call it 30,000 ms before expiry [A1, S3].
- The provider source recommends gating on `Boolean(userId && userToken)` via `enabled` so a token that hasn't loaded yet doesn't cause 401s [RM1, S2].
- Rate limits are scoped per environment, and by signing user when a signed token is used [R1].

### React in-app feed components

- Package `@knocklabs/react` 0.15.1 (MIT). Peer deps: `react`/`react-dom` 17 to 19; `next` and `@tanstack/react-router` are optional. Dependencies include `@knocklabs/client`, `@knocklabs/react-core`, Radix primitives, `lucide-react` and Telegraph UI packages [NPM1]. It is for React on the web only [RM1].
- Setup [F1]: `import "@knocklabs/react/dist/index.css";`, then:
  ```jsx
  <KnockProvider apiKey={PUBLIC_KEY} user={{ id: user.id }} userToken={token}>
    <KnockFeedProvider feedId={FEED_CHANNEL_ID}>
      <NotificationIconButton ref={btnRef} onClick={() => setOpen(!open)} />
      <NotificationFeedPopover buttonRef={btnRef} isVisible={open} onClose={() => setOpen(false)} />
    </KnockFeedProvider>
  </KnockProvider>
  ```
  Components: `NotificationIconButton` (bell with count; `badgeCountType="unread"` switches from unseen to unread), `NotificationFeedPopover`, `NotificationFeed` (full list) [F1, O1].
- `KnockFeedProvider` takes `feedId`, `defaultFeedOptions` and `colorMode` (default `"light"`); the user comes from the parent Knock client [F1, S4].
- Headless option: `useAuthenticatedKnockClient`, `useNotifications(knock, feedChannelId, options?)` (returns a `Feed` client), `useNotificationStore(feedClient)` (gives `items` and `metadata`) [RM1, H1, H2].
  - `metadata.unread_count` and `unseen_count` drive badges; unseen usually drives the badge.
  - With headless hooks you must mark items yourself: `feedClient.markAllAsSeen()` when the feed opens, `markAsSeen(item)` per item [H1].
  - `{ mode: "rich" }` as the third `useNotifications` argument returns the full payload per item (default is `compact`) [H1].
- Feed API facts [API1]: reverse-chronological items, filterable by tenant, archived status and `data`; archived are excluded by default. Items carry `seen_at`, `read_at`, `archived_at`, `link_clicked_at`. `FeedMetadata` returns `total_count`, `unread_count`, `unseen_count`.

### Toasts

- There are no out-of-the-box toast components in `@knocklabs/react` [T1].
- Knock's recipe [T1]: install `react-hot-toast`; inside `KnockProvider` and `KnockFeedProvider`, call `useKnockFeed()` to get `feedClient`; bind `feedClient.on("items.received.realtime", handler)`; in the handler call `toast.custom(...)` per item, rendering the item's HTML (`notification.blocks[0].rendered`) and optionally calling `feedClient.markAsSeen(items)`; unbind with `feedClient.off` on unmount. Each batch can hold several items.
- That recipe renders Knock's pre-rendered block HTML with `dangerouslySetInnerHTML`. For Cadence we would likely render our own markup from the item's `data` instead (not covered by the docs; our choice).
- The doc shows only `react-hot-toast`. Other libraries would follow the same listener pattern, but Knock does not document that.

### Styling (Tailwind and shadcn/ui)

- Prebuilt components: override CSS variables prefixed `--rnf-` (full list in `theme.css`), set `colorMode="dark"`, or replace Knock's stylesheet entirely; all feed classes start with `rnf-` [F1].
- Headless hooks let us build the bell, list and toast from shadcn/ui parts (Popover, Badge and so on) with Tailwind classes [H1, O1].
- I found no Knock documentation on Tailwind or shadcn/ui specifically.
- The prebuilt UI pulls in Radix and Telegraph packages and a stylesheet [NPM1]. Headless avoids that.

### Real-time updates

- A managed websocket delivers new messages for a feed channel. The `new-message` socket event carries updated badge metadata, not the full message, and events "might be throttled" [API1, SB1].
- SDK events: `items.received.realtime` on the feed client for new items [T1].
- Options [F1, SB1]:
  - `auto_manage_socket_connection` disconnects sockets in inactive tabs and reconnects when they become active. Delay defaults to 2000 ms (`auto_manage_socket_connection_delay`).
  - `__experimentalCrossBrowserUpdates` in `defaultFeedOptions` syncs tabs through a BroadcastChannel (experimental).

### React Router v7 SSR (client-only rendering concerns)

Knock documents no SSR, React Router or Remix guidance: the React overview and README don't mention SSR [O1, RM1]. The only framework-specific entry points are `./next` and `./tanstack` exports [NPM1]; `./next` exports only `KnockGuideLocationSensor` [SRC1]. What the source shows (main branch, read 2026-11-15):

- `KnockProvider` calls `useAuthenticatedKnockClient` during render [S1, S2].
- That hook calls `authenticate` inside a `useMemo` (render phase, not an effect) and tears down only in an unmount effect. No `typeof window` guard anywhere in it [S2].
- `Knock.authenticate` defaults to `identificationStrategy: "inline"`, which calls `user.identify(...)` (a network call) with the user's properties. `"skip"` returns early [S3].
- `enabled={false}` is documented as "no identify call, no API requests, and no websocket", and children still render [RM1, S1].
- The `useMemo` path means a server render of `KnockProvider` with `enabled` true will run `authenticate`, and so the inline identify, on the server. That is my reading of the source; I did not run it.

Practical consequences for Cadence:
- Keep Knock UI out of the server pass: render `KnockProvider` with `enabled={hydrated && Boolean(user && token)}`, or lazy-import it after hydration. The README recommends `enabled` over conditional mounting [RM1].
- Consider `identificationStrategy="skip"` if the server keeps users in sync itself, which avoids client-side identify calls with the public key [S3].
- Keep `user`, `userToken` and callbacks referentially stable. The provider keys feed state off user and options, and changes remount or rebuild the feed [S2, S4].
- The first server paint has no feed items or badge; they appear after hydration and fetch.
- The token and feed channel ID have to reach the browser: pass them from a root loader. The public key and feed ID are public; the token is per user [A1, K1].

### Recipients and fan-out to many users

- Recipient types in a trigger: a user ID string, an object reference (`{ id, collection }`), or an inline object that identifies the recipient [W1, RC1].
- Up to 1,000 recipients per trigger call. Bulk trigger requests are not supported; per-recipient data goes in `$trigger_data` [W1].
- Subscriptions: triggering for an object creates a run for the object and one per subscriber, deduplicated; the actor is always excluded if they subscribe. No cap on subscribers; the API adds or removes up to 100 recipients per request. Node methods: `objects.addSubscriptions`, `deleteSubscriptions`, `listSubscriptions`, `users.getSubscriptions` [SUB1].
- Audiences: a workflow can be triggered when a user joins an audience (one audience per workflow, only new members trigger it) [AU1].
- Broadcasts: one-time sends to an audience, all users, or a CSV, created in the dashboard; not callable via the API and not for objects [BR1].
- Each recipient on each channel is one billable message [P1], so fan-out multiplies message counts.

### Batch function

- Groups a recipient's repeated triggers into one message. Each new trigger is added to the open batch as an activity and its own run ends [B1].
- Default key is `recipient_id`; a batch key (for example `{{data.eventType}}-{{actor.id}}`) splits batches [B1].
- Window: fixed, dynamic (variable), relative, or sliding; at most 90 days open [B1].
- Optional max activity limit of 2 to 1000 closes the batch early [B1].
- Templates get `total_activities`, `total_actors`, and up to 10 `activities` and `actors` (first or last); raising that to 100 needs Enterprise. Batch `data` is flattened to scalars with strings capped at 256 characters [B1].
- Per-recipient windows and timezones are not supported [B1].
- Not documented on that page: how batching behaves for the in-app feed specifically. Check in the dashboard before relying on it.

### Development vs production environments

- Every account starts with production. Enabling environments adds development [E1].
- Each environment has its own public and secret API key pair [E1, K1]. Channel provider credentials are not copied into a new environment [E1]. Keys are `pk_` (public, fine in client code) and `sk_` (secret) [K1].
- Workflows, guides, layouts, partials and translations are version-controlled: commit in development, promote to production under the same key [E1].
- Users, audiences, objects, messages and logs are per environment [E1].
- Enhanced security can stay off in development and should be on in production [A1].
- The environments page does not say how feed channel IDs map across environments, nor which plans allow environments beyond development and production. The pricing page says the Free plan has unlimited environments [P1]. Treat the feed channel ID and public key as per-environment config.

### Free-tier limits (Free plan)

From [P1]:
- $0/month. 10,000 messages a month. The page says Knock does not hard-cap messages and will contact you about billing; overage terms for Free are not listed.
- Unlimited environments, channels, stored profiles, team members, workflows, triggers and broadcasts.
- 500 guide recipients and 500 agent credits a month (not relevant to feed-only use).
- Log retention 30 days. Feed retention unlimited. 99.9% uptime SLA. No priority support.
- Not included on Free: removing Knock branding, email client previews, SAML SSO, SCIM, audit logs, per-tenant features.
- Next tier: Starter $250/month with 50,000 messages, then $0.005 per message.
- A billable message is "a single message delivered to a single user on a single channel". In-app plus email from one workflow is 2. Messages blocked by preferences and bounced or failed messages are not billed. Billing is on messages sent, not workflows triggered.
- Rate limits: five per-second tiers (1, 5, 60, 200, 1,000 requests), scoped per endpoint per environment; a limited request gets `429`. The docs page does not map endpoints to tiers [R1].

## Not verified

- When the feed websocket actually opens (`useNotifications` and `listenForUpdates` internals), and whether anything touches the network during a server render beyond the identify call above. The doc pages and source files fetched don't say; I did not read the `useNotifications` source or run a server render.
- Whether constructing `Knock` in Node (no `window`) throws. Not stated anywhere I read.
- Exact per-endpoint rate limits for trigger, identify and feed.
- Whether the `--rnf-` CSS variables are enough for a shadcn look, or what any shadcn integration looks like. No Knock source covers it.
- Batch function behavior for in-app feed items.
- Whether the Free plan allows enhanced security mode. Neither the docs nor the pricing page gate it, but neither says it is included.
- The Node SDK method name for bulk identify.
- Pages were fetched through a summarizing tool, so verbatim code and numbers should be spot-checked against the pages before we build on them. Student-project GitHub issues that turned up in web search were ignored because they are not primary sources.

## Sources

- [P1] Knock pricing, https://knock.app/pricing
- [N1] knock-node README, https://github.com/knocklabs/knock-node
- [N2] Node SDK 1.0 migration guide, https://docs.knock.app/developer-tools/migration-guides/node.md
- [W1] Triggering workflows via the API, https://docs.knock.app/send-notifications/triggering-workflows/api
- [I1] Identifying recipients, https://docs.knock.app/managing-recipients/identifying-recipients
- [I2] Bulk identify users, https://docs.knock.app/api-reference/users/bulk/identify.md
- [A1] Security and authentication, https://docs.knock.app/in-app-ui/security-and-authentication
- [K1] API keys, https://docs.knock.app/developer-tools/api-keys.md
- [O1] React overview, https://docs.knock.app/in-app-ui/react/overview
- [F1] React feed, https://docs.knock.app/in-app-ui/react/feed
- [T1] React toasts, https://docs.knock.app/in-app-ui/react/toasts
- [H1] React headless feed, https://docs.knock.app/in-app-ui/react/headless/feed.md
- [H2] useNotifications hook, https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notifications.md
- [API1] In-app feed API overview, https://docs.knock.app/in-app-ui/api-overview
- [SB1] Socket behavior, https://docs.knock.app/in-app-ui/feeds/socket-behavior.md
- [RM1] `@knocklabs/react` README, https://github.com/knocklabs/javascript/tree/main/packages/react
- [NPM1] `@knocklabs/react` on npm, https://registry.npmjs.org/@knocklabs/react/latest
- [S1] `KnockProvider.tsx`, https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/context/KnockProvider.tsx
- [S2] `useAuthenticatedKnockClient.ts`, https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts
- [S3] `knock.ts` (`authenticate`), https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts
- [S4] `KnockFeedProvider.tsx`, https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/feed/context/KnockFeedProvider.tsx
- [SRC1] `packages/react/src/next/index.ts`, https://github.com/knocklabs/javascript/blob/main/packages/react/src/next/index.ts
- [RC1] Recipients, https://docs.knock.app/concepts/recipients
- [SUB1] Subscriptions, https://docs.knock.app/concepts/subscriptions.md
- [AU1] Triggering for an audience, https://docs.knock.app/send-notifications/triggering-workflows/audiences.md
- [BR1] Broadcasts, https://docs.knock.app/concepts/broadcasts.md
- [B1] Batch function, https://docs.knock.app/designing-workflows/batch-function
- [E1] Environments, https://docs.knock.app/concepts/environments
- [R1] Rate limits, https://docs.knock.app/api-reference/overview/rate-limits.md
