---
id: whatsapp-operations
title: WhatsApp operations
sidebar_label: WhatsApp
description: Connecting a provider, rollout modes, consent, PIN policy, caps, and the monitoring pages for the WhatsApp channel.
residio_sources:
  - src/lib/whatsapp/**
  - src/actions/whatsapp/**
  - src/app/(dashboard)/settings/whatsapp/**
  - src/app/(dashboard)/settings/whatsapp-admin/**
  - src/app/(dashboard)/system/whatsapp-monitoring/**
  - src/app/(dashboard)/system/whatsapp-bot-health/**
  - src/app/api/whatsapp/**
residio_verified_commit: 5cebefd0
residio_verified_at: '2026-10-29'
residio_app_version: '0.4.0'
---

# WhatsApp operations

Residio connects to the WhatsApp Cloud API so residents can message the estate and receive answers, including balance and payment questions. Because the channel reaches residents directly and can disclose financial information, it ships **disabled** and is promoted deliberately.

All controls are on **Settings → WhatsApp**, and every promotion is audited. The pages that only show activity are in **Oversight**: **WhatsApp activity** and **WhatsApp bot health** (see [Monitoring](#monitoring)).

The Financial PIN policy and opt-in import sit in a **Resident bot** section on that page. It is collapsed and labelled *inactive* unless the WhatsApp channel is on and the rollout mode is not `Disabled`; expand it to reach those controls.

![Residio WhatsApp operations settings showing PIN policy, opt-in import, and rollout controls](../assets/admin/whatsapp-operations.png)

## Connecting a provider

Before any message can be sent, the estate needs a WhatsApp provider connected. This no longer needs a developer or a redeploy — an admin with access to **Settings → WhatsApp** can connect, replace, or disconnect the provider directly from the connection card at the top of the page.

Choose one of four providers. Only one is active at a time — saving a different provider replaces the current one.

The top of the connection card shows the **current provider** and the date it was saved. To switch, select **Change provider**, pick the new provider in the list, and enter its details. Select **Cancel** to leave the saved provider as it is. **Replace credentials** is for the same provider with new keys. The page has a row of jump tabs (Connection, Channel, Rollout and so on) that scroll to each section.

| Provider | Why choose it |
|---|---|
| **Meta** (recommended) | Connects directly to the WhatsApp Cloud API, with no per-message middleman. |
| **Twilio** | Adds a per-message cost on top of WhatsApp's own fees. Worth it mainly if the estate already runs other messaging through Twilio. |
| **Chatmaid** | A WhatsApp Web bridge: it pairs with an ordinary WhatsApp number on a phone you keep connected, rather than using the WhatsApp Cloud API. Worth it when the estate wants to use an existing WhatsApp number. It has no delivery guarantee when the phone is offline — read [Chatmaid: what to know before choosing it](#chatmaid-what-to-know-before-choosing-it). |
| **Self-hosted gateway (WAHA)** | A WhatsApp Web bridge that the estate runs on its own server. It pairs with an ordinary WhatsApp number, like Chatmaid, and has no per-message cost. It has the same limits as Chatmaid when the phone or the session is offline — read [WAHA: what to know before choosing it](#waha-what-to-know-before-choosing-it). |

Whichever provider is chosen, have these details ready before you start:

| Provider | What you need |
|---|---|
| Meta | Access token, phone number ID, verify token, app secret |
| Twilio | Account SID, auth token, a WhatsApp-enabled from-number |
| Chatmaid | API key, webhook signing secret, and the from-number of the paired phone in international format (for example `+2348031234567`) |
| WAHA | API key, webhook secret, server address (`https://` and no trailing slash), session name (`default` unless you chose another), and the from-number of the paired phone in international format |

These all come from the provider's own console, not from Residio. For Chatmaid, enter the paired phone's own number, not the phone ID shown in the Chatmaid dashboard — that ID differs between Chatmaid's test and live environments.

The from-number must not be the number that **Settings → Communications override** redirects WhatsApp to: the WhatsApp number there, or the override phone when the WhatsApp number is blank. A redirected message would be sent to the bridge phone itself and never reach anyone. The connection form shows the conflict under the from-number and disables **Save credentials**. The override form shows the same conflict under its own field and disables **Save**. Existing settings that already clash are not sent: the message is blocked with a reason that names the cause.

### The webhook callback URL

The connection card shows a **webhook callback URL** with a copy button. Paste this into the provider's console so it knows where to deliver incoming messages and status updates.

For Chatmaid, point the webhook at the callback URL shown on the card (it ends in `/api/whatsapp/webhook/chatmaid`). Residio rejects any call that is not signed with the webhook signing secret you saved, so the secret in Chatmaid and the one in Residio must match.

For WAHA, set the webhook in the WAHA session to the callback URL shown on the card (it ends in `/api/whatsapp/webhook/waha`). Subscribe the session to the events `message`, `message.ack` and `session.status`. Set the WAHA webhook HMAC key to the webhook secret you saved in Residio. Residio rejects any call that is not signed with that secret. The WAHA container and the pairing of the phone are set up on the server, not in Residio. The steps are in the runbook of issue #1261.

If you're connecting Meta, the console also asks for a **verify token**. Residio shows this to you once, immediately after you save the connection — copy it into Meta's console at that moment. It cannot be retrieved again afterwards; if you lose it, save the connection again to generate a new one.

:::warning[Copy the verify token immediately]
The Meta verify token is only ever shown once, right after saving. Navigate away before copying it and you will need to reconnect to get a new one.
:::

### Test the connection

Use the **Test connection** button to confirm the saved credentials actually work. Residio makes a lightweight call to the provider and reports back pass or fail. A failure means the provider rejected the stored credentials — double-check the values against the provider's console, particularly the access token, auth token or Chatmaid API key, and try again. It does not mean anything was sent to a resident.

For Chatmaid, the test also checks that the saved from-number is one of the phones paired to the Chatmaid account, and reports that phone's bridge status. It fails if the number is not paired, naming the phones that are, or if the paired phone is not connected to the bridge. Saving Chatmaid credentials runs the same paired-phone check and refuses a from-number that is not paired, or that belongs to a resident who has opted in to WhatsApp — the from-number must be the bridge phone itself.

For WAHA, the test reads the WAHA session. It fails if WAHA rejects the API key, if the session is not `WORKING` (for example `SCAN_QR_CODE`, so the phone is not paired), or if the saved from-number is not the number paired to the session. Saving WAHA credentials does not contact the server, because the phone can be paired after the credentials are saved. Run **Test connection** after you pair the phone.

### How credentials are kept

Secrets — access token, verify token, app secret, auth token, Chatmaid and WAHA API keys, and the Chatmaid and WAHA webhook secrets — are encrypted before they are stored, and Residio never displays them again after saving. The connection card only ever shows whether a credential is set, plus the non-secret details such as the phone number ID or from-number, the WAHA server address and session name, and who last saved the connection.

To change a secret, use **Replace credentials** and enter it again in full; there is no way to view or partially edit a stored secret.

### Disconnecting

**Disconnect** removes the saved connection. Once disconnected, Residio falls back to whatever WhatsApp credentials are set in the deployment's environment variables, if any are configured there. Use this if a connection was set up in error, or while handing a provider account over to a new administrator.

### Twilio: mapping templates to Content SIDs

If the estate uses Twilio, each approved message template also needs a Twilio **Content SID** before it can be sent. Residio only ever sends from a fixed, pre-approved list of template names — the Content SID mapping tells Twilio which of its approved content items corresponds to each of those names. Set this mapping from the connection card once Twilio is connected.

A template with no Content SID mapped fails to send rather than going out as unapproved free text — this is a deliberate compliance guard, not a bug to work around by leaving a mapping blank.

## Chatmaid: what to know before choosing it

Chatmaid works through a phone that stays paired to the bridge, so the estate's WhatsApp service is only as reliable as that phone's connection.

- **Messages are lost while the phone is disconnected.** Anything a resident sends to the number while the bridge is down never reaches Residio, and nothing is recovered when it reconnects. Residents who wrote in during an outage may need to be contacted.
- **Sending needs the bridge connected.** Before each send, Residio checks that the phone is connected; if it is not, the send fails with a "bridge is disconnected" error. (Residio re-checks at most every 30 seconds.)
- **Admins are alerted.** When Chatmaid reports the phone disconnected, admins receive an urgent notification linking to **Settings → WhatsApp**; a normal-priority notification follows when it reconnects. Re-pair the phone in the Chatmaid dashboard to restore service.
- **A sent message is not a delivered message.** Chatmaid accepts a message first and reports later whether it was sent or failed. Residio records each send and its outcome. When three messages fail within 10 minutes, admins receive a notification linking to **Settings → WhatsApp**. A message still unconfirmed 15 minutes after Chatmaid accepted it is treated as undelivered too: admins are notified by the next notification run, which happens every 15 minutes.
- **Urgent messages fall back to SMS (currently off until the SMS provider is connected).** See the SMS fallback section on the Email and SMS page.
- **Human takeover.** If someone on the estate team replies to a resident directly from the phone, the Assistant stays silent in that conversation for 30 minutes so the two do not talk over each other. The resident's messages during that time are still recorded and are not answered later. The one exception is `STOP`, which is honoured even during a takeover: the opt-out is saved and no reply is sent. When a phone number is shared by two or more residents, `STOP` opts out every resident that number matches.

## WAHA: what to know before choosing it

WAHA works through a phone that stays paired to the session, so the same limits as Chatmaid apply. WAHA reports the state of the session as `WORKING`, `STARTING`, `SCAN_QR_CODE`, `STOPPED` or `FAILED`.

- **Messages are lost while the session is down.** Anything a resident sends while the session is not `WORKING` never reaches Residio. Residio reads the WAHA message store every 15 minutes and answers the messages it missed from the last 24 hours, but this works only for messages that WAHA recorded.
- **Sending needs a `WORKING` session.** Before each send, Residio checks the session. If it is not `WORKING`, the send fails with a "bridge is disconnected" error. (Residio re-checks at most every 30 seconds.)
- **Admins are alerted.** When the session changes to `FAILED`, `STOPPED` or `SCAN_QR_CODE`, admins receive an urgent notification linking to **Settings → WhatsApp**. A normal-priority notification follows when the session is `WORKING` again. Re-pair the phone in the WAHA dashboard to restore service.
- **A sent message is not a delivered message.** WAHA reports an acknowledgement for each message. Residio marks a send as sent, delivered or failed from it. When three messages fail within 10 minutes, admins receive a notification. A message still unconfirmed 15 minutes after WAHA accepted it is treated as undelivered too.
- **PDF files.** Residio sends the message text first, then each PDF as a file.
- **No duplicate guard.** WAHA has no idempotency key. If a send is retried after a timeout, the resident can receive the same text twice.
- **Human takeover.** The pause works as for Chatmaid. If someone on the estate team replies from the phone, the Assistant stays silent in that conversation for 30 minutes. `STOP` is still honoured.
- **Hidden sender numbers.** WhatsApp can hide the number of a contact behind an internal `@lid` identifier. Residio asks WAHA for the number behind it and answers the sender as usual. If WAHA does not know the number, Residio does not answer, because it cannot be sure who the sender is. The 15-minute catch-up does not look up these numbers, so a missed message from such a sender is not answered later.
- **Ignored messages leave a reason.** Each message Residio does not answer leaves an `inbound_ignored` row in the System Action Log, with the reason only: `group`, `from_me`, `lid_unresolved`, `other_id`, `no_text` or `human_takeover`. The row holds no phone number and no message text.
- **Failed batches leave a reason.** When Residio cannot process a batch of incoming messages, the `inbound_messages` failure row in the System Action Log names the step that failed (`claim`, `handle` or `release`) and the type of error, never the error text. WAHA then sends the batch again.

## Turning the channel on

Connecting a provider does not by itself let messages flow. A separate **master on/off switch** on the WhatsApp settings page decides whether the channel runs at all — it defaults to **off** and must be switched on deliberately, even after a provider is connected and tested.

This is distinct from the rollout mode described below: the master switch decides *whether the channel runs*; rollout mode decides *who receives messages once it does*. Both must be set correctly for residents to receive anything.

While the switch is off, a resident who writes in gets one reply, "The estate Assistant is offline. Your message is saved and will be answered when it is back.", followed by the estate office contact line. A number gets this reply once until the switch is turned back on, however many messages it sends. When an admin turns the switch on, the saved messages are answered, oldest first and each once. A message saved more than 24 hours earlier is dropped instead of answered. A message that is only digits or starts with `PIN` is never saved, though the holding reply still goes out. Messages during a human takeover are not saved.

## Rollout modes

| Mode | Who receives messages |
|---|---|
| `Disabled` | Nobody. Outbound is blocked entirely. This is the default. |
| `Pilot` | Only named residents, plus every resident on one nominated street. |
| `Estate` | All residents. |

Use **Rollout and pilot controls** to set the mode. In pilot mode you choose a **pilot street** by name, pilot residents by name, or both. A resident who matches either rule is included.

The **Pilot residents** table shows everyone in the pilot: each person chosen by name, plus each resident with an active house on the pilot street. Each row shows the resident code, house and role, the masked WhatsApp number, the consent state, and why the person is in the pilot (**Name**, **Street** or both).

- Search by name, code, house or role. Filter to residents chosen by name, residents from the pilot street, or residents who are not opted in.
- **Add pilot residents** opens a searchable list. Each entry shows the resident code and house, to tell same-name residents apart.
- The remove button removes a resident chosen by name. To remove a street member, change the pilot street.
- Changes apply only when you click **Save rollout controls**. Until then, the page shows that the pilot list changed.

### Promote a pilot to the estate

1. Confirm the pilot has run long enough to see a full billing cycle.
2. Review **Oversight → WhatsApp bot health** for delivery failures and template errors.
3. Confirm the daily and burst caps are sized for the full estate, not the pilot.
4. Change the mode to `Estate`.
5. Record who approved the promotion. The change is written to the audit log.

:::warning[Do not skip the pilot]
Moving straight from `Disabled` to `Estate` sends the first real message to every resident at once. A template error at that point is not recoverable.
:::

## Consent and opt-ins

A resident only receives WhatsApp messages after an approved consent record exists. Invoice reminders and payment confirmations check this when the message is created, so a resident without consent gets no queued message at all (an invoice reminder run reports it as "recipient has not opted in"). The check is repeated at send time.

- **Import opt-ins** loads approved consent records from CSV in bulk.
- **Oversight → WhatsApp activity** lists current opt-ins (the opt-in registry) and any pending contacts awaiting confirmation. The CSV opt-in import stays in Settings → WhatsApp. With the WhatsApp manage permission, each opt-in row has **Issue link code**, **Issue setup code** and **Reset PIN** (see [Issuing codes](#issuing-codes)).

Pending contacts are people who have messaged the number but are not yet matched to a resident record. Resolve them by confirming identity against the resident directory — never by guessing from the phone number alone.

### Identity check and privacy notice

The alerts opt-in above covers messages the estate sends. Before the assistant uses a resident's records to answer them, two more steps run in chat, for every number including imported opt-ins:

1. **Identity read-back.** On the first message from a matched number the assistant replies `This number is registered to <First> <L.> on <Street>. Is that you?` with `1. Yes, that's me` and `2. No, not me`. It asks again if the resident's name or street changes.
2. **Privacy notice.** After `Yes`, the resident gets the full notice as a message in the chat, followed by `_Version X_`, and replies `1. Accept` or `2. Decline`. A request sent before this, such as `OWE`, is answered after Accept, still behind the PIN policy. A resident who declines gets the estate office contact and can reply `ACCEPT` at any time; no records are used until then.

Every decision (identity confirmed or disputed, notice accepted or declined) is logged permanently with the number, the notice version and the WhatsApp message that carried it. `STOP` and `START` keep their meaning for alerts.

**Privacy notice** in the Resident bot section holds the notice text and version. The Assistant name is the **Assistant name** in Settings > Estate > Assistant, or the estate name followed by `Assistant` when that is empty. The Assistant uses it in the welcome to an unmatched number, the survey question, the privacy notice and the session-end message. Changing the version asks every resident to accept again. A text change is refused unless the version changes too, so each accepted version covers one wording. The text is sent in the chat, so WhatsApp formatting (`*bold*`, `_italic_`) works. These placeholders are filled when the message is sent: `{{URL}}` (the public site address from `NEXT_PUBLIC_SITE_URL`), `{{App Name}}` (the estate name), `{{App Assistant}}` (the Assistant name) and `{{Version}}` (the notice version). The Assistant adds the version on its own line after the text, unless the text shows it with `{{Version}}`. If the text has `{{URL}}` and no site address is set, the notice counts as not published and nothing is sent. The notice can link to the public privacy policy at `/privacy-policy`, which needs no sign-in.

If a holder answers **No, not me**, the number is marked **disputed** in Pending contacts, admins are notified, and the assistant shows no details for it. After checking, an admin with WhatsApp manage permission clicks **Clear dispute**; the number then gets the identity read-back again on its next message. A link code does not lift a dispute; only clearing it does.

### Linked numbers

A number linked to a resident (by matching their record or with a link code) keeps that link only while it is still in force:

- **Changing a resident's phone deactivates the old number's link.** When a resident's primary or secondary phone is edited, the links for any number removed from their record stop working. Whoever holds the old number is treated as an unknown contact until it is linked again with a fresh link code.
- **Archived and suspended residents are not answered** over a linked number.
- **Financial answers need a verified link.** A link is verified when the number is the resident's primary or secondary phone, or when it was linked with a link code — for example a spouse's phone. A number linked with a code before this rule shipped keeps its verified link only if its pending-contact record is still attached to that resident; any other number linked that way, if it is not on the resident's record, needs a fresh link code. Any other linked number gets estate announcements and notices only. Archived and suspended residents never get financial answers.
- **Only current residents may use the assistant.** A person needs an active residence as resident landlord, non-resident landlord, tenant, developer or co-resident. Household members, domestic staff, caretakers, contractors and people with no active residence get one reply, "This service is for current residents of \{estate name\}. Please contact the estate office.", at most once every 24 hours; their other messages get no reply. `STOP` still works for them, and the admin WhatsApp flow is not affected.
- **Deactivated links get nothing.** A deactivated link receives no announcements or notices, and shows as **Deactivated** in the opt-in registry. A link code re-activates it.

## Financial PIN policy

**Financial PIN policy** controls whether a PIN is required before Residio answers any financial question over WhatsApp.

- When the policy is **on**, every resident must enter a PIN before a balance, invoice, or payment answer is returned. A resident without a PIN is told to reply `PIN` to set one, which needs a setup code from the estate office.
- When it is **off**, residents may still set a personal PIN, with a setup code, and are then asked for it like everyone else.

The PIN is asked for only when the resident opens Financial standing or one of its items. Greetings, notices, How to pay and the estate office line never ask for it. The prompt is `Enter your 4–6 digit PIN to view your financial standing (e.g. 4821).` The resident can reply with the digits alone, or with `PIN` and the digits. A correct PIN unlocks financial answers for 15 minutes and is answered in one message: `PIN verified. Your financial standing is unlocked for 15 minutes.` followed by the item they picked, or the Financial standing menu. Digits sent when the Assistant has not just asked for the PIN are menu choices, never a PIN try.

The policy is **on** by default. Leave it on for estates where phones are commonly shared.

Wrong PINs lock financial answers in two steps. Both refuse even the correct PIN while they last:

- **3 wrong PINs in a row** lock the PIN for **15 minutes**. The resident is told the time it unlocks, and the lock lifts on its own. A correct PIN before the third wrong one resets the count.
- **6 wrong PINs within 24 hours** lock the PIN until the estate office resets it with **Reset PIN**. This lock never lifts on its own. A correct PIN does not reset this count.

Every wrong-PIN and lock reply ends with the estate office phone, email and office hours from **Settings → Estate info**, or with nothing if neither phone nor email is set.

### Setting a PIN

A resident sets their first PIN with a 6-digit **setup code** from the estate office. Setup codes are issued from the opt-in registry with **Issue setup code**, usually in a batch as each street joins the pilot. Turn the PIN policy on for a street only after its codes are out. Holding the phone is not enough: without a valid code, no PIN can be set.

In the chat, the resident:

1. replies `PIN` (or `Set a security PIN`) and is asked `Enter the 6-digit setup code from the estate office.`;
2. sends the code. Each code allows **3 wrong tries**, then pauses for an hour; an expired, used or replaced code is refused and the resident is sent to the estate office;
3. chooses a 4–6 digit PIN. Easy PINs are refused with `That PIN is too easy to guess. Please choose another 4–6 digit PIN.`: one digit repeated (`0000`), runs (`1234`, `4321`, `123456`), a short block repeated (`1212`, `123123`) and a short denylist such as `2580`;
4. enters the PIN again to confirm. Three mismatches cancel with `Nothing was changed.`, and the code is used up;
5. is told `Your PIN is set ✅ Your financial standing is unlocked for 15 minutes. For privacy, you can delete the messages with your PIN from this chat.`, followed by the Financial standing menu.

`CANCEL`, `MENU`, `0` or any other non-numeric reply leaves these steps without changing anything.

### Changing a PIN

A resident who has a PIN replies `Change PIN` (or `Set a security PIN`), enters their current PIN, then chooses and confirms a new one as above. No setup code is needed. Wrong current PINs count toward the lock like any other wrong PIN.

A resident who has a PIN is never shown a prompt to set one.

### What is kept, and alerts

The code and PINs typed in these steps are never written to a log, the audit log or a reply. A chosen PIN is held, only as a salted hash, until it is confirmed. Where the resident has an email address on their record, Residio emails them each time their PIN is set, changed or reset, naming the WhatsApp number masked. Nothing is sent to residents without an email address.

### Issuing codes

Each opt-in row has two code actions. Both need the WhatsApp manage permission and ask you to confirm the resident's identity first.

| Action | What the code does | Valid for |
|---|---|---|
| **Issue link code** | The resident replies `LINK` followed by the code from a number, and that number is linked to them with financial answers | 15 minutes |
| **Issue setup code** | Lets the resident set their first WhatsApp PIN. Issuing a new one cancels any earlier unused setup code | 10 minutes |

The code is shown **once**, with its expiry, in a dialog with a **Copy** button. Residio stores only a one-way hash of it, so closing the dialog loses it for good: issue a new one if needed. Each code works once. A setup code cannot be used with `LINK`. After 5 wrong link codes within 15 minutes, a number is told **Too many wrong link codes** and even a valid code is refused until the oldest wrong try is 15 minutes old. If the code has expired by then, issue a new one. Issuing a code is written to the audit log without the code. A sponsor can also create a link code for their co-resident in the assistant (see **Link a co-resident** under [What residents see](#what-residents-see)).

**Confirm identity before issuing any code.** Do it in person, or by calling the resident from the estate phone and checking two facts from their record (house number, resident code, last payment amount). A call-back to the WhatsApp number alone does not count.

### Reset PIN

**Reset PIN** on the opt-in row replaces a forgotten PIN or unlocks a resident early. Use it only after confirming identity as above, because whoever receives the new setup code can set the PIN. It asks for confirmation, then:

1. clears the PIN, the wrong-PIN count and any lock;
2. signs the resident's open WhatsApp chats out of the PIN, so the next financial question asks for a PIN again, and cancels any PIN change in progress;
3. issues a setup code, valid for 10 minutes and shown once;
4. emails the resident, when they have an email address, that their PIN was reset.

The reset is written to the audit log. The PIN and the code are never recorded.

## What residents see

Residents reply with numbers or fixed keywords; the Assistant does not interpret free text. A reply that is a final answer (what the resident owes, recent payments, a wallet balance, a receipt or statement) is followed by the menu `0` would open, the Financial menu for a resident in Financial standing, so the next number can be sent straight away. The menu is its own second message, so the answer can be forwarded without it. A reply that still asks for input (a statement period, a receipt pick, the steps to report a payment) keeps its own prompt. A receipt or statement PDF arrives with its plain caption, then the menu.

The main menu opens with `Hi <first name>, what would you like to do?` and lists:

| Item | Shown when |
|---|---|
| 1. Financial standing | The resident is billed for a property. Marked *PIN protected*, or *unlocked* once the PIN is entered |
| 2. Latest estate notices | A published estate-wide announcement exists. Shows the 3 latest; the resident replies with a number to read one in full |
| 3. How to pay | **Payment instructions** is filled in (see below) |
| 4. Alert settings | Always. Turning *All estate WhatsApp messages* off asks `1 Yes, 2 No` first, then works like replying `STOP`. A resident billed for a property also sees *Payment reminders*, ON or OFF |
| 5. Update email | Always |
| 6. Admin tools | The number is linked to an active admin account, or is the phone of the resident record tied to one (see *Admin mode*). Marked *code needed*, or *unlocked* during an admin session |
| 9. Contact the estate office | The estate phone or email is set on **Settings → Estate & Property → Estate Profile** |

Each menu item starts with an icon after its number, for example `1. 💰 Financial standing`. The icons are: main menu 💰 Financial standing, 📢 Latest estate notices, 🏦 How to pay, 🔔 Alert settings, ✉️ Update email, 🛠️ Admin tools, 📞 Contact the estate office. Financial standing (its heading has 💰): 💳 What I owe, 💵 Recent payments, 📄 Statement, 👛 Wallet, 🧾 Receipt, 📤 Report a payment, ✅ Clearance certificate, 👥 Link a co-resident, 🔄 Switch property. Alert settings (its heading has 🔔): 📣 All estate WhatsApp messages, ⏰ Payment reminders. Admin tools (its heading has 🛠️): 🏠 Resident status, 📉 Security debt status, 📊 Today's collections, 📋 Clearance requests waiting. Yes/No questions, the privacy notice and the survey have no icons. The resident still replies with the number only.

**Financial standing** lists What I owe, Recent payments (the last 5, numbered 1 to 5 for reading only), Statement (this month, this year, last 6 months, last 12 months, all time or since move-in), Wallet, Receipt, Report a payment and Clearance certificate. Only this item, and Update email, ask for the PIN. A resident billed for more than one property is asked which one once per session (What I owe asks every time, see below), sees it in every heading, and can change it with **10. Switch property**, which is shown only to a resident billed for more than one property. **8. Link a co-resident** is shown to the resident landlord or tenant of the selected property until one of their co-residents there has linked their number (see below). The keyword `link co-resident` still works after that.

The statement periods depend on the property's move-in date. *All time* is listed only when the resident has an invoice or a payment that the statement would show (paid, and verified when roll-forward is on) for that property dated before the move-in; otherwise there are 5 periods with *Since move-in* as 5, and typing `all time` gives the since move-in statement. Without a move-in date, *All time* is listed and *Since move-in* is not.

When nothing is owed and the wallet holds credit, What I owe says what the credit pays, for example `Credit: ₦20,000.00. This pays Nov and Dec 2026.`, before `Next payment due`.

What I owe names each overdue and next-due charge by the item names on the invoice as it was billed, else its billing profile, else its invoice type, with the month for monthly dues (for example `Security Levy, OCT 2026` or `Development levy`). A billing profile renamed for a later rate does not change the name of older invoices; up to 5 overdue charges are listed, then `and N more`. A resident with more than one property is asked which property every time they open What I owe, and the list ends with **All my properties**: one line per property with what is outstanding there, then the total owed. A property in credit is shown as in credit but does not reduce the total, so a debt on another property is never hidden. Statement and Receipt stay one property at a time; statement PDF invoice lines and the wallet history carry the same charge label. The wallet belongs to the person, not a property, so a resident with more than one property sees it as *Wallet (all your properties)*.

A co-resident whose sponsor (the resident landlord or tenant of the same house) still lives there sees that sponsor's figures for the house: What I owe, Recent payments, Statement, Receipt and Report a payment, plus `PAY`. Wallet and Clearance certificate are hidden, and their keywords are refused. The co-resident uses their own PIN and their own daily cap. A reported payment is recorded against the sponsor's account, with the co-resident stored as the requester on the approval. Each disclosure log row names the co-resident as the asker and carries the sponsor in `metadata.account_resident_id` (for **All my properties** across more than one sponsor, `metadata.account_resident_ids` lists them). When the sponsor moves out, the co-resident loses the Financial standing item on their next message.

**Link a co-resident.** The sponsor can create a link code for one of their co-residents, so the co-resident can link their own number without the estate office. It is **8. Link a co-resident** on the Financial standing menu, or the keyword `link co-resident`. The menu item goes away once one of the sponsor's co-residents on that property has linked their number; the keyword keeps working. Only the resident landlord or tenant of the selected property can use it, and only after entering their PIN; it asks for the PIN even when the PIN policy does not require one for viewing figures. The sponsor picks from a numbered list of their active co-residents on that property. The assistant never creates a resident: with no co-resident on record, it points to the estate office. The code is 6 digits, works once, is valid for 60 minutes, and cancels any earlier live link code for that co-resident. Creating it is written to the audit log with the sponsor as the resident actor, without the code. The co-resident sends `LINK` and the code from their own number, which does not need to be on their record. The code is refused from any number linked to the sponsor or on the sponsor's record, and is not used up. When the code is used, the sponsor gets "\{first name\} is now linked to \{property\} on WhatsApp." Unlinking stays with the estate office.

Every statement is a PDF, never chat text. Choosing a period sends one of these, and the reply names only the period, the property and where the PDF is going; it carries no statement rows. A statement that cannot be made gets the failure reply and the estate office line, not a text fallback.

- **What the PDF shows:** one section per wallet category (Dues, Development Levy, Transformer Fee) with its own running balance, then a Collections section listing the resident's collection payments in the period. Monthly invoices in a row with no payment between them, for the same charge and amount, show as one line with the month range (for example `Nov 2025 – Feb 2026 · 4 invoices`) and the balance at the end of the run. This applies also when a credit balance pays the invoices; a payment or wallet entry stops the run. The admin statement download, the chat PDF and the emailed PDF use the same PDF. Collection lines count as rows below.
- **Up to 40 rows:** the account statement PDF is attached in chat. It is stored privately, Chatmaid is given a link that works for 1 hour, and the file is deleted 12 hours later. If Chatmaid reports the send failed, it is sent once more with a fresh link.
- **Over 40 rows:** the resident is offered email to their address on file, shown masked (`a***@gmail.com`). On `1` the email is queued and arrives with the PDF attached within 15 minutes, through the notification queue, so the communications override applies to it. The request moves from queued to sent once the email has gone, and the resident gets one WhatsApp message: `Your PDF was emailed to a***@gmail.com.` If every send attempt fails, the request moves to failed and the resident gets `Sorry, we could not email your statement.` with the estate office phone, when one is set. Both messages follow the communications override. A cancelled request gets no message.
- **No email on file:** the resident is told so, and the request appears under **Statement requested, no email** on **Oversight → WhatsApp bot health** until an email is added and the statement is sent.

### Account actions

Beyond answers, a resident can make four changes from chat. Each is recorded in the audit log with the resident as the actor, and nothing else can be changed over WhatsApp.

- **Payment reminders** (Alert settings, item 2): turns payment and invoice reminders on WhatsApp off or on. Turning off asks `Reply 1 Yes, 2 No` first. Announcements, security alerts and the STOP command are unaffected, and so are email and SMS reminders.
- **Update email** (main menu item 5, or `EMAIL`): the resident types an address, a 6-digit code is emailed to **that** address, and the address is saved and marked verified only when the code comes back. The code expires in 30 minutes, at most 3 codes are sent an hour, and 5 wrong codes cancel it. The old address is emailed that the address changed, showing the new one masked. Statements queued for want of an email are sent as soon as the address is verified, and clear from **WhatsApp bot health**.
- **Receipt** (Financial standing, item 5, or `RECEIPT`): lists the last 5 payments; picking a verified one sends its receipt as a PDF, handled like a statement PDF (private link for 1 hour, file deleted after 12 hours, one retry). A payment still awaiting verification gets `A receipt is available once this payment is verified.` The list and each PDF are disclosures and count toward the caps.
- **Report a payment** (item 6, or `REPORT`): asks for the amount, the date and the bank narration or reference, shows a summary, and files it on `1`. At most 3 reports a day; the date must be within the last 90 days and not in the future; the same amount, date and property cannot be reported twice. The report is a pending payment that appears in the resident's *Awaiting verification* figure, plus a request in [Approvals](../operations/approvals-and-announcements). Approving it makes it a real payment: verified, credited to the wallet and allocated to invoices; rejecting it, or no decision in 72 hours, closes it. Either way the resident is told by WhatsApp; an approval message names the properties the payment paid. A screenshot sent during a report is acknowledged, but WhatsApp does not pass the image to Residio: the estate office sees it on the estate phone, and the time it arrived is noted on the payment.
- **Clearance certificate** (item 7, or `CLEARANCE`): per property, and only for a property the resident lives in as tenant or resident landlord. For any other role item 7 is hidden and `CLEARANCE` gets `A clearance certificate can only be requested for the property you live in.` A resident who owes money is told the amount. A resident who owes nothing files a request in Approvals (only one can wait per property: a second resident on the same property is told a request for the property is already waiting, with the estate office line, and the certificate goes to whoever asked first); on approval the certificate is issued, sent to them in chat, saved to Documents under *Clearance certificates* with the property, and copied on WhatsApp to the members of the group chosen under **Settings → Billing → Clearance certificate copies** (see [Billing and notifications settings](../settings/billing-and-notifications)). The same copies go out for every certificate issued from the move-out screens.

- `0` goes back one level; `MENU`, `HI` or `HELLO` show the main menu; `CANCEL` abandons the current step; `LOCK` ends an unlocked session.
- `EXIT`, `END`, `CLOSE`, `BYE`, `GOODBYE` or `QUIT`, sent on its own in any step (including free-text steps), ends the session at once: the PIN is locked, any step in progress is dropped, and the reply thanks the resident and says to send HI to start again. The next message shows the main menu, without the 15-minute note.
- `9`, `HELP`, `AGENT` and `CONTACT` give the estate office line: phone, email and office hours from Estate Profile.
- Keywords such as `OWE`, `PAYMENTS`, `STATEMENT`, `WALLET`, `PAY`, `NEWS`, `RECEIPT`, `REPORT`, `CLEARANCE`, `REMINDERS` and `EMAIL` jump straight to an item. Add the estate's own phrasing under **Extra keywords**.
- A reply the Assistant does not understand gets `I didn't catch that.`; from the second in a row it adds the estate office line. Voice notes, images and stickers get a request to type instead.
- After 15 minutes without activity the session ends, and the chosen property, the PIN unlock and any step in progress are forgotten. The next message says so only when the resident was in a step, for example reporting a payment or choosing a statement period, and the message is not HI, HELLO, MENU or START. The note adds that the PIN is needed again only when the PIN was unlocked. In all other cases the session starts again without the note, and the message is handled as usual: HI shows the main menu, and 1 asks for the PIN when one is needed.
- If a lookup fails, the resident is told nothing was shown or changed and to try again shortly, with the estate office line.

### Feedback survey

After a request goes well, the Assistant asks `How was <Assistant name> today?` with `1. Good / 2. Okay / 3. Poor`. It asks only when:

- the resident replies `thanks` or `ok` right after a financial answer, or
- a payment report or a clearance certificate request has just been accepted.

It never asks after an error, a PIN lock, an expired session or inside a PIN step, and at most once every 30 days per resident, whether or not they answered. On `3. Poor` the Assistant asks what went wrong (`Too slow`, `Couldn't find what I needed`, `Information looked wrong`, `Something else`), then for one optional line (`SKIP` leaves it out), and closes with the estate office line. A resident who replies `STOP SURVEYS` is never asked again; plain `STOP` still only ends alerts. The **Resident feedback** card on **WhatsApp bot health** shows the counts by score and by reason for the last 30 days. It shows no comments and no names.

### Resident balance

The **Resident balance** card in the Resident bot section switches residents to the roll-forward account balance: invoices billed, less verified payments, with wallet credits and debits on an all-properties statement only. It never reads what was allocated to each invoice. It is off by default. While it is off, residents see the figures they saw before: What I owe shows what is unpaid on invoices, and statement PDFs, in WhatsApp, by email or in the portal, keep their old opening balance. When it is on, What I owe shows `Outstanding: ₦X owed`, `₦X in credit` or `Nil`, and statement PDFs use the same figure. Overdue and Next due are still worked out invoice by invoice.

Leave it off until the legacy charges are created as invoices. Until then, a resident whose old dues were paid but never invoiced is shown in credit by that amount. Admin account statements use the roll-forward balance whatever this switch says. The switch needs `whatsapp.manage`, and each change is written to the audit log.

### Assistant replies

The **Assistant replies** card in the Resident bot section holds the text the Assistant sends:

- **Payment instructions**: the bank, account number and narration wording sent for *How to pay*. While it is empty, *How to pay* is hidden.
- **Extra keywords**: one `phrase = item` per line, for example `service charge = owe`. Items are `owe`, `payments`, `statement`, `wallet`, `pay`, `notices`, `contact`, `email`, `reminders`, `report`, `receipt` and `clearance`.

Each saves on its own and is written to the audit log.

## Admin mode

Admin mode lets an admin use **Admin tools** in the WhatsApp Assistant from their own phone. Every staff role (Executive Committee, Board of Trustees and staff roles, not resident roles) can hold **Use WhatsApp Admin Mode** (`whatsapp_admin.query`). On a number linked to an active admin account, the main menu shows **6. Admin tools**: *(code needed)* before the code is entered, *(unlocked)* during a session, or no note when no code is needed. Other numbers never see item 6. `ADMIN` alone opens Admin tools as well; from a number that is not an admin number it gets the normal "I didn't catch that" reply. Every message checks the live account, role and permission again.

**The Admin tools menu.** It starts with `🛠️ Admin tools: <name>, <role>` and `Session ends HH:MM`, lists only the items the admin's role may use, and ends with `Reply 0 for menu or LOCK to lock now.` `0` goes back to the main menu, and `LOCK` ends the admin session. Admin and resident steps share one conversation, so a reply always goes to the step on screen. Each item has its own permission, under **WhatsApp Admin Tools** in the role permissions:

| Item | Permission | Default roles |
| --- | --- | --- |
| 1. Resident status | `whatsapp_admin.resident_status` | every staff role |
| 2. Security debt status | `whatsapp_admin.debt_report` | Chairman, Financial Officer, Super Admin |
| 3. Today's collections | `whatsapp_admin.collections` | Chairman, Financial Officer, Super Admin |
| 4. Clearance requests waiting | `whatsapp_admin.clearance_queue` | Chairman, Financial Officer, Super Admin |
| (later) Approve payment report | `whatsapp_admin.approve_payment` | Financial Officer, Super Admin |

**Resident status.** Choose 1, then send a house code (`KOA-18A`) or a name (`Ada`). The reply is short: the house, the billed resident and the debt status on the first line, then what is owed, for which months, and the last verified payment, for example `*OJO.K-4, CONSTANCE OKA*: Arrears` / `Owes ₦110,000.00 for Dec 2025 to Oct 2026. Last payment was ₦100,000.00 (Jun 2025).` A house that owes nothing reads `Fully paid up.`. The wallet pays bills as they are made, so credit normally means nothing is owed: `Credit: ₦20,000.00. This pays Nov and Dec 2026.`, or `This goes to your next bill.` when the credit is less than one month. Credit next to an open bill is for another charge category and is marked `(not for these bills)`. Payments not yet verified show as `Awaiting verification`. A house with a landlord and a tenant shows the billed resident. One match answers at once; two to five matches come back as a numbered list, and the admin replies `1` to `5` within 5 minutes to choose. More than five matches ask for a longer name. The step stays open for the next house; `0` goes back to Admin tools. The resident is not told. Each answer is written to the audit log and the WhatsApp disclosure log; a house with no billed resident shows no figure and has no disclosure entry.

**Today's collections and Clearance requests waiting.** Both only read. Today's collections gives the total of verified payments dated today (Lagos time) and for the month so far, with a line per street. It counts a payment as verified by the same rule as the dashboard's verified total (verified by hand, or brought in by a bank or email import). Clearance requests waiting lists the 10 newest pending clearance certificate requests with the house, the resident and the date asked, then `and N more` if there are more, and a link to Approvals. Each run is written to the audit log.

**Linking a number.** A number is linked automatically the first time Admin tools is opened when it is the phone of the resident record tied to the admin's profile, and the admin has no other linked number. With a code needed it is linked only after a correct code. An admin can also link a number under **Settings → WhatsApp admin access**, signed in with their authenticator code. **Create link code** shows a 6-digit code once; it works one time, for 10 minutes. From the phone, send `ADMIN LINK <code>` to the estate WhatsApp number. Linking a new number ends the old link, and **Unlink** ends it at any time. The admin gets an email each time a number is linked.

**The WhatsApp admin access page.** **Settings → WhatsApp admin access** has three parts. Roles-management access (`system.manage_roles`, held by Super Admin by default) is needed for everything marked *managers* below; any other admin sees only their own row.

- **Linked admins.** A table of every admin with a linked number: name, role, masked number, linked since, link ends, last used, a **Code required** switch, status and **Unlink**. Search by name, role or number, and filter by *Code off* or *Link needs attention*. Managers see all admins; others see their own row only. **Link a number for an admin** (managers) picks an admin account and a number. The link is active at once, the admin gets the "number linked" email, and the choice is written to the audit log. An admin with no authenticator app can be linked only with **Code required for this admin** turned off.
- **Role access.** Roles down the side, the Admin tools items across the top, a checkbox for each. **Save role access** lists every change in a confirm window first. A change takes effect on the admin's next WhatsApp message. Only the five Admin tools item permissions can be changed here.
- **Link your own number.** The link code flow described under *Linking a number*.

**The code.** The `whatsapp_admin_code_required` setting is the global "Code required" switch, and each linked number has its own switch (both on by default). Managers set both on the **WhatsApp admin access** page, and each change is written to the audit log. A code is needed when both are on. Then opening Admin tools asks for the 6-digit code from the authenticator app, typed alone (`ADMIN <code>` also works). A correct code opens a 15-minute session. A code works only once. A request marked as needing a fresh code (Security debt status) asks for one every time. With no code needed, the linked number alone opens Admin tools, authenticator 2FA is not required, and the session still ends after 15 minutes.

**Security debt status.** Choose 2. The assistant lists the streets that have reportable houses, each with a number, and `ALL`. Reply `ALL` or street numbers such as `2,3`, then send a new authenticator code when a code is needed; a session never skips this code. The PDF follows the estate's own layout: the title *Security Dues - Debt Status* and a line that explains each status (from **Settings → Debt Status**) at the top of each page, then one table with Street, No, Resident and Debt Status, sorted by street and house number. Arrears are red and Credit is green. It has no amounts. Resident names are masked so an admin can recognise them but another reader cannot: each word keeps its first 2 letters (`CONSTANCE OKA` reads `CO*** OK***`), and titles and organisation words such as *PASTOR* or *LTD* stay whole. The PDF ends with the footnote from **Settings → Debt Status** and the note that names are masked. Houses with an unverified identifier, a vacant, under renovation or under construction property status, or no active tenant, resident landlord or non-resident landlord are left out. Document sending over WhatsApp does not exist yet, so every report is emailed to the admin's account email address. The reply gives the number of houses in the report; the PDF is drawn when the email is sent, and if it cannot be drawn or emailed the admin gets a WhatsApp message saying nothing was sent. Each request is recorded in the audit log with the admin, the scope and the time.

**When a link ends.** A link ends when the admin's role, account status or authenticator app changes, 90 days after linking, or after 30 days without use. The admin then links the number again.

**Limits.** At most 50 admin requests per admin per day (reset at midnight, Lagos time). The `whatsapp_admin_daily_cap` setting can change the limit for a role: a JSON map of role name to limit, for example `{"chairman": 100}`. A role that is not in the map, or an entry that is not a whole number of 0 or more, keeps 50.

**Weekly email.** Every Monday at 07:00 Lagos time, each active Chairman with an email address gets a list of the admin actions done on WhatsApp in the 7 whole days before (Monday to Sunday): who, which item, which house or resident, and when. The email is sent even when the week had no actions. A week with more than 200 rows is cut with a note. Five wrong codes lock admin mode on that number for 30 minutes, and the admin gets an email.

**Resident numbers.** A number that is also a resident's keeps the resident assistant. Only `ADMIN`, `ADMIN LINK <code>` and `ADMIN <code>` are admin commands; `ADMIN STATUS`, `ADMIN OWES`, `ADMIN DEBT` and `ADMIN HELP` were removed, and any other text starting with "admin" gets the resident reply.

Every link, unlink, approved or wrong code, ended link and answered request is in the audit log.

## Rate caps

Caps protect residents from a runaway loop and protect the estate from provider throttling.

| Cap | Purpose |
|---|---|
| Outbound daily cap | Maximum messages sent in a day |
| Outbound burst cap | Maximum messages within the burst window |
| Burst window (minutes) | The window the burst cap is measured over |
| Financial lookup daily cap | Maximum financial answers returned in a day, across the whole estate (default 500) |

Each resident is also limited to 20 financial answers a day. Only the Financial standing answers count toward either financial cap (What I owe, Recent payments, Statement, Wallet, the Receipt list and each receipt PDF, and the Clearance certificate check), including each statement PDF and email; one *All my properties* answer counts as one and writes one disclosure log row; How to pay, notices and the contact line do not. Admin tools *Resident status* lookups are in the disclosure log but count toward neither; the admin's own daily limit applies instead (see *Admin mode*). Both reset at midnight Lagos time, and the resident is told which limit was reached.

Queued notifications, clearance certificate copies and approval outcome messages all count toward the outbound caps, and all obey the master switch and rollout mode. When a cap is reached, further sends are blocked and the event is counted on **WhatsApp bot health** as a cap limit event. A certificate or outcome message held back by a cap is queued and sent automatically after the daily count resets at midnight Lagos time (a burst-cap hold waits one burst window), if the switch, rollout, opt-in and caps still allow it then; the admin who made the decision is shown a warning saying it is held back and when it will send. A message refused for any other reason (switched off, not opted in, outside the rollout) is not retried: the warning says it was not sent and why. Repeated cap events mean the cap is wrong for the estate size or something is sending in a loop — investigate before raising the number.

## Monitoring

Two pages in **Oversight** (sidebar link **Oversight**, menu group **Messages**) show WhatsApp activity. Neither changes a setting. Both need the WhatsApp view permission. Each page has a row of jump tabs that scroll to each section.

**WhatsApp bot health** has four sections: **Bot health**, **Feedback**, **Undelivered** and **Statements waiting**. **Bot health** shows today's activity in UTC: inbound messages, outbound messages, delivery failures, template errors, and cap limit events. **Feedback** shows the **Resident feedback** counts (see *Feedback survey* above). **Undelivered** and **Statements waiting** are described below. Settings → WhatsApp links to this page.

**WhatsApp activity** holds the logs an admin watches: sent messages, the opt-in registry, pending contacts, active sessions, the disclosure log and clearance certificate copies not sent. To monitor it, choose an auto-refresh interval from 1 to 30 minutes, or press **Refresh now**. Either one refreshes every panel on the page.

The **Undelivered messages** list on **WhatsApp bot health** covers the last 7 days. It shows each WhatsApp message the provider reported as failed, or that Chatmaid accepted but never confirmed as sent within 15 minutes. Each row shows the time, the resident (when known), the masked number, whether it was a reply or a notification, the provider's reason, and the id of the resident message it answered. Those residents may not have received the message, so contact them another way. Residio does not resend these messages automatically.

The **Sent messages** list on that page shows every WhatsApp message the app sent, newest first, 25 to a page: the time, whether it was a reply or a notification, the resident, the masked number (last 4 digits), the status (pending, sent, delivered or failed), the error code, and the id of the resident message it answered. Filter by status or purpose. It shows no message text, because none is stored, and covers the 90-day retention window. Assistant replies appear here and not in **Oversight → Notification queue**, which links to the monitoring page.

The **Statement requested, no email** list on **WhatsApp bot health** shows residents who asked for a statement too long for chat and have no email on file. Add their email to clear it.

The **Clearance certificate copies not sent** list on the monitoring page shows each copy of an issued certificate that did not reach a member of the copy group (WhatsApp switched off, outside the rollout, not opted in, no WhatsApp number, or the provider refused), with the reason and the number of tries. A copy held back by a cap is not listed while it waits to send automatically; it appears here only if that later send fails or its queued message is cancelled. With the WhatsApp manage permission each row has a **Retry**, which sends it again with a fresh link. A failed copy never holds up the resident's own certificate.

The **disclosure log** on the monitoring page records every occasion on which financial information was released over WhatsApp, with its channel: `chat` for an answer, `pdf` for a statement or receipt PDF sent in chat, and `email` for one sent by email. Treat it as an audit surface: it is the evidence that a disclosure was authorised, and it should never be cleared to tidy a screen.

## Data retention

WhatsApp operational state is short-lived by design and purged on a daily schedule.

- Sessions are removed after they expire, by default the next day. A session for a blocked number is kept until its 24-hour reply window has passed, so the number is not sent the "current residents" reply twice in a day.
- Processed message records are removed after their expiry, by default two days.
- Survey answers (the rating, the optional comment and the phone number) are removed after 90 days by default. Opt-out records are kept, because they record a resident's choice and hold no comment.
- Outbound send records are removed after 90 days by default.

The session, processed message, survey answer and outbound send periods are set under **Settings → WhatsApp** in the rollout controls. Survey answer and outbound send periods accept 1 to 365 days. The public privacy policy at `/privacy-policy` states the survey answer period currently set.

The cleanup runs automatically shortly after midnight, documented on the Scheduled jobs page in this section.

## Troubleshooting

| Symptom | Check |
|---|---|
| Nothing sends | No provider is connected, the master switch is off, rollout mode is `Disabled`, or the recipient is outside the pilot scope |
| One resident receives nothing | No approved opt-in record for that resident |
| Sends stop partway through a day | A daily or burst cap has been reached |
| Financial questions go unanswered | The resident has no PIN set while the PIN policy is on (issue a setup code), or the number is linked but is neither on the resident's record nor linked with a link code |
| Resident is told their PIN is locked until a time | Three wrong PINs in a row; the lock lifts at that time, or earlier with **Reset PIN** |
| Resident is told the estate office needs to reset their PIN | Six wrong PINs within 24 hours; only **Reset PIN** lifts it |
| Resident forgot their PIN | Confirm identity, then use **Reset PIN** and give them the setup code |
| A resident says their email code does not work | It expires after 30 minutes, 5 wrong codes cancel it, and only 3 codes are sent an hour. They reply `EMAIL` to start again |
| A resident's payment report never shows up | Check **Approvals** for a *Payment Reported on WhatsApp* request. Approving it needs both the approvals and the verify payments permissions |
| A clearance certificate copy did not reach an estate official | See **Clearance certificate copies not sent** on Oversight → WhatsApp activity; usually the official has not opted in |
| A link or setup code is not accepted | It expired, was already used, or a newer setup code replaced it. Issue a new one |
| Test connection fails | The provider rejected the saved credentials — recheck the access token or auth token against the provider's console. For Chatmaid, the from-number may not be a paired phone, or the paired phone is not connected to the bridge. For WAHA, the API key or server address may be wrong, the session may not be `WORKING`, or the from-number is not the paired phone |
| A WhatsApp send is blocked with "is the WhatsApp from-number" | The communications override points WhatsApp at the bridge phone itself. Change the override WhatsApp number (or the override phone, if the WhatsApp number is blank) under **Settings → Communications override** |
| Chatmaid sends fail with "bridge is disconnected", or you received a WhatsApp disconnected alert | The paired phone has lost its connection — re-pair it in the Chatmaid dashboard |
| Assistant stops replying in one conversation (Chatmaid) | A team member replied from the phone within the last 30 minutes; the Assistant resumes afterwards |
| Twilio template fails to send | No Content SID mapped for that template name — map it on the connection card |
| Residents say the Assistant did not reply, or you received a "replies are failing to deliver" alert (Chatmaid) | Check **Undelivered messages** on **Oversight → WhatsApp bot health** for the provider's reason, and the paired phone in the Chatmaid dashboard |
| Delivery failures climbing | Provider credentials or template approval — escalate to an engineer |
| Inbound messages ignored | Webhook verification is failing at the provider — escalate to an engineer |
