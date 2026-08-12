# Sync Without Signal: Offline-First Transaction Consistency for a Multi-App POS Platform
### COMPFEST SEA 18 — Final Project Case Study Summary

## 1. Project Overview

| Item | Detail |
|---|---|
| **Program** | Software Engineering Academy, COMPFEST 18 × PT Skalar Solusi Digital |
| **Assignment** | Final Project SEA 18 — one of three selectable case studies |
| **Selected Case** | Case Study 2: *Sync Without Signal: Offline-First Transaction Consistency for a Multi-App POS Platform* |
| **GitHub Repository Deadline** | 23:59 WIB, 21 August 2025 |
| **Presentation File Deadline** | 06:00 WIB, 22 August 2025 |

### Description (from the Final Project brief)
Following the successful delivery of the SEAPEDIA application, SEAPEDIA's CEO, Aca, showcased the team's work to his network, leading to a surge in new project inquiries. As a small team committed to quality, the team has capacity to accept only one new case. The objective is to conceptualize, justify, and build a high-quality application prototype for the chosen project, requiring seamless team collaboration, a strict focus on core functionalities, and a commitment to a robust, user-centric solution.

### Project Case Options
1. *Scaling Without Overspending* — Access-Pattern-Aware Architecture for a Multi-Actor POS Platform
2. **→ *Sync Without Signal* — Offline-First Transaction Consistency for a Multi-App POS Platform (this case)**
3. *Sell Without Overselling* — High-Concurrency Ticket Reservation Platform

### General Rules
1. Each group chooses one case. Each case can only be chosen by a maximum of 2 groups. Cases are booked via the case-booking link in the brief.
2. Each group creates a final project GitHub repository.
3. Every application developed by the group must have the following features:
   - **User management**: account management consisting of login, logout, new account registration, and permission settings.
   - **Business/Government Transactions**: features related to the transaction process of the application idea (e.g., in an e-commerce application, creating/changing items and making item purchases).
4. On the last day of the academy, each team must present and justify their applications. Each team may prepare a slideshow and do a live feature demo of the prototype.

---

## 2. Case Context (Case Study §1–2)

Application K is a POS and business intelligence (BI) platform for Indonesian SMEs. It supports **three operational roles through separate applications: Entry, Owner, and Operator**. Among these, the **Operator** application is responsible for handling checkout transactions, making it the most business-critical component because it is used directly at the point of sale, where internet connectivity is often unstable.

*(The case study does not describe the specific functionality of the Entry and Owner applications beyond naming them as the platform's other two operational-role applications.)*

### Constraints — ADR-006

This case study follows a fixed architectural decision (**ADR-006**): the checkout application must continue operating under an **offline-first onboarding model for the next six months, with no self-serve fallback**. This constraint reflects the realities of Indonesian SME retail environments and is to be treated as a given throughout the analysis; teams must design their solution within this constraint.

**Key Takeaways (as stated in the case study):**
- POS + BI platform for Indonesian SMEs.
- Three applications: Entry, Owner, and Operator.
- Operator handles checkout transactions in unstable network environments.
- ADR-006 fixes offline-first onboarding for six months with no self-serve fallback.
- Teams must design their solution within this constraint.

---

## 3. Background (Case Study §3)

Application K is a POS and BI platform for Indonesian SMEs, where unreliable internet connectivity is a daily operational reality rather than an exception. The checkout process must continue even during network outages to avoid disrupting sales.

### Payment Methods
| Method | Verification Model (as stated) |
|---|---|
| **Cash** | Confirmed directly by the operator without relying on external systems. |
| **Static QRIS** | Uses a pre-generated QR code that can be displayed without an internet connection. |
| **Bank Transfer** | Verified manually by the operator using external confirmation, such as a banking app, e-wallet notification, or SMS. |

### Transaction Lifecycle
Transactions follow a simple lifecycle of **Pending, Confirmed, and Voided**.
- Once confirmed by the backend, a transaction cannot be modified by operators, while corrections are restricted to administrators as an exception workflow.
- Inventory is deducted only after a transaction is confirmed, reflecting an accepted level of **eventual consistency** rather than real-time stock reservation.
- Multiple operators may process transactions simultaneously for the same merchant, including while working independently on different devices without network connectivity.

---

## 4. Problem Statement (Case Study §4)

Design an offline-first synchronization architecture for the Operator (POS) application that allows transactions to be created and locally confirmed while offline, then synchronized with the backend when connectivity is restored. The design must prevent duplicate or lost transactions, preserve backend-side transaction immutability, and support concurrent offline transactions from multiple devices under the same merchant.

A transaction confirmed while offline is **provisional** until accepted by the backend. This distinction between provisional and settled transactions must be explicit in both the synchronization logic and the operator UI.

**Key Requirements (as stated in the case study):**
- Offline transaction creation and local confirmation.
- Reliable synchronization after reconnection.
- No duplicate or lost transactions.
- Backend-side transaction immutability after sync.
- Support concurrent multi-device offline operation.
- Clearly distinguish provisional and settled transactions.

---

## 5. Data & Constraints (Case Study §5)

### Business
- Expected to scale from an early pilot to 500+ merchants.
- Multiple operators may process transactions simultaneously under the same merchant.
- Internet connectivity is frequently intermittent.

### System Constraints
- Backend-confirmed transactions are immutable.
- Cash and Static QRIS payments must remain fully operable during connectivity outages.
- Transfer payments are verified by the operator using an external confirmation (e.g., bank app, e-wallet, or SMS), not by the POS system.
- Inventory is deducted only after transaction confirmation. Real-time stock reservation is out of scope.
- Offline-first onboarding remains mandatory for the first six months, with no self-serve alternative.

### Payment Validation
- **System-verifiable**: Cash.
- **Operator-asserted**: Static QRIS and Transfer. Both rely on operator verification of an external payment signal and should be treated as carrying residual confirmation risk.

---

## 6. Use Cases

*(Grouped restatement of the explicit requirements in Section 4 above and the General Rules in Section 1, organized as use cases. Each item corresponds directly to stated text — no additional functionality has been introduced.)*

### 6.1 User Management (General Rule #3, Final Project brief)
- **UC-01**: User Registration
- **UC-02**: User Login
- **UC-03**: User Logout
- **UC-04**: Permission Settings

### 6.2 Checkout / Transaction & Sync (Case Study, Problem Statement + Background)
- **UC-05**: Create Transaction Offline
- **UC-06**: Locally Confirm Transaction (offline) — resulting state is **provisional**
- **UC-07**: Synchronize Transaction with Backend upon Reconnection
- **UC-08**: Void Transaction
- **UC-09**: Administrator Correction of a Backend-Confirmed Transaction (exception workflow)
- **UC-10**: Concurrent Transaction Processing by Multiple Operators/Devices under the Same Merchant (including while offline)
- **UC-11**: View/Distinguish Transaction Status as Provisional vs. Backend-Confirmed
- **UC-12**: Process Cash Payment (system-verifiable, offline-operable)
- **UC-13**: Process Static QRIS Payment (offline-operable, operator-asserted)
- **UC-14**: Process Bank Transfer Payment (operator manually verifies via external confirmation)
- **UC-15**: Reconcile an Operator-Confirmed Payment (Static QRIS or Transfer) Later Found to Be Incorrect
- **UC-16**: Deduct Inventory upon Transaction Confirmation (eventual consistency)

---

## 7. Functional Requirements (FR)

*(Restated directly from the case study's Problem Statement, Background, Data & Constraints, and Deliverables sections.)*

| ID | Requirement |
|---|---|
| FR-01 | The application must support login, logout, new account registration, and permission settings (per Final Project General Rule #3). |
| FR-02 | The application must have features related to the transaction process of the chosen application idea (per Final Project General Rule #3). |
| FR-03 | The Operator application shall allow transactions to be created and locally confirmed while offline. |
| FR-04 | The Operator application shall synchronize offline transactions with the backend when connectivity is restored. |
| FR-05 | The design must prevent duplicate or lost transactions. |
| FR-06 | The design must preserve backend-side transaction immutability after sync. |
| FR-07 | The design must support concurrent offline transactions from multiple devices under the same merchant. |
| FR-08 | A transaction confirmed while offline shall be treated as provisional until accepted by the backend. |
| FR-09 | The distinction between provisional and settled transactions must be explicit in both the synchronization logic and the operator UI. |
| FR-10 | Transactions shall follow the lifecycle: Pending → Confirmed → Voided. |
| FR-11 | Once confirmed by the backend, a transaction cannot be modified by operators. |
| FR-12 | Corrections to backend-confirmed transactions are restricted to administrators, as an exception workflow. |
| FR-13 | Inventory shall be deducted only after a transaction is confirmed (eventual consistency; real-time stock reservation is out of scope). |
| FR-14 | Multiple operators may process transactions simultaneously for the same merchant, including while working independently on different devices without network connectivity. |
| FR-15 | Cash payments must be confirmed directly by the operator without relying on external systems, and must remain fully operable offline. |
| FR-16 | Static QRIS payments must use a pre-generated QR code that can be displayed without an internet connection, and must remain fully operable offline. |
| FR-17 | Bank Transfer payments must be verified manually by the operator using external confirmation (e.g., banking app, e-wallet notification, or SMS), not by the POS system. |
| FR-18 | The system must provide a reconciliation process for operator-confirmed payments (Static QRIS and Transfer) when payment confirmation is later found to be incorrect. |
| FR-19 | The system must handle failures related to concurrent synchronization, interrupted connectivity, and mass reconnection after prolonged outages. |
| FR-20 | The system must support growth from an early pilot to 500+ merchants without requiring manual reconciliation as part of normal operations. |
| FR-21 | The Operator (checkout) application must continue operating under an offline-first onboarding model for six months, with no self-serve fallback (ADR-006). |

---

## 8. Non-Functional Requirements (NFR)

*(The Final Project brief specifies these NFR categories, with the brief's own generic examples, as a required deliverable section — teams are expected to fill in concrete targets themselves. No case-specific numeric targets are stated in the source documents.)*

| Category | Example Given in the Brief |
|---|---|
| **Performance targets** | e.g., "transaction submission < 500 ms" |
| **Availability goals** | e.g., "99.9% uptime" |
| **Scalability considerations** | e.g., "support 10× more users" |
| **Security measures** | e.g., password hashing, RBAC |
| **Maintainability principles** | e.g., modular architecture, logging |

---

## 9. Deliverables — Case Study (Case Study §6)

Participants should design and justify:
1. An offline data persistence strategy that ensures transactions survive app restarts and device reboots.
2. A synchronization protocol that reliably reconciles offline transactions while preventing duplicates.
3. A concurrency strategy for multiple offline operators working under the same merchant.
4. A transaction lifecycle showing how offline-created transactions transition from provisional to backend-confirmed states.
5. A payment handling strategy for Cash, Static QRIS, and Transfer, including differences in their confirmation process.
6. A reconciliation process for operator-confirmed payments (Static QRIS and Transfer) when payment confirmation is later found to be incorrect.
7. Failure handling for concurrent synchronization, interrupted connectivity, and mass reconnection after prolonged outages.
8. A justification of the chosen consistency model and its trade-offs.

---

## 10. Deliverables — Final Project Brief (developed in parallel with the code)

1. **Functional Requirements Document (FRD)**
   a. User stories & use cases for each feature
   b. Role-based access definitions (Admin vs. Kasir flows)
   c. Workflow descriptions (e.g., "what happens when a sale is processed")
2. **Non-Functional Requirements (NFR)**
   a. Performance targets (e.g., "transaction submission < 500 ms")
   b. Availability goals (e.g., "99.9% uptime")
   c. Scalability considerations (e.g., "support 10× more users")
   d. Security measures (e.g., password hashing, RBAC)
   e. Maintainability principles (e.g., modular architecture, logging)
3. **Out-of-Scope**
   a. Explicitly state what you will not build in this iteration.
   e.g., "No mobile app or automated supplier restocking in this release."
4. **Low-Level System Architecture (LLA)**
   a. Diagram showing frontend, backend, database, APIs
   b. Rationale for your technology choices (e.g., Express + PostgreSQL; REST vs. GraphQL)
   c. Breakdown of modules/services and how they interact
5. **Database Design (ERD)**
   a. Entity-Relationship Diagram
   b. Table descriptions & purposes
   c. Key indexes or constraints (e.g., unique email, foreign keys)
   d. Notes on normalization (if applied)
6. **Testing Strategy & Coverage Plan**
   a. Unit tests for core functions/services
   b. Integration tests for API endpoints and data flows
   c. (Optional) Manual test cases or acceptance criteria
7. **DevOps & Deployment Plan**
   a. Environment setup (Docker, Vercel, Railway, Supabase, etc.)
   b. .env template and configuration guidelines
   c. CI/CD pipeline overview (e.g., GitHub Actions config)
8. **Final Presentation**
   a. Slide deck outlining problem, architecture, and process
   b. Live demo of your deployed prototype
   c. Reflections on challenges, teamwork, and lessons learned

---

## 11. Out-of-Scope

The Final Project brief requires an **Out-of-Scope** section as part of the deliverables (§10, item 3 above): teams must explicitly state what they will not build in this iteration. The brief gives a generic example format only: *"No mobile app or automated supplier restocking in this release"* — this is an illustrative example in the brief, not an item specified for this particular case.

The case study itself explicitly states **one** concrete exclusion for this case:
- **Real-time stock reservation is out of scope** (inventory is deducted only after transaction confirmation; see Section 5, System Constraints).

No other specific out-of-scope items are stated in the source documents for this case; the remainder of the Out-of-Scope section is left for the team to define, per the brief's instruction.

---

## 12. Scoring Criteria (Final Project brief)

| Criteria | Points |
|---|---|
| Diagrams (use case diagram, entity relationship diagram, system design diagram) | 10% |
| Architectural Justification & Trade-offs | 25% |
| Clean Code Implementation | 10% |
| Security Implementation | 10% |
| CI/CD Implementation | 5% |
| Test Coverage & Deployment | 5% |
| Application UI/UX & Functionality | 25% |
| Presentation & Prototype Demonstration | 10% |
| Usability/Usefulness | 10% |
| **Total** | **110%** |

---

## 13. Definition of Success (Case Study §7)

A successful solution enables Application K to support reliable checkout operations despite prolonged connectivity disruptions. Operators should be able to continue processing sales offline without losing or duplicating transactions, while all provisional transactions are reconciled correctly once connectivity returns. The system should provide clear visibility into transaction status, maintain accurate sales records across multiple operators and devices, and support Application K's growth from its initial pilot to 500+ merchants without requiring manual reconciliation as part of normal operations.

---

## 14. Author Notes (Final Project brief)

The brief notes that the team will not only write code, but will also operate like a real tech company — planning, documenting, and communicating every step of the process. The FRD, NFR, Out-of-Scope, LLA, ERD, Testing Strategy, and DevOps Plan are described as a "living project playbook" to be filled in progressively and used to tell the team's story in the final presentation, rather than homework completed before coding begins.

---

## 15. Deadlines

| Deliverable | Deadline |
|---|---|
| GitHub Repository | 23:59 WIB, 21 August 2025 |
| Presentation File | 06:00 WIB, 22 August 2025 |
