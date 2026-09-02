# Residio

Residio is a residential estate administration system: resident and roster management, billing (invoices, levies, wallet), payments, security, and community communications. This context covers the whole estate-administration domain.

## Language

**Resident**:
A person or legal entity with a numbered role on one or more houses within the estate.
_Avoid_: User, tenant, landlord, member, customer

**House**:
A physical addressable unit within the estate, keyed by house number and street, to which residents are attached via resident houses.
_Avoid_: Property, plot, unit

**Resident House**:
The relationship attaching a Resident to a House, carrying a role and primary/secondary status.
_Avoid_: Assignment, tenancy

**Personnel**:
A person or service provider registered to work in the estate, such as estate staff, contractors, vendors, or suppliers.
_Avoid_: Vendor (when referring to every personnel type)

**Personnel Engagement**:
A dated accountability relationship between Personnel and either the Estate or a Resident House. Every Personnel type may receive either scope. Multiple engagements may be active concurrently, except that a Personnel record may have only one active engagement for the same accountability target. Ended engagements remain as history rather than being overwritten. It may record an engagement-specific responsibility in addition to the Personnel profile's general job title.
_Avoid_: Assignment (ambiguous with Resident House), employment (too narrow for vendors and contractors)

**Estate Engagement**:
A Personnel Engagement where the Estate is the accountable party, such as estate security, facilities, or administrative staff.

**Resident-House Engagement**:
A Personnel Engagement where a specific Resident House is the accountable party, such as domestic staff, a private driver, or a house-specific contractor. It may be created only against an active Resident House, but remains historically valid if that Resident House later ends.

**Personnel Status**:
The directory-wide operational state of a Personnel record. Ending a Personnel Engagement does not change this status when the person has other active engagements.

**Unassigned Personnel**:
A Personnel record with no active Personnel Engagement. Existing records begin unassigned until an administrator records their accountability; the Estate is never inferred as the accountable party.

**Invoice**:
A formatted request for payment (service charge, levy, adjustment) issued against a House/Resident, with its own status, due date, and amount due.
_Avoid_: Bill, levy (when referring to a specific invoice)

**Payment**:
A receipted sum received against the estate's obligations, matched to invoices and the resident ledger.
_Avoid_: Transaction, receipt

**Wallet**:
The per-resident ledger of prepaid allocations drawn down against invoices.
_Avoid_: Balance, account (when ambiguous with a banking account)

**Billing Profile**:
The rate configuration (items, amounts, frequencies, effective date) that yields invoices.
_Avoid_: Rate card, tariff

**WhatsApp Assistant**:
The estate's resident-facing WhatsApp surface; it broadcasts estate information and reminders and answers structured financial queries from identified residents.
_Avoid_: Chatbot, bot (vague), WhatsApp bot

**WhatsApp Identity**:
The resolution of an inbound WhatsApp contact number to a Resident, primarily by matching the roster's phone number, with a one-time PIN link as fallback.
_Avoid_: WhatsApp ID, WaId

**Contact Resolution**:
The act of mapping a raw inbound channel address (phone number) to a Resident. Also used by the payment-matching engine and SMS verification.
_Avoid_: Matching (when ambiguous with payment matching)

**WhatsApp Opt-in**:
A recorded consent binding a Resident's channel address to WhatsApp messaging. Captured in-chat during the PIN-link flow and enforceable in the notification engine's outbound path.
_Avoid_: Subscription (when ambiguous with report subscriptions), consent (vague)

**Financial Standing**:
The resident-visible summary of outstanding invoices, last payment, statement, next due, and wallet balance as surfaced by the WhatsApp Assistant's structured menu.
_Avoid_: Account status, balance (when used alone)

**Billable Role**:
A resident role able to receive invoices for a house: resident_landlord, non_resident_landlord, tenant, or developer.
_Avoid_: Payer, account holder

**Eligible Resident**:
A resident holding a billable role on a house, hence entitled to the WhatsApp Assistant's financial answers for that house.
_Avoid_: Verified user, premium member

**Property Selection**:
The menu step the WhatsApp Assistant inserts when a resident holds billable roles on multiple houses, letting them pick a single property or an all-properties aggregation.
_Avoid_: House chooser, unit picker

**Statement**:
A composed ledger — invoices issued against and payments received for a selected property over a fixed, resident-chosen period (this month, this year, last six months) — derived from invoices and payment_records rather than stored. Optional "all properties" aggregation.
_Avoid_: Balance report, account breakdown

**Community Tier**:
The WhatsApp Assistant's access level for any identified resident: estate information (announcements, notices, security updates) but no financial standing answers.
_Avoid_: Free tier, public mode

**WhatsApp Session**:
The persisted conversational state for an inbound WhatsApp number — current menu node, selected property, PIN-authenticated flag — stored in whatsapp_sessions with a short TTL.
_Avoid_: Chat state, dialog

**Disclosure Log**:
The audit trail recording each financial-standing answer the WhatsApp Assistant sends: number, resident, property, menu item, timestamp, and whether a PIN authenticated the request.
_Avoid_: Transcript, chat log

**Pending Contact**:
An unrostered WhatsApp number that contacted the Assistant and was offered onboarding; surfaced to admins in the operational console to attach or ignore.
_Avoid_: Unknown user, stray number

**WhatsApp Template**:
A Meta pre-approved message template (copy + placeholders) used for all proactive Assistant messages; not modifiable at send time beyond placeholder fills.
_Avoid_: Message body, broadcast copy

**Setting**:
A persisted value or rule an administrator changes that governs future system behaviour, such as the late-fee grace period or the maintenance-mode message. Distinct from anything an administrator merely watches.
_Avoid_: Preference, option, config (when referring to one value)

**Reference Data**:
A maintained list of domain entities that other features select from — streets, house types, document categories, transaction tags, billing profiles. Distinct from a Setting because nothing is switched on or off; the list itself is the value.
_Avoid_: Lookup table, master data

**Integration**:
An external service the estate connects to, such as WhatsApp, Gmail import, or Paystack. An Integration owns its credentials, its configuration and its operational console together, rather than being split across the subjects it serves.
_Avoid_: Plugin, connector, third-party

**Provider**:
The vendor implementing a single Integration — Meta or Twilio for WhatsApp. An Integration may be served by several interchangeable Providers.
_Avoid_: Integration (when referring to the vendor), vendor, backend
