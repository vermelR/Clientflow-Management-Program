// Security rules tests. Run against the Firestore emulator:
//   npm test
// (which runs `firebase emulators:exec --only firestore "node --test tests/"`)
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs,
  serverTimestamp, deleteField, Timestamp,
} from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "djcf-rules-test",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const me = () => env.authenticatedContext("u1").firestore();
const other = () => env.authenticatedContext("u2").firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));

/* ---------- account data ---------- */

test("an account reads and writes its own records", async () => {
  await assertSucceeds(setDoc(doc(me(), "djclientflow/u1"), { schema: 3, settings: {} }));
  await assertSucceeds(setDoc(doc(me(), "djclientflow/u1/clients/c1"), { data: { id: "c1" }, seq: 1 }));
  await assertSucceeds(getDocs(collection(me(), "djclientflow/u1/clients")));
  await assertSucceeds(deleteDoc(doc(me(), "djclientflow/u1/clients/c1")));
});

test("nobody else can touch an account", async () => {
  await seed(db => setDoc(doc(db, "djclientflow/u1/clients/c1"), { data: { id: "c1" } }));
  await assertFails(getDoc(doc(other(), "djclientflow/u1/clients/c1")));
  await assertFails(getDocs(collection(other(), "djclientflow/u1/clients")));
  await assertFails(setDoc(doc(other(), "djclientflow/u1/clients/c2"), { data: {} }));
  await assertFails(getDoc(doc(anon(), "djclientflow/u1")));
  await assertFails(getDocs(collection(anon(), "djclientflow/u1/invoices")));
});

test("only known sub-collections exist under an account", async () => {
  await assertFails(setDoc(doc(me(), "djclientflow/u1/anything/x"), { a: 1 }));
  await assertSucceeds(setDoc(doc(me(), "djclientflow/u1/backups/b1"), { a: 1 }));
  await assertSucceeds(setDoc(doc(me(), "djclientflow/u1/files/f1"), { a: 1 }));
});

test("old-format accounts can still be written by older app copies", async () => {
  await seed(db => setDoc(doc(db, "djclientflow/u1"), { schema: 2, clients: [] }));
  await assertSucceeds(setDoc(doc(me(), "djclientflow/u1"), { schema: 2, clients: [{ id: "c1" }] }));
});

test("once moved over, the old whole-account format is closed", async () => {
  await seed(db => setDoc(doc(db, "djclientflow/u1"), { schema: 3, settings: {}, clients: [{ id: "c1" }] }));
  // An older app copy writing the whole account back:
  await assertFails(setDoc(doc(me(), "djclientflow/u1"), { schema: 2, settings: {}, clients: [] }));
  // Even keeping schema 3, the frozen lists can't be changed or added:
  await assertFails(updateDoc(doc(me(), "djclientflow/u1"), { clients: [] }));
  await assertFails(updateDoc(doc(me(), "djclientflow/u1"), { events: [] }));
  // Settings can change, and the frozen lists can be removed:
  await assertSucceeds(updateDoc(doc(me(), "djclientflow/u1"), { settings: { businessName: "RND" } }));
  await assertSucceeds(updateDoc(doc(me(), "djclientflow/u1"), { clients: deleteField() }));
});

/* ---------- contracts ---------- */

const openContract = {
  ownerUid: "u1", clientSigned: false, updatedAtMs: 1,
  contract: { title: "Agreement", sections: [] },
};
const sig = (extra = {}) => ({
  kind: "typed", name: "Client Name", email: "c@x.com", dataUrl: "",
  signedAt: new Date().toISOString(), signedAtServer: serverTimestamp(), ...extra,
});

test("a client can sign an open contract once, stamped by the server", async () => {
  await seed(db => setDoc(doc(db, "contracts/k1"), openContract));
  const ref = doc(anon(), "contracts/k1");
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { clientSigned: true, clientSignature: sig(), updatedAtMs: 2 }));
  await assertFails(updateDoc(ref, { clientSigned: true, clientSignature: sig({ name: "Someone Else" }), updatedAtMs: 3 }));
});

test("a signing time from the signer's own clock is refused", async () => {
  await seed(db => setDoc(doc(db, "contracts/k1"), openContract));
  const ref = doc(anon(), "contracts/k1");
  await assertFails(updateDoc(ref, {
    clientSigned: true, updatedAtMs: 2,
    clientSignature: sig({ signedAtServer: Timestamp.fromDate(new Date("2020-01-01")) }),
  }));
  const { signedAtServer, ...noServerTime } = sig();
  await assertFails(updateDoc(ref, { clientSigned: true, clientSignature: noServerTime, updatedAtMs: 2 }));
});

test("signing can't smuggle in other fields or change the contract", async () => {
  await seed(db => setDoc(doc(db, "contracts/k1"), openContract));
  const ref = doc(anon(), "contracts/k1");
  await assertFails(updateDoc(ref, { clientSigned: true, clientSignature: sig({ extra: "x" }), updatedAtMs: 2 }));
  await assertFails(updateDoc(ref, { clientSigned: true, clientSignature: sig({ kind: "stamp" }), updatedAtMs: 2 }));
  await assertFails(updateDoc(ref, { clientSigned: true, clientSignature: sig({ name: "" }), updatedAtMs: 2 }));
  await assertFails(updateDoc(ref, {
    clientSigned: true, clientSignature: sig(), updatedAtMs: 2, contract: { title: "Changed", sections: [] },
  }));
});

test("withdrawn or voided contracts can't be signed", async () => {
  await seed(db => setDoc(doc(db, "contracts/k1"), { ...openContract, revoked: true }));
  await seed(db => setDoc(doc(db, "contracts/k2"), { ...openContract, voided: true }));
  await assertFails(updateDoc(doc(anon(), "contracts/k1"), { clientSigned: true, clientSignature: sig(), updatedAtMs: 2 }));
  await assertFails(updateDoc(doc(anon(), "contracts/k2"), { clientSigned: true, clientSignature: sig(), updatedAtMs: 2 }));
});

test("contracts and shared quotes can't be listed or taken over", async () => {
  await seed(db => setDoc(doc(db, "contracts/k1"), openContract));
  await seed(db => setDoc(doc(db, "shared/s1"), { ownerUid: "u1", invoice: {} }));
  await assertFails(getDocs(collection(anon(), "contracts")));
  await assertFails(getDocs(collection(anon(), "shared")));
  await assertSucceeds(getDoc(doc(anon(), "shared/s1")));
  await assertFails(setDoc(doc(other(), "shared/s1"), { ownerUid: "u2" }));
  await assertFails(updateDoc(doc(other(), "contracts/k1"), { ownerUid: "u2" }));
  await assertFails(deleteDoc(doc(other(), "contracts/k1")));
  await assertSucceeds(updateDoc(doc(me(), "contracts/k1"), { revoked: true }));
});

test("everything else is closed", async () => {
  await assertFails(setDoc(doc(me(), "random/x"), { a: 1 }));
  await assertFails(getDoc(doc(anon(), "random/x")));
});
